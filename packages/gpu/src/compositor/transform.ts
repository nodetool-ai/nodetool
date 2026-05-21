/**
 * Per-layer 2D transform → inverse-affine conversion.
 *
 * The Compositor places each layer on a fixed-size canvas with a position,
 * scale, and rotation. This module is the single source of truth for turning
 * that human-friendly transform into the `InverseAffine` (canvas px → layer
 * texel) the {@link WebGPULayerCompositor} blend shader consumes — so the
 * in-editor live preview and the server-side node render produce identical
 * placement.
 *
 * Convention: the transform rotates and scales the layer about its own center,
 * and `(x, y)` is where that center sits in canvas pixels. With the default
 * transform (`scale = 1`, `rotation = 0`, center at `(w/2, h/2)`) a layer's
 * top-left lands at the canvas origin — identical to an untransformed
 * top-left paste.
 */

import type { InverseAffine } from "./compositor.js";

/** Layer placement on the composite canvas. Angles are radians, CCW. */
export interface LayerTransform2D {
  /** Canvas-pixel X of the layer center. */
  x: number;
  /** Canvas-pixel Y of the layer center. */
  y: number;
  scaleX: number;
  scaleY: number;
  /** Rotation about the layer center, in radians. */
  rotation: number;
}

/** Transform that places a `width`×`height` layer's top-left at the origin. */
export function defaultLayerTransform(
  width: number,
  height: number
): LayerTransform2D {
  return {
    x: width / 2,
    y: height / 2,
    scaleX: 1,
    scaleY: 1,
    rotation: 0
  };
}

const IDENTITY: InverseAffine = { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 };

/**
 * Build the {@link InverseAffine} (canvas px → layer texel) for a layer of the
 * given pixel dimensions placed by `transform`.
 *
 * Forward map (texel → canvas): `canvas = R·S·(texel - center) + (x, y)`,
 * with `center = (width/2, height/2)`. The shader needs the inverse; degenerate
 * (zero) scales fall back to identity rather than producing NaNs.
 */
export function layerTransformToInverseAffine(
  transform: LayerTransform2D,
  width: number,
  height: number
): InverseAffine {
  const sx = transform.scaleX;
  const sy = transform.scaleY;
  if (sx === 0 || sy === 0) {
    return { ...IDENTITY };
  }
  const cos = Math.cos(transform.rotation);
  const sin = Math.sin(transform.rotation);
  const cx = width / 2;
  const cy = height / 2;

  // texel = S⁻¹·R⁻¹·(canvas - (x, y)) + center
  const a = cos / sx;
  const b = sin / sx;
  const c = -sin / sy;
  const d = cos / sy;
  return {
    a,
    b,
    tx: cx - a * transform.x - b * transform.y,
    c,
    d,
    ty: cy - c * transform.x - d * transform.y
  };
}
