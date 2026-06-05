"use client";

import { useState } from "react";

type MessageComposerProps = {
  onSend: (body: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
};

export function MessageComposer({
  onSend,
  disabled,
  placeholder = "メッセージを入力…",
}: MessageComposerProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed || sending || disabled) return;

    setSending(true);
    try {
      await onSend(trimmed);
      setBody("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex shrink-0 items-end gap-2 border-t border-border bg-surface/95 px-3 py-3 backdrop-blur-lg sm:px-4">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        rows={1}
        disabled={disabled || sending}
        placeholder={placeholder}
        className="max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-violet-400/50 focus:outline-none disabled:opacity-50"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={disabled || sending || !body.trim()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="送信"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <path d="M3.4 20.4l17.45-7.6c.81-.35.81-1.49 0-1.84L3.4 3.6c-.66-.29-1.39.2-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.89c-.5.06-.87.5-.87 1l.01 4.6c0 .71.73 1.2 1.39.91z" />
        </svg>
      </button>
    </div>
  );
}
