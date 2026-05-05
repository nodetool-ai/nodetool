/**
 * useTimelineAutosave
 *
 * Debounced autosave for timeline sequences. Subscribes to document changes
 * (passed in as a dependency) and sends `trpc.timeline.update` after 800 ms of
 * inactivity. On `ALREADY_EXISTS` (stale `baseUpdatedAt`), the sequence is
 * refetched and a non-blocking banner is surfaced via `NotificationStore`.
 *
 * Usage:
 *   const { status, lastSavedAt } = useTimelineAutosave({
 *     sequenceId: "seq-123",
 *     document: currentDocument,
 *     updatedAt: sequence.updatedAt,
 *   });
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { TimelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { trpc } from "../trpc/client";
import { useNotificationStore } from "../stores/NotificationStore";

export type AutosaveStatus = "saved" | "saving" | "unsaved" | "conflict";

export interface UseTimelineAutosaveOptions {
  /** Id of the sequence to autosave. Pass null/undefined to disable. */
  sequenceId: string | null | undefined;
  /** The latest document value. Changes trigger the debounce. */
  document: TimelineDocument | null | undefined;
  /** The current `updatedAt` from the server — sent as `baseUpdatedAt`. */
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
  const utils = trpc.useUtils();
  const updateMutation = trpc.timeline.update.useMutation();

  const [status, setStatus] = useState<AutosaveStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState(0);

  const documentRef = useRef(document);
  const updatedAtRef = useRef(updatedAt);
  const sequenceIdRef = useRef(sequenceId);
  const isSavingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const saved = await updateMutation.mutateAsync({
        id,
        document: doc,
        baseUpdatedAt: updatedAtRef.current
      });
      utils.timeline.get.setData({ id }, saved);
      setStatus("saved");
      setLastSavedAt(Date.now());
    } catch (err: unknown) {
      const code = (err as { data?: { code?: string } }).data?.code;
      if (code === "ALREADY_EXISTS") {
        await utils.timeline.get.invalidate({ id });
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
  }, [updateMutation, utils.timeline.get]);

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
