"use client";

import { REPORT_REASONS } from "@/lib/reports/reasons";
import { submitReport } from "@/lib/reports/submit";
import type { ReportReason, ReportTargetType } from "@/types/report";
import { useState } from "react";

type ReportDialogProps = {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  onClose: () => void;
  onSubmitted?: () => void;
};

export function ReportDialog({
  targetType,
  targetId,
  targetLabel,
  onClose,
  onSubmitted,
}: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await submitReport({
        targetType,
        targetId,
        reason,
        details,
      });
      setDone(true);
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "通報に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="z-fullscreen fixed inset-0 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal
      aria-labelledby="report-dialog-title"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface-elevated p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="report-dialog-title" className="text-base font-semibold text-foreground">
          通報
        </h2>
        <p className="mt-1 text-sm text-muted">{targetLabel}</p>

        {done ? (
          <div className="mt-5">
            <p className="rounded-lg bg-violet-500/10 px-3 py-3 text-sm text-violet-200">
              通報を受け付けました。ご協力ありがとうございます。
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-xl border border-border bg-surface py-2.5 text-sm font-medium text-foreground"
            >
              閉じる
            </button>
          </div>
        ) : (
          <>
            <fieldset className="mt-4 space-y-2">
              <legend className="text-sm font-medium text-foreground">通報理由</legend>
              {REPORT_REASONS.map((item) => (
                <label
                  key={item.value}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition hover:border-violet-400/40"
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={item.value}
                    checked={reason === item.value}
                    onChange={() => setReason(item.value)}
                    className="accent-violet-500"
                  />
                  <span className="text-sm text-foreground">{item.label}</span>
                </label>
              ))}
            </fieldset>

            {reason === "other" && (
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="詳細（任意）"
                className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-violet-400/50 focus:outline-none"
              />
            )}

            {error && (
              <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 rounded-xl border border-border bg-surface py-2.5 text-sm font-medium text-foreground disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {submitting ? "送信中…" : "通報する"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
