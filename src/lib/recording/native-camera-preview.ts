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
  };
}

export async function startNativePreview(
  opts: StartNativePreviewOptions,
): Promise<void> {
  return enqueueNativePreviewOp("startNativePreview", async () => {
    const started = await CameraPreview.isCameraStarted();
    if (started.value) {
      await CameraPreview.stop();
    }
    await CameraPreview.start(buildPreviewOptions(opts));
    lastAppliedRectKey = rectKey(opts, opts.position);
  });
}

export async function stopNativePreview(): Promise<void> {
  return enqueueNativePreviewOp("stopNativePreview", async () => {
    const started = await CameraPreview.isCameraStarted();
    if (started.value) {
      await CameraPreview.stop();
    }
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
    await CameraPreview.stop();
    await CameraPreview.start(buildPreviewOptions(opts));
    lastAppliedRectKey = key;
  });
}

export type NativeRecordingResult = {
  videoFilePath: string;
};

export async function stopNativeRecording(): Promise<NativeRecordingResult> {
  return enqueueNativePreviewOp("stopNativeRecording", async () => {
    const result = (await CameraPreview.stopRecordVideo()) as unknown as {
      videoFilePath?: string;
      value?: string;
    };
    const path = result.videoFilePath?.trim() || result.value?.trim();
    if (!path) {
      throw new Error("録画ファイルのパスを取得できませんでした");
    }
    return { videoFilePath: path };
  });
}
