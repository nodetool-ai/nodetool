/**
 * useTimelineDirectGenJob — direct-gen (text-to-image / image-to-image /
 * text-to-video / image-to-video / text-to-audio) for timeline clips. Mirrors
 * `useDirectGenJob` for the sketch editor: fires a `generate_media`
 * WebSocket RPC and writes the resulting asset back onto the clip
 * (currentAssetId + ClipVersion) when it returns.
 *
 * Workflow-bound clips go through `useGenerateClip` instead; this hook only
 * handles clips whose `bindingKind` is `"text-to-image"`, `"image-to-image"`,
 * `"text-to-video"`, `"image-to-video"`, or `"text-to-audio"`.
 */
import { useCallback } from "react";
import { assertProductionGenerationAllowed, productionRequirement } from "@nodetool-ai/protocol";
import { trpcClient } from "../../trpc/client";
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../../lib/websocket/GlobalWebSocketManager";
import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import type { TimelineStoreApi } from "../../stores/timeline/TimelineStore";
import {
  activeTakeIdOf,
  captureVideoGenerationRecipe,
  captureMediaEditSourceContext,
  composeGenerativeTakePatch,
  createMediaEditRequest,
  ensureBaselineTake,
  landProductionCandidate,
  getReplayRecipe,
  mediaEditGenerateMediaData,
  withResolvedMediaEditReferences,
  makeClipVersion
} from "@nodetool-ai/timeline";
import type {
  ClipVersion,
  CompiledProductionCandidate,
  MediaEditRequest,
  LineDeliveryRequest,
  TimelineClip,
  VideoGenerationRecipe
} from "@nodetool-ai/timeline";
import { deriveIdleClipStatus } from "./useGenerateClip";
import {
  durationBucketKey,
  type PendingProductionRequest,
  PENDING_TTL_MS,
  useDirectGenPendingStore
} from "./directGenPending";
import {
  isSettled,
  lookupGenerations,
  type GenerationLookupStatus
} from "../../lib/websocket/lookupGenerations";
import { watchGeneration } from "../../lib/websocket/generationWatch";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { getAssetUrl } from "../../utils/assetHelpers";
import { probeMediaDurationMs } from "../../utils/probeMediaDuration";
import { imageToVideoRequestSeconds } from "./imageToVideoSettings";

interface DirectGenRpcResponse extends WebSocketMessage {
  type: "rpc_response";
  request_id: string;
  command: string;
  result?: { asset_ids?: unknown; media_edit_references?: unknown };
  error?: { code?: string; message?: string };
}

/** The document store, with its undo history when the caller has one. */
type TimelineStoreHandle = Pick<TimelineStoreApi, "getState"> &
  Partial<Pick<TimelineStoreApi, "temporal">>;

/** The clip fields a generation owns: its status and what it produced. */
type GenerationPatch = Partial<
  Pick<
    TimelineClip,
    | "status"
    | "versions"
    | "currentAssetId"
    | "activeTakeId"
    | "inPointMs"
    | "outPointMs"
  >
>;

/** Apply a generation patch to one saved snapshot of a clip. */
const carryGenerationPatch = (
  clip: TimelineClip,
  patch: GenerationPatch
): TimelineClip => {
  const next = { ...clip, ...patch };
  if (patch.versions) {
    // A snapshot keeps its own takes: an undone take deletion still restores
    // the take. Only versions the snapshot has never seen are added.
    const known = new Set((clip.versions ?? []).map((version) => version.id));
    next.versions = [
      ...(clip.versions ?? []),
      ...patch.versions.filter((version) => !known.has(version.id))
    ];
  }
  return next;
};

/**
 * Write a generation's status or result outside the undo history.
 *
 * A render is not an edit. Recorded as one, Undo removed a paid take or put
 * the clip back to "generating" with nothing in flight, so it spun forever.
 * The patch is also carried into every saved snapshot that has the clip, so
 * undoing an earlier edit does not drop the take either.
 */
function writeGenerationState(
  timeline: TimelineStoreHandle,
  clipId: string,
  patch: GenerationPatch
): void {
  const history = timeline.temporal;
  if (!history) {
    timeline.getState().patchClip(clipId, patch);
    return;
  }
  const tracking = history.getState().isTracking;
  if (tracking) history.getState().pause();
  try {
    timeline.getState().patchClip(clipId, patch);
  } finally {
    if (tracking) history.getState().resume();
  }
  const carry = <S extends { clips: TimelineClip[] }>(snapshot: S): S =>
    snapshot.clips.some((clip) => clip.id === clipId)
      ? {
          ...snapshot,
          clips: snapshot.clips.map((clip) =>
            clip.id === clipId ? carryGenerationPatch(clip, patch) : clip
          )
        }
      : snapshot;
  const { pastStates, futureStates } = history.getState();
  history.setState({
    pastStates: pastStates.map(carry),
    futureStates: futureStates.map(carry)
  });
}

interface UseTimelineDirectGenJobApi {
  /** Returns the requestId once the RPC has been dispatched (or null on validation failure). */
  start: (
    clipId: string,
    production?: CompiledProductionCandidate,
    preparedRequestId?: string
  ) => Promise<string | null>;
  /** Replay a known text-to-video recipe as an inactive candidate take. */
  startNewTake: (input: {
    clipId: string;
    instruction?: string;
  }) => Promise<string | null>;
  startEdit: (input: {
    clipId: string;
    instruction: string;
    provider: string;
    model: string;
    strength?: number;
    resolution?: string;
  }) => Promise<string | null>;
  cancel: (clipId: string) => void;
  cancelEdit: (clipId: string) => void;
}

// Module-level so cancel() can tear down an in-flight subscription started by
// start() in a different render. Otherwise the response handler would still
// overwrite the user-set "draft" status after cancel.
interface InFlightJob {
  requestId: string;
  sequenceId: string | null;
  clipId: string;
  cleanup: () => void;
  mediaEdit?: MediaEditRequest;
  production?: PendingProductionRequest;
  generationRecipe?: VideoGenerationRecipe;
  candidateOnly?: boolean;
  lineDelivery?: LineDeliveryRequest;
  submittedParams?: Record<string, unknown>;
}

type DirectGenRequestMetadata =
  | PendingProductionRequest
  | VideoGenerationRecipe
  | undefined;

const isPendingProductionRequest = (
  metadata: DirectGenRequestMetadata
): metadata is PendingProductionRequest =>
  metadata !== undefined && "identity" in metadata && "snapshot" in metadata;

const inFlight = new Map<string, InFlightJob>();

const findInFlight = (
  sequenceId: string | null,
  clipId: string
): InFlightJob | undefined =>
  [...inFlight.values()].find(
    (job) => job.sequenceId === sequenceId && job.clipId === clipId
  );

const clearInFlight = (
  sequenceId: string | null,
  clipId: string,
  requestId?: string
): InFlightJob | undefined => {
  const job = requestId
    ? inFlight.get(requestId)
    : findInFlight(sequenceId, clipId);
  if (
    job &&
    job.clipId === clipId &&
    job.sequenceId === sequenceId &&
    (requestId === undefined || job.requestId === requestId)
  ) {
    job.cleanup();
    inFlight.delete(job.requestId);
    return job;
  }
  return undefined;
};

