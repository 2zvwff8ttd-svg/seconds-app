import {
  CameraPreview,
  type CameraPosition,
  type CameraPreviewOptions,
} from "@capacitor-community/camera-preview";
import { enqueueNativePreviewOp } from "@/lib/recording/native-preview-lock";

export const NATIVE_CAMERA_PREVIEW_ID = "native-camera-preview";

export type NativePreviewRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StartNativePreviewOptions = NativePreviewRect & {
  position: CameraPosition;
};

let lastAppliedRectKey: string | null = null;

function rectKey(rect: NativePreviewRect, position: CameraPosition): string {
  return `${rect.x},${rect.y},${rect.width},${rect.height},${position}`;
}

function withPluginTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

function buildPreviewOptions(
  opts: StartNativePreviewOptions,
): CameraPreviewOptions {
  return {
    parent: NATIVE_CAMERA_PREVIEW_ID,
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    position: opts.position,
    toBack: true,
    disableAudio: false,
    rotateWhenOrientationChanged: false,
    /** Native pinch on preview (iOS/Android); no JS rebuild — runtime option only. */
    enableZoom: true,
  };
}

function isAlreadyStartedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /already started/i.test(msg);
}

function isAlreadyStoppedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /already stopped/i.test(msg);
}

export async function getNativeCameraStarted(): Promise<boolean> {
  try {
    const started = await CameraPreview.isCameraStarted();
    return Boolean(started.value);
  } catch {
    return false;
  }
}

async function stopIfRunning(): Promise<void> {
  try {
    const started = await CameraPreview.isCameraStarted();
    if (started.value) {
      await CameraPreview.stop();
    }
  } catch (err) {
    if (!isAlreadyStoppedError(err)) {
      throw err;
    }
  }
}

export async function startNativePreview(
  opts: StartNativePreviewOptions,
): Promise<void> {
  return enqueueNativePreviewOp("startNativePreview", async () => {
    if (opts.width < 2 || opts.height < 2) {
      throw new Error(
        `プレビューサイズが不正です (${opts.width}x${opts.height})`,
      );
    }

    await stopIfRunning();

    try {
      await withPluginTimeout(
        CameraPreview.start(buildPreviewOptions(opts)),
        15_000,
        "カメラの起動がタイムアウトしました（15秒）",
      );
    } catch (err) {
      // Stale session race: stop hard and retry once.
      if (isAlreadyStartedError(err)) {
        await stopIfRunning();
        await withPluginTimeout(
          CameraPreview.start(buildPreviewOptions(opts)),
          15_000,
          "カメラの起動がタイムアウトしました（再試行後）",
        );
      } else {
        throw err;
      }
    }

    // start() can resolve without a live session on some iOS edge cases.
    const running = await getNativeCameraStarted();
    if (!running) {
      throw new Error(
        "カメラセッションが開始されませんでした（isCameraStarted=false）",
      );
    }

    lastAppliedRectKey = rectKey(opts, opts.position);
  });
}

export async function stopNativePreview(): Promise<void> {
  return enqueueNativePreviewOp("stopNativePreview", async () => {
    await stopIfRunning();
    lastAppliedRectKey = null;
  });
}

export async function flipNativeCamera(): Promise<void> {
  return enqueueNativePreviewOp("flipNativeCamera", async () => {
    await CameraPreview.flip();
  });
}

export async function startNativeRecording(
  opts: StartNativePreviewOptions,
): Promise<void> {
  return enqueueNativePreviewOp("startNativeRecording", async () => {
    await withPluginTimeout(
      CameraPreview.startRecordVideo(buildPreviewOptions(opts)),
      12_000,
      "録画の開始がタイムアウトしました",
    );
  });
}

/** プレビュー枠が変わったときだけ stop→start（同一 rect ならスキップ） */
export async function syncNativePreviewLayout(
  opts: StartNativePreviewOptions,
): Promise<void> {
  const key = rectKey(opts, opts.position);
  if (lastAppliedRectKey === key) {
    return;
  }

  return enqueueNativePreviewOp("syncNativePreviewLayout", async () => {
    const started = await CameraPreview.isCameraStarted();
    if (!started.value) {
      await CameraPreview.start(buildPreviewOptions(opts));
      lastAppliedRectKey = key;
      return;
    }
    await stopIfRunning();
    await CameraPreview.start(buildPreviewOptions(opts));
    lastAppliedRectKey = key;
  });
}

export type NativeRecordingResult = {
  videoFilePath: string;
  videoFileName?: string;
  videoBase64?: string;
  videoFileSize?: number;
};

export async function stopNativeRecording(): Promise<NativeRecordingResult> {
  return enqueueNativePreviewOp("stopNativeRecording", async () => {
    const result = (await CameraPreview.stopRecordVideo()) as unknown as {
      videoFilePath?: string;
      videoFileName?: string;
      videoBase64?: string;
      videoFileSize?: number;
      value?: string;
    };
    const path = result.videoFilePath?.trim() || result.value?.trim();
    if (!path) {
      throw new Error("録画ファイルのパスを取得できませんでした");
    }
    return {
      videoFilePath: path,
      videoFileName: result.videoFileName?.trim() || undefined,
      videoBase64: result.videoBase64?.trim() || undefined,
      videoFileSize:
        typeof result.videoFileSize === "number"
          ? result.videoFileSize
          : undefined,
    };
  });
}
