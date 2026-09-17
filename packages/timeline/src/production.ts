import type {
  ProductionGenerationSnapshot,
  ProductionCandidateStatus,
  ProductionDestinationKind,
  ProductionOperation,
  ProductionReferenceBinding,
  ProductionRequirement
} from "@nodetool-ai/protocol";
import { productionVariationIdentity } from "@nodetool-ai/protocol";

import type { TimelineOpState } from "./ops/types.js";
import { activeTakeIdOf, selectTake } from "./takes.js";
import type { ClipVersion, TimelineClip } from "./types.js";

/** Stable identity assigned before a provider request is dispatched. */
export interface ProductionCandidateIdentity {
  readonly batchId: string;
  readonly requestId: string;
  readonly candidateId: string;
  readonly variationId: string;
  readonly variationIndex: number;
  readonly destinationId: string;
  readonly destinationKind: ProductionDestinationKind;
}

export type ProductionExecutionRoute =
  | "text_to_video"
  | "reference_to_video"
  | "audio_driven_performance";

export interface ProductionRouteSupport {
  readonly referenceToVideo: boolean;
  readonly audioDrivenPerformance: boolean;
}

export interface CompileProductionCandidatesInput {
  readonly batchId: string;
  readonly destinationId: string;
  readonly destinationKind: ProductionDestinationKind;
  readonly operation: ProductionOperation;
  readonly prompt: string;
  readonly requirement?: ProductionRequirement;
  readonly entityIds?: readonly string[];
  readonly referenceAssetIds?: readonly string[];
  readonly referenceBindings?: readonly ProductionReferenceBinding[];
  readonly provider?: string;
  readonly model?: string;
  readonly authoringFingerprint?: string;
  readonly requestedDurationMs?: number;
  readonly outputFormat?: string;
  readonly routeSupport: ProductionRouteSupport;
}

export interface CompiledProductionCandidate {
  readonly identity: ProductionCandidateIdentity;
  readonly snapshot: ProductionGenerationSnapshot;
  readonly executionRoute: ProductionExecutionRoute;
  readonly referenceAssetIds: readonly string[];
  readonly audioAssetId?: string;
}

function requiredId(value: string, name: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

/**
 * Derive all candidate identities from the stable batch, destination, and
 * requested variation number. Completion order cannot affect these values.
 */
export function productionCandidateIdentity(
  batchId: string,
  destinationId: string,
  variationIndex: number
): ProductionCandidateIdentity {
  return productionCandidateIdentityForDestination(
    batchId,
    "timeline_clip",
    destinationId,
    variationIndex
  );
}

/** Derive stable candidate identities for any production destination. */
export function productionCandidateIdentityForDestination(
  batchId: string,
  destinationKind: ProductionDestinationKind,
  destinationId: string,
  variationIndex: number
): ProductionCandidateIdentity {
  const identity = productionVariationIdentity({
    batchId: requiredId(batchId, "batchId"),
    destinationKind,
    destinationId: requiredId(destinationId, "destinationId"),
    variationIndex
  });
  return {
    ...identity
  };
}

const resolvedIds = (values: readonly (string | undefined)[]): string[] => [
  ...new Set(
    values.filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0
    )
  )
];

/**
 * Compile reviewed authoring requirements into immutable per-take requests.
 * Unsupported routes and timing mismatches fail before provider dispatch.
 */
