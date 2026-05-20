/**
 * Per-clip / per-track GPU effect compute shaders for the timeline preview.
 *
 * Layer compositing (transform, blend modes, ping-pong accumulation, blit)
 * lives in the shared @nodetool-ai/gpu/webgpu engine. These compute
 * passes run beforehand to produce the per-clip effected source textures the
 * compositor then blends.
 */

/** Color-grading compute shader. */
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

/** Unsharp-mask sharpen compute shader. */
export const sharpenComputeShader = /* wgsl */ `
struct SharpenUniforms {
  amount: f32,
  threshold: f32,
  _pad: vec2<f32>,
};
struct Dimensions {
  width: u32,
  height: u32,
  _pad: vec2<u32>,
};

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> sharpen: SharpenUniforms;
@group(0) @binding(3) var<uniform> dims: Dimensions;

fn loadClamped(coords: vec2<i32>) -> vec4<f32> {
  let c = vec2<i32>(
    clamp(coords.x, 0, i32(dims.width) - 1),
    clamp(coords.y, 0, i32(dims.height) - 1)
  );
  return textureLoad(inputTexture, c, 0);
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= dims.width || gid.y >= dims.height) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let center = textureLoad(inputTexture, coords, 0);

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
  textureStore(outputTexture, coords, vec4<f32>(sharpened, center.a));
}
`;

/** Vignette compute shader — radial darken from frame center. */
export const vignetteComputeShader = /* wgsl */ `
struct VignetteUniforms {
  intensity: f32,
  radius: f32,
  softness: f32,
  _pad: f32,
};
struct Dimensions {
  width: u32,
  height: u32,
  _pad: vec2<u32>,
};

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> v: VignetteUniforms;
@group(0) @binding(3) var<uniform> dims: Dimensions;

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= dims.width || gid.y >= dims.height) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let color = textureLoad(inputTexture, coords, 0);

  // Normalize to [-1, 1] coordinates centered on the frame.
  let uv = vec2<f32>(
    (f32(gid.x) + 0.5) / f32(dims.width) * 2.0 - 1.0,
    (f32(gid.y) + 0.5) / f32(dims.height) * 2.0 - 1.0
  );
  let dist = length(uv);
  let inner = max(0.0, v.radius - v.softness);
  let outer = max(inner + 0.001, v.radius);
  let t = clamp((dist - inner) / (outer - inner), 0.0, 1.0);
  let fade = t * t * (3.0 - 2.0 * t);
  let dim = 1.0 - v.intensity * fade;
  textureStore(outputTexture, coords, vec4<f32>(color.rgb * dim, color.a));
}
`;

/**
 * Chroma key compute shader — clears pixels matching the key color, with
 * configurable tolerance, edge softness, and green-spill suppression.
 */
export const chromaKeyComputeShader = /* wgsl */ `
struct ChromaKeyUniforms {
  keyColor: vec3<f32>,
  tolerance: f32,
  softness: f32,
  spill: f32,
  _pad: vec2<f32>,
};
struct Dimensions {
  width: u32,
  height: u32,
  _pad: vec2<u32>,
};

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> ck: ChromaKeyUniforms;
@group(0) @binding(3) var<uniform> dims: Dimensions;

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= dims.width || gid.y >= dims.height) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let color = textureLoad(inputTexture, coords, 0);

  let d = length(color.rgb - ck.keyColor);
  let inner = ck.tolerance;
  let outer = ck.tolerance + max(ck.softness, 0.001);
  let mask = clamp((d - inner) / (outer - inner), 0.0, 1.0);
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
  textureStore(outputTexture, coords, vec4<f32>(rgb, outAlpha));
}
`;

/** Separable Gaussian blur compute shader (unchanged). */
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
