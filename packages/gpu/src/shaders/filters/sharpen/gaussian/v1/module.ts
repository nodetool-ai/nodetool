import * as d from "typegpu/data";
import { defineRecipe } from "../../../../../recipe.js";

/** Radius-dependent Gaussian unsharp mask. The published unsharpMask keeps its box kernel. */
export const sharpenGaussianV1 = defineRecipe({
  precision: { "source": "working", "output": "working" },
  id: "filters.sharpen.gaussian", version: 1, surface: "internal", category: "filters",
  paramDefaults: {amount: 0, threshold: 0, radius: 8},
  paramUi: {
    amount: {min: 0, max: 2, step: 0.01, label: "Amount"},
    threshold: {min: 0, max: 1, step: 0.01, label: "Threshold"},
    radius: {min: 0, max: 256, step: 1, label: "Radius"}
  },
  io: {
    inputs: {source: {colorSpace: "encoded-sdr", alpha: "premultiplied", bindingKinds: ["texture_2d"]}},
    output: {colorSpace: "encoded-sdr", alpha: "premultiplied", format: "rgba8unorm", dimensions: "same-as:source"},
    rod: "same-as:source"
  },
  recipe: {
    intermediates: {
      horizontal: {precision: "working", format: "rgba8unorm", usage: 0x08 | 0x04 | 0x01},
      blurred: {precision: "working", format: "rgba8unorm", usage: 0x08 | 0x04 | 0x01}
    },
    passes: [
      {op: {id: "filters.blur.gaussian", version: 1}, in: {source: "source"},
        out: {kind: "intermediate", name: "horizontal"},
        params: {radius: "$.radius", sigma: 0, direction: d.vec2f(1, 0)}},
      {op: {id: "filters.blur.gaussian", version: 1}, in: {source: {kind: "intermediate", name: "horizontal"}},
        out: {kind: "intermediate", name: "blurred"},
        params: {radius: "$.radius", sigma: 0, direction: d.vec2f(0, 1)}},
      {op: {id: "filters.sharpen.combine", version: 1},
        in: {source: "source", blurred: {kind: "intermediate", name: "blurred"}}, out: "output",
        params: {amount: "$.amount", threshold: "$.threshold"}}
    ]
  }
});
