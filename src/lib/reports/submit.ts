import { createClient } from "@/lib/supabase/client";
import { mapSocialWriteError } from "@/lib/social/write-errors";
import type { ReportReason, ReportTargetType } from "@/types/report";

export async function submitReport(input: {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("submit_report", {
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_reason: input.reason,
    p_details: input.details?.trim() || null,
  });

  if (error) {
    if (error.message.includes("Already reported")) {
      throw new Error("このコンテンツはすでに通報済みです");
    }
    if (error.message.includes("Cannot report your own")) {
      throw new Error("自分のコンテンツは通報できません");
    }
    throw new Error(mapSocialWriteError(error.message));
  }
}
