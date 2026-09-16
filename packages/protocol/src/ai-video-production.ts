import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);
const identifier = nonEmptyText;

export const AI_VIDEO_PRODUCTION_SCHEMA_VERSION = 1 as const;

const referenceBindingSchema = z.object({
  kind: z.enum(["product", "character", "location", "style"]),
  assetId: identifier,
  entityId: identifier.optional()
});

/** Optional document-level creative context for AI video production. */
export const aiVideoCreativeContextSchema = z
  .object({
    schemaVersion: z
      .literal(AI_VIDEO_PRODUCTION_SCHEMA_VERSION)
      .default(AI_VIDEO_PRODUCTION_SCHEMA_VERSION),
    productName: nonEmptyText.optional(),
    productDescription: nonEmptyText.optional(),
    audience: nonEmptyText.optional(),
    objective: nonEmptyText.optional(),
    tone: nonEmptyText.optional(),
    approvedClaims: z.array(nonEmptyText).max(64).optional(),
    prohibitedClaims: z.array(nonEmptyText).max(64).optional(),
    referenceBindings: z.array(referenceBindingSchema).max(32).optional()
  })
  .passthrough();
export type AiVideoCreativeContext = z.infer<
  typeof aiVideoCreativeContextSchema
>;

const speechBindingSchema = z
  .object({
    scriptLineId: identifier.optional(),
    speakerId: identifier.optional(),
    text: nonEmptyText.optional(),
    direction: nonEmptyText.optional(),
    audioAssetId: identifier.optional(),
    voiceId: identifier.optional()
  })
  .passthrough()
  .superRefine((binding, context) => {
    if (
      binding.scriptLineId === undefined &&
      binding.text === undefined &&
      binding.audioAssetId === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "A speech binding needs scriptLineId, text, or audioAssetId."
      });
    }
  });

/** Optional per-beat or per-shot production intent. */
export const aiVideoProductionRequirementSchema = z
  .object({
    schemaVersion: z
      .literal(AI_VIDEO_PRODUCTION_SCHEMA_VERSION)
      .default(AI_VIDEO_PRODUCTION_SCHEMA_VERSION),
    editorialPurpose: z
      .enum(["hook", "problem", "demonstration", "proof", "cta", "story"])
      .optional(),
    visualTreatment: z
      .enum([
        "actor_to_camera",
        "product_close_up",
        "lifestyle_b_roll",
        "generated_scene"
      ])
      .optional(),
    speechMode: z.enum(["none", "off_camera", "on_camera"]).default("none"),
    speechBinding: speechBindingSchema.optional(),
    referenceBindings: z.array(referenceBindingSchema).max(32).optional(),
    durationMs: z.number().int().positive().optional(),
    speechDurationMs: z.number().int().positive().optional(),
    localDirection: nonEmptyText.optional(),
    requestedTakeCount: z.number().int().min(1).max(3).default(1)
  })
  .passthrough()
  .superRefine((requirement, context) => {
    if (requirement.speechMode === "none" && requirement.speechBinding) {
      context.addIssue({
        code: "custom",
        path: ["speechBinding"],
        message: "speechBinding requires a speech mode."
      });
    }
    if (requirement.speechMode !== "none" && !requirement.speechBinding) {
      context.addIssue({
        code: "custom",
        path: ["speechBinding"],
        message: "A speech mode requires speechBinding."
      });
    }
  });
export type AiVideoProductionRequirement = z.infer<
  typeof aiVideoProductionRequirementSchema
>;

const destinationKindSchema = z.enum([
  "timeline_clip",
  "storyboard_shot",
  "script_line"
]);

export const aiVideoCandidateVariationIdentitySchema = z.object({
  batchId: identifier,
  documentId: identifier,
  destinationKind: destinationKindSchema,
  destinationId: identifier,
  variationIndex: z.number().int().min(1).max(3),
  variationId: identifier,
  candidateId: identifier
}).superRefine((identity, context) => {
  const variationId = [
    "variation",
    identity.batchId,
    identity.destinationKind,
    identity.destinationId,
    identity.variationIndex
  ].join(":");
  if (identity.variationId !== variationId) {
    context.addIssue({
      code: "custom",
      path: ["variationId"],
      message: "variationId must be derived from the destination and index."
    });
  }
  if (identity.candidateId !== `candidate:${variationId}`) {
    context.addIssue({
      code: "custom",
      path: ["candidateId"],
      message: "candidateId must be derived from variationId."
    });
  }
});
export type AiVideoCandidateVariationIdentity = z.infer<
  typeof aiVideoCandidateVariationIdentitySchema
>;

export interface AiVideoCandidateVariationInput {
  readonly batchId: string;
  readonly documentId: string;
  readonly destinationKind: AiVideoCandidateVariationIdentity["destinationKind"];
  readonly destinationId: string;
  readonly variationIndex: number;
}

