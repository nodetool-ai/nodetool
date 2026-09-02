/**
 * shapeGeometry — a shape clip's outline as absolute path segments, and the
 * arc-length walk that trims it.
 *
 * Every geometry a shape clip can draw — rect, ellipse, line, polygon, star and
 * an authored SVG `d` — resolves to one {@link PathSegment}[] in the surface's
 * own pixels. One representation is what lets trim, dashes and gradients apply
 * to all six the same way: the alternative is `ctx.rect` here and `ctx.ellipse`
 * there, and then a trimmed ellipse has no length to walk.
 *
 * Circular arcs (a rounded corner, an ellipse) are emitted as cubics rather
 * than as `ctx.arc` calls for the same reason, plus one more: a shape's box is
 * normalized against a non-square canvas, so its "circle" is an ellipse, and
 * `arc` cannot draw one.
 */

import type { ClipShapeStyle } from "../types.js";
import { parseSvgPath, type PathSegment } from "./svgPath.js";

/** The shape's bounds in surface pixels. */
export interface ShapeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A point on a flattened outline, in surface pixels. */
export interface FlatPoint {
  x: number;
  y: number;
}

/** One flattened subpath: consecutive points, plus whether it closes. */
export interface FlatSubpath {
  points: FlatPoint[];
  closed: boolean;
}

/**
 * The cubic control-point offset that approximates a quarter circle, as a
 * fraction of the radius: `(4/3)·tan(π/8)`. Four of them draw a circle to
 * within 0.02% of its radius, which no rasterizer resolves.
 */
const QUARTER_ARC_K = 0.5522847498307936;

/** Default vertex count for `polygon` and `star` when none is authored. */
const DEFAULT_SIDES = 5;

/** Default inner radius of a star, as a fraction of the outer one. */
const DEFAULT_INNER_RADIUS = 0.5;

/**
 * Target chord length, in pixels, when flattening a curve. Small enough that
 * the polyline's length is within a fraction of a percent of the curve's — trim
 * is measured off it — and bounded below so a hairline curve is not subdivided
 * into hundreds of segments.
 */
const FLATTEN_CHORD_PX = 3;
const FLATTEN_MIN_STEPS = 8;
const FLATTEN_MAX_STEPS = 96;

function number(value: number | undefined, fallback: number): number {
  return value ?? fallback;
}

/** The shape's bounds in surface pixels, with today's defaults. */
export function shapeBox(
  style: ClipShapeStyle,
  width: number,
  height: number
): ShapeBox {
  return {
    x: number(style.x, 0.25) * width,
    y: number(style.y, 0.25) * height,
    width: number(style.width, 0.5) * width,
    height: number(style.height, 0.5) * height
  };
}

/**
 * Scalar lengths a shape authors in normalized units — `cornerRadius`, a dash
 * pattern — measured against the surface's width.
 *
 * They are lengths along an outline, so they have no axis of their own to
 * normalize against, and the two axes disagree on any non-square canvas. Width
 * is the reference because a shape's own box is authored against the frame and
 * the frame's width is the dimension that stays put when only the aspect
 * changes.
 */
export function shapeUnitScale(width: number): number {
  return width;
}

/**
 * The shape's outline as absolute segments in surface pixels, or null when it
 * names a kind this build does not draw or path data that does not parse. A
 * caller draws nothing in that case; the validator reports the shape.
 */
export function buildShapeSegments(
  style: ClipShapeStyle,
  width: number,
  height: number
): PathSegment[] | null {
  const box = shapeBox(style, width, height);
  const radius = Math.max(0, number(style.cornerRadius, 0)) *
    shapeUnitScale(width);

  if (style.kind === "rect") {
    return polygonSegments(
      [
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y },
        { x: box.x + box.width, y: box.y + box.height },
        { x: box.x, y: box.y + box.height }
      ],
      radius
    );
  }
  if (style.kind === "ellipse") {
    return ellipseSegments(box);
  }
  if (style.kind === "line") {
    return [
      { kind: "move", x: box.x, y: box.y },
      {
        kind: "line",
        x: number(style.x2, 0.75) * width,
        y: number(style.y2, 0.75) * height
      }
    ];
  }
  if (style.kind === "polygon" || style.kind === "star") {
    const sides = Math.max(3, Math.round(number(style.sides, DEFAULT_SIDES)));
    const points =
      style.kind === "polygon"
        ? regularPoints(box, sides)
        : starPoints(
            box,
            sides,
            Math.max(0, number(style.innerRadius, DEFAULT_INNER_RADIUS))
          );
    return polygonSegments(points, radius);
  }
  if (style.kind === "path") {
    const parsed = parseSvgPath(style.d ?? "");
    if (!parsed.ok) return null;
    // Path data is authored in the clip's normalized 0..1 space, the same space
    // the box coordinates live in.
    return parsed.segments.map((segment) => scaleSegment(segment, width, height));
  }
  return null;
}

