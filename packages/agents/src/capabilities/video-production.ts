/**
 * Headless AI-video production operations.
 *
 * This module owns the provider-independent production contract. Preparation
 * and acceptance validation are pure contract work. Submission uses the
 * existing ProcessingContext generation seam, so generation records, provider
 * cancellation, recovery, and asset persistence remain one system. Candidate
 * landing and destination-specific acceptance are intentionally not recreated
 * here because the agent package has no shared apply adapter for those
 * surfaces yet.
 */

import { randomUUID } from "node:crypto";
import type { GenerationRequest, ProcessingContext } from "@nodetool-ai/runtime";
import { Prediction } from "@nodetool-ai/models";
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
import { publicGenerationStatus } from "./generations.js";
import {
  isNonBlankString,
  isNonEmptyString,
  isNumber,
  isRecord
} from "../utils/type-guards.js";

export const VIDEO_PRODUCTION_SCHEMA_VERSION = "ai-video-production.v1" as const;

export type VideoProductionRoute =
  | "reference_to_video"
  | "text_to_video";

export type VideoProductionCandidateStatus =
  | "prepared"
  | "submitted"
  | "running"
  | "ready"
  | "completed_without_asset"
  | "failed"
  | "unknown";

export interface VideoProductionDestination {
  readonly document_id: string;
  readonly target_type: string;
  readonly target_id: string;
  readonly target_revision?: string;
}

export interface VideoProductionRequest {
  readonly destination: VideoProductionDestination;
  readonly route: VideoProductionRoute;
  readonly provider: string;
  readonly model: string;
  readonly prompt: string;
  readonly required_reference_asset_ids: readonly string[];
  readonly reference_asset_ids: readonly string[];
  readonly candidate_count: number;
  readonly generation_params: Readonly<Record<string, unknown>>;
}

export interface VideoProductionCandidateRequest {
  readonly candidate_id: string;
  readonly request_id: string;
  readonly variation_index: number;
}

export interface PreparedVideoProduction {
  readonly schema_version: typeof VIDEO_PRODUCTION_SCHEMA_VERSION;
  readonly batch_id: string;
  readonly request: VideoProductionRequest;
  readonly candidate_requests: readonly VideoProductionCandidateRequest[];
}

export interface VideoProductionCandidate {
  readonly candidate_id: string;
  readonly batch_id: string;
  readonly request_id: string;
  readonly variation_index: number;
  readonly generation_id?: string;
  readonly destination: VideoProductionDestination;
  readonly route: VideoProductionRoute;
  readonly provider: string;
  readonly model: string;
  readonly asset_ids: readonly string[];
  readonly status: VideoProductionCandidateStatus;
  readonly accepted: false;
  readonly error?: string;
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

interface ParsedPrepared {
  readonly ok: true;
  readonly prepared: PreparedVideoProduction;
}

interface ParseFailure {
  readonly ok: false;
  readonly error: VideoProductionValidationError;
}

type ParsedPreparedResult = ParsedPrepared | ParseFailure;

interface ParsedCandidate {
  readonly ok: true;
  readonly value: VideoProductionCandidate;
}

function error(
  code: string,
  message: string,
  field?: string
): ParseFailure {
  const validationError: {
    code: string;
    message: string;
    field?: string;
  } = { code, message };
  if (field) {
    validationError.field = field;
  }
  return { ok: false, error: validationError };
}

function nonBlankField(
  params: Record<string, unknown>,
  key: string
): string | undefined {
  const value = params[key];
  return isNonBlankString(value) ? value.trim() : undefined;
}

function stringList(
  params: Record<string, unknown>,
  key: string
): { readonly ok: true; readonly value: string[] } | ParseFailure {
  const raw = params[key];
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return error(`${key}_must_be_array`, `${key} must be an array of asset ids.`, key);
  }
  const value = raw.filter(isNonBlankString).map((id) => id.trim());
  if (value.length !== raw.length) {
    return error(
      `${key}_must_contain_strings`,
      `${key} must contain only non-empty asset ids.`,
      key
    );
  }
  if (new Set(value).size !== value.length) {
    return error(
      `${key}_must_be_unique`,
      `${key} must not contain duplicate asset ids.`,
      key
    );
  }
  return { ok: true, value };
}