export function compileProductionCandidates(
  input: CompileProductionCandidatesInput
): CompiledProductionCandidate[] {
  const requirement = input.requirement;
  const prompt = requiredId(
    [input.prompt, requirement?.local_direction]
      .filter((value): value is string => Boolean(value?.trim()))
      .join("\n\n"),
    "prompt"
  );
  const takeCount = requirement?.requested_take_count ?? 1;
  if (!Number.isInteger(takeCount) || takeCount < 1 || takeCount > 3) {
    throw new Error("Production take count must be between 1 and 3.");
  }

  const requestedDurationMs =
    requirement?.duration_ms ?? input.requestedDurationMs;
  const speechDurationMs = requirement?.speech_duration_ms;
  if (
    requestedDurationMs !== undefined &&
    speechDurationMs !== undefined &&
    speechDurationMs > requestedDurationMs
  ) {
    throw new Error(
      `Speech duration ${speechDurationMs}ms exceeds the ${requestedDurationMs}ms production slot.`
    );
  }

  const referenceBindings = [
    ...(input.referenceBindings ?? []),
    ...(requirement?.reference_bindings ?? [])
  ];
  const referenceAssetIds = resolvedIds([
    ...(input.referenceAssetIds ?? []),
    ...referenceBindings.map((binding) => binding.asset_id)
  ]);
  const speechBinding = requirement?.speech_binding;
  const audioAssetId = speechBinding?.audio_asset_id;
  let executionRoute: ProductionExecutionRoute =
    referenceAssetIds.length > 0 ? "reference_to_video" : "text_to_video";

  if (requirement?.speech_mode === "on_camera") {
    if (!audioAssetId) {
      throw new Error(
        "On-camera performance requires recorded speech audio before video generation."
      );
    }
    if (
      !referenceBindings.some(
        (binding) => binding.kind === "character"
      )
    ) {
      throw new Error(
        "On-camera performance requires a resolved character reference asset."
      );
    }
    if (!input.routeSupport.audioDrivenPerformance) {
      throw new Error(
        "The selected generation route does not support audio-driven on-camera performance."
      );
    }
    executionRoute = "audio_driven_performance";
  } else if (
    requirement?.visual_treatment === "product_close_up" &&
    !referenceBindings.some(
      (binding) => binding.kind === "product"
    )
  ) {
    throw new Error(
      "Product close-up generation requires a resolved product reference asset."
    );
  }

  if (
    executionRoute === "reference_to_video" &&
    !input.routeSupport.referenceToVideo
  ) {
    throw new Error(
      "The selected generation route cannot consume the required reference assets."
    );
  }

  return Array.from({ length: takeCount }, (_, offset) => {
    const identity = productionCandidateIdentityForDestination(
      input.batchId,
      input.destinationKind,
      input.destinationId,
      offset + 1
    );
    const parameters: NonNullable<ProductionGenerationSnapshot["parameters"]> =
      {
        executionRoute,
        speechMode: requirement?.speech_mode ?? "none"
      };
    if (requirement?.visual_treatment) {
      parameters.visualTreatment = requirement.visual_treatment;
    }
    if (requirement?.local_direction) {
      parameters.localDirection = requirement.local_direction;
    }
    const snapshot: ProductionGenerationSnapshot = {
      schemaVersion: 1,
      batchId: identity.batchId,
      requestId: identity.requestId,
      candidateId: identity.candidateId,
      variationId: identity.variationId,
      variationIndex: identity.variationIndex,
      destinationKind: identity.destinationKind,
      destinationId: identity.destinationId,
      operation: input.operation,
      entityIds: resolvedIds(input.entityIds ?? []),
      referenceAssetIds,
      references: referenceBindings.map((binding) => ({
        kind: binding.kind,
        assetId: binding.asset_id,
        ...(binding.entity_id !== undefined && {
          entityId: binding.entity_id
        }),
        descriptor: binding.label ?? `${binding.kind} reference`
      })),
      requiredCapabilities: [executionRoute],
      executionRoute,
      prompt,
      parameters
    };
    if (input.authoringFingerprint !== undefined) {
      snapshot.authoringFingerprint = input.authoringFingerprint;
    }
    if (speechBinding) {
      snapshot.speech = {
        ...(speechBinding.text !== undefined && { text: speechBinding.text }),
        ...(speechBinding.direction !== undefined && {
          direction: speechBinding.direction
        }),
        ...(speechBinding.voice !== undefined && {
          voice: JSON.parse(JSON.stringify(speechBinding.voice)) as NonNullable<
            ProductionGenerationSnapshot["speech"]
          >["voice"]
        }),
        ...(audioAssetId !== undefined && { audioAssetId }),
        ...(speechBinding.script_line_id !== undefined && {
          scriptLineId: speechBinding.script_line_id
        }),
        ...(speechBinding.speaker_id !== undefined && {
          speakerId: speechBinding.speaker_id
        }),
        ...(speechDurationMs !== undefined && {
          durationMs: speechDurationMs
        })
      };
    }
    if (input.provider !== undefined) snapshot.provider = input.provider;
    if (input.model !== undefined) snapshot.model = input.model;
    if (input.outputFormat !== undefined) {
      snapshot.outputFormat = input.outputFormat;
    }
    if (requestedDurationMs !== undefined) {
      snapshot.requestedDurationMs = requestedDurationMs;
    }
    return {
      identity,
      snapshot,
      executionRoute,
      referenceAssetIds,
      audioAssetId
    };
  });
}

