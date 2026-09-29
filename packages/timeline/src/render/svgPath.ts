/**
 * svgPath — the SVG path grammar the timeline draws, parsed once into
 * absolute segments.
 *
 * Two things read this module: a clip's `ClipMask` with `kind: "path"` (T12),
 * and a shape clip's own `d` (T16). Both want the same two steps and nothing
 * more, so the seam is deliberately small:
 *
 * 1. {@link parseSvgPath} turns path data into {@link PathSegment}[] with every
 *    coordinate **absolute**, in the path's own units (normalized 0..1 for a
 *    mask, likewise for a shape). Relative commands are resolved here, so a
 *    consumer never tracks a current point. `A` (elliptical arc) is expanded
 *    into `cubic` segments here too — nothing downstream needs to know an arc
 *    was ever written, so trim, dashes, gradients, collision geometry, and
 *    morph all keep working unchanged.
 * 2. {@link tracePath} replays those segments onto any {@link PathSink} —
 *    a Canvas 2D context, or a flattener that walks them by arc length for
 *    trim and dashes — with a scale and offset applied on the way.
 *
 * `M L H V C S Q T A Z` are read, absolute and relative. A command outside
 * that set is refused by name rather than approximated: a mask silently
 * missing part of its outline is a worse answer than one the validator
 * reports as `mask_path_invalid` (or, for a shape's own `d`, `shape_path_invalid`).
 *
 * Not implemented: SVG's packed-flag shorthand for `A`'s large-arc/sweep
 * flags (writing `011` for `0 1 1` with no separator). Every exporter and
 * model-authored path this build has seen separates them, and the shared
 * number tokenizer below would need to special-case the two arguments right
 * after the rotation to support it — the rest of the grammar identifies a
 * flag from `ARITY` alone, not from position within a command.
 */

/** One absolute path segment. `x`/`y` are the point the segment ends at. */
export type PathSegment =
  | { kind: "move"; x: number; y: number }
  | { kind: "line"; x: number; y: number }
  | {
      kind: "cubic";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x: number;
      y: number;
    }
  | { kind: "quad"; x1: number; y1: number; x: number; y: number }
  | { kind: "close" };

/** What {@link parseSvgPath} answers: the segments, or why it could not. */
export type SvgPathResult =
  | { ok: true; segments: PathSegment[] }
  | { ok: false; error: string };

/** The commands this parser reads, for an error message that says what to use. */
export const SVG_PATH_COMMANDS = "M, L, H, V, C, S, Q, T, A, Z (absolute or relative)";

/** How many numbers each command consumes per repetition. */
const ARITY: Record<string, number> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0
};

/**
 * Split path data into commands and numbers.
 *
 * Numbers are matched rather than split on separators because SVG allows both
 * `10-5` and `.5.5` — two numbers each, with no separator between them.
 *
 * The two number branches are disjoint on their first character — a digit or a
 * dot — so a run of digits with no dot in it cannot send the engine back
 * through what it already read. Writing the fractional case as `\d*\.\d+`
 * instead shares that first character with the integer case, which is the
 * shape CodeQL reports as polynomial backtracking.
 */
const TOKEN =
  /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)|([,\s]+)/y;

/** A 2D point, used only while building an arc's cubic approximation. */
interface ArcPoint {
  x: number;
  y: number;
}

/**
 * Expand one elliptical arc (SVG endpoint parameterisation) into cubic
 * segments, each spanning at most 90° of the ellipse.
 *
 * Follows SVG 1.1 Appendix F.6: endpoint-to-center parameterisation
 * (F.6.5), then the standard circular-arc-as-cubic approximation
 * (`alpha = (4/3) * tan(delta/4)`) applied to the ellipse's own parametric
 * frame, transformed by the arc's rotation and center. `rx`/`ry` are the
 * caller's raw (possibly negative or oversized) radii; this function takes
 * their absolute value and scales them up per F.6.6 when the chord from
 * `(x1,y1)` to `(x2,y2)` does not fit inside them.
 */
