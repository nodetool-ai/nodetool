import { shiftClipsFrom } from "./rippleEdit.js";
import { sourceRate } from "./sourceRate.js";
import { activeTakeIdOf } from "./takes.js";
import type { TimelineClip } from "./types.js";

export type ExtensionTiming = "keep-cut" | "available-space" | "ripple";

export interface ExtensionSourceSnapshot {
  readonly clipId: string;
  readonly trackId: string;
  readonly sourceAssetId: string;
  readonly sourceTakeId?: string;
  readonly sourceStartMs: number;
  readonly sourceEndMs: number;
  readonly timelineStartMs: number;
  readonly timelineDurationMs: number;
  readonly rate: number;
}

export interface ExtensionRefusal {
  readonly ok: false;
  readonly code:
    | "invalid"
    | "stale"
    | "short"
    | "locked"
    | "collision"
    | "unsupported";
  readonly error: string;
}

export interface ApplyExtensionInput {
  readonly clips: readonly TimelineClip[];
  readonly source: ExtensionSourceSnapshot;
  readonly takeId: string;
  readonly direction: "start" | "end";
  /** Added source time, before applying the clip's playback rate. */
  readonly addedSourceDurationMs: number;
  readonly timing: ExtensionTiming;
  readonly lockedTrackIds?: ReadonlySet<string>;
}

export type ApplyExtensionResult =
  | { readonly ok: true; readonly clips: TimelineClip[] }
  | ExtensionRefusal;

