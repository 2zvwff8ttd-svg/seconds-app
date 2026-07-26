import { Capacitor } from "@capacitor/core";
import { CameraPreview } from "@capacitor-community/camera-preview";
import { createClient } from "@/lib/supabase/client";

export type ClientDebugTrigger = "mismatch" | "debug_flag" | "manual";
export type ClientDebugSource = "clip-av" | "clip-av-native" | "post-guard";

export type ClientDebugLogConfig = {
  enabled: boolean;
  retentionDays: number;
};

type PendingClipAv = {
  event: string;
  clipIndex: number | null;
  payload: Record<string, unknown>;
};

type InsertRow = {
  session_id: string;
  source: ClientDebugSource;
  event: string;
  clip_index: number | null;
  payload: Record<string, unknown>;
  app_version: string | null;
  platform: string;
  trigger: ClientDebugTrigger;
};

const MAX_ROWS_PER_UPLOAD = 80;
const MAX_SESSION_CLIP_BUFFER = 40;

let sessionId: string | null = null;
let clipAvBuffer: PendingClipAv[] = [];
let configCache: ClientDebugLogConfig | null = null;
let configPromise: Promise<ClientDebugLogConfig> | null = null;

type CameraPreviewDebugFlush = {
  flushClientDebugLogs(): Promise<{ lines?: string[] }>;
};

function debugPlugin(): CameraPreviewDebugFlush {
  return CameraPreview as unknown as CameraPreviewDebugFlush;
}

export function getOrCreateDebugSessionId(): string {
  if (!sessionId) {
    sessionId = crypto.randomUUID();
  }
  return sessionId;
}

/** Call when starting a fresh record flow if you want a clean session boundary. */
export function resetClientDebugSession(): void {
  sessionId = crypto.randomUUID();
  clipAvBuffer = [];
}

function platformLabel(): string {
  if (!Capacitor.isNativePlatform()) return "web";
  return Capacitor.getPlatform() || "native";
}

function appVersionLabel(): string | null {
  try {
    const v = process.env.NEXT_PUBLIC_APP_VERSION;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export async function fetchClientDebugLogsConfig(): Promise<ClientDebugLogConfig> {
  if (configCache) return configCache;
  if (!configPromise) {
    configPromise = (async () => {
      try {
        const { data, error } = await createClient().rpc(
          "get_client_debug_logs_config",
        );
        if (error) throw new Error(error.message);
        const raw = (data ?? {}) as Record<string, unknown>;
        configCache = {
          enabled: Boolean(raw.enabled),
          retentionDays: Number(raw.retention_days ?? 14),
        };
        return configCache;
      } catch {
        configCache = { enabled: false, retentionDays: 14 };
        return configCache;
      }
    })();
  }
  return configPromise;
}

/** Force re-read app_config on next call (e.g. after enabling in SQL Editor). */
export function invalidateClientDebugLogsConfigCache(): void {
  configCache = null;
  configPromise = null;
}

export function bufferClipAvDebugLog(input: {
  event?: string;
  clipIndex?: number | null;
  payload: Record<string, unknown>;
}): void {
  getOrCreateDebugSessionId();
  clipAvBuffer.push({
    event: input.event ?? "clip_probe",
    clipIndex: input.clipIndex ?? null,
    payload: sanitizePayload(input.payload),
  });
  if (clipAvBuffer.length > MAX_SESSION_CLIP_BUFFER) {
    clipAvBuffer = clipAvBuffer.slice(-MAX_SESSION_CLIP_BUFFER);
  }
}

function sanitizePayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value == null) {
      out[key] = value;
      continue;
    }
    const t = typeof value;
    if (t === "string" || t === "number" || t === "boolean") {
      // Never ship large base64 / binary-looking blobs.
      if (t === "string" && (value as string).length > 4000) {
        out[key] = `[omitted:${(value as string).length}chars]`;
      } else {
        out[key] = value;
      }
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.slice(0, 50).map((item) =>
        typeof item === "object" && item != null
          ? sanitizePayload(item as Record<string, unknown>)
          : item,
      );
      continue;
    }
    if (t === "object") {
      out[key] = sanitizePayload(value as Record<string, unknown>);
    }
  }
  return out;
}

async function flushNativeDebugLines(): Promise<string[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const result = await debugPlugin().flushClientDebugLogs();
    const lines = result?.lines;
    if (!Array.isArray(lines)) return [];
    return lines
      .filter((l): l is string => typeof l === "string" && l.trim().length > 0)
      .slice(-MAX_ROWS_PER_UPLOAD);
  } catch (err) {
    console.warn("[client-debug-logs] native flush failed", err);
    return [];
  }
}