function scaleSegment(
  segment: PathSegment,
  width: number,
  height: number
): PathSegment {
  switch (segment.kind) {
    case "move":
    case "line":
      return { kind: segment.kind, x: segment.x * width, y: segment.y * height };
    case "cubic":
      return {
        kind: "cubic",
        x1: segment.x1 * width,
        y1: segment.y1 * height,
        x2: segment.x2 * width,
        y2: segment.y2 * height,
        x: segment.x * width,
        y: segment.y * height
      };
    case "quad":
      return {
        kind: "quad",
        x1: segment.x1 * width,
        y1: segment.y1 * height,
        x: segment.x * width,
        y: segment.y * height
      };
    case "close":
      return segment;
  }
}

/** An ellipse inscribed in `box`, as four cubics from its rightmost point. */
function ellipseSegments(box: ShapeBox): PathSegment[] {
  const rx = box.width / 2;
  const ry = box.height / 2;
  const cx = box.x + rx;
  const cy = box.y + ry;
  const kx = rx * QUARTER_ARC_K;
  const ky = ry * QUARTER_ARC_K;
  const quadrant = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x: number,
    y: number
  ): PathSegment => ({ kind: "cubic", x1, y1, x2, y2, x, y });
  return [
    { kind: "move", x: cx + rx, y: cy },
    quadrant(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry),
    quadrant(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy),
    quadrant(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry),
    quadrant(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy),
    { kind: "close" }
  ];
}

/**
 * `sides` points spread evenly around the ellipse inscribed in `box`, starting
 * at the top so an odd-sided polygon or star stands upright.
 */