function fail(timeline: TimelineStoreHandle, clipId: string): void {
  writeGenerationState(timeline, clipId, { status: "failed" });
}

/**
 * Fail a clip and say why. A clip that flips to "failed" with no reason leaves
 * the creator (or the agent that asked) guessing what to fix.
 */
function failWithReason(
  timeline: TimelineStoreHandle,
  clipId: string,
  reason: string
): void {
  fail(timeline, clipId);
  const name = timeline.getState().clips.find((c) => c.id === clipId)?.name;
  useNotificationStore.getState().addNotification({
    type: "error",
    content: `Generation did not start${name ? ` for "${name}"` : ""}: ${reason}`,
    dedupeKey: `timeline-direct-gen-start-${clipId}`,
    replaceExisting: true
  });
}

/** The clip's generation parameters as they are right now. */
const snapshotSubmittedParams = (
  clip: TimelineClip
): Record<string, unknown> => ({
  prompt: clip.prompt,
  provider: clip.provider,
  model: clip.model,
  strength: clip.strength,
  numInferenceSteps: clip.numInferenceSteps,
  width: clip.width,
  height: clip.height,
  voice: clip.voice,
  aspectRatio: clip.aspectRatio,
  resolution: clip.resolution,
  negativePrompt: clip.negativePrompt,
  referenceImageIds: clip.referenceImageIds,
  referenceEntityIds: clip.referenceEntityIds
});

/**
 * A text-to-video clip's references as the request sends them. Picked images
 * go as reference images, so they are `[Image 1]`, `[Image 2]`, … in pick
 * order. Entities go as `entity://` mentions: the server writes each name and
 * descriptor into the prompt and sends its image after the picked ones.
 */
export const directGenReferences = (
  clip: Pick<TimelineClip, "prompt" | "referenceImageIds" | "referenceEntityIds">
): { images: Array<{ type: "image"; asset_id: string }>; prompt: string } => {
  const prompt = (clip.prompt ?? "").trim();
  const entityIds = clip.referenceEntityIds ?? [];
  return {
    images: (clip.referenceImageIds ?? []).map((assetId) => ({
      type: "image" as const,
      asset_id: assetId
    })),
    prompt:
      entityIds.length > 0
        ? `${prompt}\n\nCast: ${entityIds.map((id) => `entity://${id}`).join(", ")}.`
        : prompt
  };
};

/** Every request still open for one clip, whatever kind it is. */
const inFlightForClip = (
  sequenceId: string | null,
  clipId: string
): InFlightJob[] =>
  [...inFlight.values()].filter(
    (job) => job.sequenceId === sequenceId && job.clipId === clipId
  );

/**
 * Starts that have passed their guards but have not yet reached
 * `subscribeDirectGen`. `start` awaits a storyboard lookup before the clip is
 * marked generating, so a second call in that window would pass the status
 * guard and send a second paid request.
 */
const startingDirectGen = new Set<string>();

/**
 * Drop the live subscriptions of one sequence without settling anything.
 *
 * Called when the editor closes. The pending entries stay, so the next open
 * reattaches each request and lands it from its generation row. Letting the
 * subscription survive the editor means the reply settles the entry and
 * patches a store that no longer saves.
 */
export function detachSequenceJobs(sequenceId: string): void {
  for (const job of [...inFlight.values()]) {
    if (job.sequenceId === sequenceId) {
      job.cleanup();
    }
  }
}

/** Clear every module-level record. Test isolation only. */
export const __resetDirectGenJobsForTests = (): void => {
  for (const job of [...inFlight.values()]) job.cleanup();
  inFlight.clear();
  startingDirectGen.clear();
};

async function fitGeneratedAudio(
  timeline: TimelineStoreHandle,
  clip: TimelineClip,
  assetId: string
): Promise<void> {
  try {
    const asset = await useAssetStore.getState().get(assetId);
    const url = getAssetUrl(asset);
    const durationMs =
      asset.duration && asset.duration > 0
        ? Math.round(asset.duration * 1000)
        : url
          ? await probeMediaDurationMs(url, "audio")
          : null;
    const current = timeline
      .getState()
      .clips.find((item) => item.id === clip.id);
    // A late probe must not undo a trim, lock, or subsequent generation.
    if (
      durationMs &&
      current &&
      !current.locked &&
      current.currentAssetId === assetId &&
      current.status === "generated" &&
      (current.speedMultiplier ?? 1) === 1 &&
      !current.timeRemap &&
      current.durationMs === clip.durationMs &&
      current.inPointMs === undefined &&
      current.outPointMs === undefined
    ) {
      timeline.getState().patchClip(clip.id, { durationMs });
    }
  } catch {
    // Keep the generated asset and editable placeholder length if metadata is unavailable.
  }
}

/** One request's outcome, however it was learned. */
export interface DirectGenOutcome {
  assetIds: readonly string[];
  errored: boolean;
  status?: GenerationLookupStatus;
  mediaEditReferences?: unknown;
}

/**
 * Write one outcome onto its clip and settle its pending entry.
 *
 * Two roads reach here and must land identically: the `rpc_response` on the
 * open socket, and the generation row read back after a reload that lost that
 * socket. A version recorded one way and not the other is a take the creator
 * paid for and cannot see.
 */
