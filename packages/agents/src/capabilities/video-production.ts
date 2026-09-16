/** Shared headless contract for reviewed AI-video production. */

import { randomUUID } from "node:crypto";
import {
  PRODUCTION_SNAPSHOT_SCHEMA_VERSION,
  productionCandidate,
  productionGenerationSnapshot,
  productionVariationIdentity,
  validateProductionAcceptance,
  type AssetRef,
  type ProductionCandidate,
  type ProductionDestinationKind,
  type ProductionOperation,
  type ProductionSpeechMode,
  type ProductionVisualTreatment
} from "@nodetool-ai/protocol";
import {
  GenerationAlreadyAcceptedError,
  type GenerationRequest
} from "@nodetool-ai/runtime";
import {
  Asset,
  Prediction,
  Script,
  Storyboard,
  TimelineSequence,
  type ScriptCaptionWord
} from "@nodetool-ai/models";
import { activeTakeIdOf } from "@nodetool-ai/timeline";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  acceptVideoProductionCandidatesSpec,
  inspectVideoProductionCandidatesSpec,
  prepareVideoProductionSpec,
  submitVideoProductionSpec
} from "./video-production.specs.js";
import {
  VIDEO_PRODUCTION_ACCEPTANCE_ADAPTER,
  type VideoProductionAcceptanceAction,
  type VideoProductionAcceptanceManifest
} from "./video-production-acceptance.js";
import { publicGenerationStatus } from "./generations.js";
import {
  isNonBlankString,
  isNumber,
  isRecord,
  isString
} from "../utils/type-guards.js";

export const VIDEO_PRODUCTION_SCHEMA_VERSION = "ai-video-production.v1" as const;

export type VideoProductionRoute =
  | "reference_to_video"
  | "text_to_video"
  | "audio_driven_performance";

export type VideoProductionCandidateStatus = ProductionCandidate["status"];

export interface VideoProductionAuthorization {
  readonly owner_id: string;
  readonly project_id: string;
}

export interface VideoProductionDestination {
  readonly document_id: string;
  readonly target_type: ProductionDestinationKind;
  readonly target_id: string;
  readonly target_revision: string;
}

export interface VideoProductionReview {
  readonly status: "reviewed";
  readonly plan_fingerprint: string;
}

export interface VideoProductionWordTiming {
  readonly word: string;
  readonly start_ms: number;
  readonly end_ms: number;
}

export interface VideoProductionSpeechSnapshot {
  readonly text?: string;
  readonly direction?: string;
  readonly script_id?: string;
  readonly script_line_id?: string;
  readonly speaker_id?: string;
  readonly entity_id?: string;
  readonly voice?: Readonly<Record<string, unknown>>;
  readonly audio_asset_id?: string;
  readonly audio_take_id?: string;
  readonly measured_duration_ms?: number;
  readonly word_timings: readonly VideoProductionWordTiming[];
}

export interface VideoProductionTiming {
  readonly requested_duration_ms: number;
  readonly playable_start_ms: number;
  readonly playable_duration_ms: number;
  readonly measured_source_duration_ms?: number;
}

export interface VideoProductionRequest {
  readonly authorization: VideoProductionAuthorization;
  readonly destination: VideoProductionDestination;
  readonly review: VideoProductionReview;
  readonly operation: ProductionOperation;
  readonly visual_treatment: ProductionVisualTreatment;
  readonly speech_mode: ProductionSpeechMode;
  readonly speech?: VideoProductionSpeechSnapshot;
  readonly route: VideoProductionRoute;
  readonly provider: string;
  readonly model: string;
  readonly prompt: string;
  readonly required_reference_asset_ids: readonly string[];
  readonly reference_asset_ids: readonly string[];
  readonly character_reference_asset_id?: string;
  readonly performance_source_asset_id?: string;
  readonly candidate_count: number;
  readonly timing: VideoProductionTiming;
  readonly output_format: string;
  readonly generation_params: Readonly<Record<string, unknown>>;
}

export interface VideoProductionPreconditions {
  readonly target_revision: string;
  readonly plan_fingerprint: string;
  readonly requested_duration_ms: number;
  readonly playable_start_ms: number;
  readonly playable_duration_ms: number;
}

export interface VideoProductionSnapshot {
  readonly schemaVersion: typeof PRODUCTION_SNAPSHOT_SCHEMA_VERSION;
  readonly batchId: string;
  readonly requestId: string;
  readonly candidateId: string;
  readonly variationId: string;
  readonly variationIndex: number;
  readonly destinationKind: ProductionDestinationKind;
  readonly destinationId: string;
  readonly operation: ProductionOperation;
  readonly authoringFingerprint?: string;
  readonly entityIds?: readonly string[];
  readonly referenceAssetIds?: readonly string[];
  readonly prompt?: string;
  readonly speech?: Readonly<Record<string, unknown>>;
  readonly provider?: string;
  readonly model?: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly outputFormat?: string;
  readonly requestedDurationMs?: number;
  readonly documentId: string;
  readonly authorization: VideoProductionAuthorization;
  readonly preconditions: VideoProductionPreconditions;
  readonly route: VideoProductionRoute;
  readonly visualTreatment: ProductionVisualTreatment;
  readonly speechMode: ProductionSpeechMode;
  readonly suppressEmbeddedAudio: boolean;
}

export interface VideoProductionCandidateRequest {
  readonly candidateId: string;
  readonly requestId: string;
  readonly variationId: string;
  readonly variationIndex: number;
  readonly destinationKind: ProductionDestinationKind;
  readonly destinationId: string;
  readonly snapshot: VideoProductionSnapshot;
}

export interface PreparedVideoProduction {
  readonly schema_version: typeof VIDEO_PRODUCTION_SCHEMA_VERSION;
  readonly batch_id: string;
  readonly request: VideoProductionRequest;
  readonly candidate_requests: readonly VideoProductionCandidateRequest[];
}

export interface VideoProductionCandidateTiming {
  readonly requested_duration_ms: number;
  readonly playable_duration_ms: number;
  readonly output_duration_ms?: number;
  readonly status: "unverified" | "valid" | "too_short";
}

export interface VideoProductionCandidate {
  readonly candidateId: string;
  readonly batchId: string;
  readonly requestId: string;
  readonly variationId: string;
  readonly variationIndex: number;
  readonly destinationKind: ProductionDestinationKind;
  readonly destinationId: string;
  readonly status: VideoProductionCandidateStatus;
  readonly assetId?: string;
  readonly takeId?: string;
  readonly error?: string;
  readonly snapshot: VideoProductionSnapshot;
  readonly documentId: string;
  readonly document_id: string;
  readonly authorization: VideoProductionAuthorization;
  readonly preconditions: VideoProductionPreconditions;
  readonly generation_id?: string;
  readonly asset_ids: readonly string[];
  readonly active: false;
  readonly accepted: false;
  readonly timing: VideoProductionCandidateTiming;
}

export interface VideoProductionValidationError {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
}

export type VideoProductionPreflight =
  | { readonly ok: true; readonly request: VideoProductionRequest }
  | { readonly ok: false; readonly error: VideoProductionValidationError };

export type VideoProductionAcceptance =
  | {
      readonly ok: true;
      readonly candidates: readonly VideoProductionCandidate[];
    }
  | { readonly ok: false; readonly error: VideoProductionValidationError };

interface ParseFailure {
  readonly ok: false;
  readonly error: VideoProductionValidationError;
}

interface TargetState {
  readonly authorization: VideoProductionAuthorization;
  readonly revision: string;
  readonly accepted_candidate_id?: string;
}

function failure(
  code: string,
  message: string,
  field?: string
): ParseFailure {
  const validationError: {
    code: string;
    message: string;
    field?: string;
  } = { code, message };
  if (field) validationError.field = field;
  return { ok: false, error: validationError };
}

function freezeDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const child of value) {
      freezeDeep(child);
    }
    Object.freeze(value);
    return value;
  }
  if (isRecord(value)) {
    for (const child of Object.values(value)) {
      freezeDeep(child);
    }
    Object.freeze(value);
    return value;
  }
  return value;
}

function nonBlankField(
  params: Record<string, unknown>,
  key: string
): string | undefined {
  const value = params[key];
  return isNonBlankString(value) ? value.trim() : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return isNumber(value) && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return isNumber(value) && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function stringList(
  params: Record<string, unknown>,
  key: string
): { readonly ok: true; readonly value: string[] } | ParseFailure {
  const raw = params[key];
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return failure(`${key}_must_be_array`, `${key} must be an array.`, key);
  }
  const value: string[] = [];
  for (const item of raw) {
    if (!isNonBlankString(item)) {
      return failure(
        `${key}_must_contain_strings`,
        `${key} must contain only non-empty asset ids.`,
        key
      );
    }
    value.push(item.trim());
  }
  if (new Set(value).size !== value.length) {
    return failure(`${key}_must_be_unique`, `${key} must not contain duplicates.`, key);
  }
  return { ok: true, value };
}

