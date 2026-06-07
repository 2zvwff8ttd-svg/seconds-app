import type { ReportReason } from "@/types/report";

export const REPORT_REASONS: Array<{
  value: ReportReason;
  label: string;
}> = [
  { value: "spam", label: "スパム" },
  { value: "violence", label: "暴力" },
  { value: "sexual", label: "性的コンテンツ" },
  { value: "hate_speech", label: "ヘイトスピーチ" },
  { value: "other", label: "その他" },
];

export function reportReasonLabel(reason: ReportReason): string {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}
