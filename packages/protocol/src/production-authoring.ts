import { z } from "zod";
import { captionWord } from "./caption-word.js";

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

/** An asset binding. Authorization is checked by the server resolving it. */
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
    reference_bindings: z.array(productionReferenceBinding).max(32).optional(),
    origin: z
      .object({
        document_id: identifier,
        document_kind: z.enum(["timeline", "storyboard", "script"]),
        authoring_fingerprint: identifier.optional()
      })
      .optional()
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

export const productionSpeechMode = z.enum(["none", "off_camera", "on_camera"]);
export type ProductionSpeechMode = z.infer<typeof productionSpeechMode>;

/** Local or linked speech context. The Script still owns linked line text. */
export const productionSpeechBinding = z
  .object({
    script_line_id: identifier.optional(),
    speaker_id: identifier.optional(),
    text: nonEmptyText.optional(),
    direction: nonEmptyText.optional(),
    audio_asset_id: identifier.optional(),
    /** Unresolved voice selection carried by older clients. */
    voice_id: identifier.optional(),
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
    if (binding.script_line_id !== undefined && binding.text !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["text"],
        message: "Linked speech text is owned by the Script line."
      });
    }
    if (
      binding.script_line_id === undefined &&
      binding.text === undefined &&
      binding.audio_asset_id === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Speech binding needs script_line_id, text, or audio_asset_id."
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

/** Source-local milliseconds, with unused handles outside the playable window. */
export const productionPlayableWindow = z
  .object({
    startMs: z.number().nonnegative(),
    endMs: z.number().positive()
  })
  .refine((window) => window.endMs > window.startMs, {
    path: ["endMs"],
    message: "The playable window must have positive duration."
  });

/** Measured outputs belong to the result, never the submitted snapshot. */
export const productionCandidateResult = z
  .object({
    sourceDurationMs: z.number().positive(),
    playableWindow: productionPlayableWindow,
    audio: z
      .object({
        assetId: identifier,
        durationMs: z.number().positive(),
        /** Choose one playback source to avoid playing embedded speech twice. */
        playback: z.enum(["embedded", "separate"]),
        /** Relative to the audio start, aligned with the playable window start. */
        words: z.array(captionWord)
      })
      .optional()
  })
  .superRefine((result, context) => {
    if (result.playableWindow.endMs > result.sourceDurationMs) {
      context.addIssue({
        code: "custom",
        path: ["playableWindow"],
        message: "The playable window exceeds the source duration."
      });
    }
    if (result.audio) {
      const duration =
        result.playableWindow.endMs - result.playableWindow.startMs;
      if (result.audio.durationMs > duration) {
        context.addIssue({
          code: "custom",
          path: ["audio", "durationMs"],
          message: "Speech must fit without truncation."
        });
      }
      for (const [index, word] of result.audio.words.entries()) {
        if (
          word.startMs < 0 ||
          word.endMs < word.startMs ||
          word.endMs > result.audio.durationMs
        ) {
          context.addIssue({
            code: "custom",
            path: ["audio", "words", index],
            message: "Word timing must lie within the authoritative audio."
          });
        }
      }
    }
  });
export type ProductionCandidateResult = z.infer<
  typeof productionCandidateResult
>;

const productionSourceContext = z
  .object({
    sequenceId: identifier,
    clipId: identifier,
    sourceAssetId: identifier,
    sourceTakeId: identifier.optional(),
    sourceStartMs: z.number().nonnegative(),
    sourceEndMs: z.number().positive(),
    timelineStartMs: z.number().nonnegative(),
    timelineDurationMs: z.number().positive(),
    speedMultiplier: z.number().positive()
  })
  .refine((source) => source.sourceEndMs > source.sourceStartMs, {
    path: ["sourceEndMs"],
    message: "The edit source window must have positive duration."
  });

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
    ownerId: identifier.optional(),
    projectId: identifier.optional(),
    documentId: identifier.optional(),
    targetVersion: z.number().int().nonnegative().optional(),
    originatingBeatId: identifier.optional(),
    originatingShotId: identifier.optional(),
    operation: productionOperation,
    authoringFingerprint: identifier.optional(),
    entityIds: z.array(identifier).optional(),
    referenceAssetIds: z.array(identifier).optional(),
    references: z
      .array(
        z.object({
          kind: productionReferenceKind,
          assetId: identifier,
          entityId: identifier.optional(),
          descriptor: nonEmptyText,
          revision: identifier.optional()
        })
      )
      .optional(),
    requiredCapabilities: z.array(identifier).min(1).optional(),
    executionRoute: identifier.optional(),
    prompt: nonEmptyText.optional(),
    speech: z
      .object({
        text: nonEmptyText.optional(),
        direction: nonEmptyText.optional(),
        voice: z.record(z.string(), z.json()).optional(),
        audioAssetId: identifier.optional(),
        scriptId: identifier.optional(),
        scriptLineId: identifier.optional(),
        speakerId: identifier.optional(),
        takeId: identifier.optional(),
        durationMs: z.number().positive().optional()
      })
      .catchall(z.json())
      .optional(),
    provider: identifier.optional(),
    model: identifier.optional(),
    parameters: z.record(z.string(), z.json()).optional(),
    outputFormat: z.string().trim().min(1).optional(),
    requestedDurationMs: z.number().int().positive().optional(),
    playableWindow: productionPlayableWindow.optional(),
    parentTakeId: identifier.optional(),
    sourceContext: productionSourceContext.optional()
  })
  .catchall(z.json())
  .superRefine((snapshot, context) => {
    if (
      snapshot.playableWindow &&
      snapshot.requestedDurationMs !== undefined &&
      snapshot.playableWindow.endMs - snapshot.playableWindow.startMs !==
        snapshot.requestedDurationMs
    ) {
      context.addIssue({
        code: "custom",
        path: ["playableWindow"],
        message:
          "The playable window must cover the requested duration without stretching."
      });
    }
    if (
      snapshot.speech?.durationMs !== undefined &&
      snapshot.requestedDurationMs !== undefined &&
      snapshot.speech.durationMs > snapshot.requestedDurationMs
    ) {
      context.addIssue({
        code: "custom",
        path: ["speech", "durationMs"],
        message: "Speech must fit before dependent video dispatch."
      });
    }
  });