export function landDirectGen(
  timeline: TimelineStoreHandle,
  clipId: string,
  requestId: string,
  sequenceId: string | null,
  outcome: DirectGenOutcome,
  generationRecipe?: VideoGenerationRecipe,
  candidateOnly = false,
  lineDelivery?: LineDeliveryRequest,
  submittedParams?: Record<string, unknown>
): void {
  // Any subscription still open for this clip is done: it would settle a
  // second time on the reply and append the same version twice.
  clearInFlight(sequenceId, clipId, requestId);
  const store = timeline.getState();
  const pendingJob = sequenceId
    ? useDirectGenPendingStore
        .getState()
        .pending[sequenceId]?.find(
          (job) => job.clipId === clipId && job.requestId === requestId
        )
    : undefined;
  const recipe = generationRecipe ?? pendingJob?.generationRecipe;
  const delivery = lineDelivery ?? pendingJob?.lineDelivery;
  const keepAcceptedTake = candidateOnly || pendingJob?.candidateOnly === true;
  const first = outcome.errored ? undefined : outcome.assetIds[0];
  if (!first) {
    if (sequenceId) {
      useDirectGenPendingStore
        .getState()
        .settle(sequenceId, clipId, undefined, requestId);
    }
    if (
      !keepAcceptedTake &&
      (sequenceId === null || store.sequenceId === sequenceId)
    ) {
      writeGenerationState(timeline, clipId, { status: "failed" });
    }
    return;
  }

  if (sequenceId) {
    // Settled before the clip is looked up, because the pending entry belongs
    // to the request, not to whether its clip is still on screen. Returning
    // early with the entry still listed is what let a sequence resurrect a
    // request that had already answered.
    //
    // Only a request that produced an asset files a duration: a refusal
    // measures the provider's error path, not its render time (D14).
    useDirectGenPendingStore
      .getState()
      .settle(sequenceId, clipId, Date.now(), requestId);
  }

  if (sequenceId !== null && store.sequenceId !== sequenceId) return;
  const current = store.clips.find((c) => c.id === clipId);
  if (!current) return;
  const activeTakeId = activeTakeIdOf(current);
  const recordedParams = recipe
    ? {
        prompt: recipe.prompt,
        provider: recipe.provider,
        model: recipe.model,
        durationMs: recipe.durationMs,
        aspectRatio: recipe.aspectRatio,
        resolution: recipe.resolution,
        width: recipe.width,
        height: recipe.height,
        strength: recipe.strength,
        numInferenceSteps: recipe.numInferenceSteps,
        seed: recipe.seed,
        negativePrompt: recipe.negativePrompt,
        referenceAssetIds: recipe.referenceAssetIds
      }
    : delivery
      ? {
          action: delivery.action,
          modelTask: delivery.modelTask,
          sourceContext: delivery.sourceContext,
          instructions: delivery.instructions,
          speed: delivery.speed
        }
      : (submittedParams ??
        pendingJob?.submittedParams ??
        snapshotSubmittedParams(current));
  const versionOverrides: Partial<ClipVersion> = {
    jobId: requestId,
    assetId: first,
    workflowUpdatedAt: new Date().toISOString(),
    dependencyHash: "",
    durationMs: current.durationMs,
    requestId,
    paramOverridesSnapshot: recordedParams
  };
  if (recipe) {
    Object.assign(versionOverrides, {
      source: "generated" as const,
      generationRecipe: recipe,
      prompt: recipe.prompt,
      provider: recipe.provider,
      model: recipe.model,
      negativePrompt: recipe.negativePrompt
    });
  }
  if (delivery) {
    Object.assign(versionOverrides, {
      source: "generated" as const,
      lineDelivery: { ...delivery, requestId },
      prompt: delivery.sourceContext.text,
      provider: delivery.sourceContext.voice.provider,
      model: delivery.sourceContext.voice.model
    });
  }
  if (keepAcceptedTake && activeTakeId) {
    versionOverrides.parentTakeId = activeTakeId;
  }
  const newVersion = makeClipVersion(versionOverrides);
  // Locked clips don't get their currentAssetId replaced — but the version
  // is still recorded so the user can restore it later.
  const patch: GenerationPatch = {
    status: "generated",
    versions: [...(current.versions ?? []), newVersion]
  };
  if (!current.locked && !keepAcceptedTake) {
    patch.currentAssetId = first;
    // Every asset writer must keep this alias in sync with currentAssetId,
    // or list_takes/delete_take mis-identify which take is actually playing.
    patch.activeTakeId = newVersion.id;
    // Reset trim window — a fresh roll is a fresh source.
    patch.inPointMs = undefined;
    patch.outPointMs = undefined;
  }
  writeGenerationState(timeline, clipId, patch);
  if (
    (current.bindingKind === "text-to-audio" ||
      current.bindingKind === "text-to-music") &&
    !current.locked
  ) {
    void fitGeneratedAudio(timeline, current, first);
  }
}

const productionSettlementStatus = (
  outcome: DirectGenOutcome
): "completed" | "failed" | "cancelled" => {
  if (outcome.status === "cancelled") return "cancelled";
  return !outcome.errored && outcome.assetIds[0] ? "completed" : "failed";
};

const applyProductionCandidate = (
  timeline: TimelineStoreHandle,
  sequenceId: string | null,
  clipId: string,
  requestId: string,
  production: PendingProductionRequest,
  assetId: string
): boolean => {
  const state = timeline.getState();
  if (sequenceId !== null && state.sequenceId !== sequenceId) {
    return false;
  }
  const current = state.clips.find((clip) => clip.id === clipId);
  if (!current || production.identity.destinationId !== clipId) {
    return false;
  }
  const base = makeClipVersion({
    jobId: requestId,
    assetId,
    workflowUpdatedAt: new Date().toISOString(),
    dependencyHash: current.dependencyHash ?? "",
    paramOverridesSnapshot: {
      prompt: production.snapshot.prompt,
      provider: production.snapshot.provider,
      model: production.snapshot.model,
      referenceAssetIds: [...production.referenceAssetIds]
    },
    ...(production.snapshot.requestedDurationMs !== undefined && {
      durationMs: production.snapshot.requestedDurationMs
    }),
    ...(production.snapshot.provider !== undefined && {
      provider: production.snapshot.provider
    }),
    ...(production.snapshot.model !== undefined && {
      model: production.snapshot.model
    }),
    ...(production.snapshot.prompt !== undefined && {
      prompt: production.snapshot.prompt
    })
  });
  const landed = landProductionCandidate(current, {
    identity: production.identity,
    version: {
      ...base,
      productionSnapshot: production.snapshot
    }
  });
  if (landed !== current) {
    writeGenerationState(timeline, clipId, { versions: landed.versions });
  }
  return true;
};

/** Land one production attempt without activating its candidate. */
export function landProductionDirectGen(
  timeline: TimelineStoreHandle,
  clipId: string,
  requestId: string,
  sequenceId: string | null,
  production: PendingProductionRequest,
  outcome: DirectGenOutcome
): void {
  clearInFlight(sequenceId, clipId, requestId);
  const assetId = outcome.errored ? undefined : outcome.assetIds[0];
  const status = productionSettlementStatus(outcome);
  if (sequenceId) {
    const failedMessage =
      status === "failed"
        ? "Production generation failed before producing a candidate."
        : undefined;
    const claimed = useDirectGenPendingStore.getState().settleProduction({
      sequenceId,
      clipId,
      requestId,
      production,
      status,
      assetIds: assetId ? [assetId] : [],
      ...(failedMessage !== undefined && { errorMessage: failedMessage }),
      finishedAt: Date.now()
    });
    if (!claimed) return;
  }
  if (assetId) {
    applyProductionCandidate(
      timeline,
      sequenceId,
      clipId,
      requestId,
      production,
      assetId
    );
  }
}

const applyMediaEditCandidate = (
  timeline: TimelineStoreHandle,
  clipId: string,
  requestId: string,
  request: MediaEditRequest,
  assetId: string
): boolean => {
  const state = timeline.getState();
  if (state.sequenceId !== request.sourceContext.sequenceId) {
    return false;
  }
  const current = state.clips.find(
    (clip) => clip.id === request.sourceContext.clipId && clip.id === clipId
  );
  if (!current) {
    useDirectGenPendingStore.getState().markEditOrphaned(requestId);
    return false;
  }
  const next = composeGenerativeTakePatch(current, "restyle", {
    assetId,
    jobId: requestId,
    createdAt: new Date().toISOString(),
    provider: request.provider,
    model: request.model,
    prompt: request.instruction,
    durationMs: request.sourceContext.timelineDurationMs,
    mediaEdit: request
  });
  if (next !== current) {
    writeGenerationState(timeline, clipId, { versions: next.versions });
  }
  return true;
};

const mediaEditSettlementStatus = (
  outcome: DirectGenOutcome
): "completed" | "failed" | "cancelled" => {
  if (outcome.status === "cancelled") return "cancelled";
  if (
    outcome.status === "failed" ||
    outcome.status === "needs_attention" ||
    outcome.status === "interrupted"
  ) {
    return "failed";
  }
  return outcome.assetIds[0] ? "completed" : "failed";
};

