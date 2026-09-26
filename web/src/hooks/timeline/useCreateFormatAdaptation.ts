import { useCallback, useState } from "react";

import {
  adaptSequenceFormat,
  type TimelineSequence
} from "@nodetool-ai/timeline";

import {
  useTimelineStoreApi,
  type TimelineStoreState
} from "../../stores/timeline/TimelineStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { trpcClient } from "../../trpc/client";
import { invalidateTimelineGetQuery } from "../../stores/storyboard/timelineSync";

export type AdaptFormatStrategy = "center" | "smart" | "track";

export interface CreateFormatAdaptationOptions {
  aspectRatios: readonly string[];
  strategy: AdaptFormatStrategy;
  safeMargin: number;
  trackId?: string;
  trackIdByClipId?: Readonly<Record<string, string>>;
}

interface UseCreateFormatAdaptationResult {
  createAdaptations: (
    options: CreateFormatAdaptationOptions
  ) => Promise<string[]>;
  isCreating: boolean;
  error: string | null;
}

type AdaptationDocumentState = Pick<
  TimelineStoreState,
  | "fps"
  | "width"
  | "height"
  | "durationMs"
  | "tracks"
  | "trackFolders"
  | "clips"
  | "markers"
  | "mediaTracks"
  | "transcript"
  | "scriptEnabled"
  | "tempo"
  | "setup"
>;

/** Derive, persist, and open each requested format as a separate sequence. */
export async function persistFormatAdaptations(
  source: TimelineSequence,
  state: AdaptationDocumentState,
  options: CreateFormatAdaptationOptions
): Promise<string[]> {
  const liveSource: TimelineSequence = {
    ...source,
    fps: state.fps,
    width: state.width,
    height: state.height,
    durationMs: state.durationMs,
    tracks: state.tracks,
    trackFolders: state.trackFolders,
    clips: state.clips,
    markers: state.markers,
    mediaTracks: state.mediaTracks,
    transcript: state.transcript,
    scriptEnabled: state.scriptEnabled,
    tempo: state.tempo,
    setup: state.setup ?? undefined
  };

  const selectedTrack = options.trackId
    ? state.mediaTracks.find((track) => track.id === options.trackId)
    : undefined;
  const trackIdByClipId = selectedTrack
    ? { [selectedTrack.clipId]: selectedTrack.id }
    : options.trackIdByClipId;

  const createdIds: string[] = [];
  for (const aspectRatio of options.aspectRatios) {
    const { sequence } = adaptSequenceFormat(liveSource, aspectRatio, {
      strategy: options.strategy,
      safeMargin: options.safeMargin,
      trackIdByClipId
    });
    const name = `${source.name} — ${aspectRatio}`.substring(0, 200);
    const created = await trpcClient.timeline.create.mutate({
      id: sequence.id,
      name,
      projectId: source.projectId,
      fps: sequence.fps,
      width: sequence.width,
      height: sequence.height
    });
    await trpcClient.timeline.update.mutate({
      id: created.id,
      document: {
        tracks: sequence.tracks,
        trackFolders: sequence.trackFolders,
        clips: sequence.clips,
        markers: sequence.markers,
        mediaTracks: sequence.mediaTracks,
        transcript: sequence.transcript,
        scriptEnabled: sequence.scriptEnabled,
        tempo: sequence.tempo,
        setup: sequence.setup,
        templateId: source.id
      }
    });
    invalidateTimelineGetQuery(created.id);
    useWorkspaceTabsStore.getState().openTab({
      type: "timeline",
      ref: created.id,
      mode: "edit",
      title: name,
      projectId: created.projectId
    });
    createdIds.push(created.id);
  }
  return createdIds;
}

/** Persist derived cuts without ever loading them over the source editor. */
export function useCreateFormatAdaptation(
  source: TimelineSequence | undefined
): UseCreateFormatAdaptationResult {
  const store = useTimelineStoreApi();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createAdaptations = useCallback(
    async (options: CreateFormatAdaptationOptions): Promise<string[]> => {
      if (!source) return [];
      setIsCreating(true);
      setError(null);
      try {
        return await persistFormatAdaptations(
          source,
          store.getState(),
          options
        );
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : "Could not create adaptation.";
        setError(message);
        return [];
      } finally {
        setIsCreating(false);
      }
    },
    [source, store]
  );

  return { createAdaptations, isCreating, error };
}