export type ProductionGenerationSnapshot = z.infer<
  typeof productionGenerationSnapshot
>;

/** Capture complete dispatch inputs. Legacy partial records remain readable. */
export function captureProductionGenerationSnapshot(
  input: unknown
): ProductionGenerationSnapshot {
  const snapshot = productionGenerationSnapshot
    .safeExtend({
      ownerId: identifier,
      projectId: identifier,
      documentId: identifier,
      authoringFingerprint: identifier,
      prompt: nonEmptyText,
      provider: identifier,
      model: identifier,
      requiredCapabilities: z.array(identifier).min(1),
      executionRoute: identifier,
      outputFormat: nonEmptyText,
      requestedDurationMs: z.number().int().positive(),
      playableWindow: productionPlayableWindow
    })
    .parse(input);
  productionVariationIdentitySchema.parse(snapshot);
  if (
    snapshot.operation === "edit_video" &&
    (!snapshot.parentTakeId || !snapshot.sourceContext)
  ) {
    throw new Error("Edit video requires a parent take and source context.");
  }
  if (
    snapshot.executionRoute === "audio_driven_performance" &&
    (!snapshot.speech?.audioAssetId ||
      !snapshot.speech.text ||
      snapshot.speech.durationMs === undefined)
  ) {
    throw new Error(
      "An audio-driven performance requires resolved speech audio and timing."
    );
  }
  const captured = structuredClone(snapshot);
  freezeSnapshotValue(captured);
  return captured;
}