function destinationOf(value: unknown):
  | { readonly ok: true; readonly value: VideoProductionDestination }
  | ParseFailure {
  if (!isRecord(value)) {
    return error(
      "destination_required",
      "destination must include document_id, target_type, and target_id.",
      "destination"
    );
  }
  const documentId = nonBlankField(value, "document_id");
  const targetType = nonBlankField(value, "target_type");
  const targetId = nonBlankField(value, "target_id");
  if (!documentId || !targetType || !targetId) {
    return error(
      "destination_incomplete",
      "destination must include non-empty document_id, target_type, and target_id.",
      "destination"
    );
  }
  const targetRevision = nonBlankField(value, "target_revision");
  const destination: {
    document_id: string;
    target_type: string;
    target_id: string;
    target_revision?: string;
  } = {
    document_id: documentId,
    target_type: targetType,
    target_id: targetId
  };
  if (targetRevision) {
    destination.target_revision = targetRevision;
  }
  return {
    ok: true,
    value: destination
  };
}

function routeOf(value: unknown): VideoProductionRoute | undefined {
  return value === "reference_to_video" || value === "text_to_video"
    ? value
    : undefined;
}

function candidateCountOf(value: unknown): number {
  if (value === undefined || value === null) return 1;
  if (!isNumber(value) || !Number.isInteger(value)) return 0;
  return value;
}

/** Validate the reviewed request before any asset read or provider call. */
export function preflightVideoProduction(
  params: Record<string, unknown>
): VideoProductionPreflight {
  const destination = destinationOf(params["destination"]);
  if (!destination.ok) return destination;

  const route = routeOf(params["route"]);
  if (!route) {
    return error(
      "unsupported_route",
      "route must be reference_to_video or text_to_video.",
      "route"
    );
  }
  const provider = nonBlankField(params, "provider");
  const model = nonBlankField(params, "model");
  const prompt = nonBlankField(params, "prompt");
  if (!provider || !model || !prompt) {
    return error(
      "request_incomplete",
      "provider, model, and prompt must be non-empty.",
      !provider ? "provider" : !model ? "model" : "prompt"
    );
  }

  const required = stringList(params, "required_reference_asset_ids");
  if (!required.ok) return required;
  const references = stringList(params, "reference_asset_ids");
  if (!references.ok) return references;
  const missing = required.value.filter((id) => !references.value.includes(id));
  if (missing.length > 0) {
    return error(
      "required_reference_assets_missing",
      `Required reference asset ids are missing from reference_asset_ids: ${missing.join(", ")}.`,
      "reference_asset_ids"
    );
  }
  if (route === "reference_to_video" && references.value.length === 0) {
    return error(
      "reference_assets_required",
      "reference_to_video requires at least one reference asset id.",
      "reference_asset_ids"
    );
  }
  if (route === "text_to_video" && required.value.length > 0) {
    return error(
      "text_only_route_rejected",
      "text_to_video cannot satisfy required reference assets. Choose reference_to_video before spend.",
      "route"
    );
  }
  if (route === "text_to_video" && references.value.length > 0) {
    return error(
      "text_only_route_would_drop_references",
      "text_to_video cannot consume reference assets. Choose reference_to_video so approved references reach the provider.",
      "route"
    );
  }

  const candidateCount = candidateCountOf(params["candidate_count"]);
  if (candidateCount < 1 || candidateCount > 3) {
    return error(
      "candidate_count_out_of_range",
      "candidate_count must be an integer from one through three.",
      "candidate_count"
    );
  }

  const generationParams = params["generation_params"];
  if (generationParams !== undefined && !isRecord(generationParams)) {
    return error(
      "generation_params_must_be_object",
      "generation_params must be an object.",
      "generation_params"
    );
  }

  return {
    ok: true,
    request: {
      destination: destination.value,
      route,
      provider,
      model,
      prompt,
      required_reference_asset_ids: required.value,
      reference_asset_ids: references.value,
      candidate_count: candidateCount,
      generation_params: generationParams ? { ...generationParams } : {}
    }
  };
}

