"use client";

import { BlockConfirmDialog } from "@/components/blocks/BlockConfirmDialog";
import { useState } from "react";

type BlockUserButtonProps = {
  userId: string;
  username: string;
  className?: string;
  compact?: boolean;
  onBlocked?: () => void;
};

export function BlockUserButton({
  userId,
  username,
  className = "",
  compact = false,
  onBlocked,
}: BlockUserButtonProps) {
  const [open, setOpen] = useState(false);

  const defaultClassName = compact
    ? "rounded-lg px-2 py-1 text-[10px] text-muted transition hover:bg-surface hover:text-red-400"
    : "rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-muted transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-400";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className || defaultClassName}
        aria-label={`@${username}をブロック`}
      >
        ブロック
      </button>

      {open && (
        <BlockConfirmDialog
          userId={userId}
          username={username}
          onClose={() => setOpen(false)}
          onBlocked={() => onBlocked?.()}
        />
      )}
    </>
  );
}
