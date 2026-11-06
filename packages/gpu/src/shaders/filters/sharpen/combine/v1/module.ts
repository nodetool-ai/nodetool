import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../../module.js";

const Params = d.struct({amount: d.f32, threshold: d.f32});
const layout = tgpu.bindGroupLayout({source: {texture: "float"}, blurred: {texture: "float"},
  outputTexture: {storageTexture: "rgba8unorm"}, params: {uniform: Params}});

export const sharpenCombineV1 = defineModule({
  precision: { "source": "working", "blurred": "working", "output": "working" },
  id: "filters.sharpen.combine", version: 1, surface: "internal", category: "filters",
  linearity: "nonlinear-in-rgb", kind: "compute", params: Params,
  paramDefaults: {amount: 0, threshold: 0}, layout, workgroupSize: [16, 16, 1],
  wgsl: /* wgsl */ `
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let at = vec2<i32>(gid.xy);
  let src = textureLoad(layout.$.source, at, 0);
  let low = textureLoad(layout.$.blurred, at, 0);
  let straight = src.rgb / max(src.a, 1.0 / 255.0);
  let diff = straight - low.rgb / max(low.a, 1.0 / 255.0);
  let mask = step(layout.$.params.threshold, abs(dot(diff, vec3<f32>(0.299, 0.587, 0.114))));
  let rgb = clamp(straight + diff * layout.$.params.amount * mask, vec3<f32>(0), vec3<f32>(1));
  textureStore(layout.$.outputTexture, at, vec4<f32>(rgb * src.a, src.a));
}`,
  io: {
    inputs: {
      source: {colorSpace: "encoded-sdr", alpha: "premultiplied", bindingKinds: ["texture_2d"]},
      blurred: {colorSpace: "encoded-sdr", alpha: "premultiplied", bindingKinds: ["texture_2d"]}
    },
    output: {colorSpace: "encoded-sdr", alpha: "premultiplied", format: "rgba8unorm", dimensions: "same-as:source"},
    rod: "same-as:source"
  }
});