function destinationKindOf(value: unknown): ProductionDestinationKind | undefined {
  switch (value) {
    case "timeline_clip":
    case "storyboard_shot":
    case "script_line":
      return value;
    default:
      return undefined;
  }
}

function destinationOf(
  value: unknown
): { readonly ok: true; readonly value: VideoProductionDestination } | ParseFailure {
  if (!isRecord(value)) {
    return failure(
      "destination_required",
      "destination must include document_id, target_type, target_id, and target_revision.",
      "destination"
    );
  }
  const documentId = nonBlankField(value, "document_id");
  const targetType = destinationKindOf(value["target_type"]);
  const targetId = nonBlankField(value, "target_id");
  const targetRevision = nonBlankField(value, "target_revision");
  if (!documentId || !targetType || !targetId || !targetRevision) {
    return failure(
      "destination_incomplete",
      "destination needs non-empty document_id, target_type, target_id, and target_revision.",
      "destination"
    );
  }
  return {
    ok: true,
    value: {
      document_id: documentId,
      target_type: targetType,
      target_id: targetId,
      target_revision: targetRevision
    }
  };
}

function authorizationOf(
  value: unknown
): { readonly ok: true; readonly value: VideoProductionAuthorization } | ParseFailure {
  if (!isRecord(value)) {
    return failure("authorization_required", "authorization is required.", "authorization");
  }
  const ownerId = nonBlankField(value, "owner_id");
  const projectId = nonBlankField(value, "project_id");
  if (!ownerId || !projectId) {
    return failure(
      "authorization_incomplete",
      "authorization needs owner_id and project_id.",
      "authorization"
    );
  }
  return { ok: true, value: { owner_id: ownerId, project_id: projectId } };
}

function reviewOf(
  value: unknown
): { readonly ok: true; readonly value: VideoProductionReview } | ParseFailure {
  if (!isRecord(value) || value["status"] !== "reviewed") {
    return failure(
      "review_required",
      "The production plan must be explicitly reviewed before preparation.",
      "review"
    );
  }
  const fingerprint = nonBlankField(value, "plan_fingerprint");
  if (!fingerprint) {
    return failure(
      "plan_fingerprint_required",
      "review.plan_fingerprint is required.",
      "review.plan_fingerprint"
    );
  }
  return { ok: true, value: { status: "reviewed", plan_fingerprint: fingerprint } };
}

function routeOf(value: unknown): VideoProductionRoute | undefined {
  switch (value) {
    case "reference_to_video":
    case "text_to_video":
    case "audio_driven_performance":
      return value;
    default:
      return undefined;
  }
}

function operationOf(value: unknown): ProductionOperation | undefined {
  switch (value) {
    case "initial_generation":
    case "new_take":
    case "change_line_delivery":
    case "edit_video":
      return value;
    default:
      return undefined;
  }
}

function visualTreatmentOf(value: unknown): ProductionVisualTreatment | undefined {
  switch (value) {
    case "actor_to_camera":
    case "product_close_up":
    case "lifestyle_b_roll":
    case "generated_scene":
      return value;
    default:
      return undefined;
  }
}

function speechModeOf(value: unknown): ProductionSpeechMode | undefined {
  switch (value) {
    case "none":
    case "off_camera":
    case "on_camera":
      return value;
    default:
      return undefined;
  }
}

function timingOf(
  value: unknown
): { readonly ok: true; readonly value: VideoProductionTiming } | ParseFailure {
  if (!isRecord(value)) {
    return failure("timing_required", "timing is required.", "timing");
  }
  const requested = positiveInteger(value["requested_duration_ms"]);
  const playableStart = nonNegativeInteger(value["playable_start_ms"]) ?? 0;
  const playable =
    positiveInteger(value["playable_duration_ms"]) ?? requested;
  const measured = positiveInteger(value["measured_source_duration_ms"]);
  if (!requested || !playable) {
    return failure(
      "timing_invalid",
      "timing durations must be positive integer milliseconds.",
      "timing"
    );
  }
  const timing: {
    requested_duration_ms: number;
    playable_start_ms: number;
    playable_duration_ms: number;
    measured_source_duration_ms?: number;
  } = {
    requested_duration_ms: requested,
    playable_start_ms: playableStart,
    playable_duration_ms: playable
  };
  if (measured) timing.measured_source_duration_ms = measured;
  return { ok: true, value: timing };
}

function wordTimingsOf(
  value: unknown
): { readonly ok: true; readonly value: VideoProductionWordTiming[] } | ParseFailure {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return failure("word_timings_invalid", "word_timings must be an array.", "speech");
  }
  const timings: VideoProductionWordTiming[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return failure("word_timing_invalid", "Each word timing must be an object.", "speech");
    }
    const word = nonBlankField(item, "word");
    const start = nonNegativeInteger(item["start_ms"]);
    const end = positiveInteger(item["end_ms"]);
    if (!word || start === undefined || end === undefined || end < start) {
      return failure(
        "word_timing_invalid",
        "Word timings need word, start_ms, and end_ms in ascending milliseconds.",
        "speech"
      );
    }
    timings.push({ word, start_ms: start, end_ms: end });
  }
  return { ok: true, value: timings };
}

function speechSnapshotOf(
  value: unknown
): { readonly ok: true; readonly value?: VideoProductionSpeechSnapshot } | ParseFailure {
  if (value === undefined || value === null) return { ok: true };
  if (!isRecord(value)) {
    return failure("speech_invalid", "speech_snapshot must be an object.", "speech");
  }
  const wordTimings = wordTimingsOf(value["word_timings"]);
  if (!wordTimings.ok) return wordTimings;
  const snapshot: {
    text?: string;
    direction?: string;
    script_id?: string;
    script_line_id?: string;
    speaker_id?: string;
    entity_id?: string;
    voice?: Readonly<Record<string, unknown>>;
    audio_asset_id?: string;
    audio_take_id?: string;
    measured_duration_ms?: number;
    word_timings: VideoProductionWordTiming[];
  } = { word_timings: wordTimings.value };
  const text = nonBlankField(value, "text");
  const direction = nonBlankField(value, "direction");
  const scriptId = nonBlankField(value, "script_id");
  const scriptLineId = nonBlankField(value, "script_line_id");
  const speakerId = nonBlankField(value, "speaker_id");
  const entityId = nonBlankField(value, "entity_id");
  const audioAssetId = nonBlankField(value, "audio_asset_id");
  const audioTakeId = nonBlankField(value, "audio_take_id");
  if (text) snapshot.text = text;
  if (direction) snapshot.direction = direction;
  if (scriptId) snapshot.script_id = scriptId;
  if (scriptLineId) snapshot.script_line_id = scriptLineId;
  if (speakerId) snapshot.speaker_id = speakerId;
  if (entityId) snapshot.entity_id = entityId;
  if (audioAssetId) snapshot.audio_asset_id = audioAssetId;
  if (audioTakeId) snapshot.audio_take_id = audioTakeId;
  if (isRecord(value["voice"])) snapshot.voice = structuredClone(value["voice"]);
  const measured = positiveInteger(value["measured_duration_ms"]);
  if (measured) snapshot.measured_duration_ms = measured;
  return { ok: true, value: snapshot };
}

function candidateCountOf(value: unknown): number {
  if (value === undefined || value === null) return 1;
  return isNumber(value) && Number.isInteger(value) ? value : 0;
}

