/**
 * Easing functions. Each maps `t ∈ [0,1]` to a progress value; most land in
 * `[0,1]` but the overshoot easings (`easeOutBack`, `easeOutElastic`) can leave
 * that range on purpose. Callers clamp at the *composition* site (opacity to
 * [0,1], scale to ≥ 0), never here — the overshoot is the point.
 *
 * Pure; no allocation.
 */

import type { EasingId } from "./types.js";

const BACK_C1 = 1.70158;
const BACK_C3 = BACK_C1 + 1;

const ELASTIC_C4 = (2 * Math.PI) / 3;

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

/** Evaluate easing `id` at `t`. `t` is not clamped; endpoints are exact. */
export function ease(id: EasingId, t: number): number {
  switch (id) {
    case "linear":
      return t;
    case "easeIn":
      return easeIn(t);
    case "easeOut":
      return easeOut(t);
    case "easeInOut":
      return easeInOut(t);
    case "easeOutBack":
      return easeOutBack(t);
    case "easeOutElastic":
      return easeOutElastic(t);
    case "easeOutBounce":
      return easeOutBounce(t);
    default:
      return t;
  }
}
