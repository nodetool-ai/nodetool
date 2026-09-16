import { randomUUID } from "node:crypto";
import {
  loadMediaRefBytes,
  type AudioToAudioModel,
  type BaseProvider,
  type GenerationRequest,
  type GenerationResult,
  type ProcessingContext,
  type VideoModel
} from "@nodetool-ai/runtime";
import type { TimelineDocument, TimelineSequence } from "@nodetool-ai/models";
import {
  captureMediaEditSourceContext,
  createLipSyncCandidateRequest,
  createRecordedVoiceReplacementRequest,
  createSpatialVideoRequest,
  landSpatialVideoCandidate,
  lipSyncCandidateProvenance,
  recordedVoiceReplacementProvenance,
  spatialVideoProviderRequest,
  type AcceptedReplacementAudioInput,
  type CreateExpandFrameRequestInput,
  type CreateUpscaleVideoRequestInput,
  type ExpandFramePadding,
  type MediaEditSourceContext,
  type RecordedSpeechSource,
  type SpatialVideoModel,
  type TimelineClip,
  type VoiceOperationModelSelection,
  type VoiceReplacementTargetInput
} from "@nodetool-ai/timeline";
import {
  expandFrameSpec,
  lipSyncSpec,
  recordedVoiceReplacementSpec,
  upscaleVideoSpec,
  videoToAudioSpec
} from "./timelines.specs.js";
import type { CapabilityExport, CapabilityRun } from "./types.js";
import {
  isFiniteNumber,
  isNonBlankString,
  isRecord,
  isString
} from "../utils/type-guards.js";

type ToolError = {
  readonly error: string;
  readonly code?: string;
};

type ValueOrError<T> = T | ToolError;

type NativeVideoTask =
  | "outpaint_video"
  | "upscale_video"
  | "video_to_audio"
  | "lip_sync";

const RECORDED_VOICE_OPERATION = "recorded_voice_replacement" as const;

const isError = (value: unknown): value is ToolError =>
  isRecord(value) && isString(value.error);

