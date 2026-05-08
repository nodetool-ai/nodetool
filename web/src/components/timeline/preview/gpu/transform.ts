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
 * Position is in canvas pixels relative to the canvas center.
 * Anchor is normalized [0,1] (0.5 = quad center).
 */
export function buildTransformMatrix(
  transform: ClipTransform,
  base: { x: number; y: number },
  canvasWidth: number,
  canvasHeight: number
): Float32Array {
  const sx = base.x * transform.scale.x;
  const sy = base.y * transform.scale.y;
  const cos = Math.cos(transform.rotation);
  const sin = Math.sin(transform.rotation);

  // Position in clip space: x = px / (W/2), y = -py / (H/2). Y is flipped
  // because canvas Y grows downward but clip-space Y grows upward.
  const tx = canvasWidth === 0 ? 0 : (transform.position.x / canvasWidth) * 2;
  const ty =
    canvasHeight === 0 ? 0 : -(transform.position.y / canvasHeight) * 2;

  // Anchor offset in clip space (-1..1). Default 0.5 → 0 offset.
  const ax = (transform.anchor.x - 0.5) * 2;
  const ay = (transform.anchor.y - 0.5) * 2;

  const m = new Float32Array(16);
  // Column 0
  m[0] = sx * cos;
  m[1] = sx * sin;
  m[2] = 0;
  m[3] = 0;
  // Column 1
  m[4] = -sy * sin;
  m[5] = sy * cos;
  m[6] = 0;
  m[7] = 0;
  // Column 2
  m[8] = 0;
  m[9] = 0;
  m[10] = 1;
  m[11] = 0;
  // Column 3 (translation, anchor-corrected)
  m[12] = tx + ax * (1 - sx * cos) + ay * sy * sin;
  m[13] = ty + ay * (1 - sy * cos) - ax * sx * sin;
  m[14] = 0;
  m[15] = 1;
  return m;
}
