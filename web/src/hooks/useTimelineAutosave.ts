/**
 * useTimelineAutosave
 *
 * Debounced autosave for timeline sequences.  Subscribes to document changes
 * (passed in as a dependency) and sends a PATCH after 800 ms of inactivity.
 *
 * On 409 Conflict (stale `updated_at`), the sequence is refetched and a
 * non-blocking banner is surfaced via NotificationStore.
 *
 * Usage:
 *   const { status, lastSavedAt } = useTimelineAutosave({
 *     sequenceId: "seq-123",
 *     document: currentDocument,
 *     updatedAt: sequence.updatedAt,
 *   });
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { patchTimeline } from "../lib/api/timeline";
import { timelineKeys } from "./useTimelineSequence";
import { useNotificationStore } from "../stores/NotificationStore";
import type { TimelineDocument } from "../lib/api/timeline";

export type AutosaveStatus = "saved" | "saving" | "unsaved" | "conflict";

export interface UseTimelineAutosaveOptions {
  /** Id of the sequence to autosave. Pass null/undefined to disable. */
  sequenceId: string | null | undefined;
  /** The latest document value. Changes trigger the debounce. */
  document: TimelineDocument | null | undefined;
  /** The current `updatedAt` from the server — sent as If-Match header. */
  updatedAt?: string;
  /** Debounce delay in milliseconds. Defaults to 800. */
  debounceMs?: number;
}

export interface UseTimelineAutosaveReturn {
  /** Current save status. */
  status: AutosaveStatus;
  /** Timestamp (ms since epoch) of the last successful save, or 0. */
  lastSavedAt: number;
  /** Call to immediately flush a pending save. */
  flush: () => Promise<void>;
}

const DEBOUNCE_MS = 800;

export const useTimelineAutosave = ({
  sequenceId,
  document,
  updatedAt,
  debounceMs = DEBOUNCE_MS
}: UseTimelineAutosaveOptions): UseTimelineAutosaveReturn => {
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<AutosaveStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState(0);

  // Track the latest values in refs so timer callbacks don't close over stale state
  const documentRef = useRef(document);
  const updatedAtRef = useRef(updatedAt);
  const sequenceIdRef = useRef(sequenceId);
  const isSavingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs up-to-date
  useEffect(() => {
    documentRef.current = document;
  }, [document]);
  useEffect(() => {
    updatedAtRef.current = updatedAt;
  }, [updatedAt]);
  useEffect(() => {
    sequenceIdRef.current = sequenceId;
  }, [sequenceId]);

  const performSave = useCallback(async () => {
    const id = sequenceIdRef.current;
    const doc = documentRef.current;
    if (!id || !doc || isSavingRef.current) return;

    isSavingRef.current = true;
    setStatus("saving");

    try {
      const saved = await patchTimeline(
        id,
        { document: doc },
        { ifMatch: updatedAtRef.current }
      );
      // Update the cached sequence so the new updatedAt is available
      queryClient.setQueryData(timelineKeys.detail(id), saved);
      setStatus("saved");
      setLastSavedAt(Date.now());
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 409) {
        // Stale — refetch the latest version and show a banner
        await queryClient.invalidateQueries({
          queryKey: timelineKeys.detail(id)
        });
        setStatus("conflict");
        useNotificationStore.getState().addNotification({
          content:
            "Timeline was modified elsewhere — your local changes have not been saved. Refresh to see the latest version.",
          type: "warning",
          alert: false,
          dedupeKey: `timeline-conflict-${id}`,
          replaceExisting: true
        });
      } else {
        setStatus("unsaved");
      }
    } finally {
      isSavingRef.current = false;
    }
  }, [queryClient]);

  // Mark unsaved and (re-)schedule debounced save whenever document changes
  useEffect(() => {
    if (!sequenceId || !document) return;

    setStatus("unsaved");

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      performSave();
    }, debounceMs);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, sequenceId, debounceMs]);

  const flush = useCallback(async () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await performSave();
  }, [performSave]);

  return { status, lastSavedAt, flush };
};
