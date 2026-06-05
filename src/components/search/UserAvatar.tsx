import { ProfileAvatar } from "@/components/profile/ProfileAvatar";

type UserAvatarProps = {
  username: string;
  avatarUrl: string | null;
  size?: "sm" | "md";
};

export function UserAvatar({ username, avatarUrl, size = "md" }: UserAvatarProps) {
  return (
    <ProfileAvatar
      username={username}
      avatarUrl={avatarUrl}
      size={size}
    />
  );
}
