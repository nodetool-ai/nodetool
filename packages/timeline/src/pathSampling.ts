/**
 * pathSampling — point-and-tangent sampling along an authored SVG path by arc
 * length.
 *
 * Built for the `followPath` animation preset (T27, `animation/presets.ts`):
 * a `d` string in the clip's normalized 0..1 space is flattened once with
 * `flattenSegments` (`render/shapeGeometry.ts` — the same flattener every
 * shape clip's outline goes through) and then walked by arc length to answer
 * "where is the path at fraction `t`, and which way does it point". Reusing
 * that flattener is what keeps a followed path and the shape it might later
 * be traced from agreeing on geometry.
 *
 * `render/shapeGeometry.ts` and `render/svgPath.ts` are pure geometry with no
 * GPU or `@napi-rs/canvas` import (only `render/frameCompositor.ts` and
 * `render/effects.ts` pull in `@nodetool-ai/gpu`, and this module imports
 * neither), so importing them here adds no runtime dependency to the package
 * root — unlike the rest of `src/render`, which stays out of it.
 *
 * Pure: no DOM, GPU, or store access.
 */

import { parseSvgPath, type PathSegment } from "./render/svgPath.js";
import {
  flattenSegments,
  flatPathLength,
  type FlatSubpath
} from "./render/shapeGeometry.js";

/** A path's placement box, normalized 0..1 against the canvas. */
export interface PathBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A point on a path, with the tangent direction of travel at that point. */
export interface PathPoint {
  /** Canvas px. */
  x: number;
  /** Canvas px. */
  y: number;
  /** Tangent angle in radians; 0 = +x axis, increases toward +y (SVG/canvas down). */
  angle: number;
}

/**
 * Map one normalized-space (0..1) path segment into `box` (itself normalized
 * 0..1 against the canvas), then into canvas px. This is the sub-box
 * placement `render/shapeGeometry.ts`'s own `kind: "path"` branch does not
 * do — a shape clip's authored `d` there scales directly against the full
 * canvas — so `followPath` gets its own scale step rather than reusing
 * `buildShapeSegments`.
 */
function scaleIntoBox(
  segment: PathSegment,
  box: PathBox,
  canvasWidth: number,
  canvasHeight: number
): PathSegment {
  const px = (nx: number): number => (box.x + nx * box.width) * canvasWidth;
  const py = (ny: number): number => (box.y + ny * box.height) * canvasHeight;
  switch (segment.kind) {
    case "move":
    case "line":
      return { kind: segment.kind, x: px(segment.x), y: py(segment.y) };
    case "cubic":
      return {
        kind: "cubic",
        x1: px(segment.x1),
        y1: py(segment.y1),
        x2: px(segment.x2),
        y2: py(segment.y2),
        x: px(segment.x),
        y: py(segment.y)
      };
    case "quad":
      return {
        kind: "quad",
        x1: px(segment.x1),
        y1: py(segment.y1),
        x: px(segment.x),
        y: py(segment.y)
      };
    case "close":
      return segment;
  }
}

/**
 * Parse `d` (normalized 0..1, same convention as `ClipShapeStyle.d`) placed
 * in `box` (also normalized 0..1) and flatten it into canvas-px subpaths, or
 * `null` when `d` does not parse or flattens to a zero-length path.
 */
export function flattenNormalizedPath(
  d: string,
  box: PathBox,
  canvasWidth: number,
  canvasHeight: number
): FlatSubpath[] | null {
  const parsed = parseSvgPath(d);
  if (!parsed.ok) return null;
  const scaled = parsed.segments.map((segment) =>
    scaleIntoBox(segment, box, canvasWidth, canvasHeight)
  );
  const flat = flattenSegments(scaled);
  if (flat.length === 0 || flatPathLength(flat) <= 0) return null;
  return flat;
}

/**
 * Point and tangent angle at arc-length fraction `t` (0..1, clamped) along
 * `subpaths`, walked concatenated in order — the same walk
 * `render/shapeGeometry.ts`'s `trimFlatPath` uses for trim. `null` for an
 * empty or zero-length path.
 */
export function pointAtPathFraction(
  subpaths: readonly FlatSubpath[],
  t: number
): PathPoint | null {
  const total = flatPathLength(subpaths);
  if (total <= 0) return null;
  const target = Math.max(0, Math.min(1, t)) * total;

  let walked = 0;
  let last: PathPoint | null = null;
  for (const subpath of subpaths) {
    for (let i = 1; i < subpath.points.length; i++) {
      const a = subpath.points[i - 1]!;
      const b = subpath.points[i]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length <= 0) continue;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      last = { x: b.x, y: b.y, angle };
      if (target <= walked + length + 1e-9) {
        const localT = Math.max(0, Math.min(1, (target - walked) / length));
        return {
          x: a.x + (b.x - a.x) * localT,
          y: a.y + (b.y - a.y) * localT,
          angle
        };
      }
      walked += length;
    }
  }
  // Floating-point rounding put `target` a hair past the last segment.
  return last;
}
