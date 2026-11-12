/**
 * Coverage of the masks on one grade effect, and the helpers that create and
 * edit them. Every renderer reads coverage through {@link effectMaskCoverage}
 * or its native port (`native/timeline/src/preview/effects/EffectMasks.cpp`),
 * so the two must stay identical: the parity fixtures compare them.
 *
 * The model: each mask is a closed vertex path in clip-normalized space. A
 * pixel samples the signed distance to the flattened path at its centre,
 * minus the expansion. The feather is a linear ramp of that width centred on
 * the edge. Masks combine top to bottom with `add` (max), `subtract`
 * (multiply by the complement) and `intersect` (min).
 */
import { isMaskableEffectType, type ClipEffect, type EffectMask, type EffectMaskMode, type EffectMaskVertex } from "./types.js";

/** Cubic segments flatten into this many lines. */
export const EFFECT_MASK_SUBDIVISIONS = 16;

/** Bézier circle constant: tangent length of a quarter arc. */
const KAPPA = 0.5522847498307936;

export function activeEffectMasks(masks: readonly EffectMask[] | undefined): EffectMask[] {
  return (masks ?? []).filter((mask) => mask.enabled !== false && Array.isArray(mask.vertices) && mask.vertices.length >= 2);
}

/** Four smooth vertices that trace the ellipse with centre `cx, cy` and radii `rx, ry`. */
export function ellipseMaskVertices(cx: number, cy: number, rx: number, ry: number): EffectMaskVertex[] {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    { x: cx, y: cy - ry, inX: -kx, inY: 0, outX: kx, outY: 0 },
    { x: cx + rx, y: cy, inX: 0, inY: -ky, outX: 0, outY: ky },
    { x: cx, y: cy + ry, inX: kx, inY: 0, outX: -kx, outY: 0 },
    { x: cx - rx, y: cy, inX: 0, inY: ky, outX: 0, outY: -ky }
  ];
}

/** The default mask for a new shape, centred on the clip. */
export function createEffectMask(id: string, shape: "ellipse" | "polygon" | "bezier", vertices?: EffectMaskVertex[]): EffectMask {
  const path = vertices ?? (shape === "ellipse"
    ? ellipseMaskVertices(0.5, 0.5, 0.25, 0.25)
    : [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.7, y: 0.7 }, { x: 0.3, y: 0.7 }]);
  return { id, shape, vertices: path, feather: 0.02, opacity: 1, expansion: 0, inverted: false, mode: "add" };
}

/** The closed path as a polyline in pixel space, `[x0, y0, x1, y1, ...]`. */
export function flattenEffectMask(vertices: readonly EffectMaskVertex[], width: number, height: number): number[] {
  const points: number[] = [];
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % n]!;
    const p0x = a.x * width, p0y = a.y * height;
    const p3x = b.x * width, p3y = b.y * height;
    points.push(p0x, p0y);
    const straight = !a.outX && !a.outY && !b.inX && !b.inY;
    if (straight) continue;
    const p1x = (a.x + (a.outX ?? 0)) * width, p1y = (a.y + (a.outY ?? 0)) * height;
    const p2x = (b.x + (b.inX ?? 0)) * width, p2y = (b.y + (b.inY ?? 0)) * height;
    for (let s = 1; s < EFFECT_MASK_SUBDIVISIONS; s++) {
      const t = s / EFFECT_MASK_SUBDIVISIONS;
      const u = 1 - t;
      const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
      points.push(w0 * p0x + w1 * p1x + w2 * p2x + w3 * p3x, w0 * p0y + w1 * p1y + w2 * p2y + w3 * p3y);
    }
  }
  return points;
}

/** Signed distance from `(px, py)` to a closed polyline: negative inside (even-odd). */
export function polylineSignedDistance(points: readonly number[], px: number, py: number): number {
  const n = points.length / 2;
  let best = Infinity;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = points[j * 2]!, ay = points[j * 2 + 1]!;
    const bx = points[i * 2]!, by = points[i * 2 + 1]!;
    const ex = bx - ax, ey = by - ay;
    const len = ex * ex + ey * ey;
    const t = len > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / len)) : 0;
    const dx = px - (ax + ex * t), dy = py - (ay + ey * t);
    best = Math.min(best, dx * dx + dy * dy);
    if ((ay > py) !== (by > py) && px < ax + ((py - ay) / (by - ay)) * ex) inside = !inside;
  }
  const distance = Math.sqrt(best);
  return inside ? -distance : distance;
}