/** Land an edit as an inactive take using only its submission snapshot. */
export function landMediaEdit(
  timeline: TimelineStoreHandle,
  clipId: string,
  requestId: string,
  sequenceId: string | null,
  request: MediaEditRequest,
  outcome: DirectGenOutcome
): void {
  request = withResolvedMediaEditReferences(request, outcome.mediaEditReferences);
  clearInFlight(sequenceId, clipId, requestId);
  const destinationSequenceId = request.sourceContext.sequenceId;
  const assetId = outcome.errored ? undefined : outcome.assetIds[0];
  const status = mediaEditSettlementStatus(outcome);
  if (status === "failed") {
    useDirectGenPendingStore
      .getState()
      .markEditFailure(
        destinationSequenceId,
        request.sourceContext.clipId,
        "The video edit failed before producing a candidate."
      );
  }
  const claimed = useDirectGenPendingStore.getState().settleEdit({
    sequenceId: destinationSequenceId,
    clipId: request.sourceContext.clipId,
    requestId,
    mediaEdit: request,
    status,
    assetIds: assetId ? [assetId] : [],
    finishedAt: Date.now()
  });
  if (!claimed) return;
  if (!assetId) {
    useDirectGenPendingStore
      .getState()
      .markEditFailure(
        destinationSequenceId,
        request.sourceContext.clipId,
        "The video edit failed before producing a candidate."
      );
    return;
  }
  // `sequenceId` is retained for callers that still pass the captured
  // destination separately. The request snapshot is authoritative, and the
  // explicit comparison prevents a stale adapter from redirecting a result.
  if (sequenceId !== null && sequenceId !== destinationSequenceId) return;
  applyMediaEditCandidate(timeline, clipId, requestId, request, assetId);
}

/**
 * Subscribe to one request's reply and write the result onto the clip.
 *
 * Extracted from `start` because reattachment on open needs exactly this and
 * nothing else: a reload has the request id from the persisted list but no
 * closure to resume, and a second copy of the settle logic would be a second
 * place for "locked clips keep their asset" to be got wrong.
 */
export function subscribeDirectGen(
  timeline: TimelineStoreHandle,
  clipId: string,
  requestId: string,
  /**
   * The sequence this request was sent for. Passed in rather than read off the
   * store when the reply lands: a reply arrives minutes later, and the creator
   * may have opened another sequence by then. Settling against whatever is open
   * would leave this sequence's entry in the pending list forever, and
   * reattachment would later restore it, set the clip back to `generating` and
   * subscribe to a request that has already answered — a clip stuck rendering
   * over a render that was paid for and thrown away.
   */
  sequenceId: string | null,
  /**
   * Poll the generation row until it settles, giving up at this timestamp.
   * Both the live send and reattachment pass it.
   *
   * The subscription alone cannot recover a reconnect. `subscribe` is a
   * client-side map with no replay, and the server writes the `rpc_response`
   * to the socket that asked — so a reply that landed while that socket was
   * gone reaches nobody, whether the browser reloaded or the connection just
   * dropped and came back. Reading the row is what actually recovers those,
   * and it also covers the window between a lookup and the subscription that
   * follows it. The subscription only gets there faster, when the socket is
   * the same one the request went out on.
  */
  watchUntil?: number,
  mediaEdit?: MediaEditRequest,
  productionOrRecipe?: DirectGenRequestMetadata,
  candidateOnly = false,
  lineDelivery?: LineDeliveryRequest,
  submittedParams?: Record<string, unknown>
): () => void {
  const production = isPendingProductionRequest(productionOrRecipe)
    ? productionOrRecipe
    : undefined;
  const generationRecipe: VideoGenerationRecipe | undefined =
    isPendingProductionRequest(productionOrRecipe)
      ? undefined
      : productionOrRecipe;
  // Only this request's own earlier subscription is replaced. Other requests
  // on the same clip (an edit, a New take, a production attempt) are separate.
  clearInFlight(sequenceId, clipId, requestId);
  let unsubscribe: (() => void) | undefined;
  let stopWatch: (() => void) | undefined;
  const cleanup = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = undefined;
    }
    if (stopWatch) {
      stopWatch();
      stopWatch = undefined;
    }
    inFlight.delete(requestId);
  };

  const settle = (msg: DirectGenRpcResponse) => {
    const assetIds = Array.isArray(msg.result?.asset_ids)
      ? (msg.result!.asset_ids as unknown[]).filter(
          (v): v is string => typeof v === "string"
        )
      : [];
    const outcome = {
      assetIds,
      mediaEditReferences: msg.result?.media_edit_references,
      errored: Boolean(msg.error),
      status: msg.error ? ("failed" as const) : ("completed" as const)
    };
    if (production) {
      landProductionDirectGen(
        timeline,
        clipId,
        requestId,
        sequenceId,
        production,
        outcome
      );
    } else if (mediaEdit) {
      landMediaEdit(
        timeline,
        clipId,
        requestId,
        sequenceId,
        mediaEdit,
        outcome
      );
    } else {
      landDirectGen(
        timeline,
        clipId,
        requestId,
        sequenceId,
        outcome,
        generationRecipe,
        candidateOnly,
        lineDelivery,
        submittedParams
      );
    }
  };

  unsubscribe = globalWebSocketManager.subscribe(requestId, (msg) => {
    if (msg.type !== "rpc_response") return;
    settle(msg as DirectGenRpcResponse);
  });
  if (watchUntil !== undefined) {
    stopWatch = watchGeneration(requestId, watchUntil, (outcome) => {
      stopWatch = undefined;
      if (!outcome) {
        // The window ran out with the row still running. Nothing more is
        // coming that this client can see, so the clip offers Retry rather
        // than rendering forever.
        cleanup();
        if (sequenceId) {
          if (production) {
            useDirectGenPendingStore.getState().settleProduction({
              sequenceId,
              clipId,
              requestId,
              production,
              status: "expired",
              assetIds: [],
              errorMessage:
                "Production generation expired before producing a candidate."
            });
          } else if (mediaEdit) {
            useDirectGenPendingStore.getState().settleEdit({
              sequenceId: mediaEdit.sourceContext.sequenceId,
              clipId: mediaEdit.sourceContext.clipId,
              requestId,
              mediaEdit,
              status: "expired",
              assetIds: []
            });
            useDirectGenPendingStore
              .getState()
              .markEditFailure(
                mediaEdit.sourceContext.sequenceId,
                mediaEdit.sourceContext.clipId,
                "The video edit expired before producing a candidate."
              );
          } else {
            useDirectGenPendingStore
              .getState()
              .settle(sequenceId, clipId, undefined, requestId);
          }
        }
        if (!mediaEdit && !production && !candidateOnly) {
          fail(timeline, clipId);
        }
        return;
      }
      const directOutcome = {
        assetIds: outcome.assetIds,
        mediaEditReferences: outcome.mediaEditReferences,
        errored: outcome.status !== "completed",
        status: outcome.status
      };
      if (production) {
        landProductionDirectGen(
          timeline,
          clipId,
          requestId,
          sequenceId,
          production,
          directOutcome
        );
      } else if (mediaEdit) {
        landMediaEdit(
          timeline,
          clipId,
          requestId,
          sequenceId,
          mediaEdit,
          directOutcome
        );
      } else {
        landDirectGen(
          timeline,
          clipId,
          requestId,
          sequenceId,
          directOutcome,
          generationRecipe,
          candidateOnly,
          lineDelivery,
          submittedParams
        );
      }
    });
  }
  inFlight.set(requestId, {
    requestId,
    sequenceId,
    clipId,
    cleanup,
    mediaEdit,
    production,
    generationRecipe,
    candidateOnly,
    lineDelivery,
    submittedParams
  });
  return cleanup;
}

