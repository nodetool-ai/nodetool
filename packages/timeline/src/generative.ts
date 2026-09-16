import type { ProductionGenerationSnapshot } from "@nodetool-ai/protocol";

import { landProductionCandidate } from "./production.js";
import type { ClipVersion, MediaTrack, TimelineClip } from "./types.js";
import { activeTakeIdOf, ensureBaselineTake } from "./takes.js";
import { sourceRate } from "./sourceRate.js";

export interface MediaEditSourceContext {
  readonly sequenceId: string;
  readonly clipId: string;
  readonly sourceAssetId: string;
  readonly sourceTakeId?: string;
  readonly sourceStartMs: number;
  readonly sourceEndMs: number;
  readonly timelineStartMs: number;
  readonly timelineDurationMs: number;
  readonly speedMultiplier: number;
}

export const MEDIA_EDIT_ACTION = "video_edit" as const;
export const MEDIA_EDIT_MODEL_TASK = "video_to_video" as const;

export interface MediaEditRequest {
  readonly action: typeof MEDIA_EDIT_ACTION;
  readonly modelTask: typeof MEDIA_EDIT_MODEL_TASK;
  readonly sourceContext: MediaEditSourceContext;
  readonly instruction: string;
  readonly provider: string;
  readonly model: string;
  readonly strength?: number;
  readonly resolution?: string;
}

export interface MediaEditSourceContextInput {
  sequenceId: string;
  clipId: string;
  sourceAssetId: string;
  sourceTakeId?: string;
  sourceStartMs: number;
  sourceEndMs: number;
  timelineStartMs: number;
  timelineDurationMs: number;
  speedMultiplier: number;
}

/** Validate a host-neutral source snapshot before a video edit is submitted. */
export function createMediaEditSourceContext(
  input: MediaEditSourceContextInput
): MediaEditSourceContextResult {
  if (!input.sequenceId || !input.clipId || !input.sourceAssetId) {
    return { ok: false, error: "Edit video requires a complete source context." };
  }
  if (
    !Number.isFinite(input.sourceStartMs) ||
    !Number.isFinite(input.sourceEndMs) ||
    input.sourceStartMs < 0 ||
    input.sourceEndMs <= input.sourceStartMs
  ) {
    return {
      ok: false,
      error: "Edit video could not resolve a positive constant source window."
    };
  }
  if (
    !Number.isFinite(input.timelineStartMs) ||
    !Number.isFinite(input.timelineDurationMs) ||
    input.timelineDurationMs <= 0
  ) {
    return {
      ok: false,
      error: "Edit video requires a positive playable duration."
    };
  }
  if (!Number.isFinite(input.speedMultiplier) || input.speedMultiplier !== 1) {
    return {
      ok: false,
      error:
        "Edit video currently supports 1x playback only. Bake the speed change first."
    };
  }
  return { ok: true, context: Object.freeze({ ...input }) };
}

/** The direct-generation payload shared by timeline and storyboard hosts. */
export function mediaEditGenerateMediaData(
  request: MediaEditRequest
): Record<string, unknown> {
  const context = request.sourceContext;
  const sourceContext: Record<string, unknown> = {
    sequence_id: context.sequenceId,
    clip_id: context.clipId,
    source_asset_id: context.sourceAssetId,
    source_start_ms: context.sourceStartMs,
    source_end_ms: context.sourceEndMs,
    timeline_start_ms: context.timelineStartMs,
    timeline_duration_ms: context.timelineDurationMs,
    speed_multiplier: context.speedMultiplier
  };
  if (context.sourceTakeId !== undefined) {
    sourceContext.source_take_id = context.sourceTakeId;
  }
  return {
    mode: request.action,
    provider: request.provider,
    model: request.model,
    prompt: request.instruction,
    source_asset_id: context.sourceAssetId,
    source_context: sourceContext,
    strength: request.strength,
    resolution: request.resolution,
    duration: Math.round(context.timelineDurationMs / 1000),
    variations: 1
  };
}

