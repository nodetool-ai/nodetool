import type { ClipTransform } from "@nodetool-ai/timeline";

export const IDENTITY_TRANSFORM: ClipTransform = {
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 }
};

/**
 * Compute the contain-fit base scale (clip space) for a layer of given
 * source size against a canvas. Mirrors `object-fit: contain` — the longer
 * source axis fills the canvas, the other shrinks proportionally.
 */
export function containBaseScale(
  layerWidth: number,
  layerHeight: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  if (
    canvasWidth === 0 ||
    canvasHeight === 0 ||
    layerWidth === 0 ||
    layerHeight === 0
  ) {
    return { x: 1, y: 1 };
  }
  const canvasAspect = canvasWidth / canvasHeight;
  const layerAspect = layerWidth / layerHeight;
  if (layerAspect > canvasAspect) {
    return { x: 1, y: canvasAspect / layerAspect };
  }
  return { x: layerAspect / canvasAspect, y: 1 };
}

/**
 * Build a 4x4 column-major transform matrix that takes a quad with
 * positions in [-1,1]² and places it on the canvas with the layer's
 * contain-fit base scale, then the user-supplied scale / rotation /
 * position / anchor on top.
 *
 * `width` / `height` are the *reference* resolution — the sequence's pixel
 * dimensions, not the (DPR-scaled) preview canvas backing size — so a stored
 * `transform.position` means the same thing in the preview, the gizmo and
 * the offline export. Rotation is applied in pixel-aspect space (sandwich
 * A⁻¹ · R · A where A maps NDC to aspect-corrected space) so rotating a clip
 * on a non-square sequence does not shear: a square stays square under 90°.
 *
 * Position is in sequence pixels relative to the canvas center.
 * Anchor is normalized [0,1] (0.5 = quad center).
 */
export function buildTransformMatrix(
  transform: ClipTransform,
  base: { x: number; y: number },
  width: number,
  height: number
): Float32Array {
  const sx = base.x * transform.scale.x;
  const sy = base.y * transform.scale.y;
  const cos = Math.cos(transform.rotation);
  const sin = Math.sin(transform.rotation);

  // Aspect-corrected rotation: R' = A⁻¹ · R · A with A = diag(W/2, H/2)
  // (NDC → pixels). Collapses to plain R when the canvas is square.
  const aspect = width > 0 && height > 0 ? width / height : 1;
  const r00 = cos;
  const r01 = -sin / aspect;
  const r10 = sin * aspect;
  const r11 = cos;

  // Position in clip space: x = px / (W/2), y = -py / (H/2). Y is flipped
  // because canvas Y grows downward but clip-space Y grows upward.
  const tx = width === 0 ? 0 : (transform.position.x / width) * 2;
  const ty = height === 0 ? 0 : -(transform.position.y / height) * 2;

  // Anchor offset in clip space (-1..1). Default 0.5 → 0 offset.
  const ax = (transform.anchor.x - 0.5) * 2;
  const ay = (transform.anchor.y - 0.5) * 2;

  const m = new Float32Array(16);
  // Column 0
  m[0] = r00 * sx;
  m[1] = r10 * sx;
  m[2] = 0;
  m[3] = 0;
  // Column 1
  m[4] = r01 * sy;
  m[5] = r11 * sy;
  m[6] = 0;
  m[7] = 0;
  // Column 2
  m[8] = 0;
  m[9] = 0;
  m[10] = 1;
  m[11] = 0;
  // Column 3 (translation, anchor-corrected: the anchor point stays fixed
  // at its untransformed clip-space location, offset by the position).
  m[12] = tx + ax - (m[0] * ax + m[4] * ay);
  m[13] = ty + ay - (m[1] * ax + m[5] * ay);
  m[14] = 0;
  m[15] = 1;
  return m;
}

/** A 2D affine in `CanvasRenderingContext2D.setTransform` order. */
export interface CanvasAffine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * Convert a clip-space transform matrix (from {@link buildTransformMatrix}) into
 * the 2D affine that draws a `srcWidth × srcHeight` source image onto a
 * `canvasWidth × canvasHeight` Canvas2D context with the same placement the
 * WebGPU compositor produces. Use as:
 *
 *   const t = clipMatrixToCanvasAffine(m, src.w, src.h, cw, ch);
 *   ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
 *   ctx.drawImage(source, 0, 0, src.w, src.h);
 *
 * The matrix maps an NDC quad in [-1,1]² to clip space; an image pixel
 * `(ix, iy)` maps to `ndc = (2·ix/srcW − 1, 1 − 2·iy/srcH)`, then to clip space,
 * then to canvas pixels via `px = (clip.x + 1)·W/2`, `py = (1 − clip.y)·H/2`.
 * Composing those linear maps yields the affine below.
 */
export function clipMatrixToCanvasAffine(
  m: Float32Array,
  srcWidth: number,
  srcHeight: number,
  canvasWidth: number,
  canvasHeight: number
): CanvasAffine {
  const halfW = canvasWidth / 2;
  const halfH = canvasHeight / 2;
  const sw = srcWidth || 1;
  const sh = srcHeight || 1;

  return {
    a: (canvasWidth * m[0]) / sw,
    b: (-canvasHeight * m[1]) / sw,
    c: (-canvasWidth * m[4]) / sh,
    d: (canvasHeight * m[5]) / sh,
    e: halfW * (-m[0] + m[4] + m[12]) + halfW,
    f: halfH - halfH * (-m[1] + m[5] + m[13])
  };
}
