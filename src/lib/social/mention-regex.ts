/** Matches server trigger: regexp_matches(content, '@([a-zA-Z0-9_]{2,30})', 'g') */
export const MENTION_USERNAME_BODY = "@[a-zA-Z0-9_]{2,30}";

export const MENTION_USERNAME_PATTERN = new RegExp(MENTION_USERNAME_BODY, "g");

export const MENTION_USERNAME_CAPTURE = /@([a-zA-Z0-9_]{2,30})/g;

/** Extract unique @username handles from comment text (case preserved, deduped by lowercase). */
export function extractMentionUsernames(content: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const match of content.matchAll(MENTION_USERNAME_CAPTURE)) {
    const username = match[1];
    const key = username.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(username);
  }

  return result;
}