const recoverSettledMediaEdits = (
  timeline: TimelineStoreHandle,
  sequenceId: string
): void => {
  const state = timeline.getState();
  if (state.sequenceId !== sequenceId) return;
  const settlements = Object.values(
    useDirectGenPendingStore.getState().editSettlements
  ).filter(
    (settlement) =>
      settlement.sequenceId === sequenceId &&
      settlement.status === "completed" &&
      settlement.acknowledgedAt === undefined
  );
  for (const settlement of settlements) {
    const assetId = settlement.assetIds[0];
    if (!assetId) continue;
    const current = timeline
      .getState()
      .clips.find((clip) => clip.id === settlement.clipId);
    if (!current) {
      useDirectGenPendingStore
        .getState()
        .markEditOrphaned(settlement.requestId);
      continue;
    }
    applyMediaEditCandidate(
      timeline,
      settlement.clipId,
      settlement.requestId,
      settlement.mediaEdit,
      assetId
    );
  }
};

const recoverSettledProduction = (
  timeline: TimelineStoreHandle,
  sequenceId: string
): void => {
  if (timeline.getState().sequenceId !== sequenceId) return;
  const settlements = Object.values(
    useDirectGenPendingStore.getState().productionSettlements
  ).filter(
    (settlement) =>
      settlement.sequenceId === sequenceId && settlement.status === "completed"
  );
  for (const settlement of settlements) {
    const assetId = settlement.assetIds[0];
    if (!assetId) continue;
    applyProductionCandidate(
      timeline,
      sequenceId,
      settlement.clipId,
      settlement.requestId,
      settlement.production,
      assetId
    );
  }
};

/**
 * Recover the requests this sequence had in flight when it was closed
 * (criterion 6).
 *
 * The generation row is authoritative here, not the socket. A reply that
 * landed while the browser was shut was written to a socket that no longer
 * exists, and `subscribe` has no replay — so an entry is looked up against its
 * row, and one that already settled lands from the row. An entry the row still
 * calls `running` is *both* subscribed and polled: the subscription wins when
 * the socket outlived the sequence, and the poll is what gets there at all
 * after a reload, or when the reply arrives in the window between the lookup
 * and the subscription.
 *
 * Clips the sequence no longer has, and entries too old to be answered, are
 * dropped rather than recovered either way.
 */
export async function reattachSequenceJobs(
  timeline: TimelineStoreHandle,
  sequenceId: string,
  /** Returns false once the editor that asked has gone away. */
  isCurrent: () => boolean = () => true
): Promise<void> {
  await reattachRestoredJobs(timeline, sequenceId, isCurrent);
  if (isCurrent()) failOrphanedGenerating(timeline, sequenceId);
}

/**
 * A direct-gen clip saved as "generating" or "queued" whose request has no
 * live record here: the entry expired, the request ran in another browser, or
 * this is a fresh tab. Nothing will ever settle it, so it fails and offers
 * Retry instead of spinning forever with Generate disabled.
 *
 * Runs after reattachment, when every recoverable request is either landed or
 * subscribed again.
 */
function failOrphanedGenerating(
  timeline: TimelineStoreHandle,
  sequenceId: string
): void {
  const state = timeline.getState();
  if (state.sequenceId !== sequenceId) return;
  failOrphanedImports(timeline, sequenceId);
  const orphaned = state.clips.filter(
    (clip) =>
      (clip.status === "generating" || clip.status === "queued") &&
      isDirectGenBindingKind(clip.bindingKind) &&
      !inFlightForClip(sequenceId, clip.id).some(
        (job) => !job.mediaEdit && !job.production && !job.candidateOnly
      )
  );
  if (orphaned.length === 0) return;
  for (const clip of orphaned) {
    writeGenerationState(timeline, clip.id, { status: "failed" });
  }
  useNotificationStore.getState().addNotification({
    type: "warning",
    content:
      orphaned.length === 1
        ? `"${orphaned[0].name}" was generating when this timeline closed and its request could not be found. Retry to generate it again.`
        : `${orphaned.length} clips were generating when this timeline closed and their requests could not be found. Retry to generate them again.`,
    dedupeKey: `timeline-direct-gen-orphaned-${sequenceId}`,
    replaceExisting: true
  });
}

/**
 * Ask the server to stop these requests. Clearing the clip alone left the
 * provider call running, so Cancel then Generate paid for two renders.
 * Nothing waits on the reply: the clip is already settled locally.
 */
function sendCancelGeneration(requestIds: readonly string[]): void {
  if (requestIds.length === 0) return;
  globalWebSocketManager
    .send({
      command: "cancel_generation",
      request_id: crypto.randomUUID(),
      data: { request_ids: [...requestIds] }
    })
    .catch((error: unknown) => {
      console.error("Failed to cancel generation on the server:", error);
    });
}

/**
 * An imported clip saved while its media was still being produced, such as
 * the audio extracted from a dropped video. The request that fills it lives
 * only in the tab that dropped the video, so on load nothing will.
 */
function failOrphanedImports(
  timeline: TimelineStoreHandle,
  sequenceId: string
): void {
  const orphaned = timeline
    .getState()
    .clips.filter(
      (clip) =>
        clip.sourceType === "imported" &&
        clip.status === "generating" &&
        !clip.currentAssetId
    );
  if (orphaned.length === 0) return;
  for (const clip of orphaned) {
    writeGenerationState(timeline, clip.id, { status: "failed" });
  }
  useNotificationStore.getState().addNotification({
    type: "warning",
    content:
      orphaned.length === 1
        ? `"${orphaned[0].name}" was still being extracted when this timeline closed. Import the video again to extract its audio.`
        : `${orphaned.length} clips were still being extracted when this timeline closed. Import their videos again to extract the audio.`,
    dedupeKey: `timeline-import-orphaned-${sequenceId}`,
    replaceExisting: true
  });
}

const isDirectGenBindingKind = (kind: string | undefined): boolean =>
  kind === "text-to-image" ||
  kind === "image-to-image" ||
  kind === "text-to-video" ||
  kind === "image-to-video" ||
  kind === "text-to-audio" ||
  kind === "text-to-music";

