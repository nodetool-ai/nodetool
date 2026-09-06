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
import { makeClipVersion } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { deriveIdleClipStatus } from "./useGenerateClip";
import {
  durationBucketKey,
  useDirectGenPendingStore
} from "./directGenPending";

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
  cancel: (clipId: string) => void;
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
  sequenceId: string | null
): () => void {
  clearInFlight(clipId);
  let unsubscribe: (() => void) | undefined;
  const cleanup = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = undefined;
    }
    inFlight.delete(clipId);
  };

  const settle = (msg: DirectGenRpcResponse) => {
    cleanup();
    const store = timeline.getState();
    if (msg.error) {
      if (sequenceId) {
        useDirectGenPendingStore.getState().settle(sequenceId, clipId);
      }
      store.patchClip(clipId, { status: "failed" });
      return;
    }
    const assetIds = Array.isArray(msg.result?.asset_ids)
      ? (msg.result!.asset_ids as unknown[]).filter(
          (v): v is string => typeof v === "string"
        )
      : [];
    const first = assetIds[0];
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
      useDirectGenPendingStore
        .getState()
        .settle(sequenceId, clipId, Date.now());
    }

    const current = store.clips.find((c) => c.id === clipId);
    if (!current) return;
    // Locked clips don't get their currentAssetId replaced — but the version
    // is still recorded so the user can restore it later.
    const patch: Partial<TimelineClip> = {
      status: "generated",
      versions: [
        ...(current.versions ?? []),
        makeClipVersion({
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
        })
      ]
    };
    if (!current.locked) {
      patch.currentAssetId = first;
      // Reset trim window — a fresh roll is a fresh source.
      patch.inPointMs = undefined;
      patch.outPointMs = undefined;
    }
    store.patchClip(clipId, patch);
  };

  unsubscribe = globalWebSocketManager.subscribe(requestId, (msg) => {
    if (msg.type !== "rpc_response") return;
    settle(msg as DirectGenRpcResponse);
  });
  inFlight.set(clipId, cleanup);
  return cleanup;
}

/**
 * Re-subscribe to the requests this sequence had in flight when it was closed
 * (criterion 6). Clips the sequence no longer has, and entries too old to be
 * answered, are dropped rather than re-subscribed.
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
  for (const job of restored) {
    const clip = clips.find((candidate) => candidate.id === job.clipId);
    if (!clip) {
      useDirectGenPendingStore.getState().settle(sequenceId, job.clipId);
      continue;
    }
    timeline.getState().patchClip(job.clipId, { status: "generating" });
    subscribeDirectGen(timeline, job.clipId, job.requestId, sequenceId);
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
        kind !== "text-to-audio"
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
      const cleanup = subscribeDirectGen(
        timeline,
        clipId,
        requestId,
        sequenceId
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
      if (kind !== "text-to-audio") {
        framingParams.aspect_ratio = clip.aspectRatio;
        framingParams.resolution = clip.resolution;
      }
      if (kind === "text-to-video") {
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

  return { start, cancel };
}
