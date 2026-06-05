/** デバイスの IANA タイムゾーン（例: Asia/Tokyo） */
export function getDeviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function getZonedParts(date: Date, timeZone: string): ZonedDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/** 指定タイムゾーンのローカル日時を UTC の Date に変換 */
export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let i = 0; i < 4; i++) {
    const probe = new Date(utcMs);
    const actual = getZonedParts(probe, timeZone);
    const targetMs = Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second,
    );
    const actualMs = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const diff = targetMs - actualMs;
    if (diff === 0) break;
    utcMs += diff;
  }

  return new Date(utcMs);
}

export function addCalendarDays(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

export type PostingPeriodBounds = {
  /** 含む（7:00） */
  start: Date;
  /** 含まない（翌日 7:00） */
  end: Date;
  timeZone: string;
};

/**
 * 投稿可能な「1日」の区間（ローカル 7:00 区切り）。
 * 例: 5/29 10:00 → [5/29 07:00, 5/30 07:00)
 */
export function getPostingPeriodBounds(
  now: Date = new Date(),
  timeZone: string = getDeviceTimeZone(),
): PostingPeriodBounds {
  const { year, month, day, hour } = getZonedParts(now, timeZone);

  let startY = year;
  let startM = month;
  let startD = day;

  if (hour < 7) {
    const prev = addCalendarDays(year, month, day, -1);
    startY = prev.year;
    startM = prev.month;
    startD = prev.day;
  }

  const start = zonedLocalToUtc(startY, startM, startD, 7, 0, 0, timeZone);
  const nextDay = addCalendarDays(startY, startM, startD, 1);
  const end = zonedLocalToUtc(
    nextDay.year,
    nextDay.month,
    nextDay.day,
    7,
    0,
    0,
    timeZone,
  );

  return { start, end, timeZone };
}

export function formatLocalDateTime(
  date: Date,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return date.toLocaleString("ja-JP", {
    timeZone,
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  });
}