function arcToCubics(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number
): PathSegment[] {
  // Identical endpoints: SVG treats the arc as omitted entirely (F.6.6.2).
  if (x1 === x2 && y1 === y2) {
    return [];
  }
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  // A zero radius has no ellipse to sweep along — draw the chord instead
  // (F.6.6.1), rather than dividing by zero below.
  if (rx === 0 || ry === 0) {
    return [{ kind: "line", x: x2, y: y2 }];
  }

  const phi = (rotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // F.6.5.1 — the endpoints in the ellipse's own (unrotated, un-translated)
  // coordinate frame.
  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  // F.6.6.2 — scale up radii too small to reach between the endpoints.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  // F.6.5.2 / F.6.5.3 — the ellipse's center, in both frames.
  const rxSq = rx * rx;
  const rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;
  const sign = largeArc !== sweep ? 1 : -1;
  const num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
  const den = rxSq * y1pSq + rySq * x1pSq;
  const co = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * (rx * y1p)) / ry;
  const cyp = (co * -(ry * x1p)) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  // F.6.5.4 / F.6.5.5 — start angle and the signed sweep to the end angle.
  const angleBetween = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    let angle = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) angle = -angle;
    return angle;
  };
  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;
  const theta1 = angleBetween(1, 0, ux, uy);
  let deltaTheta = angleBetween(ux, uy, vx, vy);
  if (!sweep && deltaTheta > 0) deltaTheta -= 2 * Math.PI;
  if (sweep && deltaTheta < 0) deltaTheta += 2 * Math.PI;

  // Split into segments of at most 90° — the usual bound for a cubic
  // approximation of a circular/elliptical arc to stay within a fraction of
  // a percent of the true curve.
  const segmentCount = Math.max(1, Math.ceil(Math.abs(deltaTheta) / (Math.PI / 2)));
  const segmentDelta = deltaTheta / segmentCount;
  const alpha = (4 / 3) * Math.tan(segmentDelta / 4);

  const pointOn = (theta: number): ArcPoint => {
    const ex = rx * Math.cos(theta);
    const ey = ry * Math.sin(theta);
    return { x: cx + cosPhi * ex - sinPhi * ey, y: cy + sinPhi * ex + cosPhi * ey };
  };
  const derivativeOn = (theta: number): ArcPoint => {
    const ex = -rx * Math.sin(theta);
    const ey = ry * Math.cos(theta);
    return { x: cosPhi * ex - sinPhi * ey, y: sinPhi * ex + cosPhi * ey };
  };

  const segments: PathSegment[] = [];
  let theta = theta1;
  for (let i = 0; i < segmentCount; i++) {
    const nextTheta = theta + segmentDelta;
    const p0 = pointOn(theta);
    const p3 = pointOn(nextTheta);
    const d0 = derivativeOn(theta);
    const d3 = derivativeOn(nextTheta);
    segments.push({
      kind: "cubic",
      x1: p0.x + alpha * d0.x,
      y1: p0.y + alpha * d0.y,
      x2: p3.x - alpha * d3.x,
      y2: p3.y - alpha * d3.y,
      x: p3.x,
      y: p3.y
    });
    theta = nextTheta;
  }
  // Angle math can drift the last point a few ULPs from the caller's own
  // (x2, y2) through sin/cos rounding. Pin it exactly, so the current point
  // the parser tracks afterward matches the path data verbatim.
  const last = segments[segments.length - 1];
  if (last && last.kind === "cubic") {
    last.x = x2;
    last.y = y2;
  }
  return segments;
}

