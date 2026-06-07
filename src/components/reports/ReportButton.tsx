"use client";

import { ReportDialog } from "@/components/reports/ReportDialog";
import type { ReportTargetType } from "@/types/report";
import { useState } from "react";

type ReportButtonProps = {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  className?: string;
  compact?: boolean;
};

export function ReportButton({
  targetType,
  targetId,
  targetLabel,
  className = "",
  compact = false,
}: ReportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          (compact
            ? "rounded-lg px-2 py-1 text-[10px] text-muted transition hover:bg-surface hover:text-red-400"
            : "rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-muted transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-400")
        }
        aria-label={`${targetLabel}を通報`}
      >
        通報
      </button>

      {open && (
        <ReportDialog
          targetType={targetType}
          targetId={targetId}
          targetLabel={targetLabel}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
