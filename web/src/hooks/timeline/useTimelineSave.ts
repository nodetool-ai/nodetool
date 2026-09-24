/**
 * useTimelineSave — imperative "Save now" for the timeline editor.
 *
 * Autosave ({@link useTimelineAutosave}) covers the common case, but the Save
 * button lets the user force an immediate PATCH of the current document and see
 * explicit feedback. Reads the live snapshot straight from the TimelineStore
 * and rolls `baseUpdatedAt` forward from the response, same as autosave. The
 * document payload itself comes from the shared `buildTimelineDocumentPayload`
 * (see `timelineDocumentPayload.ts`) so this can never send a different field
 * set than autosave does.
 */
import { useCallback, useState } from "react";
import type { TimelineSetup } from "@nodetool-ai/timeline";

import {
  isOlderUpdatedAt,
  useTimelineStoreApi
} from "../../stores/timeline/TimelineStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient } from "../../trpc/client";
import { buildTimelineDocumentPayload } from "./timelineDocumentPayload";
import { isString } from "../../utils/typePredicates";

interface UseTimelineSaveResult {
  /** PATCH the current document immediately. Resolves when the save settles. */
  save: () => Promise<void>;
  isSaving: boolean;
}

/** Persist the current timeline snapshot and resolve only after server acknowledgement. */
export async function persistTimelineDocument(
  store: ReturnType<typeof useTimelineStoreApi>,
  setupOverride?: TimelineSetup | null
): Promise<void> {
  const state = store.getState();
  if (!state.sequenceId) {
    throw new Error("Save the timeline before starting generation.");
  }
  const response = await trpcClient.timeline.update.mutate({
    id: state.sequenceId,
    baseUpdatedAt: state.baseUpdatedAt ?? undefined,
    document: buildTimelineDocumentPayload({
      ...state,
      ...(setupOverride !== undefined && { setup: setupOverride })
    })
  });
  const updatedAt = (response as { updatedAt?: unknown } | undefined)
    ?.updatedAt;
  if (
    isString(updatedAt) &&
    store.getState().sequenceId === state.sequenceId &&
    !isOlderUpdatedAt(updatedAt, store.getState().baseUpdatedAt)
  ) {
    store.getState().setBaseUpdatedAt(updatedAt, {
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
    });
  }
}

export function useTimelineSave(): UseTimelineSaveResult {
  const store = useTimelineStoreApi();
  const [isSaving, setIsSaving] = useState(false);

  const save = useCallback(async () => {
    const state = store.getState();
    if (!state.sequenceId) return;
    setIsSaving(true);
    try {
      await persistTimelineDocument(store);
    } catch (error) {
      console.error("Timeline save failed:", error);
      useNotificationStore.getState().addNotification({
        content: "Could not save the timeline — please try again.",
        type: "error",
        alert: true,
        dedupeKey: "timeline-save-failed",
        replaceExisting: true
      });
    } finally {
      setIsSaving(false);
    }
  }, [store]);

  return { save, isSaving };
}
