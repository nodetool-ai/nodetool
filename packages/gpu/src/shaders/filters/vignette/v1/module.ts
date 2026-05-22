/**
 * `filters.vignette@1` — radial darken from frame center.
 *
 * Migrated verbatim from the timeline preview's `vignetteComputeShader`.
 * Hand-packed uniform → TypeGPU `VignetteParams`; the falloff math is unchanged.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const VignetteParams = d.struct({
  intensity: d.f32,
  radius: d.f32,
  softness: d.f32
});

const layout = tgpu.bindGroupLayout({
  source: { texture: "float" },
  outputTexture: { storageTexture: "rgba8unorm" },
  params: { uniform: VignetteParams }
});

export const vignetteV1 = defineModule({
  id: "filters.vignette",
  version: 1,
  surface: "internal",
  category: "filters",
  kind: "compute",
  params: VignetteParams,
  paramDefaults: { intensity: 0, radius: 0.9, softness: 0.5 },
  paramUi: {
    intensity: { min: 0, max: 1, step: 0.01, label: "Intensity" },
    radius: { min: 0.1, max: 1.5, step: 0.01, label: "Radius" },
    softness: { min: 0, max: 1, step: 0.01, label: "Softness" }
  },
  layout,
  workgroupSize: [16, 16, 1],
  wgsl: /* wgsl */ `
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let v = layout.$.params;
  let color = textureLoad(layout.$.source, coords, 0);

  // Normalize to [-1, 1] coordinates centered on the frame.
  let uv = vec2<f32>(
    (f32(gid.x) + 0.5) / f32(dims.x) * 2.0 - 1.0,
    (f32(gid.y) + 0.5) / f32(dims.y) * 2.0 - 1.0
  );
  let dist = length(uv);
  let inner = max(0.0, v.radius - v.softness);
  let outer = max(inner + 0.001, v.radius);
  let t = clamp((dist - inner) / (outer - inner), 0.0, 1.0);
  let fade = t * t * (3.0 - 2.0 * t);
  let dim = 1.0 - v.intensity * fade;
  textureStore(layout.$.outputTexture, coords, vec4<f32>(color.rgb * dim, color.a));
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
