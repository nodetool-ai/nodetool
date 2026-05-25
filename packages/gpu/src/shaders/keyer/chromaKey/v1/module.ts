/**
 * `keyer.chromaKey@1` — clears pixels matching a key color, with tolerance,
 * edge softness, and key-channel spill suppression.
 *
 * Migrated verbatim from the timeline preview's `chromaKeyComputeShader`. The
 * host converts the `#rrggbb` key color to a normalized sRGB `vec3f` (channels
 * in `0..1`, no linearization) and the comparison runs in that same encoded
 * space the texture is stored in — behavior-preserving with the legacy path.
 * Hand-packed uniform → TypeGPU `ChromaKeyParams` (the leading `vec3f` forces
 * the same 16-byte alignment the legacy struct had).
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const ChromaKeyParams = d.struct({
  keyColor: d.vec3f,
  tolerance: d.f32,
  softness: d.f32,
  spill: d.f32
});

const layout = tgpu.bindGroupLayout({
  source: { texture: "float" },
  outputTexture: { storageTexture: "rgba8unorm" },
  params: { uniform: ChromaKeyParams }
});

export const chromaKeyV1 = defineModule({
  id: "keyer.chromaKey",
  version: 1,
  // Promoted in Phase 3: param schema (keyColor, tolerance, softness, spill)
  // is stable since Phase 2; the canonical green/blue-screen keyer.
  surface: "published",
  category: "keyer",
  kind: "compute",
  params: ChromaKeyParams,
  paramDefaults: {
    keyColor: d.vec3f(0, 1, 0),
    tolerance: 0,
    softness: 0.1,
    spill: 0.5
  },
  paramUi: {
    keyColor: { label: "Key color", notes: "normalized sRGB, 0..1 per channel" },
    tolerance: { min: 0, max: 1, step: 0.01, label: "Tolerance" },
    softness: { min: 0, max: 1, step: 0.01, label: "Softness" },
    spill: { min: 0, max: 1, step: 0.01, label: "Spill" }
  },
  layout,
  workgroupSize: [16, 16, 1],
  wgsl: /* wgsl */ `
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let ck = layout.$.params;
  let color = textureLoad(layout.$.source, coords, 0);

  let dist = length(color.rgb - ck.keyColor);
  let inner = ck.tolerance;
  let outer = ck.tolerance + max(ck.softness, 0.001);
  let mask = clamp((dist - inner) / (outer - inner), 0.0, 1.0);
  let smoothMask = mask * mask * (3.0 - 2.0 * mask);

  // Spill suppression: reduce the key channel toward the average of the
  // other two channels for pixels that are near (but not fully) the key.
  var rgb = color.rgb;
  if (ck.spill > 0.001) {
    let other = (color.r + color.g + color.b - max(color.r, max(color.g, color.b))) * 0.5;
    let keyDom = ck.keyColor.g - max(ck.keyColor.r, ck.keyColor.b);
    if (keyDom > 0.0) {
      rgb.g = mix(rgb.g, min(rgb.g, other), ck.spill * (1.0 - smoothMask));
    } else if (ck.keyColor.b - max(ck.keyColor.r, ck.keyColor.g) > 0.0) {
      rgb.b = mix(rgb.b, min(rgb.b, other), ck.spill * (1.0 - smoothMask));
    } else if (ck.keyColor.r - max(ck.keyColor.g, ck.keyColor.b) > 0.0) {
      rgb.r = mix(rgb.r, min(rgb.r, other), ck.spill * (1.0 - smoothMask));
    }
  }

  let outAlpha = color.a * smoothMask;
  textureStore(layout.$.outputTexture, coords, vec4<f32>(rgb, outAlpha));
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
