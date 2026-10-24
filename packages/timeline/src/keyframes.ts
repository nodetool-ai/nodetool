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

import { ease } from "./animation/easing.js";
import type { ClipAnimation, CustomClipAnimation } from "./animation/types.js";
import { ANIMATED_PROPERTY_FOLD, type AnimatedProperty } from "./animation/types.js";
import { createTimeOrderedUuid } from "./defaults.js";
import { MODEL3D_CAMERA_PROPERTIES } from "./model3d.js";
import type { TimelineClip } from "./types.js";

/**
 * Every property the keyframe inspector can offer. The four camera channels
 * only mean anything on a `model3d` clip — keyed on any other, they render
 * nothing, the way `wipeProgress` does without a mask — so a UI walks
 * {@link keyframePropertiesFor} rather than this list.
 */
export const KEYFRAME_PROPERTIES = [
  "opacity",
  "scale",
  "offsetX",
  "offsetY",
  "rotation",
  ...MODEL3D_CAMERA_PROPERTIES
] as const satisfies readonly AnimatedProperty[];
export type KeyframeProperty = (typeof KEYFRAME_PROPERTIES)[number];

/** The keyframe properties that apply to `clip`, in inspector order. */
export function keyframePropertiesFor(
  clip: Pick<TimelineClip, "mediaType">
): readonly KeyframeProperty[] {
  if (clip.mediaType === "model3d") return KEYFRAME_PROPERTIES;
  return KEYFRAME_PROPERTIES.filter(
    (property) =>
      !(MODEL3D_CAMERA_PROPERTIES as readonly string[]).includes(property)
  );
}

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

/**
 * Every keyframe time (clip-relative ms), sorted: across all properties, or
 * across `properties` when given.
 */
export function keyframeTimesMs(
  clip: Pick<TimelineClip, "animations" | "durationMs">,
  properties?: readonly AnimatedProperty[]
): number[] {
  const animation = findKeyframeAnimation(clip);
  if (!animation?.custom) return [];
  const times = new Set<number>();
  for (const curve of animation.custom.curves) {
    if (properties && !(properties as readonly string[]).includes(curve.property)) {
      continue;
    }
    for (const kf of curve.keyframes) {
      times.add(Math.round(kf.t * clip.durationMs));
    }
  }
  return [...times].sort((a, b) => a - b);
}

/**
 * One property's curve at `atMs`, eased the way the sampler eases it: the
 * animation's own easing overrides every segment, otherwise each keyframe's
 * easing, otherwise linear. Identity without a curve.
 */