/** Validate one fully resolved reviewed request before any provider call. */
export function preflightVideoProduction(
  params: Record<string, unknown>
): VideoProductionPreflight {
  const authorization = authorizationOf(params["authorization"]);
  if (!authorization.ok) return authorization;
  const destination = destinationOf(params["destination"]);
  if (!destination.ok) return destination;
  const review = reviewOf(params["review"]);
  if (!review.ok) return review;
  const operation = operationOf(params["operation"]);
  const visualTreatment = visualTreatmentOf(params["visual_treatment"]);
  const speechMode = speechModeOf(params["speech_mode"]);
  const route = routeOf(params["route"]);
  if (!operation || !visualTreatment || !speechMode || !route) {
    return failure(
      "production_contract_invalid",
      "operation, visual_treatment, speech_mode, and route must use supported values."
    );
  }
  const provider = nonBlankField(params, "provider");
  const model = nonBlankField(params, "model");
  const prompt = nonBlankField(params, "prompt");
  if (!provider || !model || !prompt) {
    return failure(
      "request_incomplete",
      "provider, model, and prompt must be non-empty.",
      !provider ? "provider" : !model ? "model" : "prompt"
    );
  }
  const timing = timingOf(params["timing"]);
  if (!timing.ok) return timing;
  const required = stringList(params, "required_reference_asset_ids");
  if (!required.ok) return required;
  const references = stringList(params, "reference_asset_ids");
  if (!references.ok) return references;
  const missing = required.value.filter((id) => !references.value.includes(id));
  if (missing.length > 0) {
    return failure(
      "required_reference_assets_missing",
      `Required references are missing: ${missing.join(", ")}.`,
      "reference_asset_ids"
    );
  }
  const speech = speechSnapshotOf(params["speech_snapshot"]);
  if (!speech.ok) return speech;
  if (speechMode === "none" && speech.value !== undefined) {
    return failure("unexpected_speech", "speech_mode none cannot carry speech.", "speech");
  }
  if (speechMode !== "none" && speech.value === undefined) {
    return failure("speech_required", `${speechMode} requires a resolved speech snapshot.`, "speech");
  }
  if (speechMode === "on_camera" && route !== "audio_driven_performance") {
    return failure(
      "on_camera_route_required",
      "On-camera speech requires audio_driven_performance. Narration is not a fallback.",
      "route"
    );
  }
  if (route === "audio_driven_performance" && speechMode !== "on_camera") {
    return failure(
      "performance_route_requires_on_camera_speech",
      "audio_driven_performance is only valid for on-camera speech.",
      "route"
    );
  }
  if (route === "reference_to_video" && references.value.length === 0) {
    return failure(
      "reference_assets_required",
      "reference_to_video requires at least one approved reference asset.",
      "reference_asset_ids"
    );
  }
  if (route === "text_to_video" && references.value.length > 0) {
    return failure(
      required.value.length > 0
        ? "text_only_route_rejected"
        : "text_only_route_would_drop_references",
      "text_to_video cannot consume approved references. Choose a reviewed reference route.",
      "route"
    );
  }
  const characterReference = nonBlankField(params, "character_reference_asset_id");
  const performanceSource = nonBlankField(params, "performance_source_asset_id");
  if (route === "audio_driven_performance") {
    if (!speech.value?.audio_asset_id) {
      return failure(
        "performance_audio_required",
        "audio_driven_performance requires the exact recorded audio asset.",
        "speech"
      );
    }
    if (!speech.value.entity_id || !characterReference || !performanceSource) {
      return failure(
        "performance_character_required",
        "audio_driven_performance requires an entity, character reference, and source face video.",
        "speech"
      );
    }
    if (
      !references.value.includes(characterReference) ||
      !references.value.includes(performanceSource)
    ) {
      return failure(
        "performance_references_missing",
        "Character and performance source assets must be approved references.",
        "reference_asset_ids"
      );
    }
    const unsupportedRequired = required.value.filter((id) => id !== performanceSource);
    if (unsupportedRequired.length > 0) {
      return failure(
        "performance_route_cannot_consume_required_references",
        `The current audio-driven adapter cannot consume required references: ${unsupportedRequired.join(", ")}. Choose another reviewed route.`,
        "route"
      );
    }
    if (!speech.value.measured_duration_ms) {
      return failure(
        "speech_duration_required",
        "Measure the selected speech audio before performance generation.",
        "speech"
      );
    }
    if (speech.value.measured_duration_ms > timing.value.playable_duration_ms) {
      return failure(
        "speech_exceeds_slot",
        `Speech is ${speech.value.measured_duration_ms}ms but the playable slot is ${timing.value.playable_duration_ms}ms. Choose an explicit copy, voice, or timing change.`,
        "timing"
      );
    }
  }
  const candidateCount = candidateCountOf(params["candidate_count"]);
  if (candidateCount < 1 || candidateCount > 3) {
    return failure(
      "candidate_count_out_of_range",
      "candidate_count must be an integer from one through three.",
      "candidate_count"
    );
  }
  const generationParams = params["generation_params"];
  if (generationParams !== undefined && !isRecord(generationParams)) {
    return failure(
      "generation_params_must_be_object",
      "generation_params must be an object.",
      "generation_params"
    );
  }
  const outputFormat = nonBlankField(params, "output_format") ?? "video/mp4";
  const request: VideoProductionRequest = {
    authorization: authorization.value,
    destination: destination.value,
    review: review.value,
    operation,
    visual_treatment: visualTreatment,
    speech_mode: speechMode,
    route,
    provider,
    model,
    prompt,
    required_reference_asset_ids: required.value,
    reference_asset_ids: references.value,
    candidate_count: candidateCount,
    timing: timing.value,
    output_format: outputFormat,
    generation_params: generationParams ? structuredClone(generationParams) : {}
  };
  const optional: {
    speech?: VideoProductionSpeechSnapshot;
    character_reference_asset_id?: string;
    performance_source_asset_id?: string;
  } = {};
  if (speech.value) optional.speech = structuredClone(speech.value);
  if (characterReference) optional.character_reference_asset_id = characterReference;
  if (performanceSource) optional.performance_source_asset_id = performanceSource;
  return { ok: true, request: { ...request, ...optional } };
}

function snapshotFor(
  request: VideoProductionRequest,
  batchId: string,
  identity: ReturnType<typeof productionVariationIdentity>
): VideoProductionSnapshot {
  const speech = request.speech
    ? {
        text: request.speech.text,
        direction: request.speech.direction,
        voice: request.speech.voice,
        audioAssetId: request.speech.audio_asset_id,
        audioTakeId: request.speech.audio_take_id,
        scriptId: request.speech.script_id,
        scriptLineId: request.speech.script_line_id,
        speakerId: request.speech.speaker_id,
        entityId: request.speech.entity_id,
        measuredDurationMs: request.speech.measured_duration_ms,
        wordTimings: request.speech.word_timings.map((word) => ({
          word: word.word,
          startMs: word.start_ms,
          endMs: word.end_ms
        }))
      }
    : undefined;
  const parsed = productionGenerationSnapshot.parse({
    schemaVersion: PRODUCTION_SNAPSHOT_SCHEMA_VERSION,
    batchId,
    requestId: identity.requestId,
    candidateId: identity.candidateId,
    variationId: identity.variationId,
    variationIndex: identity.variationIndex,
    destinationKind: identity.destinationKind,
    destinationId: identity.destinationId,
    operation: request.operation,
    authoringFingerprint: request.review.plan_fingerprint,
    entityIds: request.speech?.entity_id ? [request.speech.entity_id] : [],
    referenceAssetIds: [...request.reference_asset_ids],
    prompt: request.prompt,
    speech,
    provider: request.provider,
    model: request.model,
    parameters: structuredClone(request.generation_params),
    outputFormat: request.output_format,
    requestedDurationMs: request.timing.requested_duration_ms
  });
  const snapshot: VideoProductionSnapshot = {
    ...parsed,
    documentId: request.destination.document_id,
    authorization: structuredClone(request.authorization),
    preconditions: {
      target_revision: request.destination.target_revision,
      plan_fingerprint: request.review.plan_fingerprint,
      requested_duration_ms: request.timing.requested_duration_ms,
      playable_start_ms: request.timing.playable_start_ms,
      playable_duration_ms: request.timing.playable_duration_ms
    },
    route: request.route,
    visualTreatment: request.visual_treatment,
    speechMode: request.speech_mode,
    suppressEmbeddedAudio: request.route === "audio_driven_performance"
  };
  return freezeDeep(snapshot);
}

/** Build stable shared identities and immutable candidate snapshots. */
export function prepareVideoProduction(
  params: Record<string, unknown>
): PreparedVideoProduction | VideoProductionValidationError {
  const preflight = preflightVideoProduction(params);
  if (!preflight.ok) return preflight.error;
  const batchId = nonBlankField(params, "batch_id") ?? randomUUID();
  const candidateRequests = Array.from(
    { length: preflight.request.candidate_count },
    (_, index): VideoProductionCandidateRequest => {
      const identity = productionVariationIdentity({
        batchId,
        destinationKind: preflight.request.destination.target_type,
        destinationId: preflight.request.destination.target_id,
        variationIndex: index + 1
      });
      return {
        ...identity,
        snapshot: snapshotFor(preflight.request, batchId, identity)
      };
    }
  );
  return {
    schema_version: VIDEO_PRODUCTION_SCHEMA_VERSION,
    batch_id: batchId,
    request: structuredClone(preflight.request),
    candidate_requests: candidateRequests
  };
}

