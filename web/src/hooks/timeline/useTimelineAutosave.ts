/**
 * useTimelineAutosave
 *
 * Subscribes to the document slice of `TimelineStore` and PATCHes the
 * persisted sequence via `trpc.timeline.update` whenever the user mutates
 * tracks / clips / markers / durationMs.
 *
 * Robustness:
 *   - Debounces saves so a burst of edits coalesces into one PATCH.
 *   - Single-flight: while a save is in flight, additional edits accumulate
 *     in `pendingRef` and a follow-up save fires once the in-flight one
 *     resolves.
 *   - Optimistic concurrency: sends `baseUpdatedAt` (sourced from the
 *     TimelineStore) so the server can reject stale writes; rolls it
 *     forward from each successful response.
 *   - Failures surface a deduped notification and leave `pendingRef`
 *     intact so the next edit retries automatically.
 *   - Pending edits are flushed on unmount.
 */
import { useEffect, useRef } from "react";

import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient } from "../../trpc/client";

import type { TimelineStoreState } from "../../stores/timeline/TimelineStore";

const DEFAULT_DEBOUNCE_MS = 750;

interface DocumentSnapshot {
  sequenceId: string | null;
  baseUpdatedAt: string | null;
  tracks: TimelineStoreState["tracks"];
  clips: TimelineStoreState["clips"];
  markers: TimelineStoreState["markers"];
  durationMs: number;
}

const pickSnapshot = (state: TimelineStoreState): DocumentSnapshot => ({
  sequenceId: state.sequenceId,
  baseUpdatedAt: state.baseUpdatedAt,
  tracks: state.tracks,
  clips: state.clips,
  markers: state.markers,
  durationMs: state.durationMs
});

export interface UseTimelineAutosaveOptions {
  debounceMs?: number;
}

export function useTimelineAutosave(
  options: UseTimelineAutosaveOptions = {}
): void {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<DocumentSnapshot | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let scheduleFn: () => void = () => {};

    const runSave = async (snapshot: DocumentSnapshot) => {
      if (!snapshot.sequenceId) return;
      inFlightRef.current = true;
      try {
        const response = await trpcClient.timeline.update.mutate({
          id: snapshot.sequenceId,
          baseUpdatedAt: snapshot.baseUpdatedAt ?? undefined,
          document: {
            tracks: snapshot.tracks,
            clips: snapshot.clips,
            markers: snapshot.markers
          }
        });
        const updatedAt = (response as { updatedAt?: unknown } | undefined)
          ?.updatedAt;
        if (typeof updatedAt === "string") {
          useTimelineStore.getState().setBaseUpdatedAt(updatedAt);
        }
      } catch (error) {
        console.error("Timeline autosave failed:", error);
        useNotificationStore.getState().addNotification({
          content:
            "Timeline autosave failed — your last edit may not be saved.",
          type: "warning",
          alert: false,
          dedupeKey: "timeline-autosave-failed",
          replaceExisting: true
        });
        // Leave pendingRef intact so the next edit triggers a retry.
      } finally {
        inFlightRef.current = false;
        if (pendingRef.current) {
          scheduleFn();
        }
      }
    };

    const flush = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (inFlightRef.current) return;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending || !pending.sequenceId) return;
      void runSave(pending);
    };

    const schedule = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(flush, debounceMs);
    };
    scheduleFn = schedule;

    const unsubscribe = useTimelineStore.subscribe((state) => {
      const snapshot = pickSnapshot(state);
      if (!snapshot.sequenceId) return;
      pendingRef.current = snapshot;
      schedule();
    });

    return () => {
      unsubscribe();
      flush();
    };
  }, [debounceMs]);
}
