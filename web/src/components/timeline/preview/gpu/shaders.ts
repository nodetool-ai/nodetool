/**
 * Transform shader: vertex stage applies a 4x4 matrix per layer; fragment
 * samples the source texture and applies opacity. Two-triangle quad with
 * explicit UVs (no full-screen triangle trick — UV math has to stay clean
 * after we scale/rotate the quad in clip space).
 *
 * Matrix layout matches openreel's createTransformMatrix:
 *   columns = [scale.x*cos, scale.x*sin, 0, 0,
 *              -scale.y*sin, scale.y*cos, 0, 0,
 *              0, 0, 1, 0,
 *              tx, ty, 0, 1]
 *
 * Uniform buffer (96 bytes total):
 *   matrix: 64
 *   opacity: 4
 *   _pad0:   4
 *   _pad1:   8 (unused — kept for layout symmetry with the border-radius variant)
 */
export const transformShader = /* wgsl */ `
struct Uniforms {
  matrix: mat4x4<f32>,
  opacity: f32,
  _pad0: f32,
  _pad1: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(1) @binding(0) var samp: sampler;
@group(1) @binding(1) var tex: texture_2d<f32>;

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VsOut {
  var positions = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
  );
  var uvs = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(1.0, 0.0),
  );
  var out: VsOut;
  out.pos = u.matrix * vec4<f32>(positions[i], 0.0, 1.0);
  out.uv = uvs[i];
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let c = textureSample(tex, samp, in.uv);
  return vec4<f32>(c.rgb, c.a * u.opacity);
}
`;

/**
 * Border-radius variant: same vertex transform but the fragment uses an SDF
 * to mask rounded corners with anti-aliased edges. `radius` is in normalized
 * [0, 0.5] units (fraction of the shorter quad axis).
 *
 * Uniform buffer (96 bytes):
 *   matrix: 64
 *   opacity: 4
 *   radius:  4
 *   aspect:  4   (width/height of the source — corrects the SDF for non-square layers)
 *   smooth:  4
 *   _pad:    16
 */
export const borderRadiusShader = /* wgsl */ `
struct Uniforms {
  matrix: mat4x4<f32>,
  opacity: f32,
  radius: f32,
  aspect: f32,
  smoothness: f32,
  _pad: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(1) @binding(0) var samp: sampler;
@group(1) @binding(1) var tex: texture_2d<f32>;

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) local: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VsOut {
  var positions = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
  );
  var uvs = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(1.0, 0.0),
  );
  var out: VsOut;
  out.pos = u.matrix * vec4<f32>(positions[i], 0.0, 1.0);
  out.uv = uvs[i];
  out.local = positions[i];
  return out;
}

fn sdRoundedRect(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
  let q = abs(p) - b + vec2<f32>(r);
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2<f32>(0.0))) - r;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let c = textureSample(tex, samp, in.uv);
  // Stretch the local position to a square so the SDF gives a uniform corner.
  var p = in.local;
  if (u.aspect > 1.0) {
    p.y = p.y / u.aspect;
  } else {
    p.x = p.x * u.aspect;
  }
  let halfSize = vec2<f32>(min(1.0, u.aspect), min(1.0, 1.0 / u.aspect));
  let r = clamp(u.radius, 0.0, 0.5) * 2.0 * min(halfSize.x, halfSize.y);
  let dist = sdRoundedRect(p, halfSize, r);
  let alpha = 1.0 - smoothstep(-u.smoothness, u.smoothness, dist);
  return vec4<f32>(c.rgb, c.a * u.opacity * alpha);
}
`;

/**
 * Color effects compute shader. Single pass that chains brightness →
 * contrast → saturation → hue → temperature → tint → shadows/highlights.
 * Ported verbatim from openreel-video's effects.wgsl.
 */
