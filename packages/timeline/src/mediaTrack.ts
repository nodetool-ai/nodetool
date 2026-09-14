/**
 * Subject/object tracks: source-time-anchored samples of a subject moving
 * through one clip's source (P0 AI Video, Phase 2).
 *
 * `sampleMediaTrackAt` reuses `evalCurve`'s exact algorithm
 * (`animation/sample.ts`) — held flat before the first and after the last
 * sample, linear interpolation between two, eased by the *ending* one's
 * easing where a curve carries easing at all. A `MediaTrackSample` has no
 * easing field (a provider hands back positions, not authored keyframes), so
 * every segment here is plain linear — `evalCurve`'s behavior with
 * `easing: "linear"` throughout. The function is replicated locally rather
 * than imported because `evalCurve` operates on `PropertyCurve`/`Keyframe`
 * (one numeric channel), and a track sample is several channels (`x`, `y`,
 * `width`, `height`, `rotation`) sampled together against one shared
 * `sourceMs` axis.
 *
 * Pure functions over one track (or a clip's view of it). Nothing here reads
 * a document, an asset or a clock.
 */

import { clipSourceWindowMs } from "./generatedMatte.js";
import type { MediaTrack, MediaTrackSample, TimelineClip } from "./types.js";

/** The fields a staleness check reads — the clip's current asset. */
export type MediaTrackClip = Pick<TimelineClip, "currentAssetId">;

/**
 * Linear-interpolate one numeric channel between two samples at fraction `t`.
 * `undefined` on either side propagates to `undefined` — a channel a track's
 * `kind` does not use (e.g. `width` on a `"point"` track) stays absent rather
 * than interpolating toward 0.
 */
function lerpChannel(
  a: number | undefined,
  b: number | undefined,
  t: number
): number | undefined {
  if (a === undefined || b === undefined) return a ?? b;
  return a + (b - a) * t;
}

/**
 * The track's sample at `sourceMs`, held flat before the first sample and
 * after the last, linearly interpolated between two — `evalCurve`'s rule
 * (`animation/sample.ts`), applied per channel. `undefined` for an empty
 * track. `quad` and `maskAssetId` are NOT interpolated: `quad` is returned
 * from the nearer of the two bracketing samples (a quad has no meaningful
 * linear midpoint across two independent corner sets without per-corner
 * matching a provider does not supply), and `maskAssetId` — a `"mask"`
 * track's per-sample matte — is likewise taken from the nearer sample rather
 * than blended, since two mask assets cannot be linearly combined.
 */
export function sampleMediaTrackAt(
  track: MediaTrack,
  sourceMs: number
): MediaTrackSample | undefined {
  const samples = track.samples;
  if (samples.length === 0) return undefined;
  const first = samples[0]!;
  if (sourceMs <= first.sourceMs) return first;
  const last = samples[samples.length - 1]!;
  if (sourceMs >= last.sourceMs) return last;
  for (let i = 1; i < samples.length; i++) {
    const b = samples[i]!;
    if (sourceMs > b.sourceMs) continue;
    const a = samples[i - 1]!;
    const span = b.sourceMs - a.sourceMs;
    const t = span > 0 ? (sourceMs - a.sourceMs) / span : 0;
    const nearer = t < 0.5 ? a : b;
    const out: MediaTrackSample = { sourceMs };
    const x = lerpChannel(a.x, b.x, t);
    const y = lerpChannel(a.y, b.y, t);
    const width = lerpChannel(a.width, b.width, t);
    const height = lerpChannel(a.height, b.height, t);
    const rotation = lerpChannel(a.rotation, b.rotation, t);
    const confidence = lerpChannel(a.confidence, b.confidence, t);
    if (x !== undefined) out.x = x;
    if (y !== undefined) out.y = y;
    if (width !== undefined) out.width = width;
    if (height !== undefined) out.height = height;
    if (rotation !== undefined) out.rotation = rotation;
    if (confidence !== undefined) out.confidence = confidence;
    if (nearer.quad !== undefined) out.quad = nearer.quad;
    if (nearer.maskAssetId !== undefined) out.maskAssetId = nearer.maskAssetId;
    return out;
  }
  return last;
}

