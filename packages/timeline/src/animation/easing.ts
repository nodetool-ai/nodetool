/**
 * Easing functions. Each maps `t ∈ [0,1]` to a progress value; most land in
 * `[0,1]` but the overshoot easings (`easeOutBack`, `easeOutElastic`, any
 * underdamped `spring`) can leave that range on purpose. Callers clamp at the
 * *composition* site (opacity to [0,1], scale to ≥ 0), never here — the
 * overshoot is the point.
 *
 * Two grammars sit beside the seven named ids, parsed by {@link parseEasing}:
 * `cubic-bezier(x1,y1,x2,y2)` and `spring(stiffness,damping,mass)`. An easing
 * is a string in the document (I2), so a build that does not know one falls
 * back to linear rather than failing the document; the validator reports it as
 * `unknown_easing`.
 *
 * Pure; no allocation on the sampling path.
 */

import type { EasingId } from "./types.js";

/** Evaluates one easing at normalized `t`. */
export type EasingFn = (t: number) => number;

const BACK_C1 = 1.70158;
const BACK_C3 = BACK_C1 + 1;

const ELASTIC_C4 = (2 * Math.PI) / 3;

function linear(t: number): number {
  return t;
}

function easeIn(t: number): number {
  return t * t * t;
}

function easeOut(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

function easeInOut(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutBack(t: number): number {
  const u = t - 1;
  return 1 + BACK_C3 * u * u * u + BACK_C1 * u * u;
}

function easeOutElastic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ELASTIC_C4) + 1;
}

function easeOutBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) {
    return n1 * t * t;
  }
  if (t < 2 / d1) {
    const u = t - 1.5 / d1;
    return n1 * u * u + 0.75;
  }
  if (t < 2.5 / d1) {
    const u = t - 2.25 / d1;
    return n1 * u * u + 0.9375;
  }
  const u = t - 2.625 / d1;
  return n1 * u * u + 0.984375;
}

const NAMED_EASINGS: Record<EasingId, EasingFn> = {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  easeOutBack,
  easeOutElastic,
  easeOutBounce
};

/** The named ids, for a caller listing what an `easing` field accepts. */
export const EASING_IDS = Object.keys(NAMED_EASINGS) as EasingId[];

// ── cubic-bezier ──────────────────────────────────────────────────────────

/** Newton iterations before falling back to bisection. */
const BEZIER_NEWTON_STEPS = 8;
/** Bisection steps once Newton is abandoned; halves the interval each time. */
const BEZIER_BISECTION_STEPS = 24;
/** How close `x(t)` must land to the requested x. */
const BEZIER_EPSILON = 1e-4;

/**
 * Build a CSS-style cubic bezier easing over control points `(x1,y1)` and
 * `(x2,y2)`, with `P0 = (0,0)` and `P3 = (1,1)` implied.
 *
 * `x1`/`x2` are clamped to `[0,1]` because a control point outside it makes
 * `x(t)` non-monotonic — there would be several `t` for one `x` and no answer
 * to give. The `y` values are left alone: that is where overshoot lives.
 */
function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): EasingFn {
  const cx1 = Math.min(1, Math.max(0, x1));
  const cx2 = Math.min(1, Math.max(0, x2));

  // Polynomial form of the bezier with P0 = 0, P3 = 1:
  // B(t) = ((a·t + b)·t + c)·t
  const cX = 3 * cx1;
  const bX = 3 * (cx2 - cx1) - cX;
  const aX = 1 - cX - bX;
  const cY = 3 * y1;
  const bY = 3 * (y2 - y1) - cY;
  const aY = 1 - cY - bY;

  const sampleX = (t: number): number => ((aX * t + bX) * t + cX) * t;
  const sampleY = (t: number): number => ((aY * t + bY) * t + cY) * t;
  const slopeX = (t: number): number => (3 * aX * t + 2 * bX) * t + cX;

  const solveT = (x: number): number => {
    let t = x;
    for (let i = 0; i < BEZIER_NEWTON_STEPS; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < BEZIER_EPSILON) return t;
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
      if (t < 0 || t > 1) break;
    }
    // Newton diverged (a flat or out-of-range step). Bisection cannot: x(t) is
    // monotonic on [0,1] once the control x are clamped.
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < BEZIER_BISECTION_STEPS; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < BEZIER_EPSILON) return t;
      if (error > 0) hi = t;
      else lo = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solveT(t));
  };
}

// ── spring ────────────────────────────────────────────────────────────────

/**
 * Residual displacement at which the spring counts as arrived. The easing is
 * scaled so `t = 1` is that moment, which is what makes `f(1)` land within
 * 1e-3 of 1 for every set of constants.
 */
const SPRING_SETTLE_EPSILON = 1e-4;
/** Damping ratios this close to 1 take the critically-damped closed form. */
const SPRING_CRITICAL_EPSILON = 1e-6;