function freezeSnapshotValue(value: unknown): void {
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const child of Object.values(value)) {
    freezeSnapshotValue(child);
  }
  Object.freeze(value);
}

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
    documentId: identifier.optional(),
    targetVersion: z.number().int().nonnegative().optional(),
    status: productionCandidateStatus,
    assetId: identifier.optional(),
    takeId: identifier.optional(),
    error: nonEmptyText.optional(),
    active: z.boolean().default(false),
    accepted: z.boolean().default(false),
    result: productionCandidateResult.optional(),
    /** Absent for legacy candidates without replayable provenance. */
    snapshot: productionGenerationSnapshot.optional()
  })
  .passthrough()
  .superRefine((candidate, context) => {
    const identity = productionVariationIdentitySchema.safeParse({
      ...candidate,
      requestId: `request:${candidate.candidateId}`
    });
    if (!identity.success) {
      for (const issue of identity.error.issues) {
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message
        });
      }
    }
    if (candidate.snapshot) {
      for (const key of [
        "candidateId",
        "batchId",
        "requestId",
        "variationId",
        "variationIndex",
        "destinationKind",
        "destinationId",
        "documentId",
        "targetVersion"
      ] as const) {
        if (candidate.snapshot[key] !== candidate[key]) {
          context.addIssue({
            code: "custom",
            path: ["snapshot", key],
            message: "Candidate and snapshot identities must match."
          });
        }
      }
      if (
        candidate.result &&
        candidate.snapshot.requestedDurationMs !== undefined &&
        candidate.result.playableWindow.endMs -
          candidate.result.playableWindow.startMs !==
          candidate.snapshot.requestedDurationMs
      ) {
        context.addIssue({
          code: "custom",
          path: ["result", "playableWindow"],
          message: "The result must cover the requested duration."
        });
      }
      if (
        candidate.status === "ready" &&
        candidate.snapshot.requestedDurationMs !== undefined &&
        !candidate.result
      ) {
        context.addIssue({
          code: "custom",
          path: ["result"],
          message: "A ready timed candidate needs measured media."
        });
      }
      if (
        candidate.result &&
        candidate.snapshot.playableWindow &&
        (candidate.result.playableWindow.startMs !==
          candidate.snapshot.playableWindow.startMs ||
          candidate.result.playableWindow.endMs !==
            candidate.snapshot.playableWindow.endMs)
      ) {
        context.addIssue({
          code: "custom",
          path: ["result", "playableWindow"],
          message: "The result must preserve the submitted source mapping."
        });
      }
      if (
        candidate.result?.audio &&
        candidate.snapshot.speech?.durationMs !== undefined &&
        candidate.result.audio.durationMs !==
          candidate.snapshot.speech.durationMs
      ) {
        context.addIssue({
          code: "custom",
          path: ["result", "audio", "durationMs"],
          message: "The result must preserve the submitted audio timing."
        });
      }
      if (
        candidate.snapshot.speech?.audioAssetId &&
        candidate.result?.audio?.assetId !==
          candidate.snapshot.speech.audioAssetId &&
        candidate.status === "ready"
      ) {
        context.addIssue({
          code: "custom",
          path: ["result", "audio"],
          message: "The result must identify the submitted authoritative audio."
        });
      }
    }
    if (
      candidate.accepted !== candidate.active ||
      (candidate.active && candidate.status !== "ready")
    ) {
      context.addIssue({
        code: "custom",
        path: ["active"],
        message: "Only a ready accepted candidate can be active."
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

/** Optional provenance carried by native takes during handoff and persistence. */
export const productionTakeMetadata = z.object({
  candidateId: identifier.optional(),
  batchId: identifier.optional(),
  requestId: identifier.optional(),
  variationId: identifier.optional(),
  variationIndex: z.number().int().min(1).max(3).optional(),
  productionSnapshot: productionGenerationSnapshot.optional(),
  productionResult: productionCandidateResult.optional()
});
export type ProductionTakeMetadata = z.infer<typeof productionTakeMetadata>;

/** Landing never activates a result. Repeated delivery preserves acceptance. */
export function landProductionCandidateInactive(
  candidate: unknown,
  assetId: string
): ProductionCandidate {
  const parsed = productionCandidate.parse(candidate);
  const resolvedAssetId = identifier.parse(assetId);
  if (parsed.status === "ready") {
    if (parsed.assetId !== resolvedAssetId) {
      throw new Error(
        "A landed candidate cannot be replaced by a different output."
      );
    }
    return parsed;
  }
  if (parsed.status === "failed" || parsed.status === "cancelled") {
    throw new Error("A terminal candidate requires an explicit retry.");
  }
  return productionCandidate.parse({
    ...parsed,
    status: "ready",
    assetId: resolvedAssetId
  });
}

export interface ProductionPreviewSelection {
  readonly batchId: string;
  readonly documentId: string;
  readonly selections: Readonly<Record<string, string>>;
  readonly unresolvedDestinationIds: readonly string[];
}

/** Temporary selection only. Pending selections stay explicit and unresolved. */
export function selectProductionPreview(
  candidates: readonly ProductionCandidate[],
  selection: Readonly<Record<string, string>>,
  expected: { readonly batchId: string; readonly documentId: string }
): ProductionPreviewSelection {
  const scoped = candidates.filter(
    (candidate) =>
      candidate.batchId === expected.batchId &&
      candidate.documentId === expected.documentId
  );
  const byId = new Map(
    scoped.map((candidate) => [candidate.candidateId, candidate])
  );
  if (byId.size !== scoped.length) {
    throw new Error("Duplicate candidate identities are ambiguous.");
  }
  const unresolved = new Set(
    scoped.map((candidate) => candidate.destinationId)
  );
  for (const [destinationId, candidateId] of Object.entries(selection)) {
    const candidate = byId.get(candidateId);
    if (!candidate || candidate.destinationId !== destinationId) {
      throw new Error(
        `Invalid preview candidate for destination ${destinationId}.`
      );
    }
    if (
      candidate.status === "ready" &&
      productionCandidate.safeParse(candidate).success
    ) {
      unresolved.delete(destinationId);
    }
  }
  return {
    ...expected,
    selections: { ...selection },
    unresolvedDestinationIds: [...unresolved]
  };
}

/** A live destination that may receive one selected production candidate. */
export interface ProductionAcceptanceTarget {
  readonly destinationKind?: ProductionDestinationKind;
  readonly destinationId: string;
  readonly documentId?: string;
  readonly targetVersion?: number;
  readonly authoringFingerprint?: string;
  readonly acceptedCandidateId?: string;
  readonly acceptedAssetId?: string;
  readonly acceptedTakeId?: string;
}

export type ProductionAcceptanceValidation =
  | {
      readonly valid: true;
      readonly candidates: readonly ProductionCandidate[];
    }
  | { readonly valid: false; readonly issues: readonly string[] };

/**
 * Validate a complete acceptance selection against the live destinations.
 * Selection keys are checked in both directions so a destination deleted
 * after generation cannot be accepted just because its candidate still exists.
 */
export function validateProductionAcceptance(input: {
  readonly candidates: readonly ProductionCandidate[];
  readonly targets: readonly ProductionAcceptanceTarget[];
  readonly selection: Readonly<Record<string, string>>;
  readonly batchId: string;
  readonly documentId?: string;
}): ProductionAcceptanceValidation {
  const byId = new Map(
    input.candidates.map((candidate) => [candidate.candidateId, candidate])
  );
  const liveTargets = new Map<string, ProductionAcceptanceTarget>();
  const liveDestinationIds = new Set<string>();
  const issues: string[] = [];
  const selected: ProductionCandidate[] = [];
  if (Object.keys(input.selection).length === 0) {
    issues.push("A production draft needs at least one candidate selection.");
  }
  if (byId.size !== input.candidates.length) {
    issues.push("Duplicate candidate identities are ambiguous.");
  }
  const selectedIds = new Set(Object.values(input.selection));
  const documentId =
    input.documentId ??
    input.candidates.find(
      (candidate) =>
        selectedIds.has(candidate.candidateId) &&
        candidate.documentId !== undefined
    )?.documentId;

  for (const target of input.targets) {
    const targetKey = target.destinationId;
    if (liveTargets.has(targetKey)) {
      issues.push(`${target.destinationId}: duplicate acceptance target`);
      continue;
    }
    liveTargets.set(targetKey, target);
    liveDestinationIds.add(target.destinationId);

    const candidateId = Object.hasOwn(input.selection, target.destinationId)
      ? input.selection[target.destinationId]
      : undefined;
    if (candidateId === undefined || candidateId.trim() === "") {
      issues.push(`${target.destinationId}: no candidate selected`);
      continue;
    }

    const candidate = byId.get(candidateId);
    if (candidate === undefined) {
      issues.push(`${target.destinationId}: candidate is missing`);
      continue;
    }

    let candidateIsValid = true;
    if (!productionCandidate.safeParse(candidate).success) {
      issues.push(
        `${target.destinationId}: candidate has invalid provenance or timing`
      );
      candidateIsValid = false;
    }
    if (!candidate.snapshot) {
      issues.push(`${target.destinationId}: candidate has no captured inputs`);
      candidateIsValid = false;
    }
    if (
      (documentId !== undefined && candidate.documentId !== documentId) ||
      (target.documentId !== undefined && target.documentId !== documentId)
    ) {
      issues.push(
        `${target.destinationId}: candidate belongs to another document`
      );
      candidateIsValid = false;
    }
    if (candidate.batchId !== input.batchId) {
      issues.push(
        `${target.destinationId}: candidate belongs to another production`
      );
      candidateIsValid = false;
    }
    if (
      (target.destinationKind !== undefined &&
        candidate.destinationKind !== target.destinationKind) ||
      candidate.destinationId !== target.destinationId
    ) {
      issues.push(
        `${target.destinationId}: candidate targets another destination`
      );
      candidateIsValid = false;
    }
    if (candidate.status !== "ready" || candidate.assetId === undefined) {
      issues.push(`${target.destinationId}: candidate is not ready`);
      candidateIsValid = false;
    }
    if (
      candidate.active ||
      candidate.accepted ||
      target.acceptedCandidateId !== undefined ||
      target.acceptedAssetId !== undefined ||
      target.acceptedTakeId !== undefined
    ) {
      issues.push(`${target.destinationId}: target already has accepted media`);
      candidateIsValid = false;
    }
    if (
      ((target.targetVersion !== undefined ||
        candidate.targetVersion !== undefined) &&
        candidate.targetVersion !== target.targetVersion) ||
      (target.authoringFingerprint !== undefined &&
        candidate.snapshot?.authoringFingerprint !==
          target.authoringFingerprint)
    ) {
      issues.push(`${target.destinationId}: target changed since generation`);
      candidateIsValid = false;
    }
    if (candidateIsValid) {
      selected.push(candidate);
    }
  }

  for (const destinationId of Object.keys(input.selection)) {
    if (!liveDestinationIds.has(destinationId)) {
      issues.push(`${destinationId}: selected destination is missing`);
    }
  }

  return issues.length > 0
    ? { valid: false, issues }
    : { valid: true, candidates: selected };
}