/**
 * `sampleMediaTrackAt`, with an exponential moving average folded over the
 * samples at or before `sourceMs` first. Not a frame-to-frame filter — see
 * `TrackBinding.smoothing`'s doc comment for why — so it is O(n) in the
 * samples up to `sourceMs` and meant for a binding resolution step, not a
 * tight per-pixel loop.
 *
 * `factor` is the `TrackBinding.smoothing` value: 0 (or absent) returns the
 * exact sample, and higher values weight the running average more heavily
 * against each new sample (closer to 1 = smoother, slower to follow a cut).
 * Channels absent from the earlier average (a track whose first few samples
 * lack `width`, say) start once the channel first appears rather than being
 * held at 0.
 */
export function applySmoothingToSample(
  track: MediaTrack,
  sourceMs: number,
  factor: number
): MediaTrackSample | undefined {
  const exact = sampleMediaTrackAt(track, sourceMs);
  if (!exact || factor <= 0) return exact;
  const clampedFactor = Math.min(1, factor);
  const upTo = track.samples.filter((s) => s.sourceMs <= sourceMs);
  const history = upTo.length > 0 ? upTo : [track.samples[0]!];
  let smoothed: MediaTrackSample = { ...history[0]!, sourceMs };
  for (let i = 1; i < history.length; i++) {
    const s = history[i]!;
    const blend = (a: number | undefined, b: number | undefined) =>
      a === undefined ? b : b === undefined ? a : a * clampedFactor + b * (1 - clampedFactor);
    smoothed = {
      sourceMs,
      x: blend(smoothed.x, s.x),
      y: blend(smoothed.y, s.y),
      width: blend(smoothed.width, s.width),
      height: blend(smoothed.height, s.height),
      rotation: blend(smoothed.rotation, s.rotation),
      quad: s.quad ?? smoothed.quad,
      maskAssetId: s.maskAssetId ?? smoothed.maskAssetId,
      confidence: blend(smoothed.confidence, s.confidence)
    };
  }
  // The exact sample at sourceMs itself still gets one more blend pass, so a
  // track sampled past its own last recorded point holds the smoothed value
  // rather than snapping back to the raw last sample `sampleMediaTrackAt` held.
  const blendExact = (a: number | undefined, b: number | undefined) =>
    a === undefined ? b : b === undefined ? a : a * clampedFactor + b * (1 - clampedFactor);
  return {
    sourceMs,
    x: blendExact(smoothed.x, exact.x),
    y: blendExact(smoothed.y, exact.y),
    width: blendExact(smoothed.width, exact.width),
    height: blendExact(smoothed.height, exact.height),
    rotation: blendExact(smoothed.rotation, exact.rotation),
    quad: exact.quad ?? smoothed.quad,
    maskAssetId: exact.maskAssetId ?? smoothed.maskAssetId,
    confidence: blendExact(smoothed.confidence, exact.confidence)
  };
}

/**
 * One track restricted to the source window `fromMs..toMs`, the same recipe
 * `animation/sourceCurves.ts`'s `sliceCurve` uses for a source-anchored
 * animation curve: keep every sample inside the retained window and put an
 * interpolated sample on each new edge, so the retained motion is the motion
 * that was there before the edit.
 *
 * Returns a track with no samples at all unchanged (nothing to slice) rather
 * than throwing — a track that has not started generating yet still has a
 * `sourceStartMs`/`sourceEndMs` window a trim can narrow.
 */
export function resliceMediaTrackSamples(
  track: MediaTrack,
  fromMs: number,
  toMs: number
): MediaTrack {
  if (track.samples.length === 0) {
    return { ...track, sourceStartMs: fromMs, sourceEndMs: toMs };
  }
  const kept = track.samples.filter(
    (s) => s.sourceMs >= fromMs && s.sourceMs <= toMs
  );
  const sliced: MediaTrackSample[] = [];
  const firstKeptMs = kept.length > 0 ? kept[0]!.sourceMs : null;
  if (firstKeptMs === null || firstKeptMs > fromMs) {
    const boundary = sampleMediaTrackAt(track, fromMs);
    if (boundary) sliced.push({ ...boundary, sourceMs: fromMs });
  }
  sliced.push(...kept);
  const lastKeptMs =
    kept.length > 0 ? kept[kept.length - 1]!.sourceMs : null;
  if (lastKeptMs === null || lastKeptMs < toMs) {
    const boundary = sampleMediaTrackAt(track, toMs);
    if (boundary) sliced.push({ ...boundary, sourceMs: toMs });
  }
  return { ...track, sourceStartMs: fromMs, sourceEndMs: toMs, samples: sliced };
}

/**
 * True when a track no longer describes what its clip shows: the clip's
 * asset was replaced under it. Mirrors `isGeneratedMatteStale`'s rule.
 *
 * False for a track with no `clipId` match at all — the caller filters tracks
 * by `clipId` before asking this, so a mismatched track is not "this clip's
 * track" in the first place, not a stale one.
 */
