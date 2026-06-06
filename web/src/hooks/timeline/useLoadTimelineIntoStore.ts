/**
 * useLoadTimelineIntoStore
 *
 * Bridges the tRPC-fetched `TimelineSequence` document into the surrounding
 * instance's `TimelineStore`. Reloads when the sequence id changes and resets
 * the store on unmount so a reused instance starts clean.
 */
import { useEffect } from "react";

import {
  useTimelineStoreApi,
  timelineTemporalOf
} from "../../stores/timeline/TimelineStore";

import type { TimelineSequence } from "@nodetool-ai/timeline";

export function useLoadTimelineIntoStore(
  sequence: TimelineSequence | undefined | null
): void {
  const store = useTimelineStoreApi();

  useEffect(() => {
    if (!sequence) {
      return;
    }
    store.getState().loadSequence(sequence);
    // The load is a tracked `set`; clear history so the first Ctrl+Z can't
    // undo "past" the loaded sequence into the empty default state.
    timelineTemporalOf(store).clear();
  }, [sequence, store]);

  useEffect(() => {
    return () => {
      store.getState().reset();
    };
  }, [store]);
}
