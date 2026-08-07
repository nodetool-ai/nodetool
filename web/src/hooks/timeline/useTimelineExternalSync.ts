/**
 * useTimelineExternalSync
 *
 * Keeps the open sequence current when something outside this browser writes
 * the row — an agent running headless timeline doc-ops, the CLI, another tab.
 *
 * The backend broadcasts every write as a `resource_change` carrying the new
 * `updated_at`; `documentSync` compares it against the token this editor last
 * saved with. A clean editor takes the server copy (refetch + reload the
 * store, which also re-baselines autosave); a dirty one is told instead, so
 * neither side's work is dropped.
 */
import { useEffect } from "react";

import { registerDocumentSync } from "../../stores/documentSync";
import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import { trpc, trpcClient } from "../../trpc/client";
import { isTimelineDocumentDirty } from "./useTimelineAutosave";
import { applyTimelineSequenceToStore } from "./useLoadTimelineIntoStore";

export function useTimelineExternalSync(sequenceId: string | null): void {
  const store = useTimelineStoreApi();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!sequenceId) return;
    return registerDocumentSync("timelinesequence", sequenceId, {
      localRevision: () => {
        const state = store.getState();
        return state.sequenceId === sequenceId ? state.baseUpdatedAt : null;
      },
      isDirty: () => isTimelineDocumentDirty(sequenceId),
      reload: () => {
        void (async () => {
          const sequence = await trpcClient.timeline.get.query({
            id: sequenceId
          });
          // The store may have moved on to another sequence while the fetch
          // was in flight — loading this one over it would be the clobber the
          // whole mechanism exists to avoid.
          if (store.getState().sequenceId !== sequenceId) return;
          utils.timeline.get.setData({ id: sequenceId }, sequence);
          applyTimelineSequenceToStore(store, sequence);
        })();
      }
    });
  }, [sequenceId, store, utils]);
}

export default useTimelineExternalSync;
