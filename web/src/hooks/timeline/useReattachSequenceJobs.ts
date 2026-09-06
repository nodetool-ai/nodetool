/**
 * Reattach a sequence's in-flight generations when it opens (criterion 6).
 *
 * Closing the timeline tore the direct-generation subscriptions down, so a
 * clip whose reply landed while the tab was shut would sit as a placeholder
 * forever. The persisted entries name the request ids; this re-subscribes once
 * the sequence's clips are actually in the store, because reattachment drops
 * entries for clips the sequence no longer has.
 */

import { useEffect } from "react";

import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../stores/timeline/TimelineStore";
import { reattachSequenceJobs } from "./useTimelineDirectGenJob";

export function useReattachSequenceJobs(sequenceId: string | null): void {
  const store = useTimelineStoreApi();
  const loaded = useTimelineStore(
    (state) => state.sequenceId === sequenceId && state.clips.length > 0
  );

  useEffect(() => {
    if (sequenceId && loaded) {
      void reattachSequenceJobs(store, sequenceId);
    }
  }, [loaded, sequenceId, store]);
}

export default useReattachSequenceJobs;