/** Create IDs before dispatch. Completion order and provider IDs are excluded. */
export function createAiVideoCandidateVariation(
  input: AiVideoCandidateVariationInput
): AiVideoCandidateVariationIdentity {
  const batchId = input.batchId.trim();
  const documentId = input.documentId.trim();
  const destinationId = input.destinationId.trim();
  if (!batchId || !documentId || !destinationId) {
    throw new Error("batchId, documentId, and destinationId must be non-empty.");
  }
  const variationId = [
    "variation",
    batchId,
    input.destinationKind,
    destinationId,
    input.variationIndex
  ].join(":");
  return aiVideoCandidateVariationIdentitySchema.parse({
    ...input,
    batchId,
    documentId,
    destinationId,
    variationId,
    candidateId: `candidate:${variationId}`
  });
}

export const aiVideoCandidateSchema = z.object({
  candidateId: identifier,
  batchId: identifier,
  documentId: identifier,
  destinationKind: destinationKindSchema,
  destinationId: identifier,
  targetVersion: z.number().int().nonnegative(),
  variationId: identifier,
  variationIndex: z.number().int().min(1).max(3),
  status: z.enum(["pending", "ready", "failed", "cancelled"]),
  assetId: identifier.optional(),
  active: z.boolean(),
  accepted: z.boolean()
}).superRefine((candidate, context) => {
  if (candidate.status === "ready" && !candidate.assetId) {
    context.addIssue({
      code: "custom",
      path: ["assetId"],
      message: "A ready candidate needs assetId."
    });
  }
  if (candidate.accepted && !candidate.active) {
    context.addIssue({
      code: "custom",
      path: ["active"],
      message: "An accepted candidate must be active."
    });
  }
});
export type AiVideoCandidate = z.infer<typeof aiVideoCandidateSchema>;

/** Land a completed result without changing the active or accepted document state. */
export function landAiVideoCandidateInactive(
  candidate: unknown,
  assetId: string
): AiVideoCandidate {
  const parsed = aiVideoCandidateSchema.parse(candidate);
  return aiVideoCandidateSchema.parse({
    ...parsed,
    status: "ready",
    assetId,
    active: false,
    accepted: false
  });
}

export interface AiVideoPreviewSelection {
  readonly batchId: string;
  readonly documentId: string;
  readonly selections: Readonly<Record<string, string>>;
  readonly unresolvedDestinationIds: readonly string[];
}

/** Purely construct a preview map. It does not activate or accept candidates. */
export function selectAiVideoPreview(
  candidates: readonly AiVideoCandidate[],
  selection: Readonly<Record<string, string>>,
  expected: Pick<AiVideoCandidate, "batchId" | "documentId">
): AiVideoPreviewSelection {
  const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const unresolved = new Set(candidates.map((candidate) => candidate.destinationId));
  for (const [destinationId, candidateId] of Object.entries(selection)) {
    const candidate = byId.get(candidateId);
    if (
      !candidate ||
      candidate.batchId !== expected.batchId ||
      candidate.documentId !== expected.documentId ||
      candidate.destinationId !== destinationId
    ) {
      throw new Error(`Invalid preview candidate for destination ${destinationId}.`);
    }
    unresolved.delete(destinationId);
  }
  return {
    batchId: expected.batchId,
    documentId: expected.documentId,
    selections: { ...selection },
    unresolvedDestinationIds: [...unresolved]
  };
}

export interface AiVideoAcceptanceTarget {
  readonly destinationId: string;
  readonly targetVersion: number;
  readonly acceptedCandidateId?: string;
}

export type AiVideoAcceptanceValidation =
  | { readonly valid: true; readonly candidates: readonly AiVideoCandidate[] }
  | { readonly valid: false; readonly issues: readonly string[] };

/** Validate every selected candidate before a caller performs one document mutation. */
export function validateAiVideoAcceptance(input: {
  readonly candidates: readonly AiVideoCandidate[];
  readonly targets: readonly AiVideoAcceptanceTarget[];
  readonly selection: Readonly<Record<string, string>>;
  readonly batchId: string;
  readonly documentId: string;
}): AiVideoAcceptanceValidation {
  const byId = new Map(input.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const issues: string[] = [];
  const selected: AiVideoCandidate[] = [];
  for (const target of input.targets) {
    const candidateId = input.selection[target.destinationId];
    if (!candidateId) {
      issues.push(`${target.destinationId}: no candidate selected`);
      continue;
    }
    const candidate = byId.get(candidateId);
    if (!candidate) {
      issues.push(`${target.destinationId}: candidate is missing`);
      continue;
    }
    if (candidate.batchId !== input.batchId || candidate.documentId !== input.documentId) {
      issues.push(`${target.destinationId}: candidate belongs to another production`);
    }
    if (candidate.destinationId !== target.destinationId) {
      issues.push(`${target.destinationId}: candidate targets another destination`);
    }
    if (candidate.status !== "ready" || !candidate.assetId) {
      issues.push(`${target.destinationId}: candidate is not ready`);
    }
    if (candidate.active || candidate.accepted || target.acceptedCandidateId) {
      issues.push(`${target.destinationId}: target already has accepted media`);
    }
    if (candidate.targetVersion !== target.targetVersion) {
      issues.push(`${target.destinationId}: target changed since generation`);
    }
    selected.push(candidate);
  }
  return issues.length > 0
    ? { valid: false, issues }
    : { valid: true, candidates: selected };
}
