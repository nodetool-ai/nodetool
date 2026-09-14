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

export function useTimelineSave(): UseTimelineSaveResult {
  const store = useTimelineStoreApi();
  const [isSaving, setIsSaving] = useState(false);

  const save = useCallback(async () => {
    const state = store.getState();
    if (!state.sequenceId) return;
    setIsSaving(true);
    try {
      const response = await trpcClient.timeline.update.mutate({
        id: state.sequenceId,
        baseUpdatedAt: state.baseUpdatedAt ?? undefined,
        document: buildTimelineDocumentPayload(state)
      });
      const updatedAt = (response as { updatedAt?: unknown } | undefined)
        ?.updatedAt;
      // A delayed response must not replace a different sequence's merge
      // base or one that already incorporates a newer external write.
      if (
        isString(updatedAt) &&
        store.getState().sequenceId === state.sequenceId &&
        !isOlderUpdatedAt(updatedAt, store.getState().baseUpdatedAt)
      ) {
        store.getState().setBaseUpdatedAt(updatedAt, {
          tracks: state.tracks,
          clips: state.clips,
          markers: state.markers,
          transcript: state.transcript,
          scriptEnabled: state.scriptEnabled,
          fps: state.fps,
          width: state.width,
          height: state.height
        });
      }
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
