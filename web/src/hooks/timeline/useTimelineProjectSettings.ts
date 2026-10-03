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
import { saveTimelineThroughEditor } from "../../stores/timeline/timelineSaveRegistry";
import { isString } from "../../utils/typePredicates";

interface ProjectSettingsPatch {
  fps?: number;
  width?: number;
  height?: number;
}

interface UseTimelineProjectSettingsResult {
  /**
   * Apply the patch to the store and persist it. Resolves true when saved.
   * On failure the store goes back to the previous values and it resolves
   * false, so the caller can keep its dialog open.
   */
  save: (patch: ProjectSettingsPatch) => Promise<boolean>;
  isSaving: boolean;
}

export function useTimelineProjectSettings(): UseTimelineProjectSettingsResult {
  const store = useTimelineStoreApi();
  const [isSaving, setIsSaving] = useState(false);

  const save = useCallback(
    async (patch: ProjectSettingsPatch): Promise<boolean> => {
      const state = store.getState();
      const previous: ProjectSettingsPatch = {
        fps: state.fps,
        width: state.width,
        height: state.height
      };
      // Apply locally first so the preview compositor reflects the new canvas
      // immediately, even before (or without) a server round-trip.
      state.setProjectSettings(patch);
      const sequenceId = state.sequenceId;
      if (!sequenceId) return true;
      setIsSaving(true);
      try {
        // With an editor open its autosave controller writes the settings
        // alongside the document, queued behind any save in flight.
        const queued = saveTimelineThroughEditor(sequenceId);
        if (queued) {
          const result = await queued;
          if (!result.ok) throw new Error(result.error);
          return true;
        }
        const response = await trpcClient.timeline.update.mutate({
          id: sequenceId,
          baseUpdatedAt: state.baseUpdatedAt ?? undefined,
          ...patch
        });
        const updatedAt = (response as { updatedAt?: unknown } | undefined)
          ?.updatedAt;
        // Only roll the token forward while the store still holds the saved
        // sequence — otherwise we'd poison a newly loaded sequence's token.
        // Only the canvas fields were written, so only they move in the base.
        if (
          isString(updatedAt) &&
          store.getState().sequenceId === sequenceId
        ) {
          const base = store.getState().syncedDocument;
          store
            .getState()
            .setBaseUpdatedAt(updatedAt, base ? { ...base, ...patch } : null);
        }
        return true;
      } catch (error) {
        console.error("Timeline project settings save failed:", error);
        if (store.getState().sequenceId === sequenceId) {
          store.getState().setProjectSettings(previous);
        }
        useNotificationStore.getState().addNotification({
          content: "Could not update project settings — please try again.",
          type: "error",
          alert: true,
          dedupeKey: "timeline-settings-failed",
          replaceExisting: true
        });
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [store]
  );

  return { save, isSaving };
}
