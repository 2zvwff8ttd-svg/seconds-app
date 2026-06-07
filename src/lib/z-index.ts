/**
 * App-wide stacking order (low → high).
 * Defined in globals.css as CSS variables.
 */
export const Z_INDEX = {
  bubbleField: 1,
  bubbleCanvas: 1,
  bubbleItemMax: 6,
  header: 10,
  bottomNav: 100,
  fullscreen: 200,
  onboarding: 300,
  opening: 350,
} as const;
