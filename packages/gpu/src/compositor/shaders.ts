/**
 * Shared WebGPU compositing shaders.
 *
 * These power the single layer-compositing engine used by both the sketch
 * editor and the timeline preview. The pipeline is:
 *
 *   background → (per layer: blend pass into ping-pong) → blit to target
 *
 * Each layer renders a full-screen quad; the fragment shader maps the
 * screen UV back into the layer texture via a 2×3 inverse-affine matrix,
 * samples the layer (nearest or linear), optionally applies a rounded-rect
 * mask, and composites it over the current accumulation using the W3C
 * compositing formula and the shared blend functions.
 *
 * The `nearest` + `radius == 0` path is identical to the sketch editor's
 * historical blend-composite shader, so migrating sketch onto this engine
 * does not change its output. `linear` sampling and the rounded-rect mask
 * are opt-in via uniforms (used by the timeline for scaled video clips).
 */

import { WGSL_BLEND_FUNCTIONS } from "../blend/wgsl.js";

// ─── Full-screen quad vertex shader (4-vertex triangle strip) ─────────────

export const FULLSCREEN_QUAD_VERTEX = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2f, 4>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0,  1.0),
  );
  var uv = array<vec2f, 4>(
    vec2f(0.0, 1.0),
    vec2f(1.0, 1.0),
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
  );
  var out: VertexOutput;
  out.position = vec4f(pos[vertexIndex], 0.0, 1.0);
  out.uv = uv[vertexIndex];
  return out;
}
`;

// ─── Blend composite fragment shader ──────────────────────────────────────
//
// Uniform layout (4 × vec4f = 64 bytes):
//   params0: opacity, blendMode (as f32), canvasW, canvasH
//   invRow0: a, b, tx, _   (inverse affine row 0: screen px → layer texel)
//   invRow1: c, d, ty, _   (inverse affine row 1)
//   params1: borderRadius (normalized 0..0.5), smoothness, filterMode, _
//     filterMode: 0 = nearest (textureLoad), 1 = linear (sampler)

export const BLEND_COMPOSITE_FRAGMENT = /* wgsl */ `
struct BlendUniforms {
  params0: vec4f,
  invRow0: vec4f,
  invRow1: vec4f,
  params1: vec4f,
};

@group(0) @binding(0) var<uniform> u: BlendUniforms;
@group(0) @binding(1) var srcTexture: texture_2d<f32>;
@group(0) @binding(2) var dstTexture: texture_2d<f32>;
@group(0) @binding(3) var srcSampler: sampler;

${WGSL_BLEND_FUNCTIONS}

fn sdRoundedRect(p: vec2f, b: vec2f, r: f32) -> f32 {
  let q = abs(p) - b + vec2f(r);
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2f(0.0))) - r;
}

