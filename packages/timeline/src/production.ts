import type {
  ProductionGenerationSnapshot,
  ProductionCandidateStatus,
  ProductionDestinationKind
} from "@nodetool-ai/protocol";
import { productionVariationIdentity } from "@nodetool-ai/protocol";

import type { TimelineOpState } from "./ops/types.js";
import { stableSerialize } from "./stableSerialize.js";
import { activeTakeIdOf, preserveBaselineTake, selectTake, useTake } from "./takes.js";
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
    "timeline_clip",
    batchId,
    destinationId,
    variationIndex
  );
}

/** Build the same stable identity for any supported editorial destination. */
export function productionCandidateIdentityForDestination(
  destinationKind: ProductionDestinationKind,
  batchId: string,
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
    ...identity,
    destinationKind
  };
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
      return leftIndex - rightIndex ||
        (left.candidateId ?? "").localeCompare(right.candidateId ?? "");
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
  if (
    identity.destinationKind !== "timeline_clip" ||
    identity.destinationId !== clip.id
  ) {
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
    throw new Error("Production candidate identity does not match its snapshot.");
  }

  const withBaseline = preserveBaselineTake(clip, input.createdAt);
  const versions = withBaseline.versions ?? [];
  const existing = versions.find((version) => version.candidateId === identity.candidateId);
  if (existing !== undefined) {
    if (
      existing.requestId === identity.requestId &&
      existing.assetId === input.assetId &&
      existing.productionSnapshot !== undefined &&
      stableSerialize(existing.productionSnapshot) === stableSerialize(snapshot)
    ) {
      return withBaseline;
    }
    throw new Error(`Candidate "${identity.candidateId}" already exists with different inputs.`);
  }
  const takeCollision = versions.find((version) => version.id === input.id);
  if (takeCollision !== undefined) {
    throw new Error(`Take "${input.id}" already exists with different candidate identity.`);
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
  return { ...withBaseline, versions: [...versions, version] };
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

export interface ProductionCandidatePreview {
  readonly candidateId: string;
  readonly assetId: string;
  readonly sourceTimeMs: number;
  readonly sourceDurationMs: number;
}

export type ProductionPreviewResult =
  | { readonly ok: true; readonly preview: ProductionCandidatePreview }
  | { readonly ok: false; readonly error: string };

interface ValidatedProductionVersion {
  readonly version: ClipVersion;
  readonly snapshot: ProductionGenerationSnapshot;
}

function productionVersionForClip(
  clip: TimelineClip,
  candidateId: string
): ValidatedProductionVersion | string {
  const version = (clip.versions ?? []).find(
    (candidate) => candidate.candidateId === candidateId
  );
  if (version === undefined) {
    return `Candidate "${candidateId}" is not on clip "${clip.name}".`;
  }
  if (version.status !== "success") {
    return `Candidate "${candidateId}" is not ready.`;
  }
  const snapshot = version.productionSnapshot;
  if (
    snapshot === undefined ||
    snapshot.candidateId !== candidateId ||
    snapshot.destinationKind !== "timeline_clip" ||
    snapshot.destinationId !== clip.id ||
    snapshot.batchId !== version.batchId ||
    snapshot.requestId !== version.requestId ||
    snapshot.variationId !== version.variationId ||
    snapshot.variationIndex !== version.variationIndex
  ) {
    return `Candidate "${candidateId}" has invalid production provenance.`;
  }
  return { version, snapshot };
}

/**
 * Resolve a candidate for preview without changing the document. Preview time
 * is clip-relative and clamps to the measured candidate duration.
 */
export function previewProductionTake(
  clip: TimelineClip,
  candidateId: string,
  relativeTimeMs: number
): ProductionPreviewResult {
  const validated = productionVersionForClip(clip, candidateId);
  if (typeof validated === "string") {
    return { ok: false, error: validated };
  }
  const sourceDurationMs = validated.version.durationMs;
  if (
    sourceDurationMs === undefined ||
    !Number.isFinite(sourceDurationMs) ||
    sourceDurationMs <= 0
  ) {
    return { ok: false, error: `Candidate "${candidateId}" has no measured duration.` };
  }
  return {
    ok: true,
    preview: {
      candidateId,
      assetId: validated.version.assetId,
      sourceTimeMs: Math.min(
        sourceDurationMs,
        Math.max(0, Number.isFinite(relativeTimeMs) ? relativeTimeMs : 0)
      ),
      sourceDurationMs
    }
  };
}

export interface ProductionDraftPreview {
  readonly candidates: Readonly<Record<string, ProductionCandidatePreview>>;
  readonly unresolvedDestinationIds: readonly string[];
}

/** Resolve an explicit draft map. Missing or unfinished results stay unresolved. */
export function previewProductionDraft(
  state: TimelineOpState,
  audition: ProductionAuditionMap
): ProductionDraftPreview {
  const candidates: Record<string, ProductionCandidatePreview> = {};
  const unresolvedDestinationIds: string[] = [];
  for (const destinationId of Object.keys(audition).sort()) {
    const clip = state.clips.find((item) => item.id === destinationId);
    const candidateId = audition[destinationId];
    if (clip === undefined || candidateId === undefined) {
      unresolvedDestinationIds.push(destinationId);
      continue;
    }
    const preview = previewProductionTake(clip, candidateId, 0);
    if (!preview.ok) {
      unresolvedDestinationIds.push(destinationId);
      continue;
    }
    candidates[destinationId] = preview.preview;
  }
  return { candidates, unresolvedDestinationIds };
}

export interface ProductionTakePreconditions {
  readonly batchId?: string;
  /** Current target fingerprint supplied by the owning editor. */
  readonly authoringFingerprint?: string;
}

export type ProductionTakeResult =
  | { readonly ok: true; readonly clip: TimelineClip; readonly version: ClipVersion }
  | { readonly ok: false; readonly clip: TimelineClip; readonly error: string };

function sourceAssetIdOf(snapshot: ProductionGenerationSnapshot): string | undefined {
  const context = snapshot.sourceContext;
  if (context === undefined) return undefined;
  const camel = context["sourceAssetId"];
  if (typeof camel === "string" && camel.length > 0) return camel;
  const snake = context["source_asset_id"];
  return typeof snake === "string" && snake.length > 0 ? snake : undefined;
}

/** Validate and persist one explicit Use take choice. */
export function useProductionTake(
  clip: TimelineClip,
  candidateId: string,
  preconditions: ProductionTakePreconditions = {}
): ProductionTakeResult {
  const validated = productionVersionForClip(clip, candidateId);
  if (typeof validated === "string") {
    return { ok: false, clip, error: validated };
  }
  const { snapshot, version } = validated;
  if (preconditions.batchId !== undefined && version.batchId !== preconditions.batchId) {
    return {
      ok: false,
      clip,
      error: `Candidate "${candidateId}" belongs to another production batch.`
    };
  }
  if (
    preconditions.authoringFingerprint !== undefined &&
    snapshot.authoringFingerprint !== preconditions.authoringFingerprint
  ) {
    return {
      ok: false,
      clip,
      error: `Clip "${clip.name}" changed after the candidate was prepared.`
    };
  }
  if (
    snapshot.parentTakeId !== undefined &&
    activeTakeIdOf(clip) !== snapshot.parentTakeId
  ) {
    return {
      ok: false,
      clip,
      error: `Candidate "${candidateId}" was generated from another active take.`
    };
  }
  const sourceAssetId = sourceAssetIdOf(snapshot);
  if (sourceAssetId !== undefined && clip.currentAssetId !== sourceAssetId) {
    return {
      ok: false,
      clip,
      error: `Candidate "${candidateId}" was generated from another source asset.`
    };
  }
  if (
    snapshot.requestedDurationMs === undefined ||
    snapshot.requestedDurationMs !== clip.durationMs
  ) {
    return {
      ok: false,
      clip,
      error: `Candidate "${candidateId}" does not match the clip's current timing.`
    };
  }
  if (version.durationMs === undefined) {
    return {
      ok: false,
      clip,
      error: `Candidate "${candidateId}" has no measured duration.`
    };
  }
  const applied = useTake(clip, version.id, {
    inPointMs: 0,
    playableDurationMs: snapshot.requestedDurationMs,
    sourceDurationMs: version.durationMs
  });
  return applied.ok
    ? { ok: true, clip: applied.clip, version }
    : { ok: false, clip, error: applied.error };
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

export type ProductionDraftResult = ProductionDraftApplied | ProductionDraftRejected;

function rejected(state: TimelineOpState, error: string): ProductionDraftRejected {
  return { ok: false, state, error };
}

export interface ProductionDraftPreconditions {
  readonly batchId?: string;
  readonly authoringFingerprints?: Readonly<Record<string, string>>;
}
/**
 * Apply an explicit candidate map atomically within one timeline document.
 * Every precondition is checked before any clip is changed, making the
 * returned `changes` suitable for the host's existing undo history.
 */
export function applyProductionDraft(
  state: TimelineOpState,
  audition: ProductionAuditionMap,
  preconditions: string | ProductionDraftPreconditions = {}
): ProductionDraftResult {
  const destinations = Object.keys(audition).sort();
  if (destinations.length === 0) {
    return rejected(state, "A production draft needs at least one candidate selection.");
  }

  const changes: ProductionDraftChange[] = [];
  const options: ProductionDraftPreconditions =
    typeof preconditions === "string"
      ? { batchId: preconditions }
      : preconditions;
  let resolvedBatchId: string | undefined = options.batchId;
  for (const clipId of destinations) {
    const clip = state.clips.find((candidate) => candidate.id === clipId);
    if (clip === undefined) return rejected(state, `Clip "${clipId}" no longer exists.`);
    if (clip.currentAssetId !== undefined || activeTakeIdOf(clip) !== undefined) {
      return rejected(state, `Clip "${clip.name}" already has accepted media.`);
    }

    const candidateId = audition[clipId];
    if (candidateId === undefined) {
      return rejected(state, `No candidate was selected for clip "${clip.name}".`);
    }
    const validated = productionVersionForClip(clip, candidateId);
    if (typeof validated === "string") return rejected(state, validated);
    const { version } = validated;
    if (version.batchId === undefined) {
      return rejected(state, `Candidate "${candidateId}" has no production batch.`);
    }
    if (resolvedBatchId === undefined) resolvedBatchId = version.batchId;
    if (version.batchId !== resolvedBatchId) {
      return rejected(state, "A production draft may select candidates from one batch only.");
    }
    // Legacy draft records predate resolved timing and retain the existing apply path.
    if (
      validated.snapshot.requestedDurationMs === undefined &&
      options.authoringFingerprints?.[clipId] === undefined
    ) {
      if (clip.mediaType === "model3d") {
        return rejected(state, `Clip "${clip.name}" cannot accept a production video candidate.`);
      }
      changes.push({ clipId, before: clip, after: selectTake(clip, version.id) });
      continue;
    }
    const applied = useProductionTake(clip, candidateId, {
      batchId: resolvedBatchId,
      authoringFingerprint: options.authoringFingerprints?.[clipId]
    });
    if (!applied.ok) return rejected(state, applied.error);
    changes.push({ clipId, before: clip, after: applied.clip });
  }

  const changed = new Map(changes.map((change) => [change.clipId, change.after]));
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

/** Apply one explicit Use take choice as one undo-compatible document edit. */
export function applyProductionTake(
  state: TimelineOpState,
  clipId: string,
  candidateId: string,
  preconditions: ProductionTakePreconditions = {}
): ProductionDraftResult {
  const clip = state.clips.find((item) => item.id === clipId);
  if (clip === undefined) return rejected(state, `Clip "${clipId}" no longer exists.`);
  const applied = useProductionTake(clip, candidateId, preconditions);
  if (!applied.ok) return rejected(state, applied.error);
  const change: ProductionDraftChange = {
    clipId,
    before: clip,
    after: applied.clip
  };
  return {
    ok: true,
    state: {
      ...state,
      clips: state.clips.map((item) =>
        item.id === clipId ? applied.clip : item
      ),
      selectedClipIds: [...state.selectedClipIds]
    },
    changes: [change]
  };
}
/** Restore the complete pre-apply clip snapshots, as one undo operation. */
export function undoProductionDraft(
  state: TimelineOpState,
  applied: ProductionDraftApplied
): ProductionDraftResult {
  for (const change of applied.changes) {
    const current = state.clips.find((clip) => clip.id === change.clipId);
    if (current === undefined || JSON.stringify(current) !== JSON.stringify(change.after)) {
      return rejected(state, `Cannot undo production draft for clip "${change.clipId}" after it changed.`);
    }
  }
  const before = new Map(applied.changes.map((change) => [change.clipId, change.before]));
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
export function isProductionCandidateReady(status: ProductionCandidateStatus): boolean {
  return status === "ready";
}
