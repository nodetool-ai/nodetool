/**
 * Sketch-specific WGSL fragment shaders: the checkerboard background, the
 * selection marching-ants / mask overlay, and the selection-mask refine
 * (blur / dilate / erode) passes.
 *
 * Layer compositing (blend modes, inverse-affine sampling, ping-pong
 * accumulation, blit) lives in the shared @nodetool-ai/gpu/webgpu
 * engine. These fragments are concatenated with that engine's exported
 * `FULLSCREEN_QUAD_VERTEX` at pipeline-build time.
 */

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
  // Outside the document → no overlay (let canvas chrome show through).
  // NOTE: bounds check uses docPos (document-space), NOT local
  // (selection-mask-relative). When the mask origin is non-zero (e.g. a
  // trimmed selection at (100, 50)), local is offset from the document
  // origin and would incorrectly carve a hole in the overlay at the
  // selection position instead of clipping at the canvas edges.
  if (
    docPos.x < 0.0 || docPos.y < 0.0 ||
    docPos.x >= u.canvasSize.x || docPos.y >= u.canvasSize.y
  ) {
    return vec4f(0.0);
  }

  let local  = docPos - u.maskOrigin;
  let dims   = vec2i(textureDimensions(maskTex));
  let dimsF  = vec2f(f32(dims.x), f32(dims.y));

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

// ─── Selection mask refine — separable box blur ─────────────────────────
//
// Two fragment entry points for separable filtering on the r8unorm mask
// texture. Box-blur ×N passes ≈ Gaussian (matches CPU `featherMaskAlpha`,
// which runs 3 passes with radius ≈ feather/2). Each pass reads the input
// through a linear sampler with clamp-to-edge addressing, writes a single
// r-channel value. The vertex stage is the shared fullscreen quad.
//
// Bindings (must match the pipeline layout in WebGPURuntime.initPipelines):
//   @binding(0) uniform: params = (radius, texelStepX, texelStepY, _)
//     radius is integer pixels; texelStep* is 1/dim in UV units.
//   @binding(1) input r8unorm texture (sampled)
//   @binding(2) linear sampler with clamp-to-edge
export const MASK_BLUR_FRAGMENT = /* wgsl */ `
struct MaskBlurUniforms {
  // x: radius (px, integer), y: texelStepX (uv), z: texelStepY (uv), w: unused
  params: vec4f,
};

@group(0) @binding(0) var<uniform> u: MaskBlurUniforms;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var inputSampler: sampler;

@fragment
fn fs_mask_blur_h(@location(0) uv: vec2f) -> @location(0) vec4f {
  let r = i32(u.params.x);
  let step = u.params.y;
  var sum = 0.0;
  var count = 0.0;
  for (var i = -r; i <= r; i = i + 1) {
    let s = vec2f(uv.x + f32(i) * step, uv.y);
    sum = sum + textureSampleLevel(inputTex, inputSampler, s, 0.0).r;
    count = count + 1.0;
  }
  return vec4f(sum / count, 0.0, 0.0, 0.0);
}

@fragment
fn fs_mask_blur_v(@location(0) uv: vec2f) -> @location(0) vec4f {
  let r = i32(u.params.x);
  let step = u.params.z;
  var sum = 0.0;
  var count = 0.0;
  for (var i = -r; i <= r; i = i + 1) {
    let s = vec2f(uv.x, uv.y + f32(i) * step);
    sum = sum + textureSampleLevel(inputTex, inputSampler, s, 0.0).r;
    count = count + 1.0;
  }
  return vec4f(sum / count, 0.0, 0.0, 0.0);
}

// ─── Separable morphological dilate (expand) and erode (contract) ────────
//
// Per-pixel max (dilate) or min (erode) over a (2r+1)-tap line along the
// pass axis. Done as two passes (H then V) for an O(r) kernel rather than
// O(r²) full-rectangle structuring element. Uses textureLoad with explicit
// integer coords (clamped to texture bounds) because linear filtering is
// not meaningful for non-linear reductions like max/min — the box-blur
// sampler trick used by feather does not apply here.
//
// The inputSampler binding is declared by the shared module above but
// is unused in these entry points; the pipeline layout requires it so we
// still provide a sampler at bind time.

fn loadPixel(coord: vec2i, dims: vec2i) -> f32 {
  let c = clamp(coord, vec2i(0, 0), dims - vec2i(1, 1));
  return textureLoad(inputTex, c, 0).r;
}

@fragment
fn fs_mask_dilate_h(@location(0) uv: vec2f) -> @location(0) vec4f {
  let r = i32(u.params.x);
  let dims = vec2i(textureDimensions(inputTex));
  let center = vec2i(
    i32(floor(uv.x * f32(dims.x))),
    i32(floor(uv.y * f32(dims.y)))
  );
  var m = 0.0;
  for (var i = -r; i <= r; i = i + 1) {
    m = max(m, loadPixel(center + vec2i(i, 0), dims));
  }
  return vec4f(m, 0.0, 0.0, 0.0);
}

@fragment
fn fs_mask_dilate_v(@location(0) uv: vec2f) -> @location(0) vec4f {
  let r = i32(u.params.x);
  let dims = vec2i(textureDimensions(inputTex));
  let center = vec2i(
    i32(floor(uv.x * f32(dims.x))),
    i32(floor(uv.y * f32(dims.y)))
  );
  var m = 0.0;
  for (var i = -r; i <= r; i = i + 1) {
    m = max(m, loadPixel(center + vec2i(0, i), dims));
  }
  return vec4f(m, 0.0, 0.0, 0.0);
}

@fragment
fn fs_mask_erode_h(@location(0) uv: vec2f) -> @location(0) vec4f {
  let r = i32(u.params.x);
  let dims = vec2i(textureDimensions(inputTex));
  let center = vec2i(
    i32(floor(uv.x * f32(dims.x))),
    i32(floor(uv.y * f32(dims.y)))
  );
  var m = 1.0;
  for (var i = -r; i <= r; i = i + 1) {
    m = min(m, loadPixel(center + vec2i(i, 0), dims));
  }
  return vec4f(m, 0.0, 0.0, 0.0);
}

@fragment
fn fs_mask_erode_v(@location(0) uv: vec2f) -> @location(0) vec4f {
  let r = i32(u.params.x);
  let dims = vec2i(textureDimensions(inputTex));
  let center = vec2i(
    i32(floor(uv.x * f32(dims.x))),
    i32(floor(uv.y * f32(dims.y)))
  );
  var m = 1.0;
  for (var i = -r; i <= r; i = i + 1) {
    m = min(m, loadPixel(center + vec2i(0, i), dims));
  }
  return vec4f(m, 0.0, 0.0, 0.0);
}
`;
