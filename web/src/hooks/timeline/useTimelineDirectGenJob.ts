/**
 * useTimelineDirectGenJob — direct-gen (text-to-image / image-to-image /
 * text-to-video / text-to-audio) for timeline clips. Mirrors
 * `useDirectGenJob` for the sketch editor: fires a `generate_media`
 * WebSocket RPC and writes the resulting asset back onto the clip
 * (currentAssetId + ClipVersion) when it returns.
 *
 * Workflow-bound clips go through `useGenerateClip` instead; this hook only
 * handles clips whose `bindingKind` is `"text-to-image"`, `"image-to-image"`,
 * `"text-to-video"`, or `"text-to-audio"`.
 */
import { useCallback } from "react";
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../../lib/websocket/GlobalWebSocketManager";
import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import type { TimelineStoreApi } from "../../stores/timeline/TimelineStore";
import {
  captureMediaEditSourceContext,
  composeGenerativeTakePatch,
  createMediaEditRequest,
  ensureBaselineTake,
  makeClipVersion
} from "@nodetool-ai/timeline";
import type { MediaEditRequest, TimelineClip } from "@nodetool-ai/timeline";
import { deriveIdleClipStatus } from "./useGenerateClip";
import {
  durationBucketKey,
  PENDING_TTL_MS,
  useDirectGenPendingStore
} from "./directGenPending";
import {
  isSettled,
  lookupGenerations
} from "../../lib/websocket/lookupGenerations";
import { watchGeneration } from "../../lib/websocket/generationWatch";
import { useAssetStore } from "../../stores/AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";
import { probeMediaDurationMs } from "../../utils/probeMediaDuration";

interface DirectGenRpcResponse extends WebSocketMessage {
  type: "rpc_response";
  request_id: string;
  command: string;
  result?: { asset_ids?: unknown };
  error?: { code?: string; message?: string };
}

interface UseTimelineDirectGenJobApi {
  /** Returns the requestId once the RPC has been dispatched (or null on validation failure). */
  start: (clipId: string) => Promise<string | null>;
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
const inFlight = new Map<string, () => void>();

const clearInFlight = (clipId: string): void => {
  const teardown = inFlight.get(clipId);
  if (teardown) {
    teardown();
    inFlight.delete(clipId);
  }
};

function fail(timeline: TimelineStoreApi, clipId: string): void {
  timeline.getState().patchClip(clipId, { status: "failed" });
}

async function fitGeneratedAudio(
  timeline: TimelineStoreApi,
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
  timeline: TimelineStoreApi,
  clipId: string,
  requestId: string,
  sequenceId: string | null,
  outcome: DirectGenOutcome
): void {
  // Any subscription still open for this clip is done: it would settle a
  // second time on the reply and append the same version twice.
  clearInFlight(clipId);
  const store = timeline.getState();
  const first = outcome.errored ? undefined : outcome.assetIds[0];
  if (!first) {
    if (sequenceId) {
      useDirectGenPendingStore.getState().settle(sequenceId, clipId);
    }
    store.patchClip(clipId, { status: "failed" });
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
    useDirectGenPendingStore.getState().settle(sequenceId, clipId, Date.now());
  }

  const current = store.clips.find((c) => c.id === clipId);
  if (!current) return;
  const newVersion = makeClipVersion({
    jobId: requestId,
    assetId: first,
    workflowUpdatedAt: new Date().toISOString(),
    dependencyHash: "",
    paramOverridesSnapshot: {
      prompt: current.prompt,
      provider: current.provider,
      model: current.model,
      strength: current.strength,
      numInferenceSteps: current.numInferenceSteps,
      width: current.width,
      height: current.height,
      voice: current.voice,
      aspectRatio: current.aspectRatio,
      resolution: current.resolution,
      negativePrompt: current.negativePrompt
    }
  });
  // Locked clips don't get their currentAssetId replaced — but the version
  // is still recorded so the user can restore it later.
  const patch: Partial<TimelineClip> = {
    status: "generated",
    versions: [...(current.versions ?? []), newVersion]
  };
  if (!current.locked) {
    patch.currentAssetId = first;
    // Every asset writer must keep this alias in sync with currentAssetId,
    // or list_takes/delete_take mis-identify which take is actually playing.
    patch.activeTakeId = newVersion.id;
    // Reset trim window — a fresh roll is a fresh source.
    patch.inPointMs = undefined;
    patch.outPointMs = undefined;
  }
  store.patchClip(clipId, patch);
  if (
    (current.bindingKind === "text-to-audio" ||
      current.bindingKind === "text-to-music") &&
    !current.locked
  ) {
    void fitGeneratedAudio(timeline, current, first);
  }
}

/** Land an edit as an inactive take using only its submission snapshot. */
export function landMediaEdit(
  timeline: TimelineStoreApi,
  clipId: string,
  requestId: string,
  sequenceId: string | null,
  request: MediaEditRequest,
  outcome: DirectGenOutcome
): void {
  clearInFlight(clipId);
  const pending = sequenceId
    ? useDirectGenPendingStore
        .getState()
        .pending[sequenceId]?.find(
          (job) => job.clipId === clipId && job.requestId === requestId
        )
    : undefined;
  if (sequenceId && !pending) return;
  if (sequenceId) {
    if (outcome.errored || outcome.assetIds.length === 0) {
      useDirectGenPendingStore
        .getState()
        .markEditFailure(
          sequenceId,
          clipId,
          "The video edit failed before producing a candidate."
        );
    }
    useDirectGenPendingStore
      .getState()
      .settle(sequenceId, clipId, Date.now(), requestId);
  }
  const assetId = outcome.errored ? undefined : outcome.assetIds[0];
  if (!assetId) return;
  const current = timeline.getState().clips.find((clip) => clip.id === clipId);
  if (!current) return;
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
  if (next === current) return;
  timeline.getState().patchClip(clipId, { versions: next.versions });
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
  timeline: TimelineStoreApi,
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
  mediaEdit?: MediaEditRequest
): () => void {
  clearInFlight(clipId);
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
    inFlight.delete(clipId);
  };

