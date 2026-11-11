/**
 * Per-parameter keyframes for what has no animated channel: a clip's volume,
 * crop edges, corner radius, perspective, depth and effect parameters.
 *
 * They live in the clip's optional `paramCurves` field, one curve per name, in
 * the shape of a custom animation's curves, with `t` normalized over the clip.
 * The native editor reads them. Other readers keep the field and draw the
 * static values, and the animation compiler never sees it. These functions keep
 * the field correct through the edits that change a clip's length or effects.
 */

import { sliceCurve } from "./keyframes.js";
import type { ClipParamCurve, TimelineClip } from "./types.js";

/**
 * `timelineClip.paramCurves` in the protocol schema, pinned by
 * `packages/execution/tests/timeline-schema-bounds.test.ts`. A curve's keys are
 * bounded by `MAX_CUSTOM_KEYFRAMES`, since it is the same curve shape.
 */
export const MAX_PARAM_CURVES = 256;

/** A video effect's numeric parameter is the curve `effect:<effectId>:<param>`. */
export function effectCurveName(effectId: string, param: string): string {
  return `effect:${effectId}:${param}`;
}

/**
 * The effect and parameter a curve keys, or null for any other name. An effect
 * id can hold a colon, a parameter cannot.
 */
export function parseEffectCurveName(
  property: string
): { effectId: string; param: string } | null {
  if (!property.startsWith("effect:")) return null;
  const split = property.lastIndexOf(":");
  if (split <= 6 || split + 1 >= property.length) return null;
  return {
    effectId: property.slice(7, split),
    param: property.slice(split + 1)
  };
}

/**
 * `paramCurves` for a clip whose effects are now `effects`: an effect's keys go
 * when the effect goes. Undefined when no curve is left.
 */
export function paramCurvesForEffects(
  paramCurves: readonly ClipParamCurve[] | undefined,
  effects: TimelineClip["effects"]
): ClipParamCurve[] | undefined {
  if (!paramCurves) return undefined;
  const ids = new Set((effects ?? []).map((effect) => effect.id));
  const kept = paramCurves.filter((curve) => {
    const name = parseEffectCurveName(curve.property);
    return !name || ids.has(name.effectId);
  });
  return kept.length > 0 ? kept : undefined;
}

/**
 * One half of a split. A key half a millisecond or more from the cut stays,
 * as in the native editor's split.
 */
export function sliceParamCurves(
  paramCurves: readonly ClipParamCurve[],
  fromT: number,
  toT: number,
  clipDurationMs: number
): ClipParamCurve[] {
  const tolerance = clipDurationMs > 0 ? 0.5 / clipDurationMs : 0;
  return paramCurves.map((curve) => sliceCurve(curve, fromT, toT, tolerance));
}

/**
 * The curves of two adjoining halves as one, for undoing a split. A curve only
 * one half has keeps its keys on that half, and holds its value over the other.
 */
export function joinParamCurves(
  left: readonly ClipParamCurve[] | undefined,
  right: readonly ClipParamCurve[] | undefined,
  leftDurationMs: number,
  rightDurationMs: number
): ClipParamCurve[] | undefined {
  if (!left?.length && !right?.length) return undefined;
  const total = leftDurationMs + rightDurationMs;
  const cut = total > 0 ? leftDurationMs / total : 0;
  const names = new Set([...(left ?? []), ...(right ?? [])].map((c) => c.property));
  return [...names].map((property) => {
    const before = left?.find((c) => c.property === property)?.keyframes ?? [];
    const after = right?.find((c) => c.property === property)?.keyframes ?? [];
    const placed = [
      ...before.map((kf) => ({ ...kf, t: kf.t * cut })),
      ...after.map((kf) => ({ ...kf, t: cut + kf.t * (1 - cut) }))
    ];
    // The split wrote the same value on both sides of the cut, so one is enough.
    const keyframes = placed.filter(
      (kf, index) =>
        index === 0 ||
        kf.t !== placed[index - 1].t ||
        kf.value !== placed[index - 1].value
    );
    return { property, keyframes };
  });
}
