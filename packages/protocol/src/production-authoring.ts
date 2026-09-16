import { z } from "zod";

/** Version for the optional production authoring fields. */
export const PRODUCTION_AUTHORING_SCHEMA_VERSION = 1 as const;

/** Version for the immutable inputs captured before a generation dispatch. */
export const PRODUCTION_SNAPSHOT_SCHEMA_VERSION = 1 as const;

const identifier = z.string().trim().min(1);
const nonEmptyText = z.string().trim().min(1);

export const productionReferenceKind = z.enum([
  "product",
  "character",
  "location",
  "style"
]);
export type ProductionReferenceKind = z.infer<typeof productionReferenceKind>;

/** An authorized asset binding used by a production plan. */
export const productionReferenceBinding = z
  .object({
    kind: productionReferenceKind,
    asset_id: identifier,
    entity_id: identifier.optional(),
    label: nonEmptyText.optional()
  })
  .passthrough();
export type ProductionReferenceBinding = z.infer<
  typeof productionReferenceBinding
>;

/** An explicit media reference and the revision used to direct a take. */
export const productionReference = z
  .object({
    uri: nonEmptyText,
    name: nonEmptyText.optional(),
    revision: nonEmptyText.optional()
  })
  .passthrough();
export type ProductionReference = z.infer<typeof productionReference>;

/** Creative context shared by the existing Video, Storyboard, and Script documents. */
export const creativeContext = z
  .object({
    schema_version: z
      .literal(PRODUCTION_AUTHORING_SCHEMA_VERSION)
      .default(PRODUCTION_AUTHORING_SCHEMA_VERSION),
    product_name: nonEmptyText.optional(),
    product_description: nonEmptyText.optional(),
    audience: nonEmptyText.optional(),
    objective: nonEmptyText.optional(),
    tone: nonEmptyText.optional(),
    approved_claims: z.array(nonEmptyText).max(64).optional(),
    prohibited_claims: z.array(nonEmptyText).max(64).optional(),
    reference_bindings: z.array(productionReferenceBinding).max(32).optional()
  })
  .passthrough();
export type CreativeContext = z.infer<typeof creativeContext>;

export const productionEditorialPurpose = z.enum([
  "hook",
  "problem",
  "demonstration",
  "proof",
  "cta",
  "story"
]);
export type ProductionEditorialPurpose = z.infer<
  typeof productionEditorialPurpose
>;

export const productionVisualTreatment = z.enum([
  "actor_to_camera",
  "product_close_up",
  "lifestyle_b_roll",
  "generated_scene"
]);
export type ProductionVisualTreatment = z.infer<
  typeof productionVisualTreatment
>;

export const productionSpeechMode = z.enum([
  "none",
  "off_camera",
  "on_camera"
]);
export type ProductionSpeechMode = z.infer<typeof productionSpeechMode>;

/** Local or linked speech context. The Script still owns linked line text. */
export const productionSpeechBinding = z
  .object({
    script_line_id: identifier.optional(),
    speaker_id: identifier.optional(),
    text: nonEmptyText.optional(),
    direction: nonEmptyText.optional(),
    audio_asset_id: identifier.optional(),
    voice: z
      .object({
        provider: identifier,
        model: identifier,
        voice: identifier,
        settings: z.record(z.string(), z.unknown()).optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough()
  .superRefine((binding, context) => {
    if (
      binding.script_line_id === undefined &&
      binding.text === undefined &&
      binding.audio_asset_id === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Speech binding needs script_line_id, text, or audio_asset_id."
      });
    }
  });
export type ProductionSpeechBinding = z.infer<typeof productionSpeechBinding>;

/** Editable production intent attached to one timeline beat or storyboard shot. */
export const productionRequirement = z
  .object({
    schema_version: z
      .literal(PRODUCTION_AUTHORING_SCHEMA_VERSION)
      .default(PRODUCTION_AUTHORING_SCHEMA_VERSION),
    editorial_purpose: productionEditorialPurpose.optional(),
    visual_treatment: productionVisualTreatment.optional(),
    speech_mode: productionSpeechMode.default("none"),
    speech_binding: productionSpeechBinding.optional(),
    reference_bindings: z.array(productionReferenceBinding).max(32).optional(),
    references: z.array(productionReference).max(32).optional(),
    duration_ms: z.number().int().positive().optional(),
    speech_duration_ms: z.number().int().positive().optional(),
    local_direction: nonEmptyText.optional(),
    requested_take_count: z.number().int().min(1).max(3).default(1)
  })
  .passthrough()
  .superRefine((requirement, context) => {
    if (
      requirement.speech_mode === "none" &&
      requirement.speech_binding !== undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["speech_binding"],
        message: "speech_binding is only valid when speech_mode is enabled."
      });
    }
    if (
      requirement.speech_mode !== "none" &&
      requirement.speech_binding === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["speech_binding"],
        message: "Speech modes other than none need speech_binding."
      });
    }
  });