export type ProductionCandidateVersionInput = Omit<
  ClipVersion,
  | "candidateId"
  | "batchId"
  | "requestId"
  | "variationId"
  | "variationIndex"
  | "productionSnapshot"
> & {
  readonly productionSnapshot: ProductionGenerationSnapshot;
};

export interface ProductionCandidateLanding {
  readonly identity: ProductionCandidateIdentity;
  readonly version: ProductionCandidateVersionInput;
}

/** Return production candidates in editorial variation order, not landing order. */
export function productionCandidatesForClip(
  clip: TimelineClip,
  batchId?: string
): ClipVersion[] {
  return (clip.versions ?? [])
    .filter(
      (version) =>
        version.candidateId !== undefined &&
        (batchId === undefined || version.batchId === batchId)
    )
    .slice()
    .sort((left, right) => {
      const leftIndex = left.variationIndex ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = right.variationIndex ?? Number.MAX_SAFE_INTEGER;
      return (
        leftIndex - rightIndex ||
        (left.candidateId ?? "").localeCompare(right.candidateId ?? "")
      );
    });
}

/**
 * Land one provider result as a candidate. This is deliberately append-only
 * and never changes the asset currently used by the clip.
 */
export function landProductionCandidate(
  clip: TimelineClip,
  landing: ProductionCandidateLanding
): TimelineClip {
  const { identity, version: input } = landing;
  if (identity.destinationId !== clip.id) {
    throw new Error("A production candidate must land on its requested clip.");
  }
  const snapshot = input.productionSnapshot;
  if (
    snapshot.candidateId !== identity.candidateId ||
    snapshot.batchId !== identity.batchId ||
    snapshot.requestId !== identity.requestId ||
    snapshot.variationId !== identity.variationId ||
    snapshot.variationIndex !== identity.variationIndex ||
    snapshot.destinationId !== identity.destinationId ||
    snapshot.destinationKind !== identity.destinationKind
  ) {
    throw new Error(
      "Production candidate identity does not match its snapshot."
    );
  }

  const versions = clip.versions ?? [];
  const existing = versions.find(
    (version) => version.candidateId === identity.candidateId
  );
  if (existing !== undefined) {
    if (
      existing.requestId === identity.requestId &&
      existing.productionSnapshot?.candidateId === identity.candidateId
    ) {
      return clip;
    }
    throw new Error(
      `Candidate "${identity.candidateId}" already exists with different inputs.`
    );
  }

  const version: ClipVersion = {
    ...input,
    candidateId: identity.candidateId,
    batchId: identity.batchId,
    requestId: identity.requestId,
    variationId: identity.variationId,
    variationIndex: identity.variationIndex,
    productionSnapshot: snapshot
  };
  return {
    ...clip,
    versions: [...versions, version].sort((left, right) => {
      const leftIndex = left.variationIndex ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = right.variationIndex ?? Number.MAX_SAFE_INTEGER;
      return (
        leftIndex - rightIndex ||
        (left.candidateId ?? "").localeCompare(right.candidateId ?? "")
      );
    })
  };
}

/** A serializable temporary map used by Preview take and Preview draft. */
export type ProductionAuditionMap = Readonly<Record<string, string>>;

/** Update audition state without changing a document or a clip. */
export function auditionProductionCandidate(
  audition: ProductionAuditionMap,
  destinationId: string,
  candidateId: string
): ProductionAuditionMap {
  requiredId(destinationId, "destinationId");
  requiredId(candidateId, "candidateId");
  return { ...audition, [destinationId]: candidateId };
}

export interface ProductionDraftChange {
  readonly clipId: string;
  readonly before: TimelineClip;
  readonly after: TimelineClip;
}

export interface ProductionDraftApplied {
  readonly ok: true;
  readonly state: TimelineOpState;
  readonly changes: readonly ProductionDraftChange[];
}

export interface ProductionDraftRejected {
  readonly ok: false;
  readonly state: TimelineOpState;
  readonly error: string;
}

export type ProductionDraftResult =
  | ProductionDraftApplied
  | ProductionDraftRejected;

function rejected(
  state: TimelineOpState,
  error: string
): ProductionDraftRejected {
  return { ok: false, state, error };
}

