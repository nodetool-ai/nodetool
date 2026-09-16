/** Provider-independent contract for replacing speech in an existing recording. */

export const RECORDED_VOICE_REPLACEMENT_OPERATION =
  "recorded_voice_replacement" as const;
export const RECORDED_VOICE_REPLACEMENT_MODEL_TASK = "audio_to_audio" as const;

export interface VoiceOperationModelSelection {
  readonly id: string;
  readonly provider: string;
  readonly supportedTasks?: readonly string[];
  readonly supportedOperations?: readonly string[];
}

export type RecordedSpeechSource =
  | {
      readonly kind: "clean_speech";
      readonly assetId: string;
    }
  | {
      readonly kind: "isolated_speech";
      readonly assetId: string;
      readonly isolationRequestId?: string;
    };

export interface VoiceReplacementTarget {
  readonly kind: "voice";
  readonly voiceId: string;
}

export type VoiceReplacementTargetInput =
  | VoiceReplacementTarget
  | {
      readonly kind: "reference_audio";
      readonly assetId: string;
    };

export interface RecordedVoiceReplacementRequest {
  readonly operation: typeof RECORDED_VOICE_REPLACEMENT_OPERATION;
  readonly modelTask: typeof RECORDED_VOICE_REPLACEMENT_MODEL_TASK;
  readonly requestId: string;
  readonly sequenceId: string;
  readonly clipId: string;
  readonly source: RecordedSpeechSource;
  readonly target: VoiceReplacementTarget;
  readonly provider: string;
  readonly model: string;
  readonly result: {
    readonly mediaType: "audio";
    readonly disposition: "candidate";
  };
}

export interface RecordedVoiceReplacementRequestInput {
  readonly requestId?: string | null;
  readonly sequenceId?: string | null;
  readonly clipId?: string | null;
  readonly source?: RecordedSpeechSource | null;
  readonly target?: VoiceReplacementTargetInput | null;
  readonly model: VoiceOperationModelSelection;
}

export type RecordedVoiceReplacementRequestErrorCode =
  | "missing_identity"
  | "unsupported_model_task"
  | "unsupported_model_operation"
  | "missing_speech_source"
  | "missing_target"
  | "unsupported_target";

export interface RecordedVoiceReplacementRequestError {
  readonly ok: false;
  readonly code: RecordedVoiceReplacementRequestErrorCode;
  readonly error: string;
}

export interface RecordedVoiceReplacementRequestSuccess {
  readonly ok: true;
  readonly request: RecordedVoiceReplacementRequest;
}

export type RecordedVoiceReplacementRequestResult =
  | RecordedVoiceReplacementRequestError
  | RecordedVoiceReplacementRequestSuccess;

export interface RecordedVoiceReplacementProvenance {
  readonly requestId: string;
  readonly operation: typeof RECORDED_VOICE_REPLACEMENT_OPERATION;
  readonly resultDisposition: "candidate";
  readonly request: RecordedVoiceReplacementRequest;
}

const nonEmpty = (value: string | null | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const fail = (
  code: RecordedVoiceReplacementRequestErrorCode,
  error: string
): RecordedVoiceReplacementRequestError => ({ ok: false, code, error });

/** Validate and freeze a recorded-speech replacement before provider dispatch. */
export function createRecordedVoiceReplacementRequest(
  input: RecordedVoiceReplacementRequestInput
): RecordedVoiceReplacementRequestResult {
  const requestId = nonEmpty(input.requestId);
  const sequenceId = nonEmpty(input.sequenceId);
  const clipId = nonEmpty(input.clipId);
  if (!requestId || !sequenceId || !clipId) {
    return fail(
      "missing_identity",
      "Recorded voice replacement requires request, sequence, and clip ids."
    );
  }

  const provider = nonEmpty(input.model.provider);
  const model = nonEmpty(input.model.id);
  if (
    !provider ||
    !model ||
    !input.model.supportedTasks?.includes(
      RECORDED_VOICE_REPLACEMENT_MODEL_TASK
    )
  ) {
    return fail(
      "unsupported_model_task",
      "Choose a model with the audio_to_audio task for recorded voice replacement."
    );
  }
  if (
    !input.model.supportedOperations?.includes(
      RECORDED_VOICE_REPLACEMENT_OPERATION
    )
  ) {
    return fail(
      "unsupported_model_operation",
      "Choose a model adapter that supports recorded voice replacement."
    );
  }

  const sourceAssetId = nonEmpty(input.source?.assetId);
  if (!input.source || !sourceAssetId) {
    return fail(
      "missing_speech_source",
      "Recorded voice replacement requires an explicit clean or isolated speech source."
    );
  }
  const isolationRequestId =
    input.source.kind === "isolated_speech"
      ? nonEmpty(input.source.isolationRequestId)
      : undefined;
  const source: RecordedSpeechSource =
    input.source.kind === "clean_speech"
      ? Object.freeze({ kind: "clean_speech", assetId: sourceAssetId })
      : Object.freeze({
          kind: "isolated_speech",
          assetId: sourceAssetId,
          ...(isolationRequestId !== undefined && { isolationRequestId })
        });

  if (!input.target) {
    return fail(
      "missing_target",
      "Recorded voice replacement requires a target voice."
    );
  }
  if (input.target.kind === "reference_audio") {
    return fail(
      "unsupported_target",
      "Recorded voice replacement does not support reference-audio targets."
    );
  }
  const targetValue = nonEmpty(input.target.voiceId);
  if (!targetValue) {
    return fail(
      "missing_target",
      "Recorded voice replacement requires a target voice."
    );
  }
  const target: VoiceReplacementTarget = Object.freeze({
    kind: "voice",
    voiceId: targetValue
  });

  const result = Object.freeze({
    mediaType: "audio" as const,
    disposition: "candidate" as const
  });
  const request: RecordedVoiceReplacementRequest = Object.freeze({
    operation: RECORDED_VOICE_REPLACEMENT_OPERATION,
    modelTask: RECORDED_VOICE_REPLACEMENT_MODEL_TASK,
    requestId,
    sequenceId,
    clipId,
    source,
    target,
    provider,
    model,
    result
  });
  return Object.freeze({ ok: true, request });
}

/** Immutable candidate provenance with the operation identity at the top level. */
export function recordedVoiceReplacementProvenance(
  request: RecordedVoiceReplacementRequest
): RecordedVoiceReplacementProvenance {
  return Object.freeze({
    requestId: request.requestId,
    operation: RECORDED_VOICE_REPLACEMENT_OPERATION,
    resultDisposition: "candidate",
    request
  });
}
