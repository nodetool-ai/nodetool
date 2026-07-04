/** Shared frame-count math for the three-beat tutorial layout (see TutorialShell). */
export interface TutorialTiming {
  introSeconds: number;
  outroSeconds: number;
  replayWindowMs: number;
}

/** Total frames for a tutorial: intro + replay window + outro. */
export function framesForTiming(fps: number, timing: TutorialTiming): number {
  const seconds =
    timing.introSeconds + timing.replayWindowMs / 1000 + timing.outroSeconds;
  return Math.round(seconds * fps);
}