/** Shared provenance payload stored on every host's accepted take record. */
export function mediaEditTakeMetadata(
  request: MediaEditRequest,
  requestId: string
): MediaEditRequest & { requestId: string } {
  return { ...request, requestId };
}

export function createMediaEditRequest(input: {
  sourceContext: MediaEditSourceContext;
  instruction: string;
  provider: string;
  model: string;
  strength?: number;
  resolution?: string;
}): MediaEditRequest {
  const sourceContext = Object.freeze({ ...input.sourceContext });
  const request: {
    action: typeof MEDIA_EDIT_ACTION;
    modelTask: typeof MEDIA_EDIT_MODEL_TASK;
    sourceContext: MediaEditSourceContext;
    instruction: string;
    provider: string;
    model: string;
    strength?: number;
    resolution?: string;
  } = {
    action: MEDIA_EDIT_ACTION,
    modelTask: MEDIA_EDIT_MODEL_TASK,
    sourceContext,
    instruction: input.instruction,
    provider: input.provider,
    model: input.model
  };
  if (input.strength !== undefined) request.strength = input.strength;
  if (input.resolution !== undefined) request.resolution = input.resolution;
  return Object.freeze(request);
}

export interface MediaEditSourceContextError {
  ok: false;
  error: string;
}

export interface MediaEditSourceContextSuccess {
  ok: true;
  context: MediaEditSourceContext;
}

export type MediaEditSourceContextResult =
  | MediaEditSourceContextSuccess
  | MediaEditSourceContextError;

/** Capture the constant-speed playable window before an edit is dispatched. */
export function captureMediaEditSourceContext(
  sequenceId: string,
  clip: TimelineClip
): MediaEditSourceContextResult {
  if (clip.mediaType !== "video") {
    return { ok: false, error: "Edit video requires a video clip." };
  }
  if (!clip.currentAssetId) {
    return { ok: false, error: "Edit video requires an active video asset." };
  }
  if (!Number.isFinite(clip.durationMs) || clip.durationMs <= 0) {
    return {
      ok: false,
      error: "Edit video requires a positive playable duration."
    };
  }
  if (clip.timeRemap && clip.timeRemap.keyframes.length > 0) {
    return {
      ok: false,
      error:
        "Edit video does not support time-remapped clips. Bake the retime first."
    };
  }
  if (
    !clip.speedBaked &&
    clip.speedMultiplier !== undefined &&
    (!Number.isFinite(clip.speedMultiplier) || clip.speedMultiplier <= 0)
  ) {
    return {
      ok: false,
      error: "Edit video supports constant positive playback speed only."
    };
  }
  const speedMultiplier = sourceRate(clip);
  if (!Number.isFinite(speedMultiplier) || speedMultiplier <= 0) {
    return {
      ok: false,
      error: "Edit video supports constant positive playback speed only."
    };
  }
  if (speedMultiplier !== 1) {
    return {
      ok: false,
      error:
        "Edit video currently supports 1x playback only. Bake the speed change first."
    };
  }
  const sourceStartMs = clip.inPointMs ?? 0;
  const expectedSourceEndMs = sourceStartMs + clip.durationMs * speedMultiplier;
  const sourceEndMs = clip.outPointMs ?? expectedSourceEndMs;
  if (
    !Number.isFinite(sourceStartMs) ||
    !Number.isFinite(sourceEndMs) ||
    sourceStartMs < 0 ||
    sourceEndMs <= sourceStartMs
  ) {
    return {
      ok: false,
      error: "Edit video could not resolve a positive constant source window."
    };
  }
  if (Math.abs(sourceEndMs - expectedSourceEndMs) > 0.5) {
    return {
      ok: false,
      error:
        "Edit video source bounds do not match the clip's constant playback speed."
    };
  }
  const sourceTakeId = (clip.versions ?? []).find(
    (version) => version.assetId === clip.currentAssetId
  )?.id;
  const context: MediaEditSourceContextInput = {
    sequenceId,
    clipId: clip.id,
    sourceAssetId: clip.currentAssetId,
    sourceStartMs,
    sourceEndMs,
    timelineStartMs: clip.startMs,
    timelineDurationMs: clip.durationMs,
    speedMultiplier
  };
  if (sourceTakeId !== undefined) context.sourceTakeId = sourceTakeId;
  return createMediaEditSourceContext(context);
}