function regularPoints(box: ShapeBox, sides: number): FlatPoint[] {
  const rx = box.width / 2;
  const ry = box.height / 2;
  const cx = box.x + rx;
  const cy = box.y + ry;
  const points: FlatPoint[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return points;
}

/**
 * A star of `points` points: the outer vertices of the same polygon, with an
 * inner vertex between each pair at `innerRadius` of the outer radius. So the
 * outline has `2 × points` vertices and the point count is what a caller
 * counts when it samples a circle around the centre.
 */
function starPoints(
  box: ShapeBox,
  points: number,
  innerRadius: number
): FlatPoint[] {
  const rx = box.width / 2;
  const ry = box.height / 2;
  const cx = box.x + rx;
  const cy = box.y + ry;
  const out: FlatPoint[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const scale = i % 2 === 0 ? 1 : innerRadius;
    out.push({
      x: cx + rx * scale * Math.cos(angle),
      y: cy + ry * scale * Math.sin(angle)
    });
  }
  return out;
}

/**
 * A closed polygon through `points`, with each corner rounded to `radius`.
 *
 * A corner is the circular arc tangent to both edges, emitted as one cubic. The
 * tangent points sit `radius / tan(interior/2)` back from the vertex, which is
 * `radius` itself at a right angle (a rect) and further back as the corner
 * sharpens — so a star's spikes round visibly before its shallow inner corners
 * do, which is what makes the rounding read as one radius everywhere.
 */
function polygonSegments(points: FlatPoint[], radius: number): PathSegment[] {
  if (points.length < 2) return [];
  if (radius <= 0) {
    const segments: PathSegment[] = [
      { kind: "move", x: points[0]!.x, y: points[0]!.y }
    ];
    for (let i = 1; i < points.length; i++) {
      segments.push({ kind: "line", x: points[i]!.x, y: points[i]!.y });
    }
    segments.push({ kind: "close" });
    return segments;
  }

  const segments: PathSegment[] = [];
  for (let i = 0; i < points.length; i++) {
    const v = points[i]!;
    const prev = points[(i - 1 + points.length) % points.length]!;
    const next = points[(i + 1) % points.length]!;
    const corner = roundCorner(prev, v, next, radius);
    if (!corner) {
      // A degenerate corner (zero-length edge, or a vertex doubled back on
      // itself) has no arc; the vertex stays sharp.
      segments.push(
        i === 0
          ? { kind: "move", x: v.x, y: v.y }
          : { kind: "line", x: v.x, y: v.y }
      );
      continue;
    }
    segments.push(
      i === 0
        ? { kind: "move", x: corner.enter.x, y: corner.enter.y }
        : { kind: "line", x: corner.enter.x, y: corner.enter.y }
    );
    segments.push({
      kind: "cubic",
      x1: corner.c1.x,
      y1: corner.c1.y,
      x2: corner.c2.x,
      y2: corner.c2.y,
      x: corner.exit.x,
      y: corner.exit.y
    });
  }
  segments.push({ kind: "close" });
  return segments;
}

interface RoundedCorner {
  enter: FlatPoint;
  exit: FlatPoint;
  c1: FlatPoint;
  c2: FlatPoint;
}

function roundCorner(
  prev: FlatPoint,
  v: FlatPoint,
  next: FlatPoint,
  radius: number
): RoundedCorner | null {
  const inLen = Math.hypot(v.x - prev.x, v.y - prev.y);
  const outLen = Math.hypot(next.x - v.x, next.y - v.y);
  if (inLen <= 1e-6 || outLen <= 1e-6) return null;
  const ux = (prev.x - v.x) / inLen;
  const uy = (prev.y - v.y) / inLen;
  const wx = (next.x - v.x) / outLen;
  const wy = (next.y - v.y) / outLen;
  const cos = Math.max(-1, Math.min(1, ux * wx + uy * wy));
  const sin = Math.abs(ux * wy - uy * wx);
  // Straight through, or folded back on itself: no arc to draw.
  if (sin <= 1e-6) return null;
  const interior = Math.acos(cos);
  const tangent = Math.min(
    radius / Math.tan(interior / 2),
    inLen / 2,
    outLen / 2
  );
  if (!Number.isFinite(tangent) || tangent <= 1e-6) return null;
  const arcRadius = tangent * Math.tan(interior / 2);
  const sweep = Math.PI - interior;
  const handle = (4 / 3) * Math.tan(sweep / 4) * arcRadius;
  const enter = { x: v.x + ux * tangent, y: v.y + uy * tangent };
  const exit = { x: v.x + wx * tangent, y: v.y + wy * tangent };
  return {
    enter,
    exit,
    c1: { x: enter.x - ux * handle, y: enter.y - uy * handle },
    c2: { x: exit.x - wx * handle, y: exit.y - wy * handle }
  };
}

/**
 * Flatten absolute segments into polylines. Curves are subdivided so each chord
 * is roughly {@link FLATTEN_CHORD_PX} long, which is what makes the polyline's
 * length a usable stand-in for the curve's.
 */
export function flattenSegments(
  segments: readonly PathSegment[]
): FlatSubpath[] {
  const subpaths: FlatSubpath[] = [];
  let cx = 0;
  let cy = 0;
  // The subpath being built is addressed by index rather than held in a local,
  // so the reads below stay narrowed after the closures that append to it.
  let at = -1;

  const open = (x: number, y: number): void => {
    at = subpaths.push({ points: [{ x, y }], closed: false }) - 1;
    cx = x;
    cy = y;
  };
  const push = (x: number, y: number): void => {
    const current = subpaths[at];
    if (!current) open(x, y);
    else {
      current.points.push({ x, y });
      cx = x;
      cy = y;
    }
  };

  for (const segment of segments) {
    switch (segment.kind) {
      case "move":
        open(segment.x, segment.y);
        break;
      case "line":
        push(segment.x, segment.y);
        break;
      case "cubic": {
        // The curve's start is the point before this segment, and `push` moves
        // it, so both are read into locals before the walk begins.
        const sx = cx;
        const sy = cy;
        const steps = curveSteps(sx, sy, [
          segment.x1,
          segment.y1,
          segment.x2,
          segment.y2,
          segment.x,
          segment.y
        ]);
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          push(
            cubicAt(t, sx, segment.x1, segment.x2, segment.x),
            cubicAt(t, sy, segment.y1, segment.y2, segment.y)
          );
        }
        break;
      }
      case "quad": {
        const sx = cx;
        const sy = cy;
        const steps = curveSteps(sx, sy, [
          segment.x1,
          segment.y1,
          segment.x,
          segment.y
        ]);
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          push(
            quadAt(t, sx, segment.x1, segment.x),
            quadAt(t, sy, segment.y1, segment.y)
          );
        }
        break;
      }
      case "close": {
        const current = subpaths[at];
        if (current && current.points.length > 0) {
          const start = current.points[0]!;
          current.closed = true;
          if (Math.hypot(cx - start.x, cy - start.y) > 1e-6) {
            current.points.push({ x: start.x, y: start.y });
          }
          cx = start.x;
          cy = start.y;
        }
        break;
      }
    }
  }
  return subpaths.filter((subpath) => subpath.points.length > 1);
}

