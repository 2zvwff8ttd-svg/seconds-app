import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

const METADATA_KEY = "onboarding_completed";

export function isOnboardingComplete(user: User | null | undefined): boolean {
  if (!user) return true;
  return user.user_metadata?.[METADATA_KEY] === true;
}

export async function markOnboardingComplete(): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({
    data: { [METADATA_KEY]: true },
  });
  if (error) throw new Error(error.message);
  await supabase.auth.refreshSession();
}