/** Parse SVG path data into absolute segments, or say what stopped it. */
export function parseSvgPath(d: string): SvgPathResult {
  const source = d.trim();
  if (source === "") {
    return { ok: false, error: "path data is empty" };
  }

  const segments: PathSegment[] = [];
  // The current point, and the point a `Z` returns to.
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let started = false;

  // The command family that produced the segment just pushed, and its
  // control point — read by `S`/`T` to reflect a smooth curve's implied
  // control point (SVG 1.1 §8.3.6). Any command other than the matching
  // curve/smooth-curve pair breaks the chain, so the assumed control point
  // becomes the current point instead.
  let prevCommand: string | null = null;
  let lastCubicControl: { x: number; y: number } | null = null;
  let lastQuadControl: { x: number; y: number } | null = null;

  TOKEN.lastIndex = 0;
  let command: string | null = null;
  let relative = false;
  let pending: number[] = [];

  /** Consume `pending` while it holds a full repetition of `command`. */
  const flush = (final: boolean): string | null => {
    if (command === null) {
      return pending.length > 0
        ? `path data starts with a number; expected one of ${SVG_PATH_COMMANDS}`
        : null;
    }
    const arity = ARITY[command]!;
    if (arity === 0) {
      if (!started) {
        return "`Z` closes a subpath that was never opened with `M`";
      }
      segments.push({ kind: "close" });
      cx = startX;
      cy = startY;
      prevCommand = "z";
      command = null;
      return null;
    }
    while (pending.length >= arity) {
      const n = pending.splice(0, arity);
      const px = relative ? cx : 0;
      const py = relative ? cy : 0;
      if (command === "m") {
        const x = px + n[0]!;
        const y = py + n[1]!;
        segments.push({ kind: "move", x, y });
        startX = x;
        startY = y;
        cx = x;
        cy = y;
        started = true;
        prevCommand = "m";
        // A second coordinate pair after `M` is an implicit `L` (SVG 1.1
        // §8.3.2), which is how most exporters write a polygon.
        command = "l";
        continue;
      }
      if (!started) {
        return `path data draws with \`${command.toUpperCase()}\` before any \`M\``;
      }
      switch (command) {
        case "l": {
          cx = px + n[0]!;
          cy = py + n[1]!;
          segments.push({ kind: "line", x: cx, y: cy });
          prevCommand = "l";
          break;
        }
        case "h": {
          cx = relative ? cx + n[0]! : n[0]!;
          segments.push({ kind: "line", x: cx, y: cy });
          prevCommand = "h";
          break;
        }
        case "v": {
          cy = relative ? cy + n[0]! : n[0]!;
          segments.push({ kind: "line", x: cx, y: cy });
          prevCommand = "v";
          break;
        }
        case "c": {
          const x1 = px + n[0]!;
          const y1 = py + n[1]!;
          const x2 = px + n[2]!;
          const y2 = py + n[3]!;
          cx = px + n[4]!;
          cy = py + n[5]!;
          segments.push({ kind: "cubic", x1, y1, x2, y2, x: cx, y: cy });
          prevCommand = "c";
          lastCubicControl = { x: x2, y: y2 };
          break;
        }
        case "s": {
          const start =
            (prevCommand === "c" || prevCommand === "s") && lastCubicControl
              ? { x: 2 * cx - lastCubicControl.x, y: 2 * cy - lastCubicControl.y }
              : { x: cx, y: cy };
          const x2 = px + n[0]!;
          const y2 = py + n[1]!;
          cx = px + n[2]!;
          cy = py + n[3]!;
          segments.push({
            kind: "cubic",
            x1: start.x,
            y1: start.y,
            x2,
            y2,
            x: cx,
            y: cy
          });
          prevCommand = "s";
          lastCubicControl = { x: x2, y: y2 };
          break;
        }
        case "q": {
          const x1 = px + n[0]!;
          const y1 = py + n[1]!;
          cx = px + n[2]!;
          cy = py + n[3]!;
          segments.push({ kind: "quad", x1, y1, x: cx, y: cy });
          prevCommand = "q";
          lastQuadControl = { x: x1, y: y1 };
          break;
        }
        case "t": {
          const control =
            (prevCommand === "q" || prevCommand === "t") && lastQuadControl
              ? { x: 2 * cx - lastQuadControl.x, y: 2 * cy - lastQuadControl.y }
              : { x: cx, y: cy };
          cx = px + n[0]!;
          cy = py + n[1]!;
          segments.push({ kind: "quad", x1: control.x, y1: control.y, x: cx, y: cy });
          prevCommand = "t";
          lastQuadControl = control;
          break;
        }
        case "a": {
          const largeArcFlag = n[3]!;
          const sweepFlag = n[4]!;
          if (largeArcFlag !== 0 && largeArcFlag !== 1) {
            return "`A`'s large-arc-flag must be 0 or 1";
          }
          if (sweepFlag !== 0 && sweepFlag !== 1) {
            return "`A`'s sweep-flag must be 0 or 1";
          }
          const startX2 = cx;
          const startY2 = cy;
          const endX = px + n[5]!;
          const endY = py + n[6]!;
          segments.push(
            ...arcToCubics(
              startX2,
              startY2,
              n[0]!,
              n[1]!,
              n[2]!,
              largeArcFlag === 1,
              sweepFlag === 1,
              endX,
              endY
            )
          );
          cx = endX;
          cy = endY;
          prevCommand = "a";
          break;
        }
      }
    }
    if (final && pending.length > 0) {
      return `\`${command.toUpperCase()}\` takes ${arity} numbers per point; ${pending.length} left over`;
    }
    return null;
  };

  while (TOKEN.lastIndex < source.length) {
    // A failed sticky match resets `lastIndex`, so the offending character has
    // to be read before the call, not after it.
    const at = TOKEN.lastIndex;
    const match = TOKEN.exec(source);
    if (!match) {
      return {
        ok: false,
        error: `unexpected "${source[at]}" in path data; this build reads ${SVG_PATH_COMMANDS}`
      };
    }
    if (match[3] !== undefined) continue;
    if (match[2] !== undefined) {
      if (command === null) {
        return {
          ok: false,
          error: `path data starts with a number; expected one of ${SVG_PATH_COMMANDS}`
        };
      }
      pending.push(Number(match[2]));
      const error = flush(false);
      if (error) return { ok: false, error };
      continue;
    }
    const error = flush(true);
    if (error) return { ok: false, error };
    pending = [];
    const letter = match[1]!;
    command = letter.toLowerCase();
    relative = letter !== letter.toUpperCase();
    if (command === "z") {
      const closeError = flush(true);
      if (closeError) return { ok: false, error: closeError };
    }
  }
  const error = flush(true);
  if (error) return { ok: false, error };
  if (segments.length === 0) {
    return { ok: false, error: "path data draws nothing" };
  }
  return { ok: true, segments };
}