/** Capabilities are deliberately provider-independent model registry keys. */
export type GenerativeCapability =
  | "video.extend"
  | "video.video_to_video"
  | "video.inpaint"
  | "video.object_replace"
  | "video.mask_input"
  | "video.reference_image"
  | "video.first_last_frame";

export type GenerativeOperation =
  | "extend"
  | "replace_range"
  | "remove_object"
  | "replace_object"
  | "restyle"
  | "regenerate";

export interface GenerativeRange {
  startMs: number;
  endMs: number;
}

export interface GenerativeEditInput {
  clip: TimelineClip;
  operation: GenerativeOperation;
  range?: GenerativeRange;
  direction?: "start" | "end";
  durationMs?: number;
  prompt?: string;
  trackId?: string;
  referenceAssetIds?: string[];
  provider?: string;
  model?: string;
  /** The clip's document tracks are passed in so validation stays pure. */
  mediaTracks?: readonly MediaTrack[];
}

/** Provider request emitted after editorial validation. */
export interface GenerativeOperationRequest {
  operation: GenerativeOperation;
  clipId: string;
  sourceAssetId: string;
  requiredCapabilities: readonly GenerativeCapability[];
  optionalCapabilities: readonly GenerativeCapability[];
  range?: GenerativeRange;
  direction?: "start" | "end";
  durationMs?: number;
  prompt?: string;
  trackId?: string;
  referenceAssetIds: readonly string[];
  provider?: string;
  model?: string;
}

export interface GenerativePlan {
  ok: true;
  request: GenerativeOperationRequest;
}

export interface GenerativePlanError {
  ok: false;
  error: string;
}

export type GenerativePlanResult = GenerativePlan | GenerativePlanError;

const CAPABILITIES: Record<
  GenerativeOperation,
  {
    required: readonly GenerativeCapability[];
    optional: readonly GenerativeCapability[];
  }
> = {
  extend: {
    required: ["video.extend"],
    optional: ["video.first_last_frame"]
  },
  replace_range: {
    required: ["video.video_to_video"],
    optional: ["video.first_last_frame"]
  },
  remove_object: {
    required: ["video.inpaint", "video.mask_input"],
    optional: ["video.first_last_frame"]
  },
  replace_object: {
    required: ["video.object_replace", "video.mask_input"],
    optional: ["video.reference_image", "video.first_last_frame"]
  },
  restyle: {
    required: ["video.video_to_video"],
    optional: ["video.first_last_frame"]
  },
  regenerate: {
    required: ["video.video_to_video"],
    optional: ["video.first_last_frame"]
  }
};

function validNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

function validateRange(
  range: GenerativeRange | undefined,
  durationMs: number
): string | undefined {
  if (!range) return undefined;
  if (!validNumber(range.startMs) || !validNumber(range.endMs)) {
    return "Generative range must contain finite startMs and endMs.";
  }
  if (range.startMs < 0 || range.endMs > durationMs) {
    return "Generative range must be inside the clip duration.";
  }
  if (range.endMs <= range.startMs) {
    return "Generative range endMs must be greater than startMs.";
  }
  return undefined;
}

