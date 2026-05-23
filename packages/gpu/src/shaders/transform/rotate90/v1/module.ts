/**
 * `transform.rotate90@1` — rotate by 90°, 180°, or 270° in nearest-friendly
 * steps.
 *
 * `turns` packs the quarter-turn count: `0` identity, `1` 90° CW, `2` 180°,
 * `3` 270° CW (= 90° CCW). Output dimensions are `derived`: the host swaps
 * width/height for odd quarter-turns (90/270) and keeps them for even ones
 * (0/180). The shader reads the source's dimensions and maps each output
 * UV back to the corresponding source UV based on `turns`.
 *
 * For arbitrary rotations (and translation/scale combined), use
 * `transform.affine@1`. This module exists specifically because quarter-turns
 * have no resampling loss and are extremely common (sensor orientation,
 * EXIF auto-rotate, pixel-art layouts).
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const Rotate90Params = d.struct({
  turns: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: Rotate90Params },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "nearest",
  minFilter: "nearest",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const transformRotate90V1 = defineModule({
  id: "transform.rotate90",
  version: 1,
  surface: "internal",
  category: "transform",
  kind: "fragment",
  params: Rotate90Params,
  paramDefaults: { turns: 1 },
  paramUi: {
    turns: {
      min: 0,
      max: 3,
      step: 1,
      label: "Turns (CW)",
      notes: "0 / 1=90° / 2=180° / 3=270°"
    }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = i32(round(layout.$.params.turns)) & 3;
  // Map output UV (in the rotated canvas) back to source UV by applying the
  // inverse rotation. Quarter-turn rotation around the canvas center is
  // (u, v) → (1-v, u) for 90° CW; the inverse for sampling is (u, v) → (v, 1-u).
  var s = uv;
  if (t == 1) {
    s = vec2f(uv.y, 1.0 - uv.x);
  } else if (t == 2) {
    s = vec2f(1.0 - uv.x, 1.0 - uv.y);
  } else if (t == 3) {
    s = vec2f(1.0 - uv.y, uv.x);
  }
  return textureSample(layout.$.source, layout.$.samp, s);
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
      dimensions: "derived"
    },
    rod: "explicit"
  }
});