/**
 * Build a spring easing from a damped harmonic oscillator released one unit
 * from rest with zero velocity. `f(t) = 1 - d(t · settleTime)`, where `d` is
 * the remaining displacement — so `f(0) = 0` exactly and `f(1)` is within
 * `SPRING_SETTLE_EPSILON` of 1. An underdamped spring overshoots on the way,
 * which is the reason to ask for one.
 *
 * Returns null for constants that describe no spring: a non-positive mass or
 * stiffness, or zero damping (which never settles, so no scale exists).
 */
function spring(
  stiffness: number,
  damping: number,
  mass: number
): EasingFn | null {
  if (stiffness <= 0 || damping <= 0 || mass <= 0) return null;

  const omega0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  let displacement: EasingFn;
  let settleTime: number;

  if (Math.abs(zeta - 1) < SPRING_CRITICAL_EPSILON) {
    // d(τ) = e^(-ω₀τ)·(1 + ω₀τ): monotonic, never overshoots.
    displacement = (tau: number): number =>
      Math.exp(-omega0 * tau) * (1 + omega0 * tau);
    // (1+x)·e^(-x) = ε has no closed form; the fixed point x = ln((1+x)/ε)
    // converges from below in a handful of steps.
    let x = Math.log(1 / SPRING_SETTLE_EPSILON);
    for (let i = 0; i < 40; i++) {
      x = Math.log((1 + x) / SPRING_SETTLE_EPSILON);
    }
    settleTime = x / omega0;
  } else if (zeta < 1) {
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const ratio = (zeta * omega0) / omegaD;
    displacement = (tau: number): number =>
      Math.exp(-zeta * omega0 * tau) *
      (Math.cos(omegaD * tau) + ratio * Math.sin(omegaD * tau));
    // |cos θ + k·sin θ| ≤ √(1+k²) = 1/√(1−ζ²), so this bounds the envelope.
    const amplitude = 1 / Math.sqrt(1 - zeta * zeta);
    settleTime =
      Math.log(amplitude / SPRING_SETTLE_EPSILON) / (zeta * omega0);
  } else {
    const root = omega0 * Math.sqrt(zeta * zeta - 1);
    const slow = -zeta * omega0 + root; // the decay that outlives the other
    const fast = -zeta * omega0 - root;
    const cSlow = -fast / (slow - fast);
    const cFast = slow / (slow - fast);
    displacement = (tau: number): number =>
      cSlow * Math.exp(slow * tau) + cFast * Math.exp(fast * tau);
    settleTime =
      Math.log(
        (Math.abs(cSlow) + Math.abs(cFast)) / SPRING_SETTLE_EPSILON
      ) / -slow;
  }

  if (!Number.isFinite(settleTime) || settleTime <= 0) return null;

  return (t: number): number => {
    if (t <= 0) return 0;
    return 1 - displacement(t * settleTime);
  };
}

// ── parsing ───────────────────────────────────────────────────────────────

/**
 * Parsed easings, keyed by the exact source string. A document re-samples the
 * same handful of strings every frame, so parsing once matters; the cache is
 * cleared wholesale past a bound rather than evicted, since the working set is
 * the few easings the open document uses.
 */
const PARSE_CACHE = new Map<string, EasingFn | null>();
const PARSE_CACHE_LIMIT = 512;

const FUNCTIONAL_EASING = /^([a-z-]+)\(([^()]*)\)$/;

/** Split a functional easing's argument list into finite numbers, or null. */
function parseArgs(raw: string): number[] | null {
  const parts = raw.split(",");
  const args: number[] = [];
  for (const part of parts) {
    const text = part.trim();
    if (text === "") return null;
    const value = Number(text);
    if (!Number.isFinite(value)) return null;
    args.push(value);
  }
  return args;
}

function compileEasing(id: string): EasingFn | null {
  const text = id.trim();
  const named = NAMED_EASINGS[text as EasingId];
  if (named !== undefined) return named;

  const call = FUNCTIONAL_EASING.exec(text);
  if (!call) return null;
  const args = parseArgs(call[2]);
  if (!args) return null;

  if (call[1] === "cubic-bezier") {
    if (args.length !== 4) return null;
    return cubicBezier(args[0], args[1], args[2], args[3]);
  }
  if (call[1] === "spring") {
    if (args.length !== 3) return null;
    return spring(args[0], args[1], args[2]);
  }
  return null;
}

/**
 * Resolve an easing string to a function, or null when nothing in the grammar
 * matches. Accepts the seven named ids, `cubic-bezier(x1,y1,x2,y2)` and
 * `spring(stiffness,damping,mass)`; whitespace inside the argument list is
 * tolerated. Results are memoized per string, null included.
 */
export function parseEasing(id: string): EasingFn | null {
  const cached = PARSE_CACHE.get(id);
  if (cached !== undefined) return cached;
  const parsed = compileEasing(id);
  if (PARSE_CACHE.size >= PARSE_CACHE_LIMIT) PARSE_CACHE.clear();
  PARSE_CACHE.set(id, parsed);
  return parsed;
}

/**
 * Evaluate easing `id` at `t`. `t` is not clamped; endpoints are exact for the
 * named easings. An id outside the grammar eases linearly — the sampler never
 * throws on a document it cannot read (I2).
 */
export function ease(id: string, t: number): number {
  const fn = parseEasing(id);
  return fn === null ? t : fn(t);
}
