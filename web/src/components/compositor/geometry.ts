/**
 * Gizmo geometry for the Compositor layer editor.
 *
 * All math is in **canvas space** (pixels of the composite, [0,W]×[0,H]). The
 * forward placement here is the inverse of the shared
 * `layerTransformToInverseAffine` in `@nodetool-ai/gpu` — same convention
 * (rotate/scale about the layer center, `(x,y)` is the center in canvas px),
 * so what the gizmo draws matches what the node renders.
 */

import type { LayerTransform2D } from "@nodetool-ai/gpu/webgpu";

export interface Vec2 {
  x: number;
  y: number;
}

/** Handles a layer can be manipulated by. */
export type GizmoHandle =
  | "move"
  | "rotate"
  | "tl"
  | "tr"
  | "br"
  | "bl"
  | "t"
  | "b"
  | "l"
  | "r";

const MIN_SCALE = 0.02;

/** Map a layer-local texel (lx, ly) to canvas px under `t`. */
export function layerTexelToCanvas(
  t: LayerTransform2D,
  width: number,
  height: number,
  lx: number,
  ly: number
): Vec2 {
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  const px = (lx - width / 2) * t.scaleX;
  const py = (ly - height / 2) * t.scaleY;
  return { x: cos * px - sin * py + t.x, y: sin * px + cos * py + t.y };
}

/** Inverse of {@link layerTexelToCanvas}: canvas px → layer-local texel. */
export function canvasToLayerTexel(
  t: LayerTransform2D,
  width: number,
  height: number,
  cx: number,
  cy: number
): Vec2 {
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  const dx = cx - t.x;
  const dy = cy - t.y;
  // R⁻¹
  const rx = cos * dx + sin * dy;
  const ry = -sin * dx + cos * dy;
  const sx = t.scaleX || 1;
  const sy = t.scaleY || 1;
  return { x: rx / sx + width / 2, y: ry / sy + height / 2 };
}

/** The four canvas-space corners of a placed layer (TL, TR, BR, BL). */
export function layerCorners(
  t: LayerTransform2D,
  width: number,
  height: number
): [Vec2, Vec2, Vec2, Vec2] {
  return [
    layerTexelToCanvas(t, width, height, 0, 0),
    layerTexelToCanvas(t, width, height, width, 0),
    layerTexelToCanvas(t, width, height, width, height),
    layerTexelToCanvas(t, width, height, 0, height)
  ];
}

/** Midpoint of two points. */
export function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Is canvas-space point `p` inside the (possibly rotated) layer quad? */
export function pointInLayer(
  t: LayerTransform2D,
  width: number,
  height: number,
  p: Vec2
): boolean {
  const local = canvasToLayerTexel(t, width, height, p.x, p.y);
  return local.x >= 0 && local.x <= width && local.y >= 0 && local.y <= height;
}

/** Translate the layer center by a canvas-space delta. */
export function applyMove(
  t: LayerTransform2D,
  dx: number,
  dy: number
): LayerTransform2D {
  return { ...t, x: t.x + dx, y: t.y + dy };
}

/**
 * Set rotation so the layer center→cursor ray points where the cursor is,
 * carrying the grab offset captured at drag start.
 */
export function applyRotate(
  start: LayerTransform2D,
  startPointerAngle: number,
  pointer: Vec2
): LayerTransform2D {
  const angle = Math.atan2(pointer.y - start.y, pointer.x - start.x);
  return { ...start, rotation: start.rotation + (angle - startPointerAngle) };
}

/**
 * Scale about the layer center so the dragged handle follows the cursor.
 * Corner handles scale both axes; edge handles a single axis.
 */
export function applyScale(
  start: LayerTransform2D,
  width: number,
  height: number,
  handle: GizmoHandle,
  pointer: Vec2,
  uniform: boolean
): LayerTransform2D {
  // Cursor in the layer's unrotated frame, relative to center.
  const cos = Math.cos(start.rotation);
  const sin = Math.sin(start.rotation);
  const dx = pointer.x - start.x;
  const dy = pointer.y - start.y;
  const localX = cos * dx + sin * dy;
  const localY = -sin * dx + cos * dy;

  const affectsX = handle === "l" || handle === "r" || handle.length === 2;
  const affectsY = handle === "t" || handle === "b" || handle.length === 2;

  let scaleX = start.scaleX;
  let scaleY = start.scaleY;
  if (affectsX && width > 0) {
    scaleX = Math.max(MIN_SCALE, Math.abs(localX) / (width / 2));
  }
  if (affectsY && height > 0) {
    scaleY = Math.max(MIN_SCALE, Math.abs(localY) / (height / 2));
  }
  if (uniform && affectsX && affectsY) {
    const s = Math.max(scaleX, scaleY);
    scaleX = s;
    scaleY = s;
  }
  return { ...start, scaleX, scaleY };
}
