import {
  applyExtensionRequest,
  createExtensionRequest,
  ensureBaselineTake,
  extensionGenerateMediaData,
  landExtensionCandidate
} from "@nodetool-ai/timeline";
import type { ExtensionRequest, ExtensionTiming } from "@nodetool-ai/timeline";
import type { TimelineStoreApi } from "../stores/timeline/TimelineStore";
import { useAssetStore } from "../stores/AssetStore";
import { getAssetUrl } from "../utils/assetHelpers";
import { probeMediaDurationMs } from "../utils/probeMediaDuration";
import { globalWebSocketManager } from "./websocket/GlobalWebSocketManager";
import { watchGeneration } from "./websocket/generationWatch";
import { lookupGenerations } from "./websocket/lookupGenerations";
import { randomRequestId } from "./websocket/rpcRequest";

type TimelineHandle = Pick<TimelineStoreApi, "getState" | "setState">;
type ExtensionInput = Omit<
  Parameters<typeof createExtensionRequest>[0],
  "clip" | "sequenceId" | "requestId"
> & { clipId: string };

/** Prepare first so the host can persist this request before submitting it. */
export function prepareTimelineExtension(
  timeline: TimelineHandle,
  input: ExtensionInput
): ExtensionRequest {
  const state = timeline.getState();
  const clip = state.clips.find((item) => item.id === input.clipId);
  if (!clip || !state.sequenceId) {
    throw new Error(
      "Open the extension's saved timeline and select a video clip."
    );
  }
  const baseline = ensureBaselineTake(clip, new Date().toISOString());
  const request = createExtensionRequest({
    ...input,
    clip: baseline,
    sequenceId: state.sequenceId,
    requestId: randomRequestId()
  });
  if (baseline !== clip) {
    state.patchClip(clip.id, {
      versions: baseline.versions,
      activeTakeId: baseline.activeTakeId
    });
  }
  return request;
}

async function measuredDuration(assetId: string): Promise<number> {
  const asset = await useAssetStore.getState().get(assetId);
  const url = getAssetUrl(asset);
  const duration =
    asset.duration && asset.duration > 0
      ? asset.duration * 1000
      : url
        ? await probeMediaDurationMs(url, "video")
        : null;
  if (duration === null || !Number.isFinite(duration) || duration <= 0) {
    throw new Error(
      "Could not measure the extension video. Retry attachment when the asset is available."
    );
  }
  return duration;
}

/** Shared by the live reply and persisted-request recovery. */
export async function attachTimelineExtension(
  timeline: TimelineHandle,
  request: ExtensionRequest,
  assetId: string,
  measure: (id: string) => Promise<number> = measuredDuration
): Promise<string> {
  const durationMs = await measure(assetId);
  const state = timeline.getState();
  if (state.sequenceId !== request.sequenceId) {
    throw new Error(
      "Reopen the extension's original timeline to attach its candidate."
    );
  }
  const clip = state.clips.find((item) => item.id === request.source.clipId);
  if (!clip) {
    throw new Error(
      "The source clip was deleted. The extension remains in the asset library."
    );
  }
  const next = landExtensionCandidate(clip, request, {
    assetId,
    durationMs,
    createdAt: new Date().toISOString()
  });
  if (next !== clip) {
    state.patchClip(clip.id, { versions: next.versions });
  }
  return request.requestId;
}

/**
 * Submit a prepared request through generate_media. Generation lookup covers
 * a disconnected socket. The host retains the snapshot and may call recovery
 * after reload or after returning to the destination timeline.
 */
export async function submitTimelineExtension(
  timeline: TimelineHandle,
  request: ExtensionRequest,
  projectId?: string
): Promise<string> {
  await globalWebSocketManager.ensureConnection();
  const assetId = await new Promise<string>((resolve, reject) => {
    let finished = false;
    let unsubscribe = (): void => {};
    let stopWatching = (): void => {};
    const finish = (asset: string | null, error?: string): void => {
      if (finished) {
        return;
      }
      finished = true;
      unsubscribe();
      stopWatching();
      if (asset) {
        resolve(asset);
      } else {
        reject(new Error(error ?? "Extension generation failed."));
      }
    };
    unsubscribe = globalWebSocketManager.subscribe(
      request.requestId,
      (message) => {
        if (
          message.type !== "rpc_response" ||
          message.request_id !== request.requestId
        ) {
          return;
        }
        const result = message.result;
        const error = message.error;
        if (error && typeof error === "object" && "message" in error) {
          finish(null, String(error.message));
          return;
        }
        if (
          result &&
          typeof result === "object" &&
          "asset_ids" in result &&
          Array.isArray(result.asset_ids) &&
          typeof result.asset_ids[0] === "string"
        ) {
          finish(result.asset_ids[0]);
        }
      }
    );
    stopWatching = watchGeneration(
      request.requestId,
      Date.now() + 30 * 60 * 1000,
      (outcome) => {
        finish(
          outcome?.status === "completed"
            ? (outcome.assetIds[0] ?? null)
            : null,
          outcome?.error ??
            "Extension did not complete. Recover the saved request to check it again."
        );
      }
    );
    void globalWebSocketManager
      .send({
        command: "generate_media",
        request_id: request.requestId,
        data: {
          ...extensionGenerateMediaData(request),
          ...(projectId && { project_id: projectId })
        }
      })
      .catch((error: unknown) =>
        finish(null, error instanceof Error ? error.message : String(error))
      );
  });
  return attachTimelineExtension(timeline, request, assetId);
}

export async function recoverTimelineExtension(
  timeline: TimelineHandle,
  request: ExtensionRequest
): Promise<string | null> {
  const outcome = (await lookupGenerations([request.requestId])).get(
    request.requestId
  );
  if (!outcome || outcome.status !== "completed") {
    if (outcome?.error) {
      throw new Error(outcome.error);
    }
    return null;
  }
  const assetId = outcome.assetIds[0];
  if (!assetId) {
    throw new Error("The completed extension has no stored video asset.");
  }
  return attachTimelineExtension(timeline, request, assetId);
}

/** One TimelineStore write means one undo/redo operation for every timing choice. */
export function applyTimelineExtension(
  timeline: TimelineHandle,
  request: ExtensionRequest,
  timing: ExtensionTiming
): void {
  const state = timeline.getState();
  if (state.sequenceId !== request.sequenceId) {
    throw new Error(
      "Open the extension's original timeline before applying it."
    );
  }
  const result = applyExtensionRequest(
    state.clips,
    request,
    timing,
    new Set(
      state.tracks.filter((track) => track.locked).map((track) => track.id)
    )
  );
  if (!result.ok) {
    throw new Error(result.error);
  }
  timeline.setState({
    clips: result.clips,
    durationMs: result.clips.reduce(
      (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
      0
    )
  });
}
