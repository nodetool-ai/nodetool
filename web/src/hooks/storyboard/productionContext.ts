/** Shared authoring readers for the protocol-owned production contract. */

import type {
  CreativeContext as ProtocolCreativeContext,
  ProductionEditorialPurpose,
  ProductionReference as ProtocolProductionReference,
  ProductionReferenceBinding as ProtocolProductionReferenceBinding,
  ProductionRequirement as ProtocolProductionRequirement,
  ProductionSpeechMode,
  ProductionVisualTreatment
} from "@nodetool-ai/protocol";

export const CREATIVE_CONTEXT_SCHEMA_VERSION = 1;

export type EditorialPurpose = ProductionEditorialPurpose;
export type VisualTreatment = ProductionVisualTreatment;
export type SpeechMode = ProductionSpeechMode;
export type CreativeContext = ProtocolCreativeContext;
export type ProductionReferenceBinding = ProtocolProductionReferenceBinding;
export type ProductionRequirements = ProtocolProductionRequirement;
export type ProductionReference = ProtocolProductionReference;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const positiveInteger = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;

const stringList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result = value.filter((item): item is string => typeof item === "string");
  return result.length > 0 ? result : undefined;
};

const editorialPurposes: readonly EditorialPurpose[] = [
  "hook",
  "problem",
  "demonstration",
  "proof",
  "cta",
  "story"
];
const visualTreatments: readonly VisualTreatment[] = [
  "actor_to_camera",
  "product_close_up",
  "lifestyle_b_roll",
  "generated_scene"
];
const speechModes: readonly SpeechMode[] = ["none", "off_camera", "on_camera"];

const isOneOf = <T extends string>(
  value: unknown,
  values: readonly T[]
): value is T => typeof value === "string" && values.some((item) => item === value);

export function readCreativeContext(value: unknown): CreativeContext | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const context: CreativeContext = {
    schema_version: 1,
    product_name: optionalString(value.product_name ?? value.productName),
    product_description: optionalString(
      value.product_description ?? value.productDescription
    ),
    audience: optionalString(value.audience),
    objective: optionalString(value.objective),
    tone: optionalString(value.tone),
    approved_claims: stringList(value.approved_claims ?? value.approvedClaims),
    prohibited_claims: stringList(
      value.prohibited_claims ?? value.prohibitedClaims
    ),
    reference_bindings: referenceBindings(
      value.reference_bindings ?? value.referenceBindings
    )
  };
  const hasValue = Object.values(context).some((item) => item !== undefined);
  return hasValue ? context : undefined;
}

export function creativeContextFrom(value: unknown): CreativeContext | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return readCreativeContext(value.creative_context ?? value.creativeContext);
}

const referenceBindings = (value: unknown): ProductionReferenceBinding[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result = value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const kind = item.kind;
    const assetId = item.asset_id ?? item.assetId;
    if (!isOneOf(kind, ["product", "character", "location", "style"] as const) || typeof assetId !== "string") {
      return [];
    }
    const binding: ProductionReferenceBinding = {
      kind,
      asset_id: assetId
    };
    if (typeof item.entity_id === "string") {
      binding.entity_id = item.entity_id;
    }
    if (typeof item.label === "string") {
      binding.label = item.label;
    }
    return [binding];
  });
  return result.length > 0 ? result : undefined;
};

const references = (value: unknown): ProductionReference[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result = value.flatMap((item) => {
    if (!isRecord(item) || typeof item.uri !== "string" || item.uri.trim() === "") {
      return [];
    }
    const reference: ProductionReference = { uri: item.uri };
    if (typeof item.name === "string") {
      reference.name = item.name;
    }
    if (typeof item.revision === "string") {
      reference.revision = item.revision;
    }
    return [reference];
  });
  return result.length > 0 ? result : undefined;
};

export function readProductionRequirements(
  value: unknown
): ProductionRequirements | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const editorialPurpose = value.editorial_purpose ?? value.editorialPurpose;
  const visualTreatment = value.visual_treatment ?? value.visualTreatment;
  const speechMode = value.speech_mode ?? value.speechMode;
  const requestedTakeCount =
    value.requested_take_count ?? value.requestedTakeCount;
  const speechBinding = isRecord(value.speech_binding)
    ? { ...value.speech_binding }
    : isRecord(value.speechBinding)
      ? { ...value.speechBinding }
      : undefined;
  const production: ProductionRequirements = {
    schema_version: 1,
    editorial_purpose: isOneOf(
      editorialPurpose,
      editorialPurposes
    ) ? editorialPurpose : undefined,
    visual_treatment: isOneOf(
      visualTreatment,
      visualTreatments
    ) ? visualTreatment : undefined,
    speech_mode: isOneOf(speechMode, speechModes) ? speechMode : "none",
    reference_bindings: referenceBindings(
      value.reference_bindings ?? value.referenceBindings
    ),
    references: references(value.references),
    duration_ms: positiveInteger(value.duration_ms ?? value.durationMs),
    speech_duration_ms: positiveInteger(
      value.speech_duration_ms ?? value.speechDurationMs
    ),
    local_direction: optionalString(value.local_direction ?? value.direction),
    requested_take_count:
      requestedTakeCount === 2 || requestedTakeCount === 3
        ? requestedTakeCount
        : 1
  };
  if (speechBinding) {
    production.speech_binding = speechBinding;
  }
  const hasValue = Object.values(production).some((item) => item !== undefined);
  return hasValue ? production : undefined;
}

export function productionRequirementsFrom(
  value: unknown
): ProductionRequirements | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return readProductionRequirements(value.production);
}

/** Canonicalize object keys while preserving array order and values. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

/**
 * A synchronous, versioned fingerprint suitable for persisted document state.
 * FNV-1a is used here because the flow must calculate it during render without
 * an async Web Crypto boundary. The canonical input makes object key order
 * irrelevant, and the schema version makes future changes explicit.
 */
export function deterministicFingerprint(value: unknown): string {
  const source = JSON.stringify(canonicalize(value));
  let hash = 14695981039346656037n;
  for (const character of source) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `v${CREATIVE_CONTEXT_SCHEMA_VERSION}:${hash.toString(16).padStart(16, "0")}`;
}

export default deterministicFingerprint;