async function reattachRestoredJobs(
  timeline: TimelineStoreHandle,
  sequenceId: string,
  isCurrent: () => boolean
): Promise<void> {
  const restored = useDirectGenPendingStore.getState().restore(sequenceId);
  recoverSettledMediaEdits(timeline, sequenceId);
  recoverSettledProduction(timeline, sequenceId);
  if (restored.length === 0) return;
  await globalWebSocketManager.ensureConnection();
  if (!isCurrent()) return;

  const clips = timeline.getState().clips;
  const live = restored.filter((job) => {
    if (clips.some((candidate) => candidate.id === job.clipId)) {
      return true;
    }
    if (job.mediaEdit) {
      useDirectGenPendingStore.getState().settleEdit({
        sequenceId: job.mediaEdit.sourceContext.sequenceId,
        clipId: job.mediaEdit.sourceContext.clipId,
        requestId: job.requestId,
        mediaEdit: job.mediaEdit,
        status: "orphaned",
        assetIds: []
      });
    } else if (job.production) {
      useDirectGenPendingStore.getState().settleProduction({
        sequenceId,
        clipId: job.clipId,
        requestId: job.requestId,
        production: job.production,
        status: "orphaned",
        assetIds: []
      });
    } else {
      useDirectGenPendingStore
        .getState()
        .settle(sequenceId, job.clipId, undefined, job.requestId);
    }
    return false;
  });
  if (live.length === 0) {
    return;
  }

  const outcomes = await lookupGenerations(live.map((job) => job.requestId));
  // The editor closed while the rows were being read. Subscribing now would
  // leave a listener patching a store nothing saves.
  if (!isCurrent()) return;

  for (const job of live) {
    const outcome = outcomes.get(job.requestId);
    if (outcome && isSettled(outcome.status)) {
      // The row settled while this client was away. Land it from the row: the
      // frame that would have carried it went to a socket that is gone.
      const directOutcome = {
        assetIds: outcome.assetIds,
        mediaEditReferences: outcome.mediaEditReferences,
        errored: outcome.status !== "completed",
        status: outcome.status
      };
      if (job.production) {
        landProductionDirectGen(
          timeline,
          job.clipId,
          job.requestId,
          sequenceId,
          job.production,
          directOutcome
        );
      } else if (job.mediaEdit) {
        landMediaEdit(
          timeline,
          job.clipId,
          job.requestId,
          sequenceId,
          job.mediaEdit,
          directOutcome
        );
      } else {
        landDirectGen(
          timeline,
          job.clipId,
          job.requestId,
          sequenceId,
          directOutcome,
          job.generationRecipe,
          job.candidateOnly,
          job.lineDelivery,
          job.submittedParams
        );
      }
      continue;
    }
    // Still running, or no row to read yet. The clip goes back to
    // `generating`, and the row is watched until it settles — bounded by what
    // is left of this entry's own window, after which the clip fails and
    // offers Retry rather than rendering forever.
    if (!job.mediaEdit && !job.production && !job.candidateOnly) {
      writeGenerationState(timeline, job.clipId, { status: "generating" });
    }
    subscribeDirectGen(
      timeline,
      job.clipId,
      job.requestId,
      sequenceId,
      job.startedAt + PENDING_TTL_MS,
      job.mediaEdit,
      job.production ?? job.generationRecipe,
      job.candidateOnly,
      job.lineDelivery,
      job.submittedParams
    );
  }
}

/**
 * Aspect ratio / resolution / duration, each present only for the kinds of
 * generation that take it.
 */
type FramingParams = {
  aspect_ratio?: string;
  resolution?: string;
  duration?: number;
};

const productionAttempt = (
  sequenceId: string | null,
  production: CompiledProductionCandidate
): PendingProductionRequest | null => {
  if (production.executionRoute === "audio_driven_performance") {
    throw new Error(
      "Direct generation does not support audio-driven on-camera performance."
    );
  }
  if (
    [...inFlight.values()].some(
      (job) =>
        job.sequenceId === sequenceId &&
        job.production?.identity.candidateId === production.identity.candidateId
    )
  ) {
    return null;
  }
  const settlements = sequenceId
    ? Object.values(
        useDirectGenPendingStore.getState().productionSettlements
      ).filter(
        (settlement) =>
          settlement.sequenceId === sequenceId &&
          settlement.production.identity.candidateId ===
            production.identity.candidateId
      )
    : [];
  if (settlements.some((settlement) => settlement.status === "completed")) {
    return null;
  }
  const attemptId =
    settlements.length === 0
      ? production.identity.requestId
      : `${production.identity.requestId}:retry:${settlements.length + 1}`;
  return { ...production, attemptId };
};