export type ProductionRequirement = z.infer<typeof productionRequirement>;

export const productionDestinationKind = z.enum([
  "timeline_clip",
  "storyboard_shot",
  "script_line"
]);
export type ProductionDestinationKind = z.infer<
  typeof productionDestinationKind
>;

export const productionOperation = z.enum([
  "initial_generation",
  "new_take",
  "change_line_delivery",
  "edit_video"
]);
export type ProductionOperation = z.infer<typeof productionOperation>;

/** Frozen inputs for one candidate, captured before provider dispatch. */
export const productionGenerationSnapshot = z
  .object({
    schemaVersion: z
      .literal(PRODUCTION_SNAPSHOT_SCHEMA_VERSION)
      .default(PRODUCTION_SNAPSHOT_SCHEMA_VERSION),
    batchId: identifier,
    requestId: identifier,
    candidateId: identifier,
    variationId: identifier,
    variationIndex: z.number().int().min(1).max(3),
    destinationKind: productionDestinationKind,
    destinationId: identifier,
    operation: productionOperation,
    authoringFingerprint: identifier.optional(),
    entityIds: z.array(identifier).optional(),
    referenceAssetIds: z.array(identifier).optional(),
    prompt: nonEmptyText.optional(),
    speech: z
      .object({
        text: nonEmptyText.optional(),
        direction: nonEmptyText.optional(),
        voice: z.record(z.string(), z.unknown()).optional(),
        audioAssetId: identifier.optional()
      })
      .passthrough()
      .optional(),
    provider: identifier.optional(),
    model: identifier.optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
    outputFormat: z.string().trim().min(1).optional(),
    requestedDurationMs: z.number().int().positive().optional(),
    parentTakeId: identifier.optional(),
    sourceContext: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();
export type ProductionGenerationSnapshot = z.infer<
  typeof productionGenerationSnapshot
>;

export const productionCandidateStatus = z.enum([
  "planned",
  "queued",
  "generating",
  "ready",
  "failed",
  "cancelled"
]);
export type ProductionCandidateStatus = z.infer<
  typeof productionCandidateStatus
>;

export const productionVariationIdentitySchema = z
  .object({
    batchId: identifier,
    destinationKind: productionDestinationKind,
    destinationId: identifier,
    variationIndex: z.number().int().min(1).max(3),
    variationId: identifier,
    candidateId: identifier,
    requestId: identifier
  })
  .superRefine((identity, context) => {
    const expectedVariationId = [
      "variation",
      identity.batchId,
      identity.destinationKind,
      identity.destinationId,
      identity.variationIndex
    ].join(":");
    if (identity.variationId !== expectedVariationId) {
      context.addIssue({
        code: "custom",
        path: ["variationId"],
        message: "variationId must be derived from the variation identity."
      });
    }
    if (identity.candidateId !== `candidate:${expectedVariationId}`) {
      context.addIssue({
        code: "custom",
        path: ["candidateId"],
        message: "candidateId must be derived from variationId."
      });
    }
    if (identity.requestId !== `request:${identity.candidateId}`) {
      context.addIssue({
        code: "custom",
        path: ["requestId"],
        message: "requestId must be derived from candidateId."
      });
    }
  });
export type ProductionVariationIdentity = z.infer<
  typeof productionVariationIdentitySchema
>;

export interface ProductionVariationIdentityInput {
  readonly batchId: string;
  readonly destinationKind: ProductionDestinationKind;
  readonly destinationId: string;
  readonly variationIndex: number;
}

/**
 * Build deterministic identities before provider dispatch. Provider task ids
 * are deliberately not part of this identity because they can change during
 * retries or recovery.
 */
export function productionVariationIdentity(
  input: ProductionVariationIdentityInput
): ProductionVariationIdentity {
  const batchId = input.batchId.trim();
  const destinationId = input.destinationId.trim();
  if (!batchId || !destinationId) {
    throw new Error("batchId and destinationId must be non-empty.");
  }
  if (!Number.isInteger(input.variationIndex) || input.variationIndex < 1) {
    throw new Error("variationIndex must be a positive integer.");
  }
  const variationId = [
    "variation",
    batchId,
    input.destinationKind,
    destinationId,
    input.variationIndex
  ].join(":");
  const candidateId = `candidate:${variationId}`;
  return productionVariationIdentitySchema.parse({
    batchId,
    destinationKind: input.destinationKind,
    destinationId,
    variationIndex: input.variationIndex,
    variationId,
    candidateId,
    requestId: `request:${candidateId}`
  });
}

const candidateTransitions: Readonly<
  Record<ProductionCandidateStatus, readonly ProductionCandidateStatus[]>
> = {
  planned: ["queued", "cancelled"],
  queued: ["generating", "cancelled"],
  generating: ["ready", "failed", "cancelled"],
  ready: [],
  failed: [],
  cancelled: []
};

/** Whether a candidate may move from one lifecycle state to another. */
export function canTransitionProductionCandidate(
  from: ProductionCandidateStatus,
  to: ProductionCandidateStatus
): boolean {
  return candidateTransitions[from].includes(to);
}

/** Whether a candidate has reached a state that cannot be advanced. */
export function isTerminalProductionCandidateStatus(
  status: ProductionCandidateStatus
): boolean {
  return candidateTransitions[status].length === 0;
}

/** Apply a valid lifecycle transition to an already validated candidate. */
export function transitionProductionCandidate(
  candidate: ProductionCandidate,
  status: ProductionCandidateStatus
): ProductionCandidate {
  if (!canTransitionProductionCandidate(candidate.status, status)) {
    throw new Error(
      `Cannot transition candidate ${candidate.candidateId} from ${candidate.status} to ${status}.`
    );
  }
  return productionCandidate.parse({ ...candidate, status });
}

/** Optional shared context and per-beat/per-shot authoring contracts. */
export const production = productionRequirement;
export const creativeContextSchema = creativeContext;
export const productionSchema = productionRequirement;

/** Transport record for a candidate before or after it becomes a timeline take. */
export const productionCandidate = z
  .object({
    candidateId: identifier,
    batchId: identifier,
    requestId: identifier,
    variationId: identifier,
    variationIndex: z.number().int().min(1).max(3),
    destinationKind: productionDestinationKind,
    destinationId: identifier,
    status: productionCandidateStatus,
    assetId: identifier.optional(),
    takeId: identifier.optional(),
    error: nonEmptyText.optional(),
    snapshot: productionGenerationSnapshot
  })
  .passthrough()
  .superRefine((candidate, context) => {
    if (candidate.snapshot.candidateId !== candidate.candidateId) {
      context.addIssue({
        code: "custom",
        path: ["snapshot", "candidateId"],
        message: "Candidate and snapshot ids must match."
      });
    }
    if (candidate.status === "ready" && candidate.assetId === undefined) {
      context.addIssue({
        code: "custom",
        path: ["assetId"],
        message: "A ready candidate needs assetId."
      });
    }
  });
export type ProductionCandidate = z.infer<typeof productionCandidate>;
