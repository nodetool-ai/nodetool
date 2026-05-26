/**
 * `sources.solid@1` — fill the entire output with a single color.
 *
 * Zero-input source. Output dimensions are `host-specified` — the host
 * allocates the target texture at the resolution it wants, the module just
 * writes the same RGBA into every pixel. Alpha is premultiplied per the
 * pool's convention (callers passing a straight-alpha color must
 * pre-multiply before assigning to the param).
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const SolidParams = d.struct({
  color: d.vec4f
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: SolidParams }
});

export const sourcesSolidV1 = defineModule({
  id: "sources.solid",
  version: 1,
  surface: "internal",
  category: "sources",
  linearity: "source",
  kind: "fragment",
  params: SolidParams,
  paramDefaults: { color: d.vec4f(0, 0, 0, 1) },
  paramUi: {
    color: { label: "Color", notes: "RGBA, premultiplied" }
  },
  layout,
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return layout.$.params.color;
}
`,
  io: {
    inputs: {},
    output: {
      colorSpace: "linear",
      alpha: "premultiplied",
      format: "rgba8unorm",
      dimensions: "host-specified"
    },
    rod: "explicit"
  }
});
