/**
 * `filters.glow@1` — multi-pass glow recipe.
 *
 * `extract` (`filters.threshold@1`) → `blurH` (`filters.blur.gaussian@1`) →
 * `blurV` (`filters.blur.gaussian@1`) → `add` (`mixer.add@1`) over source.
 *
 * Intermediate formats are declared in the recipe, not chosen by the host —
 * that's how a recipe like this produces the same output everywhere. The
 * `bright` intermediate is a fragment write (render attachment); the blur
 * intermediates are compute writes (storage textures). All three are read
 * back as `texture_2d<f32>` by the next pass.
 */

import * as d from "typegpu/data";
import { defineRecipe } from "../../../../recipe.js";

export const GlowParams = d.struct({
  threshold: d.f32,
  softness: d.f32,
  radius: d.f32,
  intensity: d.f32
});

// Inlined WebGPU `GPUTextureUsage` flags. The named constants are runtime
// globals installed by the host adapter (browser ambient / Dawn `installGlobals`),
// so they're undefined when this module is imported before the adapter runs —
// using the literal bits keeps the recipe load-order-independent.
//   COPY_SRC = 0x01, TEXTURE_BINDING = 0x04, STORAGE_BINDING = 0x08,
//   RENDER_ATTACHMENT = 0x10
const INTERMEDIATE_BRIGHT_USAGE = 0x10 | 0x04 | 0x01;
const INTERMEDIATE_BLUR_USAGE = 0x08 | 0x04 | 0x01;

export const filtersGlowV1 = defineRecipe({
  id: "filters.glow",
  version: 1,
  surface: "internal",
  category: "filters",
  paramDefaults: { threshold: 0.7, softness: 0.1, radius: 8, intensity: 1 },
  paramUi: {
    threshold: { min: 0, max: 1, step: 0.01, label: "Threshold" },
    softness: { min: 0, max: 0.5, step: 0.01, label: "Softness" },
    // Capped at 20 to match `filters.blur.gaussian@1`'s hard
    // `kernelRadius = min(radius, 20)` clamp; a higher max silently truncates.
    radius: { min: 0, max: 20, step: 0.5, label: "Radius", notes: "blur radius, px" },
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
      bright: { format: "rgba8unorm", usage: INTERMEDIATE_BRIGHT_USAGE },
      blurH: { format: "rgba8unorm", usage: INTERMEDIATE_BLUR_USAGE },
      blurV: { format: "rgba8unorm", usage: INTERMEDIATE_BLUR_USAGE }
    },
    passes: [
      {
        op: { id: "filters.threshold", version: 1 },
        in: { source: "source" },
        out: { kind: "intermediate", name: "bright" },
        params: { threshold: "$.threshold", softness: "$.softness" }
      },
      {
        op: { id: "filters.blur.gaussian", version: 1 },
        in: { source: { kind: "intermediate", name: "bright" } },
        out: { kind: "intermediate", name: "blurH" },
        params: {
          radius: "$.radius",
          sigma: 0,
          direction: d.vec2f(1, 0)
        }
      },
      {
        op: { id: "filters.blur.gaussian", version: 1 },
        in: { source: { kind: "intermediate", name: "blurH" } },
        out: { kind: "intermediate", name: "blurV" },
        params: {
          radius: "$.radius",
          sigma: 0,
          direction: d.vec2f(0, 1)
        }
      },
      {
        op: { id: "mixer.add", version: 1 },
        in: {
          source: "source",
          over: { kind: "intermediate", name: "blurV" }
        },
        out: "output",
        params: { gain: "$.intensity" }
      }
    ]
  }
});