function candidateRequestOf(value: unknown):
  | { readonly ok: true; readonly value: VideoProductionCandidateRequest }
  | ParseFailure {
  if (!isRecord(value)) {
    return error("candidate_request_invalid", "Each candidate request must be an object.");
  }
  const candidateId = nonBlankField(value, "candidate_id");
  const requestId = nonBlankField(value, "request_id");
  const variationIndex = value["variation_index"];
  if (!candidateId || !requestId || !isNumber(variationIndex) || !Number.isInteger(variationIndex)) {
    return error(
      "candidate_request_incomplete",
      "Each candidate request needs candidate_id, request_id, and an integer variation_index."
    );
  }
  return {
    ok: true,
    value: {
      candidate_id: candidateId,
      request_id: requestId,
      variation_index: variationIndex
    }
  };
}

function requestParamsFromPrepared(
  value: unknown
): VideoProductionPreflight {
  if (!isRecord(value)) {
    return error("prepared_request_missing", "prepared.request must be an object.");
  }
  return preflightVideoProduction(value);
}

function preparedOf(value: unknown): ParsedPreparedResult {
  if (!isRecord(value)) {
    return error("prepared_manifest_required", "prepared must be a production manifest.");
  }
  if (value["schema_version"] !== VIDEO_PRODUCTION_SCHEMA_VERSION) {
    return error(
      "prepared_schema_unsupported",
      `prepared.schema_version must be ${VIDEO_PRODUCTION_SCHEMA_VERSION}.`
    );
  }
  const batchId = nonBlankField(value, "batch_id");
  if (!batchId) return error("batch_id_required", "prepared.batch_id is required.");
  const request = requestParamsFromPrepared(value["request"]);
  if (!request.ok) return request;
  const rawCandidates = value["candidate_requests"];
  if (!Array.isArray(rawCandidates) || rawCandidates.length !== request.request.candidate_count) {
    return error(
      "candidate_requests_mismatch",
      "prepared.candidate_requests must contain exactly candidate_count entries."
    );
  }
  const candidateRequests: VideoProductionCandidateRequest[] = [];
  for (const raw of rawCandidates) {
    const candidate = candidateRequestOf(raw);
    if (!candidate.ok) return candidate;
    candidateRequests.push(candidate.value);
  }
  if (
    new Set(candidateRequests.map((candidate) => candidate.candidate_id)).size !==
      candidateRequests.length ||
    new Set(candidateRequests.map((candidate) => candidate.request_id)).size !==
      candidateRequests.length ||
    new Set(candidateRequests.map((candidate) => candidate.variation_index)).size !==
      candidateRequests.length
  ) {
    return error(
      "candidate_requests_not_unique",
      "prepared candidate and request identities must be unique."
    );
  }
  return {
    ok: true,
    prepared: {
      schema_version: VIDEO_PRODUCTION_SCHEMA_VERSION,
      batch_id: batchId,
      request: request.request,
      candidate_requests: candidateRequests
    }
  };
}

/** Build the immutable request manifest without reading assets or spending. */
export function prepareVideoProduction(
  params: Record<string, unknown>
): PreparedVideoProduction | VideoProductionValidationError {
  const preflight = preflightVideoProduction(params);
  if (!preflight.ok) return preflight.error;
  const batchId = nonBlankField(params, "batch_id") ?? randomUUID();
  const candidateRequests = Array.from(
    { length: preflight.request.candidate_count },
    (_, index) => ({
      candidate_id: `${batchId}:candidate:${index + 1}`,
      request_id: `${batchId}:request:${index + 1}`,
      variation_index: index
    })
  );
  return {
    schema_version: VIDEO_PRODUCTION_SCHEMA_VERSION,
    batch_id: batchId,
    request: preflight.request,
    candidate_requests: candidateRequests
  };
}

interface ResolvedReference {
  readonly id: string;
  readonly bytes: Uint8Array;
  readonly kind: "image" | "video";
}

