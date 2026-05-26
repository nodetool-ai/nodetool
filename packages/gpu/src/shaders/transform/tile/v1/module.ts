/**
 * `transform.tile@1` — tile the source `tilesX` × `tilesY` times across the
 * output canvas.
 *
 * Output dimensions stay `same-as:source` — tiling reduces the per-tile size
 * inside the same canvas rather than enlarging the target. `wrap` controls
 * how UVs at tile borders are sampled: `0` clamp-to-edge (every tile is a
 * crisp copy of the source), `1` repeat, `2` mirror-repeat (tiles alternate
 * orientation, producing the classic seamless pattern).
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const TileParams = d.struct({
  tilesX: d.f32,
  tilesY: d.f32,
  wrap: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: TileParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const transformTileV1 = defineModule({
  id: "transform.tile",
  version: 1,
  surface: "internal",
  category: "transform",
  linearity: "linear-in-rgb",
  kind: "fragment",
  params: TileParams,
  paramDefaults: { tilesX: 2, tilesY: 2, wrap: 1 },
  paramUi: {
    tilesX: { min: 1, max: 32, step: 1, label: "Tiles X" },
    tilesY: { min: 1, max: 32, step: 1, label: "Tiles Y" },
    wrap: { min: 0, max: 2, step: 1, label: "Wrap", notes: "0 clamp / 1 repeat / 2 mirror" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
fn applyWrap(u: vec2f, mode: i32) -> vec2f {
  if (mode == 2) {
    let q = fract(u * 0.5) * 2.0;
    return vec2f(
      select(q.x, 2.0 - q.x, q.x > 1.0),
      select(q.y, 2.0 - q.y, q.y > 1.0)
    );
  }
  if (mode == 0) {
    return clamp(u, vec2f(0.0), vec2f(1.0));
  }
  return fract(u);
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let tx = max(1.0, p.tilesX);
  let ty = max(1.0, p.tilesY);
  let mode = i32(round(p.wrap));
  let scaled = vec2f(uv.x * tx, uv.y * ty);
  let u = applyWrap(scaled, mode);
  return textureSample(layout.$.source, layout.$.samp, u);
}
`,
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
    rod: "same-as:source"
  }
});
