type UserAvatarProps = {
  username: string;
  avatarUrl: string | null;
  size?: "sm" | "md";
};

export function UserAvatar({ username, avatarUrl, size = "md" }: UserAvatarProps) {
  const dim = size === "sm" ? "h-10 w-10" : "h-12 w-12";
  const text = size === "sm" ? "text-sm" : "text-base";

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={`${dim} shrink-0 rounded-full border border-border object-cover`}
      />
    );
  }

  return (
    <span
      className={`${dim} flex shrink-0 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/15 ${text} font-semibold text-violet-200`}
      aria-hidden
    >
      {username.slice(0, 1).toUpperCase()}
    </span>
  );
}