async function targetState(
  run: CapabilityRun,
  destination: {
    readonly document_id: string;
    readonly target_type: ProductionDestinationKind;
    readonly target_id: string;
  },
  projectId: string
): Promise<{ readonly ok: true; readonly value: TargetState } | ParseFailure> {
  const userId = run.context.userId;
  if (!isNonBlankString(userId)) {
    return failure("owner_required", "No authenticated owner is bound to this run.");
  }
  if (isNonBlankString(run.projectId) && run.projectId !== projectId) {
    return failure(
      "project_scope_mismatch",
      `The run is bound to project ${run.projectId}, not ${projectId}.`,
      "project_id"
    );
  }
  if (destination.target_type === "timeline_clip") {
    const row = await TimelineSequence.findById(destination.document_id);
    if (!row || row.user_id !== userId || row.project_id !== projectId) {
      return failure("destination_not_found", "The timeline destination was not found in this project.");
    }
    const clip = row.toDocument().clips.find((item) => item.id === destination.target_id);
    if (!clip) return failure("target_not_found", "The timeline clip no longer exists.");
    const accepted = activeTakeIdOf(clip) ?? clip.currentAssetId;
    const value: {
      authorization: VideoProductionAuthorization;
      revision: string;
      accepted_candidate_id?: string;
    } = {
      authorization: { owner_id: userId, project_id: projectId },
      revision: String(row.revision)
    };
    if (accepted) value.accepted_candidate_id = accepted;
    return { ok: true, value };
  }
  if (destination.target_type === "storyboard_shot") {
    const row = await Storyboard.findById(destination.document_id);
    if (!row || row.user_id !== userId || row.project_id !== projectId) {
      return failure("destination_not_found", "The storyboard destination was not found in this project.");
    }
    const shot = row.toDocument().shots.find((item) => item.id === destination.target_id);
    if (!shot) return failure("target_not_found", "The storyboard shot no longer exists.");
    const value: {
      authorization: VideoProductionAuthorization;
      revision: string;
      accepted_candidate_id?: string;
    } = {
      authorization: { owner_id: userId, project_id: projectId },
      revision: String(row.revision)
    };
    if (shot.clip?.asset_id) value.accepted_candidate_id = shot.clip.asset_id;
    return { ok: true, value };
  }
  const row = await Script.findById(destination.document_id);
  if (!row || row.user_id !== userId || row.project_id !== projectId) {
    return failure("destination_not_found", "The script destination was not found in this project.");
  }
  const line = row
    .toDocument()
    .sections.flatMap((section) => section.lines)
    .find((item) => item.id === destination.target_id);
  if (!line) return failure("target_not_found", "The script line no longer exists.");
  const value: {
    authorization: VideoProductionAuthorization;
    revision: string;
    accepted_candidate_id?: string;
  } = {
    authorization: { owner_id: userId, project_id: projectId },
    revision: row.updated_at
  };
  if (line.currentTakeId) value.accepted_candidate_id = line.currentTakeId;
  return { ok: true, value };
}

interface ResolvedVoiceBinding {
  readonly provider: string;
  readonly model: string;
  readonly voice: string;
  readonly settings?: Record<string, unknown>;
}

function voiceRecord(
  voice: ResolvedVoiceBinding | null | undefined
): Readonly<Record<string, unknown>> | undefined {
  if (!voice) return undefined;
  const record: Record<string, unknown> = {
    provider: voice.provider,
    model: voice.model,
    voice: voice.voice
  };
  if (voice.settings) record["settings"] = structuredClone(voice.settings);
  return record;
}

function wordsFromScript(words: readonly ScriptCaptionWord[]): VideoProductionWordTiming[] {
  return words.map((word) => ({
    word: word.word,
    start_ms: word.startMs,
    end_ms: word.endMs
  }));
}

async function resolveSpeechForRun(
  run: CapabilityRun,
  value: unknown,
  speechMode: ProductionSpeechMode,
  projectId: string
): Promise<{ readonly ok: true; readonly value?: VideoProductionSpeechSnapshot } | ParseFailure> {
  if (speechMode === "none") {
    return value === undefined || value === null
      ? { ok: true }
      : failure("unexpected_speech", "speech_mode none cannot carry speech.", "speech");
  }
  if (!isRecord(value)) {
    return failure("speech_required", `${speechMode} requires speech.`, "speech");
  }
  const scriptId = nonBlankField(value, "script_id");
  const scriptLineId = nonBlankField(value, "script_line_id");
  if (scriptId || scriptLineId) {
    if (!scriptId || !scriptLineId || !isNonBlankString(run.context.userId)) {
      return failure(
        "linked_speech_incomplete",
        "Linked speech requires script_id and script_line_id.",
        "speech"
      );
    }
    const script = await Script.findById(scriptId);
    if (
      !script ||
      script.user_id !== run.context.userId ||
      script.project_id !== projectId
    ) {
      return failure("linked_script_not_found", "The linked script was not found in this project.");
    }
    const document = script.toDocument();
    const line = document.sections
      .flatMap((section) => section.lines)
      .find((item) => item.id === scriptLineId);
    if (!line) return failure("linked_line_not_found", "The linked script line no longer exists.");
    const speaker = line.speakerId
      ? document.cast.find((item) => item.id === line.speakerId)
      : undefined;
    const takeId = nonBlankField(value, "take_id") ?? line.currentTakeId ?? undefined;
    const take = takeId ? line.takes.find((item) => item.id === takeId) : undefined;
    const snapshot: {
      text: string;
      direction?: string;
      script_id: string;
      script_line_id: string;
      speaker_id?: string;
      entity_id?: string;
      voice?: Readonly<Record<string, unknown>>;
      audio_asset_id?: string;
      audio_take_id?: string;
      measured_duration_ms?: number;
      word_timings: VideoProductionWordTiming[];
    } = {
      text: line.text,
      script_id: scriptId,
      script_line_id: scriptLineId,
      word_timings: take ? wordsFromScript(take.words) : []
    };
    const direction = nonBlankField(value, "direction") ?? line.direction;
    if (direction) snapshot.direction = direction;
    if (line.speakerId) snapshot.speaker_id = line.speakerId;
    if (speaker?.entityId) snapshot.entity_id = speaker.entityId;
    const voice = voiceRecord(line.voiceOverride ?? speaker?.voice);
    if (voice) snapshot.voice = voice;
    if (take) {
      snapshot.audio_asset_id = take.assetId;
      snapshot.audio_take_id = take.id;
      snapshot.measured_duration_ms = take.durationMs;
    }
    return { ok: true, value: snapshot };
  }
  const local = speechSnapshotOf(value);
  if (!local.ok || !local.value) return local;
  if (!local.value.text && !local.value.audio_asset_id) {
    return failure(
      "local_speech_incomplete",
      "Unlinked speech requires text or an audio asset and does not require a hidden Script document.",
      "speech"
    );
  }
  return { ok: true, value: local.value };
}

async function resolvedRequestForRun(
  run: CapabilityRun,
  params: Record<string, unknown>
): Promise<VideoProductionPreflight> {
  const projectId = nonBlankField(params, "project_id");
  if (!projectId) {
    return failure("project_id_required", "project_id is required.", "project_id");
  }
  const destinationRaw = params["destination"];
  if (!isRecord(destinationRaw)) {
    return failure("destination_required", "destination is required.", "destination");
  }
  const documentId = nonBlankField(destinationRaw, "document_id");
  const targetType = destinationKindOf(destinationRaw["target_type"]);
  const targetId = nonBlankField(destinationRaw, "target_id");
  if (!documentId || !targetType || !targetId) {
    return failure("destination_incomplete", "destination needs document_id, target_type, and target_id.");
  }
  const state = await targetState(
    run,
    { document_id: documentId, target_type: targetType, target_id: targetId },
    projectId
  );
  if (!state.ok) return state;
  const expectedRevision = nonBlankField(destinationRaw, "target_revision");
  if (expectedRevision && expectedRevision !== state.value.revision) {
    return failure(
      "target_revision_conflict",
      `The target is revision ${state.value.revision}, not ${expectedRevision}.`,
      "destination.target_revision"
    );
  }
  const speechMode = speechModeOf(params["speech_mode"]);
  if (!speechMode) {
    return failure("speech_mode_invalid", "speech_mode is invalid.", "speech_mode");
  }
  const speech = await resolveSpeechForRun(run, params["speech"], speechMode, projectId);
  if (!speech.ok) return speech;
  return preflightVideoProduction({
    ...params,
    authorization: state.value.authorization,
    destination: {
      document_id: documentId,
      target_type: targetType,
      target_id: targetId,
      target_revision: state.value.revision
    },
    speech_snapshot: speech.value
  });
}

async function assetsForRequest(
  run: CapabilityRun,
  request: VideoProductionRequest
): Promise<{ readonly ok: true; readonly value: Map<string, Asset> } | ParseFailure> {
  const userId = run.context.userId;
  if (!isNonBlankString(userId)) {
    return failure("owner_required", "No authenticated owner is bound to this run.");
  }
  const ids = new Set(request.reference_asset_ids);
  if (request.speech?.audio_asset_id) ids.add(request.speech.audio_asset_id);
  if (request.performance_source_asset_id) ids.add(request.performance_source_asset_id);
  const assets = new Map<string, Asset>();
  for (const id of ids) {
    const asset = await Asset.find(userId, id);
    if (!asset || asset.project_id !== request.authorization.project_id) {
      return failure(
        "asset_not_authorized",
        `Asset ${id} was not found in the authorized project.`,
        "reference_asset_ids"
      );
    }
    assets.set(id, asset);
  }
  if (request.route === "audio_driven_performance") {
    const source = request.performance_source_asset_id
      ? assets.get(request.performance_source_asset_id)
      : undefined;
    const audio = request.speech?.audio_asset_id
      ? assets.get(request.speech.audio_asset_id)
      : undefined;
    if (!source?.content_type.startsWith("video/")) {
      return failure(
        "performance_source_must_be_video",
        "The current audio-driven adapter requires a video face reference.",
        "performance_source_asset_id"
      );
    }
    if (!audio?.content_type.startsWith("audio/")) {
      return failure(
        "performance_audio_must_be_audio",
        "The recorded performance input must be an audio asset.",
        "speech"
      );
    }
  }
  return { ok: true, value: assets };
}

