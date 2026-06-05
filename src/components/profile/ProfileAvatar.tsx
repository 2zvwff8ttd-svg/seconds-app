type ProfileAvatarSize = "xs" | "sm" | "md" | "lg";

const SIZE_CLASS: Record<ProfileAvatarSize, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-10 w-10 text-sm",
  md: "h-12 w-12 text-base",
  lg: "h-16 w-16 text-xl",
};

type ProfileAvatarProps = {
  username: string;
  avatarUrl?: string | null;
  size?: ProfileAvatarSize;
  className?: string;
};

export function ProfileAvatar({
  username,
  avatarUrl,
  size = "md",
  className = "",
}: ProfileAvatarProps) {
  const dim = SIZE_CLASS[size];

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={`${dim} shrink-0 rounded-full border border-border object-cover ${className}`}
      />
    );
  }

  return (
    <span
      className={`${dim} flex shrink-0 items-center justify-center rounded-full border border-violet-400/30 bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 font-semibold text-violet-200 ${className}`}
      aria-hidden
    >
      {username.slice(0, 1).toUpperCase()}
    </span>
  );
}
