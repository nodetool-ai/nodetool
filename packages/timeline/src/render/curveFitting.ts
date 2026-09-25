import type { CurvePoint } from "../types.js";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** The parametric knobs `color.curves@1` takes, fitted to a point list. */
interface CurveKnobs {
  blackPoint: number;
  whitePoint: number;
  shadows: number;
  midtones: number;
  highlights: number;
}

const IDENTITY_CURVE: CurveKnobs = {
  blackPoint: 0,
  whitePoint: 1,
  shadows: 0,
  midtones: 0,
  highlights: 0
};

/** Read a control-point curve at `x`: piecewise linear, flat past the ends. */
function sampleCurve(points: readonly CurvePoint[], x: number): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return x;
  if (x <= first.x) return first.y;
  if (x >= last.x) return last.y;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b || x > b.x) continue;
    const span = b.x - a.x;
    return span <= 0 ? b.y : a.y + ((x - a.x) / span) * (b.y - a.y);
  }
  return last.y;
}

/**
 * Fit a point list onto `color.curves@1`, which is parametric rather than a
 * LUT: a black/white remap, then a shadow lift, a midtone gamma and a
 * highlight roll.
 *
 * The toe and shoulder come from the knots that sit at 0 and 1 — a levels-style
 * curve is exact. The three bends are then solved in the shader's own order
 * from the quarter, mid and three-quarter samples, so a curve that moves only
 * one of them reproduces exactly and one that moves several is close. It is a
 * fit, not a translation: no set of three parameters draws an arbitrary curve.
 */
export function fitCurve(points: readonly CurvePoint[]): CurveKnobs {
  const sorted = points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .slice()
    .sort((a, b) => a.x - b.x);
  if (sorted.length < 2) return IDENTITY_CURVE;

  let blackPoint = 0;
  let whitePoint = 1;
  for (const p of sorted) {
    if (p.y <= 0.001) blackPoint = clamp(p.x, 0, 1);
  }
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    if (p && p.y >= 0.999) whitePoint = clamp(p.x, 0, 1);
  }
  if (whitePoint - blackPoint < 0.01) return IDENTITY_CURVE;

  // Residual curve after the remap: what the three bends have to produce.
  const at = (u: number): number =>
    clamp(sampleCurve(sorted, blackPoint + u * (whitePoint - blackPoint)), 0, 1);
  const t25 = at(0.25);
  const t50 = at(0.5);
  const t75 = at(0.75);

  // Gamma first, from the midpoint: `pow(0.5, 1 / (1 + midtones)) = t50`.
  const midtones = clamp(Math.log(0.5) / Math.log(safeUnit(t50)) - 1, -0.9, 9);
  const gamma = 1 / (1 + midtones);

  // Shadows next: undo the gamma at the quarter tone to read what the lift
  // `u + shadows × u × (1 - u)` must have produced there.
  const shadows = clamp((Math.pow(t25, 1 / gamma) - 0.25) / 0.1875, -1, 1);

  // Highlights last, on the three-quarter tone the first two have already bent.
  const lifted = 0.75 + shadows * 0.75 * 0.25;
  const bent = Math.pow(clamp(lifted, 0, 1), gamma);
  const room = bent * (1 - bent);
  const highlights = room > 0.001 ? clamp((t75 - bent) / room, -1, 1) : 0;

  return { blackPoint, whitePoint, shadows, midtones, highlights };
}

/**
 * A per-channel curve reduces to that channel's midtone gamma, which is the
 * only per-channel knob `color.curves@1` has. Absent means neutral.
 */
export function channelMidtones(points: readonly CurvePoint[] | undefined): number {
  if (!points || points.length < 2) return 0;
  const mid = clamp(sampleCurve(points, 0.5), 0, 1);
  return clamp(Math.log(0.5) / Math.log(safeUnit(mid)) - 1, -0.9, 9);
}

/** Keep a sample off 0 and 1, where the log solve has no answer. */
function safeUnit(v: number): number {
  return Math.min(0.999, Math.max(0.001, v));
}
