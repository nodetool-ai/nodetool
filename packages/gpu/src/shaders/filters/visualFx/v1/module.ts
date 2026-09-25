import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const VisualFxParams = d.struct({
  mode: d.f32,
  amount: d.f32,
  scale: d.f32,
  angle: d.f32,
  time: d.f32,
  seed: d.f32,
  softness: d.f32,
  colorA: d.vec4f,
  colorB: d.vec4f
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: VisualFxParams },
  source: { texture: "float" },
  mask: { texture: "float" },
  samp: { sampler: "filtering" }
});

export const filtersVisualFxV1 = defineModule({
  id: "filters.visualFx",
  version: 1,
  surface: "internal",
  category: "filters",
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: VisualFxParams,
  paramDefaults: {
    mode: 0,
    amount: 0.5,
    scale: 8,
    angle: 0,
    time: 0,
    seed: 0,
    softness: 0.1,
    colorA: d.vec4f(0.05, 0.1, 0.2, 1),
    colorB: d.vec4f(0.9, 0.4, 0.2, 1)
  },
  layout,
  samplers: {
    samp: {
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge"
    }
  },
  wgsl: /* wgsl */ `
fn hash(p: vec2f) -> f32 {
  let x = u32(i32(p.x));
  let y = u32(i32(p.y));
  var n = x * 374761393u + y * 668265263u + 2246822519u;
  n = (n ^ (n >> 13u)) * 1274126177u;
  n = n ^ (n >> 16u);
  return f32(n & 16777215u) / 16777215.0;
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec2f(3.0) - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x),
             mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0)), u.x), u.y);
}

fn fbm(p: vec2f) -> f32 {
  var n = 0.0;
  var amp = 0.5;
  var q = p;
  for (var k = 0; k < 5; k = k + 1) {
    n = n + amp * noise(q);
    q = q * 2.03 + vec2f(11.7, 5.3);
    amp = amp * 0.5;
  }
  return n;
}

fn sampleAt(uv: vec2f) -> vec4f {
  return textureSample(layout.$.source, layout.$.samp, clamp(uv, vec2f(0.0), vec2f(1.0)));
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let mode = i32(round(p.mode));
  let src = sampleAt(uv);
  let cov = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let dims = vec2f(textureDimensions(layout.$.source));
  let q = uv - vec2f(0.5);
  let strength = max(0.0, p.amount);
  let scale = max(1.0, p.scale);
  var result = src;

  if (mode == 0) { // RGB split
    let delta = vec2f(cos(p.angle), sin(p.angle)) * strength / dims;
    let red = sampleAt(uv + delta);
    let blue = sampleAt(uv - delta);
    result = vec4f(red.r / max(red.a, 1.0 / 255.0) * src.a,
                   src.g,
                   blue.b / max(blue.a, 1.0 / 255.0) * src.a,
                   src.a);
  } else if (mode == 1 || mode == 2) { // spin or zoom blur
    var sum = vec4f(0.0);
    for (var i = 0; i < 13; i = i + 1) {
      let t = (f32(i) - 6.0) / 6.0;
      if (mode == 1) {
        let theta = t * strength * 8.0 / max(dims.x, dims.y);
        let rotated = vec2f(q.x * cos(theta) - q.y * sin(theta), q.x * sin(theta) + q.y * cos(theta));
        sum = sum + sampleAt(vec2f(0.5) + rotated);
      } else {
        sum = sum + sampleAt(uv + q * t * strength / dims * 8.0);
      }
    }
    result = sum / 13.0;
  } else if (mode == 3 || mode == 4 || mode == 12) { // smooth displacement or stepped glitch
    let field = fbm(uv * scale + vec2f(p.time, p.seed));
    var displacement = (field - 0.5) * strength * 20.0;
    if (mode == 4) {
      let row = floor(uv.y * scale * 8.0);
      displacement = (hash(vec2f(row, floor(p.time * 24.0) + p.seed)) - 0.5) * strength * 40.0;
    }
    result = sampleAt(uv + vec2f(displacement / dims.x,
      select(displacement * 0.3 / dims.y, 0.0, mode == 4)));
  } else if (mode == 5) { // halftone
    let luma = dot(src.rgb / max(src.a, 0.00392), vec3f(0.2126, 0.7152, 0.0722));
    let cell = fract(uv * dims / scale) - vec2f(0.5);
    let dotRadius = sqrt(max(0.0, 1.0 - luma)) * 0.62;
    let ink = 1.0 - smoothstep(dotRadius - 0.08, dotRadius + 0.08, length(cell));
    result = vec4f(vec3f(1.0 - ink) * src.a, src.a);
  } else if (mode == 6) { // ordered blue-ish hash dither
    let jitter = (hash(floor(uv * dims) + vec2f(p.seed)) - 0.5) * strength * 2.0 / 255.0;
    result = vec4f(clamp(src.rgb + vec3f(jitter * src.a), vec3f(0.0), vec3f(src.a)), src.a);
  } else if (mode == 7 || mode == 8) { // rays or anamorphic flare
    let a = atan2(q.y, q.x);
    let beam = pow(max(0.0, cos((a - p.angle) * select(8.0, 2.0, mode == 8))), 24.0);
    let falloff = 1.0 / (1.0 + length(q * vec2f(1.0, select(1.0, 8.0, mode == 8))) * scale);
    let light = clamp(beam * falloff * strength, 0.0, 1.0);
    result = vec4f(src.rgb + (vec3f(src.a) - src.rgb) * light * p.colorB.rgb, src.a);
  } else if (mode >= 9 && mode <= 11) { // inner shadow, inner glow, edge highlight
    let reach = scale / dims;
    let shifted = sampleAt(uv + vec2f(cos(p.angle), sin(p.angle)) * reach).a;
    let around = min(min(sampleAt(uv + vec2f(reach.x, 0.0)).a, sampleAt(uv - vec2f(reach.x, 0.0)).a),
                     min(sampleAt(uv + vec2f(0.0, reach.y)).a, sampleAt(uv - vec2f(0.0, reach.y)).a));
    let edge = clamp(src.a - select(shifted, around, mode == 10), 0.0, 1.0) * strength;
    if (mode == 9) {
      result = vec4f(mix(src.rgb, p.colorB.rgb * src.a, clamp(edge, 0.0, 1.0)), src.a);
    } else {
      result = vec4f(src.rgb + (vec3f(src.a) - src.rgb) * clamp(edge, 0.0, 1.0) * p.colorB.rgb, src.a);
    }
  } else if (mode == 13) { // threshold a spatial gradient field
    var field = uv.x;
    if (p.time < 0.5) {
      let direction = vec2f(cos(p.angle), sin(p.angle));
      field = select(select(uv.x, 1.0 - uv.x, direction.x > 0.0), select(uv.y, 1.0 - uv.y, direction.y > 0.0), abs(direction.y) > 0.5);
    } else if (p.time < 1.5) {
      field = distance(uv, vec2f(0.5)) / 0.70710678;
    } else {
      field = clamp(fbm(uv * scale + vec2f(p.seed)), 0.0, 1.0);
    }
    let feather = max(0.001, p.softness);
    let edge = strength * (1.0 + feather);
    let reveal = 1.0 - smoothstep(edge - feather, edge, field);
    result = src * reveal;
  } else if (mode == 14) { // localized warm light leak over the picture
    let center = vec2f(0.5 + sin(p.time * 6.2831853 + p.seed) * 0.3, 0.3);
    let light = exp(-distance(uv, center) * scale * 3.0) * strength;
    result = vec4f(src.rgb + (vec3f(src.a) - src.rgb) * light * p.colorB.rgb, src.a);
  } else if (mode >= 15) {
    var v = 0.0;
    if (mode == 15) { // noise
      v = hash(floor(uv * dims / scale) + vec2f(p.seed, floor(p.time * 24.0)));
    } else if (mode == 16) { // fractal texture
      v = fbm(uv * scale + vec2f(p.time, p.seed));
    } else if (mode == 17) { // conic gradient
      v = fract(atan2(q.y, q.x) / 6.2831853 + p.angle / 6.2831853 + 1.0);
    } else if (mode == 18) { // mesh gradient
      v = 0.5 + 0.25 * sin(uv.x * scale + p.time) + 0.25 * cos(uv.y * scale * 0.7 - p.time);
    } else if (mode == 19) { // animated gradient field
      v = fbm(uv * scale + vec2f(p.time * 0.3, -p.time * 0.2));
    } else if (mode == 20) { // particles
      let cell = floor(uv * scale);
      let local = fract(uv * scale);
      var center = vec2f(hash(cell + vec2f(p.seed)), hash(cell + vec2f(p.seed + 17.0)));
      center.y = fract(center.y + p.time * (0.1 + center.x * 0.2));
      v = pow(1.0 - smoothstep(0.0, 0.15, distance(local, center)), 2.0);
    } else if (mode == 21) { // light leak
      let center = vec2f(0.5 + sin(p.time * 0.7 + p.seed) * 0.6, 0.2);
      v = exp(-distance(uv, center) * scale * 0.5);
    } else { // pattern grid
      let grid = fract(uv * scale);
      v = select(0.0, 1.0, min(min(grid.x, grid.y), min(1.0 - grid.x, 1.0 - grid.y)) < 0.04);
    }
    let color = mix(p.colorA, p.colorB, clamp(v * strength, 0.0, 1.0));
    result = color;
  }
  let mixed = mix(src, result, cov);
  return vec4f(clamp(mixed.rgb, vec3f(0.0), vec3f(mixed.a)), mixed.a);
}
`,
  io: {
    inputs: {
      source: { colorSpace: "linear", alpha: "premultiplied", bindingKinds: ["texture_2d"] },
      mask: { colorSpace: "linear", alpha: "premultiplied", bindingKinds: ["texture_2d"], optional: true }
    },
    output: { colorSpace: "linear", alpha: "premultiplied", format: "rgba8unorm", dimensions: "same-as:source" },
    rod: "same-as:source"
  }
});
