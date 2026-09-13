/**
 * Labels for the four fade curves, shared by the fade-handle menu on a clip
 * and the inspector's fade section so a shape reads the same in both.
 *
 * The names are Final Cut's, and each one says what the curve does at the
 * midpoint of the ramp relative to a straight line.
 */

import { CLIP_FADE_SHAPES, type ClipFadeShape } from "@nodetool-ai/timeline";

export const CLIP_FADE_SHAPE_LABELS: Record<ClipFadeShape, string> = {
  linear: "Linear",
  sCurve: "S-curve",
  plus3dB: "+3 dB",
  minus3dB: "-3 dB"
};

export const CLIP_FADE_SHAPE_HINTS: Record<ClipFadeShape, string> = {
  linear: "A straight ramp in level.",
  sCurve: "Eased at both ends, straight through the middle.",
  plus3dB: "Louder through the middle — holds the level across a crossing fade.",
  minus3dB: "Quieter through the middle — the soft part of the fade lasts longer."
};

export const CLIP_FADE_SHAPE_OPTIONS: ReadonlyArray<{
  value: ClipFadeShape;
  label: string;
}> = CLIP_FADE_SHAPES.map((value) => ({
  value,
  label: CLIP_FADE_SHAPE_LABELS[value]
}));
