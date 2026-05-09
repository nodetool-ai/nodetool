/**
 * WGSL shaders for the WebGPU compositing pipeline.
 *
 * Pipelines:
 * 1. **Checkerboard** – procedural checkerboard background.
 * 2. **Layer composite** – blits a layer texture with opacity, affine
 *    transform, and hardware source-over blend (normal blend mode fast path).
 * 3. **Blend composite** – reads both src (layer) and dst (current composite)
 *    textures and applies standard blend modes in the shader. Used for
 *    non-normal blend modes (multiply, screen, overlay, etc.).
 * 4. **Blit** – copies the intermediate composite texture to the swap chain.
 * 5. **Border** – 1px outline around the canvas boundary.
 */

// ─── Shared full-screen-quad vertex shader ────────────────────────────────

export const FULLSCREEN_QUAD_VERTEX = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Full-screen triangle strip: 4 vertices → 2 triangles covering NDC [-1,1]
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

// ─── Checkerboard fragment shader ─────────────────────────────────────────

export const CHECKERBOARD_FRAGMENT = /* wgsl */ `
struct CheckerboardUniforms {
  canvasSize: vec2f,
  cellSize: f32,
  _pad: f32,
  colorA: vec4f,
  colorB: vec4f,
};

@group(0) @binding(0) var<uniform> params: CheckerboardUniforms;

@fragment
fn fs_checkerboard(@location(0) uv: vec2f) -> @location(0) vec4f {
  let pixel = uv * params.canvasSize;
  let checker = floor(pixel / vec2f(params.cellSize));
  let isEven = (i32(checker.x) + i32(checker.y)) % 2 == 0;
  return select(params.colorB, params.colorA, isEven);
}
`;

// ─── Shared: inverse-affine layer sampling ────────────────────────────────
//
// Both the normal layer shader and the blend composite shader need to map
// screen UV → layer texel via a 2×3 inverse affine matrix. The matrix is
// passed as two vec4f rows: invRow0 = (a, b, tx, 0), invRow1 = (c, d, ty, 0).
//
// The function is inlined into both shaders via string concatenation.

const SAMPLE_LAYER_WGSL = /* wgsl */ `
fn sampleLayerTexel(uv: vec2f, canvasSize: vec2f, invRow0: vec4f, invRow1: vec4f, tex: texture_2d<f32>) -> vec4f {
  let px = uv * canvasSize;
  let texel = vec2f(
    invRow0.x * px.x + invRow0.y * px.y + invRow0.z,
    invRow1.x * px.x + invRow1.y * px.y + invRow1.z
  );
  let dims = textureDimensions(tex);
  let dimsF = vec2f(f32(dims.x), f32(dims.y));
  if (texel.x < 0.0 || texel.x >= dimsF.x || texel.y < 0.0 || texel.y >= dimsF.y) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }
  let ix = i32(clamp(floor(texel.x), 0.0, max(dimsF.x - 1.0, 0.0)));
  let iy = i32(clamp(floor(texel.y), 0.0, max(dimsF.y - 1.0, 0.0)));
  return textureLoad(tex, vec2i(ix, iy), 0);
}
`;

// ─── Layer composite fragment shader (normal blend, hardware source-over) ─

export const LAYER_COMPOSITE_FRAGMENT = /* wgsl */ `
struct LayerUniforms {
  // x: opacity, y: canvasW, z: canvasH, w: unused
  params0: vec4f,
  // inverse affine row 0: a, b, tx, unused
  invRow0: vec4f,
  // inverse affine row 1: c, d, ty, unused
  invRow1: vec4f,
};

@group(0) @binding(0) var<uniform> layer: LayerUniforms;
@group(0) @binding(1) var layerTexture: texture_2d<f32>;

${SAMPLE_LAYER_WGSL}

@fragment
fn fs_layer(@location(0) uv: vec2f) -> @location(0) vec4f {
  let opacity = layer.params0.x;
  let canvasSize = layer.params0.yz;
  let color = sampleLayerTexel(uv, canvasSize, layer.invRow0, layer.invRow1, layerTexture);
  return vec4f(color.rgb, color.a * opacity);
}
`;

// ─── Blend mode implementations (W3C compositing spec) ────────────────────

