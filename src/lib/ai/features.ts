/** Replicate/MusicGen による BGM 生成（OFF） */
export const AI_BGM_GENERATION_ENABLED = false;

/** プリセット BGM（動画と別 URL・再生時に同時再生） */
export const PRESET_BGM_ENABLED = true;

/** クライアント側 FFmpeg 合成は使用しない */
export const CLIENT_BGM_MERGE_ENABLED = false;

/**
 * ナレーション録音 + ffmpeg 焼き込み（開発中）。
 * デフォルト OFF — 外部テストには影響しない。
 * 有効化: .env.local に NEXT_PUBLIC_NARRATION_MERGE_ENABLED=1
 */
export const CLIENT_NARRATION_MERGE_ENABLED =
  process.env.NEXT_PUBLIC_NARRATION_MERGE_ENABLED === "1" ||
  process.env.NEXT_PUBLIC_NARRATION_MERGE_ENABLED === "true";
