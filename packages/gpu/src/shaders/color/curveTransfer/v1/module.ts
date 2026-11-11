import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

const Params = d.struct({table: d.arrayOf(d.vec4f, 256)});
const layout = tgpu.bindGroupLayout({source: {texture: "float"}, outputTexture: {storageTexture: "rgba8unorm"}, params: {uniform: Params}});

export const colorCurveTransferV1 = defineModule({
  precision: { "source": "working", "output": "working" },
  id: "color.curveTransfer", version: 1, surface: "internal", category: "color",
  linearity: "nonlinear-in-rgb", kind: "compute", params: Params,
  paramDefaults: {table: Array.from({length: 256}, (_, i) => d.vec4f(i / 255, i / 255, i / 255, 1))},
  layout, workgroupSize: [16, 16, 1],
  wgsl: /* wgsl */ `
fn transfer(value: f32, channel: u32) -> f32 {
  let at = clamp(value, 0.0, 1.0) * 255.0;
  let lo = u32(floor(at)); let hi = min(255u, lo + 1u);
  return mix(layout.$.params.table[lo][channel], layout.$.params.table[hi][channel], fract(at));
}
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let at = vec2<i32>(gid.xy); let src = textureLoad(layout.$.source, at, 0);
  let rgb = src.rgb / max(src.a, 1.0 / 255.0);
  let mapped = vec3<f32>(transfer(rgb.r, 0u), transfer(rgb.g, 1u), transfer(rgb.b, 2u));
  textureStore(layout.$.outputTexture, at, vec4<f32>(mapped * src.a, src.a));
}`,
  io: {
    inputs: {source: {colorSpace: "encoded-sdr", alpha: "premultiplied", bindingKinds: ["texture_2d"]}},
    output: {colorSpace: "encoded-sdr", alpha: "premultiplied", format: "rgba8unorm", dimensions: "same-as:source"},
    rod: "same-as:source"
  }
});
