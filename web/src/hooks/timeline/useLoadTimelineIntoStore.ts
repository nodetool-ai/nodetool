/**
 * useLoadTimelineIntoStore
 *
 * Bridges the tRPC-fetched `TimelineSequence` document into the surrounding
 * instance's `TimelineStore`. Reloads when the sequence id changes and resets
 * the store on unmount so a reused instance starts clean.
 */
import { useEffect } from "react";

import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";

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
  }, [sequence, store]);

  useEffect(() => {
    return () => {
      store.getState().reset();
    };
  }, [store]);
}
