import { Capacitor } from "@capacitor/core";
import { InAppReview } from "@capacitor-community/in-app-review";
import { createClient } from "@/lib/supabase/client";

const REVIEW_REQUESTED_KEY_PREFIX = "seconds:in-app-review:requested:";

/** Prompt after this many lifetime successful posts (exact match). */
export const IN_APP_REVIEW_POST_COUNT = 3;

function reviewRequestedKey(userId: string): string {
  return `${REVIEW_REQUESTED_KEY_PREFIX}${userId}`;
}

export function hasRequestedInAppReview(userId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(reviewRequestedKey(userId)) === "1";
  } catch {
    return true;
  }
}

export function markInAppReviewRequested(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(reviewRequestedKey(userId), "1");
  } catch {
    /* ignore quota / private mode */
  }
}

/** Lifetime successful posts currently stored for the signed-in user. */
export async function countOwnSuccessfulPosts(): Promise<{
  userId: string;
  count: number;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const { count, error } = await supabase
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  return { userId: user.id, count: count ?? 0 };
}

/**
 * After a successful post: if this was the user's 3rd lifetime post and we
 * have never asked before, request Apple/Google's native in-app review once.
 * No-ops on web. Failures are swallowed so posting UX is never blocked.
 */
export async function maybeRequestInAppReviewAfterPostSuccess(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const owned = await countOwnSuccessfulPosts();
    if (!owned) return;
    if (owned.count !== IN_APP_REVIEW_POST_COUNT) return;
    if (hasRequestedInAppReview(owned.userId)) return;

    // Mark before the native call so a double success path cannot prompt twice.
    // StoreKit may still choose not to show the dialog (system quota).
    markInAppReviewRequested(owned.userId);
    await InAppReview.requestReview();
  } catch (err) {
    console.warn("[in-app-review] request skipped", err);
  }
}