/** Subdivision count for a curve, from the length of its control polygon. */
function curveSteps(x0: number, y0: number, control: number[]): number {
  let length = 0;
  let px = x0;
  let py = y0;
  for (let i = 0; i < control.length; i += 2) {
    const x = control[i]!;
    const y = control[i + 1]!;
    length += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return Math.max(
    FLATTEN_MIN_STEPS,
    Math.min(FLATTEN_MAX_STEPS, Math.ceil(length / FLATTEN_CHORD_PX))
  );
}

function cubicAt(t: number, a: number, b: number, c: number, d: number): number {
  const s = 1 - t;
  return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d;
}

function quadAt(t: number, a: number, b: number, c: number): number {
  const s = 1 - t;
  return s * s * a + 2 * s * t * b + t * t * c;
}

/** Total length of every subpath, in surface pixels. */
export function flatPathLength(subpaths: readonly FlatSubpath[]): number {
  let total = 0;
  for (const subpath of subpaths) {
    for (let i = 1; i < subpath.points.length; i++) {
      total += Math.hypot(
        subpath.points[i]!.x - subpath.points[i - 1]!.x,
        subpath.points[i]!.y - subpath.points[i - 1]!.y
      );
    }
  }
  return total;
}

/**
 * The sub-range `[startFrac, endFrac]` of a flattened outline, as open
 * polylines.
 *
 * Length is measured over every subpath **concatenated in order**, so a figure
 * drawn as several subpaths trims through them one after another: a range
 * straddling a boundary comes back as two polylines, the tail of one and the
 * head of the next, and a range wholly inside one subpath leaves the others
 * undrawn. That is the same rule After Effects applies with its per-path trim
 * switched off, and it is what makes a trim animation on a multi-part logo
 * read as one stroke being drawn rather than as every part growing at once.
 */
export function trimFlatPath(
  subpaths: readonly FlatSubpath[],
  startFrac: number,
  endFrac: number
): FlatPoint[][] {
  const total = flatPathLength(subpaths);
  if (total <= 0) return [];
  const from = Math.max(0, Math.min(1, startFrac)) * total;
  const to = Math.max(0, Math.min(1, endFrac)) * total;
  if (to - from <= 1e-6) return [];

  const out: FlatPoint[][] = [];
  let walked = 0;
  let run: FlatPoint[] | null = null;

  for (const subpath of subpaths) {
    for (let i = 1; i < subpath.points.length; i++) {
      const a = subpath.points[i - 1]!;
      const b = subpath.points[i]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const segStart = walked;
      const segEnd = walked + length;
      walked = segEnd;
      if (length <= 0 || segEnd <= from || segStart >= to) continue;
      const t0 = Math.max(0, (from - segStart) / length);
      const t1 = Math.min(1, (to - segStart) / length);
      const p0 = lerpPoint(a, b, t0);
      const p1 = lerpPoint(a, b, t1);
      if (!run) {
        run = [p0];
        out.push(run);
      }
      run.push(p1);
      // The kept range stops inside this segment, so anything after it belongs
      // to a later run — there is none, but ending the run here keeps the
      // invariant that a run is contiguous.
      if (t1 < 1) run = null;
    }
    // Subpaths are separate strokes even when the range spans both.
    run = null;
  }
  return out;
}

function lerpPoint(a: FlatPoint, b: FlatPoint, t: number): FlatPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
