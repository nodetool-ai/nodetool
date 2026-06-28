/**
 * useTimelineProjectSettings — apply + persist the project settings.
 *
 * Project settings are the canvas resolution (`width`/`height`) and frame rate
 * (`fps`). The live preview compositor and the offline export both read these
 * straight from the {@link TimelineStore}, so updating the store applies them
 * immediately. Persistence goes through the `timeline.update` top-level fields
 * (NOT the document slice autosave tracks), rolling `baseUpdatedAt` forward
 * from the response just like {@link useTimelineSave}.
 */
import { useCallback, useState } from "react";

import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient } from "../../trpc/client";

export interface ProjectSettingsPatch {
  fps?: number;
  width?: number;
  height?: number;
}

export interface UseTimelineProjectSettingsResult {
  /** Apply the patch to the store and persist it. Resolves when settled. */
  save: (patch: ProjectSettingsPatch) => Promise<void>;
  isSaving: boolean;
}

export function useTimelineProjectSettings(): UseTimelineProjectSettingsResult {
  const store = useTimelineStoreApi();
  const [isSaving, setIsSaving] = useState(false);

  const save = useCallback(
    async (patch: ProjectSettingsPatch) => {
      const state = store.getState();
      // Apply locally first so the preview compositor reflects the new canvas
      // immediately, even before (or without) a server round-trip.
      state.setProjectSettings(patch);
      if (!state.sequenceId) return;
      setIsSaving(true);
      try {
        const response = await trpcClient.timeline.update.mutate({
          id: state.sequenceId,
          baseUpdatedAt: state.baseUpdatedAt ?? undefined,
          ...patch
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
        console.error("Timeline project settings save failed:", error);
        useNotificationStore.getState().addNotification({
          content: "Could not update project settings — please try again.",
          type: "error",
          alert: true,
          dedupeKey: "timeline-settings-failed",
          replaceExisting: true
        });
      } finally {
        setIsSaving(false);
      }
    },
    [store]
  );

  return { save, isSaving };
}
