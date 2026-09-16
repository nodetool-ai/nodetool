import {
  captureMediaEditSourceContext,
  composeGenerativeTakePatch
} from "./generative.js";
import type { MediaEditSourceContext } from "./generative.js";
import type { TimelineClip } from "./types.js";

export const EXPAND_FRAME_MODEL_TASK = "outpaint_video" as const;
export const UPSCALE_VIDEO_MODEL_TASK = "upscale_video" as const;

export interface SpatialVideoModel {
  readonly id: string;
  readonly provider: string;
  readonly supportedTasks?: readonly string[];
}

export interface ExpandFramePadding {
  readonly left?: number;
  readonly right?: number;
  readonly top?: number;
  readonly bottom?: number;
}

interface SpatialVideoRequestBase {
  readonly requestId: string;
  readonly sequenceId: string;
  readonly sourceContext: MediaEditSourceContext;
  readonly provider: string;
  readonly model: string;
  /** Spatial edits always land as inactive takes. */
  readonly candidateOnly: true;
}

export interface ExpandFrameRequest extends SpatialVideoRequestBase {
  readonly action: "expand_frame";
  readonly modelTask: typeof EXPAND_FRAME_MODEL_TASK;
  readonly targetAspectRatio: string;
  readonly padding: ExpandFramePadding;
  readonly prompt?: string;
  readonly negativePrompt?: string;
  readonly expandRatio?: number;
  readonly resolution?: string;
}

export interface UpscaleVideoRequest extends SpatialVideoRequestBase {
  readonly action: "upscale";
  readonly modelTask: typeof UPSCALE_VIDEO_MODEL_TASK;
  readonly targetResolution: string;
  readonly scale?: number;
  readonly prompt?: string;
  readonly creativity?: number;
}

export type SpatialVideoRequest = ExpandFrameRequest | UpscaleVideoRequest;

interface SpatialVideoRequestInputBase {
  readonly clip: TimelineClip;
  readonly sequenceId: string;
  readonly requestId: string;
  readonly model: SpatialVideoModel;
}

export interface CreateExpandFrameRequestInput extends SpatialVideoRequestInputBase {
  readonly action: "expand_frame";
  readonly targetAspectRatio: string;
  readonly padding: ExpandFramePadding;
  readonly prompt?: string;
  readonly negativePrompt?: string;
  readonly expandRatio?: number;
  readonly resolution?: string;
}

export interface CreateUpscaleVideoRequestInput extends SpatialVideoRequestInputBase {
  readonly action: "upscale";
  readonly targetResolution: string;
  readonly scale?: number;
  readonly prompt?: string;
  readonly creativity?: number;
}

export type CreateSpatialVideoRequestInput =
  | CreateExpandFrameRequestInput
  | CreateUpscaleVideoRequestInput;

export interface SpatialVideoProviderRequest {
  readonly capability:
    | typeof EXPAND_FRAME_MODEL_TASK
    | typeof UPSCALE_VIDEO_MODEL_TASK;
  readonly provider: string;
  readonly model: string;
  /** The host resolves this captured asset and source window to video bytes. */
  readonly sourceAssetId: string;
  readonly sourceContext: MediaEditSourceContext;
  readonly params: Readonly<Record<string, unknown>>;
}

function requireModelTask(
  model: SpatialVideoModel,
  task: typeof EXPAND_FRAME_MODEL_TASK | typeof UPSCALE_VIDEO_MODEL_TASK
): void {
  if (!model.id || !model.provider || !model.supportedTasks?.includes(task)) {
    throw new Error(`Choose a model with the ${task} task.`);
  }
}

function finiteNonNegative(value: number | undefined): boolean {
  return value === undefined || (Number.isFinite(value) && value >= 0);
}

function validatePadding(padding: ExpandFramePadding): void {
  const sides = [padding.left, padding.right, padding.top, padding.bottom];
  if (
    !sides.every(finiteNonNegative) ||
    !sides.some((value) => (value ?? 0) > 0)
  ) {
    throw new Error(
      "Expand frame requires non-negative padding and at least one generated side."
    );
  }
}

function validateAspectRatio(value: string): void {
  const parts = value.trim().split(":");
  if (
    parts.length !== 2 ||
    parts.some(
      (part) => !part || !Number.isFinite(Number(part)) || Number(part) <= 0
    )
  ) {
    throw new Error("Expand frame requires a positive target aspect ratio.");
  }
}

function requestBase(
  input: SpatialVideoRequestInputBase
): SpatialVideoRequestBase {
  if (!input.sequenceId || !input.requestId) {
    throw new Error(
      "Spatial video actions require a saved sequence and request id."
    );
  }
  const source = captureMediaEditSourceContext(input.sequenceId, input.clip);
  if (!source.ok) {
    throw new Error(source.error);
  }
  return {
    requestId: input.requestId,
    sequenceId: input.sequenceId,
    sourceContext: source.context,
    provider: input.model.provider,
    model: input.model.id,
    candidateOnly: true
  };
}