export function useTimelineDirectGenJob(): UseTimelineDirectGenJobApi {
  // Capture the surrounding instance's document store once; all reads and
  // writes in the async flow below go through this same handle so a focus
  // switch to another timeline instance mid-generation can't redirect them.
  const timeline = useTimelineStoreApi();

  const runStart = useCallback(
    async (
      clipId: string,
      productionCandidate?: CompiledProductionCandidate,
      preparedRequestId?: string
    ): Promise<string | null> => {
      const clip = timeline.getState().clips.find((c) => c.id === clipId);
      if (!clip) return null;
      if (
        productionCandidate &&
        (productionCandidate.identity.destinationKind !== "timeline_clip" ||
          productionCandidate.identity.destinationId !== clipId)
      ) {
        throw new Error(
          "Production request does not target this timeline clip."
        );
      }
      const kind = clip.bindingKind;
      if (
        kind !== "text-to-image" &&
        kind !== "image-to-image" &&
        kind !== "text-to-video" &&
        kind !== "image-to-video" &&
        kind !== "text-to-audio" &&
        kind !== "text-to-music"
      ) {
        return null;
      }
      if (
        !productionCandidate &&
        (clip.status === "queued" || clip.status === "generating")
      ) {
        return null;
      }
      if (!clip.provider || !clip.model) {
        failWithReason(timeline, clipId, "choose a provider and model first.");
        return null;
      }
      const prompt = (
        productionCandidate?.snapshot.prompt ?? clip.prompt ?? ""
      ).trim();
      if (!prompt) {
        failWithReason(timeline, clipId, "the prompt is empty.");
        return null;
      }

      // image-to-image and image-to-video need a rendered source clip to
      // draw bytes from.
      const hasSourceClip =
        kind === "image-to-image" || kind === "image-to-video";
      let sourceAssetId: string | undefined;
      if (hasSourceClip) {
        if (!clip.sourceClipId) {
          failWithReason(timeline, clipId, "choose a source clip first.");
          return null;
        }
        const sourceClip = timeline
          .getState()
          .clips.find((c) => c.id === clip.sourceClipId);
        if (!sourceClip?.currentAssetId) {
          failWithReason(
            timeline,
            clipId,
            "the source clip has not been generated yet."
          );
          return null;
        }
        sourceAssetId = sourceClip.currentAssetId;
      }

      for (const candidate of [clip, hasSourceClip ? timeline.getState().clips.find(c => c.id === clip.sourceClipId) : undefined]) {
        if (!candidate?.storyboardBoardId) { continue; }
        const board = await trpcClient.storyboards.get.query({ id: candidate.storyboardBoardId });
        const shot = board.document.shots.find(shot => shot.id === candidate.storyboardShotId);
        if (!shot) { throw new Error("Storyboard generation source shot was not found."); }
        const capability = kind === "text-to-video" ? (productionCandidate?.executionRoute === "reference_to_video" ? "reference_to_video" : "text_to_video") : kind === "image-to-video" ? "image_to_video" : kind === "image-to-image" ? "image_to_image" : "text_to_image";
        assertProductionGenerationAllowed(shot.production === undefined ? undefined : productionRequirement.parse(shot.production), capability);
      }

      const recipeResult =
        kind === "text-to-video"
          ? captureVideoGenerationRecipe(clip)
          : { ok: false as const, reason: "Not a text-to-video clip." };
      const generationRecipe = recipeResult.ok
        ? recipeResult.recipe
        : undefined;
      // Read before the subscription, and captured by it: the reply is settled
      // against the sequence the request was sent for, not whichever one is
      // open when it lands.
      const sequenceId = timeline.getState().sequenceId;
      const production = productionCandidate
        ? productionAttempt(sequenceId, productionCandidate)
        : undefined;
      if (production === null) return null;
      const requestId =
        production?.attemptId ?? preparedRequestId ?? crypto.randomUUID();
      // What this request sends, frozen now. The clip may be edited while the
      // render runs, and the take must record what was actually rendered.
      const submittedParams =
        production || generationRecipe
          ? undefined
          : snapshotSubmittedParams(clip);
      if (!production) {
        writeGenerationState(timeline, clipId, { status: "generating" });
      }
      // Watched from the send, not only from a reattach. A socket that drops
      // and reconnects without a reload — a network blip — leaves the reply
      // addressed to a server session that is gone, exactly as a reload does,
      // and nothing re-runs reattachment in that case. The row is the
      // authority everywhere; the subscription just gets there faster.
      const cleanup = subscribeDirectGen(
        timeline,
        clipId,
        requestId,
        sequenceId,
        Date.now() + PENDING_TTL_MS,
        undefined,
        production ?? generationRecipe,
        false,
        undefined,
        submittedParams
      );
      if (sequenceId) {
        // Recorded before the send, so a reply that arrives after the tab is
        // closed still has an entry to be reattached through.
        useDirectGenPendingStore.getState().remember(sequenceId, {
          clipId,
          requestId,
          startedAt: Date.now(),
          bucket: durationBucketKey(kind, clip.model),
          ...(generationRecipe !== undefined && { generationRecipe }),
          ...(production !== undefined && { production }),
          ...(submittedParams !== undefined && { submittedParams })
        });
      }

      // Image and video models take aspect ratio / resolution natively; pass
      // them through when set. Video additionally derives its requested duration
      // from the clip's timeline length (width & height are ignored for video).
      const framingParams: FramingParams = {};
      if (kind !== "text-to-audio" && kind !== "text-to-music") {
        framingParams.aspect_ratio = clip.aspectRatio;
        framingParams.resolution = clip.resolution;
      }
      if (kind === "text-to-video" || kind === "text-to-music") {
        framingParams.duration = clip.durationMs
          ? Math.round(clip.durationMs / 1000)
          : undefined;
      }
      if (kind === "image-to-video") {
        framingParams.duration = imageToVideoRequestSeconds(clip.durationMs);
      }

      // The clip's own references. A production request carries its own.
      const picked = !production && kind === "text-to-video"
        ? directGenReferences(clip)
        : { images: [], prompt };

      try {
        await globalWebSocketManager.send({
          command: "generate_media",
          request_id: requestId,
          data: {
            mode:
              kind === "text-to-image"
                ? "image"
                : kind === "image-to-image"
                  ? "image_edit"
                  : kind === "text-to-video" || kind === "image-to-video"
                    ? "video"
                    : kind === "text-to-music"
                      ? "music"
                      : "audio",
            provider: clip.provider,
            model: clip.model,
            prompt: production ? prompt : picked.prompt,
            source_asset_id: sourceAssetId,
            timeline_context: sequenceId ? {
              sequence_id: sequenceId,
              source_clip_id: hasSourceClip ? clip.sourceClipId ?? undefined : undefined,
              target_clip_id: clip.id
            } : undefined,
            width: clip.width,
            height: clip.height,
            strength: clip.strength,
            num_inference_steps: clip.numInferenceSteps,
            ...(clip.seed !== undefined && { seed: clip.seed }),
            ...(clip.negativePrompt !== undefined && {
              negative_prompt: clip.negativePrompt
            }),
            variations: 1,
            voice: kind === "text-to-audio" ? clip.voice : undefined,
            capability:
              production?.executionRoute === "reference_to_video" ||
              picked.images.length > 0
                ? "reference_to_video"
                : undefined,
            reference_images:
              production?.executionRoute === "reference_to_video"
                ? production.referenceAssetIds.map((assetId) => ({
                    type: "image",
                    asset_id: assetId
                  }))
                : picked.images.length > 0
                  ? picked.images
                  : undefined,
            ...framingParams
          }
        });
      } catch {
        cleanup();
        // The same captured id: the send failed, so the entry to drop is the
        // one this request wrote, not whatever is open.
        if (sequenceId) {
          if (production) {
            useDirectGenPendingStore.getState().settleProduction({
              sequenceId,
              clipId,
              requestId,
              production,
              status: "failed",
              assetIds: [],
              errorMessage: "The production request could not be submitted."
            });
          } else {
            useDirectGenPendingStore
              .getState()
              .settle(sequenceId, clipId, undefined, requestId);
          }
        }
        if (!production) {
          failWithReason(
            timeline,
            clipId,
            "the request could not be submitted. Check the connection and try again."
          );
        }
        return null;
      }

      return requestId;
    },
    [timeline]
  );

  const start = useCallback(
    async (
      clipId: string,
      productionCandidate?: CompiledProductionCandidate,
      preparedRequestId?: string
    ): Promise<string | null> => {
      const sequenceId = timeline.getState().sequenceId;
      // Both guards run before the first await in `runStart`. The synchronous
      // key covers two calls racing through the storyboard lookup, and the
      // in-flight check refuses a start while an edit, New take or earlier
      // render of the same clip is still open. Sending a second request would
      // otherwise replace the first one's record and orphan a paid result.
      const startKey = `${sequenceId ?? ""}:${clipId}:${
        productionCandidate?.identity.requestId ?? ""
      }`;
      if (startingDirectGen.has(startKey)) return null;
      if (!productionCandidate && inFlightForClip(sequenceId, clipId).length > 0) {
        return null;
      }
      startingDirectGen.add(startKey);
      try {
        return await runStart(clipId, productionCandidate, preparedRequestId);
      } finally {
        startingDirectGen.delete(startKey);
      }
    },
    [timeline, runStart]
  );

  const startNewTake = useCallback(
    async (input: {
      clipId: string;
      instruction?: string;
    }): Promise<string | null> => {
      const sequenceId = timeline.getState().sequenceId;
      const clip = timeline
        .getState()
        .clips.find((candidate) => candidate.id === input.clipId);
      if (!sequenceId || !clip || findInFlight(sequenceId, input.clipId)) {
        return null;
      }
      const activeId = activeTakeIdOf(clip);
      const activeTake = activeId
        ? (clip.versions ?? []).find((take) => take.id === activeId)
        : undefined;
      if (!activeTake || activeTake.assetId !== clip.currentAssetId) return null;
      const replay = getReplayRecipe(activeTake);
      if (!replay.ok) return null;
      const instruction = input.instruction?.trim();
      const recipe = instruction
        ? {
            ok: true as const,
            recipe: Object.freeze({ ...replay.recipe, prompt: instruction })
          }
        : replay;
      const requestId = crypto.randomUUID();
      subscribeDirectGen(
        timeline,
        input.clipId,
        requestId,
        sequenceId,
        Date.now() + PENDING_TTL_MS,
        undefined,
        recipe.recipe,
        true
      );
      useDirectGenPendingStore.getState().remember(sequenceId, {
        clipId: input.clipId,
        requestId,
        startedAt: Date.now(),
        bucket: durationBucketKey("text-to-video", recipe.recipe.model),
        generationRecipe: recipe.recipe,
        candidateOnly: true
      });
      try {
        const data: Record<string, unknown> = {
          mode: "video",
          provider: recipe.recipe.provider,
          model: recipe.recipe.model,
          prompt: recipe.recipe.prompt,
          width: recipe.recipe.width,
          height: recipe.recipe.height,
          strength: recipe.recipe.strength,
          num_inference_steps: recipe.recipe.numInferenceSteps,
          seed: recipe.recipe.seed,
          aspect_ratio: recipe.recipe.aspectRatio,
          resolution: recipe.recipe.resolution,
          duration: Math.round(recipe.recipe.durationMs / 1000),
          variations: 1
        };
        if (recipe.recipe.negativePrompt !== undefined) {
          data.negative_prompt = recipe.recipe.negativePrompt;
        }
        await globalWebSocketManager.send({
          command: "generate_media",
          request_id: requestId,
          data
        });
        return requestId;
      } catch {
        clearInFlight(sequenceId, input.clipId, requestId);
        useDirectGenPendingStore
          .getState()
          .settle(sequenceId, input.clipId, undefined, requestId);
        return null;
      }
    },
    [timeline]
  );

  const startEdit = useCallback(
    async (input: {
      clipId: string;
      instruction: string;
      provider: string;
      model: string;
      strength?: number;
      resolution?: string;
    }): Promise<string | null> => {
      const clip = timeline
        .getState()
        .clips.find((candidate) => candidate.id === input.clipId);
      const sequenceId = timeline.getState().sequenceId;
      if (!clip || !sequenceId || findInFlight(sequenceId, input.clipId)) {
        return null;
      }
      const source = captureMediaEditSourceContext(sequenceId, clip);
      if (
        !source.ok ||
        !input.instruction.trim() ||
        !input.provider ||
        !input.model
      ) {
        return null;
      }
      const baseline = ensureBaselineTake(clip);
      if (baseline !== clip) {
        timeline.getState().patchClip(input.clipId, {
          versions: baseline.versions,
          activeTakeId: baseline.activeTakeId
        });
      }
      const editSource = captureMediaEditSourceContext(sequenceId, baseline);
      if (!editSource.ok) return null;
      const requestId = crypto.randomUUID();
      const request = createMediaEditRequest({
        sourceContext: editSource.context,
        instruction: input.instruction.trim(),
        provider: input.provider,
        model: input.model,
        strength: input.strength,
        resolution: input.resolution
      });
      subscribeDirectGen(
        timeline,
        input.clipId,
        requestId,
        sequenceId,
        Date.now() + PENDING_TTL_MS,
        request
      );
      useDirectGenPendingStore.getState().remember(sequenceId, {
        clipId: input.clipId,
        requestId,
        startedAt: Date.now(),
        bucket: durationBucketKey("video_edit", input.model),
        mediaEdit: request
      });
      try {
        await globalWebSocketManager.send({
          command: "generate_media",
          request_id: requestId,
          data: mediaEditGenerateMediaData(request)
        });
        return requestId;
      } catch {
        clearInFlight(sequenceId, input.clipId, requestId);
        useDirectGenPendingStore
          .getState()
          .markEditFailure(
            sequenceId,
            input.clipId,
            "The edit could not be submitted. Check the connection and try again."
          );
        useDirectGenPendingStore.getState().settleEdit({
          sequenceId: request.sourceContext.sequenceId,
          clipId: request.sourceContext.clipId,
          requestId,
          mediaEdit: request,
          status: "failed",
          assetIds: []
        });
        return null;
      }
    },
    [timeline]
  );

  const cancelRequests = useCallback(
    (clipId: string, scope: "auto" | "edit") => {
      const sequenceId = timeline.getState().sequenceId;
      type Target = {
        requestId: string;
        mediaEdit?: MediaEditRequest;
        production?: unknown;
        candidateOnly?: boolean;
      };
      // Every open request for this clip, each by its own id. Cancelling
      // matches by request, not by clip, so stopping a render does not take
      // an edit or a New take on the same clip down with it.
      const byId = new Map<string, Target>();
      for (const job of inFlightForClip(sequenceId, clipId)) {
        byId.set(job.requestId, job);
      }
      if (sequenceId) {
        for (const job of useDirectGenPendingStore.getState().pending[
          sequenceId
        ] ?? []) {
          if (job.clipId === clipId && !byId.has(job.requestId)) {
            byId.set(job.requestId, job);
          }
        }
      }
      const targets = [...byId.values()];
      const edits = targets.filter((job) => job.mediaEdit);
      const generations = targets.filter(
        (job) => !job.mediaEdit && !job.production && !job.candidateOnly
      );
      const takes = targets.filter((job) => !job.mediaEdit && job.candidateOnly);
      const chosen =
        scope === "edit"
          ? edits
          : generations.length > 0
            ? generations
            : edits.length > 0
              ? edits
              : takes;
      for (const job of chosen) {
        clearInFlight(sequenceId, clipId, job.requestId);
        if (job.mediaEdit) {
          useDirectGenPendingStore.getState().settleEdit({
            sequenceId: job.mediaEdit.sourceContext.sequenceId,
            clipId: job.mediaEdit.sourceContext.clipId,
            requestId: job.requestId,
            mediaEdit: job.mediaEdit,
            status: "cancelled",
            assetIds: []
          });
        } else if (sequenceId) {
          useDirectGenPendingStore
            .getState()
            .settle(sequenceId, clipId, undefined, job.requestId);
        }
      }
      sendCancelGeneration(chosen.map((job) => job.requestId));
      if (scope === "edit" || (edits.length > 0 && generations.length === 0)) {
        return;
      }
      if (chosen.length === 0 && takes.length > 0) return;
      // Settle back to whatever idle status the clip's fields warrant — a
      // generated/stale clip should not regress to "Draft" just because the
      // user cancelled a re-roll. `deriveIdleClipStatus` produces draft only
      // when the clip has no rendered asset.
      const clip = timeline.getState().clips.find((c) => c.id === clipId);
      if (!clip) return;
      writeGenerationState(timeline, clipId, {
        status: deriveIdleClipStatus(clip)
      });
    },
    [timeline]
  );

  const cancel = useCallback(
    (clipId: string) => cancelRequests(clipId, "auto"),
    [cancelRequests]
  );

  const cancelEdit = useCallback(
    (clipId: string) => {
      const sequenceId = timeline.getState().sequenceId;
      if (!sequenceId) return;
      useDirectGenPendingStore.getState().clearEditFailure(sequenceId, clipId);
      cancelRequests(clipId, "edit");
    },
    [cancelRequests, timeline]
  );

  return { start, startNewTake, startEdit, cancel, cancelEdit };
}
