/**
 * useTimelineExternalSync
 *
 * Keeps the open sequence current when something outside this browser writes
 * the row — an agent running headless timeline doc-ops, the CLI, another tab.
 *
 * The backend broadcasts every write as a `resource_change` carrying the new
 * `updated_at` and, when the writer attached them, the ops it was made with.
 * `documentSync` compares the token against what this editor last saved with.
 * A clean editor takes the server copy (refetch + reload the store, which
 * also re-baselines autosave); a dirty one merges the external change per
 * merge unit — draft wins, refused values land in the conflict banner, and
 * no undo entry is recorded for work the user did not make (ADR 0001).
 */
import { useEffect } from "react";

import {
  handleDocumentResourceChange,
  registerDocumentSync
} from "../../stores/documentSync";
import {
  isOlderUpdatedAt,
  timelineTemporalOf,
  useTimelineStoreApi
} from "../../stores/timeline/TimelineStore";
import {
  mergeTimelineDocuments,
  timelineConflictKey,
  type TimelineMergeDoc
} from "../../stores/timeline/merge";
import { useConflictStore } from "../../stores/ConflictStore";
import { trpc, trpcClient } from "../../trpc/client";
import type { DocumentOp } from "@nodetool-ai/protocol";
import { isTimelineDocumentDirty } from "./useTimelineAutosave";
import { applyTimelineSequenceToStore } from "./useLoadTimelineIntoStore";
import {
  applyAcceptedTimelineConflict,
  listableTimelineConflicts,
  rebaseTimelineSnapshots,
  timelineTypedDocumentOf
} from "./timelineExternalMerge";

