import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clipSourceMsAt,
  type MediaTrack,
  type TimelineClip
} from "@nodetool-ai/timeline";
import type { VideoModel } from "../../stores/ApiTypes";
import { useProvidersByCapability } from "../useProviders";
import { useAggregatedProviderModels } from "../useModelsByProvider";
import { trpc } from "../../lib/trpc";
import { trpcClient } from "../../trpc/client";
import {
  isOlderUpdatedAt,
  useTimelineStoreApi,
  type TimelineStoreState
} from "../../stores/timeline/TimelineStore";
import { mergeTimelineDocuments, type TimelineMergeDoc } from "../../stores/timeline/merge";
import { buildTimelineDocumentPayload } from "./timelineDocumentPayload";
import { restFetch } from "../../lib/rest-fetch";

export interface TrackObjectSelection {
  readonly clipId: string;
  readonly sourceAssetId: string;
  readonly sourceMs: number;
  readonly region: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
}

export interface TrackObjectRequest {
  clip_id: string;
  provider: string;
  model: string;
  name: string;
  initial_region: NonNullable<TrackObjectSelection["region"]>;
  start_ms: number;
  end_ms: number;
  direction: "forward";
}

export interface TrackObjectResult {
  status: "ready" | "failed";
  track_id?: string;
  generation_id?: string;
  reused?: boolean;
  error?: string;
}

export type TrackObjectJobStatus = "idle" | "pending" | "ready" | "failed";

interface UseTrackObjectResult {
  model?: VideoModel;
  modelError: Error | null | undefined;
  isLoadingModel: boolean;
  status: TrackObjectJobStatus;
  error: string | null;
  canTrack: boolean;
  start: () => Promise<TrackObjectResult | null>;
}

const isValidRegion = (
  region: TrackObjectSelection["region"]
): region is NonNullable<TrackObjectSelection["region"]> => {
  if (!region) return false;
  const values = [region.x, region.y, region.width, region.height];
  if (!values.every((value) => Number.isFinite(value))) return false;
  return (
    region.x >= 0 &&
    region.y >= 0 &&
    region.width > 0 &&
    region.height > 0 &&
    region.x + region.width <= 1 &&
    region.y + region.height <= 1
  );
};

export function trackObjectSourceWindow(
  clip: TimelineClip,
  sourceMs: number
): {
  startMs: number;
  endMs: number;
} {
  return {
    startMs: sourceMs,
    endMs: clipSourceMsAt(clip, clip.startMs + clip.durationMs)
  };
}

export function validateTrackObjectRequest(
  sequenceId: string | null,
  clip: TimelineClip | undefined,
  selection: TrackObjectSelection | null,
  model: VideoModel | undefined
): { ok: true; request: TrackObjectRequest } | { ok: false; error: string } {
  if (!sequenceId) return { ok: false, error: "No timeline is open." };
  if (!clip) return { ok: false, error: "The selected clip is no longer available." };
  if (clip.mediaType !== "video") {
    return { ok: false, error: "Subject tracking requires a video clip." };
  }
  if (!clip.currentAssetId) {
    return { ok: false, error: "The clip has no source video to track." };
  }
  if (!selection || selection.clipId !== clip.id) {
    return { ok: false, error: "Select a subject in the preview first." };
  }
  if (selection.sourceAssetId !== clip.currentAssetId) {
    return { ok: false, error: "The source changed. Select the subject again." };
  }
  if (!Number.isFinite(selection.sourceMs) || !isValidRegion(selection.region)) {
    return { ok: false, error: "Select a valid subject rectangle in the preview." };
  }
  if (!model?.provider || !model.id) {
    return { ok: false, error: "No executable subject-tracking model is available." };
  }
  const window = trackObjectSourceWindow(clip, selection.sourceMs);
  if (
    !Number.isFinite(window.startMs) ||
    !Number.isFinite(window.endMs) ||
    window.startMs < 0 ||
    window.endMs <= window.startMs ||
    selection.sourceMs < clipSourceMsAt(clip, clip.startMs) ||
    selection.sourceMs >= window.endMs
  ) {
    return { ok: false, error: "The clip has no valid source tracking window." };
  }
  return {
    ok: true,
    request: {
      clip_id: clip.id,
      provider: model.provider,
      model: model.id,
      name: clip.name || "Tracked subject",
      initial_region: { ...selection.region },
      start_ms: window.startMs,
      end_ms: window.endMs,
      direction: "forward"
    }
  };
}

async function postTrackObject(
  timelineId: string,
  request: TrackObjectRequest
): Promise<TrackObjectResult> {
  const response = await restFetch(
    `/api/timelines/${encodeURIComponent(timelineId)}/track-object`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    }
  );
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      data !== null && typeof data === "object" && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : `Tracking failed (${response.status})`;
    throw new Error(detail);
  }
  if (
    data === null ||
    typeof data !== "object" ||
    ((data as { status?: unknown }).status !== "ready" &&
      (data as { status?: unknown }).status !== "failed")
  ) {
    throw new Error("Unexpected response from the track-object endpoint");
  }
  return data as TrackObjectResult;
}

