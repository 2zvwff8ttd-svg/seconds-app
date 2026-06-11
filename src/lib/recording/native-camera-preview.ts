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
  await CameraPreview.startRecordVideo(buildPreviewOptions(opts));
}

export type NativeRecordingResult = {
  videoFilePath: string;
};

export async function stopNativeRecording(): Promise<NativeRecordingResult> {
  const result = (await CameraPreview.stopRecordVideo()) as unknown as {
    videoFilePath?: string;
  };
  if (!result.videoFilePath?.trim()) {
    throw new Error("録画ファイルのパスを取得できませんでした");
  }
  return { videoFilePath: result.videoFilePath.trim() };
}
