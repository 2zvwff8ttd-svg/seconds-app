import {
  CameraPreview,
  type CameraPosition,
  type CameraPreviewOptions,
} from "@capacitor-community/camera-preview";

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
  const started = await CameraPreview.isCameraStarted();
  if (started.value) {
    await CameraPreview.stop();
  }
  await CameraPreview.start(buildPreviewOptions(opts));
}

export async function stopNativePreview(): Promise<void> {
  const started = await CameraPreview.isCameraStarted();
  if (started.value) {
    await CameraPreview.stop();
  }
}

export async function flipNativeCamera(): Promise<void> {
  await CameraPreview.flip();
}

export async function startNativeRecording(
  opts: StartNativePreviewOptions,
): Promise<void> {
  await withPluginTimeout(
    CameraPreview.startRecordVideo(buildPreviewOptions(opts)),
    12_000,
    "録画の開始がタイムアウトしました",
  );
}

/** プレビュー枠の移動・リサイズ後にネイティブ表示位置を同期 */
export async function syncNativePreviewLayout(
  opts: StartNativePreviewOptions,
): Promise<void> {
  const started = await CameraPreview.isCameraStarted();
  if (!started.value) {
    await startNativePreview(opts);
    return;
  }
  await CameraPreview.stop();
  await CameraPreview.start(buildPreviewOptions(opts));
}

export type NativeRecordingResult = {
  videoFilePath: string;
};

export async function stopNativeRecording(): Promise<NativeRecordingResult> {
  const result = (await CameraPreview.stopRecordVideo()) as unknown as {
    videoFilePath?: string;
    value?: string;
  };
  const path = result.videoFilePath?.trim() || result.value?.trim();
  if (!path) {
    throw new Error("録画ファイルのパスを取得できませんでした");
  }
  return { videoFilePath: path };
}
