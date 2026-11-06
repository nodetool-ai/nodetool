/**
 * Premiere XML motion data: the keyframe curves a clip carries and the
 * parameter markup Premiere reads for Basic Motion, Opacity, Time Remap and
 * Audio Levels. Pure helpers for `interchange.ts` and `interchangeImport.ts`.
 *
 * Conventions follow the FilmCraft FCP7 writer, storytold/filmcraft
 * `crates/interchange/src/fcp7.rs`, commit 8c171a0. Copyright (c) 2026 ArtCraft
 * Team and the FilmCraft contributors, used under the MIT License. The full
 * notice is in native/timeline/licenses/FilmCraft-MIT.txt. The conventions:
 * - Basic Motion `center` is a fraction of the sequence frame, (0, 0) at the
 *   centre. `centerOffset` is the anchor, a fraction of the source picture.
 * - Keyframe `when` values are source frames, like `in` and `out`.
 * - A keyframe's interpolation describes the segment that leaves it.
 */
import { curveValueAtT, findKeyframeAnimation } from "./keyframes.js";
import type { TimelineClip } from "./types.js";

/** Premiere's `pproTicks` clock: ticks per millisecond. */
export const PPRO_TICKS_PER_MS = 254_016_000;

export interface CurveKey {
  /** 0..1 over the clip. */
  t: number;
  value: number;
  /** Easing of the segment arriving at this key. Absent is linear. */
  easing?: string;
}

/** The hand-set keyframe curves of a clip, by animated property. */
export type ClipCurves = ReadonlyMap<string, readonly CurveKey[]>;

/** The animated properties the Premiere writer carries. */
export const EXPORTED_CURVE_PROPERTIES: readonly string[] = [
  "opacity", "scale", "rotation", "offsetX", "offsetY", "positionX", "positionY", "anchorX", "anchorY"
];

/**
 * The keyframes the user set on a clip (`keyframes.ts`), sorted, with the
 * animation's own easing applied to every segment when it sets one. Preset and
 * baked animations are not read: they are windows with roles, not keyframes.
 */
export function clipCurves(clip: Pick<TimelineClip, "animations">): ClipCurves {
  const animation = findKeyframeAnimation(clip);
  const curves = new Map<string, CurveKey[]>();
  if (!animation?.custom || animation.enabled === false) return curves;
  for (const curve of animation.custom.curves) {
    if (curve.keyframes.length === 0) continue;
    const keys = [...curve.keyframes]
      .sort((left, right) => left.t - right.t)
      .map((key): CurveKey => {
        const easing = animation.easing ?? key.easing;
        return easing === undefined ? { t: key.t, value: key.value } : { t: key.t, value: key.value, easing };
      });
    curves.set(curve.property, keys);
  }
  return curves;
}

export type Interpolation = "linear" | "hold" | "curve";

export function interpolationOf(easing: string | undefined): Interpolation {
  if (easing === undefined || easing === "linear") return "linear";
  return easing === "hold" ? "hold" : "curve";
}

export interface MotionKey {
  /** 0..1 over the clip. */
  t: number;
  /** How the segment leaving this key runs. */
  interpolation: Interpolation;
}

/**
 * The key times of one Premiere parameter fed by several curves, such as
 * `center` from `offsetX` and `offsetY`. Times that agree to a millionth are
 * one key. A single key is a constant, so it returns none.
 */
export function motionKeys(curves: readonly (readonly CurveKey[] | undefined)[]): MotionKey[] {
  const times = new Set<number>();
  for (const curve of curves) {
    for (const key of curve ?? []) times.add(Math.round(key.t * 1e6) / 1e6);
  }
  const sorted = [...times].sort((left, right) => left - right);
  if (sorted.length < 2) return [];
  return sorted.map((t, position) => {
    let easing: string | undefined;
    if (position + 1 < sorted.length) {
      for (const curve of curves) {
        const arriving = curve?.find((key) => key.t > t + 1e-6);
        if (arriving) { easing = arriving.easing; break; }
      }
    }
    return { t, interpolation: interpolationOf(easing) };
  });
}

/** A curve's value at `t`, or `fallback` for a property with no curve. */
export function curveAt(curve: readonly CurveKey[] | undefined, t: number, fallback: number): number {
  return curve && curve.length > 0 ? curveValueAtT(curve, t) : fallback;
}

export interface OutKey {
  /** Source frame. */
  frame: number;
  interpolation: Interpolation;
}

function number(value: number, digits = 6): string {
  return String(Number(value.toFixed(digits)));
}

function interpolationXml(interpolation: Interpolation): string {
  if (interpolation === "linear") return "";
  return `<interpolation><name>${interpolation === "hold" ? "hold" : "FCPCurve"}</name></interpolation>`;
}

function parameterHead(id: string, name: string, range?: readonly [number, number]): string {
  const bounds = range ? `<valuemin>${number(range[0])}</valuemin><valuemax>${number(range[1])}</valuemax>` : "";
  return `<parameter authoringApp="PremierePro"><parameterid>${id}</parameterid><name>${name}</name>${bounds}`;
}

/** A numeric parameter. `at(index)` is the value at key `index`, or at 0 with no keys. */
export function scalarParameter(
  id: string,
  name: string,
  range: readonly [number, number] | undefined,
  keys: readonly OutKey[],
  at: (index: number) => number
): string {
  const keyXml = keys
    .map((key, index) => `<keyframe><when>${key.frame}</when><value>${number(at(index))}</value>${interpolationXml(key.interpolation)}</keyframe>`)
    .join("");
  return `${parameterHead(id, name, range)}<value>${number(at(0))}</value>${keyXml}</parameter>`;
}

/** A point parameter, with `horiz` and `vert` fractions. */
export function pointParameter(
  id: string,
  name: string,
  keys: readonly OutKey[],
  at: (index: number) => { horiz: number; vert: number }
): string {
  const value = (point: { horiz: number; vert: number }): string =>
    `<value><horiz>${number(point.horiz, 8)}</horiz><vert>${number(point.vert, 8)}</vert></value>`;
  const keyXml = keys
    .map((key, index) => `<keyframe><when>${key.frame}</when>${value(at(index))}${interpolationXml(key.interpolation)}</keyframe>`)
    .join("");
  return `${parameterHead(id, name)}${value(at(0))}${keyXml}</parameter>`;
}
