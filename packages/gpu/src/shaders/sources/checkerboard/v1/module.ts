/**
 * `sources.checkerboard@1` — two-color checkerboard pattern.
 *
 * `cellSize` is in output pixels. Zero-input source, host-specified
 * dimensions — the host picks the output resolution; cell count follows
 * directly from that and `cellSize`.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const CheckerboardParams = d.struct({
  colorA: d.vec4f,
  colorB: d.vec4f,
  cellSize: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: CheckerboardParams }
});

export const sourcesCheckerboardV1 = defineModule({
  id: "sources.checkerboard",
  version: 1,
  surface: "internal",
  category: "sources",
  linearity: "source",
  kind: "fragment",
  params: CheckerboardParams,
  paramDefaults: {
    colorA: d.vec4f(0.8, 0.8, 0.8, 1),
    colorB: d.vec4f(0.2, 0.2, 0.2, 1),
    cellSize: 16
  },
  paramUi: {
    colorA: { label: "Color A" },
    colorB: { label: "Color B" },
    cellSize: { min: 1, max: 256, step: 1, label: "Cell size", notes: "pixels" }
  },
  layout,
  wgsl: /* wgsl */ `
struct Out {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@fragment
fn fs_main(in: Out) -> @location(0) vec4f {
  let p = layout.$.params;
  let cell = max(1.0, p.cellSize);
  let coord = vec2i(in.position.xy / cell);
  let parity = (coord.x + coord.y) % 2;
  // Straight colour params → premultiplied output: premultiply the picked
  // colour so a translucent cell colour keeps rgb <= a.
  if (parity == 0) {
    return vec4f(p.colorA.rgb * p.colorA.a, p.colorA.a);
  }
  return vec4f(p.colorB.rgb * p.colorB.a, p.colorB.a);
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
