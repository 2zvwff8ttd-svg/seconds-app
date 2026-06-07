export type ReportReason =
  | "spam"
  | "violence"
  | "sexual"
  | "hate_speech"
  | "other";

export type ReportTargetType = "video" | "comment" | "profile";

export type AdminModerationAction = "dismiss" | "ban";

export type AdminReportGroup = {
  targetType: ReportTargetType;
  targetId: string;
  reportCount: number;
  reasons: ReportReason[];
  lastReportedAt: string;
  isHidden: boolean;
  preview: {
    title: string;
    subtitle?: string;
    imageUrl?: string | null;
    link?: string;
    ownerId?: string;
    ownerUsername?: string;
  };
};
