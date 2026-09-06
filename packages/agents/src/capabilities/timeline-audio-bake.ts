/**
 * `bake_audio_animation`'s arithmetic: audio measurements in, keyframes on the
 * animated clip's own clock out.
 *
 * Three clocks are involved and conflating any two of them silently offsets
 * the motion, so each hop is one named function here rather than inline
 * arithmetic in the capability:
 *
 * 1. **Audio source time** — what `analyzeAudioFrames` reports, milliseconds
 *    into the audio file. The audio clip plays `inPointMs …
 *    inPointMs + durationMs * rate` of it.
 * 2. **Timeline time** — where that instant lands in the cut:
 *    `startMs + (sourceMs - inPointMs) / rate`, the inverse of the rate the
 *    compositor plays the clip at (`sourceRate`).
 * 3. **Target source time** — the millisecond of the animated clip's own media
 *    showing at that timeline instant: `(timelineMs - startMs) * rate +
 *    inPointMs`, which is `clipSourceMsAt` for a clip with no time remap.
 *
 * Both hops are affine and increasing (`sourceRate` floors the rate above
 * zero), so an ascending series stays ascending and the curve gate never sees
 * keyframes that go backwards. A time remap on either clip breaks that — the
 * relation becomes a curve normalized over the clip's window — which is why
 * the capability refuses one rather than mapping through an inverse that does
 * not exist.
 *
 * Pure: no I/O, no models, no decode.
 */

import { sourceRate, type TimelineClip } from "@nodetool-ai/timeline";
import {
  envelopeToKeyframes,
  simplifyKeyframes,
  type KeyframePoint
} from "@nodetool-ai/timeline";

/** The clip fields both hops read. */
export type TimedClip = Pick<
  TimelineClip,
  "startMs" | "durationMs" | "inPointMs" | "speedMultiplier" | "speedBaked"
>;

/** The source stretch a clip actually plays, in its own media's ms. */
export function clipSourceWindowMs(clip: TimedClip): [number, number] {
  const fromMs = Math.max(0, clip.inPointMs ?? 0);
  return [fromMs, fromMs + clip.durationMs * sourceRate(clip)];
}

/** Where an instant of the audio file lands on the timeline. */
export function audioSourceMsToTimelineMs(
  audioClip: TimedClip,
  sourceMs: number
): number {
  return (
    audioClip.startMs + (sourceMs - (audioClip.inPointMs ?? 0)) / sourceRate(audioClip)
  );
}

/** The target clip's own source ms showing at a timeline instant. */
export function timelineMsToTargetSourceMs(
  targetClip: TimedClip,
  timelineMs: number
): number {
  return (
    (timelineMs - targetClip.startMs) * sourceRate(targetClip) +
    (targetClip.inPointMs ?? 0)
  );
}

/** A keyframe as the op takes it. */
export interface BakedCurvePoint {
  sourceMs: number;
  value: number;
}

export interface MapCurveOptions {
  audioClip: TimedClip;
  targetClip: TimedClip;
  /** Shift along the timeline. Negative moves the motion earlier. */
  offsetMs: number;
}

/**
 * Carry a series measured in audio-source time onto the target clip's clock,
 * dropping what falls outside the target's own window.
 *
 * A point the target never shows is dropped rather than clamped: a source
 * curve holds its first and last value flat outside its ends, so the retained
 * motion is the motion the target actually plays, and the validator's
 * `source_curve_outside_window` stays quiet.
 */
export function mapAudioCurveToTarget(
  points: readonly KeyframePoint[],
  options: MapCurveOptions
): BakedCurvePoint[] {
  const { targetClip } = options;
  const windowStartMs = targetClip.startMs;
  const windowEndMs = targetClip.startMs + targetClip.durationMs;
  const mapped: BakedCurvePoint[] = [];
  for (const point of points) {
    const timelineMs =
      audioSourceMsToTimelineMs(options.audioClip, point.timeMs) +
      options.offsetMs;
    if (timelineMs < windowStartMs || timelineMs > windowEndMs) continue;
    mapped.push({
      sourceMs: Math.max(0, timelineMsToTargetSourceMs(targetClip, timelineMs)),
      value: point.value
    });
  }
  return mapped;
}