function parseNativeLine(line: string): {
  event: string;
  payload: Record<string, unknown>;
} {
  const trimmed = line.trim();
  let event = "native_log";
  if (trimmed.includes("sessionInterrupted")) event = "session_interrupted";
  else if (trimmed.includes("sessionRuntimeError")) event = "session_runtime_error";
  else if (trimmed.includes("systemPressureChanged")) event = "system_pressure";
  else if (trimmed.includes("thermalStateChanged")) event = "thermal";
  else if (trimmed.includes("afterSwitchCameras")) event = "switch_cameras";
  else if (trimmed.includes("startRecording")) event = "start_recording";
  else if (trimmed.includes("stopRecording") || trimmed.includes("movieFileOutputDidFinish"))
    event = "stop_recording";
  else if (trimmed.includes("health ")) event = "health";
  else if (trimmed.includes("constituent")) event = "constituent_lock";
  return { event, payload: { line: trimmed } };
}

/**
 * Upload buffered clip-av + flushed native lines. Fire-and-forget safe.
 * Never throws to callers.
 */
export async function uploadClientDebugLogs(options: {
  trigger: ClientDebugTrigger;
  extraRows?: Array<{
    source: ClientDebugSource;
    event: string;
    clipIndex?: number | null;
    payload: Record<string, unknown>;
  }>;
  clearClipBufferAfter?: boolean;
}): Promise<number> {
  try {
    const sid = getOrCreateDebugSessionId();
    const nativeLines = await flushNativeDebugLines();
    const rows: InsertRow[] = [];

    for (const item of clipAvBuffer) {
      rows.push({
        session_id: sid,
        source: "clip-av",
        event: item.event,
        clip_index: item.clipIndex,
        payload: item.payload,
        app_version: appVersionLabel(),
        platform: platformLabel(),
        trigger: options.trigger,
      });
    }

    for (const line of nativeLines) {
      const parsed = parseNativeLine(line);
      rows.push({
        session_id: sid,
        source: "clip-av-native",
        event: parsed.event,
        clip_index: null,
        payload: parsed.payload,
        app_version: appVersionLabel(),
        platform: platformLabel(),
        trigger: options.trigger,
      });
    }

    for (const extra of options.extraRows ?? []) {
      rows.push({
        session_id: sid,
        source: extra.source,
        event: extra.event,
        clip_index: extra.clipIndex ?? null,
        payload: sanitizePayload(extra.payload),
        app_version: appVersionLabel(),
        platform: platformLabel(),
        trigger: options.trigger,
      });
    }

    const batch = rows.slice(-MAX_ROWS_PER_UPLOAD);
    if (batch.length === 0) return 0;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.warn("[client-debug-logs] skip upload: not signed in");
      return 0;
    }

    const { error } = await supabase.from("client_debug_logs").insert(
      batch.map((row) => ({
        ...row,
        user_id: user.id,
      })),
    );

    if (error) {
      console.warn("[client-debug-logs] insert failed", error.message);
      return 0;
    }

    if (options.clearClipBufferAfter !== false) {
      clipAvBuffer = [];
    }

    console.info("[client-debug-logs] uploaded", {
      count: batch.length,
      trigger: options.trigger,
      sessionId: sid,
    });
    return batch.length;
  } catch (err) {
    console.warn("[client-debug-logs] upload failed", err);
    return 0;
  }
}

/** After a clip probe: buffer always; upload when mismatch or debug flag. */
export function scheduleClientDebugUploadForClipProbe(input: {
  mismatch: boolean;
  clipIndex?: number | null;
  payload: Record<string, unknown>;
}): void {
  bufferClipAvDebugLog({
    event: "clip_probe",
    clipIndex: input.clipIndex,
    payload: input.payload,
  });

  void (async () => {
    try {
      const cfg = await fetchClientDebugLogsConfig();
      if (input.mismatch) {
        await uploadClientDebugLogs({ trigger: "mismatch" });
        return;
      }
      if (cfg.enabled) {
        await uploadClientDebugLogs({ trigger: "debug_flag" });
      }
    } catch (err) {
      console.warn("[client-debug-logs] clip probe upload skipped", err);
    }
  })();
}

/** On post-guard A/V failure: upload session evidence + violation summary. */
export function scheduleClientDebugUploadForAvGuard(input: {
  phase: "clip" | "merged";
  violations: Array<Record<string, unknown>>;
  message: string;
}): void {
  void (async () => {
    try {
      await uploadClientDebugLogs({
        trigger: "mismatch",
        extraRows: [
          {
            source: "post-guard",
            event: input.phase === "merged" ? "merged_av_mismatch" : "clip_av_mismatch",
            payload: {
              phase: input.phase,
              message: input.message,
              violations: input.violations,
            },
          },
        ],
      });
    } catch (err) {
      console.warn("[client-debug-logs] guard upload skipped", err);
    }
  })();
}
