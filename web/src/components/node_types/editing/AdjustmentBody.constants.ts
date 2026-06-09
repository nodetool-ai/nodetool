/**
 * Node types that render with the generic, metadata-driven `AdjustmentBody`
 * (preview + a tight grid of sliders, one per numeric property).
 *
 * These are slider-only image nodes: their only inputs are one or more images
 * (`image` / `mask` / `over`) plus numeric (`float` / `int`) parameters. The
 * body derives every slider from `nodeMetadata.properties` — min / max /
 * default / step all come from metadata, so adding a node here is usually all
 * that's needed.
 *
 * Constraints when adding a node:
 *   - Every non-image property must be a genuine continuous slider. Exclude
 *     nodes with `int` props that are really enums (`mode`, `wrap`, channel
 *     selectors) or booleans (`invert`) — a slider misrepresents those; they
 *     need the generic content card or a bespoke widget.
 *   - Don't add a node that already has a dedicated bespoke body (Curves,
 *     Levels, Exposure, Crop, Fit, Paste, Resize, Scale, …). This list is
 *     spread last into the registry and would shadow it.
 */
export const ADJUSTMENT_NODE_TYPES = [
  // Color / tonal adjustments
  "lib.image.color.BrightnessContrast",
  "lib.image.color.HSB",
  "lib.image.color.Invert",
  "lib.image.color.Posterize",
  "lib.image.color.Exposure",
  "lib.image.color.Grade",
  // Color grading
  "lib.image.color_grading.Exposure",
  "lib.image.color_grading.SaturationVibrance",
  "lib.image.color_grading.ColorBalance",
  "lib.image.color_grading.Vignette",
  "lib.image.color_grading.CDL",
  "lib.image.color_grading.LiftGammaGain",
  "lib.image.color_grading.SplitToning",
  // Effects
  "lib.image.effects.Add",
  "lib.image.effects.Glow",
  // Enhance
  "lib.image.enhance.AdaptiveContrast",
  "lib.image.enhance.AutoContrast",
  "lib.image.enhance.RankFilter",
  // Filters
  "lib.image.filter.Canny",
  "lib.image.filter.Expand",
  "lib.image.filter.GaussianBlur",
  "lib.image.filter.Pixelate",
  "lib.image.filter.Posterize",
  "lib.image.filter.Solarize",
  "lib.image.filter.Threshold",
  "lib.image.filter.UnsharpMask",
  "lib.image.filter.Vignette",
  // Keyer
  "lib.image.keyer.LumaKey",
  // Warp
  "lib.image.warp.Displace",
  "lib.image.warp.Spherize"
] as const;
