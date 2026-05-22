/**
 * `filters.sharpen.unsharpMask@1` — unsharp-mask sharpen.
 *
 * Migrated verbatim from the timeline preview's `sharpenComputeShader`. A 3×3
 * box average is the low-pass; `sharpened = center + amount * (center - blur)`,
 * gated by a luminance threshold. Hand-packed uniform → TypeGPU `SharpenParams`.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../../module.js";

export const SharpenParams = d.struct({
  amount: d.f32,
  threshold: d.f32
});

const layout = tgpu.bindGroupLayout({
  source: { texture: "float" },
  outputTexture: { storageTexture: "rgba8unorm" },
  params: { uniform: SharpenParams }
});

export const sharpenUnsharpMaskV1 = defineModule({
  id: "filters.sharpen.unsharpMask",
  version: 1,
  surface: "internal",
  category: "filters",
  kind: "compute",
  params: SharpenParams,
  paramDefaults: { amount: 0, threshold: 0 },
  paramUi: {
    amount: { min: 0, max: 2, step: 0.01, label: "Amount" },
    threshold: { min: 0, max: 1, step: 0.01, label: "Threshold" }
  },
  layout,
  workgroupSize: [16, 16, 1],
  wgsl: /* wgsl */ `
fn loadClamped(coords: vec2<i32>) -> vec4<f32> {
  let dims = textureDimensions(layout.$.source);
  let c = vec2<i32>(
    clamp(coords.x, 0, i32(dims.x) - 1),
    clamp(coords.y, 0, i32(dims.y) - 1)
  );
  return textureLoad(layout.$.source, c, 0);
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let sharpen = layout.$.params;
  let center = textureLoad(layout.$.source, coords, 0);

  // 3x3 box average as the low-pass; sharpen = center + amount * (center - blur).
  var sum = vec4<f32>(0.0);
  for (var j = -1; j <= 1; j = j + 1) {
    for (var i = -1; i <= 1; i = i + 1) {
      sum = sum + loadClamped(vec2<i32>(coords.x + i, coords.y + j));
    }
  }
  let blurAvg = sum / 9.0;
  let diff = center.rgb - blurAvg.rgb;
  let lum = abs(dot(diff, vec3<f32>(0.299, 0.587, 0.114)));
  let mask = step(sharpen.threshold, lum);
  let sharpened = clamp(center.rgb + diff * sharpen.amount * mask, vec3<f32>(0.0), vec3<f32>(1.0));
  textureStore(layout.$.outputTexture, coords, vec4<f32>(sharpened, center.a));
}
`,
  io: {
    inputs: {
      source: {
        colorSpace: "srgb",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
      }
    },
    output: {
      colorSpace: "srgb",
      alpha: "premultiplied",
      format: "rgba8unorm",
      dimensions: "same-as:source"
    },
    rod: "same-as:source"
  }
});
