import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const VignetteParams = d.struct({
  intensity: d.f32,
  radius: d.f32,
  softness: d.f32,
  centerX: d.f32,
  centerY: d.f32,
  roundness: d.f32
});
const layout = tgpu.bindGroupLayout({
  source: { texture: "float" },
  outputTexture: { storageTexture: "rgba8unorm" },
  params: { uniform: VignetteParams }
});

/** Movable oval/circular vignette. Default geometry preserves version 1. */
export const vignetteV2 = defineModule({
  precision: { "source": "working", "output": "working" },
  id: "filters.vignette",
  version: 2,
  surface: "published",
  category: "filters",
  linearity: "linear-in-rgb",
  kind: "compute",
  params: VignetteParams,
  paramDefaults: { intensity: 0, radius: 0.9, softness: 0.5, centerX: 0.5, centerY: 0.5, roundness: 0 },
  paramUi: {
    intensity: { min: 0, max: 1, step: 0.01, label: "Intensity" },
    radius: { min: 0.1, max: 1.5, step: 0.01, label: "Radius" },
    softness: { min: 0, max: 1, step: 0.01, label: "Softness" },
    centerX: { min: 0, max: 1, step: 0.01, label: "Center X" },
    centerY: { min: 0, max: 1, step: 0.01, label: "Center Y" },
    roundness: { min: -1, max: 1, step: 0.01, label: "Roundness", notes: "-1 rounded rectangle, 0 frame oval, 1 circle" }
  },
  layout,
  workgroupSize: [16, 16, 1],
  wgsl: /* wgsl */ `
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(gid.xy);
  let v = layout.$.params;
  let color = textureLoad(layout.$.source, coords, 0);
  let uv = (vec2<f32>(gid.xy) + vec2<f32>(0.5)) / vec2<f32>(dims) * 2.0
    - vec2<f32>(v.centerX, v.centerY) * 2.0;
  let axis = mix(vec2<f32>(1.0), vec2<f32>(dims) / f32(min(dims.x, dims.y)), clamp(v.roundness, 0.0, 1.0));
  let square = clamp(-v.roundness, 0.0, 1.0);
  let scaled = abs(uv * axis);
  let power = 2.0 + 6.0 * square;
  var distance = length(scaled);
  if (square > 0.0) { distance = pow(pow(scaled.x, power) + pow(scaled.y, power), 1.0 / power); }
  let inner = max(0.0, v.radius - v.softness);
  let outer = max(inner + 0.001, v.radius);
  let t = clamp((distance - inner) / (outer - inner), 0.0, 1.0);
  let fade = t * t * (3.0 - 2.0 * t);
  let dim = 1.0 - v.intensity * fade;
  textureStore(layout.$.outputTexture, coords, vec4<f32>(color.rgb * dim, color.a));
}
`,
  io: {
    inputs: { source: { colorSpace: "encoded-sdr", alpha: "premultiplied", bindingKinds: ["texture_2d"] } },
    output: { colorSpace: "encoded-sdr", alpha: "premultiplied", format: "rgba8unorm", dimensions: "same-as:source" },
    rod: "same-as:source"
  }
});
