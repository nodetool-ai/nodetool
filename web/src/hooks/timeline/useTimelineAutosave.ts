/**
 * useTimelineAutosave
 *
 * Subscribes to the document slice of `TimelineStore` and PATCHes the
 * persisted sequence via `trpc.timeline.update` whenever the user mutates
 * tracks / clips / markers / durationMs. Saves are debounced and skipped
 * until the store has been hydrated by `useLoadTimelineIntoStore` (i.e.
 * `sequenceId` is set). Pending changes are flushed on unmount.
 */
import { useEffect, useRef } from "react";

import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { trpcClient } from "../../trpc/client";

import type { TimelineStoreState } from "../../stores/timeline/TimelineStore";

const DEFAULT_DEBOUNCE_MS = 750;

interface DocumentSnapshot {
  sequenceId: string | null;
  tracks: TimelineStoreState["tracks"];
  clips: TimelineStoreState["clips"];
  markers: TimelineStoreState["markers"];
  durationMs: number;
}

const pickSnapshot = (state: TimelineStoreState): DocumentSnapshot => ({
  sequenceId: state.sequenceId,
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

  useEffect(() => {
    const flush = () => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (!pending || !pending.sequenceId) {
        return;
      }
      void trpcClient.timeline.update
        .mutate({
          id: pending.sequenceId,
          document: {
            tracks: pending.tracks,
            clips: pending.clips,
            markers: pending.markers
          }
        })
        .catch((error: unknown) => {
          console.error("Timeline autosave failed:", error);
        });
    };

    const unsubscribe = useTimelineStore.subscribe((state) => {
      const snapshot = pickSnapshot(state);
      if (!snapshot.sequenceId) {
        return;
      }
      pendingRef.current = snapshot;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(flush, debounceMs);
    });

    return () => {
      unsubscribe();
      // Flush any pending change synchronously on unmount.
      flush();
    };
  }, [debounceMs]);
}