/** Validate and capture one spatial video operation before provider dispatch. */
export function createSpatialVideoRequest(
  input: CreateSpatialVideoRequestInput
): SpatialVideoRequest {
  if (input.action === "expand_frame") {
    requireModelTask(input.model, EXPAND_FRAME_MODEL_TASK);
    validateAspectRatio(input.targetAspectRatio);
    validatePadding(input.padding);
    if (
      input.expandRatio !== undefined &&
      (!Number.isFinite(input.expandRatio) || input.expandRatio <= 0)
    ) {
      throw new Error("Expand frame requires a positive expand ratio.");
    }
    const padding = Object.freeze({ ...input.padding });
    return Object.freeze({
      ...requestBase(input),
      action: "expand_frame",
      modelTask: EXPAND_FRAME_MODEL_TASK,
      targetAspectRatio: input.targetAspectRatio.trim(),
      padding,
      ...(input.prompt?.trim() && { prompt: input.prompt.trim() }),
      ...(input.negativePrompt?.trim() && {
        negativePrompt: input.negativePrompt.trim()
      }),
      ...(input.expandRatio !== undefined && {
        expandRatio: input.expandRatio
      }),
      ...(input.resolution?.trim() && { resolution: input.resolution.trim() })
    });
  }

  requireModelTask(input.model, UPSCALE_VIDEO_MODEL_TASK);
  if (!input.targetResolution.trim()) {
    throw new Error("Upscale requires a target resolution.");
  }
  if (
    input.scale !== undefined &&
    (!Number.isFinite(input.scale) || input.scale <= 1)
  ) {
    throw new Error("Upscale scale must be greater than 1.");
  }
  if (
    input.creativity !== undefined &&
    (!Number.isFinite(input.creativity) ||
      input.creativity < 0 ||
      input.creativity > 1)
  ) {
    throw new Error("Upscale creativity must be between 0 and 1.");
  }
  return Object.freeze({
    ...requestBase(input),
    action: "upscale",
    modelTask: UPSCALE_VIDEO_MODEL_TASK,
    targetResolution: input.targetResolution.trim(),
    ...(input.scale !== undefined && { scale: input.scale }),
    ...(input.prompt?.trim() && { prompt: input.prompt.trim() }),
    ...(input.creativity !== undefined && { creativity: input.creativity })
  });
}

/** Map the captured action to the existing provider capability contract. */
export function spatialVideoProviderRequest(
  request: SpatialVideoRequest
): SpatialVideoProviderRequest {
  if (request.action === "expand_frame") {
    return Object.freeze({
      capability: EXPAND_FRAME_MODEL_TASK,
      provider: request.provider,
      model: request.model,
      sourceAssetId: request.sourceContext.sourceAssetId,
      sourceContext: request.sourceContext,
      params: Object.freeze({
        prompt: request.prompt,
        negative_prompt: request.negativePrompt,
        padding: request.padding,
        expand_ratio: request.expandRatio,
        aspect_ratio: request.targetAspectRatio,
        resolution: request.resolution
      })
    });
  }
  return Object.freeze({
    capability: UPSCALE_VIDEO_MODEL_TASK,
    provider: request.provider,
    model: request.model,
    sourceAssetId: request.sourceContext.sourceAssetId,
    sourceContext: request.sourceContext,
    params: Object.freeze({
      scale: request.scale,
      target_resolution: request.targetResolution,
      prompt: request.prompt,
      creativity: request.creativity
    })
  });
}

/**
 * Append a spatial result as an inactive take. The submitted source is used
 * for candidate ancestry, while every current editorial and framing field is
 * retained from `clip`.
 */
export function landSpatialVideoCandidate(
  clip: TimelineClip,
  request: SpatialVideoRequest,
  result: {
    readonly assetId: string;
    readonly createdAt: string;
    readonly durationMs?: number;
  }
): TimelineClip {
  if (clip.id !== request.sourceContext.clipId) {
    throw new Error("The spatial video candidate belongs to a different clip.");
  }
  const sourceClip: TimelineClip = {
    ...clip,
    currentAssetId: request.sourceContext.sourceAssetId
  };
  if (request.sourceContext.sourceTakeId !== undefined) {
    sourceClip.activeTakeId = request.sourceContext.sourceTakeId;
  } else {
    delete sourceClip.activeTakeId;
  }
  const candidate = composeGenerativeTakePatch(sourceClip, "restyle", {
    assetId: result.assetId,
    jobId: request.requestId,
    createdAt: result.createdAt,
    durationMs: result.durationMs,
    provider: request.provider,
    model: request.model,
    prompt: request.prompt,
    paramOverridesSnapshot: { spatialVideoAction: request },
    activate: false
  });
  if (candidate.versions === sourceClip.versions) {
    return clip;
  }
  return {
    ...clip,
    versions: candidate.versions?.map((take) =>
      take.id === request.requestId
        ? {
            ...take,
            sourceMapping: {
              inPointMs: 0,
              outPointMs: request.sourceContext.timelineDurationMs,
              speedMultiplier: 1,
              speedBaked: true
            }
          }
        : take
    )
  };
}
