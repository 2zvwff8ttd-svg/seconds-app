export type PostTimingReport = {
  authMs: number;
  transcodeMs: number;
  transcodePath?: string;
  narrationMs: number;
  thumbsMs: number;
  parallelEncodeThumbsMs: number;
  thumbUploadMs: number;
  videoUploadMs: number;
  dbSaveMs: number;
  totalMs: number;
  clipCount: number;
  durationSeconds: number;
};

export function createPostTimer() {
  const startedAt = performance.now();
  let lastMark = startedAt;

  return {
    elapsed(): number {
      return performance.now() - startedAt;
    },
    mark(): number {
      const now = performance.now();
      const delta = now - lastMark;
      lastMark = now;
      return delta;
    },
    resetMark(): void {
      lastMark = performance.now();
    },
    startedAt,
  };
}

export function logPostTiming(report: PostTimingReport): void {
  console.info(
    "[post-timing]",
    JSON.stringify({
      ...report,
      transcodeSec: roundSec(report.transcodeMs),
      thumbsSec: roundSec(report.thumbsMs),
      parallelSec: roundSec(report.parallelEncodeThumbsMs),
      thumbUploadSec: roundSec(report.thumbUploadMs),
      videoUploadSec: roundSec(report.videoUploadMs),
      dbSaveSec: roundSec(report.dbSaveMs),
      totalSec: roundSec(report.totalMs),
    }),
  );
}

function roundSec(ms: number): number {
  return Math.round(ms) / 1000;
}
