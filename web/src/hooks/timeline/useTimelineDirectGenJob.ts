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

interface DirectGenRpcResponse extends WebSocketMessage {
  type: "rpc_response";
  request_id: string;
  command: string;
  result?: { asset_ids?: unknown };
  error?: { code?: string; message?: string };
}

export interface UseTimelineDirectGenJobApi {
  /** Returns the requestId once the RPC has been dispatched (or null on validation failure). */
  start: (clipId: string) => Promise<string | null>;
  cancel: (clipId: string) => void;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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

export function useTimelineDirectGenJob(): UseTimelineDirectGenJobApi {
  // Capture the surrounding instance's document store once; all reads and
  // writes in the async flow below go through this same handle so a focus
  // switch to another timeline instance mid-generation can't redirect them.
  const timeline = useTimelineStoreApi();

  const start = useCallback(async (clipId: string): Promise<string | null> => {
    const clip = timeline
      .getState()
      .clips.find((c) => c.id === clipId);
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

    // Tear down any stale subscription from a prior run on the same clip.
    clearInFlight(clipId);

    const requestId = randomId();
    timeline.getState().patchClip(clipId, { status: "generating" });

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
        store.patchClip(clipId, { status: "failed" });
        return;
      }

      const current = store.clips.find((c) => c.id === clipId);
      if (!current) return;
      // Locked clips don't get their currentAssetId replaced — but the
      // version is still recorded so the user can restore it later.
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
              numInferenceSteps: current.numInferenceSteps
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
          // Video models take aspect ratio / resolution / duration natively
          // (width & height are ignored for video); pass them through when set.
          ...(kind === "text-to-video"
            ? {
                aspect_ratio: clip.aspectRatio,
                resolution: clip.resolution,
                duration: clip.durationMs
                  ? Math.round(clip.durationMs / 1000)
                  : undefined
              }
            : {})
        }
      });
    } catch {
      cleanup();
      fail(timeline, clipId);
      return null;
    }

    return requestId;
  }, [timeline]);

  const cancel = useCallback((clipId: string) => {
    clearInFlight(clipId);
    // Settle back to whatever idle status the clip's fields warrant — a
    // generated/stale clip should not regress to "Draft" just because the
    // user cancelled a re-roll. `deriveIdleClipStatus` produces draft only
    // when the clip has no rendered asset.
    const clip = timeline
      .getState()
      .clips.find((c) => c.id === clipId);
    if (!clip) return;
    timeline
      .getState()
      .patchClip(clipId, { status: deriveIdleClipStatus(clip) });
  }, [timeline]);

  return { start, cancel };
}
