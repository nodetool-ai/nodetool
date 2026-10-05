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
import { buildTimelineDocumentPayload } from "./timelineDocumentPayload";

export type AdaptFormatStrategy = "center" | "smart" | "track";

export interface CreateFormatAdaptationOptions {
  aspectRatios: readonly string[];
  strategy: AdaptFormatStrategy;
  safeMargin: number;
  trackId?: string;
  trackIdByClipId?: Readonly<Record<string, string>>;
}

/** What a batch produced: some formats can succeed while others fail. */
export interface FormatAdaptationOutcome {
  createdIds: string[];
  /** Aspect ratios that were created. */
  createdAspectRatios: string[];
  failures: Array<{ aspectRatio: string; message: string }>;
}

interface UseCreateFormatAdaptationResult {
  createAdaptations: (
    options: CreateFormatAdaptationOptions
  ) => Promise<FormatAdaptationOutcome>;
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
  | "camera2d"
  | "storyboardMaterializations"
>;

function errorMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "Could not create adaptation.";
}

/** Persist an already-derived sequence and show its editor. */
export async function persistAdaptedTimeline(
  sequence: TimelineSequence,
  sourceId: string
): Promise<string> {
  let createdId: string | undefined;
  try {
    const created = await trpcClient.timeline.create.mutate({
      id: sequence.id,
      name: sequence.name,
      projectId: sequence.projectId,
      fps: sequence.fps,
      width: sequence.width,
      height: sequence.height
    });
    createdId = created.id;
    await trpcClient.timeline.update.mutate({
      id: created.id,
      document: {
        ...buildTimelineDocumentPayload({
          ...sequence,
          trackFolders: sequence.trackFolders ?? [],
          mediaTracks: sequence.mediaTracks ?? [],
          transcript: sequence.transcript ?? [],
          scriptEnabled: sequence.scriptEnabled ?? false,
          camera2d: sequence.camera2d ?? null
        }),
        templateId: sourceId
      }
    });
    invalidateTimelineGetQuery(created.id);
    useWorkspaceTabsStore
      .getState()
      .openTab({
        type: "timeline",
        ref: created.id,
        mode: "edit",
        title: sequence.name,
        projectId: created.projectId
      });
    return created.id;
  } catch (cause) {
    if (createdId)
      await trpcClient.timeline.delete
        .mutate({ id: createdId })
        .catch(() => undefined);
    throw cause;
  }
}

/**
 * Derive, persist, and open each requested format as a separate sequence.
 * A format that fails does not stop the others and leaves no half-built
 * sequence behind: one created but never given its document is deleted.
 */
export async function persistFormatAdaptationsDetailed(
  source: TimelineSequence,
  state: AdaptationDocumentState,
  options: CreateFormatAdaptationOptions
): Promise<FormatAdaptationOutcome> {
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
    setup: state.setup ?? undefined,
    camera2d: state.camera2d,
    storyboardMaterializations: state.storyboardMaterializations
  };

  const selectedTrack = options.trackId
    ? state.mediaTracks.find((track) => track.id === options.trackId)
    : undefined;
  const trackIdByClipId = selectedTrack
    ? { [selectedTrack.clipId]: selectedTrack.id }
    : options.trackIdByClipId;

  const outcome: FormatAdaptationOutcome = {
    createdIds: [],
    createdAspectRatios: [],
    failures: []
  };
  for (const aspectRatio of options.aspectRatios) {
    let createdId: string | undefined;
    try {
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
      createdId = created.id;
      await trpcClient.timeline.update.mutate({
        id: created.id,
        document: {
          ...buildTimelineDocumentPayload({
            ...sequence,
            camera2d: state.camera2d,
            storyboardMaterializations: state.storyboardMaterializations
          } as Parameters<typeof buildTimelineDocumentPayload>[0]),
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
      outcome.createdIds.push(created.id);
      outcome.createdAspectRatios.push(aspectRatio);
    } catch (cause) {
      if (createdId) {
        // The sequence exists without its document: remove it so a retry does
        // not leave an empty duplicate behind.
        await trpcClient.timeline.delete
          .mutate({ id: createdId })
          .catch(() => undefined);
      }
      outcome.failures.push({ aspectRatio, message: errorMessage(cause) });
    }
  }
  return outcome;
}

/** Ids of the created sequences. Throws when none could be created. */
export async function persistFormatAdaptations(
  source: TimelineSequence,
  state: AdaptationDocumentState,
  options: CreateFormatAdaptationOptions
): Promise<string[]> {
  const outcome = await persistFormatAdaptationsDetailed(
    source,
    state,
    options
  );
  if (outcome.createdIds.length === 0 && outcome.failures.length > 0) {
    throw new Error(outcome.failures[0].message);
  }
  return outcome.createdIds;
}

/** Persist derived cuts without ever loading them over the source editor. */
export function useCreateFormatAdaptation(
  source: TimelineSequence | undefined
): UseCreateFormatAdaptationResult {
  const store = useTimelineStoreApi();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createAdaptations = useCallback(
    async (
      options: CreateFormatAdaptationOptions
    ): Promise<FormatAdaptationOutcome> => {
      const empty: FormatAdaptationOutcome = {
        createdIds: [],
        createdAspectRatios: [],
        failures: []
      };
      if (!source) return empty;
      setIsCreating(true);
      setError(null);
      try {
        const outcome = await persistFormatAdaptationsDetailed(
          source,
          store.getState(),
          options
        );
        if (outcome.failures.length > 0) {
          setError(
            outcome.failures
              .map((f) => `${f.aspectRatio}: ${f.message}`)
              .join(" ")
          );
        }
        return outcome;
      } catch (cause) {
        setError(errorMessage(cause));
        return empty;
      } finally {
        setIsCreating(false);
      }
    },
    [source, store]
  );

  return { createAdaptations, isCreating, error };
}
