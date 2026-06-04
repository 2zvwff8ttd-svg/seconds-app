/** ポジティブシグナルの重み */
export const SIGNAL_WEIGHT = {
  completed: 4,
  partial: 0.5,
  like: 5,
  comment: 6,
} as const;

/** 表示候補へのペナルティ */
export const PENALTY = {
  sessionWatched: 30,
  historyEngaged: 12,
} as const;
