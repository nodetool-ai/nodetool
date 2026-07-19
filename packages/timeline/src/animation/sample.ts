/**
 * Sampler. Folds a clip's `CompiledAnimation[]` into a single `AnimationSample`
 * at a clip-local time. Offsets and rotation add; scale and opacity multiply.
 * Order-independent across animations (the fold is commutative).
 *
 * Pure; supports an optional scratch `out` object so the render loop allocates
 * nothing in the steady state.
 */

import { ease } from "./easing.js";
import type { CompiledAnimation, Keyframe, PropertyCurve } from "./compile.js";

export interface AnimationSample {
  /** px, add to transform.position.x */
  offsetX: number;
  /** px, add to transform.position.y */
  offsetY: number;
  /** multiply transform.scale.x and .y */
  scale: number;
  /** radians, add to transform.rotation */
  rotation: number;
  /** 0..1, multiply layer opacity */
  opacity: number;
}

export const IDENTITY_SAMPLE: Readonly<AnimationSample> = Object.freeze({
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotation: 0,
  opacity: 1
});

function resetIdentity(s: AnimationSample): AnimationSample {
  s.offsetX = 0;
  s.offsetY = 0;
  s.scale = 1;
  s.rotation = 0;
  s.opacity = 1;
  return s;
}

/** Evaluate a curve at normalized `t` (keyframes sorted, first t=0, last t=1). */
function evalCurve(curve: PropertyCurve, t: number): number {
  const kfs = curve.keyframes;
  if (kfs.length === 0) return 0;
  if (t <= kfs[0].t) return kfs[0].value;
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return last.value;
  for (let i = 1; i < kfs.length; i++) {
    const b: Keyframe = kfs[i];
    if (t <= b.t) {
      const a = kfs[i - 1];
      const span = b.t - a.t;
      const segT = span > 0 ? (t - a.t) / span : 0;
      const eased = ease(b.easing ?? "linear", segT);
      return a.value + (b.value - a.value) * eased;
    }
  }
  return last.value;
}

/**
 * Resolve the normalized `t` for one animation at `localMs`, or `null` when the
 * animation contributes identity (outside its window with no hold).
 */
function windowT(anim: CompiledAnimation, localMs: number): number | null {
  if (anim.loop) {
    const period = anim.periodMs ?? anim.windowEndMs - anim.windowStartMs;
    if (period <= 0) return null;
    if (localMs < anim.windowStartMs || localMs >= anim.windowEndMs) return null;
    return ((localMs - anim.windowStartMs) % period) / period;
  }
  if (localMs < anim.windowStartMs) {
    return anim.holdBefore ? 0 : null;
  }
  if (localMs > anim.windowEndMs) {
    return anim.holdAfter ? 1 : null;
  }
  const span = anim.windowEndMs - anim.windowStartMs;
  return span > 0 ? (localMs - anim.windowStartMs) / span : 0;
}

function foldAnimation(anim: CompiledAnimation, t: number, acc: AnimationSample): void {
  for (const curve of anim.curves) {
    const value = evalCurve(curve, t);
    switch (curve.property) {
      case "offsetX":
        acc.offsetX += value;
        break;
      case "offsetY":
        acc.offsetY += value;
        break;
      case "rotation":
        acc.rotation += value;
        break;
      case "scale":
        acc.scale *= value;
        break;
      case "opacity":
        acc.opacity *= value;
        break;
    }
  }
}

/**
 * Fold all compiled animations at `localMs` into one sample. Pass `out` to
 * reuse a scratch object (it is reset before writing).
 */
export function sampleAnimations(
  compiled: CompiledAnimation[],
  localMs: number,
  out?: AnimationSample
): AnimationSample {
  const acc = resetIdentity(out ?? { offsetX: 0, offsetY: 0, scale: 1, rotation: 0, opacity: 1 });
  for (const anim of compiled) {
    const t = windowT(anim, localMs);
    if (t === null) continue;
    foldAnimation(anim, t, acc);
  }
  // Overshoot easings can push these past their natural range.
  if (acc.opacity < 0) acc.opacity = 0;
  else if (acc.opacity > 1) acc.opacity = 1;
  if (acc.scale < 0) acc.scale = 0;
  return acc;
}

/** True when any compiled animation is inside an actively-animating window. */
export function hasActiveAnimationWindow(
  compiled: CompiledAnimation[],
  localMs: number
): boolean {
  for (const anim of compiled) {
    if (anim.loop) {
      if (localMs >= anim.windowStartMs && localMs < anim.windowEndMs) return true;
    } else if (localMs >= anim.windowStartMs && localMs <= anim.windowEndMs) {
      return true;
    }
  }
  return false;
}
