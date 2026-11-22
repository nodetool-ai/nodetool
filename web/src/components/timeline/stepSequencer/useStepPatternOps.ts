/**
 * Runs Step Sequencer edits through the timeline ops (SQ46). A list of ops is
 * applied in order to one working copy and written back with one
 * `applyAgentEdit`, so one gesture or command is one undo entry and goes
 * through the same code path as the agent tools.
 *
 * Runs are serialized: each starts from the state the previous one wrote, so
 * concurrent edits never overwrite each other (F2). Each run is one gesture
 * and one undo entry (F48), and fails alone (F49). Callers group a MIDI chord
 * into one run at the chord boundary.
 */

import { useCallback, useMemo, useRef } from "react";
import { createTimeOrderedUuid } from "@nodetool-ai/timeline";
import {
  applyTimelineOp,
  type TimelineOp,
  type TimelineOpContext,
  type TimelineOpResult,
  type TimelineOpState
} from "@nodetool-ai/timeline/ops";

import { useTimelineStoreApi } from "../../../stores/timeline/TimelineStore";
import { runAsOneUndoEntry } from "../../../stores/timeline/useTimelineHistoryBatch";
import { useTimelineUIStoreApi } from "../../../stores/timeline/TimelineUIStore";
import { createBrowserStepPatternLibrary } from "../../../hooks/timeline/useTimelineAgentBridge";
import { DEFAULT_TIMELINE_INSTRUMENT } from "../../../stores/timeline/instrumentPresets";

/** Ops that only read the timeline (library ops included); their state is never written back. */
const READ_ONLY_OPS = new Set<TimelineOp["op"]>([
  "get_pattern",
  "list_step_patterns",
  "save_step_pattern",
  "create_step_pattern_folder",
  "rename_step_pattern_folder",
  "delete_step_pattern_folder",
  "move_step_pattern"
]);

/** An op, or a function that builds one from the results of the ops before it. */
export type StepPatternOpStep = TimelineOp | ((previous: readonly TimelineOpResult[]) => TimelineOp);

export interface StepPatternRunOptions {
  /**
   * Runs right after the write, in the same undo entry, with the ids of the
   * clips the run created. A region drop resolves its Drag mode here.
   */
  afterWrite?: (createdClipIds: ReadonlySet<string>) => void;
}

export interface StepPatternOps {
  /** Apply `ops` as one undo entry. Resolves with each op's result. */
  run: (ops: readonly StepPatternOpStep[], options?: StepPatternRunOptions) => Promise<TimelineOpResult[]>;
}

export function useStepPatternOps(): StepPatternOps {
  const doc = useTimelineStoreApi();
  const ui = useTimelineUIStoreApi();
  const library = useMemo(() => {
    const inner = createBrowserStepPatternLibrary();
    // Without a reachable asset store the factory library still lists.
    return {
      ...inner,
      list: () => inner.list().catch(() => []),
      ...(inner.listFolders ? { listFolders: () => inner.listFolders!().catch(() => []) } : {})
    };
  }, []);

  const apply = useCallback(
    async (ops: readonly StepPatternOpStep[], options?: StepPatternRunOptions): Promise<TimelineOpResult[]> => {
      const s = doc.getState();
      let state: TimelineOpState = {
        fps: s.fps,
        width: s.width,
        height: s.height,
        tracks: s.tracks,
        trackFolders: s.trackFolders,
        clips: s.clips,
        markers: s.markers,
        mediaTracks: s.mediaTracks,
        tempo: s.tempo,
        music: s.music,
        master: s.master,
        setup: s.setup,
        transcript: s.transcript,
        scriptEnabled: s.scriptEnabled,
        camera2d: s.camera2d,
        storyboardMaterializations: s.storyboardMaterializations,
        playheadMs: 0,
        selectedClipIds: [...ui.getState().selectedClipIds]
      };
      const context: TimelineOpContext = {
        newId: () => createTimeOrderedUuid(),
        defaultMidiInstrument: DEFAULT_TIMELINE_INSTRUMENT,
        stepPatternLibrary: library
      };
      const results: TimelineOpResult[] = [];
      let wrote = false;
      for (const step of ops) {
        const op = typeof step === "function" ? step(results) : step;
        const outcome = await applyTimelineOp(state, op, context);
        if (outcome.error) throw new Error(outcome.error);
        results.push(outcome.result);
        if (!READ_ONLY_OPS.has(op.op)) {
          state = outcome.state;
          wrote = true;
        }
      }
      if (wrote) {
        const next = state;
        const write = () =>
          doc.getState().applyAgentEdit({ ...next, mediaTracks: next.mediaTracks ?? [] }, { preserveTiming: true });
        const { afterWrite } = options ?? {};
        if (afterWrite) {
          const had = new Set(s.clips.map((c) => c.id));
          const created = new Set(next.clips.filter((c) => !had.has(c.id)).map((c) => c.id));
          runAsOneUndoEntry(doc, () => {
            write();
            afterWrite(created);
          });
        } else {
          write();
        }
      }
      return results;
    },
    [doc, ui, library]
  );

  const chain = useRef<Promise<void>>(Promise.resolve());

  // One run is one gesture: it applies atomically and writes one undo entry.
  // A failed run rejects alone and leaves the runs queued after it intact.
  const run = useCallback(
    (ops: readonly StepPatternOpStep[], options?: StepPatternRunOptions): Promise<TimelineOpResult[]> => {
      const result = chain.current.then(() => apply(ops, options));
      chain.current = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
    [apply]
  );

  return useMemo(() => ({ run }), [run]);
}