export function useTrackObject(
  clip: TimelineClip,
  selection: TrackObjectSelection | null
): UseTrackObjectResult {
  const timeline = useTimelineStoreApi();
  const sequenceId = timeline.getState().sequenceId;
  const { providers, isLoading: providersLoading, error: providersError } =
    useProvidersByCapability("track_object");
  const fetchModels = useCallback(
    async (provider: string): Promise<VideoModel[]> =>
      ((await trpc.models.videoByProvider.query({ provider })) || []) as VideoModel[],
    []
  );
  const aggregated = useAggregatedProviderModels(
    providers,
    providersLoading,
    "track-object-models",
    fetchModels
  );
  const model = useMemo(() => aggregated.models[0], [aggregated.models]);
  const currentClip = timeline.getState().clips.find((item) => item.id === clip.id);
  const validation = validateTrackObjectRequest(
    sequenceId,
    currentClip,
    selection,
    model
  );
  const [status, setStatus] = useState<TrackObjectJobStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setStatus("idle");
    setError(null);
  }, [clip.id]);
  const start = useCallback(async (): Promise<TrackObjectResult | null> => {
    if (status === "pending") return null;
    const state = timeline.getState();
    const latestClip = state.clips.find((item) => item.id === clip.id);
    const latestValidation = validateTrackObjectRequest(
      state.sequenceId,
      latestClip,
      selection,
      model
    );
    if (!latestValidation.ok) {
      setStatus("failed");
      setError(latestValidation.error);
      return null;
    }
    const request = latestValidation.request;
    const sourceAssetId = selection?.sourceAssetId;
    if (!sourceAssetId) {
      setStatus("failed");
      setError("Select a subject in the preview first.");
      return null;
    }
    setStatus("pending");
    setError(null);
    try {
      const submitted: NonNullable<TimelineStoreState["syncedDocument"]> = {
        tracks: state.tracks,
        clips: state.clips,
        markers: state.markers,
        mediaTracks: state.mediaTracks,
        transcript: state.transcript,
        scriptEnabled: state.scriptEnabled,
        fps: state.fps,
        width: state.width,
        height: state.height,
        camera2d: state.camera2d ?? null
      };
      const saved = await trpcClient.timeline.update.mutate({
        id: state.sequenceId!,
        baseUpdatedAt: state.baseUpdatedAt ?? undefined,
        document: buildTimelineDocumentPayload(state)
      });
      const afterSave = timeline.getState();
      const savedAt = (saved as { updatedAt?: unknown } | undefined)?.updatedAt;
      if (
        typeof savedAt === "string" &&
        afterSave.sequenceId === state.sequenceId &&
        !isOlderUpdatedAt(savedAt, afterSave.baseUpdatedAt)
      ) {
        afterSave.setBaseUpdatedAt(savedAt, submitted);
      }
      const savedClip = afterSave.clips.find((item) => item.id === clip.id);
      if (
        afterSave.sequenceId !== state.sequenceId ||
        savedClip?.currentAssetId !== sourceAssetId
      ) {
        throw new Error("The source changed before tracking started. Try again.");
      }
      const result = await postTrackObject(state.sequenceId!, request);
      const sequence = await trpcClient.timeline.get.query({ id: state.sequenceId! });
      if (timeline.getState().sequenceId !== state.sequenceId) {
        throw new Error("The timeline changed while tracking was running. Try again.");
      }
      const current = timeline.getState();
      if (isOlderUpdatedAt(sequence.updatedAt, current.baseUpdatedAt)) {
        throw new Error("The timeline changed while tracking was running. Try again.");
      }
      const base = current.syncedDocument ?? submitted;
      const draft: TimelineMergeDoc = {
        tracks: current.tracks,
        clips: current.clips,
        markers: current.markers,
        mediaTracks: current.mediaTracks,
        transcript: current.transcript,
        scriptEnabled: current.scriptEnabled,
        fps: current.fps,
        width: current.width,
        height: current.height,
        camera2d: current.camera2d ?? null
      };
      const server: TimelineMergeDoc = {
        tracks: sequence.tracks,
        clips: sequence.clips,
        markers: sequence.markers,
        mediaTracks: sequence.mediaTracks ?? [],
        transcript: sequence.transcript ?? [],
        scriptEnabled: sequence.scriptEnabled ?? false,
        fps: sequence.fps,
        width: sequence.width,
        height: sequence.height,
        camera2d: sequence.camera2d ?? null
      };
      const merged = mergeTimelineDocuments(base, draft, server, undefined, {
        mergeWithoutOps: true
      });
      timeline.getState().applyExternalMerge({
        mediaTracks: merged.doc.mediaTracks as MediaTrack[]
      });
      const synced: NonNullable<TimelineStoreState["syncedDocument"]> = {
        tracks: sequence.tracks,
        clips: sequence.clips,
        markers: sequence.markers,
        mediaTracks: merged.nextBase.mediaTracks as MediaTrack[],
        transcript: sequence.transcript ?? [],
        scriptEnabled: sequence.scriptEnabled ?? false,
        fps: sequence.fps,
        width: sequence.width,
        height: sequence.height,
        camera2d: sequence.camera2d ?? null
      };
      timeline.getState().setBaseUpdatedAt(sequence.updatedAt, synced);
      if (result.status === "failed") {
        setStatus("failed");
        setError(result.error ?? "Subject tracking failed.");
      } else {
        setStatus("ready");
      }
      return result;
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      setStatus("failed");
      setError(message);
      return null;
    }
  }, [clip.id, model, selection, status, timeline]);
  return {
    model,
    modelError: providersError || aggregated.error,
    isLoadingModel: providersLoading || aggregated.isLoading,
    status,
    error,
    canTrack: validation.ok && status !== "pending",
    start
  };
}