  const settle = (msg: DirectGenRpcResponse) => {
    const assetIds = Array.isArray(msg.result?.asset_ids)
      ? (msg.result!.asset_ids as unknown[]).filter(
          (v): v is string => typeof v === "string"
        )
      : [];
    const outcome = { assetIds, errored: Boolean(msg.error) };
    if (mediaEdit) {
      landMediaEdit(
        timeline,
        clipId,
        requestId,
        sequenceId,
        mediaEdit,
        outcome
      );
    } else {
      landDirectGen(timeline, clipId, requestId, sequenceId, outcome);
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
          if (mediaEdit) {
            useDirectGenPendingStore
              .getState()
              .markEditFailure(
                sequenceId,
                clipId,
                "The video edit expired before producing a candidate."
              );
          }
          useDirectGenPendingStore.getState().settle(sequenceId, clipId);
        }
        if (!mediaEdit) fail(timeline, clipId);
        return;
      }
      const directOutcome = {
        assetIds: outcome.assetIds,
        errored: outcome.status !== "completed"
      };
      if (mediaEdit) {
        landMediaEdit(
          timeline,
          clipId,
          requestId,
          sequenceId,
          mediaEdit,
          directOutcome
        );
      } else {
        landDirectGen(timeline, clipId, requestId, sequenceId, directOutcome);
      }
    });
  }
  inFlight.set(clipId, cleanup);
  return cleanup;
}

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
  timeline: TimelineStoreApi,
  sequenceId: string
): Promise<void> {
  const restored = useDirectGenPendingStore.getState().restore(sequenceId);
  if (restored.length === 0) {
    return;
  }
  await globalWebSocketManager.ensureConnection();

  const clips = timeline.getState().clips;
  const live = restored.filter((job) => {
    if (clips.some((candidate) => candidate.id === job.clipId)) {
      return true;
    }
    useDirectGenPendingStore.getState().settle(sequenceId, job.clipId);
    return false;
  });
  if (live.length === 0) {
    return;
  }

  const outcomes = await lookupGenerations(live.map((job) => job.requestId));

  for (const job of live) {
    const outcome = outcomes.get(job.requestId);
    if (outcome && isSettled(outcome.status)) {
      // The row settled while this client was away. Land it from the row: the
      // frame that would have carried it went to a socket that is gone.
      const directOutcome = {
        assetIds: outcome.assetIds,
        errored: outcome.status !== "completed"
      };
      if (job.mediaEdit) {
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
          directOutcome
        );
      }
      continue;
    }
    // Still running, or no row to read yet. The clip goes back to
    // `generating`, and the row is watched until it settles — bounded by what
    // is left of this entry's own window, after which the clip fails and
    // offers Retry rather than rendering forever.
    if (!job.mediaEdit) {
      timeline.getState().patchClip(job.clipId, { status: "generating" });
    }
    subscribeDirectGen(
      timeline,
      job.clipId,
      job.requestId,
      sequenceId,
      job.startedAt + PENDING_TTL_MS,
      job.mediaEdit
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

export function useTimelineDirectGenJob(): UseTimelineDirectGenJobApi {
  // Capture the surrounding instance's document store once; all reads and
  // writes in the async flow below go through this same handle so a focus
  // switch to another timeline instance mid-generation can't redirect them.
  const timeline = useTimelineStoreApi();

  const start = useCallback(
    async (clipId: string): Promise<string | null> => {
      const clip = timeline.getState().clips.find((c) => c.id === clipId);
      if (!clip) return null;
      const kind = clip.bindingKind;
      if (
        kind !== "text-to-image" &&
        kind !== "image-to-image" &&
        kind !== "text-to-video" &&
        kind !== "text-to-audio" &&
        kind !== "text-to-music"
      ) {
        return null;
      }
      if (clip.status === "queued" || clip.status === "generating") {
        return null;
      }
      if (!clip.provider || !clip.model) {
        fail(timeline, clipId);
        return null;
      }
      const prompt = (clip.prompt ?? "").trim();
      if (!prompt) {
        fail(timeline, clipId);
        return null;
      }

      // image-to-image needs a rendered source clip to draw bytes from.
      let sourceAssetId: string | undefined;
      if (kind === "image-to-image") {
        if (!clip.sourceClipId) {
          fail(timeline, clipId);
          return null;
        }
        const sourceClip = timeline
          .getState()
          .clips.find((c) => c.id === clip.sourceClipId);
        if (!sourceClip?.currentAssetId) {
          fail(timeline, clipId);
          return null;
        }
        sourceAssetId = sourceClip.currentAssetId;
      }

      const requestId = crypto.randomUUID();
      // Read before the subscription, and captured by it: the reply is settled
      // against the sequence the request was sent for, not whichever one is
      // open when it lands.
      const sequenceId = timeline.getState().sequenceId;
      timeline.getState().patchClip(clipId, { status: "generating" });
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
        Date.now() + PENDING_TTL_MS
      );
      if (sequenceId) {
        // Recorded before the send, so a reply that arrives after the tab is
        // closed still has an entry to be reattached through.
        useDirectGenPendingStore.getState().remember(sequenceId, {
          clipId,
          requestId,
          startedAt: Date.now(),
          bucket: durationBucketKey(kind, clip.model)
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
                  : kind === "text-to-video"
                    ? "video"
                    : kind === "text-to-music"
                      ? "music"
                      : "audio",
            provider: clip.provider,
            model: clip.model,
            prompt,
            source_asset_id: sourceAssetId,
            width: clip.width,
            height: clip.height,
            strength: clip.strength,
            num_inference_steps: clip.numInferenceSteps,
            variations: 1,
            voice: kind === "text-to-audio" ? clip.voice : undefined,
            ...framingParams
          }
        });
      } catch {
        cleanup();
        // The same captured id: the send failed, so the entry to drop is the
        // one this request wrote, not whatever is open.
        if (sequenceId) {
          useDirectGenPendingStore.getState().settle(sequenceId, clipId);
        }
        fail(timeline, clipId);
        return null;
      }

      return requestId;
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
      if (!clip || !sequenceId || inFlight.has(input.clipId)) return null;
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
      const sourceContext: {
        sequence_id: string;
        clip_id: string;
        source_asset_id: string;
        source_take_id?: string;
        source_start_ms: number;
        source_end_ms: number;
        timeline_start_ms: number;
        timeline_duration_ms: number;
        speed_multiplier: number;
      } = {
        sequence_id: editSource.context.sequenceId,
        clip_id: editSource.context.clipId,
        source_asset_id: editSource.context.sourceAssetId,
        source_start_ms: editSource.context.sourceStartMs,
        source_end_ms: editSource.context.sourceEndMs,
        timeline_start_ms: editSource.context.timelineStartMs,
        timeline_duration_ms: editSource.context.timelineDurationMs,
        speed_multiplier: editSource.context.speedMultiplier
      };
      if (editSource.context.sourceTakeId !== undefined) {
        sourceContext.source_take_id = editSource.context.sourceTakeId;
      }
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
          data: {
            mode: "video_edit",
            provider: input.provider,
            model: input.model,
            prompt: request.instruction,
            source_asset_id: editSource.context.sourceAssetId,
            source_context: sourceContext,
            strength: request.strength,
            resolution: request.resolution,
            duration: Math.round(editSource.context.timelineDurationMs / 1000),
            variations: 1
          }
        });
        return requestId;
      } catch {
        clearInFlight(input.clipId);
        useDirectGenPendingStore
          .getState()
          .markEditFailure(
            sequenceId,
            input.clipId,
            "The edit could not be submitted. Check the connection and try again."
          );
        useDirectGenPendingStore
          .getState()
          .settle(sequenceId, input.clipId, undefined, requestId);
        return null;
      }
    },
    [timeline]
  );

  const cancel = useCallback(
    (clipId: string) => {
      clearInFlight(clipId);
      const sequenceId = timeline.getState().sequenceId;
      if (sequenceId) {
        useDirectGenPendingStore.getState().settle(sequenceId, clipId);
      }
      // Settle back to whatever idle status the clip's fields warrant — a
      // generated/stale clip should not regress to "Draft" just because the
      // user cancelled a re-roll. `deriveIdleClipStatus` produces draft only
      // when the clip has no rendered asset.
      const clip = timeline.getState().clips.find((c) => c.id === clipId);
      if (!clip) return;
      timeline
        .getState()
        .patchClip(clipId, { status: deriveIdleClipStatus(clip) });
    },
    [timeline]
  );

  const cancelEdit = useCallback(
    (clipId: string) => {
      clearInFlight(clipId);
      const sequenceId = timeline.getState().sequenceId;
      if (!sequenceId) return;
      useDirectGenPendingStore.getState().clearEditFailure(sequenceId, clipId);
      useDirectGenPendingStore.getState().settle(sequenceId, clipId);
    },
    [timeline]
  );

  return { start, startEdit, cancel, cancelEdit };
}
