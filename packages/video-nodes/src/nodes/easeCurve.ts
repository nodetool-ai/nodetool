/**
 * Retime a whole video along an easing curve: the Ease Curve node's math.
 *
 * The curve is the timeline's clip time remap (`timeRemap.ts`) with two
 * keyframes, `{t: 0, sourceMs: 0}` and `{t: 1, sourceMs: sourceDurationMs}`,
 * the second eased by the chosen easing. So "ease in" starts slow and ends
 * fast, exactly as an eased remap does on a timeline clip, and the easing
 * grammar (named ids and `cubic-bezier(...)`) is the timeline's own.
 *
 * `timeRemapAudioSegments` cuts that curve into constant-rate stretches. The
 * audio plays each stretch through `atempo`. The picture uses the same
 * stretches inverted: each source frame's timestamp is moved to the output
 * instant the curve shows it at, and an `fps` filter then duplicates or drops
 * frames to a constant rate.
 *
 * Only monotonic easings are offered: an overshoot (back, elastic, bounce)
 * would play the source backwards, which a timestamp move cannot express.
 */

import {
  timeRemapAudioSegments,
  type ClipTimeRemap,
  type TimeRemapAudioSegment
} from "@nodetool-ai/timeline";
import { atempoChain } from "./ffmpeg-helpers.js";

/** Easing presets the node offers, in the timeline's easing ids. */
export const EASE_CURVE_PRESETS = [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  "easeInQuint",
  "easeOutQuint",
  "easeInOutQuint",
  "easeInExpo",
  "easeOutExpo",
  "easeInOutExpo",
  "easeInCirc",
  "easeOutCirc",
  "easeInOutCirc",
  "custom"
] as const;

export type EaseCurvePreset = (typeof EASE_CURVE_PRESETS)[number];

/** Constant-rate pieces each eased curve is cut into. */
const EASE_CURVE_SAMPLES = 32;

/** An audio stretch shorter than this in the source is left silent. */
const MIN_AUDIO_SOURCE_MS = 10;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * The easing string for a preset. `custom` becomes `cubic-bezier(...)` with
 * both y values clamped to [0, 1], which keeps the curve monotonic.
 */
export function easeCurveEasing(
  preset: string,
  bezier: { x1: number; y1: number; x2: number; y2: number }
): string {
  if (preset === "custom") {
    const { x1, y1, x2, y2 } = bezier;
    return `cubic-bezier(${clamp01(x1)},${clamp01(y1)},${clamp01(x2)},${clamp01(y2)})`;
  }
  if ((EASE_CURVE_PRESETS as readonly string[]).includes(preset)) return preset;
  throw new Error(`Unknown easing preset "${preset}".`);
}

/**
 * The curve as constant-rate stretches over an output of `outputDurationMs`,
 * covering the whole source. Stretches the source does not advance over are
 * dropped.
 */
export function easeCurveSegments(
  sourceDurationMs: number,
  outputDurationMs: number,
  easing: string
): TimeRemapAudioSegment[] {
  const timeRemap: ClipTimeRemap = {
    keyframes: [
      { t: 0, sourceMs: 0 },
      { t: 1, sourceMs: sourceDurationMs, easing }
    ]
  };
  return timeRemapAudioSegments(
    { timeRemap, startMs: 0, durationMs: outputDurationMs },
    EASE_CURVE_SAMPLES
  ).filter((s) => s.sourceEndMs > s.sourceStartMs && Number.isFinite(s.rate));
}

const sec = (ms: number): string => String(Number((ms / 1000).toFixed(6)));

/**
 * `setpts` expression mapping a source frame time `T` to its output time,
 * piecewise linear over `segments`. The result is in seconds, so the caller
 * divides by `TB`.
 */
export function easeCurveSetptsExpr(segments: TimeRemapAudioSegment[]): string {
  if (segments.length === 0) return "T";
  const piece = (s: TimeRemapAudioSegment): string =>
    `${sec(s.timelineStartMs)}+(T-${sec(s.sourceStartMs)})*${Number((1 / s.rate).toFixed(6))}`;
  let expr = piece(segments[segments.length - 1]!);
  for (let i = segments.length - 2; i >= 0; i--) {
    const s = segments[i]!;
    expr = `if(lt(T,${sec(s.sourceEndMs)}),${piece(s)},${expr})`;
  }
  return expr;
}

/** The ffmpeg `-filter_complex` graph and maps for one retime. */
export function easeCurveFilterGraph(opts: {
  segments: TimeRemapAudioSegment[];
  outputDurationMs: number;
  fps: number;
  withAudio: boolean;
}): string[] {
  const { segments, outputDurationMs, fps, withAudio } = opts;
  const video = `[0:v]setpts='(${easeCurveSetptsExpr(segments)})/TB',fps=${Number(fps.toFixed(6))},trim=end=${sec(outputDurationMs)}[v]`;
  if (!withAudio) return ["-filter_complex", video, "-map", "[v]"];

  const audible = segments.filter(
    (s) => s.sourceEndMs - s.sourceStartMs >= MIN_AUDIO_SOURCE_MS
  );
  if (audible.length === 0) return ["-filter_complex", video, "-map", "[v]"];
  const splits = audible.map((_, i) => `[s${i}]`).join("");
  const filters = [video, `[0:a]asplit=${audible.length}${splits}`];
  for (const [i, s] of audible.entries()) {
    const delay = Math.max(0, Math.round(s.timelineStartMs));
    filters.push(
      `[s${i}]atrim=start=${sec(s.sourceStartMs)}:end=${sec(s.sourceEndMs)},asetpts=PTS-STARTPTS,` +
        atempoChain(s.rate).map((f) => `atempo=${f}`).join(",") +
        `,adelay=${delay}|${delay}[a${i}]`
    );
  }
  const mixed = audible.map((_, i) => `[a${i}]`).join("");
  filters.push(
    `${mixed}amix=inputs=${audible.length}:duration=longest:normalize=0,asetpts=N/SR/TB,atrim=end=${sec(outputDurationMs)},apad=whole_dur=${sec(outputDurationMs)}[a]`
  );
  return ["-filter_complex", filters.join(";"), "-map", "[v]", "-map", "[a]"];
}
