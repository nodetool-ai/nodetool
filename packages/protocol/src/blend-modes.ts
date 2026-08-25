/**
 * The values a persisted document may carry in a `blendMode` field (timeline
 * clips, sketch layers, the Compositor node). They live here rather than in
 * `@nodetool-ai/gpu` because `protocol` is the base of the dependency order —
 * a schema cannot reach up to a compositor package for the names it
 * validates. `@nodetool-ai/gpu` maps each name onto a WGSL id, a Canvas2D
 * `globalCompositeOperation` and a libvips blend, and re-exports both symbols
 * so its callers still see one catalog.
 *
 * Keep this module import-free: the subpath export exists so `gpu` and mobile
 * reach it without pulling `zod` in behind it.
 */

/**
 * Display order. A `const` tuple so it can drive both the {@link BlendMode}
 * union and a Zod `z.enum`, which needs a literal tuple to infer the union.
 * `normal` is source-over; the next eleven follow the W3C compositing spec.
 */
export const BLEND_MODE_TUPLE = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "add"
] as const;

export type BlendMode = (typeof BLEND_MODE_TUPLE)[number];
