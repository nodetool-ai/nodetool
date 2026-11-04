import { SRGB_TRANSFER_WGSL, EXPOSURE_UNPREMULTIPLY_WGSL } from "../../../../colorHelpers.js";
import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

const Params = d.struct({exposure: d.f32, rolloff: d.f32, whites: d.f32});
const layout = tgpu.bindGroupLayout({source: {texture: "float"}, outputTexture: {storageTexture: "rgba8unorm"}, params: {uniform: Params}});

export const colorExposureLinearV1 = defineModule({
  precision: { "source": "working", "output": "working" },
  id: "color.exposureLinear", version: 1, surface: "internal", category: "color",
  linearity: "nonlinear-in-rgb", kind: "compute", params: Params,
  paramDefaults: {exposure: 0, rolloff: 0, whites: 0},
  paramUi: {
    exposure: {min: -5, max: 5, step: 0.1, label: "Exposure", notes: "Linear-light stops"},
    rolloff: {min: 0, max: 1, step: 0.01, label: "Highlight roll-off"},
    whites: {min: -2, max: 2, step: 0.1, label: "Whites", notes: "Stops, weighted toward source highlights"}
  },
  layout, workgroupSize: [16, 16, 1],
  wgsl: /* wgsl */ `
${SRGB_TRANSFER_WGSL}@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let at = vec2i(gid.xy); let src = textureLoad(layout.$.source, at, 0);
  let p = layout.$.params;
  let linear = decode(${EXPOSURE_UNPREMULTIPLY_WGSL});
  let mask = smoothstep(0.25, 1.0, dot(linear, vec3f(0.2126, 0.7152, 0.0722)));
  var gain = exp2(clamp(p.exposure, -5.0, 5.0)) * mix(1.0, exp2(clamp(p.whites, -2.0, 2.0)), mask);
  let strength = clamp(p.rolloff, 0.0, 1.0); let knee = 1.0 - 0.75 * strength;
  let peak = max(max(linear.r, linear.g), linear.b) * gain;
  if (strength > 0.0 && peak > knee) {
    gain *= (knee + (1.0 - knee) * (1.0 - exp(-(peak - knee) / (1.0 - knee)))) / peak;
  }
  textureStore(layout.$.outputTexture, at, vec4f(clamp(encode(linear * gain), vec3f(0), vec3f(1)) * src.a, src.a));
}`,
  io: {
    inputs: {source: {colorSpace: "srgb", alpha: "premultiplied", bindingKinds: ["texture_2d"]}},
    output: {colorSpace: "srgb", alpha: "premultiplied", format: "rgba8unorm", dimensions: "same-as:source"},
    rod: "same-as:source"
  }
});
