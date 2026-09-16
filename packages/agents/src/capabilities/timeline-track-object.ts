/** Subject tracking over a source window, persisted with compare-and-swap writes. */

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
import {
  BaseProvider,
  objectTrackingRequestSchema,
  parseObjectTrackingResult,
  type ProcessingContext
} from "@nodetool-ai/runtime";

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
  provenance?: MediaTrack["provenance"];
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
  runner: TrackObjectRunner | null;
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
  if (clip.mediaType !== "video") {
    return { error: "Subject tracking requires a video clip." };
  }
  if (
    !Number.isFinite(input.startMs) ||
    input.startMs < 0 ||
    !Number.isFinite(input.endMs) ||
    input.endMs <= input.startMs
  ) {
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
  if (
    initialRegion.width <= 0 ||
    initialRegion.height <= 0 ||
    initialRegion.x + initialRegion.width > 1 ||
    initialRegion.y + initialRegion.height > 1
  ) {
    return {
      error:
        "The tracking rectangle must have positive dimensions and fit inside the source frame."
    };
  }

  const previous = input.mediaTracks.find((t) => t.id === input.trackId);
  if (previous && previous.clipId !== clip.id) {
    return { error: "This track belongs to a different clip." };
  }
  if (previous && previous.kind !== "box") {
    return { error: "This action can only regenerate a box track." };
  }

  if (previous && !input.regenerate && previous.status === "ready") {
    const stale = isMediaTrackStale(previous, clip);
    if (
      !stale &&
      previous.sourceStartMs === input.startMs &&
      previous.sourceEndMs === input.endMs
    ) {
      return {
        mediaTracks: input.mediaTracks,
        track: previous,
        status: "ready",
        reused: true
      };
    }
  }
  if (!deps.runner || deps.runner === notImplementedTrackObjectRunner) {
    return { error: "No executable subject-tracking provider is available." };
  }
  const request = objectTrackingRequestSchema.parse({
    sourceAssetId,
    initialRegion: { ...initialRegion },
    startMs: input.startMs,
    endMs: input.endMs,
    direction: input.direction
  });

  const placeholder: MediaTrack = previous
    ? {
        ...markMediaTrackGenerating(previous),
        sourceAssetId,
        sourceStartMs: input.startMs,
        sourceEndMs: input.endMs,
        samples: []
      }
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
    const run = await deps.runner(request);
    const validated = parseObjectTrackingResult(run, request);
    const result: MediaTrackResult = {
      samples: validated.samples,
      sourceStartMs: request.startMs,
      sourceEndMs: request.endMs,
      sourceAssetId
    };
    if (run.confidence !== undefined) result.confidence = run.confidence;
    if (run.provenance !== undefined) result.provenance = run.provenance;
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
    if (isMediaTrackStale(revertedTrack, clip)) {
      revertedTrack.status = "stale";
    }
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

/** Compatibility refusal for hosts that have not supplied a tracking provider. */
export const notImplementedTrackObjectRunner: TrackObjectRunner = async () => {
  throw new Error("No executable subject-tracking provider is available.");
};

/** Resolve an executable provider before changing the timeline or spending. */
export async function contextTrackObjectRunner(
  context: ProcessingContext,
  providerId: string | undefined,
  model: string | undefined
): Promise<TrackObjectRunner | null> {
  if (!providerId || !model) {
    return null;
  }
  const provider = await context.getProvider(providerId);
  if (
    !provider.getCapabilities().includes("track_object") ||
    provider.trackObject === BaseProvider.prototype.trackObject
  ) {
    return null;
  }
  return async (request) => {
    const run = await context.runGeneration({
      provider: providerId,
      model,
      capability: "track_object",
      params: { ...request },
      origin: { surface: "capability" }
    });
    return {
      ...parseObjectTrackingResult(run.output, request),
      generationId: run.id,
      provenance: { provider: providerId, model, settings: { ...request } }
    };
  };
}