/**
 * Apply an explicit candidate map atomically within one timeline document.
 * Every precondition is checked before any clip is changed, making the
 * returned `changes` suitable for the host's existing undo history.
 */
export function applyProductionDraft(
  state: TimelineOpState,
  audition: ProductionAuditionMap,
  batchId?: string
): ProductionDraftResult {
  const destinations = Object.keys(audition).sort();
  if (destinations.length === 0) {
    return rejected(
      state,
      "A production draft needs at least one candidate selection."
    );
  }

  const changes: ProductionDraftChange[] = [];
  let resolvedBatchId: string | undefined = batchId;
  for (const clipId of destinations) {
    const clip = state.clips.find((candidate) => candidate.id === clipId);
    if (clip === undefined)
      return rejected(state, `Clip "${clipId}" no longer exists.`);
    if (
      clip.currentAssetId !== undefined ||
      activeTakeIdOf(clip) !== undefined
    ) {
      return rejected(state, `Clip "${clip.name}" already has accepted media.`);
    }

    const candidateId = audition[clipId];
    if (candidateId === undefined) {
      return rejected(
        state,
        `No candidate was selected for clip "${clip.name}".`
      );
    }
    const version = (clip.versions ?? []).find(
      (candidate) => candidate.candidateId === candidateId
    );
    if (version === undefined) {
      return rejected(
        state,
        `Candidate "${candidateId}" is not on clip "${clip.name}".`
      );
    }
    if (version.status !== "success") {
      return rejected(state, `Candidate "${candidateId}" is not ready.`);
    }
    if (version.batchId === undefined) {
      return rejected(
        state,
        `Candidate "${candidateId}" has no production batch.`
      );
    }
    const snapshot = version.productionSnapshot;
    if (snapshot === undefined) {
      return rejected(
        state,
        `Candidate "${candidateId}" has no production snapshot.`
      );
    }
    if (
      snapshot.candidateId !== candidateId ||
      snapshot.destinationKind !== "timeline_clip" ||
      snapshot.destinationId !== clip.id ||
      snapshot.batchId !== version.batchId ||
      version.requestId !== snapshot.requestId ||
      version.variationId !== snapshot.variationId ||
      version.variationIndex !== snapshot.variationIndex
    ) {
      return rejected(
        state,
        `Candidate "${candidateId}" has invalid production provenance.`
      );
    }
    if (resolvedBatchId === undefined) resolvedBatchId = version.batchId;
    if (version.batchId !== resolvedBatchId) {
      return rejected(
        state,
        "A production draft may select candidates from one batch only."
      );
    }
    if (clip.mediaType === "model3d") {
      return rejected(
        state,
        `Clip "${clip.name}" cannot accept a production video candidate.`
      );
    }
    const after = selectTake(clip, version.id);
    changes.push({ clipId, before: clip, after });
  }

  const changed = new Map(
    changes.map((change) => [change.clipId, change.after])
  );
  return {
    ok: true,
    state: {
      ...state,
      clips: state.clips.map((clip) => changed.get(clip.id) ?? clip),
      selectedClipIds: [...state.selectedClipIds]
    },
    changes
  };
}

/** Restore the complete pre-apply clip snapshots, as one undo operation. */
export function undoProductionDraft(
  state: TimelineOpState,
  applied: ProductionDraftApplied
): ProductionDraftResult {
  for (const change of applied.changes) {
    const current = state.clips.find((clip) => clip.id === change.clipId);
    if (
      current === undefined ||
      JSON.stringify(current) !== JSON.stringify(change.after)
    ) {
      return rejected(
        state,
        `Cannot undo production draft for clip "${change.clipId}" after it changed.`
      );
    }
  }
  const before = new Map(
    applied.changes.map((change) => [change.clipId, change.before])
  );
  return {
    ok: true,
    state: {
      ...state,
      clips: state.clips.map((clip) => before.get(clip.id) ?? clip),
      selectedClipIds: [...state.selectedClipIds]
    },
    changes: applied.changes.map((change) => ({
      clipId: change.clipId,
      before: change.after,
      after: change.before
    }))
  };
}

/** Map a stored candidate status to whether it can be auditioned or applied. */
export function isProductionCandidateReady(
  status: ProductionCandidateStatus
): boolean {
  return status === "ready";
}