function capabilityForRoute(
  route: VideoProductionRoute
): GenerationRequest["capability"] {
  switch (route) {
    case "text_to_video":
      return "text_to_video";
    case "reference_to_video":
      return "reference_to_video";
    case "audio_driven_performance":
      return "lip_sync";
  }
}

async function providerPreflight(
  run: CapabilityRun,
  request: VideoProductionRequest
): Promise<ParseFailure | null> {
  if (run.providers === undefined) return null;
  const provider = run.providers[request.provider];
  if (!provider) {
    return failure(
      "provider_unavailable",
      `Provider ${request.provider} is not configured for this run.`,
      "provider"
    );
  }
  const unavailable = await provider.unavailableReason();
  if (unavailable) {
    return failure("provider_unavailable", unavailable, "provider");
  }
  const capability = capabilityForRoute(request.route);
  const capabilities = new Set<string>(provider.getCapabilities());
  if (!capabilities.has(capability)) {
    return failure(
      "route_adapter_unavailable",
      `Provider ${request.provider} does not expose ${capability}; ${request.route} will not fall back to another route.`,
      "route"
    );
  }
  return null;
}

async function bytesForAsset(
  run: CapabilityRun,
  id: string
): Promise<{ readonly ok: true; readonly value: Uint8Array } | ParseFailure> {
  const result = await run.context.resolveAssetBytes(`asset://${id}`);
  if (result.bytes === null) {
    return failure(
      "asset_bytes_unavailable",
      `Asset ${id} could not be resolved. No provider call was submitted.`
    );
  }
  return { ok: true, value: result.bytes };
}

interface ResolvedInputs {
  readonly reference_images: readonly Uint8Array[];
  readonly reference_videos: readonly Uint8Array[];
  readonly performance_video?: Uint8Array;
  readonly performance_audio?: Uint8Array;
}

async function resolveInputs(
  run: CapabilityRun,
  request: VideoProductionRequest,
  assets: ReadonlyMap<string, Asset>
): Promise<{ readonly ok: true; readonly value: ResolvedInputs } | ParseFailure> {
  const images: Uint8Array[] = [];
  const videos: Uint8Array[] = [];
  for (const id of request.reference_asset_ids) {
    const resolved = await bytesForAsset(run, id);
    if (!resolved.ok) return resolved;
    const asset = assets.get(id);
    if (asset?.content_type.startsWith("video/")) videos.push(resolved.value);
    else if (asset?.content_type.startsWith("image/")) images.push(resolved.value);
    else {
      return failure(
        "reference_media_unsupported",
        `Reference asset ${id} is not an image or video.`,
        "reference_asset_ids"
      );
    }
  }
  if (request.route !== "audio_driven_performance") {
    return { ok: true, value: { reference_images: images, reference_videos: videos } };
  }
  const sourceId = request.performance_source_asset_id;
  const audioId = request.speech?.audio_asset_id;
  if (!sourceId || !audioId) {
    return failure("performance_inputs_missing", "Performance source video and audio are required.");
  }
  const performanceVideo = await bytesForAsset(run, sourceId);
  if (!performanceVideo.ok) return performanceVideo;
  const performanceAudio = await bytesForAsset(run, audioId);
  if (!performanceAudio.ok) return performanceAudio;
  return {
    ok: true,
    value: {
      reference_images: images,
      reference_videos: videos,
      performance_video: performanceVideo.value,
      performance_audio: performanceAudio.value
    }
  };
}

function snapshotOf(
  value: unknown
): { readonly ok: true; readonly value: VideoProductionSnapshot } | ParseFailure {
  if (!isRecord(value)) return failure("snapshot_invalid", "Candidate snapshot is invalid.");
  const parsed = productionGenerationSnapshot.safeParse(value);
  if (!parsed.success) return failure("snapshot_invalid", parsed.error.message);
  const documentId = nonBlankField(value, "documentId");
  const authorization = authorizationOf(value["authorization"]);
  const preconditions = preconditionsOf(value["preconditions"]);
  const route = routeOf(value["route"]);
  const visualTreatment = visualTreatmentOf(value["visualTreatment"]);
  const speechMode = speechModeOf(value["speechMode"]);
  if (
    !documentId ||
    !authorization.ok ||
    !preconditions.ok ||
    !route ||
    !visualTreatment ||
    !speechMode ||
    typeof value["suppressEmbeddedAudio"] !== "boolean"
  ) {
    return failure("snapshot_contract_incomplete", "Candidate snapshot contract is incomplete.");
  }
  return {
    ok: true,
    value: {
      ...parsed.data,
      documentId,
      authorization: authorization.value,
      preconditions: preconditions.value,
      route,
      visualTreatment,
      speechMode,
      suppressEmbeddedAudio: value["suppressEmbeddedAudio"]
    }
  };
}

function preconditionsOf(
  value: unknown
): { readonly ok: true; readonly value: VideoProductionPreconditions } | ParseFailure {
  if (!isRecord(value)) return failure("preconditions_invalid", "Preconditions are required.");
  const targetRevision = nonBlankField(value, "target_revision");
  const fingerprint = nonBlankField(value, "plan_fingerprint");
  const requested = positiveInteger(value["requested_duration_ms"]);
  const playableStart = nonNegativeInteger(value["playable_start_ms"]);
  const playable = positiveInteger(value["playable_duration_ms"]);
  if (!targetRevision || !fingerprint || !requested || playableStart === undefined || !playable) {
    return failure("preconditions_invalid", "Candidate preconditions are incomplete.");
  }
  return {
    ok: true,
    value: {
      target_revision: targetRevision,
      plan_fingerprint: fingerprint,
      requested_duration_ms: requested,
      playable_start_ms: playableStart,
      playable_duration_ms: playable
    }
  };
}

function preparedOf(
  value: unknown
): { readonly ok: true; readonly value: PreparedVideoProduction } | ParseFailure {
  if (!isRecord(value) || value["schema_version"] !== VIDEO_PRODUCTION_SCHEMA_VERSION) {
    return failure(
      "prepared_schema_unsupported",
      `prepared.schema_version must be ${VIDEO_PRODUCTION_SCHEMA_VERSION}.`
    );
  }
  const batchId = nonBlankField(value, "batch_id");
  if (!batchId) return failure("batch_id_required", "prepared.batch_id is required.");
  if (!isRecord(value["request"])) {
    return failure("prepared_request_missing", "prepared.request is required.");
  }
  const request = preflightVideoProduction(value["request"]);
  if (!request.ok) return request;
  const rawCandidates = value["candidate_requests"];
  if (!Array.isArray(rawCandidates) || rawCandidates.length !== request.request.candidate_count) {
    return failure(
      "candidate_requests_mismatch",
      "prepared.candidate_requests must contain exactly candidate_count entries."
    );
  }
  const candidates: VideoProductionCandidateRequest[] = [];
  for (const raw of rawCandidates) {
    if (!isRecord(raw)) return failure("candidate_request_invalid", "Candidate request is invalid.");
    const candidateId = nonBlankField(raw, "candidateId");
    const requestId = nonBlankField(raw, "requestId");
    const variationId = nonBlankField(raw, "variationId");
    const variationIndex = positiveInteger(raw["variationIndex"]);
    const destinationKind = destinationKindOf(raw["destinationKind"]);
    const destinationId = nonBlankField(raw, "destinationId");
    const snapshot = snapshotOf(raw["snapshot"]);
    if (
      !candidateId ||
      !requestId ||
      !variationId ||
      !variationIndex ||
      !destinationKind ||
      !destinationId ||
      !snapshot.ok
    ) {
      return failure("candidate_request_incomplete", "Candidate request identity is incomplete.");
    }
    const expected = productionVariationIdentity({
      batchId,
      destinationKind,
      destinationId,
      variationIndex
    });
    if (
      expected.candidateId !== candidateId ||
      expected.requestId !== requestId ||
      expected.variationId !== variationId ||
      snapshot.value.candidateId !== candidateId ||
      snapshot.value.requestId !== requestId
    ) {
      return failure(
        "candidate_identity_changed",
        "Prepared candidate identities or snapshots were modified after review."
      );
    }
    candidates.push({ ...expected, snapshot: snapshot.value });
  }
  return {
    ok: true,
    value: {
      schema_version: VIDEO_PRODUCTION_SCHEMA_VERSION,
      batch_id: batchId,
      request: request.request,
      candidate_requests: candidates
    }
  };
}

