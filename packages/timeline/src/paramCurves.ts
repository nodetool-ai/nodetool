/**
 * Per-parameter keyframes for what has no animated channel: a clip's volume,
 * crop edges, corner radius, perspective, depth and effect parameters.
 *
 * They live in the clip's optional `paramCurves` field, one curve per name, in
 * the shape of a custom animation's curves, with `t` normalized over the clip.
 * The render plan reads them through {@link keyedClipAt}, and the audio graphs
 * read `volumeDb` through {@link paramCurveAt}, as the native editor does. The
 * animation compiler never sees the field. The other functions keep it correct
 * through the edits that change a clip's length or effects.
 */

import { curveValueAtT, sliceCurve } from "./keyframes.js";
import { IDENTITY_TRANSFORM } from "./render/transform.js";
import type { ClipCrop, ClipParamCurve, TimelineClip } from "./types.js";

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

type CurvePoint = { t: number; value: number; easing?: string };

/** A curve's finite keys, sorted by `t`; empty when it has none. */
function curvePoints(curve: ClipParamCurve): CurvePoint[] {
  return curve.keyframes
    .filter((k) => Number.isFinite(k.t) && Number.isFinite(k.value))
    .sort((a, b) => a.t - b.t);
}

/** Where `timeMs` (sequence time) falls over the clip, 0..1. */
function clipT(clip: Pick<TimelineClip, "startMs" | "durationMs">, timeMs: number): number {
  const t = (timeMs - clip.startMs) / clip.durationMs;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * The value of `clip`'s param curve `property` at `timeMs` (sequence time), or
 * undefined when the property has no keys. Each segment eases by its later key.
 */
export function paramCurveAt(
  clip: Pick<TimelineClip, "paramCurves" | "startMs" | "durationMs">,
  property: string,
  timeMs: number
): number | undefined {
  if (!clip.paramCurves || clip.durationMs <= 0) return undefined;
  for (const curve of clip.paramCurves) {
    if (curve.property !== property) continue;
    const points = curvePoints(curve);
    if (points.length > 0) return curveValueAtT(points, clipT(clip, timeMs));
  }
  return undefined;
}

const CROP_EDGES = [
  ["left", "cropLeft"],
  ["right", "cropRight"],
  ["top", "cropTop"],
  ["bottom", "cropBottom"]
] as const;
/** The picture a keyed crop always leaves, as the crop edit does. */
const MAX_CROP = 0.95;

function keyedCrop(clip: TimelineClip, timeMs: number): ClipCrop | undefined {
  let keyed = false;
  const crop: ClipCrop = { left: 0, right: 0, top: 0, bottom: 0, ...clip.crop };
  for (const [edge, property] of CROP_EDGES) {
    const value = paramCurveAt(clip, property, timeMs);
    if (value === undefined) continue;
    crop[edge] = Math.min(MAX_CROP, Math.max(0, value));
    keyed = true;
  }
  if (!keyed) return undefined;
  // Opposite edges keyed at their own times can meet between keys.
  for (const [a, b] of [["left", "right"], ["top", "bottom"]] as const) {
    const total = crop[a] + crop[b];
    if (total > MAX_CROP) {
      crop[a] = (crop[a] * MAX_CROP) / total;
      crop[b] = (crop[b] * MAX_CROP) / total;
    }
  }
  return crop;
}

/**
 * `clip` with its keyed crop, corner radius, perspective, depth and effect
 * parameters at `timeMs` (sequence time): `perspective` replaces when above
 * zero, `depthPx` adds to the clip's own, an effect key replaces that
 * parameter. The clip itself when it has no param curves.
 */
export function keyedClipAt(clip: TimelineClip, timeMs: number): TimelineClip {
  if (!clip.paramCurves?.length || clip.durationMs <= 0) return clip;
  const patch: Partial<TimelineClip> = {};
  const crop = keyedCrop(clip, timeMs);
  if (crop) patch.crop = crop;
  const radius = paramCurveAt(clip, "borderRadius", timeMs);
  if (radius !== undefined) patch.borderRadius = Math.max(0, radius);
  const perspective = paramCurveAt(clip, "perspective", timeMs);
  const depth = paramCurveAt(clip, "depthPx", timeMs);
  if ((perspective !== undefined && perspective > 0) || depth !== undefined) {
    const transform = { ...(clip.transform ?? IDENTITY_TRANSFORM) };
    if (perspective !== undefined && perspective > 0) transform.perspective = perspective;
    if (depth !== undefined) transform.depthPx = (transform.depthPx ?? 0) + depth;
    patch.transform = transform;
  }
  let effects = clip.effects;
  for (const curve of clip.paramCurves) {
    const name = parseEffectCurveName(curve.property);
    const index = name && effects ? effects.findIndex((effect) => effect.id === name.effectId) : -1;
    const value = index >= 0 ? paramCurveAt(clip, curve.property, timeMs) : undefined;
    if (!name || !effects || value === undefined) continue;
    if (effects === clip.effects) effects = [...effects];
    effects[index] = { ...effects[index], [name.param]: value } as (typeof effects)[number];
  }
  if (effects !== clip.effects) patch.effects = effects;
  return Object.keys(patch).length > 0 ? { ...clip, ...patch } : clip;
}
