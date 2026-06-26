"use client";

import { hasCustomDisplayName } from "@/lib/profile/display-name";
import Link from "next/link";

type UserIdentityProps = {
  username: string;
  displayName?: string | null;
  size?: "sm" | "md" | "lg";
  layout?: "stack" | "inline";
  tone?: "default" | "light";
  className?: string;
  href?: string;
  onClick?: () => void;
};

const sizeClasses = {
  sm: { primary: "text-xs font-semibold", handle: "text-[10px]" },
  md: { primary: "text-sm font-semibold", handle: "text-xs" },
  lg: { primary: "text-lg font-bold", handle: "text-sm" },
} as const;

export function UserIdentity({
  username,
  displayName,
  size = "md",
  layout = "stack",
  tone = "default",
  className = "",
  href,
  onClick,
}: UserIdentityProps) {
  const custom = hasCustomDisplayName(displayName);
  const label = displayName?.trim();
  const styles = sizeClasses[size];
  const primaryTone =
    tone === "light" ? "text-white" : "text-foreground";
  const handleTone = tone === "light" ? "text-white/70" : "text-muted";

  const content = custom ? (
    layout === "stack" ? (
      <>
        <span className={`truncate ${primaryTone} ${styles.primary}`}>
          {label}
        </span>
        <span className={`truncate ${handleTone} ${styles.handle}`}>
          @{username}
        </span>
      </>
    ) : (
      <>
        <span className={`truncate ${primaryTone} ${styles.primary}`}>
          {label}
        </span>
        <span className={`truncate ${handleTone} ${styles.handle}`}>
          {" "}
          @{username}
        </span>
      </>
    )
  ) : (
    <span className={`truncate ${primaryTone} ${styles.primary}`}>
      @{username}
    </span>
  );

  const wrapperClass =
    layout === "stack"
      ? `flex min-w-0 flex-col ${className}`
      : `flex min-w-0 flex-wrap items-baseline gap-x-1 ${className}`;

  if (href) {
    return (
      <Link
        href={href}
        onClick={onClick}
        className={`${wrapperClass} transition hover:opacity-90`}
      >
        {content}
      </Link>
    );
  }

  return <span className={wrapperClass}>{content}</span>;
}
