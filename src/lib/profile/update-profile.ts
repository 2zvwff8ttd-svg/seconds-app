import { normalizeProfileUsername, validateProfileUsername } from "@/lib/auth/username";
import {
  normalizeDisplayNameForSave,
  validateDisplayName,
} from "@/lib/profile/display-name";
import { createClient } from "@/lib/supabase/client";

export class ProfileUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileUpdateError";
  }
}

export async function updateOwnProfile(input: {
  userId: string;
  currentUsername: string;
  displayNameRaw: string;
  usernameRaw: string;
}): Promise<{ displayName: string | null; username: string }> {
  const displayError = validateDisplayName(input.displayNameRaw);
  if (displayError) throw new ProfileUpdateError(displayError);

  const usernameError = validateProfileUsername(input.usernameRaw);
  if (usernameError) throw new ProfileUpdateError(usernameError);

  const username = normalizeProfileUsername(input.usernameRaw);
  if (!username) {
    throw new ProfileUpdateError("ユーザー名は2文字以上30文字以内にしてください");
  }

  const displayName = normalizeDisplayNameForSave(input.displayNameRaw);
  const supabase = createClient();

  if (username !== input.currentUsername.toLowerCase()) {
    const { data: taken, error: lookupError } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .neq("id", input.userId)
      .maybeSingle();

    if (lookupError) throw new ProfileUpdateError(lookupError.message);
    if (taken) {
      throw new ProfileUpdateError("このユーザー名はすでに使われています");
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      username,
    })
    .eq("id", input.userId);

  if (error) {
    if (
      error.code === "23505" ||
      error.message.toLowerCase().includes("duplicate") ||
      error.message.toLowerCase().includes("unique")
    ) {
      throw new ProfileUpdateError("このユーザー名はすでに使われています");
    }
    if (error.message.includes("profiles_display_name_length")) {
      throw new ProfileUpdateError("表示名は30文字以内にしてください");
    }
    if (
      error.message.includes("profiles_username_format") ||
      error.message.includes("profiles_username_length")
    ) {
      throw new ProfileUpdateError("ユーザー名の形式が正しくありません");
    }
    throw new ProfileUpdateError(error.message);
  }

  return { displayName, username };
}
