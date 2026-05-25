/**
 * `mixer.dropShadow@1` — drop-shadow layer effect as a four-pass recipe.
 *
 * `mask.fromImage` (alpha) → `filters.blur.gaussian` H → `filters.blur.gaussian` V
 * → `mixer.shadowCompose` over source.
 *
 * Mirrors the `filters.glow@1` recipe structure: the alpha is the only
 * channel that drives shadow shape, so a single-channel mask intermediate is
 * cheaper than blurring the full source. Offsets are normalized UV units —
 * the host translates pixel-space drag handles into UV before pushing
 * params.
 */

import * as d from "typegpu/data";
import { defineRecipe } from "../../../../recipe.js";

export const DropShadowParams = d.struct({
  color: d.vec4f,
  offsetX: d.f32,
  offsetY: d.f32,
  radius: d.f32,
  intensity: d.f32
});

// Inlined GPUTextureUsage flags (see filters.glow for the rationale):
//   COPY_SRC = 0x01, TEXTURE_BINDING = 0x04, STORAGE_BINDING = 0x08,
//   RENDER_ATTACHMENT = 0x10
const INTERMEDIATE_MASK_USAGE = 0x10 | 0x04 | 0x01;
const INTERMEDIATE_BLUR_USAGE = 0x08 | 0x04 | 0x01;

export const mixerDropShadowV1 = defineRecipe({
  id: "mixer.dropShadow",
  version: 1,
  surface: "internal",
  category: "mixer",
  paramDefaults: {
    color: d.vec4f(0, 0, 0, 1),
    offsetX: 0.02,
    offsetY: 0.02,
    radius: 8,
    intensity: 0.6
  },
  paramUi: {
    color: { label: "Shadow color", notes: "RGBA, straight alpha" },
    offsetX: { min: -0.5, max: 0.5, step: 0.005, label: "Offset X" },
    offsetY: { min: -0.5, max: 0.5, step: 0.005, label: "Offset Y" },
    radius: { min: 0, max: 40, step: 0.5, label: "Radius", notes: "blur radius, px" },
    intensity: { min: 0, max: 4, step: 0.01, label: "Intensity" }
  },
  io: {
    inputs: {
      source: {
        colorSpace: "linear",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
      }
    },
    output: {
      colorSpace: "linear",
      alpha: "premultiplied",
      format: "rgba8unorm",
      dimensions: "same-as:source"
    },
    rod: "expand:radius"
  },
  recipe: {
    intermediates: {
      mask: { format: "rgba8unorm", usage: INTERMEDIATE_MASK_USAGE },
      blurH: { format: "rgba8unorm", usage: INTERMEDIATE_BLUR_USAGE },
      blurV: { format: "rgba8unorm", usage: INTERMEDIATE_BLUR_USAGE }
    },
    passes: [
      {
        op: { id: "mask.fromImage", version: 1 },
        in: { source: "source" },
        out: { kind: "intermediate", name: "mask" },
        params: { mode: 0, invert: 0 }
      },
      {
        op: { id: "filters.blur.gaussian", version: 1 },
        in: { source: { kind: "intermediate", name: "mask" } },
        out: { kind: "intermediate", name: "blurH" },
        params: { radius: "$.radius", sigma: 0, direction: d.vec2f(1, 0) }
      },
      {
        op: { id: "filters.blur.gaussian", version: 1 },
        in: { source: { kind: "intermediate", name: "blurH" } },
        out: { kind: "intermediate", name: "blurV" },
        params: { radius: "$.radius", sigma: 0, direction: d.vec2f(0, 1) }
      },
      {
        op: { id: "mixer.shadowCompose", version: 1 },
        in: {
          source: "source",
          shadowMask: { kind: "intermediate", name: "blurV" }
        },
        out: "output",
        params: {
          color: "$.color",
          offsetX: "$.offsetX",
          offsetY: "$.offsetY",
          intensity: "$.intensity"
        }
      }
    ]
  }
});
