import type { RecordedClip } from "@/types/recording";

export type CameraRecorderProps = {
  clips: RecordedClip[];
  onClipAdded: (clip: RecordedClip) => void;
  onClipRemoved: (id: string) => void;
  disabled?: boolean;
};