/** Validate editorial preconditions and build a provider-agnostic request. */
export function planGenerativeOperation(
  input: GenerativeEditInput
): GenerativePlanResult {
  const { clip, operation } = input;
  if (clip.mediaType !== "video") {
    return {
      ok: false,
      error: `Generative operation requires a video clip, got ${clip.mediaType}.`
    };
  }
  if (!clip.currentAssetId) {
    return {
      ok: false,
      error: "Generative operation requires a clip with a current asset."
    };
  }
  if (!validNumber(clip.durationMs) || clip.durationMs <= 0) {
    return {
      ok: false,
      error: "Generative operation requires a positive clip duration."
    };
  }

  const rangeError = validateRange(input.range, clip.durationMs);
  if (rangeError) return { ok: false, error: rangeError };

  if (operation === "extend") {
    if (input.range)
      return { ok: false, error: "Extend does not accept an internal range." };
    if (!input.direction)
      return { ok: false, error: "Extend requires direction start or end." };
    if (!validNumber(input.durationMs) || input.durationMs <= 0) {
      return { ok: false, error: "Extend requires a positive durationMs." };
    }
  } else if (operation === "replace_range") {
    if (!input.range)
      return { ok: false, error: `${operation} requires a range.` };
  }

  const needsTrack =
    operation === "remove_object" || operation === "replace_object";
  if (needsTrack) {
    if (!input.trackId)
      return { ok: false, error: `${operation} requires trackId.` };
    const track = (input.mediaTracks ?? []).find(
      (candidate) => candidate.id === input.trackId
    );
    if (!track)
      return {
        ok: false,
        error: `Media track "${input.trackId}" was not found.`
      };
    if (track.clipId !== clip.id)
      return { ok: false, error: "Media track belongs to a different clip." };
    if (track.status !== "ready")
      return { ok: false, error: "Media track must be ready." };
    if (track.sourceAssetId !== clip.currentAssetId) {
      return {
        ok: false,
        error: "Media track is stale for the clip's current asset."
      };
    }
    if (
      operation === "replace_object" &&
      !input.prompt &&
      !(input.referenceAssetIds?.length ?? 0)
    ) {
      return {
        ok: false,
        error: "replace_object requires a prompt or reference asset."
      };
    }
  }

  const capabilities = CAPABILITIES[operation];
  return {
    ok: true,
    request: {
      operation,
      clipId: clip.id,
      sourceAssetId: clip.currentAssetId,
      requiredCapabilities: capabilities.required,
      optionalCapabilities: capabilities.optional,
      range: input.range,
      direction: input.direction,
      durationMs: input.durationMs,
      prompt: input.prompt,
      trackId: input.trackId,
      referenceAssetIds: input.referenceAssetIds ?? [],
      provider: input.provider,
      model: input.model
    }
  };
}

export interface GenerativeTakeResult {
  assetId: string;
  jobId?: string;
  createdAt: string;
  dependencyHash?: string;
  workflowUpdatedAt?: string;
  paramOverridesSnapshot?: Record<string, unknown>;
  provider?: string;
  model?: string;
  prompt?: string;
  negativePrompt?: string;
  costCredits?: number;
  durationMs?: number;
  status?: ClipVersion["status"];
  /** Frozen submission inputs. When present, these are the provenance source. */
  productionSnapshot?: ProductionGenerationSnapshot;
  /**
   * A successful generative edit is an audition by default. Set this only
   * after an explicit "Use Take" choice.
   */
  activate?: boolean;
  mediaEdit?: MediaEditRequest;
}

/** The provenance source recorded in the existing ClipVersion/take model. */
export function takeSourceForOperation(
  operation: GenerativeOperation
): NonNullable<ClipVersion["source"]> {
  switch (operation) {
    case "extend":
      return "extended";
    case "remove_object":
      return "inpainted";
    case "replace_object":
      return "object_replace";
    case "replace_range":
    case "restyle":
    case "regenerate":
      return operation === "regenerate" ? "generated" : "video_to_video";
  }
}

/**
 * Apply a completed generation as a new take. The spread is intentional: all
 * editorial fields (position, duration, trims, effects, bindings, etc.) stay
 * untouched while only take/asset state changes. A completed take is not made
 * active unless the caller records an explicit selection.
 */
