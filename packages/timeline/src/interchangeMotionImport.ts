/**
 * Premiere XML import, motion half: turns the Basic Motion, Opacity and Audio
 * Levels parameters of one clipitem into transform, opacity, keyframe and fade
 * fields. The inverse of the writer in `interchangeMotion.ts`, so the same
 * conventions apply. They come from FilmCraft `fcp7.rs` (commit 8c171a0,
 * Copyright (c) 2026 ArtCraft Team and the FilmCraft contributors, MIT License,
 * see native/timeline/licenses/FilmCraft-MIT.txt).
 *
 * Pure data in, clip fields out: the XML reading stays in `interchangeImport.ts`.
 */
import { fadeShapeGain, type ClipFadeShape } from "./audioFade.js";
import { createTimeOrderedUuid } from "./defaults.js";
import type { Interpolation } from "./interchangeMotion.js";
import type { ClipAnimation } from "./animation/types.js";
import type { ClipTransform, TimelineClip } from "./types.js";

export interface Point {
  x: number;
  y: number;
}

export interface ParamKey<T> {
  /** Source frame, as Premiere writes `when`. */
  when: number;
  value: T;
  /** How the segment leaving this key runs. */
  interpolation: Interpolation;
}

export interface ScalarParam {
  value: number;
  keys: ParamKey<number>[];
}

export interface PointParam {
  value: Point;
  keys: ParamKey<Point>[];
}

/** The parameters of one visual clipitem, as read. */
export interface VisualMotion {
  scale?: ScalarParam;
  rotation?: ScalarParam;
  center?: PointParam;
  anchor?: PointParam;
  opacity?: ScalarParam;
}

export interface MotionContext {
  /** The sequence frame in pixels. */
  frame: { width: number; height: number };
  /** The picture's own size when the file said. */
  picture?: { width: number; height: number };
  frameMs: number;
  /** The clipitem's source frames. */
  in: number;
  out: number;
  /** Source frames per timeline frame. */
  speed: number;
  reverse: boolean;
  durationMs: number;
  /** Receives anything that could not be carried over. */
  warn(message: string): void;
}

interface CurveKey {
  t: number;
  value: number;
  easing?: string;
}

const round = (value: number): number => Number(value.toFixed(6));

/** The clip-local fraction (0..1) a source frame falls on. */
function localT(frame: number, context: MotionContext): number {
  const localFrames = context.reverse ? (context.out - frame) / context.speed : (frame - context.in) / context.speed;
  return context.durationMs > 0 ? (localFrames * context.frameMs) / context.durationMs : 0;
}

/**
 * A parameter's keys as curve keys over the clip. Keys outside the clip are
 * cut at its edges, with the value the curve had there. An arriving segment
 * takes the easing of the key it leaves.
 */
function curveOf(keys: readonly ParamKey<number>[], context: MotionContext): CurveKey[] {
  const timed = keys
    .map((key) => ({ t: localT(key.when, context), value: key.value, interpolation: key.interpolation }))
    .sort((left, right) => left.t - right.t);
  const valueAt = (t: number): number => {
    if (t <= timed[0]!.t) return timed[0]!.value;
    for (let index = 1; index < timed.length; index += 1) {
      const right = timed[index]!;
      if (t > right.t) continue;
      const left = timed[index - 1]!;
      if (left.interpolation === "hold") return left.value;
      const span = right.t - left.t;
      return span > 0 ? left.value + ((right.value - left.value) * (t - left.t)) / span : right.value;
    }
    return timed[timed.length - 1]!.value;
  };
  const inside = timed.filter((key) => key.t >= -1e-6 && key.t <= 1 + 1e-6);
  const edges: typeof timed = [];
  if (timed.some((key) => key.t < -1e-6)) edges.push({ t: 0, value: valueAt(0), interpolation: timed.filter((key) => key.t < 0).at(-1)!.interpolation });
  const ordered = [...edges, ...inside.filter((key) => !edges.some((edge) => Math.abs(edge.t - key.t) < 1e-6))];
  if (timed.some((key) => key.t > 1 + 1e-6)) ordered.push({ t: 1, value: valueAt(1), interpolation: "linear" });
  const curve: CurveKey[] = [];
  ordered.forEach((key, index) => {
    const leaving = ordered[index - 1]?.interpolation;
    const entry: CurveKey = { t: round(Math.min(1, Math.max(0, key.t))), value: round(key.value) };
    if (leaving === "hold") entry.easing = "hold";
    else if (leaving === "curve") entry.easing = "easeInOut";
    if (curve.length > 0 && curve.at(-1)!.t >= entry.t) return;
    curve.push(entry);
  });
  return curve;
}

