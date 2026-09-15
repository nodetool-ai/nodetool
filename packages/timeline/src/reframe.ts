/** Pure source-time Smart Reframe math. */

import {
  applySmoothingToSample,
  isMediaTrackStale,
  sampleMediaTrackAt
} from "./mediaTrack.js";
import type {
  ClipCrop,
  ClipReframe,
  MediaTrack,
  ReframeKeyframe,
  ReframeSample,
  TimelineClip
} from "./types.js";

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Whether a ready point/box track contains coordinates the framing solver supports. */
export function mediaTrackCanDriveReframe(track: MediaTrack): boolean {
  return (
    track.status === "ready" &&
    track.samples.some(
      (sample) => sample.x !== undefined && sample.y !== undefined
    )
  );
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function samplePathAt(
  samples: readonly ReframeSample[],
  sourceMs: number
): ReframeSample | undefined {
  if (samples.length === 0) return undefined;
  const ordered = [...samples].sort((a, b) => a.sourceMs - b.sourceMs);
  const first = ordered[0]!;
  if (sourceMs <= first.sourceMs) return { ...first, sourceMs };
  const last = ordered[ordered.length - 1]!;
  if (sourceMs >= last.sourceMs) return { ...last, sourceMs };
  for (let i = 1; i < ordered.length; i += 1) {
    const b = ordered[i]!;
    if (sourceMs > b.sourceMs) continue;
    const a = ordered[i - 1]!;
    const span = b.sourceMs - a.sourceMs;
    const t = span > 0 ? (sourceMs - a.sourceMs) / span : 0;
    const sample: ReframeSample = {
      sourceMs,
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t)
    };
    if (a.width !== undefined && b.width !== undefined) {
      sample.width = lerp(a.width, b.width, t);
    }
    if (a.height !== undefined && b.height !== undefined) {
      sample.height = lerp(a.height, b.height, t);
    }
    if (a.confidence !== undefined && b.confidence !== undefined) {
      sample.confidence = lerp(a.confidence, b.confidence, t);
    }
    return sample;
  }
  return { ...last, sourceMs };
}

/** Convert a point/box MediaTrack into a compact automatic framing path. */
export function solveReframeSamples(track: MediaTrack): ReframeSample[] {
  return track.samples.flatMap((sample) => {
    if (sample.x === undefined || sample.y === undefined) return [];
    const solved: ReframeSample = {
      sourceMs: sample.sourceMs,
      x: clamp01(sample.x),
      y: clamp01(sample.y)
    };
    if (sample.width !== undefined) {
      solved.width = clamp01(sample.width);
    }
    if (sample.height !== undefined) {
      solved.height = clamp01(sample.height);
    }
    if (sample.confidence !== undefined) solved.confidence = sample.confidence;
    return [solved];
  });
}

function trackSample(
  reframe: ClipReframe,
  track: MediaTrack | undefined,
  sourceMs: number
): ReframeSample | undefined {
  if (
    reframe.mode !== "track" ||
    !track ||
    track.id !== reframe.trackId ||
    track.status !== "ready"
  ) {
    return undefined;
  }
  const sample =
    reframe.smoothing !== undefined && reframe.smoothing > 0
      ? applySmoothingToSample(track, sourceMs, reframe.smoothing)
      : sampleMediaTrackAt(track, sourceMs);
  if (!sample || sample.x === undefined || sample.y === undefined) {
    return undefined;
  }
  const result: ReframeSample = { sourceMs, x: sample.x, y: sample.y };
  if (sample.width !== undefined) result.width = sample.width;
  if (sample.height !== undefined) result.height = sample.height;
  if (sample.confidence !== undefined) result.confidence = sample.confidence;
  return result;
}

function baseSample(
  reframe: ClipReframe,
  sourceMs: number,
  track?: MediaTrack
): ReframeSample {
  const tracked = trackSample(reframe, track, sourceMs);
  if (tracked) return tracked;
  if (reframe.mode === "auto") {
    const automatic = samplePathAt(reframe.samples ?? [], sourceMs);
    if (automatic) return automatic;
  }
  return { sourceMs, x: 0.5, y: 0.5 };
}

function correctionAt(
  reframe: ClipReframe,
  sourceMs: number,
  track: MediaTrack | undefined
): { x: number; y: number; zoom: number } {
  const keyframes = [...(reframe.keyframes ?? [])].sort(
    (a, b) => a.sourceMs - b.sourceMs
  );
  if (keyframes.length === 0) return { x: 0, y: 0, zoom: 1 };
  const corrections = keyframes.map((keyframe) => {
    const automatic = baseSample(reframe, keyframe.sourceMs, track);
    return {
      sourceMs: keyframe.sourceMs,
      x: keyframe.x - automatic.x,
      y: keyframe.y - automatic.y,
      zoom: Math.max(1, keyframe.zoom ?? 1)
    };
  });
  const first = corrections[0]!;
  if (sourceMs <= first.sourceMs) return first;
  const last = corrections[corrections.length - 1]!;
  if (sourceMs >= last.sourceMs) return last;
  for (let i = 1; i < corrections.length; i += 1) {
    const b = corrections[i]!;
    if (sourceMs > b.sourceMs) continue;
    const a = corrections[i - 1]!;
    const span = b.sourceMs - a.sourceMs;
    const t = span > 0 ? (sourceMs - a.sourceMs) / span : 0;
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      zoom: lerp(a.zoom, b.zoom, t)
    };
  }
  return last;
}

