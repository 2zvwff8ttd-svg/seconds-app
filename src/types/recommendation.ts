export type WatchOutcome = "completed" | "partial";

export type WatchReport = {
  completed: boolean;
  /** 0–1: 全クリップ通算の最大視聴率 */
  progress: number;
};

export type UserRecommendationContext = {
  isNewUser: boolean;
  /** クリエイター別の嗜好スコア（高いほど好み） */
  creatorScores: Record<string, number>;
  /** 過去に視聴・いいね・コメントした動画 ID */
  engagedVideoIds: Set<string>;
};

export type SessionPreference = {
  creatorScores: Record<string, number>;
  engagedVideoIds: Set<string>;
};