const isAnimated = (param: { keys: readonly unknown[] } | undefined): boolean => (param?.keys.length ?? 0) >= 2;

/**
 * Writes the transform, opacity and keyframes of an imported picture clip.
 * A static parameter lands on the clip's own field. An animated one becomes a
 * keyframe curve of absolute values over a neutral base, so the clip draws the
 * same motion without folding the keys into the base.
 */
export function applyVisualMotion(clip: TimelineClip, motion: VisualMotion, context: MotionContext): void {
  const { frame, picture } = context;
  const fit = picture && picture.width > 0 && picture.height > 0
    ? Math.min(frame.width / picture.width, frame.height / picture.height)
    : 1;
  const shownWidth = picture && picture.width > 0 ? picture.width * fit : frame.width;
  const shownHeight = picture && picture.height > 0 ? picture.height * fit : frame.height;
  const curves: { property: string; keyframes: CurveKey[] }[] = [];

  if (motion.opacity) {
    if (isAnimated(motion.opacity)) {
      curves.push({ property: "opacity", keyframes: curveOf(motion.opacity.keys.map((key) => ({ ...key, value: Math.min(1, Math.max(0, key.value / 100)) })), context) });
    } else if (Math.abs(motion.opacity.value - 100) > 1e-6) {
      clip.opacity = round(Math.min(1, Math.max(0, motion.opacity.value / 100)));
    }
  }

  const transform: ClipTransform = { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } };
  if (motion.scale) {
    if (isAnimated(motion.scale)) {
      curves.push({ property: "scale", keyframes: curveOf(motion.scale.keys.map((key) => ({ ...key, value: key.value / 100 / fit })), context) });
    } else {
      const scale = round(motion.scale.value / 100 / fit);
      transform.scale = { x: scale, y: scale };
    }
  } else if (Math.abs(fit - 1) > 1e-9) {
    // Premiere shows a picture at its own size. This editor fits it to the frame.
    transform.scale = { x: round(1 / fit), y: round(1 / fit) };
  }
  if (motion.rotation) {
    if (isAnimated(motion.rotation)) {
      curves.push({ property: "rotation", keyframes: curveOf(motion.rotation.keys.map((key) => ({ ...key, value: (key.value * Math.PI) / 180 })), context) });
    } else {
      transform.rotation = round((motion.rotation.value * Math.PI) / 180);
    }
  }
  if (motion.anchor) {
    if (isAnimated(motion.anchor)) {
      context.warn("anchor point keyframes were imported as a constant anchor.");
    }
    transform.anchor = { x: round(0.5 + motion.anchor.value.x), y: round(0.5 + motion.anchor.value.y) };
  }
  if (motion.center) {
    // Premiere's Center is where the anchor lands; this editor's position is
    // the anchor's offset from where it sits untransformed.
    const offset = (point: Point): Point => ({
      x: round(point.x * frame.width - (transform.anchor.x - 0.5) * shownWidth),
      y: round(point.y * frame.height - (transform.anchor.y - 0.5) * shownHeight)
    });
    if (isAnimated(motion.center)) {
      for (const axis of ["x", "y"] as const) {
        curves.push({
          property: axis === "x" ? "offsetX" : "offsetY",
          keyframes: curveOf(motion.center.keys.map((key) => ({ when: key.when, interpolation: key.interpolation, value: offset(key.value)[axis] })), context)
        });
      }
    } else {
      transform.position = offset(motion.center.value);
    }
  }
  const identity =
    transform.position.x === 0 && transform.position.y === 0 && transform.scale.x === 1 && transform.scale.y === 1 &&
    transform.rotation === 0 && transform.anchor.x === 0.5 && transform.anchor.y === 0.5;
  if (!identity) clip.transform = transform;

  const live = curves.filter((curve) => curve.keyframes.length >= 2);
  if (live.length > 0) {
    const animation: ClipAnimation = {
      id: createTimeOrderedUuid(),
      role: "emphasis",
      preset: "custom",
      durationMs: clip.durationMs,
      delayMs: 0,
      enabled: true,
      params: { keyframed: true },
      custom: { curves: live }
    };
    clip.animations = [...(clip.animations ?? []), animation];
  }
}

