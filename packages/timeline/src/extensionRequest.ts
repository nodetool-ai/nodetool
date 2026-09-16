import { applyExtensionToClips, captureExtensionSource } from "./extension.js";
import type { ExtensionSourceSnapshot, ExtensionTiming } from "./extension.js";
import {
  composeGenerativeTakePatch,
  planGenerativeOperation
} from "./generative.js";
import type { TimelineClip } from "./types.js";

export const EXTENSION_MODEL_TASK = "extend_video" as const;

export interface ExtensionModel {
  readonly id: string;
  readonly provider: string;
  readonly supportedTasks?: readonly string[];
  readonly durations?: readonly number[];
}

/** Serializable submission snapshot, retained by the host until attachment. */
export interface ExtensionRequest {
  readonly action: "video_extend";
  readonly requestId: string;
  readonly sequenceId: string;
  readonly source: ExtensionSourceSnapshot;
  readonly direction: "start" | "end";
  readonly addedSourceDurationMs: number;
  readonly prompt: string;
  readonly provider: string;
  readonly model: string;
}

export function createExtensionRequest(input: {
  clip: TimelineClip;
  sequenceId: string;
  requestId: string;
  model: ExtensionModel;
  direction: "start" | "end";
  addedSourceDurationMs: number;
  prompt: string;
}): ExtensionRequest {
  if (!input.sequenceId || !input.requestId) {
    throw new Error("Extension requires a saved sequence and request id.");
  }
  if (
    !input.model.id ||
    !input.model.provider ||
    !input.model.supportedTasks?.includes(EXTENSION_MODEL_TASK)
  ) {
    throw new Error("Choose a model with the extend_video task.");
  }
  if (
    (input.direction !== "start" && input.direction !== "end") ||
    !Number.isFinite(input.addedSourceDurationMs) ||
    input.addedSourceDurationMs <= 0 ||
    !input.prompt.trim()
  ) {
    throw new Error(
      "Choose start or end, a positive extension duration, and an instruction."
    );
  }
  if (
    input.model.durations?.length &&
    !input.model.durations.includes(input.addedSourceDurationMs / 1000)
  ) {
    throw new Error("Choose a supported extension duration.");
  }
  const planned = planGenerativeOperation({
    clip: input.clip,
    operation: "extend",
    direction: input.direction,
    durationMs: input.addedSourceDurationMs,
    prompt: input.prompt,
    provider: input.model.provider,
    model: input.model.id
  });
  if (!planned.ok) {
    throw new Error(planned.error);
  }
  const captured = captureExtensionSource(input.clip);
  if (!captured.ok) {
    throw new Error(captured.error);
  }
  return Object.freeze({
    action: "video_extend",
    requestId: input.requestId,
    sequenceId: input.sequenceId,
    source: captured.source,
    direction: input.direction,
    addedSourceDurationMs: input.addedSourceDurationMs,
    prompt: input.prompt.trim(),
    provider: input.model.provider,
    model: input.model.id
  });
}

export function extensionGenerateMediaData(
  request: ExtensionRequest
): Record<string, unknown> {
  const source = request.source;
  return {
    mode: request.action,
    provider: request.provider,
    model: request.model,
    prompt: request.prompt,
    extension_mode: request.direction,
    duration: request.addedSourceDurationMs / 1000,
    variations: 1,
    source_asset_id: source.sourceAssetId,
    source_context: {
      sequence_id: request.sequenceId,
      clip_id: source.clipId,
      source_asset_id: source.sourceAssetId,
      ...(source.sourceTakeId && { source_take_id: source.sourceTakeId }),
      source_start_ms: source.sourceStartMs,
      source_end_ms: source.sourceEndMs,
      timeline_start_ms: source.timelineStartMs,
      timeline_duration_ms: source.timelineDurationMs,
      speed_multiplier: source.rate
    }
  };
}

/** Keep the accepted media intact, even when it changed during generation. */
export function landExtensionCandidate(
  clip: TimelineClip,
  request: ExtensionRequest,
  result: { assetId: string; durationMs: number; createdAt: string }
): TimelineClip {
  if (clip.id !== request.source.clipId) {
    throw new Error("The extension belongs to a different clip.");
  }
  const requiredDuration =
    request.source.sourceEndMs -
    request.source.sourceStartMs +
    request.addedSourceDurationMs;
  if (
    !Number.isFinite(result.durationMs) ||
    result.durationMs < requiredDuration
  ) {
    throw new Error(
      "The extension result does not contain the source window plus the requested extension."
    );
  }
  const next = composeGenerativeTakePatch(clip, "extend", {
    ...result,
    jobId: request.requestId,
    provider: request.provider,
    model: request.model,
    prompt: request.prompt,
    paramOverridesSnapshot: { extension: request },
    activate: false
  });
  if (next === clip) {
    return clip;
  }
  return {
    ...next,
    versions: next.versions?.map((take) =>
      take.id === request.requestId
        ? { ...take, parentTakeId: request.source.sourceTakeId }
        : take
    )
  };
}

/** Apply only a take produced by this submission, using one timing choice. */
export function applyExtensionRequest(
  clips: readonly TimelineClip[],
  request: ExtensionRequest,
  timing: ExtensionTiming,
  lockedTrackIds?: ReadonlySet<string>
) {
  const take = clips
    .find((clip) => clip.id === request.source.clipId)
    ?.versions?.find((version) => version.id === request.requestId);
  if (
    !take ||
    JSON.stringify(take.paramOverridesSnapshot.extension) !==
      JSON.stringify(request)
  ) {
    return {
      ok: false as const,
      code: "invalid" as const,
      error: "Choose an extension take from this request."
    };
  }
  return applyExtensionToClips({
    clips,
    source: request.source,
    takeId: request.requestId,
    direction: request.direction,
    addedSourceDurationMs: request.addedSourceDurationMs,
    timing,
    lockedTrackIds
  });
}
