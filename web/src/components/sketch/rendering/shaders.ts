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
// Drawn onto a screen-resolution overlay and mapped back into document space so
// committed ants keep a Canvas-like on-screen stroke width and dash cadence.

export const SELECTION_ANTS_FRAGMENT = /* wgsl */ `
struct AntsUniforms {
  canvasSize: vec2f,
  maskOrigin: vec2f,
  maskDims:   vec2f,
  viewportSizePx: vec2f,
  viewportOffsetPx: vec2f,
  panPx: vec2f,
  params: vec4f,
};

@group(0) @binding(0) var<uniform> u: AntsUniforms;
@group(0) @binding(1) var maskTex: texture_2d<f32>;

fn sampleMask(coord: vec2i, dims: vec2i) -> f32 {
  if (coord.x < 0 || coord.y < 0 || coord.x >= dims.x || coord.y >= dims.y) {
    return 0.0;
  }
  return textureLoad(maskTex, coord, 0).r;
}

fn compositePremul(bottom: vec4f, topColor: vec3f, topAlpha: f32) -> vec4f {
  let a = clamp(topAlpha, 0.0, 1.0);
  return vec4f(
    topColor * a + bottom.rgb * (1.0 - a),
    a + bottom.a * (1.0 - a)
  );
}

fn coverage(distPx: f32, lineWidthPx: f32, aaPx: f32) -> f32 {
  let halfWidth = max(lineWidthPx * 0.5, 0.0);
  return smoothstep(halfWidth + aaPx, max(halfWidth - aaPx, 0.0), distPx);
}

@fragment
fn fs_ants(@location(0) uv: vec2f) -> @location(0) vec4f {
  let EDGE_MARGIN_DOC = 1.0;
  let CORE_WIDTH_IN_PX = 1.0;
  let CORE_WIDTH_OUT_PX = 2.0;
  let MIN_AA_PX = 0.75;
  let AA_DPR_SCALE = 0.6;
  let OUTER_HALO_WIDTH_PX = 10.0;
  let OUTER_HALO_ALPHA = 0.05;
  let MID_HALO_WIDTH_PX = 6.0;
  let MID_HALO_ALPHA = 0.08;
  let INNER_HALO_WIDTH_PX = 3.0;
  let INNER_HALO_ALPHA = 0.045;
  let INNER_HALO_COLOR = vec3f(30.0 / 255.0, 30.0 / 255.0, 38.0 / 255.0);

  let overlaySizePx = u.viewportSizePx + 2.0 * u.viewportOffsetPx;
  let overlayPosPx = uv * overlaySizePx;
  let zoom = max(u.params.y, 1e-4);
  let dpr = max(u.params.z, 1.0);
  let docCenterPx = u.viewportOffsetPx + 0.5 * u.viewportSizePx + u.panPx;
  let docPos = (overlayPosPx - docCenterPx) / (zoom * dpr) + 0.5 * u.canvasSize;
  let local  = docPos - u.maskOrigin;
  let dims   = vec2i(textureDimensions(maskTex));
  let dimsF  = vec2f(f32(dims.x), f32(dims.y));

  if (
    local.x < -EDGE_MARGIN_DOC ||
    local.y < -EDGE_MARGIN_DOC ||
    local.x > dimsF.x + EDGE_MARGIN_DOC ||
    local.y > dimsF.y + EDGE_MARGIN_DOC
  ) {
    return vec4f(0.0);
  }

  let cx = floor(local.x);
  let cy = floor(local.y);
  let maskCoord = vec2i(i32(cx), i32(cy));
  let localFrac = local - vec2f(cx, cy);

  let THRESH = 0.5;
  let c  = sampleMask(maskCoord, dims);
  let insC = c >= THRESH;

  let nf = sampleMask(maskCoord + vec2i(0, -1), dims);
  let sf = sampleMask(maskCoord + vec2i(0,  1), dims);
  let ef = sampleMask(maskCoord + vec2i(1,  0), dims);
  let wf = sampleMask(maskCoord + vec2i(-1, 0), dims);

  var dEdge = 1e9;
  if ((insC != (nf >= THRESH))) {
    dEdge = min(dEdge, abs(localFrac.y));
  }
  if ((insC != (sf >= THRESH))) {
    dEdge = min(dEdge, abs(localFrac.y - 1.0));
  }
  if ((insC != (wf >= THRESH))) {
    dEdge = min(dEdge, abs(localFrac.x));
  }
  if ((insC != (ef >= THRESH))) {
    dEdge = min(dEdge, abs(localFrac.x - 1.0));
  }

  if (dEdge >= 900.0) {
    return vec4f(0.0);
  }

  let distPx = dEdge * zoom * dpr;
  let coreWidthPx = select(CORE_WIDTH_IN_PX, CORE_WIDTH_OUT_PX, zoom < 1.0) * dpr;
  let aaPx = max(MIN_AA_PX, AA_DPR_SCALE * dpr);

  let gx =
    select(0.0, 1.0, ef >= THRESH) -
    select(0.0, 1.0, wf >= THRESH);
  let gy =
    select(0.0, 1.0, sf >= THRESH) -
    select(0.0, 1.0, nf >= THRESH);
  let glenRaw = length(vec2(gx, gy));
  var phaseAlong = docPos.x;
  if (glenRaw >= 1e-3) {
    let tx = -gy / glenRaw;
    let ty = gx / glenRaw;
    phaseAlong = docPos.x * tx + docPos.y * ty;
  }

  let phaseAlongPx = phaseAlong * zoom * dpr;
  let dashLenPx = 4.0 * dpr;
  let offsetPx = -(u.params.x / 32.0) * dashLenPx * 2.0;
  let stripe = fract((phaseAlongPx + offsetPx) / (2.0 * dashLenPx));
  let isLit = stripe < 0.5;

  let lit = vec3f(170.0 / 255.0, 170.0 / 255.0, 170.0 / 255.0);
  let drk = vec3f(0.0, 0.0, 0.0);
  let coreColor = select(drk, lit, isLit);

  var out = vec4f(0.0);
  out = compositePremul(out, vec3f(1.0, 1.0, 1.0), OUTER_HALO_ALPHA * coverage(distPx, OUTER_HALO_WIDTH_PX * dpr, aaPx));
  out = compositePremul(out, vec3f(1.0, 1.0, 1.0), MID_HALO_ALPHA * coverage(distPx, MID_HALO_WIDTH_PX * dpr, aaPx));
  out = compositePremul(out, INNER_HALO_COLOR, INNER_HALO_ALPHA * coverage(distPx, INNER_HALO_WIDTH_PX * dpr, aaPx));
  out = compositePremul(out, coreColor, coverage(distPx, coreWidthPx, aaPx));
  if (out.a <= 1e-4) {
    return vec4f(0.0);
  }
  return out;
}

// ─── Selection mask overlay (rubylith) ───────────────────────────────────
// Renders red @ 50% over UNSELECTED pixels (where mask < 0.5).
// Feathered edges produce partial coverage so soft selections are visible.
// Premultiplied output to match the swap-chain's premultiplied alpha mode.
@fragment
fn fs_mask_overlay(@location(0) uv: vec2f) -> @location(0) vec4f {
  let overlaySizePx = u.viewportSizePx + 2.0 * u.viewportOffsetPx;
  let overlayPosPx = uv * overlaySizePx;
  let zoom = max(u.params.y, 1e-4);
  let dpr = max(u.params.z, 1.0);
  let docCenterPx = u.viewportOffsetPx + 0.5 * u.viewportSizePx + u.panPx;
  let docPos = (overlayPosPx - docCenterPx) / (zoom * dpr) + 0.5 * u.canvasSize;
  let local  = docPos - u.maskOrigin;
  let dims   = vec2i(textureDimensions(maskTex));
  let dimsF  = vec2f(f32(dims.x), f32(dims.y));

  // Outside the document → no overlay (let canvas chrome show through).
  if (
    local.x < 0.0 || local.y < 0.0 ||
    local.x >= u.canvasSize.x || local.y >= u.canvasSize.y
  ) {
    return vec4f(0.0);
  }

  // Outside the mask buffer (but inside document) = unselected = full overlay.
  // Sample-and-clamp behavior covers the typical case where the mask covers
  // the document; this branch handles partial-doc mask sizes safely.
  var selAlpha = 0.0;
  if (
    local.x >= 0.0 && local.y >= 0.0 &&
    local.x < dimsF.x && local.y < dimsF.y
  ) {
    let cx = i32(floor(local.x));
    let cy = i32(floor(local.y));
    selAlpha = sampleMask(vec2i(cx, cy), dims);
  }

  let RED = vec3f(1.0, 0.0, 0.0);
  let MAX_ALPHA = 0.5;
  let alpha = (1.0 - selAlpha) * MAX_ALPHA;
  return vec4f(RED * alpha, alpha);
}
`;