const BLEND_MODES_WGSL = /* wgsl */ `
// Blend mode IDs (must match BLEND_MODE_ID map in WebGPURuntime.ts):
// 0 = normal, 1 = multiply, 2 = screen, 3 = overlay, 4 = darken,
// 5 = lighten, 6 = color-dodge, 7 = color-burn, 8 = hard-light,
// 9 = soft-light, 10 = difference, 11 = exclusion

fn softLightD(x: f32) -> f32 {
  if (x <= 0.25) {
    return ((16.0 * x - 12.0) * x + 4.0) * x;
  }
  return sqrt(x);
}

fn blendChannel(s: f32, d: f32, mode: u32) -> f32 {
  switch (mode) {
    case 0u: { return s; }
    case 1u: { return s * d; }
    case 2u: { return s + d - s * d; }
    case 3u: {
      return select(
        1.0 - 2.0 * (1.0 - s) * (1.0 - d),
        2.0 * s * d,
        d <= 0.5
      );
    }
    case 4u: { return min(s, d); }
    case 5u: { return max(s, d); }
    case 6u: {
      return select(
        min(1.0, d / max(1.0 - s, 0.001)),
        1.0,
        s >= 1.0
      );
    }
    case 7u: {
      return select(
        max(0.0, 1.0 - (1.0 - d) / max(s, 0.001)),
        0.0,
        s <= 0.0
      );
    }
    case 8u: {
      return select(
        1.0 - 2.0 * (1.0 - s) * (1.0 - d),
        2.0 * s * d,
        s <= 0.5
      );
    }
    case 9u: {
      return select(
        d + (2.0 * s - 1.0) * (softLightD(d) - d),
        d - (1.0 - 2.0 * s) * d * (1.0 - d),
        s <= 0.5
      );
    }
    case 10u: { return abs(s - d); }
    case 11u: { return s + d - 2.0 * s * d; }
    default: { return s; }
  }
}

fn applyBlendMode(src: vec3f, dst: vec3f, mode: u32) -> vec3f {
  return vec3f(
    blendChannel(src.x, dst.x, mode),
    blendChannel(src.y, dst.y, mode),
    blendChannel(src.z, dst.z, mode)
  );
}
`;

// ─── Blend composite fragment shader (non-normal blend modes) ─────────────

export const BLEND_COMPOSITE_FRAGMENT = /* wgsl */ `
struct BlendUniforms {
  // x: opacity, y: blendMode (as f32), z: canvasW, w: canvasH
  params0: vec4f,
  // inverse affine row 0: a, b, tx, unused
  invRow0: vec4f,
  // inverse affine row 1: c, d, ty, unused
  invRow1: vec4f,
};

@group(0) @binding(0) var<uniform> u: BlendUniforms;
@group(0) @binding(1) var srcTexture: texture_2d<f32>;
@group(0) @binding(2) var dstTexture: texture_2d<f32>;

${SAMPLE_LAYER_WGSL}
${BLEND_MODES_WGSL}

@fragment
fn fs_blend(@location(0) uv: vec2f) -> @location(0) vec4f {
  let opacity = u.params0.x;
  let blendMode = u32(u.params0.y);
  let canvasSize = u.params0.zw;

  // Read destination (current composite copy)
  let dstDims = textureDimensions(dstTexture);
  let dstPx = vec2i(
    i32(clamp(floor(uv.x * f32(dstDims.x)), 0.0, f32(dstDims.x) - 1.0)),
    i32(clamp(floor(uv.y * f32(dstDims.y)), 0.0, f32(dstDims.y) - 1.0))
  );
  let dst = textureLoad(dstTexture, dstPx, 0);

  // Sample source layer via inverse affine transform
  let srcRaw = sampleLayerTexel(uv, canvasSize, u.invRow0, u.invRow1, srcTexture);

  // Apply layer opacity
  let sa = srcRaw.a * opacity;
  if (sa <= 0.0) { return dst; }

  let da = dst.a;
  let sc = srcRaw.rgb;
  let dc = dst.rgb;

  // Apply blend function B(Cs, Cd)
  let blended = applyBlendMode(sc, dc, blendMode);

  // Standard compositing formula (W3C):
  // Co = αs × (1 - αd) × Cs + αs × αd × B(Cs, Cd) + (1 - αs) × αd × Cd
  // αo = αs + αd × (1 - αs)
  let co = sa * (1.0 - da) * sc + sa * da * blended + (1.0 - sa) * da * dc;
  let ao = sa + da * (1.0 - sa);

  return vec4f(co, ao);
}
`;

// ─── Blit fragment shader (composite → swap chain) ────────────────────────

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