export interface ImportedLevel {
  /** Linear gain at full volume. */
  gain: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  fadeInShape?: ClipFadeShape;
  fadeOutShape?: ClipFadeShape;
}

const SHAPES: readonly ClipFadeShape[] = ["linear", "sCurve", "plus3dB", "minus3dB"];

function matchShape(points: readonly { progress: number; gain: number }[]): ClipFadeShape {
  return SHAPES.find((shape) => points.every((point) => Math.abs(fadeShapeGain(shape, point.progress) - point.gain) < 0.03)) ?? "linear";
}

/**
 * An Audio Levels parameter as a constant gain and fades. A clip here has one
 * volume, so only keys that form a fade in, a plateau and a fade out are kept.
 * Anything else is read as its loudest value, and `warn` says so.
 */
export function levelFromParam(param: ScalarParam, context: MotionContext): ImportedLevel | undefined {
  if (!isAnimated(param)) {
    return Math.abs(param.value - 1) > 1e-9 ? { gain: param.value } : undefined;
  }
  const keys = param.keys
    .map((key) => ({ ms: localT(key.when, context) * context.durationMs, value: key.value }))
    .sort((left, right) => left.ms - right.ms);
  const peak = Math.max(...keys.map((key) => key.value));
  if (!(peak > 0)) return { gain: 0 };
  const last = keys.length - 1;
  const near = (value: number): boolean => Math.abs(value - peak) <= peak * 0.001;
  let rampEnd = 0;
  if (keys[0]!.value < peak * 0.02) {
    rampEnd = 1;
    while (rampEnd <= last && !near(keys[rampEnd]!.value)) rampEnd += 1;
  }
  let rampStart = last;
  if (keys[last]!.value < peak * 0.02) {
    rampStart = last - 1;
    while (rampStart >= 0 && !near(keys[rampStart]!.value)) rampStart -= 1;
  }
  const plateau = rampEnd <= rampStart && keys.slice(rampEnd, rampStart + 1).every((key) => near(key.value));
  if (!plateau) {
    context.warn("volume keyframes other than fades were imported as a constant volume.");
    return { gain: peak };
  }
  const level: ImportedLevel = { gain: peak };
  if (rampEnd > 0) {
    const span = keys[rampEnd]!.ms - keys[0]!.ms;
    level.fadeInMs = Math.round(span);
    level.fadeInShape = matchShape(keys.slice(0, rampEnd + 1).map((key) => ({ progress: span > 0 ? (key.ms - keys[0]!.ms) / span : 1, gain: key.value / peak })));
  }
  if (rampStart < last) {
    const span = keys[last]!.ms - keys[rampStart]!.ms;
    level.fadeOutMs = Math.round(span);
    level.fadeOutShape = matchShape(keys.slice(rampStart).map((key) => ({ progress: span > 0 ? (keys[last]!.ms - key.ms) / span : 1, gain: key.value / peak })));
  }
  return level;
}