async function resolveReferences(
  context: ProcessingContext,
  ids: readonly string[]
): Promise<ResolvedReference[] | VideoProductionValidationError> {
  const resolved: ResolvedReference[] = [];
  for (const id of ids) {
    const result = await context.resolveAssetBytes(`asset://${id}`);
    if (result.bytes === null) {
      return {
        code: "reference_asset_unavailable",
        message:
          `Reference asset ${id} could not be resolved for this user. ` +
          "No provider call was submitted.",
        field: "reference_asset_ids"
      };
    }
    let kind: "image" | "video" = "image";
    try {
      const info = await context.getAssetInfo(id);
      if (info?.content_type.startsWith("video/")) kind = "video";
    } catch {
      // A provider-independent test host may expose bytes but no asset-info
      // adapter. The runtime route still accepts image references by default.
    }
    resolved.push({ id, bytes: result.bytes, kind });
  }
  return resolved;
}

function assetIdsFromResult(
  assets: ReadonlyArray<{ readonly asset_id?: string | null }>
): string[] {
  return assets.flatMap((asset) =>
    isNonEmptyString(asset.asset_id) ? [asset.asset_id] : []
  );
}

function candidateFromSubmission(
  prepared: PreparedVideoProduction,
  candidateRequest: VideoProductionCandidateRequest,
  result: {
    readonly generation_id?: string;
    readonly asset_ids?: readonly string[];
    readonly status?: VideoProductionCandidateStatus;
    readonly error?: string;
  }
): VideoProductionCandidate {
  const assetIds = result.asset_ids ?? [];
  const candidate: {
    candidate_id: string;
    batch_id: string;
    request_id: string;
    variation_index: number;
    generation_id?: string;
    destination: VideoProductionDestination;
    route: VideoProductionRoute;
    provider: string;
    model: string;
    asset_ids: readonly string[];
    status: VideoProductionCandidateStatus;
    accepted: false;
    error?: string;
  } = {
    candidate_id: candidateRequest.candidate_id,
    batch_id: prepared.batch_id,
    request_id: candidateRequest.request_id,
    variation_index: candidateRequest.variation_index,
    destination: prepared.request.destination,
    route: prepared.request.route,
    provider: prepared.request.provider,
    model: prepared.request.model,
    asset_ids: assetIds,
    status: result.status ?? (assetIds.length > 0 ? "ready" : "submitted"),
    accepted: false
  };
  if (result.generation_id) {
    candidate.generation_id = result.generation_id;
  }
  if (result.error) {
    candidate.error = result.error;
  }
  return candidate;
}

async function submitPrepared(
  run: CapabilityRun,
  prepared: PreparedVideoProduction
): Promise<Record<string, unknown>> {
  const preflight = preflightVideoProduction({
    ...prepared.request,
    destination: prepared.request.destination
  });
  if (!preflight.ok) return { error: preflight.error.message, code: preflight.error.code };
  const references = await resolveReferences(
    run.context,
    prepared.request.reference_asset_ids
  );
  if (!Array.isArray(references)) {
    return { error: references.message, code: references.code };
  }
  const referenceImages = references
    .filter((reference) => reference.kind === "image")
    .map((reference) => reference.bytes);
  const referenceVideos = references
    .filter((reference) => reference.kind === "video")
    .map((reference) => reference.bytes);
  const candidates = await Promise.all(
    prepared.candidate_requests.map(async (candidateRequest) => {
      const requestParams: Record<string, unknown> = {
        ...prepared.request.generation_params,
        prompt: prepared.request.prompt
      };
      if (prepared.request.route === "reference_to_video") {
        requestParams.reference_images = referenceImages;
        requestParams.reference_videos = referenceVideos;
      }
      const generationRequest: GenerationRequest = {
        id: candidateRequest.request_id,
        provider: prepared.request.provider,
        capability: prepared.request.route,
        model: prepared.request.model,
        params: requestParams,
        origin: { surface: "capability" },
        persist: {
          name: `${prepared.batch_id}-${candidateRequest.variation_index + 1}`,
          mime: "video/mp4"
        },
        destination: {
          document_id: prepared.request.destination.document_id,
          target_type: prepared.request.destination.target_type,
          target_id: prepared.request.destination.target_id,
          selected: false
        }
      };
      try {
        const result = await run.context.runGeneration(generationRequest);
        const assetIds = assetIdsFromResult(result.assets);
        return candidateFromSubmission(prepared, candidateRequest, {
          generation_id: result.id,
          asset_ids: assetIds,
          status: assetIds.length > 0 ? "ready" : "completed_without_asset"
        });
      } catch (cause) {
        return candidateFromSubmission(prepared, candidateRequest, {
          generation_id: candidateRequest.request_id,
          status: "failed",
          error: cause instanceof Error ? cause.message : String(cause)
        });
      }
    })
  );
  return {
    ok: true,
    submitted: true,
    batch_id: prepared.batch_id,
    job_id: run.context.jobId,
    candidates: candidates.sort((left, right) => left.variation_index - right.variation_index),
    accepted_candidate_ids: []
  };
}