function outputDurationFromAssetRef(asset: AssetRef | undefined): number | undefined {
  if (!asset || !isRecord(asset.metadata)) return undefined;
  const durationMs = positiveInteger(asset.metadata["duration_ms"]);
  if (durationMs) return durationMs;
  const seconds = asset.metadata["duration"];
  return isNumber(seconds) && seconds > 0 ? Math.round(seconds * 1000) : undefined;
}

function timingForCandidate(
  preconditions: VideoProductionPreconditions,
  outputDurationMs?: number
): VideoProductionCandidateTiming {
  const timing: {
    requested_duration_ms: number;
    playable_duration_ms: number;
    output_duration_ms?: number;
    status: "unverified" | "valid" | "too_short";
  } = {
    requested_duration_ms: preconditions.requested_duration_ms,
    playable_duration_ms: preconditions.playable_duration_ms,
    status: "unverified"
  };
  if (outputDurationMs !== undefined) {
    timing.output_duration_ms = outputDurationMs;
    timing.status =
      outputDurationMs >= preconditions.playable_duration_ms ? "valid" : "too_short";
  }
  return timing;
}

function candidateFromState(
  prepared: PreparedVideoProduction,
  candidateRequest: VideoProductionCandidateRequest,
  state: {
    readonly generationId?: string;
    readonly assetIds?: readonly string[];
    readonly status: VideoProductionCandidateStatus;
    readonly error?: string;
    readonly outputDurationMs?: number;
  }
): VideoProductionCandidate {
  const assetIds = state.assetIds ?? [];
  const base = productionCandidate.parse({
    candidateId: candidateRequest.candidateId,
    batchId: prepared.batch_id,
    requestId: candidateRequest.requestId,
    variationId: candidateRequest.variationId,
    variationIndex: candidateRequest.variationIndex,
    destinationKind: candidateRequest.destinationKind,
    destinationId: candidateRequest.destinationId,
    documentId: prepared.request.destination.document_id,
    status: state.status,
    assetId: assetIds[0],
    error: state.error,
    snapshot: candidateRequest.snapshot
  });
  const candidate: VideoProductionCandidate = {
    ...base,
    snapshot: candidateRequest.snapshot,
    documentId: prepared.request.destination.document_id,
    document_id: prepared.request.destination.document_id,
    authorization: structuredClone(prepared.request.authorization),
    preconditions: structuredClone(candidateRequest.snapshot.preconditions),
    asset_ids: [...assetIds],
    active: false,
    accepted: false,
    timing: timingForCandidate(candidateRequest.snapshot.preconditions, state.outputDurationMs)
  };
  return state.generationId
    ? { ...candidate, generation_id: state.generationId }
    : candidate;
}

async function outputDurationForAsset(
  userId: string,
  assetId: string | undefined
): Promise<number | undefined> {
  if (!assetId) return undefined;
  const asset = await Asset.find(userId, assetId);
  return isNumber(asset?.duration) && asset.duration > 0
    ? Math.round(asset.duration * 1000)
    : undefined;
}

async function recoveredCandidate(
  prepared: PreparedVideoProduction,
  candidateRequest: VideoProductionCandidateRequest
): Promise<VideoProductionCandidate | null> {
  const userId = prepared.request.authorization.owner_id;
  const row = await Prediction.findForUser(userId, candidateRequest.requestId);
  if (!row) return null;
  const assetIds = Array.isArray(row.asset_ids)
    ? row.asset_ids.filter(isNonBlankString)
    : [];
  const publicStatus = publicGenerationStatus(row);
  const status: VideoProductionCandidateStatus =
    publicStatus === "completed"
      ? assetIds.length > 0
        ? "ready"
        : "failed"
      : publicStatus === "running"
        ? "generating"
        : publicStatus === "pending"
          ? "queued"
          : publicStatus === "cancelled"
            ? "cancelled"
            : "failed";
  const outputDurationMs = await outputDurationForAsset(userId, assetIds[0]);
  return candidateFromState(prepared, candidateRequest, {
    generationId: row.id,
    assetIds,
    status,
    error:
      publicStatus === "completed" && assetIds.length === 0
        ? "Generation completed without a persisted asset."
        : undefined,
    outputDurationMs
  });
}

function generationParams(
  request: VideoProductionRequest,
  inputs: ResolvedInputs,
  snapshot: VideoProductionSnapshot
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    ...structuredClone(request.generation_params),
    prompt: request.prompt,
    production_snapshot: snapshot
  };
  if (request.route === "reference_to_video") {
    params["reference_images"] = inputs.reference_images;
    params["reference_videos"] = inputs.reference_videos;
    params["duration_seconds"] = request.timing.requested_duration_ms / 1000;
  } else if (request.route === "text_to_video") {
    params["duration_seconds"] = request.timing.requested_duration_ms / 1000;
  } else {
    params["video"] = inputs.performance_video;
    params["audio"] = inputs.performance_audio;
  }
  return params;
}

async function submitCandidate(
  run: CapabilityRun,
  prepared: PreparedVideoProduction,
  candidateRequest: VideoProductionCandidateRequest,
  inputs: ResolvedInputs
): Promise<VideoProductionCandidate> {
  const recovered = await recoveredCandidate(prepared, candidateRequest);
  if (recovered) return recovered;
  const request: GenerationRequest = {
    id: candidateRequest.requestId,
    provider: prepared.request.provider,
    capability: capabilityForRoute(prepared.request.route),
    model: prepared.request.model,
    params: generationParams(prepared.request, inputs, candidateRequest.snapshot),
    origin: { surface: "capability" },
    persist: {
      name: `${prepared.batch_id}-${candidateRequest.variationIndex}`,
      mime: prepared.request.output_format
    },
    destination: {
      document_id: prepared.request.destination.document_id,
      target_type: prepared.request.destination.target_type,
      target_id: prepared.request.destination.target_id,
      selected: false
    }
  };
  try {
    const result = await run.context.runGeneration(request);
    const assetIds = result.assets.flatMap((asset) =>
      isNonBlankString(asset.asset_id) ? [asset.asset_id] : []
    );
    const duration = outputDurationFromAssetRef(result.assets[0]);
    return candidateFromState(prepared, candidateRequest, {
      generationId: result.id,
      assetIds,
      status: assetIds.length > 0 ? "ready" : "failed",
      error: assetIds.length > 0 ? undefined : "Generation completed without a persisted asset.",
      outputDurationMs: duration
    });
  } catch (cause) {
    if (cause instanceof GenerationAlreadyAcceptedError) {
      const existing = await recoveredCandidate(prepared, candidateRequest);
      if (existing) return existing;
    }
    return candidateFromState(prepared, candidateRequest, {
      generationId: candidateRequest.requestId,
      status: "failed",
      error: cause instanceof Error ? cause.message : String(cause)
    });
  }
}

async function submitPrepared(
  run: CapabilityRun,
  prepared: PreparedVideoProduction
): Promise<Record<string, unknown>> {
  const request = prepared.request;
  if (request.authorization.owner_id !== run.context.userId) {
    return { ok: false, code: "owner_mismatch", error: "Prepared owner does not match this run." };
  }
  const target = await targetState(run, request.destination, request.authorization.project_id);
  if (!target.ok) {
    return { ok: false, code: target.error.code, error: target.error.message };
  }
  if (target.value.revision !== request.destination.target_revision) {
    return {
      ok: false,
      code: "target_revision_conflict",
      error: "The target changed after preparation. Review and prepare the request again."
    };
  }
  const providerError = await providerPreflight(run, request);
  if (providerError) {
    return { ok: false, code: providerError.error.code, error: providerError.error.message };
  }
  const assets = await assetsForRequest(run, request);
  if (!assets.ok) return { ok: false, code: assets.error.code, error: assets.error.message };
  const inputs = await resolveInputs(run, request, assets.value);
  if (!inputs.ok) return { ok: false, code: inputs.error.code, error: inputs.error.message };
  const candidates = await Promise.all(
    prepared.candidate_requests.map((candidate) =>
      submitCandidate(run, prepared, candidate, inputs.value)
    )
  );
  return {
    ok: true,
    submitted: true,
    schema_version: VIDEO_PRODUCTION_SCHEMA_VERSION,
    batch_id: prepared.batch_id,
    job_id: run.context.jobId,
    authorization: structuredClone(request.authorization),
    preconditions: structuredClone(prepared.candidate_requests[0]?.snapshot.preconditions),
    candidates: candidates.sort((left, right) => left.variationIndex - right.variationIndex),
    accepted_candidate_ids: []
  };
}