function refuse(
  code: ExtensionRefusal["code"],
  error: string
): ExtensionRefusal {
  return { ok: false, code, error };
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function validPlacement(clip: TimelineClip): boolean {
  return (
    Number.isFinite(clip.startMs) &&
    clip.startMs >= 0 &&
    positive(clip.durationMs) &&
    Number.isFinite(clip.startMs + clip.durationMs)
  );
}

/** Capture the accepted source window before submitting an extension. */
export function captureExtensionSource(
  clip: TimelineClip
):
  | { readonly ok: true; readonly source: ExtensionSourceSnapshot }
  | ExtensionRefusal {
  if (
    clip.mediaType !== "video" ||
    !clip.id ||
    !clip.trackId ||
    !clip.currentAssetId
  ) {
    return refuse(
      "invalid",
      "Extension requires a video clip with an active asset."
    );
  }
  if (clip.timeRemap && clip.timeRemap.keyframes.length > 0) {
    return refuse(
      "unsupported",
      "Bake the time remap before extending this clip."
    );
  }
  if (!clip.speedBaked && !positive(clip.speedMultiplier ?? 1)) {
    return refuse(
      "invalid",
      "Extension requires a finite positive playback rate."
    );
  }
  const rate = sourceRate(clip);
  const sourceStartMs = clip.inPointMs ?? 0;
  const expectedEndMs = sourceStartMs + clip.durationMs * rate;
  const sourceEndMs = clip.outPointMs ?? expectedEndMs;
  if (
    !validPlacement(clip) ||
    !Number.isFinite(sourceStartMs) ||
    sourceStartMs < 0 ||
    !Number.isFinite(expectedEndMs) ||
    !Number.isFinite(sourceEndMs) ||
    sourceEndMs <= sourceStartMs ||
    Math.abs(sourceEndMs - expectedEndMs) > 0.5
  ) {
    return refuse(
      "invalid",
      "Extension requires a valid constant-rate source window."
    );
  }
  const sourceTakeId = activeTakeIdOf(clip);
  return {
    ok: true,
    source: Object.freeze({
      clipId: clip.id,
      trackId: clip.trackId,
      sourceAssetId: clip.currentAssetId,
      ...(sourceTakeId !== undefined && { sourceTakeId }),
      sourceStartMs,
      sourceEndMs,
      timelineStartMs: clip.startMs,
      timelineDurationMs: clip.durationMs,
      rate
    })
  };
}

interface Interval {
  start: number;
  end: number;
}

function occupiedSpace(
  clips: readonly TimelineClip[]
): Map<string, Interval[]> {
  const tracks = new Map<string, Interval[]>();
  for (const clip of clips) {
    const intervals = tracks.get(clip.trackId) ?? [];
    intervals.push({
      start: clip.startMs,
      end: clip.startMs + clip.durationMs
    });
    tracks.set(clip.trackId, intervals);
  }
  for (const [trackId, intervals] of tracks) {
    intervals.sort((a, b) => a.start - b.start);
    const merged: Interval[] = [];
    for (const interval of intervals) {
      const last = merged[merged.length - 1];
      if (last && interval.start <= last.end) {
        last.end = Math.max(last.end, interval.end);
      } else {
        merged.push(interval);
      }
    }
    tracks.set(trackId, merged);
  }
  return tracks;
}

function overlaps(
  intervals: readonly Interval[],
  start: number,
  end: number
): boolean {
  if (start >= end) {
    return false;
  }
  let low = 0;
  let high = intervals.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const interval = intervals[middle];
    if (interval && interval.end <= start) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const interval = intervals[low];
  return interval !== undefined && interval.start < end;
}

/**
 * Apply a normalized extension candidate as one pure document update.
 *
 * The successful `extended` take must contain the submitted source window at
 * its original playback rate, with the added source time prepended or appended.
 * `take.durationMs` is its measured source duration. Any extra tail is a handle.
 * The caller owns generation, normalization, persistence and the undo entry.
 *
 * Start ripple keeps the clip parked, matching rippleTrim. Available-space
 * start extension moves its start earlier. Existing overlaps are retained, but
 * newly occupied space cannot overlap stationary clips on the same track.
 * Collision indexing is O(n log n), including sequences with existing overlaps.
 */
export function applyExtensionToClips(
  input: ApplyExtensionInput
): ApplyExtensionResult {
  const {
    clips,
    source,
    takeId,
    direction,
    addedSourceDurationMs,
    timing,
    lockedTrackIds
  } = input;
  if (
    (direction !== "start" && direction !== "end") ||
    (timing !== "keep-cut" &&
      timing !== "available-space" &&
      timing !== "ripple") ||
    !positive(addedSourceDurationMs)
  ) {
    return refuse(
      "invalid",
      "Choose an extension direction, timing outcome and positive source duration."
    );
  }
  const byId = new Map<string, TimelineClip>();
  for (const clip of clips) {
    if (
      !clip.id ||
      !clip.trackId ||
      byId.has(clip.id) ||
      !validPlacement(clip)
    ) {
      return refuse(
        "invalid",
        "The timeline contains duplicate ids or invalid clip placement."
      );
    }
    byId.set(clip.id, clip);
  }
  const clip = byId.get(source.clipId);
  if (!clip) {
    return refuse("stale", "The source clip no longer exists.");
  }
  const captured = captureExtensionSource(clip);
  if (!captured.ok) {
    return captured;
  }
  const current = captured.source;
  if (
    current.trackId !== source.trackId ||
    current.sourceAssetId !== source.sourceAssetId ||
    (source.sourceTakeId !== undefined &&
      current.sourceTakeId !== source.sourceTakeId) ||
    current.sourceStartMs !== source.sourceStartMs ||
    current.sourceEndMs !== source.sourceEndMs ||
    current.timelineStartMs !== source.timelineStartMs ||
    current.timelineDurationMs !== source.timelineDurationMs ||
    current.rate !== source.rate
  ) {
    return refuse(
      "stale",
      "The accepted source, mapping or placement changed after submission."
    );
  }
  if (clip.locked || lockedTrackIds?.has(clip.trackId)) {
    return refuse(
      "locked",
      "Unlock the source clip and its track before applying an extension."
    );
  }
  const takes = (clip.versions ?? []).filter((take) => take.id === takeId);
  const take = takes[0];
  if (
    takes.length !== 1 ||
    !take ||
    take.status !== "success" ||
    take.source !== "extended" ||
    !take.assetId ||
    take.assetId === clip.currentAssetId
  ) {
    return refuse(
      "invalid",
      "Choose a successful inactive extended take on the source clip."
    );
  }
  const originalSourceDurationMs = clip.durationMs * current.rate;
  const requiredSourceDurationMs =
    originalSourceDurationMs + addedSourceDurationMs;
  const addedTimelineDurationMs = addedSourceDurationMs / current.rate;
  if (
    !positive(requiredSourceDurationMs) ||
    !positive(addedTimelineDurationMs) ||
    requiredSourceDurationMs <= originalSourceDurationMs
  ) {
    return refuse(
      "invalid",
      "The extension duration exceeds the supported numeric range."
    );
  }
  if (take.durationMs === undefined || !positive(take.durationMs)) {
    return refuse(
      "invalid",
      "The extension take requires a measured source duration."
    );
  }
  if (take.durationMs < requiredSourceDurationMs) {
    return refuse(
      "short",
      "The extension take cannot cover the source window and requested extension."
    );
  }
  const keepCut = timing === "keep-cut";
  if (
    !keepCut &&
    (clip.parentId ||
      clips.some(
        (other) =>
          other.id !== clip.id &&
          clip.linkId !== undefined &&
          other.linkId === clip.linkId
      ))
  ) {
    return refuse(
      "unsupported",
      "Ungroup or unlink the source clip before changing its duration."
    );
  }
  const inPointMs =
    keepCut && direction === "start" ? addedSourceDurationMs : 0;
  const applied: TimelineClip = {
    ...clip,
    currentAssetId: take.assetId,
    activeTakeId: take.id,
    inPointMs,
    outPointMs: keepCut
      ? inPointMs + originalSourceDurationMs
      : requiredSourceDurationMs,
    startMs:
      timing === "available-space" && direction === "start"
        ? clip.startMs - addedTimelineDurationMs
        : clip.startMs,
    durationMs: keepCut
      ? clip.durationMs
      : clip.durationMs + addedTimelineDurationMs
  };
  if (
    !validPlacement(applied) ||
    (!keepCut && applied.durationMs <= clip.durationMs)
  ) {
    return refuse(
      "invalid",
      "The extension would create invalid timeline placement."
    );
  }
  if (keepCut) {
    return {
      ok: true,
      clips: clips.map((item) => (item.id === clip.id ? applied : item))
    };
  }

  const oldEndMs = clip.startMs + clip.durationMs;
  const excluded = new Set([clip.id]);
  for (const item of clips) {
    if (item.locked) {
      excluded.add(item.id);
    }
  }
  const shifted =
    timing === "ripple"
      ? shiftClipsFrom(
          clips,
          oldEndMs,
          addedTimelineDurationMs,
          excluded,
          lockedTrackIds ? { lockedTrackIds } : {}
        )
      : [...clips];
  const movedIds = new Set<string>();
  for (const item of shifted) {
    if (!validPlacement(item)) {
      return refuse(
        "invalid",
        "A downstream clip would exceed the supported numeric range."
      );
    }
    if (item !== byId.get(item.id)) {
      movedIds.add(item.id);
    }
  }
  const linkedMovement = new Map<string, boolean>();
  for (const item of clips) {
    const moves = movedIds.has(item.id);
    if (item.linkId !== undefined) {
      const groupMoves = linkedMovement.get(item.linkId);
      if (groupMoves !== undefined && groupMoves !== moves) {
        return refuse("unsupported", "The ripple would separate linked clips.");
      }
      linkedMovement.set(item.linkId, moves);
    }
    if (item.parentId && moves !== movedIds.has(item.parentId)) {
      return refuse(
        "unsupported",
        "The ripple would separate a group from its children."
      );
    }
  }
  const occupied = occupiedSpace(
    clips.filter((item) => item.id !== clip.id && !movedIds.has(item.id))
  );
  const sourceTrack = occupied.get(clip.trackId) ?? [];
  if (
    overlaps(sourceTrack, applied.startMs, clip.startMs) ||
    overlaps(sourceTrack, oldEndMs, applied.startMs + applied.durationMs)
  ) {
    return refuse(
      "collision",
      "The extended clip would overlap stationary media on its track."
    );
  }
  for (const item of shifted) {
    const original = byId.get(item.id);
    if (
      original &&
      movedIds.has(item.id) &&
      overlaps(
        occupied.get(item.trackId) ?? [],
        Math.max(original.startMs + original.durationMs, item.startMs),
        item.startMs + item.durationMs
      )
    ) {
      return refuse(
        "collision",
        "A rippled clip would overlap stationary media on its track."
      );
    }
  }
  return {
    ok: true,
    clips: shifted.map((item) => (item.id === clip.id ? applied : item))
  };
}
