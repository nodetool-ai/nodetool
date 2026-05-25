/**
 * `filters.blur.gaussianSeparable@1` — two-pass separable gaussian blur.
 *
 * `filters.blur.gaussian` (H) → `filters.blur.gaussian` (V). The single-pass
 * `filters.blur.gaussian@1` module blurs along one axis only; this recipe
 * makes the standard separable kernel available as a single op so workflow
 * nodes don't have to wire two passes by hand.
 */

import * as d from "typegpu/data";
import { defineRecipe } from "../../../../../recipe.js";

export const BlurSeparableParams = d.struct({
  radius: d.f32,
  sigma: d.f32
});

// Inlined GPUTextureUsage flags (see filters.glow for the rationale):
//   COPY_SRC = 0x01, TEXTURE_BINDING = 0x04, STORAGE_BINDING = 0x08
const INTERMEDIATE_BLUR_USAGE = 0x08 | 0x04 | 0x01;

export const filtersBlurSeparableV1 = defineRecipe({
  id: "filters.blur.gaussianSeparable",
  version: 1,
  surface: "internal",
  category: "filters",
  paramDefaults: { radius: 4, sigma: 0 },
  paramUi: {
    radius: { min: 0, max: 64, step: 0.5, label: "Radius", notes: "blur radius, px" },
    sigma: { min: 0, max: 32, step: 0.1, label: "Sigma", notes: "0 = derived from radius" }
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
      blurH: { format: "rgba8unorm", usage: INTERMEDIATE_BLUR_USAGE }
    },
    passes: [
      {
        op: { id: "filters.blur.gaussian", version: 1 },
        in: { source: "source" },
        out: { kind: "intermediate", name: "blurH" },
        params: { radius: "$.radius", sigma: "$.sigma", direction: d.vec2f(1, 0) }
      },
      {
        op: { id: "filters.blur.gaussian", version: 1 },
        in: { source: { kind: "intermediate", name: "blurH" } },
        out: "output",
        params: { radius: "$.radius", sigma: "$.sigma", direction: d.vec2f(0, 1) }
      }
    ]
  }
});