function candidateTimingOf(
  value: unknown
): { readonly ok: true; readonly value: VideoProductionCandidateTiming } | ParseFailure {
  if (!isRecord(value)) return failure("candidate_timing_invalid", "Candidate timing is required.");
  const requested = positiveInteger(value["requested_duration_ms"]);
  const playable = positiveInteger(value["playable_duration_ms"]);
  const output = positiveInteger(value["output_duration_ms"]);
  const status = value["status"];
  if (
    !requested ||
    !playable ||
    (status !== "unverified" && status !== "valid" && status !== "too_short")
  ) {
    return failure("candidate_timing_invalid", "Candidate timing is incomplete.");
  }
  const timing: {
    requested_duration_ms: number;
    playable_duration_ms: number;
    output_duration_ms?: number;
    status: "unverified" | "valid" | "too_short";
  } = {
    requested_duration_ms: requested,
    playable_duration_ms: playable,
    status
  };
  if (output) timing.output_duration_ms = output;
  return { ok: true, value: timing };
}

function candidateOf(
  value: unknown
): { readonly ok: true; readonly value: VideoProductionCandidate } | ParseFailure {
  if (!isRecord(value)) return failure("candidate_invalid", "Each candidate must be an object.");
  const parsed = productionCandidate.safeParse(value);
  if (!parsed.success) return failure("candidate_invalid", parsed.error.message);
  const snapshot = snapshotOf(value["snapshot"]);
  const documentId = nonBlankField(value, "document_id");
  const authorization = authorizationOf(value["authorization"]);
  const preconditions = preconditionsOf(value["preconditions"]);
  const assetIds = stringList(value, "asset_ids");
  const timing = candidateTimingOf(value["timing"]);
  if (
    !snapshot.ok ||
    !documentId ||
    parsed.data.documentId !== documentId ||
    !authorization.ok ||
    !preconditions.ok ||
    !assetIds.ok ||
    !timing.ok
  ) {
    return failure("candidate_contract_incomplete", "Candidate contract is incomplete.");
  }
  if (value["active"] !== false || value["accepted"] !== false) {
    return failure(
      "candidate_already_applied",
      `Candidate ${parsed.data.candidateId} is already active or accepted.`
    );
  }
  const generationId = nonBlankField(value, "generation_id");
  const candidate: VideoProductionCandidate = {
    ...parsed.data,
    snapshot: snapshot.value,
    documentId,
    document_id: documentId,
    authorization: authorization.value,
    preconditions: preconditions.value,
    asset_ids: assetIds.value,
    active: false,
    accepted: false,
    timing: timing.value
  };
  return {
    ok: true,
    value: generationId ? { ...candidate, generation_id: generationId } : candidate
  };
}

function candidatesOf(
  value: unknown
): { readonly ok: true; readonly value: VideoProductionCandidate[] } | ParseFailure {
  if (!Array.isArray(value) || value.length === 0) {
    return failure("candidates_required", "candidates must be a non-empty array.");
  }
  const candidates: VideoProductionCandidate[] = [];
  for (const raw of value) {
    const candidate = candidateOf(raw);
    if (!candidate.ok) return candidate;
    candidates.push(candidate.value);
  }
  return { ok: true, value: candidates };
}

async function refreshCandidate(
  run: CapabilityRun,
  candidate: VideoProductionCandidate
): Promise<VideoProductionCandidate> {
  if (!candidate.generation_id || !isNonBlankString(run.context.userId)) return candidate;
  const row = await Prediction.findForUser(run.context.userId, candidate.generation_id);
  if (!row) return { ...candidate, status: "failed", error: "Generation record was not found." };
  const assetIds = Array.isArray(row.asset_ids)
    ? row.asset_ids.filter(isNonBlankString)
    : [...candidate.asset_ids];
  const publicStatus = publicGenerationStatus(row);
  const status: VideoProductionCandidateStatus =
    publicStatus === "completed"
      ? assetIds.length > 0
        ? "ready"
        : "failed"
      : publicStatus === "running"
        ? "generating"
        : publicStatus === "pending"
          ? "queued"
          : publicStatus === "cancelled"
            ? "cancelled"
            : "failed";
  const outputDurationMs = await outputDurationForAsset(run.context.userId, assetIds[0]);
  const timing = timingForCandidate(
    candidate.preconditions,
    outputDurationMs ?? candidate.timing.output_duration_ms
  );
  return {
    ...candidate,
    status,
    assetId: assetIds[0],
    asset_ids: assetIds,
    timing
  };
}

function selectionOf(
  value: unknown
): { readonly ok: true; readonly value: Record<string, string> } | ParseFailure {
  if (!isRecord(value)) return failure("selection_required", "selection must be an object.");
  const selection: Record<string, string> = {};
  for (const [destinationId, candidateId] of Object.entries(value)) {
    if (!isNonBlankString(destinationId) || !isNonBlankString(candidateId)) {
      return failure("selection_invalid", "Selection keys and candidate ids must be non-empty.");
    }
    selection[destinationId] = candidateId.trim();
  }
  if (Object.keys(selection).length === 0) {
    return failure("selection_required", "selection must not be empty.");
  }
  return { ok: true, value: selection };
}

/** Build a serializable preview artifact without writing document state. */
export function previewVideoProductionSelection(
  candidates: readonly VideoProductionCandidate[],
  params: Record<string, unknown>
): Record<string, unknown> | VideoProductionValidationError {
  const kind = params["kind"];
  const batchId = nonBlankField(params, "batch_id");
  const documentId = nonBlankField(params, "document_id");
  const selection = selectionOf(params["selection"]);
  if (
    (kind !== "preview_take" && kind !== "preview_draft") ||
    !batchId ||
    !documentId ||
    !selection.ok
  ) {
    return { code: "preview_invalid", message: "Preview kind, batch, document, and selection are required." };
  }
  if (kind === "preview_take" && Object.keys(selection.value).length !== 1) {
    return { code: "preview_take_requires_one", message: "Preview take requires exactly one candidate." };
  }
  const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  for (const [destinationId, candidateId] of Object.entries(selection.value)) {
    const candidate = byId.get(candidateId);
    if (
      !candidate ||
      candidate.batchId !== batchId ||
      candidate.document_id !== documentId ||
      candidate.destinationId !== destinationId ||
      candidate.status !== "ready" ||
      !candidate.assetId
    ) {
      return {
        code: "preview_candidate_invalid",
        message: `Candidate ${candidateId} is not a ready candidate for destination ${destinationId}.`
      };
    }
  }
  const unresolved = [
    ...new Set(
      candidates
        .filter((candidate) => candidate.batchId === batchId && candidate.document_id === documentId)
        .map((candidate) => candidate.destinationId)
        .filter((destinationId) => selection.value[destinationId] === undefined)
    )
  ];
  return {
    schema_version: VIDEO_PRODUCTION_SCHEMA_VERSION,
    kind,
    batch_id: batchId,
    document_id: documentId,
    selection: structuredClone(selection.value),
    unresolved_destination_ids: unresolved,
    persisted: false,
    autosave: false,
    exportable: false,
    accepted_candidate_ids: []
  };
}

/** Validate an explicit candidate set before a destination adapter may apply it. */
export function validateVideoProductionAcceptance(
  candidates: readonly VideoProductionCandidate[],
  selectedCandidateIds: readonly string[],
  expectedTargetRevision?: string
): VideoProductionAcceptance {
  if (selectedCandidateIds.length === 0) {
    return failure("candidate_selection_required", "At least one candidate must be selected.");
  }
  const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const selected: VideoProductionCandidate[] = [];
  const slots = new Set<string>();
  for (const id of selectedCandidateIds) {
    const candidate = byId.get(id);
    if (!candidate) return failure("candidate_not_found", `Candidate ${id} was not included.`);
    if (candidate.status !== "ready" || !candidate.assetId) {
      return failure("candidate_not_ready", `Candidate ${id} is not ready with a persisted asset.`);
    }
    if (candidate.timing.status !== "valid") {
      return failure(
        candidate.timing.status === "too_short"
          ? "candidate_too_short"
          : "candidate_timing_unverified",
        `Candidate ${id} has not passed playable-duration validation.`
      );
    }
    const slot = `${candidate.destinationKind}:${candidate.destinationId}`;
    if (slots.has(slot)) {
      return failure("multiple_candidates_for_slot", `Only one candidate may be selected for ${slot}.`);
    }
    slots.add(slot);
    if (
      expectedTargetRevision !== undefined &&
      candidate.preconditions.target_revision !== expectedTargetRevision
    ) {
      return failure("target_revision_conflict", `Candidate ${id} targets another revision.`);
    }
    selected.push(candidate);
  }
  return { ok: true, candidates: selected };
}

interface AcceptanceTargetInput {
  readonly destination_id: string;
  readonly destination_kind: ProductionDestinationKind;
  readonly expected_target_revision: string;
}