function candidateStatusOf(
  value: unknown
): VideoProductionCandidateStatus | undefined {
  switch (value) {
    case "prepared":
    case "submitted":
    case "running":
    case "ready":
    case "completed_without_asset":
    case "failed":
    case "unknown":
      return value;
    default:
      return undefined;
  }
}

function candidateOf(value: unknown): ParsedCandidate | ParseFailure {
  if (!isRecord(value)) return error("candidate_invalid", "Each candidate must be an object.");
  const candidateId = nonBlankField(value, "candidate_id");
  const batchId = nonBlankField(value, "batch_id");
  const requestId = nonBlankField(value, "request_id");
  const destination = destinationOf(value["destination"]);
  const route = routeOf(value["route"]);
  const provider = nonBlankField(value, "provider");
  const model = nonBlankField(value, "model");
  const variationIndex = value["variation_index"];
  const status = candidateStatusOf(value["status"]);
  const assetIds = value["asset_ids"];
  if (
    !candidateId ||
    !batchId ||
    !requestId ||
    !destination.ok ||
    !route ||
    !provider ||
    !model ||
    !isNumber(variationIndex) ||
    !Number.isInteger(variationIndex) ||
    !status ||
    !Array.isArray(assetIds) ||
    !assetIds.every(isNonBlankString)
  ) {
    return error(
      "candidate_incomplete",
      "Candidates need identity, destination, route, model, status, and asset_ids."
    );
  }
  if (value["accepted"] === true) {
    return error(
      "candidate_already_accepted",
      `Candidate ${candidateId} is already accepted and cannot be accepted again.`
    );
  }
  const candidate: {
    candidate_id: string;
    batch_id: string;
    request_id: string;
    variation_index: number;
    generation_id?: string;
    destination: VideoProductionDestination;
    route: VideoProductionRoute;
    provider: string;
    model: string;
    asset_ids: string[];
    status: VideoProductionCandidateStatus;
    accepted: false;
  } = {
    candidate_id: candidateId,
    batch_id: batchId,
    request_id: requestId,
    variation_index: variationIndex,
    destination: destination.value,
    route,
    provider,
    model,
    asset_ids: assetIds.map((id) => id.trim()),
    status,
    accepted: false
  };
  if (isNonBlankString(value["generation_id"])) {
    candidate.generation_id = value["generation_id"].trim();
  }
  return { ok: true, value: candidate };
}

function candidatesOf(value: unknown):
  | { readonly ok: true; readonly value: VideoProductionCandidate[] }
  | ParseFailure {
  if (!Array.isArray(value) || value.length === 0) {
    return error("candidates_required", "candidates must be a non-empty array.");
  }
  const candidates: VideoProductionCandidate[] = [];
  for (const raw of value) {
    const candidate = candidateOf(raw);
    if (!candidate.ok) return candidate;
    candidates.push(candidate.value);
  }
  return { ok: true, value: candidates };
}

/** Validate an explicit one-candidate-per-slot acceptance map. */
export function validateVideoProductionAcceptance(
  candidates: readonly VideoProductionCandidate[],
  selectedCandidateIds: readonly string[],
  expectedTargetRevision?: string
): VideoProductionAcceptance {
  if (selectedCandidateIds.length === 0) {
    return error("candidate_selection_required", "candidate_ids must not be empty.");
  }
  const byId = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));
  const selected: VideoProductionCandidate[] = [];
  const slots = new Set<string>();
  for (const id of selectedCandidateIds) {
    const candidate = byId.get(id);
    if (!candidate) {
      return error("candidate_not_found", `Candidate ${id} was not included in candidates.`);
    }
    if (candidate.status !== "ready" || candidate.asset_ids.length === 0) {
      return error(
        "candidate_not_ready",
        `Candidate ${id} is not ready with a persisted asset. Inspect it before acceptance.`
      );
    }
    const slot = `${candidate.destination.target_type}:${candidate.destination.target_id}`;
    if (slots.has(slot)) {
      return error(
        "multiple_candidates_for_slot",
        `Only one candidate may be accepted for destination slot ${slot}.`
      );
    }
    slots.add(slot);
    if (
      expectedTargetRevision !== undefined &&
      candidate.destination.target_revision !== expectedTargetRevision
    ) {
      return error(
        "target_revision_conflict",
        `Candidate ${id} was prepared for target revision ${candidate.destination.target_revision ?? "none"}, not ${expectedTargetRevision}.`
      );
    }
    selected.push(candidate);
  }
  return { ok: true, candidates: selected };
}

