"use client";

import dynamic from "next/dynamic";
import type { CameraRecorderProps } from "@/components/record/camera-recorder-types";
import { useNativeCameraPreview } from "@/lib/recording/capacitor-platform";
import { WebCameraRecorder } from "@/components/record/WebCameraRecorder";

const NativeCameraRecorder = dynamic(
  () =>
    import("@/components/record/NativeCameraRecorder").then(
      (m) => m.NativeCameraRecorder,
    ),
  { ssr: false },
);

export type { CameraRecorderProps } from "@/components/record/camera-recorder-types";

export function CameraRecorder(props: CameraRecorderProps) {
  if (useNativeCameraPreview()) {
    return <NativeCameraRecorder {...props} />;
  }
  return <WebCameraRecorder {...props} />;
}