// ─── Selection marching-ants fragment shader ─────────────────────────────
//
// Renders animated ants on selected-region boundaries.
// The framebuffer is document-pixel resolution (canvas width/height = doc.canvas);
// zoom must match SketchCanvasPresentation scale(zoom) for this composite (passed
// in via viewportZoom on compositeToDisplay so rAF never uses a stale default).
// Dash length stays ~constant in screen px (dashLenDoc = 4/z). Phase marches tangentially:
// projecting doc position onto a boundary tangent (orthogonal to summed outward normals).
// Do NOT use (local.x + local.y) — that draws diagonal zebra stripes unrelated to contour.
//
// Bind group:
//   0 — AntsUniforms (uniform buffer)
//   1 — maskTexture (r8unorm, textureLoad — no sampler needed)

export const SELECTION_ANTS_FRAGMENT = /* wgsl */ `
struct AntsUniforms {
  canvasSize: vec2f,
  maskOrigin: vec2f,
  maskDims:   vec2f,
  phase:      f32,
  zoom:       f32,
};

@group(0) @binding(0) var<uniform> u: AntsUniforms;
@group(0) @binding(1) var maskTex: texture_2d<f32>;

fn sampleMask(coord: vec2i, dims: vec2i) -> f32 {
  if (coord.x < 0 || coord.y < 0 || coord.x >= dims.x || coord.y >= dims.y) {
    return 0.0;
  }
  return textureLoad(maskTex, coord, 0).r;
}

@fragment
fn fs_ants(@location(0) uv: vec2f) -> @location(0) vec4f {
  let docPos = uv * u.canvasSize;
  let local  = docPos - u.maskOrigin;
  let maskCoord = vec2i(i32(floor(local.x)), i32(floor(local.y)));
  let dims      = vec2i(textureDimensions(maskTex));

  let center = sampleMask(maskCoord, dims);
  let THRESH = 0.5;
  let isSel  = center >= THRESH;

  let nf = sampleMask(maskCoord + vec2i( 0, -1), dims);
  let sf = sampleMask(maskCoord + vec2i( 0,  1), dims);
  let ef = sampleMask(maskCoord + vec2i( 1,  0), dims);
  let wf = sampleMask(maskCoord + vec2i(-1,  0), dims);
  let isEdge = isSel && (nf < THRESH || sf < THRESH || ef < THRESH || wf < THRESH);

  if (!isEdge) { return vec4f(0.0); }

  // Outward normal from selected interior toward any unselected 4-neighbor.
  var nx = 0.0;
  var ny = 0.0;
  if (nf < THRESH) { ny -= 1.0; }
  if (sf < THRESH) { ny += 1.0; }
  if (wf < THRESH) { nx -= 1.0; }
  if (ef < THRESH) { nx += 1.0; }
  let nlen = length(vec2(nx, ny));
  if (nlen < 1e-3) { return vec4f(0.0); }
  nx = nx / nlen;
  ny = ny / nlen;
  let tx = -ny;
  let ty = nx;
  let phaseAlong = local.x * tx + local.y * ty;

  let z = clamp(u.zoom, 0.02, 128.0);
  var dashLenDoc = 4.0 / z;
  dashLenDoc = clamp(dashLenDoc, 0.035, 120.0);

  let stripe = fract(phaseAlong / (2.0 * dashLenDoc) + u.phase);
  let isLit = stripe < 0.5;

  let lit = vec3f(170.0 / 255.0, 170.0 / 255.0, 170.0 / 255.0);
  let drk = vec3f(0.0, 0.0, 0.0);
  if (isLit) {
    return vec4f(lit, 1.0);
  }
  return vec4f(drk, 1.0);
}
`;

// ─── Border fragment shader ───────────────────────────────────────────────

export const BORDER_FRAGMENT = /* wgsl */ `
struct BorderUniforms {
  canvasSize: vec2f,
  lineWidth: f32,
  _pad: f32,
  color: vec4f,
};

@group(0) @binding(0) var<uniform> border: BorderUniforms;

@fragment
fn fs_border(@location(0) uv: vec2f) -> @location(0) vec4f {
  let pixel = uv * border.canvasSize;
  let dist = min(
    min(pixel.x, border.canvasSize.x - pixel.x),
    min(pixel.y, border.canvasSize.y - pixel.y)
  );
  if (dist <= border.lineWidth) {
    return border.color;
  }
  return vec4f(0.0, 0.0, 0.0, 0.0);
}
`;
