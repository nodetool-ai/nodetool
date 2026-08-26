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

import { registerDocumentSync } from "../../stores/documentSync";
import {
  isOlderUpdatedAt,
  timelineTemporalOf,
  useTimelineStoreApi,
  type TimelineStoreState
} from "../../stores/timeline/TimelineStore";
import {
  mergeTimelineDocuments,
  type TimelineMergeDoc
} from "../../stores/timeline/merge";
import { useConflictStore } from "../../stores/ConflictStore";
import type { MergeConflict } from "../../stores/documentMerge";
import { trpc, trpcClient } from "../../trpc/client";
import type { DocumentOp } from "@nodetool-ai/protocol";
import type {
  TimelineClip,
  TimelineMarker,
  TimelineTrack,
  TranscriptLine
} from "@nodetool-ai/timeline";
import { isTimelineDocumentDirty } from "./useTimelineAutosave";
import { applyTimelineSequenceToStore } from "./useLoadTimelineIntoStore";

const conflictKey = (sequenceId: string): string =>
  `timelinesequence:${sequenceId}`;

/** Name a whole-document replacement so the banner can address it. */
const listable = (
  conflicts: MergeConflict[]
): MergeConflict[] =>
  conflicts.map((conflict) =>
    conflict.unit.id
      ? conflict
      : { ...conflict, unit: { ...conflict.unit, id: conflict.unit.kind } }
  );

/**
 * Take one refused external value into the draft through a normal store
 * mutation, so the accept lands on the undo stack (ADR 0001).
 */
function replaceById<T extends { id: string }>(
  items: T[],
  incoming: T
): T[] {
  return items.some((item) => item.id === incoming.id)
    ? items.map((item) => (item.id === incoming.id ? incoming : item))
    : [...items, incoming];
}

function applyAcceptedConflict(
  state: TimelineStoreState,
  conflict: MergeConflict
): void {
  // A dangling clip lost the track it sat on, so there is nothing to take:
  // the external side never held this clip, and re-adding it would put a clip
  // on a track the document does not have. Accept and discard both leave the
  // draft as the merge left it and only unlist the offer. Restoring the clip
  // would mean restoring or reassigning a track, which is a decision the user
  // makes in the editor, not a banner button.
  if (conflict.reason === "dangling") return;
  if (conflict.reason === "replaced" && conflict.external != null) {
    const doc = conflict.external as TimelineMergeDoc;
    state.applyExternalMerge({
      tracks: doc.tracks as TimelineTrack[],
      clips: doc.clips as TimelineClip[],
      markers: doc.markers as TimelineMarker[],
      transcript: doc.transcript as TranscriptLine[],
      scriptEnabled: doc.scriptEnabled,
      fps: doc.fps,
      width: doc.width,
      height: doc.height
    });
    return;
  }
  if (conflict.unit.kind === "clip" && conflict.external != null) {
    const clip = conflict.external as TimelineClip;
    if (state.clips.some((cand) => cand.id === clip.id)) {
      state.patchClip(clip.id, clip);
    } else {
      state.addClip(clip);
    }
    return;
  }
  if (conflict.unit.kind === "track" && conflict.external != null) {
    state.applyExternalMerge({
      tracks: replaceById(
        state.tracks,
        conflict.external as TimelineTrack
      )
    });
    return;
  }
  if (conflict.unit.kind === "marker" && conflict.external != null) {
    state.applyExternalMerge({
      markers: replaceById(
        state.markers,
        conflict.external as TimelineMarker
      )
    });
    return;
  }
  if (conflict.unit.kind === "transcript" && conflict.external != null) {
    state.applyExternalMerge({
      transcript: replaceById(
        state.transcript,
        conflict.external as TranscriptLine
      )
    });
    return;
  }
  if (conflict.unit.kind === "field") {
    if (conflict.unit.id === "scriptEnabled") {
      state.setScriptEnabled(Boolean(conflict.external));
      return;
    }
    if (
      conflict.unit.id === "fps" ||
      conflict.unit.id === "width" ||
      conflict.unit.id === "height"
    ) {
      state.setProjectSettings({
        [conflict.unit.id]: conflict.external as number
      });
    }
    return;
  }
  if (conflict.reason === "deleted" && conflict.external === null) {
    if (conflict.unit.kind === "clip") {
      if (state.clips.some((clip) => clip.id === conflict.unit.id)) {
        state.deleteClip(conflict.unit.id);
      }
    } else if (conflict.unit.kind === "track") {
      state.removeTrack(conflict.unit.id);
    } else if (conflict.unit.kind === "marker") {
      state.applyExternalMerge({
        markers: state.markers.filter((m) => m.id !== conflict.unit.id)
      });
    } else if (conflict.unit.kind === "transcript") {
      state.applyExternalMerge({
        transcript: state.transcript.filter((l) => l.id !== conflict.unit.id)
      });
    }
  }
}

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
          adopt(
            await trpcClient.timeline.get.query({
              id: sequenceId
            })
          );
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
            clips: before.clips,
            markers: before.markers,
            transcript: before.transcript,
            scriptEnabled: before.scriptEnabled,
            fps: before.fps,
            width: before.width,
            height: before.height
          };
          const serverDoc: TimelineMergeDoc = {
            tracks: sequence.tracks ?? [],
            clips: sequence.clips ?? [],
            markers: sequence.markers ?? [],
            transcript: sequence.transcript ?? [],
            scriptEnabled: sequence.scriptEnabled ?? false,
            fps: sequence.fps,
            width: sequence.width,
            height: sequence.height
          };
          // The document as this editor last read or wrote it; without one
          // (a merge racing the initial load) the draft stands in as base.
          const base: TimelineMergeDoc =
            before.syncedDocument ?? draft;

          const { doc, conflicts } = mergeTimelineDocuments(
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
            store.getState().applyExternalMerge({
              tracks: doc.tracks as TimelineStoreState["tracks"],
              clips: doc.clips as TimelineStoreState["clips"],
              markers: doc.markers as TimelineStoreState["markers"],
              transcript: doc.transcript as TimelineStoreState["transcript"],
              scriptEnabled: doc.scriptEnabled,
              fps: doc.fps,
              width: doc.width,
              height: doc.height
            });
          } finally {
            temporal.resume();
          }
          // The merge base for the next external change is what the SERVER
          // now holds — not the merged draft. Snapshotting the draft here
          // would let a second external write clobber local clip edits.
          store
            .getState()
            .setBaseUpdatedAt(sequence.updatedAt, {
              tracks: serverDoc.tracks as TimelineStoreState["tracks"],
              clips: serverDoc.clips as TimelineStoreState["clips"],
              markers: serverDoc.markers as TimelineStoreState["markers"],
              transcript: serverDoc.transcript as TimelineStoreState["transcript"],
              scriptEnabled: serverDoc.scriptEnabled,
              fps: serverDoc.fps,
              width: serverDoc.width,
              height: serverDoc.height
            });

          useConflictStore.getState().setConflicts(
            conflictKey(sequenceId),
            listable(conflicts),
            {
              onAccept: (unitId) => {
                const key = conflictKey(sequenceId);
                const entry = useConflictStore.getState().byKey[key];
                const conflict = entry?.conflicts.find(
                  (c) => c.unit.id === unitId
                );
                if (!conflict) return;
                applyAcceptedConflict(store.getState(), conflict);
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
