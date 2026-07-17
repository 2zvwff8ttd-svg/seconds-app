/**
 * Record stage stacking order (low → high).
 * Controls portaled to document.body use these values.
 */
export const RECORD_STAGE_Z = {
  /** Document-flow form content (banners) */
  formContent: 50,
  /** Dark scrim with shape cutout */
  scrim: 100,
  /** Shape rim highlight */
  rim: 101,
  /** Camera loading overlay (center) */
  loading: 150,
  /** Time budget gauge */
  gauge: 200,
  /** Front / rear camera flip */
  flip: 210,
  /** Bottom dock: record button + status (portaled to body) */
  dock: 300,
  /** Clip strip row — above scrim, grouped with dock */
  clipStrip: 310,
} as const;