function failure(error: string, code?: string): ToolError {
  return code === undefined ? { error } : { error, code };
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function firstValue(
  record: Record<string, unknown>,
  keys: readonly string[]
): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

function requiredString(value: unknown, label: string): ValueOrError<string> {
  if (!isNonBlankString(value)) {
    return failure(`${label} is required.`, "invalid_request");
  }
  return value.trim();
}

function optionalString(
  value: unknown,
  label: string
): ValueOrError<string | undefined> {
  if (value === undefined || value === null) return undefined;
  if (!isString(value)) {
    return failure(`${label} must be a string.`, "invalid_request");
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function optionalNumber(
  value: unknown,
  label: string
): ValueOrError<number | undefined> {
  if (value === undefined || value === null) return undefined;
  if (!isFiniteNumber(value)) {
    return failure(`${label} must be a finite number.`, "invalid_request");
  }
  return value;
}

function optionalInteger(
  value: unknown,
  label: string
): ValueOrError<number | undefined> {
  const result = optionalNumber(value, label);
  if (isError(result) || result === undefined) return result;
  return Number.isInteger(result)
    ? result
    : failure(`${label} must be an integer.`, "invalid_request");
}

function requestId(value: unknown, action: string): ValueOrError<string> {
  if (value === undefined) return randomUUID();
  const result = requiredString(value, "request_id");
  return isError(result) ? failure(`${action}: ${result.error}`, result.code) : result;
}

async function loadOwnedTimeline(
  run: CapabilityRun,
  value: unknown
): Promise<ValueOrError<TimelineSequence>> {
  const timelineId = requiredString(value, "timeline_id");
  if (isError(timelineId)) return timelineId;
  const { TimelineSequence } = await import("@nodetool-ai/models");
  const sequence = await TimelineSequence.findById(timelineId);
  if (!sequence || sequence.user_id !== run.context.userId) {
    return failure(`Timeline ${timelineId} was not found.`);
  }
  return sequence;
}

function findClip(
  document: TimelineDocument,
  value: unknown
): ValueOrError<TimelineClip> {
  const target = requiredString(value, "clip_id");
  if (isError(target)) return target;
  const normalized = target.toLowerCase();
  const clip = document.clips.find(
    (candidate) =>
      candidate.id.toLowerCase() === normalized ||
      candidate.name.toLowerCase() === normalized
  );
  return clip ?? failure(`Clip ${target} was not found in the timeline.`);
}

function captureVideoSource(
  sequenceId: string,
  clip: TimelineClip
): ValueOrError<MediaEditSourceContext> {
  const captured = captureMediaEditSourceContext(sequenceId, clip);
  return captured.ok
    ? captured.context
    : failure(captured.error, "invalid_source");
}

function checkSourcePin(
  params: Record<string, unknown>,
  sourceAssetId: string
): ToolError | undefined {
  const raw = params["source_asset_id"];
  if (raw === undefined) return undefined;
  if (!isNonBlankString(raw)) {
    return failure("source_asset_id must be a non-empty string.", "invalid_request");
  }
  if (raw.trim() !== sourceAssetId) {
    return failure(
      `The source asset is stale: expected ${raw.trim()}, but the clip now uses ${sourceAssetId}.`,
      "source_stale"
    );
  }
  return undefined;
}

async function selectVideoModel(
  context: ProcessingContext,
  providerValue: unknown,
  modelValue: unknown,
  task: NativeVideoTask
): Promise<ValueOrError<{ provider: BaseProvider; model: VideoModel }>> {
  const providerId = requiredString(providerValue, "provider");
  if (isError(providerId)) return providerId;
  const modelId = requiredString(modelValue, "model");
  if (isError(modelId)) return modelId;

  let provider: BaseProvider;
  try {
    provider = await context.getProvider(providerId);
  } catch (error) {
    return failure(
      `Provider ${providerId} is unavailable: ${errorMessage(error)}`,
      "provider_unavailable"
    );
  }
  if (!provider.getCapabilities().includes(task)) {
    return failure(
      `${providerId} does not support the ${task} task.`,
      "unsupported_provider_task"
    );
  }

  let models: VideoModel[];
  try {
    models = await provider.getAvailableVideoModels();
  } catch (error) {
    return failure(
      `Could not load ${providerId} video models: ${errorMessage(error)}`,
      "model_catalog_unavailable"
    );
  }
  const model = models.find(
    (candidate) => candidate.id === modelId && candidate.provider === providerId
  );
  if (!model || !model.supportedTasks?.includes(task)) {
    return failure(
      `Model ${providerId}:${modelId} does not support ${task}. Choose a model from find_model for that task.`,
      "unsupported_model_task"
    );
  }
  return { provider, model };
}

async function selectAudioTransformModel(
  context: ProcessingContext,
  providerValue: unknown,
  modelValue: unknown
): Promise<ValueOrError<{ provider: BaseProvider; model: AudioToAudioModel }>> {
  const providerId = requiredString(providerValue, "provider");
  if (isError(providerId)) return providerId;
  const modelId = requiredString(modelValue, "model");
  if (isError(modelId)) return modelId;

  let provider: BaseProvider;
  try {
    provider = await context.getProvider(providerId);
  } catch (error) {
    return failure(
      `Provider ${providerId} is unavailable: ${errorMessage(error)}`,
      "provider_unavailable"
    );
  }
  if (!provider.getCapabilities().includes("audio_to_audio")) {
    return failure(
      `${providerId} does not support the audio_to_audio task.`,
      "unsupported_provider_task"
    );
  }

  let models: AudioToAudioModel[];
  try {
    models = await provider.getAvailableAudioToAudioModels();
  } catch (error) {
    return failure(
      `Could not load ${providerId} audio transform models: ${errorMessage(error)}`,
      "model_catalog_unavailable"
    );
  }
  const model = models.find(
    (candidate) => candidate.id === modelId && candidate.provider === providerId
  );
  if (!model || !model.supportedTasks?.includes("audio_to_audio")) {
    return failure(
      `Model ${providerId}:${modelId} does not support audio_to_audio. Choose a model from find_model for that task.`,
      "unsupported_model_task"
    );
  }
  return { provider, model };
}

function spatialModel(model: VideoModel): SpatialVideoModel {
  return {
    id: model.id,
    provider: model.provider,
    ...(model.supportedTasks !== undefined && {
      supportedTasks: model.supportedTasks
    })
  };
}

function operationListFromValue(
  value: unknown
): ValueOrError<readonly string[] | undefined> {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || !value.every(isString)) {
    return failure(
      "supported_operations must be an array of strings.",
      "invalid_request"
    );
  }
  return value.map((operation) => operation.trim());
}

function operationListFromModel(
  model: AudioToAudioModel
): readonly string[] | undefined {
  const value: unknown = model;
  if (!isRecord(value)) return undefined;
  const operations = value["supportedOperations"];
  if (!Array.isArray(operations) || !operations.every(isString)) {
    return undefined;
  }
  return operations.map((operation) => operation.trim());
}

function voiceModelSelection(
  model: AudioToAudioModel | VideoModel,
  supportedOperations?: readonly string[]
): VoiceOperationModelSelection {
  return {
    id: model.id,
    provider: model.provider,
    ...(model.supportedTasks !== undefined && {
      supportedTasks: model.supportedTasks
    }),
    ...(supportedOperations !== undefined && { supportedOperations })
  };
}

function readPadding(value: unknown): ValueOrError<ExpandFramePadding> {
  if (!isRecord(value)) {
    return failure("padding must be an object.", "invalid_request");
  }
  const padding: {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  } = {};
  for (const key of ["left", "right", "top", "bottom"] as const) {
    const side = value[key];
    if (side === undefined || side === null) continue;
    if (!isFiniteNumber(side)) {
      return failure(`padding.${key} must be a finite number.`, "invalid_request");
    }
    padding[key] = side;
  }
  return padding;
}

async function sourceBytes(
  context: ProcessingContext,
  mediaType: "audio" | "video",
  assetId: string
): Promise<ValueOrError<Uint8Array>> {
  try {
    const bytes = await loadMediaRefBytes(
      { type: mediaType, asset_id: assetId },
      context
    );
    return bytes?.byteLength
      ? bytes
      : failure(
          `The ${mediaType} source asset ${assetId} could not be loaded.`,
          "source_unavailable"
        );
  } catch (error) {
    return failure(
      `The ${mediaType} source asset ${assetId} could not be loaded: ${errorMessage(error)}`,
      "source_unavailable"
    );
  }
}

function generationAssetId(result: GenerationResult): string | null {
  for (const asset of result.assets) {
    const assetId = asset.asset_id;
    if (isNonBlankString(assetId)) return assetId;
  }
  return null;
}

async function dispatchGeneration(
  run: CapabilityRun,
  request: GenerationRequest
): Promise<ValueOrError<GenerationResult>> {
  try {
    return await run.context.runGeneration(request);
  } catch (error) {
    return failure(
      `Generation ${request.id ?? ""} failed for ${request.provider}:${request.model}: ${errorMessage(error)}`,
      "generation_failed"
    );
  }
}

function generationRequest(input: {
  readonly requestId: string;
  readonly provider: string;
  readonly model: string;
  readonly capability: GenerationRequest["capability"];
  readonly params: Record<string, unknown>;
  readonly mediaType: "audio" | "video";
  readonly timelineId: string;
  readonly clipId: string;
}): GenerationRequest {
  return {
    id: input.requestId,
    provider: input.provider,
    model: input.model,
    capability: input.capability,
    params: input.params,
    origin: { surface: "capability" },
    persist: {
      name: `${input.capability}-${input.clipId}`,
      mime: input.mediaType === "video" ? "video/mp4" : "audio/mpeg"
    },
    destination: {
      document_id: input.timelineId,
      target_type: "timeline_clip",
      target_id: input.clipId,
      selected: false
    }
  };
}

function candidateResponse(input: {
  readonly action: string;
  readonly timelineId: string;
  readonly clipId: string;
  readonly generation: GenerationResult;
  readonly candidate: unknown;
  readonly provenance: unknown;
}): Record<string, unknown> {
  return {
    action: input.action,
    timeline_id: input.timelineId,
    clip_id: input.clipId,
    generation_id: input.generation.id,
    accepted: false,
    candidate_only: true,
    timeline_mutated: false,
    candidate: input.candidate,
    provenance: input.provenance
  };
}

function candidateVersion(
  original: TimelineClip,
  requestId: string,
  landed: TimelineClip
): ValueOrError<NonNullable<TimelineClip["versions"]>[number]> {
  if (landed.versions === original.versions) {
    return failure(
      `Candidate request ${requestId} was already present or could not be landed.`,
      "candidate_not_landed"
    );
  }
  const candidate = landed.versions.find((version) => version.id === requestId);
  return candidate ?? failure(
    `Candidate request ${requestId} was not added to the clip.`,
    "candidate_not_landed"
  );
}

function readSpatialOptions(
  params: Record<string, unknown>,
  action: "expand_frame" | "upscale"
): ValueOrError<{
  readonly prompt?: string;
  readonly negativePrompt?: string;
  readonly expandRatio?: number;
  readonly resolution?: string;
  readonly scale?: number;
  readonly creativity?: number;
}> {
  const prompt = optionalString(params["prompt"], "prompt");
  if (isError(prompt)) return prompt;
  const negativePrompt = optionalString(
    firstValue(params, ["negative_prompt", "negativePrompt"]),
    "negative_prompt"
  );
  if (isError(negativePrompt)) return negativePrompt;
  const resolution = optionalString(params["resolution"], "resolution");
  if (isError(resolution)) return resolution;

  if (action === "expand_frame") {
    const expandRatio = optionalNumber(params["expand_ratio"], "expand_ratio");
    if (isError(expandRatio)) return expandRatio;
    return {
      ...(prompt !== undefined && { prompt }),
      ...(negativePrompt !== undefined && { negativePrompt }),
      ...(expandRatio !== undefined && { expandRatio }),
      ...(resolution !== undefined && { resolution })
    };
  }

  const scale = optionalNumber(params["scale"], "scale");
  if (isError(scale)) return scale;
  const creativity = optionalNumber(params["creativity"], "creativity");
  if (isError(creativity)) return creativity;
  return {
    ...(prompt !== undefined && { prompt }),
    ...(scale !== undefined && { scale }),
    ...(creativity !== undefined && { creativity })
  };
}

const expandFrame: CapabilityExport = {
  spec: expandFrameSpec,
  impl: async (run, params) => {
    const sequence = await loadOwnedTimeline(run, params["timeline_id"]);
    if (isError(sequence)) return sequence;
    const clip = findClip(sequence.toDocument(), params["clip_id"]);
    if (isError(clip)) return clip;
    const source = captureVideoSource(sequence.id, clip);
    if (isError(source)) return source;
    const sourcePinError = checkSourcePin(params, source.sourceAssetId);
    if (sourcePinError) return sourcePinError;

    const providerModel = await selectVideoModel(
      run.context,
      params["provider"],
      params["model"],
      "outpaint_video"
    );
    if (isError(providerModel)) return providerModel;
    const targetAspectRatio = requiredString(
      params["target_aspect_ratio"],
      "target_aspect_ratio"
    );
    if (isError(targetAspectRatio)) return targetAspectRatio;
    const padding = readPadding(params["padding"]);
    if (isError(padding)) return padding;
    const options = readSpatialOptions(params, "expand_frame");
    if (isError(options)) return options;
    const id = requestId(params["request_id"], "expand_frame");
    if (isError(id)) return id;

    let request;
    try {
      const input: CreateExpandFrameRequestInput = {
        clip,
        sequenceId: sequence.id,
        requestId: id,
        model: spatialModel(providerModel.model),
        action: "expand_frame",
        targetAspectRatio,
        padding,
        ...(options.prompt !== undefined && { prompt: options.prompt }),
        ...(options.negativePrompt !== undefined && {
          negativePrompt: options.negativePrompt
        }),
        ...(options.expandRatio !== undefined && {
          expandRatio: options.expandRatio
        }),
        ...(options.resolution !== undefined && {
          resolution: options.resolution
        })
      };
      request = createSpatialVideoRequest(input);
    } catch (error) {
      return failure(`expand_frame was refused: ${errorMessage(error)}`, "invalid_request");
    }

    const bytes = await sourceBytes(
      run.context,
      "video",
      request.sourceContext.sourceAssetId
    );
    if (isError(bytes)) return bytes;
    const providerRequest = spatialVideoProviderRequest(request);
    const generation = await dispatchGeneration(
      run,
      generationRequest({
        requestId: request.requestId,
        provider: request.provider,
        model: request.model,
        capability: providerRequest.capability,
        params: { video: bytes, ...providerRequest.params },
        mediaType: "video",
        timelineId: sequence.id,
        clipId: clip.id
      })
    );
    if (isError(generation)) return generation;
    const assetId = generationAssetId(generation);
    if (!assetId) {
      return failure(
        `Generation ${generation.id} completed without a persisted video asset.`,
        "generation_missing_asset"
      );
    }
    const landed = landSpatialVideoCandidate(clip, request, {
      assetId,
      createdAt: new Date().toISOString()
    });
    const candidate = candidateVersion(clip, request.requestId, landed);
    if (isError(candidate)) return candidate;
    return candidateResponse({
      action: request.action,
      timelineId: sequence.id,
      clipId: clip.id,
      generation,
      candidate,
      provenance: {
        request_id: request.requestId,
        operation: request.action,
        model_task: request.modelTask,
        provider: request.provider,
        model: request.model,
        result_asset_id: assetId,
        result_disposition: "candidate",
        source_context: request.sourceContext
      }
    });
  }
};

const upscaleVideo: CapabilityExport = {
  spec: upscaleVideoSpec,
  impl: async (run, params) => {
    const sequence = await loadOwnedTimeline(run, params["timeline_id"]);
    if (isError(sequence)) return sequence;
    const clip = findClip(sequence.toDocument(), params["clip_id"]);
    if (isError(clip)) return clip;
    const source = captureVideoSource(sequence.id, clip);
    if (isError(source)) return source;
    const sourcePinError = checkSourcePin(params, source.sourceAssetId);
    if (sourcePinError) return sourcePinError;

    const providerModel = await selectVideoModel(
      run.context,
      params["provider"],
      params["model"],
      "upscale_video"
    );
    if (isError(providerModel)) return providerModel;
    const targetResolution = requiredString(
      params["target_resolution"],
      "target_resolution"
    );
    if (isError(targetResolution)) return targetResolution;
    const options = readSpatialOptions(params, "upscale");
    if (isError(options)) return options;
    const seed = optionalInteger(params["seed"], "seed");
    if (isError(seed)) return seed;
    const id = requestId(params["request_id"], "upscale_video");
    if (isError(id)) return id;

    let request;
    try {
      const input: CreateUpscaleVideoRequestInput = {
        clip,
        sequenceId: sequence.id,
        requestId: id,
        model: spatialModel(providerModel.model),
        action: "upscale",
        targetResolution,
        ...(options.prompt !== undefined && { prompt: options.prompt }),
        ...(options.scale !== undefined && { scale: options.scale }),
        ...(options.creativity !== undefined && {
          creativity: options.creativity
        })
      };
      request = createSpatialVideoRequest(input);
    } catch (error) {
      return failure(`upscale_video was refused: ${errorMessage(error)}`, "invalid_request");
    }

    const bytes = await sourceBytes(
      run.context,
      "video",
      request.sourceContext.sourceAssetId
    );
    if (isError(bytes)) return bytes;
    const providerRequest = spatialVideoProviderRequest(request);
    const generationParams: Record<string, unknown> = {
      video: bytes,
      ...providerRequest.params
    };
    if (seed !== undefined) generationParams.seed = seed;
    const generation = await dispatchGeneration(
      run,
      generationRequest({
        requestId: request.requestId,
        provider: request.provider,
        model: request.model,
        capability: providerRequest.capability,
        params: generationParams,
        mediaType: "video",
        timelineId: sequence.id,
        clipId: clip.id
      })
    );
    if (isError(generation)) return generation;
    const assetId = generationAssetId(generation);
    if (!assetId) {
      return failure(
        `Generation ${generation.id} completed without a persisted video asset.`,
        "generation_missing_asset"
      );
    }
    const landed = landSpatialVideoCandidate(clip, request, {
      assetId,
      createdAt: new Date().toISOString()
    });
    const candidate = candidateVersion(clip, request.requestId, landed);
    if (isError(candidate)) return candidate;
    return candidateResponse({
      action: request.action,
      timelineId: sequence.id,
      clipId: clip.id,
      generation,
      candidate,
      provenance: {
        request_id: request.requestId,
        operation: request.action,
        model_task: request.modelTask,
        provider: request.provider,
        model: request.model,
        result_asset_id: assetId,
        result_disposition: "candidate",
        source_context: request.sourceContext
      }
    });
  }
};

async function sourceDurationMs(
  context: ProcessingContext,
  sourceAssetId: string,
  value: unknown
): Promise<ValueOrError<number>> {
  const explicit = optionalNumber(value, "source_duration_ms");
  if (isError(explicit)) return explicit;
  if (explicit !== undefined) {
    return explicit > 0
      ? Math.round(explicit)
      : failure("source_duration_ms must be positive.", "invalid_request");
  }
  const userId = context.userId;
  if (!userId) {
    return failure(
      "A source duration is required when no user is bound to the context.",
      "source_duration_unavailable"
    );
  }
  try {
    const { Asset } = await import("@nodetool-ai/models");
    const asset = await Asset.find(userId, sourceAssetId);
    if (!asset || !isFiniteNumber(asset.duration) || asset.duration <= 0) {
      return failure(
        `Could not determine the duration of source asset ${sourceAssetId}. Pass source_duration_ms.`,
        "source_duration_unavailable"
      );
    }
    return Math.round(asset.duration * 1000);
  } catch (error) {
    return failure(
      `Could not determine the duration of source asset ${sourceAssetId}: ${errorMessage(error)}`,
      "source_duration_unavailable"
    );
  }
}

const videoToAudio: CapabilityExport = {
  spec: videoToAudioSpec,
  impl: async (run, params) => {
    const sequence = await loadOwnedTimeline(run, params["timeline_id"]);
    if (isError(sequence)) return sequence;
    const clip = findClip(sequence.toDocument(), params["clip_id"]);
    if (isError(clip)) return clip;
    const source = captureVideoSource(sequence.id, clip);
    if (isError(source)) return source;
    const sourcePinError = checkSourcePin(params, source.sourceAssetId);
    if (sourcePinError) return sourcePinError;
    const sceneContext = requiredString(
      firstValue(params, ["scene_context", "sceneContext"]),
      "scene_context"
    );
    if (isError(sceneContext)) return sceneContext;
    const providerModel = await selectVideoModel(
      run.context,
      params["provider"],
      params["model"],
      "video_to_audio"
    );
    if (isError(providerModel)) return providerModel;
    const durationMs = await sourceDurationMs(
      run.context,
      source.sourceAssetId,
      params["source_duration_ms"]
    );
    if (isError(durationMs)) return durationMs;
    if (durationMs < source.sourceEndMs) {
      return failure(
        `Source asset ${source.sourceAssetId} is shorter than the captured clip window.`,
        "source_stale"
      );
    }
    const id = requestId(params["request_id"], "video_to_audio");
    if (isError(id)) return id;
    const bytes = await sourceBytes(
      run.context,
      "video",
      source.sourceAssetId
    );
    if (isError(bytes)) return bytes;

    const generation = await dispatchGeneration(
      run,
      generationRequest({
        requestId: id,
        provider: providerModel.model.provider,
        model: providerModel.model.id,
        capability: "video_to_audio",
        params: {
          video: bytes,
          source: {
            assetId: source.sourceAssetId,
            durationSeconds: durationMs / 1000,
            startSeconds: source.sourceStartMs / 1000,
            endSeconds: source.sourceEndMs / 1000
          },
          scene_context: sceneContext
        },
        mediaType: "audio",
        timelineId: sequence.id,
        clipId: clip.id
      })
    );
    if (isError(generation)) return generation;
    const assetId = generationAssetId(generation);
    if (!assetId) {
      return failure(
        `Generation ${generation.id} completed without a persisted audio asset.`,
        "generation_missing_asset"
      );
    }
    return candidateResponse({
      action: "video_to_audio",
      timelineId: sequence.id,
      clipId: clip.id,
      generation,
      candidate: {
        candidate_id: id,
        request_id: id,
        asset_id: assetId,
        media_type: "audio",
        disposition: "candidate",
        accepted: false,
        alignment: {
          timeline_start_ms: source.timelineStartMs,
          duration_ms: source.timelineDurationMs
        }
      },
      provenance: {
        request_id: id,
        operation: "video_to_audio",
        model_task: "video_to_audio",
        provider: providerModel.model.provider,
        model: providerModel.model.id,
        result_asset_id: assetId,
        result_disposition: "candidate",
        source_context: source,
        scene_context: sceneContext
      }
    });
  }
};

function readSpeechSource(value: unknown): ValueOrError<RecordedSpeechSource> {
  if (!isRecord(value)) {
    return failure(
      "source must identify clean_speech or isolated_speech and an asset_id.",
      "invalid_request"
    );
  }
  const kind = requiredString(value["kind"], "source.kind");
  if (isError(kind)) return kind;
  const assetId = requiredString(
    firstValue(value, ["asset_id", "assetId"]),
    "source.asset_id"
  );
  if (isError(assetId)) return assetId;
  if (kind !== "clean_speech" && kind !== "isolated_speech") {
    return failure(
      "source.kind must be clean_speech or isolated_speech.",
      "invalid_request"
    );
  }
  if (kind === "clean_speech") {
    return { kind, assetId };
  }
  const isolationRequestId = optionalString(
    firstValue(value, ["isolation_request_id", "isolationRequestId"]),
    "source.isolation_request_id"
  );
  if (isError(isolationRequestId)) return isolationRequestId;
  return {
    kind,
    assetId,
    ...(isolationRequestId !== undefined && { isolationRequestId })
  };
}

function readVoiceTarget(value: unknown): ValueOrError<VoiceReplacementTargetInput> {
  if (!isRecord(value)) {
    return failure(
      "target must identify a voice or an unsupported reference_audio target.",
      "invalid_request"
    );
  }
  const kind = requiredString(value["kind"], "target.kind");
  if (isError(kind)) return kind;
  if (kind === "reference_audio") {
    const assetId = requiredString(
      firstValue(value, ["asset_id", "assetId"]),
      "target.asset_id"
    );
    if (isError(assetId)) return assetId;
    return { kind, assetId };
  }
  if (kind !== "voice") {
    return failure(
      "target.kind must be voice.",
      "invalid_request"
    );
  }
  const voiceId = requiredString(
    firstValue(value, ["voice_id", "voiceId"]),
    "target.voice_id"
  );
  if (isError(voiceId)) return voiceId;
  return { kind, voiceId };
}

const recordedVoiceReplacement: CapabilityExport = {
  spec: recordedVoiceReplacementSpec,
  impl: async (run, params) => {
    const sequence = await loadOwnedTimeline(run, params["timeline_id"]);
    if (isError(sequence)) return sequence;
    const clip = findClip(sequence.toDocument(), params["clip_id"]);
    if (isError(clip)) return clip;
    if (clip.mediaType !== "audio" && clip.mediaType !== "video") {
      return failure(
        "Recorded voice replacement requires an audio or video dialogue clip.",
        "invalid_source"
      );
    }
    const targetCurrentAssetId = optionalString(
      params["target_current_asset_id"],
      "target_current_asset_id"
    );
    if (isError(targetCurrentAssetId)) return targetCurrentAssetId;
    if (
      targetCurrentAssetId !== undefined &&
      targetCurrentAssetId !== clip.currentAssetId
    ) {
      return failure(
        `The target clip is stale: expected ${targetCurrentAssetId}, but it now uses ${clip.currentAssetId ?? "no asset"}.`,
        "source_stale"
      );
    }
    const source = readSpeechSource(params["source"]);
    if (isError(source)) return source;
    const target = readVoiceTarget(params["target"]);
    if (isError(target)) return target;
    const providerModel = await selectAudioTransformModel(
      run.context,
      params["provider"],
      params["model"]
    );
    if (isError(providerModel)) return providerModel;
    const declaredOperations = operationListFromValue(
      params["supported_operations"]
    );
    if (isError(declaredOperations)) return declaredOperations;
    const supportedOperations =
      operationListFromModel(providerModel.model) ??
      declaredOperations;
    if (supportedOperations === undefined) {
      return failure(
        "The selected audio transform model must declare recorded_voice_replacement support.",
        "unsupported_model_operation"
      );
    }
    const id = requestId(params["request_id"], RECORDED_VOICE_OPERATION);
    if (isError(id)) return id;

    const requestResult = createRecordedVoiceReplacementRequest({
      requestId: id,
      sequenceId: sequence.id,
      clipId: clip.id,
      source,
      target,
      model: voiceModelSelection(providerModel.model, supportedOperations)
    });
    if (!requestResult.ok) {
      return failure(requestResult.error, requestResult.code);
    }
    const request = requestResult.request;
    const bytes = await sourceBytes(run.context, "audio", request.source.assetId);
    if (isError(bytes)) return bytes;
    const generation = await dispatchGeneration(
      run,
      generationRequest({
        requestId: request.requestId,
        provider: request.provider,
        model: request.model,
        capability: "audio_to_audio",
        params: {
          audio: bytes,
          voice: request.target.voiceId,
          source_asset_id: request.source.assetId,
          operation: request.operation
        },
        mediaType: "audio",
        timelineId: sequence.id,
        clipId: clip.id
      })
    );
    if (isError(generation)) return generation;
    const assetId = generationAssetId(generation);
    if (!assetId) {
      return failure(
        `Generation ${generation.id} completed without a persisted audio asset.`,
        "generation_missing_asset"
      );
    }
    const targetContext = {
      sequenceId: sequence.id,
      clipId: clip.id,
      sourceAssetId: clip.currentAssetId ?? null,
      timelineStartMs: clip.startMs,
      timelineDurationMs: clip.durationMs
    };
    return candidateResponse({
      action: request.operation,
      timelineId: sequence.id,
      clipId: clip.id,
      generation,
      candidate: {
        candidate_id: request.requestId,
        request_id: request.requestId,
        asset_id: assetId,
        media_type: "audio",
        disposition: "candidate",
        accepted: false,
        source_asset_id: request.source.assetId,
        target_voice_id: request.target.voiceId
      },
      provenance: {
        ...recordedVoiceReplacementProvenance(request),
        model_task: request.modelTask,
        generation_id: generation.id,
        result_asset_id: assetId,
        target_context: targetContext
      }
    });
  }
};

function readAcceptedReplacementAudio(
  value: unknown
): ValueOrError<AcceptedReplacementAudioInput> {
  if (!isRecord(value)) {
    return failure(
      "replacement_audio must include the accepted replacement candidate and provenance.",
      "invalid_request"
    );
  }
  const replacement: {
    assetId?: string;
    status?: "candidate" | "accepted";
    provenance?: {
      requestId?: string;
      operation?: string;
    };
  } = {};
  const assetId = optionalString(
    firstValue(value, ["asset_id", "assetId"]),
    "replacement_audio.asset_id"
  );
  if (isError(assetId)) return assetId;
  if (assetId !== undefined) replacement.assetId = assetId;
  const status = value["status"];
  if (status !== undefined && status !== null) {
    if (status !== "candidate" && status !== "accepted") {
      return failure(
        "replacement_audio.status must be candidate or accepted.",
        "invalid_request"
      );
    }
    replacement.status = status;
  }
  const provenanceValue = value["provenance"];
  if (provenanceValue !== undefined && provenanceValue !== null) {
    if (!isRecord(provenanceValue)) {
      return failure(
        "replacement_audio.provenance must be an object.",
        "invalid_request"
      );
    }
    const requestId = optionalString(
      firstValue(provenanceValue, ["request_id", "requestId"]),
      "replacement_audio.provenance.request_id"
    );
    if (isError(requestId)) return requestId;
    const operation = optionalString(
      provenanceValue["operation"],
      "replacement_audio.provenance.operation"
    );
    if (isError(operation)) return operation;
    const provenance: {
      requestId?: string;
      operation?: string;
    } = {};
    if (requestId !== undefined) provenance.requestId = requestId;
    if (operation !== undefined) provenance.operation = operation;
    replacement.provenance = provenance;
  }
  return replacement;
}

const lipSync: CapabilityExport = {
  spec: lipSyncSpec,
  impl: async (run, params) => {
    const sequence = await loadOwnedTimeline(run, params["timeline_id"]);
    if (isError(sequence)) return sequence;
    const clip = findClip(sequence.toDocument(), params["clip_id"]);
    if (isError(clip)) return clip;
    const source = captureVideoSource(sequence.id, clip);
    if (isError(source)) return source;
    const sourcePinError = checkSourcePin(params, source.sourceAssetId);
    if (sourcePinError) return sourcePinError;
    const replacementAudio = readAcceptedReplacementAudio(
      params["replacement_audio"]
    );
    if (isError(replacementAudio)) return replacementAudio;
    const providerModel = await selectVideoModel(
      run.context,
      params["provider"],
      params["model"],
      "lip_sync"
    );
    if (isError(providerModel)) return providerModel;
    const id = requestId(params["request_id"], "lip_sync");
    if (isError(id)) return id;
    const requestResult = createLipSyncCandidateRequest({
      requestId: id,
      sequenceId: sequence.id,
      clipId: clip.id,
      sourceVideoAssetId: source.sourceAssetId,
      replacementAudio,
      model: voiceModelSelection(providerModel.model)
    });
    if (!requestResult.ok) {
      return failure(requestResult.error, requestResult.code);
    }
    const request = requestResult.request;
    const [video, audio] = await Promise.all([
      sourceBytes(run.context, "video", request.sourceVideoAssetId),
      sourceBytes(run.context, "audio", request.replacementAudio.assetId)
    ]);
    if (isError(video)) return video;
    if (isError(audio)) return audio;
    const seed = optionalInteger(params["seed"], "seed");
    if (isError(seed)) return seed;
    const paramsForGeneration: Record<string, unknown> = {
      video,
      audio
    };
    if (seed !== undefined) paramsForGeneration.seed = seed;
    const generation = await dispatchGeneration(
      run,
      generationRequest({
        requestId: request.requestId,
        provider: request.provider,
        model: request.model,
        capability: "lip_sync",
        params: paramsForGeneration,
        mediaType: "video",
        timelineId: sequence.id,
        clipId: clip.id
      })
    );
    if (isError(generation)) return generation;
    const assetId = generationAssetId(generation);
    if (!assetId) {
      return failure(
        `Generation ${generation.id} completed without a persisted video asset.`,
        "generation_missing_asset"
      );
    }
    return candidateResponse({
      action: request.operation,
      timelineId: sequence.id,
      clipId: clip.id,
      generation,
      candidate: {
        candidate_id: request.requestId,
        request_id: request.requestId,
        asset_id: assetId,
        media_type: "video",
        disposition: "candidate",
        accepted: false,
        source_asset_id: request.sourceVideoAssetId,
        replacement_audio_asset_id: request.replacementAudio.assetId
      },
      provenance: {
        ...lipSyncCandidateProvenance(request),
        model_task: request.modelTask,
        generation_id: generation.id,
        result_asset_id: assetId,
        source_context: source
      }
    });
  }
};

/** Agent-facing candidate-only entry points for the native media edit tasks. */
export const TIMELINE_NATIVE_MEDIA_CAPABILITIES: readonly CapabilityExport[] = [
  expandFrame,
  upscaleVideo,
  videoToAudio,
  recordedVoiceReplacement,
  lipSync
];
