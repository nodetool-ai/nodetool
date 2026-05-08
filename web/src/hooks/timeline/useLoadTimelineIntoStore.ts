/**
 * useLoadTimelineIntoStore
 *
 * Bridges the tRPC-fetched `TimelineSequence` document into the singleton
 * `TimelineStore`. Reloads when the sequence id changes and resets the store
 * on unmount so subsequent timeline pages start clean.
 */
import { useEffect } from "react";

import { useTimelineStore } from "../../stores/timeline/TimelineStore";

import type { TimelineSequence } from "@nodetool-ai/timeline";

export function useLoadTimelineIntoStore(
  sequence: TimelineSequence | undefined | null
): void {
  useEffect(() => {
    if (!sequence) {
      return;
    }
    useTimelineStore.getState().loadSequence(sequence);
  }, [sequence]);

  useEffect(() => {
    return () => {
      useTimelineStore.getState().reset();
    };
  }, []);
}
