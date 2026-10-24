/**
 * useLinkedScript
 *
 * The script linked to an open timeline, kept live. A timeline links at most
 * one script: the script whose `timelineId` names the sequence. While the
 * timeline is open the script is loaded and saved through the shared script
 * sync, and every change to it is reconciled into the timeline at once —
 * voiced lines become voiceover clips, a new take replaces its clip's audio,
 * and a clip someone moved stays where they put it
 * ({@link reconcileScriptClips}).
 *
 * Script-driven changes are not timeline undo entries: undo in the timeline
 * would bring back a take the script no longer has. A timeline undo or redo
 * is reconciled again for the same reason.
 *
 * Deleting a line's clip in the timeline deletes the line from the script,
 * and undoing that delete brings the line back.
 */

import { useEffect } from "react";
import { reconcileScriptClips } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { trpc } from "../../trpc/client";
import {
  useScriptStore,
  type ScriptDraft
} from "../../stores/script/ScriptStore";
import { holdLiveTimeline } from "../../stores/script/liveTimelineLinks";
import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../stores/timeline/TimelineStore";
import type { DocumentLoadState } from "../../stores/documentSync";
import { useScriptServerSync } from "../script/useScriptServerSync";
import { withHistoryPaused } from "./timelineExternalMerge";

/** Lines a timeline clip deletion removed from the script. */
interface LineDeletion {
  lineIds: string[];
  /** The script as the deletion (or its last undo or redo) left it. */
  script: ScriptDraft | undefined;
  undone: boolean;
}

/** The id of the script linked to `sequenceId`, or null when none is. */
export function useLinkedScriptId(sequenceId: string | null): string | null {
  // A link made or removed in this browser is in the store before the list
  // query catches up.
  const local = useScriptStore((state) => {
    if (!sequenceId) return undefined;
    for (const script of Object.values(state.scripts)) {
      if (script.timelineId === sequenceId) return script.id;
    }
    return undefined;
  });
  const { data } = trpc.scripts.list.useQuery(
    { timelineId: sequenceId ?? "" },
    { enabled: !!sequenceId, staleTime: 30_000 }
  );
  if (local) return local;
  const listed = data?.[0]?.id;
  if (!listed) return null;
  // The store copy wins: a script unlinked here is still listed until the
  // query refetches.
  const loaded = useScriptStore.getState().scripts[listed];
  return loaded && loaded.timelineId !== sequenceId ? null : listed;
}

/**
 * Load `scriptId` and reconcile it into the timeline whose store this hook
 * runs under. Returns the script's load state.
 */
export function useLinkedScriptSync(scriptId: string): DocumentLoadState {
  const loadState = useScriptServerSync(scriptId);
  const docApi = useTimelineStoreApi();
  const sequenceId = useTimelineStore((state) => state.sequenceId);

  useEffect(() => {
    if (loadState !== "ready" || !sequenceId) return;
    const release = holdLiveTimeline(sequenceId);

    const apply = (): void => {
      const script = useScriptStore.getState().scripts[scriptId];
      const state = docApi.getState();
      if (!script || state.sequenceId !== sequenceId) return;
      const result = reconcileScriptClips(
        { tracks: state.tracks, clips: state.clips },
        { scriptId, cast: script.cast, sections: script.sections }
      );
      if (!result.changed) return;
      withHistoryPaused(docApi, () =>
        state.applyAgentEdit(
          {
            tracks: result.tracks,
            clips: result.clips,
            markers: state.markers,
            mediaTracks: state.mediaTracks
          },
          { preserveTiming: true }
        )
      );
    };

    apply();
    const unsubscribe = useScriptStore.subscribe((state, prev) => {
      if (state.scripts[scriptId] !== prev.scripts[scriptId]) apply();
    });

    // Lines removed because their clips were deleted here. A timeline undo of
    // that delete brings the lines back through the script's own undo, and a
    // redo removes them again, so the clip and its line never disagree.
    const deletions: LineDeletion[] = [];
    const ownedLineIds = (clips: readonly TimelineClip[]): Set<string> =>
      new Set(
        clips.flatMap((clip) =>
          clip.scriptId === scriptId && clip.scriptLineId ? [clip.scriptLineId] : []
        )
      );

    // A tracked edit that leaves a line with no clip deletes the line. Loads,
    // merges and this hook's own reconcile run with history paused, and an
    // undo or redo writes the snapshot its stack still holds, so neither
    // counts.
    const unsubscribeClips = docApi.subscribe((state, prev) => {
      if (state.clips === prev.clips || state.sequenceId !== prev.sequenceId) return;
      const history = docApi.temporal.getState();
      if (
        !history.isTracking ||
        history.pastStates.at(-1)?.clips === state.clips ||
        history.futureStates.at(-1)?.clips === state.clips
      ) {
        return;
      }
      const remaining = ownedLineIds(state.clips);
      const script = useScriptStore.getState().scripts[scriptId];
      if (!script) return;
      const lineIds = new Set(
        script.sections.flatMap((section) => section.lines).map((line) => line.id)
      );
      const removed = [...ownedLineIds(prev.clips)].filter(
        (id) => !remaining.has(id) && lineIds.has(id)
      );
      if (removed.length === 0) return;
      for (const lineId of removed) {
        useScriptStore.getState().removeLine(scriptId, lineId);
      }
      // A new edit ends the redo branch of every undone deletion.
      for (let i = deletions.length - 1; i >= 0; i--) {
        if (deletions[i].undone) deletions.splice(i, 1);
      }
      deletions.push({
        lineIds: removed,
        script: useScriptStore.getState().scripts[scriptId],
        undone: false
      });
    });

    /** Undo or redo the script side of a clip deletion the restore crossed. */
    const followDeletion = (undo: boolean, restoredLineIds: Set<string>): void => {
      const store = useScriptStore.getState();
      const entry = undo
        ? deletions.findLast((candidate) => !candidate.undone)
        : deletions.find((candidate) => candidate.undone);
      if (!entry || store.scripts[scriptId] !== entry.script) return;
      const crossed = undo
        ? entry.lineIds.every((id) => restoredLineIds.has(id))
        : entry.lineIds.every((id) => !restoredLineIds.has(id));
      if (!crossed) return;
      for (let i = 0; i < entry.lineIds.length; i++) {
        if (undo) store.undo(scriptId);
        else store.redo(scriptId);
      }
      entry.undone = undo;
      entry.script = useScriptStore.getState().scripts[scriptId];
    };

    // Undo and redo restore snapshots taken before later script changes, so
    // a restore is reconciled again. A restore is the stack that shrank
    // handing its entry's clips to the document; an edit that clears the redo
    // stack writes new clips and does not match.
    const unsubscribeHistory = docApi.temporal.subscribe((next, prev) => {
      const undo = next.pastStates.length < prev.pastStates.length;
      const restored = undo
        ? prev.pastStates[next.pastStates.length]
        : next.futureStates.length < prev.futureStates.length
          ? prev.futureStates[next.futureStates.length]
          : undefined;
      if (!restored || restored.clips !== docApi.getState().clips) return;
      followDeletion(undo, ownedLineIds(restored.clips));
      apply();
    });

    return () => {
      unsubscribe();
      unsubscribeClips();
      unsubscribeHistory();
      release();
    };
  }, [loadState, scriptId, sequenceId, docApi]);

  return loadState;
}
