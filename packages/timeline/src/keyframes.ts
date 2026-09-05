/**
 * Per-property keyframes on a clip.
 *
 * A clip's hand-set keyframes live in one custom animation that spans the
 * whole clip: `preset: "custom"`, `role: "emphasis"`, no delay, duration equal
 * to the clip's, one curve per property. The sampler already knows how to
 * play such a curve (`animation/compile.ts`), so a keyframe set here renders
 * everywhere a preset does. Keyframe times are stored as `t` in 0..1 over the
 * clip, so trimming the clip stretches its keyframes with it.
 *
 * These are pure functions over one clip; the store wraps them.
 */

import type { ClipAnimation, CustomClipAnimation } from "./animation/types.js";
import { ANIMATED_PROPERTY_FOLD, type AnimatedProperty } from "./animation/types.js";
import { createTimeOrderedUuid } from "./defaults.js";
import type { TimelineClip } from "./types.js";

/** The properties the keyframe inspector offers, with their identity value. */
export const KEYFRAME_PROPERTIES = [
  "opacity",
  "scale",
  "offsetX",
  "offsetY",
  "rotation"
] as const satisfies readonly AnimatedProperty[];
export type KeyframeProperty = (typeof KEYFRAME_PROPERTIES)[number];

/** The value that changes nothing for a property, by how it folds. */
export function keyframeIdentity(property: AnimatedProperty): number {
  const fold = ANIMATED_PROPERTY_FOLD[property];
  return fold === "multiply" ? 1 : 0;
}

export const KEYFRAME_ANIMATION_PRESET = "custom";
/** Two keyframes closer than this (in `t`) are the same keyframe. */
const T_EPSILON = 1e-4;

export function isKeyframeAnimation(animation: ClipAnimation): boolean {
  return (
    animation.preset === KEYFRAME_ANIMATION_PRESET &&
    animation.role === "emphasis" &&
    (animation.delayMs ?? 0) === 0 &&
    animation.params?.keyframed === true
  );
}

export function findKeyframeAnimation(
  clip: Pick<TimelineClip, "animations">
): ClipAnimation | undefined {
  return clip.animations?.find(isKeyframeAnimation);
}

function toT(clip: Pick<TimelineClip, "durationMs">, atMs: number): number {
  if (clip.durationMs <= 0) return 0;
  return Math.max(0, Math.min(1, atMs / clip.durationMs));
}

/** Every keyframe time (clip-relative ms) across all properties, sorted. */
export function keyframeTimesMs(
  clip: Pick<TimelineClip, "animations" | "durationMs">
): number[] {
  const animation = findKeyframeAnimation(clip);
  if (!animation?.custom) return [];
  const times = new Set<number>();
  for (const curve of animation.custom.curves) {
    for (const kf of curve.keyframes) {
      times.add(Math.round(kf.t * clip.durationMs));
    }
  }
  return [...times].sort((a, b) => a - b);
}

/** Linear sample of one property's curve at `atMs`; identity without one. */
export function keyframeValueAt(
  clip: Pick<TimelineClip, "animations" | "durationMs">,
  property: AnimatedProperty,
  atMs: number
): number {
  const curve = findKeyframeAnimation(clip)?.custom?.curves.find(
    (c) => c.property === property
  );
  if (!curve || curve.keyframes.length === 0) return keyframeIdentity(property);
  const t = toT(clip, atMs);
  const kfs = [...curve.keyframes].sort((a, b) => a.t - b.t);
  if (t <= kfs[0].t) return kfs[0].value;
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return last.value;
  for (let i = 1; i < kfs.length; i++) {
    if (t <= kfs[i].t) {
      const a = kfs[i - 1];
      const b = kfs[i];
      const span = b.t - a.t;
      const f = span <= 0 ? 1 : (t - a.t) / span;
      return a.value + (b.value - a.value) * f;
    }
  }
  return last.value;
}

/** Whether `property` has a keyframe at `atMs` (within a frame's rounding). */
export function hasKeyframeAt(
  clip: Pick<TimelineClip, "animations" | "durationMs">,
  property: AnimatedProperty,
  atMs: number
): boolean {
  const curve = findKeyframeAnimation(clip)?.custom?.curves.find(
    (c) => c.property === property
  );
  if (!curve) return false;
  const t = toT(clip, atMs);
  return curve.keyframes.some((kf) => Math.abs(kf.t - t) < T_EPSILON);
}

function withCurves(
  clip: TimelineClip,
  update: (curves: CustomClipAnimation["curves"]) => CustomClipAnimation["curves"]
): ClipAnimation[] {
  const animations = clip.animations ?? [];
  const existing = findKeyframeAnimation(clip);
  const curves = update(existing?.custom?.curves ?? []);
  const live = curves.filter((c) => c.keyframes.length > 0);
  if (live.length === 0) {
    return animations.filter((a) => a !== existing);
  }
  const next: ClipAnimation = {
    id: existing?.id ?? createTimeOrderedUuid(),
    role: "emphasis",
    preset: KEYFRAME_ANIMATION_PRESET,
    durationMs: clip.durationMs,
    delayMs: 0,
    enabled: true,
    params: { keyframed: true },
    custom: { ...(existing?.custom ?? {}), curves: live }
  };
  return existing
    ? animations.map((a) => (a === existing ? next : a))
    : [...animations, next];
}

/**
 * Set `property` to `value` at `atMs`, adding a keyframe or updating the one
 * already there. Returns the clip's new animation list.
 */
export function setKeyframe(
  clip: TimelineClip,
  property: AnimatedProperty,
  atMs: number,
  value: number
): ClipAnimation[] {
  const t = toT(clip, atMs);
  return withCurves(clip, (curves) => {
    const others = curves.filter((c) => c.property !== property);
    const curve = curves.find((c) => c.property === property);
    const kept = (curve?.keyframes ?? []).filter(
      (kf) => Math.abs(kf.t - t) >= T_EPSILON
    );
    const keyframes = [...kept, { t, value }].sort((a, b) => a.t - b.t);
    return [...others, { property, keyframes }];
  });
}

/** Remove `property`'s keyframe at `atMs`, if any. */
export function removeKeyframe(
  clip: TimelineClip,
  property: AnimatedProperty,
  atMs: number
): ClipAnimation[] {
  const t = toT(clip, atMs);
  return withCurves(clip, (curves) =>
    curves.map((c) =>
      c.property === property
        ? {
            ...c,
            keyframes: c.keyframes.filter((kf) => Math.abs(kf.t - t) >= T_EPSILON)
          }
        : c
    )
  );
}