export function useTimelineExternalSync(sequenceId: string | null): void {
  const store = useTimelineStoreApi();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!sequenceId) return;
    /** Take the server copy wholesale — the clean-editor path. */
    const adopt = (
      sequence: Awaited<ReturnType<typeof trpcClient.timeline.get.query>>
    ): void => {
      // The store may have moved on to another sequence while the fetch was
      // in flight — loading this one over it would be the clobber the whole
      // mechanism exists to avoid.
      if (store.getState().sequenceId !== sequenceId) return;
      utils.timeline.get.setData({ id: sequenceId }, sequence);
      applyTimelineSequenceToStore(store, sequence);
    };
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
          // A render may finish while this clean-editor reload is in flight.
          // Re-route the already-observed external change so the dirty path
          // merges it with the completed render rather than overwriting it.
          if (isTimelineDocumentDirty(sequenceId)) {
            handleDocumentResourceChange("timelinesequence", {
              event: "updated",
              id: sequenceId,
              updatedAt: sequence.updatedAt
            });
            return;
          }
          adopt(sequence);
        })();
      },
      merge: (notice) => {
        void (async () => {
          let sequence: Awaited<
            ReturnType<typeof trpcClient.timeline.get.query>
          >;
          try {
            sequence = await trpcClient.timeline.get.query({ id: sequenceId });
          } catch (error) {
            console.error("Failed to fetch timeline for merge", error);
            return;
          }
          const before = store.getState();
          if (before.sequenceId !== sequenceId) return;

          // The user's own autosave can land while the fetch is in flight. The
          // store then holds that save's token and the just-saved document as
          // the merge base, while the copy we fetched predates the save — every
          // unit the save wrote would read as "draft equals base, server
          // differs" and the merge would hand the user's edits back to the
          // older server value. A copy that is not newer than what we already
          // hold has nothing to merge in.
          if (isOlderUpdatedAt(sequence.updatedAt, before.baseUpdatedAt)) {
            return;
          }
          if (sequence.updatedAt === before.baseUpdatedAt) return;

          // The editor may have gone clean during the fetch (the autosave
          // landed and the user stopped editing). Nothing to protect, so take
          // the server copy whole instead of merging against a stale base.
          if (!isTimelineDocumentDirty(sequenceId)) {
            adopt(sequence);
            return;
          }

          const draft: TimelineMergeDoc = {
            tracks: before.tracks,
            trackFolders: before.trackFolders,
            clips: before.clips,
            markers: before.markers,
            mediaTracks: before.mediaTracks,
            transcript: before.transcript,
            scriptEnabled: before.scriptEnabled,
            fps: before.fps,
            width: before.width,
            height: before.height,
            camera2d: before.camera2d ?? null
          };
          const serverDoc: TimelineMergeDoc = {
            tracks: sequence.tracks ?? [],
            trackFolders: sequence.trackFolders ?? [],
            clips: sequence.clips ?? [],
            markers: sequence.markers ?? [],
            mediaTracks: sequence.mediaTracks ?? [],
            transcript: sequence.transcript ?? [],
            scriptEnabled: sequence.scriptEnabled ?? false,
            fps: sequence.fps,
            width: sequence.width,
            height: sequence.height,
            camera2d: sequence.camera2d ?? null
          };
          // The document as this editor last read or wrote it; without one
          // (a merge racing the initial load) the draft stands in as base.
          const base: TimelineMergeDoc = before.syncedDocument ?? draft;

          const { doc, conflicts, nextBase } = mergeTimelineDocuments(
            base,
            draft,
            serverDoc,
            notice.ops as DocumentOp[] | undefined
          );

          // No history entry: merged external work never enters the undo
          // stack (ADR 0001). Reflow happens inside the action.
          const temporal = timelineTemporalOf(store);
          temporal.pause();
          try {
            store.getState().applyExternalMerge(timelineTypedDocumentOf(doc));
          } finally {
            temporal.resume();
          }

          // External values adopted by the merge must also be reflected in
          // both undo directions. Otherwise undo restores a checkpoint from
          // before the agent write and removes the agent's clips or tracks.
          // Conflicted units are unchanged in `doc`, so their old checkpoint
          // values remain available for the user's later accept/discard choice.
          const beforeDoc: TimelineMergeDoc = {
            tracks: before.tracks,
            trackFolders: before.trackFolders,
            clips: before.clips,
            markers: before.markers,
            mediaTracks: before.mediaTracks,
            transcript: before.transcript,
            scriptEnabled: before.scriptEnabled,
            fps: before.fps,
            width: before.width,
            height: before.height,
            camera2d: before.camera2d ?? null
          };
          const rebasedTemporal = timelineTemporalOf(store);
          store.temporal.setState({
            pastStates: rebaseTimelineSnapshots(
              rebasedTemporal.pastStates,
              beforeDoc,
              doc
            ),
            futureStates: rebaseTimelineSnapshots(
              rebasedTemporal.futureStates,
              beforeDoc,
              doc
            )
          });
          // The merge base for the next external change is what the SERVER
          // now holds — not the merged draft; snapshotting the draft here
          // would let a second external write clobber local clip edits —
          // except in the units the draft refused, which keep the base they
          // had. Rolling those forward too makes the refusal permanent and
          // silent: the next write reads them as unchanged on the server, so
          // the draft wins with nothing listed and the external value can
          // never be taken again.
          store
            .getState()
            .setBaseUpdatedAt(
              sequence.updatedAt,
              timelineTypedDocumentOf(nextBase)
            );

          useConflictStore
            .getState()
            .addConflicts(
              timelineConflictKey(sequenceId),
              listableTimelineConflicts(conflicts),
              {
                onAccept: (unitId) => {
                  const key = timelineConflictKey(sequenceId);
                  const entry = useConflictStore.getState().byKey[key];
                  const conflict = entry?.conflicts.find(
                    (c) => c.unit.id === unitId
                  );
                  if (!conflict) return;
                  applyAcceptedTimelineConflict(store.getState(), conflict);
                },
                // Discard keeps the draft exactly as the merge left it, which
                // for every reason — dangling included — means changing nothing
                // and dropping the offer.
                onDiscard: () => {}
              }
            );
        })();
      }
    });
  }, [sequenceId, store, utils]);
}

export default useTimelineExternalSync;
