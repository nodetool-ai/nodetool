/**
 * Time remapping: a clip's source position as a curve instead of a rate (D13).
 *
 * `speedMultiplier` can only say "play the source n times as fast for the whole
 * clip". A remap says where in the source each instant of the clip sits, so a
 * ramp, a hold and a reverse are all the same object — a list of
 * `{t, sourceMs}` keyframes, `t` normalized over the clip's own window. A remap
 * replaces the rate entirely; `speedMultiplier`, `speedBaked` and `inPointMs`
 * do not shift a remapped clip's source time, because the keyframes already
 * name absolute source milliseconds.
 *
 * The interpolation is the one `evalCurve` uses for animation curves
 * (`animation/sample.ts`): the segment ending at keyframe *i* is eased by
 * keyframe *i*'s own `easing`, and the value is held flat outside the first and
 * last keyframes. So a single keyframe is a freeze frame, and the easing
 * grammar is the one every other curve in the document already speaks.
 *
 * Keyframes are read in array order and are expected to ascend in `t`; the
 * validator reports a document where they do not as `time_remap_not_monotonic`
 * (an error), so this never sorts on the sampling path.
 *
 * Pure; no allocation.
 */

import { ease } from "./animation/easing.js";
import type { ClipTimeRemap, TimelineClip } from "./types.js";

/** True when a clip's source position comes from a curve rather than a rate. */
export function hasTimeRemap(
  clip: Pick<TimelineClip, "timeRemap">
): boolean {
  return (clip.timeRemap?.keyframes.length ?? 0) > 0;
}

/**
 * Source position in milliseconds at normalized clip position `t`.
 *
 * `t` is clamped to `[0, 1]`: a caller asking outside the clip's window — a
 * transition reaching past a cut, a motion-blur sample at the very edge of the
 * first frame — gets the first or last keyframe's source position rather than
 * an extrapolation off the end of the media.
 *
 * Returns `null` for a remap with no keyframes, which carries no information
 * and must fall back to the clip's rate.
 */
export function evaluateTimeRemapMs(
  remap: ClipTimeRemap,
  t: number
): number | null {
  const kfs = remap.keyframes;
  if (kfs.length === 0) return null;
  const first = kfs[0]!;
  if (t <= first.t) return first.sourceMs;
  const last = kfs[kfs.length - 1]!;
  if (t >= last.t) return last.sourceMs;
  for (let i = 1; i < kfs.length; i++) {
    const b = kfs[i]!;
    if (t > b.t) continue;
    const a = kfs[i - 1]!;
    const span = b.t - a.t;
    const segT = span > 0 ? (t - a.t) / span : 0;
    const eased = ease(b.easing ?? "linear", segT);
    return a.sourceMs + (b.sourceMs - a.sourceMs) * eased;
  }
  return last.sourceMs;
}

/**
 * The source position (ms) a remapped clip shows at timeline position
 * `currentTimeMs`, or `null` when the clip carries no usable remap and the
 * caller should fall back to `sourceRate`.
 */
export function clipRemapSourceMs(
  clip: Pick<TimelineClip, "timeRemap" | "startMs" | "durationMs">,
  currentTimeMs: number
): number | null {
  const remap = clip.timeRemap;
  if (!remap || remap.keyframes.length === 0) return null;
  const span = clip.durationMs;
  const t = span > 0 ? (currentTimeMs - clip.startMs) / span : 0;
  return evaluateTimeRemapMs(remap, t);
}

/**
 * The refusal split and trim share. A remap makes "the source time at this
 * timeline instant" a curve over the clip's own window, so cutting the window
 * in two or moving its edges would re-normalize `t` and move every frame the
 * clip shows — a cut that silently retimes both halves. Baking the curve into
 * the media first is the only edit that keeps what the user approved (D13).
 *
 * There is no `bakeTimeRemap` in this build: T29 shipped the refusal, and the
 * bake it names is a separate change.
 */
export function assertNotTimeRemapped(
  clip: Pick<TimelineClip, "timeRemap">,
  op: "splitClip" | "trimClip"
): void {
  if (!hasTimeRemap(clip)) return;
  throw new Error(
    `${op} cannot edit a clip that carries a time remap — the curve is ` +
      "normalized over the clip's window, so changing the window would retime " +
      "every frame. Bake the remap into the media first (`bake_time_remap`), " +
      "or clear `timeRemap` to edit at the clip's rate."
  );
}
