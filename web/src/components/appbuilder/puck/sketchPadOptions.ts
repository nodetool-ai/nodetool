/**
 * The Sketch Pad's canvas options, kept apart from `sketchPadDocument` so the
 * eagerly-loaded widget can read them without pulling the sketch editor's
 * modules into every mini app's bundle.
 */
export type SketchPadBackground = "white" | "transparent";

export const DEFAULT_PAD_WIDTH = 512;
export const DEFAULT_PAD_HEIGHT = 384;

const MIN_PAD_SIDE = 64;
const MAX_PAD_SIDE = 2048;

/** Author-supplied canvas sides, kept inside what a browser canvas draws well. */
export const clampPadSide = (value: unknown, fallback: number): number => {
  const side =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(MAX_PAD_SIDE, Math.max(MIN_PAD_SIDE, Math.round(side)));
};
