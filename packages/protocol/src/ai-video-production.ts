import { z } from "zod";
import { isBoolean, isNumber, isRecord, isString } from "./predicates.js";
import {
  PRODUCTION_AUTHORING_SCHEMA_VERSION,
  creativeContext,
  productionRequirement,
  productionCandidate,
  productionVariationIdentity,
  productionVariationIdentitySchema,
  landProductionCandidateInactive,
  selectProductionPreview,
  validateProductionAcceptance,
  type ProductionAcceptanceTarget,
  type ProductionAcceptanceValidation,
  type ProductionPreviewSelection,
  type ProductionVariationIdentityInput
} from "./production-authoring.js";

// Compatibility boundaries for the original camelCase AI-video API. Parsed
// values always use production-authoring's canonical fields and lifecycle.
export const AI_VIDEO_PRODUCTION_SCHEMA_VERSION =
  PRODUCTION_AUTHORING_SCHEMA_VERSION;

type LegacyRecord = { [key: string]: LegacyPreprocessValue };
type LegacyPreprocessValue =
  | LegacyRecord
  | LegacyPreprocessValue[]
  | string
  | number
  | boolean
  | null
  | undefined;

function isLegacyRecord(value: LegacyPreprocessValue): value is LegacyRecord {
  return isRecord(value);
}

/** Decode values from the JSON-compatible legacy API before rewriting keys. */
function parseLegacyInput(input: unknown): LegacyPreprocessValue {
  if (input === null || input === undefined) {
    return input;
  }
  if (isRecord(input)) {
    const output: LegacyRecord = {};
    for (const [key, child] of Object.entries(input)) {
      output[key] = parseLegacyInput(child);
    }
    return output;
  }
  if (Array.isArray(input)) {
    return input.map((child) => parseLegacyInput(child));
  }
  if (isString(input) || isNumber(input) || isBoolean(input)) {
    return input;
  }
  return undefined;
}

function aliases(
  value: LegacyPreprocessValue,
  keys: Readonly<Record<string, string>>
): LegacyPreprocessValue {
  if (!isLegacyRecord(value)) {
    return value;
  }
  const output: LegacyRecord = {};
  for (const [key, child] of Object.entries(value)) {
    const canonical = keys[key] ?? key;
    if (canonical === key || !Object.hasOwn(value, canonical)) {
      output[canonical] = child;
    }
  }
  return output;
}

function referenceBindings(value: LegacyPreprocessValue): LegacyPreprocessValue {
  return Array.isArray(value)
    ? value.map((binding) =>
        aliases(binding, { assetId: "asset_id", entityId: "entity_id" })
      )
    : value;
}

export const aiVideoCreativeContextSchema = z.preprocess((input) => {
  const value = aliases(parseLegacyInput(input), {
    schemaVersion: "schema_version",
    productName: "product_name",
    productDescription: "product_description",
    approvedClaims: "approved_claims",
    prohibitedClaims: "prohibited_claims",
    referenceBindings: "reference_bindings"
  });
  if (!isRecord(value)) {
    return value;
  }
  if (Object.hasOwn(value, "reference_bindings")) {
    value.reference_bindings = referenceBindings(value.reference_bindings);
  }
  return value;
}, creativeContext);
export type AiVideoCreativeContext = z.infer<
  typeof aiVideoCreativeContextSchema
>;

export const aiVideoProductionRequirementSchema = z.preprocess((input) => {
  const value = aliases(parseLegacyInput(input), {
    schemaVersion: "schema_version",
    editorialPurpose: "editorial_purpose",
    visualTreatment: "visual_treatment",
    speechMode: "speech_mode",
    speechBinding: "speech_binding",
    referenceBindings: "reference_bindings",
    durationMs: "duration_ms",
    speechDurationMs: "speech_duration_ms",
    localDirection: "local_direction",
    requestedTakeCount: "requested_take_count"
  });
  if (!isRecord(value)) {
    return value;
  }
  if (Object.hasOwn(value, "reference_bindings")) {
    value.reference_bindings = referenceBindings(value.reference_bindings);
  }
  if (Object.hasOwn(value, "speech_binding")) {
    value.speech_binding = aliases(value.speech_binding, {
      scriptLineId: "script_line_id",
      speakerId: "speaker_id",
      audioAssetId: "audio_asset_id",
      voiceId: "voice_id"
    });
  }
  return value;
}, productionRequirement);
export type AiVideoProductionRequirement = z.infer<
  typeof aiVideoProductionRequirementSchema
>;

function legacyCandidateIdentity(input: unknown): LegacyPreprocessValue {
  const value = parseLegacyInput(input);
  if (!isLegacyRecord(value)) {
    return value;
  }
  const output: LegacyRecord = {
    ...value
  };
  if (output.requestId === undefined && isString(output.candidateId)) {
    output.requestId = `request:${output.candidateId}`;
  }
  return output;
}

export const aiVideoCandidateVariationIdentitySchema = z.preprocess(
  legacyCandidateIdentity,
  productionVariationIdentitySchema.safeExtend({
    documentId: z.string().trim().min(1)
  })
);
export type AiVideoCandidateVariationIdentity = z.infer<
  typeof aiVideoCandidateVariationIdentitySchema
>;
export interface AiVideoCandidateVariationInput extends ProductionVariationIdentityInput {
  readonly documentId: string;
}

export function createAiVideoCandidateVariation(
  input: AiVideoCandidateVariationInput
): AiVideoCandidateVariationIdentity {
  return aiVideoCandidateVariationIdentitySchema.parse({
    ...productionVariationIdentity(input),
    documentId: input.documentId
  });
}

/** Legacy pending means planned. No snapshot is invented for old candidates. */
export const aiVideoCandidateSchema = z.preprocess(
  (input) => {
    const value = legacyCandidateIdentity(input);
    return isRecord(value) && value.status === "pending"
      ? { ...value, status: "planned" }
      : value;
  },
  productionCandidate.safeExtend({
    documentId: z.string().trim().min(1),
    targetVersion: z.number().int().nonnegative()
  })
);
export type AiVideoCandidate = z.infer<typeof aiVideoCandidateSchema>;

export function landAiVideoCandidateInactive(
  candidate: unknown,
  assetId: string
): AiVideoCandidate {
  return aiVideoCandidateSchema.parse(
    landProductionCandidateInactive(
      aiVideoCandidateSchema.parse(candidate),
      assetId
    )
  );
}

export type AiVideoPreviewSelection = ProductionPreviewSelection;
export const selectAiVideoPreview = selectProductionPreview;
export type AiVideoAcceptanceTarget = ProductionAcceptanceTarget;
export type AiVideoAcceptanceValidation = ProductionAcceptanceValidation;
export const validateAiVideoAcceptance = validateProductionAcceptance;
