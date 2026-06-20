import { getPostingDayDateString } from "@/lib/posting/day-boundary";
import {
  DEFAULT_VIDEO_DISPLAY_MASK,
  parseVideoDisplayMaskShape,
  type VideoDisplayMaskShape,
} from "@/lib/video/display-mask";
import type { RecordedClip } from "@/types/recording";

const DB_NAME = "seconds-vlog-drafts";
const STORE_NAME = "sessions";
const DRAFT_VERSION = 1;
const TTL_MS = 48 * 60 * 60 * 1000;

export type StoredDraftClip = {
  id: string;
  durationSeconds: number;
  mimeType: string;
  fileName: string;
  blob: Blob;
  savedAt: number;
};

export type VlogDraftSession = {
  version: typeof DRAFT_VERSION;
  userId: string;
  postingDay: string;
  displayMaskShape: VideoDisplayMaskShape;
  clips: StoredDraftClip[];
  title?: string;
  updatedAt: number;
};

export class VlogDraftStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VlogDraftStorageError";
  }
}

export function vlogDraftSessionKey(
  userId: string,
  postingDay: string,
): string {
  return `${userId}:${postingDay}`;
}

export function getCurrentPostingDay(): string {
  return getPostingDayDateString();
}

function isQuotaExceeded(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: string }).name ?? "";
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

async function openDraftDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    throw new VlogDraftStorageError(
      "このブラウザでは撮りかけの保存に対応していません",
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(
        request.error ??
          new VlogDraftStorageError("撮りかけの保存データを開けませんでした"),
      );
    };
  });
}

async function estimateClipBytes(clips: RecordedClip[]): Promise<number> {
  return clips.reduce((sum, clip) => sum + clip.file.size, 0);
}

async function assertStorageHeadroom(requiredBytes: number): Promise<void> {
  if (!navigator.storage?.estimate) return;

  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  if (quota <= 0) return;

  const projected = usage + requiredBytes;
  if (projected > quota * 0.92) {
    const freeMb = Math.max(0, (quota - usage) / (1024 * 1024));
    throw new VlogDraftStorageError(
      `端末の保存容量が不足しています（空き約 ${freeMb.toFixed(0)} MB）。クリップを減らすか、先に投稿してください。`,
    );
  }
}

export function storedDraftClipFromRecorded(clip: RecordedClip): StoredDraftClip {
  return {
    id: clip.id,
    durationSeconds: clip.durationSeconds,
    mimeType: clip.file.type || "video/mp4",
    fileName: clip.file.name || `clip-${clip.id}.mp4`,
    blob: clip.file,
    savedAt: Date.now(),
  };
}

export function recordedClipFromStoredDraft(clip: StoredDraftClip): RecordedClip {
  const file = new File([clip.blob], clip.fileName, {
    type: clip.mimeType || "video/mp4",
  });
  return {
    id: clip.id,
    file,
    previewUrl: URL.createObjectURL(file),
    durationSeconds: clip.durationSeconds,
  };
}

export async function purgeExpiredVlogDrafts(): Promise<void> {
  const db = await openDraftDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const sessions = (await requestToPromise(store.getAll())) as VlogDraftSession[];
  const now = Date.now();

  for (const session of sessions) {
    if (!session?.userId || !session.postingDay) continue;
    if (now - (session.updatedAt ?? 0) > TTL_MS) {
      store.delete(vlogDraftSessionKey(session.userId, session.postingDay));
    }
  }

  await transactionDone(tx);
  db.close();
}

export async function loadVlogDraft(
  userId: string,
  postingDay: string = getCurrentPostingDay(),
): Promise<VlogDraftSession | null> {
  const db = await openDraftDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const session = (await requestToPromise(
    store.get(vlogDraftSessionKey(userId, postingDay)),
  )) as VlogDraftSession | undefined;
  await transactionDone(tx);
  db.close();

  if (!session || session.version !== DRAFT_VERSION) return null;
  if (session.userId !== userId || session.postingDay !== postingDay) return null;
  if (Date.now() - (session.updatedAt ?? 0) > TTL_MS) {
    await clearVlogDraft(userId, postingDay);
    return null;
  }
  if (!Array.isArray(session.clips) || session.clips.length === 0) return null;

  return {
    ...session,
    displayMaskShape: parseVideoDisplayMaskShape(session.displayMaskShape),
    clips: session.clips.filter(
      (clip) => clip?.blob instanceof Blob && clip.blob.size > 0,
    ),
  };
}

export async function saveVlogDraft(input: {
  userId: string;
  postingDay?: string;
  displayMaskShape: VideoDisplayMaskShape;
  clips: RecordedClip[];
  title?: string;
}): Promise<void> {
  const postingDay = input.postingDay ?? getCurrentPostingDay();
  const clips = input.clips;

  if (clips.length === 0) {
    await clearVlogDraft(input.userId, postingDay);
    return;
  }

  await assertStorageHeadroom(await estimateClipBytes(clips));

  const session: VlogDraftSession = {
    version: DRAFT_VERSION,
    userId: input.userId,
    postingDay,
    displayMaskShape: input.displayMaskShape,
    clips: clips.map(storedDraftClipFromRecorded),
    title: input.title?.trim() || undefined,
    updatedAt: Date.now(),
  };

  try {
    const db = await openDraftDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(
      session,
      vlogDraftSessionKey(input.userId, postingDay),
    );
    await transactionDone(tx);
    db.close();
  } catch (err) {
    if (isQuotaExceeded(err)) {
      throw new VlogDraftStorageError(
        "端末の保存容量が不足しています。クリップを減らすか、先に投稿してください。",
      );
    }
    throw err;
  }
}

export async function clearVlogDraft(
  userId: string,
  postingDay: string = getCurrentPostingDay(),
): Promise<void> {
  const db = await openDraftDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(vlogDraftSessionKey(userId, postingDay));
  await transactionDone(tx);
  db.close();
}

export async function clearAllVlogDraftsForUser(userId: string): Promise<void> {
  const db = await openDraftDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const keys = (await requestToPromise(store.getAllKeys())) as string[];

  for (const key of keys) {
    if (typeof key === "string" && key.startsWith(`${userId}:`)) {
      store.delete(key);
    }
  }

  await transactionDone(tx);
  db.close();
}

export function revokeRecordedClips(clips: RecordedClip[]): void {
  for (const clip of clips) {
    URL.revokeObjectURL(clip.previewUrl);
  }
}

export function emptyDraftShape(): VideoDisplayMaskShape {
  return DEFAULT_VIDEO_DISPLAY_MASK;
}