export interface EnvelopeCurveOptions {
  attackMs: number;
  releaseMs: number;
  outputRange: readonly [number, number];
  /**
   * Divides the top of the measured range: 2 reaches the loud end of
   * `outputRange` at half the loudest frame, 0.5 needs twice it. 1 maps the
   * quietest frame to the low end and the loudest to the high end.
   */
  sensitivity: number;
  tolerance: number;
  maxPoints: number;
}

/**
 * The loudness curve: the quietest and loudest frames in the analyzed window
 * become the ends of `outputRange`, so a bake is scaled to the material rather
 * than to an absolute level a quiet mix would never reach.
 */
export function envelopeCurve(
  frames: readonly { timeMs: number; rms: number }[],
  options: EnvelopeCurveOptions
): KeyframePoint[] {
  if (frames.length === 0) return [];
  let quietest = Infinity;
  let loudest = -Infinity;
  for (const frame of frames) {
    if (frame.rms < quietest) quietest = frame.rms;
    if (frame.rms > loudest) loudest = frame.rms;
  }
  const sensitivity = options.sensitivity > 0 ? options.sensitivity : 1;
  const inputRange: [number, number] = [
    quietest,
    quietest + (loudest - quietest) / sensitivity
  ];
  return envelopeToKeyframes(frames, {
    attackMs: options.attackMs,
    releaseMs: options.releaseMs,
    inputRange,
    outputRange: options.outputRange,
    tolerance: options.tolerance,
    maxPoints: options.maxPoints
  });
}

export interface BeatCurveOptions {
  attackMs: number;
  releaseMs: number;
  outputRange: readonly [number, number];
  tolerance: number;
  maxPoints: number;
  /** The analyzed window, in audio-source ms — where the curve rests. */
  windowMs: readonly [number, number];
}

/** Times this close together are one instant; a curve needs them apart. */
const EPSILON_MS = 1e-3;

/**
 * One pulse per onset: rest, rise over `attackMs` into the onset, fall back
 * over `releaseMs`.
 *
 * Pulses that would overlap are shortened rather than interleaved — a series
 * whose times went backwards is refused by the curve gate, and an onset inside
 * the previous pulse's release is one the ear hears as part of it anyway.
 */
export function beatCurve(
  onsetsMs: readonly number[],
  options: BeatCurveOptions
): KeyframePoint[] {
  const [lo, hi] = options.outputRange;
  const [windowStartMs, windowEndMs] = options.windowMs;
  const points: KeyframePoint[] = [{ timeMs: windowStartMs, value: lo }];
  let lastTimeMs = windowStartMs;

  for (const onsetMs of [...onsetsMs].sort((a, b) => a - b)) {
    if (onsetMs <= lastTimeMs || onsetMs > windowEndMs) continue;
    const riseMs = Math.max(
      onsetMs - Math.max(0, options.attackMs),
      lastTimeMs + EPSILON_MS
    );
    if (riseMs >= onsetMs) continue;
    points.push({ timeMs: riseMs, value: lo });
    points.push({ timeMs: onsetMs, value: hi });
    const fallMs = Math.min(
      onsetMs + Math.max(EPSILON_MS, options.releaseMs),
      windowEndMs
    );
    if (fallMs > onsetMs) {
      points.push({ timeMs: fallMs, value: lo });
      lastTimeMs = fallMs;
    } else {
      lastTimeMs = onsetMs;
    }
  }

  if (points[points.length - 1]!.timeMs < windowEndMs) {
    points.push({ timeMs: windowEndMs, value: lo });
  }
  // Only over budget: simplifying a pulse train that already fits would round
  // off the attacks the mode exists to produce.
  return points.length > options.maxPoints
    ? simplifyKeyframes(points, {
        tolerance: options.tolerance,
        maxPoints: options.maxPoints
      })
    : points;
}