export function isMediaTrackStale(
  track: MediaTrack,
  clip: MediaTrackClip
): boolean {
  return track.sourceAssetId !== clip.currentAssetId;
}

/** The track marked in flight, keeping its samples and status metadata. */
export function markMediaTrackGenerating(track: MediaTrack): MediaTrack {
  return { ...track, status: "generating" };
}

/**
 * The track after a generation failed or was cancelled.
 *
 * A previous ready track — same samples, same provenance — is put back
 * exactly as it was: a failed regenerate must not cost the caller the track
 * they already had. Only a track with no previous ready result at all ends up
 * `status: "failed"`. Mirrors `generatedMatteAfterFailure`.
 */
export function mediaTrackAfterFailure(
  track: MediaTrack,
  previous: MediaTrack | undefined
): MediaTrack {
  if (previous) return { ...previous };
  return { ...track, status: "failed" };
}

/** A finished tracking run, as the capability hands it back. */
export interface MediaTrackResult {
  samples: MediaTrackSample[];
  sourceStartMs: number;
  sourceEndMs: number;
  /**
   * The clip's asset the run tracked against. Always set (not merely carried
   * over from a stale previous result) so a regenerate that runs because the
   * clip's asset changed under it records the asset it actually tracked.
   */
  sourceAssetId: string;
  confidence?: number;
  provenance?: MediaTrack["provenance"];
}

/**
 * Every track the trimmed clip owns, resliced onto the source window the clip
 * now shows. Returns the array unchanged when the clip owns none, so a
 * document without tracks allocates nothing.
 *
 * Both hosts call this rather than each reslicing on its own — the headless
 * bridge's `ui_timeline_trim_clip` and `applyTimelineOp`'s `trim_clip` — which
 * is what `timeline-op-parity.test.ts` holds them to.
 */
export function resliceTracksForTrimmedClip(
  mediaTracks: readonly MediaTrack[],
  clip: TimelineClip
): MediaTrack[] {
  if (!mediaTracks.some((t) => t.clipId === clip.id)) {
    return mediaTracks as MediaTrack[];
  }
  const window = clipSourceWindowMs(clip);
  return mediaTracks.map((t) =>
    t.clipId === clip.id
      ? resliceMediaTrackSamples(t, window.fromMs, window.toMs)
      : t
  );
}

/**
 * Every track the split clip owned, replaced by one resliced track per half.
 *
 * A track is owned by exactly one `clipId` ({@link MediaTrack}), so a split
 * cannot leave the two halves sharing one: each half gets its own track, with
 * a fresh id from `newTrackId`. A clip bound to the ORIGINAL track's id is not
 * repointed — which half it should now follow is a call the edit does not make
 * on the caller's behalf — so its `trackBinding` names an id that no longer
 * exists and reads as unbound until it is re-pointed.
 */
export function resliceTracksForSplitClip(
  mediaTracks: readonly MediaTrack[],
  originalClipId: string,
  left: TimelineClip,
  right: TimelineClip,
  newTrackId: () => string
): MediaTrack[] {
  if (!mediaTracks.some((t) => t.clipId === originalClipId)) {
    return mediaTracks as MediaTrack[];
  }
  const leftWindow = clipSourceWindowMs(left);
  const rightWindow = clipSourceWindowMs(right);
  return mediaTracks.flatMap((t) => {
    if (t.clipId !== originalClipId) return [t];
    return [
      {
        ...resliceMediaTrackSamples(t, leftWindow.fromMs, leftWindow.toMs),
        id: newTrackId(),
        clipId: left.id
      },
      {
        ...resliceMediaTrackSamples(t, rightWindow.fromMs, rightWindow.toMs),
        id: newTrackId(),
        clipId: right.id
      }
    ];
  });
}

/** The track with a finished generation applied, `status: "ready"`. */
export function applyMediaTrackResult(
  track: MediaTrack,
  result: MediaTrackResult
): MediaTrack {
  const next: MediaTrack = {
    ...track,
    samples: result.samples,
    sourceStartMs: result.sourceStartMs,
    sourceEndMs: result.sourceEndMs,
    sourceAssetId: result.sourceAssetId,
    status: "ready"
  };
  if (result.confidence !== undefined) next.confidence = result.confidence;
  if (result.provenance !== undefined) next.provenance = result.provenance;
  return next;
}
