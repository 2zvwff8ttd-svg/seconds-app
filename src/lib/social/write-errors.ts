/** Map Postgres / PostgREST errors for social write RPCs. */
export function mapSocialWriteError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("rate_limit_exceeded") ||
    lower.includes("rate limit")
  ) {
    return "送信が多すぎます。しばらくしてから再試行してください。";
  }
  if (
    lower.includes("comment too long") ||
    lower.includes("comments_content_max_len")
  ) {
    return "コメントは500文字以内にしてください";
  }
  if (
    lower.includes("message too long") ||
    lower.includes("dm_messages_body_max_len")
  ) {
    return "メッセージは2000文字以内にしてください";
  }
  if (lower.includes("comment is empty") || lower.includes("message is empty")) {
    return "内容を入力してください";
  }
  if (lower.includes("cannot follow this user")) {
    return "このユーザーはフォローできません";
  }
  if (lower.includes("cannot message this user")) {
    return "このユーザーにはメッセージを送れません";
  }
  if (lower.includes("banned")) {
    return "このアカウントでは操作できません";
  }
  return message;
}