export function composeGenerativeTakePatch(
  clip: TimelineClip,
  operation: GenerativeOperation,
  result: GenerativeTakeResult
): TimelineClip {
  if (!result.assetId)
    throw new Error("A generated take must include assetId.");
  // A failed or cancelled job must never displace the playable active take.
  if (result.status && result.status !== "success") return clip;
  const snapshot = result.productionSnapshot;
  const existingVersions = clip.versions ?? [];
  const versionId = result.jobId ?? `${clip.id}:${result.createdAt}`;
  if (
    snapshot === undefined && existingVersions.some(
      (version) =>
        version.id === versionId ||
        (result.jobId !== undefined && version.jobId === result.jobId)
    )
  ) {
    return clip;
  }
  const sourceAssetId =
    result.mediaEdit?.sourceContext.sourceAssetId ?? clip.currentAssetId;
  const activeTakeId = result.mediaEdit
    ? result.mediaEdit.sourceContext.sourceTakeId
    : activeTakeIdOf(clip);
  const baselineCandidate =
    sourceAssetId && !existingVersions.some((version) => version.assetId === sourceAssetId)
      ? ensureBaselineTake(
          { ...clip, currentAssetId: sourceAssetId },
          result.createdAt
        )
      : clip;
  const baseline = baselineCandidate.versions?.find(
    (version) =>
      version.assetId === sourceAssetId &&
      !existingVersions.some((existing) => existing.id === version.id)
  );
  const parentTakeId =
    snapshot?.parentTakeId ??
    activeTakeId ??
    existingVersions.find((version) => version.assetId === sourceAssetId)?.id ??
    baseline?.id;
  const withBaseline: TimelineClip = baseline
    ? { ...clip, versions: [...existingVersions, baseline] }
    : clip;
  const version: ClipVersion = {
    id: versionId,
    createdAt: result.createdAt,
    jobId: result.jobId ?? "",
    assetId: result.assetId,
    workflowUpdatedAt: result.workflowUpdatedAt ?? result.createdAt,
    dependencyHash: result.dependencyHash ?? "",
    paramOverridesSnapshot:
      result.paramOverridesSnapshot ?? snapshot?.parameters ?? clip.paramOverrides ?? {},
    costCredits: result.costCredits,
    durationMs: result.durationMs,
    status: result.status ?? "success",
    source: takeSourceForOperation(operation),
    provider: snapshot?.provider ?? result.provider,
    model: snapshot?.model ?? result.model,
    prompt: snapshot?.prompt ?? result.prompt,
    negativePrompt: result.negativePrompt,
    parentTakeId,
    mediaEdit: result.mediaEdit
      ? mediaEditTakeMetadata(result.mediaEdit, versionId)
      : undefined
  };
  const next = snapshot
    ? landProductionCandidate(withBaseline, {
        identity: {
          batchId: snapshot.batchId,
          requestId: snapshot.requestId,
          candidateId: snapshot.candidateId,
          variationId: snapshot.variationId,
          variationIndex: snapshot.variationIndex,
          destinationId: snapshot.destinationId,
          destinationKind: snapshot.destinationKind
        },
        version: { ...version, productionSnapshot: snapshot }
      })
    : appendGenerativeTake(withBaseline, version);
  if (result.activate) {
    if (snapshot !== undefined) {
      throw new Error(
        "A production candidate must be accepted through Use take after landing."
      );
    }
    next.currentAssetId = result.assetId;
    next.activeTakeId = version.id;
    next.lastGeneratedHash = version.dependencyHash;
  }
  return next;
}

function appendGenerativeTake(
  clip: TimelineClip,
  version: ClipVersion
): TimelineClip {
  const existing = (clip.versions ?? []).find(
    (item) => item.id === version.id ||
      (version.jobId.length > 0 && item.jobId === version.jobId)
  );
  if (existing !== undefined) {
    if (existing.assetId === version.assetId) return clip;
    throw new Error(
      `Generation "${version.jobId || version.id}" already landed with another asset.`
    );
  }
  return { ...clip, versions: [...(clip.versions ?? []), version] };
}