const prepareVideoProductionCapability: CapabilityExport = {
  spec: prepareVideoProductionSpec,
  impl: async (_run, params) => {
    const prepared = prepareVideoProduction(params);
    return "schema_version" in prepared
      ? { ok: true, prepared, accepted_candidate_ids: [] }
      : { error: prepared.message, code: prepared.code, field: prepared.field };
  }
};

const submitVideoProductionCapability: CapabilityExport = {
  spec: submitVideoProductionSpec,
  impl: async (run, params) => {
    const prepared = preparedOf(params["prepared"]);
    if (!prepared.ok) {
      return {
        error: prepared.error.message,
        code: prepared.error.code,
        field: prepared.error.field
      };
    }
    return submitPrepared(run, prepared.prepared);
  }
};

const inspectVideoProductionCandidatesCapability: CapabilityExport = {
  spec: inspectVideoProductionCandidatesSpec,
  impl: async (run, params) => {
    const parsed = candidatesOf(params["candidates"]);
    if (!parsed.ok) {
      return { error: parsed.error.message, code: parsed.error.code };
    }
    const refreshed = await Promise.all(
      parsed.value.map(async (candidate) => {
        if (!candidate.generation_id || !run.context.userId) return candidate;
        try {
          const row = await Prediction.findForUser(
            run.context.userId,
            candidate.generation_id
          );
          if (!row) return { ...candidate, status: "unknown" as const };
          const assetIds = Array.isArray(row.asset_ids)
            ? row.asset_ids.filter(isNonBlankString)
            : candidate.asset_ids;
          const status = publicGenerationStatus(row);
          return {
            ...candidate,
            asset_ids: assetIds,
            status:
              status === "completed"
                ? assetIds.length > 0
                  ? ("ready" as const)
                  : ("completed_without_asset" as const)
                : status === "running" || status === "pending"
                  ? ("running" as const)
                  : status === "failed" || status === "cancelled"
                    ? ("failed" as const)
                    : ("unknown" as const)
          };
        } catch {
          return candidate;
        }
      })
    );
    return {
      ok: true,
      candidates: refreshed.sort((left, right) => left.variation_index - right.variation_index),
      accepted_candidate_ids: []
    };
  }
};

const acceptVideoProductionCandidatesCapability: CapabilityExport = {
  spec: acceptVideoProductionCandidatesSpec,
  impl: async (_run, params) => {
    const parsed = candidatesOf(params["candidates"]);
    if (!parsed.ok) {
      return { error: parsed.error.message, code: parsed.error.code };
    }
    const rawIds = params["candidate_ids"];
    if (!Array.isArray(rawIds) || !rawIds.every(isNonBlankString)) {
      return {
        error: "candidate_ids must be a non-empty array of candidate ids.",
        code: "candidate_selection_invalid"
      };
    }
    const selection = validateVideoProductionAcceptance(
      parsed.value,
      rawIds.map((id) => id.trim()),
      nonBlankField(params, "expected_target_revision")
    );
    if (!selection.ok) {
      return {
        error: selection.error.message,
        code: selection.error.code,
        field: selection.error.field
      };
    }
    return {
      ok: true,
      validated: true,
      applied: false,
      accepted: false,
      candidate_ids: selection.candidates.map((candidate) => candidate.candidate_id),
      acceptance_request: selection.candidates,
      note:
        "The selection is valid, but no destination-specific acceptance adapter is wired in this capability package. No document or active media was changed."
    };
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
