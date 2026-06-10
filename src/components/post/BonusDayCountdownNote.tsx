type BonusDayCountdownNoteProps = {
  message: string;
  className?: string;
};

/** ボーナスデーまでのカウントダウン（控えめ・紫トーン） */
export function BonusDayCountdownNote({
  message,
  className = "",
}: BonusDayCountdownNoteProps) {
  return (
    <p
      className={`rounded-xl border border-violet-400/20 bg-violet-500/[0.07] px-4 py-3 text-sm leading-relaxed text-violet-200/85 ${className}`}
    >
      <span className="mr-1.5 inline-block text-violet-300/90" aria-hidden>
        ✦
      </span>
      {message}
    </p>
  );
}
