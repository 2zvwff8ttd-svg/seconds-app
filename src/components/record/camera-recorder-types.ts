import type { RecordedClip } from "@/types/recording";
import type { VideoDisplayMaskShape } from "@/lib/video/display-mask";

export type CameraRecorderProps = {
  clips: RecordedClip[];
  onClipAdded: (clip: RecordedClip) => void;
  disabled?: boolean;
  displayMaskShape: VideoDisplayMaskShape;
  onDisplayMaskShapeChange: (shape: VideoDisplayMaskShape) => void;
};