export const effectsComputeShader = /* wgsl */ `
struct EffectUniforms {
  brightness: f32,
  contrast: f32,
  saturation: f32,
  hue: f32,
  temperature: f32,
  tint: f32,
  shadows: f32,
  highlights: f32,
};
struct Dimensions {
  width: u32,
  height: u32,
  _pad: vec2<u32>,
};

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> effects: EffectUniforms;
@group(0) @binding(3) var<uniform> dims: Dimensions;

fn rgb2hsv(rgb: vec3<f32>) -> vec3<f32> {
  let maxC = max(max(rgb.r, rgb.g), rgb.b);
  let minC = min(min(rgb.r, rgb.g), rgb.b);
  let delta = maxC - minC;
  var h: f32 = 0.0;
  var s: f32 = 0.0;
  let v: f32 = maxC;
  if (delta > 0.00001) {
    s = delta / maxC;
    if (maxC == rgb.r) {
      h = (rgb.g - rgb.b) / delta;
      if (rgb.g < rgb.b) { h = h + 6.0; }
    } else if (maxC == rgb.g) {
      h = 2.0 + (rgb.b - rgb.r) / delta;
    } else {
      h = 4.0 + (rgb.r - rgb.g) / delta;
    }
    h = h / 6.0;
  }
  return vec3<f32>(h, s, v);
}

fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
  let h = hsv.x * 6.0;
  let s = hsv.y;
  let v = hsv.z;
  let i = floor(h);
  let f = h - i;
  let p = v * (1.0 - s);
  let q = v * (1.0 - s * f);
  let t = v * (1.0 - s * (1.0 - f));
  let idx = i32(i) % 6;
  if (idx == 0) { return vec3<f32>(v, t, p); }
  if (idx == 1) { return vec3<f32>(q, v, p); }
  if (idx == 2) { return vec3<f32>(p, v, t); }
  if (idx == 3) { return vec3<f32>(p, q, v); }
  if (idx == 4) { return vec3<f32>(t, p, v); }
  return vec3<f32>(v, p, q);
}

fn smoothstepCustom(e0: f32, e1: f32, x: f32) -> f32 {
  let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= dims.width || gid.y >= dims.height) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  var color = textureLoad(inputTexture, coords, 0);
  var rgb = color.rgb;

  if (abs(effects.brightness) > 0.001) {
    rgb = clamp(rgb + vec3<f32>(effects.brightness), vec3<f32>(0.0), vec3<f32>(1.0));
  }
  if (abs(effects.contrast - 1.0) > 0.001) {
    rgb = clamp((rgb - 0.5) * effects.contrast + 0.5, vec3<f32>(0.0), vec3<f32>(1.0));
  }
  if (abs(effects.saturation - 1.0) > 0.001) {
    let lum = dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
    rgb = clamp(mix(vec3<f32>(lum), rgb, effects.saturation), vec3<f32>(0.0), vec3<f32>(1.0));
  }
  if (abs(effects.hue) > 0.001) {
    var hsv = rgb2hsv(rgb);
    hsv.x = fract(hsv.x + effects.hue / 360.0);
    rgb = hsv2rgb(hsv);
  }
  if (abs(effects.temperature) > 0.001) {
    if (effects.temperature > 0.0) {
      rgb.r = min(1.0, rgb.r + effects.temperature * 0.2);
      rgb.g = min(1.0, rgb.g + effects.temperature * 0.1);
      rgb.b = max(0.0, rgb.b - effects.temperature * 0.2);
    } else {
      rgb.r = max(0.0, rgb.r + effects.temperature * 0.2);
      rgb.g = max(0.0, rgb.g + effects.temperature * 0.05);
      rgb.b = min(1.0, rgb.b - effects.temperature * 0.2);
    }
  }
  if (abs(effects.tint) > 0.001) {
    rgb.r = clamp(rgb.r + effects.tint * 0.1, 0.0, 1.0);
    rgb.g = clamp(rgb.g - effects.tint * 0.2, 0.0, 1.0);
    rgb.b = clamp(rgb.b + effects.tint * 0.1, 0.0, 1.0);
  }
  if (abs(effects.shadows) > 0.001 || abs(effects.highlights) > 0.001) {
    let lum = dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
    let shadowW = 1.0 - smoothstepCustom(0.0, 0.33, lum);
    let highlightW = smoothstepCustom(0.66, 1.0, lum);
    let adj = effects.shadows * shadowW * 0.3 + effects.highlights * highlightW * 0.3;
    rgb = clamp(rgb + vec3<f32>(adj), vec3<f32>(0.0), vec3<f32>(1.0));
  }

  textureStore(outputTexture, coords, vec4<f32>(rgb, color.a));
}
`;

/**
 * Separable Gaussian blur compute shader. Caller dispatches twice — once
 * with direction (1,0) and once with (0,1) — and ping-pongs textures.
 */
export const blurComputeShader = /* wgsl */ `
struct BlurUniforms {
  radius: f32,
  sigma: f32,
  direction: vec2<f32>,
};
struct Dimensions {
  width: u32,
  height: u32,
  _pad: vec2<u32>,
};

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> blur: BlurUniforms;
@group(0) @binding(3) var<uniform> dims: Dimensions;

fn gaussianWeight(offset: f32, sigma: f32) -> f32 {
  let s2 = sigma * sigma;
  return exp(-(offset * offset) / (2.0 * s2)) / (sqrt(2.0 * 3.14159265) * sigma);
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= dims.width || gid.y >= dims.height) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));

  if (blur.radius < 0.5) {
    textureStore(outputTexture, coords, textureLoad(inputTexture, coords, 0));
    return;
  }

  let kernelRadius = i32(min(blur.radius, 20.0));
  let sigma = max(blur.sigma, blur.radius / 3.0);

  var colorSum = vec4<f32>(0.0);
  var weightSum: f32 = 0.0;
  for (var i = -kernelRadius; i <= kernelRadius; i = i + 1) {
    let offset = vec2<i32>(
      i32(blur.direction.x * f32(i)),
      i32(blur.direction.y * f32(i))
    );
    let s = vec2<i32>(
      clamp(coords.x + offset.x, 0, i32(dims.width) - 1),
      clamp(coords.y + offset.y, 0, i32(dims.height) - 1)
    );
    let w = gaussianWeight(f32(i), sigma);
    colorSum = colorSum + textureLoad(inputTexture, s, 0) * w;
    weightSum = weightSum + w;
  }
  textureStore(outputTexture, coords, colorSum / weightSum);
}
`;
