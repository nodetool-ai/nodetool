/**
 * `track_object`: follow a subject through a clip's source and carry the
 * result as a document-level `MediaTrack` (P0 AI Video, Phase 2).
 *
 * Cloned from `timeline-isolate-subject.ts`'s three-part shape, because the
 * same separation applies here: only one part costs money, and only the
 * other two can be tested without a provider key.
 *
 * 1. {@link trackObjectOnDocument} — the state machine over one track. It
 *    marks the track (or a placeholder) in flight, asks the runner for
 *    samples, applies the result, and persists at every step. Everything it
 *    cannot do itself arrives on {@link TrackObjectDeps}.
 * 2. A real provider runner — see the bottom of this file. Unlike
 *    `falIsolateSubjectRunner`, there is no tracking-capable node registered
 *    in this build today (checked: no fal/replicate/video node declares
 *    anything close to `track_object`), so {@link notImplementedTrackObjectRunner}
 *    is a clearly-labeled seam that throws rather than fabricating a result —
 *    see its own doc comment.
 * 3. Nothing else: a track's samples are small JSON, not a media asset, so
 *    there is no download/store step the way a matte's mask video needs one.
 *
 * **This pass tracks box-kind subjects only.** `MediaTrack.kind` supports
 * `"point"`/`"quad"`/`"mask"` too, but nothing here calls a provider for
 * them yet — see `MediaTrackResult`'s shape below.
 *
 * **A failure never loses a working track.** A clip that already had a ready
 * track for this trackId keeps it, selected, with its status back at
 * `ready`; only a track with no prior ready result is left `failed`. Mirrors
 * `isolateSubjectOnClip`'s rule exactly.
 */

import {
  applyMediaTrackResult,
  isMediaTrackStale,
  markMediaTrackGenerating,
  mediaTrackAfterFailure,
  type MediaTrack,
  type MediaTrackResult,
  type TimelineClip
} from "@nodetool-ai/timeline";
import { isString } from "../utils/type-guards.js";

export type TrackObjectDirection = "forward" | "backward" | "both";

/** The initial region a track starts from, normalized 0..1 over the source frame. */
export interface TrackObjectInitialRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the runner is asked to track. */
export interface TrackObjectRunRequest {
  sourceAssetId: string;
  initialRegion: TrackObjectInitialRegion;
  startMs: number;
  endMs: number;
  direction: TrackObjectDirection;
}

/** What the runner answers with: samples over the requested window. */
export interface TrackObjectRunResult {
  samples: MediaTrackResult["samples"];
  confidence?: number;
  /** The generation row, so the caller can poll or reconcile it. */
  generationId?: string;
  costUsd?: number;
}

/**
 * The paid half, injected so a test can stand in for it. A fake runner is
 * the only way to exercise this capability without a provider key.
 */
export type TrackObjectRunner = (
  request: TrackObjectRunRequest
) => Promise<TrackObjectRunResult>;

/**
 * Writes the document's tracks back to wherever it lives. `false` means the
 * document moved under the call — a concurrent edit — and nothing was saved.
 */
export type PersistTracks = (mediaTracks: MediaTrack[]) => Promise<boolean>;

export interface TrackObjectDeps {
  runner: TrackObjectRunner;
  persist: PersistTracks;
}

export interface TrackObjectInput {
  clip: TimelineClip;
  /** Every track already on the document (any clip), so ids stay unique. */
  mediaTracks: MediaTrack[];
  name: string;
  initialRegion: TrackObjectInitialRegion;
  startMs: number;
  endMs: number;
  direction: TrackObjectDirection;
  /** True runs the provider even when a ready track for this id is current. */
  regenerate: boolean;
  /** The track id to reuse on a regenerate; a fresh one is minted otherwise. */
  trackId: string;
}

export interface TrackObjectOutcome {
  mediaTracks: MediaTrack[];
  track: MediaTrack;
  status: "ready" | "failed";
  generationId?: string;
  costUsd?: number;
  /** True when a ready track was handed back without spending anything. */
  reused: boolean;
  error?: string;
}

export interface TrackObjectRefusal {
  error: string;
}

const CONCURRENT_EDIT =
  "The timeline is being modified concurrently; nothing was saved. Retry the call.";

/**
 * Track one subject through one clip's source, or hand back the track it
 * already has.
 *
 * Refuses — without spending — a clip with no asset, a region outside 0..1,
 * and a window where `endMs <= startMs`. Reuses a ready, non-stale track
 * unless `regenerate` is set.
 */
