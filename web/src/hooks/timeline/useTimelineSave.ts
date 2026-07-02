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

import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient } from "../../trpc/client";
import { buildTimelineDocumentPayload } from "./timelineDocumentPayload";

export interface UseTimelineSaveResult {
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
      // Only roll the token forward while the store still holds the saved
      // sequence — otherwise we'd poison a newly loaded sequence's token.
      if (
        typeof updatedAt === "string" &&
        store.getState().sequenceId === state.sequenceId
      ) {
        store.getState().setBaseUpdatedAt(updatedAt);
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
