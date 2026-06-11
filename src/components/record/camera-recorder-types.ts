import type { RecordedClip } from "@/types/recording";

export type CameraRecorderProps = {
  clips: RecordedClip[];
  onClipAdded: (clip: RecordedClip) => void;
  disabled?: boolean;
};