function combine(acc: number, coverage: number, mode: EffectMaskMode | undefined): number {
  if (mode === "subtract") return acc * (1 - coverage);
  if (mode === "intersect") return Math.min(acc, coverage);
  return Math.max(acc, coverage);
}

/**
 * Combined coverage, 0..1, for an `outWidth × outHeight` window whose pixel
 * `(i, j)` samples source pixel `(originX + i + 0.5, originY + j + 0.5)` of a
 * `sourceWidth × sourceHeight` clip. Returns `null` when no mask is active,
 * which means the effect applies everywhere.
 */
export function effectMaskCoverage(
  masks: readonly EffectMask[] | undefined,
  sourceWidth: number,
  sourceHeight: number,
  outWidth = sourceWidth,
  outHeight = sourceHeight,
  originX = 0,
  originY = 0
): Float32Array | null {
  const active = activeEffectMasks(masks);
  if (active.length === 0 || outWidth <= 0 || outHeight <= 0) return null;
  const result = new Float32Array(outWidth * outHeight).fill(active[0]!.mode === "subtract" || active[0]!.mode === "intersect" ? 1 : 0);
  const single = new Float32Array(outWidth * outHeight);
  const shorter = Math.min(sourceWidth, sourceHeight);
  for (const mask of active) {
    const feather = Math.max(0, mask.feather ?? 0) * shorter;
    const expansion = (mask.expansion ?? 0) * shorter;
    const opacity = Math.max(0, Math.min(1, mask.opacity ?? 1));
    const points = flattenEffectMask(mask.vertices, sourceWidth, sourceHeight);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < points.length; k += 2) {
      x0 = Math.min(x0, points[k]!); x1 = Math.max(x1, points[k]!);
      y0 = Math.min(y0, points[k + 1]!); y1 = Math.max(y1, points[k + 1]!);
    }
    // Beyond this margin the distance alone puts a pixel outside the ramp.
    const margin = Math.max(0, expansion + feather / 2) + 1;
    const outside = mask.inverted ? opacity : 0;
    for (let j = 0; j < outHeight; j++) {
      const py = originY + j + 0.5;
      for (let i = 0; i < outWidth; i++) {
        const px = originX + i + 0.5;
        let coverage: number;
        if (px < x0 - margin || px > x1 + margin || py < y0 - margin || py > y1 + margin) {
          coverage = outside;
        } else {
          const d = polylineSignedDistance(points, px, py) - expansion;
          let c = feather <= 0 ? (d <= 0 ? 1 : 0) : Math.max(0, Math.min(1, 0.5 - d / feather));
          if (mask.inverted) c = 1 - c;
          coverage = c * opacity;
        }
        single[j * outWidth + i] = coverage;
      }
    }
    for (let k = 0; k < result.length; k++) result[k] = combine(result[k]!, single[k]!, mask.mode);
  }
  return result;
}

/**
 * Mix straight RGBA `after` toward `before` where coverage is low, in place on
 * `after`. The mix runs on premultiplied values so a keyed edge stays valid.
 */
export function mixByEffectMaskCoverage(before: Uint8ClampedArray, after: Uint8ClampedArray, coverage: Float32Array): void {
  for (let p = 0, i = 0; p < coverage.length; p++, i += 4) {
    const c = coverage[p]!;
    if (c >= 1) continue;
    const ab = before[i + 3]! / 255, aa = after[i + 3]! / 255;
    const alpha = ab + (aa - ab) * c;
    for (let ch = 0; ch < 3; ch++) {
      const premul = (before[i + ch]! / 255) * ab + ((after[i + ch]! / 255) * aa - (before[i + ch]! / 255) * ab) * c;
      after[i + ch] = alpha > 0 ? Math.round((premul / alpha) * 255) : 0;
    }
    after[i + 3] = Math.round(alpha * 255);
  }
}

/** Move every vertex of a mask by a normalized delta. */
export function translateEffectMask(mask: EffectMask, dx: number, dy: number): EffectMask {
  return { ...mask, vertices: mask.vertices.map((v) => ({ ...v, x: v.x + dx, y: v.y + dy })) };
}

/** The masks of a maskable effect; `undefined` for any other effect type. */
export function effectMasksOf(effect: ClipEffect): EffectMask[] | undefined {
  return isMaskableEffectType(effect.type) ? (effect as { masks?: EffectMask[] }).masks : undefined;
}

/** An enabled effect whose active masks limit it, so it runs in place and mixes back. */
export function isMaskedEffect(effect: ClipEffect): boolean {
  return effect.enabled && activeEffectMasks(effectMasksOf(effect)).length > 0;
}