/** The Canvas 2D path calls {@link tracePath} issues. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number
  ): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  closePath(): void;
}

/** How a path's own units map onto the surface it is traced on. */
export interface PathPlacement {
  scaleX: number;
  scaleY: number;
  offsetX?: number;
  offsetY?: number;
}

/**
 * Replay `segments` onto `sink`, scaled and offset by `placement`. The sink is
 * left with the path open — the caller decides whether to fill, stroke or clip
 * it, and with which fill rule.
 */
export function tracePath(
  sink: PathSink,
  segments: readonly PathSegment[],
  placement: PathPlacement
): void {
  const { scaleX, scaleY } = placement;
  const ox = placement.offsetX ?? 0;
  const oy = placement.offsetY ?? 0;
  const px = (v: number): number => ox + v * scaleX;
  const py = (v: number): number => oy + v * scaleY;
  for (const segment of segments) {
    switch (segment.kind) {
      case "move":
        sink.moveTo(px(segment.x), py(segment.y));
        break;
      case "line":
        sink.lineTo(px(segment.x), py(segment.y));
        break;
      case "cubic":
        sink.bezierCurveTo(
          px(segment.x1),
          py(segment.y1),
          px(segment.x2),
          py(segment.y2),
          px(segment.x),
          py(segment.y)
        );
        break;
      case "quad":
        sink.quadraticCurveTo(
          px(segment.x1),
          py(segment.y1),
          px(segment.x),
          py(segment.y)
        );
        break;
      case "close":
        sink.closePath();
        break;
    }
  }
}

/**
 * The axis-aligned bounds of `segments`, in the path's own units (normalized
 * 0..1 for a mask or a shape's `d`) — every anchor point and, for a curve,
 * its control points too. Control points can sit outside a curve's own ink
 * (a cubic can bow inward), so this is a loose superset of the true ink
 * bounds rather than an exact fit; that is the right bias for a layout box,
 * where overshooting a plate/flex box a pixel or two is harmless and
 * clipping the curve's peak is not. `null` for an empty segment list (an
 * empty `d`, already refused earlier by {@link parseSvgPath}, or a mask with
 * no drawable command).
 */
export function pathSegmentBounds(
  segments: readonly PathSegment[]
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (segments.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const segment of segments) {
    switch (segment.kind) {
      case "move":
      case "line":
        consider(segment.x, segment.y);
        break;
      case "cubic":
        consider(segment.x1, segment.y1);
        consider(segment.x2, segment.y2);
        consider(segment.x, segment.y);
        break;
      case "quad":
        consider(segment.x1, segment.y1);
        consider(segment.x, segment.y);
        break;
      case "close":
        break;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { minX, minY, maxX, maxY };
}