export async function trackObjectOnDocument(
  deps: TrackObjectDeps,
  input: TrackObjectInput
): Promise<TrackObjectOutcome | TrackObjectRefusal> {
  const { clip, initialRegion } = input;
  const sourceAssetId = clip.currentAssetId;
  if (!isString(sourceAssetId) || sourceAssetId === "") {
    return {
      error:
        `"${clip.name}" has no asset yet — generate or import its media ` +
        "before tracking a subject in it."
    };
  }
  if (input.endMs <= input.startMs) {
    return {
      error: `end_ms (${input.endMs}) must be greater than start_ms (${input.startMs}).`
    };
  }
  const regionFields: (keyof TrackObjectInitialRegion)[] = [
    "x",
    "y",
    "width",
    "height"
  ];
  for (const field of regionFields) {
    const value = initialRegion[field];
    if (!(value >= 0 && value <= 1)) {
      return {
        error: `initial_region.${field} (${value}) must be between 0 and 1.`
      };
    }
  }

  const previous = input.mediaTracks.find((t) => t.id === input.trackId);

  if (previous && !input.regenerate && previous.status === "ready") {
    const stale = isMediaTrackStale(previous, clip);
    if (!stale) {
      return {
        mediaTracks: input.mediaTracks,
        track: previous,
        status: "ready",
        reused: true
      };
    }
  }

  const placeholder: MediaTrack = previous
    ? { ...markMediaTrackGenerating(previous), sourceAssetId }
    : {
        id: input.trackId,
        clipId: clip.id,
        sourceAssetId,
        name: input.name,
        kind: "box",
        sourceStartMs: input.startMs,
        sourceEndMs: input.endMs,
        samples: [],
        status: "generating"
      };
  const generating = [
    ...input.mediaTracks.filter((t) => t.id !== input.trackId),
    placeholder
  ];
  if (!(await deps.persist(generating))) {
    return { error: CONCURRENT_EDIT };
  }

  try {
    const run = await deps.runner({
      sourceAssetId,
      initialRegion,
      startMs: input.startMs,
      endMs: input.endMs,
      direction: input.direction
    });
    const result: MediaTrackResult = {
      samples: run.samples,
      sourceStartMs: input.startMs,
      sourceEndMs: input.endMs,
      sourceAssetId
    };
    if (run.confidence !== undefined) result.confidence = run.confidence;
    const settledTrack = applyMediaTrackResult(placeholder, result);
    const settled = [
      ...input.mediaTracks.filter((t) => t.id !== input.trackId),
      settledTrack
    ];
    if (!(await deps.persist(settled))) {
      return { error: CONCURRENT_EDIT };
    }
    const outcome: TrackObjectOutcome = {
      mediaTracks: settled,
      track: settledTrack,
      status: "ready",
      reused: false
    };
    if (run.generationId !== undefined) outcome.generationId = run.generationId;
    if (run.costUsd !== undefined) outcome.costUsd = run.costUsd;
    return outcome;
  } catch (error) {
    const revertedTrack = mediaTrackAfterFailure(placeholder, previous);
    const reverted = [
      ...input.mediaTracks.filter((t) => t.id !== input.trackId),
      revertedTrack
    ];
    // Best effort: the generation already failed, and a save that also fails
    // leaves the in-flight marker, which the next call overwrites.
    await deps.persist(reverted);
    return {
      mediaTracks: reverted,
      track: revertedTrack,
      status: "failed",
      reused: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * The default runner: there is no tracking-capable provider node registered
 * in this build. Checked against fal-nodes, replicate-nodes and video-nodes
 * for anything declaring segmentation-and-track, SAM-video, or cutout-style
 * tracking endpoints — none exists. Rather than fabricate a plausible-looking
 * result, this throws a clear, named error so a caller sees "not implemented"
 * instead of a silent no-op or invented samples. `Deps` injection is the seam
 * a future provider wiring (or a test) replaces this with.
 */
export const notImplementedTrackObjectRunner: TrackObjectRunner = async () => {
  throw new Error(
    "track_object has no provider wired up in this build: no installed " +
      "node package declares a subject-tracking capability. This is a " +
      "documented seam (TrackObjectDeps.runner), not a working integration " +
      "— wire a real provider through context.runGenerationWith with " +
      'capability: "track_object" before enabling this in production.'
  );
};