/** Resolve automatic framing plus interpolated manual corrections. */
export function sampleReframeAt(
  reframe: ClipReframe,
  sourceMs: number,
  track?: MediaTrack
): ReframeSample & { zoom: number } {
  const automatic = baseSample(reframe, sourceMs, track);
  const correction = correctionAt(reframe, sourceMs, track);
  return {
    ...automatic,
    sourceMs,
    x: clamp01(automatic.x + correction.x),
    y: clamp01(automatic.y + correction.y),
    zoom: correction.zoom
  };
}

/** Resolve a target-aspect crop in normalized source coordinates. */
export function resolveReframeCrop(
  reframe: ClipReframe,
  sourceMs: number,
  sourceSize: { width: number; height: number },
  targetSize: { width: number; height: number },
  track?: MediaTrack
): ClipCrop | undefined {
  if (
    sourceSize.width <= 0 ||
    sourceSize.height <= 0 ||
    targetSize.width <= 0 ||
    targetSize.height <= 0
  ) {
    return undefined;
  }
  const sourceAspect = sourceSize.width / sourceSize.height;
  const targetAspect = targetSize.width / targetSize.height;
  let cropWidth = 1;
  let cropHeight = 1;
  if (targetAspect < sourceAspect) cropWidth = targetAspect / sourceAspect;
  else cropHeight = sourceAspect / targetAspect;

  const sampled = sampleReframeAt(reframe, sourceMs, track);
  if (reframe.safeMargin !== undefined) {
    const margin = Math.min(0.49, Math.max(0, reframe.safeMargin));
    const available = 1 - margin * 2;
    const widthScale =
      sampled.width === undefined ? 0 : sampled.width / (cropWidth * available);
    const heightScale =
      sampled.height === undefined
        ? 0
        : sampled.height / (cropHeight * available);
    if (widthScale > 0 || heightScale > 0) {
      const subjectFitScale = Math.min(1, Math.max(widthScale, heightScale));
      cropWidth *= subjectFitScale;
      cropHeight *= subjectFitScale;
    }
  }
  cropWidth /= sampled.zoom;
  cropHeight /= sampled.zoom;
  const centerX = Math.min(
    1 - cropWidth / 2,
    Math.max(cropWidth / 2, sampled.x)
  );
  const centerY = Math.min(
    1 - cropHeight / 2,
    Math.max(cropHeight / 2, sampled.y)
  );
  return {
    left: centerX - cropWidth / 2,
    right: 1 - centerX - cropWidth / 2,
    top: centerY - cropHeight / 2,
    bottom: 1 - centerY - cropHeight / 2
  };
}

/** Add or replace one manual keyframe, keeping source-time order. */
export function addReframeKeyframe(
  reframe: ClipReframe,
  keyframe: ReframeKeyframe
): ClipReframe {
  const keyframes = (reframe.keyframes ?? []).filter(
    (candidate) => candidate.sourceMs !== keyframe.sourceMs
  );
  keyframes.push({ ...keyframe });
  keyframes.sort((a, b) => a.sourceMs - b.sourceMs);
  return { ...reframe, keyframes };
}

/** Remove framing state without changing any other editorial property. */
export function clearReframe(clip: TimelineClip): TimelineClip {
  if (!clip.reframe) return clip;
  const next = { ...clip };
  delete next.reframe;
  return next;
}

/** Automatic analysis is stale independently of manual correction keyframes. */
export function isReframeStale(
  clip: Pick<TimelineClip, "currentAssetId" | "reframe">,
  track?: MediaTrack
): boolean {
  const reframe = clip.reframe;
  if (!reframe) return false;
  if (reframe.sourceAssetId && reframe.sourceAssetId !== clip.currentAssetId) {
    return true;
  }
  return (
    reframe.mode === "track" &&
    (track === undefined ||
      track.status !== "ready" ||
      isMediaTrackStale(track, clip))
  );
}

/**
 * Return framing that is safe to render for the clip's current source.
 * Stale automatic data is ignored, while manual keyframes remain absolute
 * source-space framing points and continue to interpolate around centre.
 */
export function renderableReframe(
  clip: Pick<TimelineClip, "currentAssetId" | "reframe">,
  track?: MediaTrack
): ClipReframe | undefined {
  const reframe = clip.reframe;
  if (!reframe || !isReframeStale(clip, track)) return reframe;
  return { ...reframe, mode: "center" };
}
