import { getSupabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

const AVATARS_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function getAvatarPublicUrl(path: string): string {
  return `${getSupabaseUrl()}/storage/v1/object/public/${AVATARS_BUCKET}/${path}`;
}

function avatarExtension(file: File): string {
  const fromMime = EXT_BY_MIME[file.type];
  if (fromMime) return fromMime;
  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "png";
  if (name.endsWith(".webp")) return "webp";
  if (name.endsWith(".gif")) return "gif";
  return "jpg";
}

export async function uploadProfileAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("画像ファイルを選択してください");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("画像は5MB以下にしてください");
  }

  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("ログインが必要です");
  }

  const ext = avatarExtension(file);
  const path = `${user.id}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const publicUrl = getAvatarPublicUrl(path);
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);

  if (profileError) {
    throw new Error(profileError.message);
  }

  return `${publicUrl}?t=${Date.now()}`;
}