function acceptanceTargetsOf(
  value: unknown
): { readonly ok: true; readonly value: AcceptanceTargetInput[] } | ParseFailure {
  if (!Array.isArray(value) || value.length === 0) {
    return failure("acceptance_targets_required", "targets must be a non-empty array.");
  }
  const targets: AcceptanceTargetInput[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return failure("acceptance_target_invalid", "Each target must be an object.");
    const destinationId = nonBlankField(raw, "destination_id");
    const destinationKind = destinationKindOf(raw["destination_kind"]);
    const revision = nonBlankField(raw, "expected_target_revision");
    if (!destinationId || !destinationKind || !revision) {
      return failure("acceptance_target_invalid", "Each target needs id, kind, and revision.");
    }
    targets.push({
      destination_id: destinationId,
      destination_kind: destinationKind,
      expected_target_revision: revision
    });
  }
  return { ok: true, value: targets };
}

async function acceptanceManifest(
  run: CapabilityRun,
  params: Record<string, unknown>
): Promise<
  | { readonly ok: true; readonly value: VideoProductionAcceptanceManifest }
  | ParseFailure
> {
  const action = params["action"];
  const batchId = nonBlankField(params, "batch_id");
  const documentId = nonBlankField(params, "document_id");
  const projectId = nonBlankField(params, "project_id");
  const parsedCandidates = candidatesOf(params["candidates"]);
  const selection = selectionOf(params["selection"]);
  const targets = acceptanceTargetsOf(params["targets"]);
  if (
    (action !== "use_take" && action !== "use_draft") ||
    !batchId ||
    !documentId ||
    !projectId ||
    !parsedCandidates.ok ||
    !selection.ok ||
    !targets.ok
  ) {
    return failure("acceptance_request_invalid", "Acceptance request is incomplete.");
  }
  if (action === "use_take" && Object.keys(selection.value).length !== 1) {
    return failure("use_take_requires_one", "Use take requires exactly one selected candidate.");
  }
  const validation = validateVideoProductionAcceptance(
    parsedCandidates.value,
    Object.values(selection.value)
  );
  if (!validation.ok) return validation;
  const liveTargets: Array<AcceptanceTargetInput & { accepted_candidate_id?: string }> = [];
  for (const target of targets.value) {
    const state = await targetState(
      run,
      {
        document_id: documentId,
        target_type: target.destination_kind,
        target_id: target.destination_id
      },
      projectId
    );
    if (!state.ok) return state;
    if (state.value.revision !== target.expected_target_revision) {
      return failure(
        "target_revision_conflict",
        `Destination ${target.destination_id} changed before acceptance.`
      );
    }
    const live: AcceptanceTargetInput & { accepted_candidate_id?: string } = { ...target };
    if (state.value.accepted_candidate_id) {
      live.accepted_candidate_id = state.value.accepted_candidate_id;
    }
    liveTargets.push(live);
  }
  if (action === "use_draft") {
    const shared = validateProductionAcceptance({
      candidates: validation.candidates.map((candidate) =>
        productionCandidate.parse(candidate)
      ),
      targets: liveTargets.map((target) => ({
        destinationKind: target.destination_kind,
        destinationId: target.destination_id,
        acceptedCandidateId: target.accepted_candidate_id
      })),
      selection: selection.value,
      batchId
    });
    if (!shared.valid) {
      return failure("use_draft_conflict", shared.issues.join("; "));
    }
  }
  const ownerId = run.context.userId;
  if (!isNonBlankString(ownerId)) return failure("owner_required", "No owner is bound to this run.");
  for (const candidate of validation.candidates) {
    if (
      candidate.batchId !== batchId ||
      candidate.document_id !== documentId ||
      candidate.authorization.owner_id !== ownerId ||
      candidate.authorization.project_id !== projectId ||
      selection.value[candidate.destinationId] !== candidate.candidateId
    ) {
      return failure(
        "candidate_scope_mismatch",
        `Candidate ${candidate.candidateId} does not belong to this authorized selection.`
      );
    }
    const target = liveTargets.find(
      (item) =>
        item.destination_id === candidate.destinationId &&
        item.destination_kind === candidate.destinationKind
    );
    if (!target || candidate.preconditions.target_revision !== target.expected_target_revision) {
      return failure("candidate_target_mismatch", `Candidate ${candidate.candidateId} targets stale state.`);
    }
  }
  return {
    ok: true,
    value: {
      schema_version: VIDEO_PRODUCTION_SCHEMA_VERSION,
      action,
      batch_id: batchId,
      document_id: documentId,
      authorization: { owner_id: ownerId, project_id: projectId },
      selection: structuredClone(selection.value),
      targets: liveTargets.map((target) => ({ ...target })),
      candidates: validation.candidates.map((candidate) => ({ ...candidate }))
    }
  };
}

async function routeAcceptance(
  run: CapabilityRun,
  manifest: VideoProductionAcceptanceManifest
): Promise<Record<string, unknown>> {
  try {
    const result = await run.invoke(VIDEO_PRODUCTION_ACCEPTANCE_ADAPTER, { manifest });
    if (!isRecord(result)) {
      return {
        ok: false,
        code: "acceptance_adapter_invalid",
        error: "The destination adapter returned an invalid result.",
        acceptance_manifest: manifest
      };
    }
    return { ...result, acceptance_manifest: manifest };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (message.includes(`no capability is registered for "${VIDEO_PRODUCTION_ACCEPTANCE_ADAPTER}"`)) {
      const kinds = [
        ...new Set(
          manifest.targets.flatMap((target) =>
            isString(target["destination_kind"]) ? [target["destination_kind"]] : []
          )
        )
      ].join(", ");
      return {
        ok: false,
        code: "unsupported_acceptance_destination",
        error:
          `No shared ${manifest.action} adapter is registered for ${kinds || "this destination"}. ` +
          "No accepted media was changed.",
        unsupported_destination_kinds: kinds ? kinds.split(", ") : [],
        acceptance_manifest: manifest
      };
    }
    return {
      ok: false,
      code: "acceptance_adapter_failed",
      error: message,
      acceptance_manifest: manifest
    };
  }
}

const prepareVideoProductionCapability: CapabilityExport = {
  spec: prepareVideoProductionSpec,
  impl: async (run, params) => {
    const resolved = await resolvedRequestForRun(run, params);
    if (!resolved.ok) {
      return {
        ok: false,
        error: resolved.error.message,
        code: resolved.error.code,
        field: resolved.error.field
      };
    }
    const prepared = prepareVideoProduction({ ...resolved.request, batch_id: params["batch_id"] });
    return "schema_version" in prepared
      ? {
          ok: true,
          prepared,
          authorization: prepared.request.authorization,
          preconditions: prepared.candidate_requests[0]?.snapshot.preconditions,
          accepted_candidate_ids: []
        }
      : { ok: false, error: prepared.message, code: prepared.code, field: prepared.field };
  }
};

const submitVideoProductionCapability: CapabilityExport = {
  spec: submitVideoProductionSpec,
  impl: async (run, params) => {
    const prepared = preparedOf(params["prepared"]);
    if (!prepared.ok) {
      return { ok: false, error: prepared.error.message, code: prepared.error.code };
    }
    return submitPrepared(run, prepared.value);
  }
};

const inspectVideoProductionCandidatesCapability: CapabilityExport = {
  spec: inspectVideoProductionCandidatesSpec,
  impl: async (run, params) => {
    const parsed = candidatesOf(params["candidates"]);
    if (!parsed.ok) return { ok: false, error: parsed.error.message, code: parsed.error.code };
    const refreshed = await Promise.all(
      parsed.value.map((candidate) => refreshCandidate(run, candidate))
    );
    const sorted = refreshed.sort((left, right) => left.variationIndex - right.variationIndex);
    const response: Record<string, unknown> = {
      ok: true,
      candidates: sorted,
      accepted_candidate_ids: []
    };
    if (params["preview"] !== undefined) {
      if (!isRecord(params["preview"])) {
        return { ok: false, code: "preview_invalid", error: "preview must be an object." };
      }
      const preview = previewVideoProductionSelection(sorted, params["preview"]);
      if ("code" in preview) {
        return { ok: false, code: preview.code, error: preview.message };
      }
      response["preview"] = preview;
    }
    return response;
  }
};

const acceptVideoProductionCandidatesCapability: CapabilityExport = {
  spec: acceptVideoProductionCandidatesSpec,
  impl: async (run, params) => {
    const manifest = await acceptanceManifest(run, params);
    if (!manifest.ok) {
      return { ok: false, code: manifest.error.code, error: manifest.error.message };
    }
    return routeAcceptance(run, manifest.value);
  }
};

export const VIDEO_PRODUCTION_CAPABILITIES: readonly CapabilityExport[] = [
  prepareVideoProductionCapability,
  submitVideoProductionCapability,
  inspectVideoProductionCandidatesCapability,
  acceptVideoProductionCandidatesCapability
];

export const module: CapabilityModule = {
  module: "video-production",
  exports: VIDEO_PRODUCTION_CAPABILITIES
};

export {
  prepareVideoProductionCapability,
  submitVideoProductionCapability as submitVideoProduction,
  inspectVideoProductionCandidatesCapability as inspectVideoProductionCandidates,
  acceptVideoProductionCandidatesCapability as acceptVideoProductionCandidates
};
