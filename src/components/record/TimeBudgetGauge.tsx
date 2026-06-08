"use client";

type TimeBudgetGaugeProps = {
  assignedSeconds: number | null;
  usedSeconds: number;
  /** 録画中の経過秒（未録画時は 0） */
  recordingElapsed?: number;
};

const LOW_SECONDS = 5;
const LOW_RATIO = 0.2;

export function TimeBudgetGauge({
  assignedSeconds,
  usedSeconds,
  recordingElapsed = 0,
}: TimeBudgetGaugeProps) {
  if (assignedSeconds === null) {
    return (
      <div className="absolute inset-x-0 top-0 z-20" aria-hidden>
        <div className="h-[3px] w-full bg-white/10" />
      </div>
    );
  }

  const remaining = Math.max(
    0,
    assignedSeconds - usedSeconds - recordingElapsed,
  );
  const ratio = assignedSeconds > 0 ? remaining / assignedSeconds : 0;
  const isLow = remaining <= LOW_SECONDS || ratio <= LOW_RATIO;

  return (
    <div
      className="absolute inset-x-0 top-0 z-20"
      role="progressbar"
      aria-valuenow={Math.ceil(remaining)}
      aria-valuemin={0}
      aria-valuemax={assignedSeconds}
      aria-label="残り撮影時間"
    >
      <div className="h-[3px] w-full bg-white/10">
        <div
          className={`h-full transition-[width] duration-150 ease-linear ${
            isLow
              ? "bg-gradient-to-r from-red-600 to-red-400"
              : "bg-gradient-to-r from-violet-500 to-fuchsia-400"
          }`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