@fragment
fn fs_blend(@location(0) uv: vec2f) -> @location(0) vec4f {
  let opacity = u.params0.x;
  let blendMode = u32(u.params0.y);
  let canvasSize = u.params0.zw;
  let radius = u.params1.x;
  let smoothness = u.params1.y;
  let filterMode = u32(u.params1.z);

  // Destination = current accumulation, sampled at the screen UV (1:1).
  let dstDims = textureDimensions(dstTexture);
  let dstPx = vec2i(
    i32(clamp(floor(uv.x * f32(dstDims.x)), 0.0, f32(dstDims.x) - 1.0)),
    i32(clamp(floor(uv.y * f32(dstDims.y)), 0.0, f32(dstDims.y) - 1.0))
  );
  let dst = textureLoad(dstTexture, dstPx, 0);

  // Map screen UV → layer texel via inverse affine.
  let px = uv * canvasSize;
  let texel = vec2f(
    u.invRow0.x * px.x + u.invRow0.y * px.y + u.invRow0.z,
    u.invRow1.x * px.x + u.invRow1.y * px.y + u.invRow1.z
  );
  let dims = textureDimensions(srcTexture);
  let dimsF = vec2f(f32(dims.x), f32(dims.y));

  if (texel.x < 0.0 || texel.x >= dimsF.x || texel.y < 0.0 || texel.y >= dimsF.y) {
    return dst;
  }

  var srcRaw: vec4f;
  if (filterMode == 1u) {
    srcRaw = textureSampleLevel(srcTexture, srcSampler, texel / dimsF, 0.0);
  } else {
    let ix = i32(clamp(floor(texel.x), 0.0, max(dimsF.x - 1.0, 0.0)));
    let iy = i32(clamp(floor(texel.y), 0.0, max(dimsF.y - 1.0, 0.0)));
    srcRaw = textureLoad(srcTexture, vec2i(ix, iy), 0);
  }

  var sa = srcRaw.a * opacity;

  // Optional rounded-rect mask in layer-local [-1, 1] space.
  if (radius > 0.0) {
    let local = (texel / dimsF) * 2.0 - vec2f(1.0);
    let aspect = select(dimsF.x / dimsF.y, 1.0, dimsF.y == 0.0);
    var p = local;
    if (aspect > 1.0) {
      p.y = p.y / aspect;
    } else {
      p.x = p.x * aspect;
    }
    let halfSize = vec2f(min(1.0, aspect), min(1.0, 1.0 / aspect));
    let r = clamp(radius, 0.0, 0.5) * 2.0 * min(halfSize.x, halfSize.y);
    let dist = sdRoundedRect(p, halfSize, r);
    let mask = 1.0 - smoothstep(-smoothness, smoothness, dist);
    sa = sa * mask;
  }

  if (sa <= 0.0) {
    return dst;
  }

  let da = dst.a;
  let sc = srcRaw.rgb;
  let dc = dst.rgb;
  let blended = applyBlendMode(sc, dc, blendMode);

  // W3C compositing:
  //   Co = αs(1 - αd)·Cs + αs·αd·B(Cs, Cd) + (1 - αs)·αd·Cd
  //   αo = αs + αd(1 - αs)
  let co = sa * (1.0 - da) * sc + sa * da * blended + (1.0 - sa) * da * dc;
  let ao = sa + da * (1.0 - sa);
  return vec4f(co, ao);
}
`;

// ─── Blit fragment shader (composite → target/swap chain) ─────────────────

export const BLIT_FRAGMENT = /* wgsl */ `
@group(0) @binding(0) var blitTexture: texture_2d<f32>;

@fragment
fn fs_blit(@location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = textureDimensions(blitTexture);
  let px = vec2i(
    i32(clamp(floor(uv.x * f32(dims.x)), 0.0, f32(dims.x) - 1.0)),
    i32(clamp(floor(uv.y * f32(dims.y)), 0.0, f32(dims.y) - 1.0))
  );
  return textureLoad(blitTexture, px, 0);
}
`;

// ─── Un-premultiply resolve fragment (premultiplied → straight alpha) ──────
//
// The blend pipeline accumulates premultiplied color. Headless readback wants
// straight (non-premultiplied) RGBA for a faithful PNG encode, so this pass
// divides RGB by alpha on the GPU — replacing a per-pixel CPU loop over the
// whole readback. Pairs with `FULLSCREEN_QUAD_VERTEX` (`vs_main`).

export const UNPREMULTIPLY_FRAGMENT = /* wgsl */ `
@group(0) @binding(0) var srcTexture: texture_2d<f32>;

@fragment
fn fs_unpremultiply(@location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = textureDimensions(srcTexture);
  let px = vec2i(
    i32(clamp(floor(uv.x * f32(dims.x)), 0.0, f32(dims.x) - 1.0)),
    i32(clamp(floor(uv.y * f32(dims.y)), 0.0, f32(dims.y) - 1.0))
  );
  let c = textureLoad(srcTexture, px, 0);
  if (c.a <= 0.0) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }
  return vec4f(c.rgb / c.a, c.a);
}
`;
