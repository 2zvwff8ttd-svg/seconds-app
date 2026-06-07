import { getPostingDayDateString } from "@/lib/posting/day-boundary";

const STORAGE_PREFIX = "seconds_opening_seconds_seen:";

export function getOpeningSecondsSeenKey(now: Date = new Date()): string {
  return `${STORAGE_PREFIX}${getPostingDayDateString(now)}`;
}

/** 投稿日（ローカル 7:00 区切り）で秒数演出を既に見たか */
export function hasSeenOpeningSecondsToday(now: Date = new Date()): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(getOpeningSecondsSeenKey(now)) === "1";
}

export function markOpeningSecondsSeenToday(now: Date = new Date()): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(getOpeningSecondsSeenKey(now), "1");
}
