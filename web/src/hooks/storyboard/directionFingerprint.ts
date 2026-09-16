/**
 * What a Director run depends on, as one comparable string (PRD § 7.2, F15).
 *
 * The run records it on the board (`setupDirectedFrom`) and the genre step
 * compares it against the current inputs: equal means the screenplay already
 * answers them, so the step continues to it rather than paying for the same
 * answer twice. It lives beside the run rather than in the flow, because the
 * headless path runs the Director too and must record the same value.
 *
 * A missing or stale fingerprint only ever offers an explicit re-direct. It
 * can never cause a run the creator did not ask for. The value is a compact
 * versioned hash of canonical JSON, so adding a field cannot create ambiguous
 * delimiter collisions or depend on object key order.
 */

import {
  creativeContextFrom,
  deterministicFingerprint,
  productionRequirementsFrom,
  type CreativeContext,
  type ProductionRequirements
} from "./productionContext";

export interface DirectionInputs {
  brief: string;
  genre: string;
  shotCount: number;
  /** The model that writes it — a different writer is a different screenplay. */
  modelId: string;
  /** `fdx`, `text`, or `none`: an imported script is directed differently. */
  importKind: string;
  style?: string;
  aspectRatio?: string;
  entityIds?: readonly string[];
  referenceAssetIds?: readonly string[];
  creativeContext?: CreativeContext;
  production?: readonly ProductionRequirements[];
}

export function directionFingerprint(input: DirectionInputs): string {
  const hasExtendedInputs =
    (input.style ?? "").length > 0 ||
    (input.aspectRatio ?? "16:9") !== "16:9" ||
    (input.entityIds?.length ?? 0) > 0 ||
    (input.referenceAssetIds?.length ?? 0) > 0 ||
    input.creativeContext !== undefined ||
    (input.production?.length ?? 0) > 0;
  if (!hasExtendedInputs) {
    // Preserve fingerprints written by the original Storyboard flow for
    // documents that have none of the additive production inputs.
    return [
      input.brief.trim(),
      input.genre,
      String(input.shotCount),
      input.modelId,
      input.importKind
    ].join("␟");
  }
  return deterministicFingerprint({
    kind: "storyboard-direction",
    brief: input.brief.trim(),
    genre: input.genre,
    shotCount: input.shotCount,
    modelId: input.modelId,
    importKind: input.importKind,
    style: input.style ?? "",
    aspectRatio: input.aspectRatio ?? "",
    entityIds: input.entityIds ?? [],
    referenceAssetIds: input.referenceAssetIds ?? [],
    creativeContext: input.creativeContext,
    production: input.production ?? []
  });
}

/** Read optional authoring metadata from the passthrough screenplay shape. */
export function storyboardCreativeContextOf(
  screenplay: unknown
): CreativeContext | undefined {
  return creativeContextFrom(screenplay);
}

/** Read optional per-shot production direction without trusting unknown data. */
export function storyboardProductionOf(
  shots: readonly unknown[]
): ProductionRequirements[] {
  return shots
    .map((shot) => productionRequirementsFrom(shot))
    .filter((production): production is ProductionRequirements => production !== undefined);
}

/** Preserve the optional context on the passthrough screenplay envelope. */
export function screenplayWithCreativeContext<T extends object>(
  screenplay: T,
  creativeContext: CreativeContext | undefined
): T {
  if (!creativeContext) {
    return screenplay;
  }
  // The protocol screenplay schema is passthrough, but its shared TypeScript
  // interface predates this additive metadata field.
  return { ...screenplay, creative_context: creativeContext } as unknown as T;
}

export default directionFingerprint;
