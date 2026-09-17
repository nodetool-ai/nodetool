import {
  RECORDED_VOICE_REPLACEMENT_OPERATION,
  type VoiceOperationModelSelection
} from "./recordedVoiceReplacement.js";

/** Provider-independent contract for lip-syncing accepted replacement speech. */

export const LIP_SYNC_CANDIDATE_OPERATION = "lip_sync" as const;
export const LIP_SYNC_CANDIDATE_MODEL_TASK = "lip_sync" as const;

export interface AcceptedReplacementAudioInput {
  readonly assetId?: string | null;
  readonly status?: "candidate" | "accepted" | null;
  readonly provenance?: {
    readonly requestId?: string | null;
    readonly operation?: string | null;
  } | null;
}

export interface AcceptedReplacementAudio {
  readonly assetId: string;
  readonly status: "accepted";
  readonly provenance: {
    readonly requestId: string;
    readonly operation: typeof RECORDED_VOICE_REPLACEMENT_OPERATION;
  };
}

export interface LipSyncCandidateRequest {
  readonly operation: typeof LIP_SYNC_CANDIDATE_OPERATION;
  readonly modelTask: typeof LIP_SYNC_CANDIDATE_MODEL_TASK;
  readonly requestId: string;
  readonly sequenceId: string;
  readonly clipId: string;
  readonly sourceVideoAssetId: string;
  readonly replacementAudio: AcceptedReplacementAudio;
  readonly provider: string;
  readonly model: string;
  readonly result: {
    readonly mediaType: "video";
    readonly disposition: "candidate";
  };
}

export interface LipSyncCandidateRequestInput {
  readonly requestId?: string | null;
  readonly sequenceId?: string | null;
  readonly clipId?: string | null;
  readonly sourceVideoAssetId?: string | null;
  readonly replacementAudio?: AcceptedReplacementAudioInput | null;
  readonly model: VoiceOperationModelSelection;
}

export type LipSyncCandidateRequestErrorCode =
  | "missing_identity"
  | "unsupported_model_task"
  | "missing_video_source"
  | "replacement_audio_not_accepted";

export interface LipSyncCandidateRequestError {
  readonly ok: false;
  readonly code: LipSyncCandidateRequestErrorCode;
  readonly error: string;
}

export interface LipSyncCandidateRequestSuccess {
  readonly ok: true;
  readonly request: LipSyncCandidateRequest;
}

export type LipSyncCandidateRequestResult =
  | LipSyncCandidateRequestError
  | LipSyncCandidateRequestSuccess;

export interface LipSyncCandidateProvenance {
  readonly requestId: string;
  readonly operation: typeof LIP_SYNC_CANDIDATE_OPERATION;
  readonly resultDisposition: "candidate";
  readonly request: LipSyncCandidateRequest;
}

const nonEmpty = (value: string | null | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const fail = (
  code: LipSyncCandidateRequestErrorCode,
  error: string
): LipSyncCandidateRequestError => ({ ok: false, code, error });

/** Validate and freeze lip-sync inputs before provider dispatch. */
export function createLipSyncCandidateRequest(
  input: LipSyncCandidateRequestInput
): LipSyncCandidateRequestResult {
  const requestId = nonEmpty(input.requestId);
  const sequenceId = nonEmpty(input.sequenceId);
  const clipId = nonEmpty(input.clipId);
  if (!requestId || !sequenceId || !clipId) {
    return fail(
      "missing_identity",
      "Lip-sync requires request, sequence, and clip ids."
    );
  }

  const provider = nonEmpty(input.model.provider);
  const model = nonEmpty(input.model.id);
  if (
    !provider ||
    !model ||
    !input.model.supportedTasks?.includes(LIP_SYNC_CANDIDATE_MODEL_TASK)
  ) {
    return fail(
      "unsupported_model_task",
      "Choose a model with the lip_sync task."
    );
  }

  const sourceVideoAssetId = nonEmpty(input.sourceVideoAssetId);
  if (!sourceVideoAssetId) {
    return fail(
      "missing_video_source",
      "Lip-sync requires the source video asset."
    );
  }

  const replacementAudioAssetId = nonEmpty(input.replacementAudio?.assetId);
  const replacementRequestId = nonEmpty(
    input.replacementAudio?.provenance?.requestId
  );
  const replacementOperation = nonEmpty(
    input.replacementAudio?.provenance?.operation
  );
  if (
    !replacementAudioAssetId ||
    input.replacementAudio?.status !== "accepted" ||
    !replacementRequestId ||
    replacementOperation !== RECORDED_VOICE_REPLACEMENT_OPERATION
  ) {
    return fail(
      "replacement_audio_not_accepted",
      "Lip-sync requires accepted audio from recorded_voice_replacement."
    );
  }

  const replacementAudio: AcceptedReplacementAudio = Object.freeze({
    assetId: replacementAudioAssetId,
    status: "accepted",
    provenance: Object.freeze({
      requestId: replacementRequestId,
      operation: RECORDED_VOICE_REPLACEMENT_OPERATION
    })
  });
  const result = Object.freeze({
    mediaType: "video" as const,
    disposition: "candidate" as const
  });
  const request: LipSyncCandidateRequest = Object.freeze({
    operation: LIP_SYNC_CANDIDATE_OPERATION,
    modelTask: LIP_SYNC_CANDIDATE_MODEL_TASK,
    requestId,
    sequenceId,
    clipId,
    sourceVideoAssetId,
    replacementAudio,
    provider,
    model,
    result
  });
  return Object.freeze({ ok: true, request });
}

/** Immutable video-candidate provenance with an explicit lip-sync identity. */
export function lipSyncCandidateProvenance(
  request: LipSyncCandidateRequest
): LipSyncCandidateProvenance {
  return Object.freeze({
    requestId: request.requestId,
    operation: LIP_SYNC_CANDIDATE_OPERATION,
    resultDisposition: "candidate",
    request
  });
}