export function keyframeValueAt(
  clip: Pick<TimelineClip, "animations" | "durationMs">,
  property: AnimatedProperty,
  atMs: number
): number {
  const animation = findKeyframeAnimation(clip);
  const curve = animation?.custom?.curves.find((c) => c.property === property);
  if (!curve || curve.keyframes.length === 0) return keyframeIdentity(property);
  const override = animation?.easing;
  const kfs = [...curve.keyframes]
    .sort((a, b) => a.t - b.t)
    .map((kf) =>
      override === undefined ? kf : { ...kf, easing: override }
    );
  return curveValueAtT(kfs, toT(clip, atMs));
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
  // Fields set elsewhere (the Animate section's easing) survive a keyframe edit.
  const next: ClipAnimation = {
    ...existing,
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
    const replaced = curve?.keyframes.find(
      (kf) => Math.abs(kf.t - t) < T_EPSILON
    );
    const kept = (curve?.keyframes ?? []).filter((kf) => kf !== replaced);
    // Updating a keyframe keeps the easing chosen for its segment.
    const keyframe =
      replaced?.easing === undefined
        ? { t, value }
        : { t, value, easing: replaced.easing };
    const keyframes = [...kept, keyframe].sort((a, b) => a.t - b.t);
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

type KeyframeCurve = CustomClipAnimation["curves"][number];
type CurveKeyframe = KeyframeCurve["keyframes"][number];

/**
 * A curve's value at `t`, by the sampler's rule: held flat outside the first
 * and last keyframes, and each segment eased by its later keyframe's easing.
 * `keyframes` must be sorted by `t` and non-empty. Track automation lanes
 * evaluate through it too, with `t` in document milliseconds.
 */
export function curveValueAtT(
  keyframes: readonly { t: number; value: number; easing?: string }[],
  t: number
): number {
  if (t <= keyframes[0].t) return keyframes[0].value;
  const last = keyframes[keyframes.length - 1];
  if (t >= last.t) return last.value;
  for (let i = 1; i < keyframes.length; i++) {
    if (t > keyframes[i].t) continue;
    const a = keyframes[i - 1];
    const b = keyframes[i];
    const span = b.t - a.t;
    const f = span > 0 ? ease(b.easing ?? "linear", (t - a.t) / span) : 1;
    return a.value + (b.value - a.value) * f;
  }
  return last.value;
}

/**
 * The hand-keyframe animation restricted to `fromT..toT` of the clip and
 * renormalized over that span, for one half of a split. Each half keeps the
 * keyframes inside its span plus an interpolated keyframe on each new edge, so
 * both halves show the motion the unsplit clip showed at the same instants.
 */
export function sliceKeyframeAnimation(
  animation: ClipAnimation,
  fromT: number,
  toT: number,
  durationMs: number
): ClipAnimation {
  const span = toT - fromT;
  if (!animation.custom || span <= 0) {
    return { ...animation, durationMs };
  }
  const curves = animation.custom.curves.map((curve) => {
    if (curve.keyframes.length === 0) return curve;
    const sorted = [...curve.keyframes].sort((a, b) => a.t - b.t);
    const inside = sorted.filter(
      (kf) => kf.t > fromT + T_EPSILON && kf.t < toT - T_EPSILON
    );
    const head: CurveKeyframe = { t: fromT, value: curveValueAtT(sorted, fromT) };
    const tailSource = sorted.find((kf) => kf.t >= toT - T_EPSILON);
    const tail: CurveKeyframe = { t: toT, value: curveValueAtT(sorted, toT) };
    if (tailSource?.easing !== undefined) tail.easing = tailSource.easing;
    return {
      ...curve,
      keyframes: [head, ...inside, tail].map((kf) => ({
        ...kf,
        t: Math.max(0, Math.min(1, (kf.t - fromT) / span))
      }))
    };
  });
  return {
    ...animation,
    durationMs,
    custom: { ...animation.custom, curves }
  };
}

/** Whether `property` has at least one hand-set keyframe: its stopwatch is on. */
export function isPropertyKeyframed(
  clip: Pick<TimelineClip, "animations">,
  property: AnimatedProperty
): boolean {
  const curve = findKeyframeAnimation(clip)?.custom?.curves.find(
    (c) => c.property === property
  );
  return (curve?.keyframes.length ?? 0) > 0;
}

/**
 * Set several properties at one instant, as one edit. Position is two curves
 * (`offsetX`, `offsetY`) that a user keys together, the way Premiere keys one
 * Position property.
 */
export function setKeyframes(
  clip: TimelineClip,
  entries: readonly { property: AnimatedProperty; value: number }[],
  atMs: number
): ClipAnimation[] {
  let working = clip;
  for (const { property, value } of entries) {
    working = { ...working, animations: setKeyframe(working, property, atMs, value) };
  }
  return working.animations ?? [];
}

/** Remove every keyframe of `properties` at `atMs`. */
export function removeKeyframes(
  clip: TimelineClip,
  properties: readonly AnimatedProperty[],
  atMs: number
): ClipAnimation[] {
  let working = clip;
  for (const property of properties) {
    working = { ...working, animations: removeKeyframe(working, property, atMs) };
  }
  return working.animations ?? [];
}

/** Drop the curves of `properties` entirely: their stopwatch turned off. */
export function clearKeyframes(
  clip: TimelineClip,
  properties: readonly AnimatedProperty[]
): ClipAnimation[] {
  return withCurves(clip, (curves) =>
    curves.filter(
      (c) => !(properties as readonly string[]).includes(c.property)
    )
  );
}

/**
 * Move the keyframes of `properties` at `fromMs` to `toMs`. A keyframe
 * already at `toMs` on the same curve is replaced, the way dropping one
 * keyframe on another works in Premiere.
 */
export function moveKeyframes(
  clip: TimelineClip,
  properties: readonly AnimatedProperty[],
  fromMs: number,
  toMs: number
): ClipAnimation[] {
  const fromT = toT(clip, fromMs);
  const targetT = toT(clip, toMs);
  return withCurves(clip, (curves) =>
    curves.map((c) => {
      if (!(properties as readonly string[]).includes(c.property)) return c;
      const moving = c.keyframes.find((kf) => Math.abs(kf.t - fromT) < T_EPSILON);
      if (!moving) return c;
      const kept = c.keyframes.filter(
        (kf) =>
          kf !== moving && Math.abs(kf.t - targetT) >= T_EPSILON
      );
      const keyframes = [...kept, { ...moving, t: targetT }].sort(
        (a, b) => a.t - b.t
      );
      return { ...c, keyframes };
    })
  );
}

/**
 * The nearest keyframe time of `properties` strictly after (`1`) or before
 * (`-1`) `atMs`, or null. Times within half a millisecond count as "here".
 */
export function adjacentKeyframeMs(
  clip: Pick<TimelineClip, "animations" | "durationMs">,
  properties: readonly AnimatedProperty[],
  atMs: number,
  direction: 1 | -1
): number | null {
  const times = keyframeTimesMs(clip, properties);
  if (direction === 1) {
    return times.find((t) => t > atMs + 0.5) ?? null;
  }
  for (let i = times.length - 1; i >= 0; i--) {
    if (times[i] < atMs - 0.5) return times[i];
  }
  return null;
}

/**
 * The easing of the segment that arrives at `property`'s keyframe at `atMs`,
 * as the sampler applies it: the animation-wide override first, then the
 * keyframe's own, then linear. Undefined when there is no keyframe there.
 */
export function keyframeEasingAt(
  clip: Pick<TimelineClip, "animations" | "durationMs">,
  property: AnimatedProperty,
  atMs: number
): string | undefined {
  const animation = findKeyframeAnimation(clip);
  const curve = animation?.custom?.curves.find((c) => c.property === property);
  const t = toT(clip, atMs);
  const kf = curve?.keyframes.find((k) => Math.abs(k.t - t) < T_EPSILON);
  if (!kf) return undefined;
  return animation?.easing ?? kf.easing ?? "linear";
}

/**
 * Set the easing into the keyframes of `properties` at `atMs`. An
 * animation-wide easing override would hide a per-keyframe choice, so it is
 * pushed down onto every keyframe first and dropped: every other segment
 * keeps the motion it had.
 */
export function setKeyframeEasing(
  clip: TimelineClip,
  properties: readonly AnimatedProperty[],
  atMs: number,
  easing: string
): ClipAnimation[] {
  const existing = findKeyframeAnimation(clip);
  if (!existing?.custom) return clip.animations ?? [];
  const override = existing.easing;
  const t = toT(clip, atMs);
  const curves = existing.custom.curves.map((c) => {
    const hit = (properties as readonly string[]).includes(c.property);
    return {
      ...c,
      keyframes: c.keyframes.map((kf) => {
        if (hit && Math.abs(kf.t - t) < T_EPSILON) return { ...kf, easing };
        return override === undefined ? kf : { ...kf, easing: override };
      })
    };
  });
  const next: ClipAnimation = { ...existing, custom: { ...existing.custom, curves } };
  delete next.easing;
  return (clip.animations ?? []).map((a) => (a === existing ? next : a));
}

/**
 * The value a viewer sees for `property`: the clip's authored `base` folded
 * with the keyframe value, the way the sampler folds it onto the clip.
 */
export function composeKeyframeValue(
  property: AnimatedProperty,
  base: number,
  value: number
): number {
  const fold = ANIMATED_PROPERTY_FOLD[property];
  if (fold === "add") return base + value;
  if (fold === "multiply") return base * value;
  return value;
}

/**
 * The keyframe value that makes `property` read `composed` on top of `base`:
 * the inverse of {@link composeKeyframeValue}. Null when no value can, which
 * is a multiplied property whose base is zero.
 */
export function keyframeValueForComposed(
  property: AnimatedProperty,
  base: number,
  composed: number
): number | null {
  const fold = ANIMATED_PROPERTY_FOLD[property];
  if (fold === "add") return composed - base;
  if (fold === "multiply") return base === 0 ? null : composed / base;
  return composed;
}
