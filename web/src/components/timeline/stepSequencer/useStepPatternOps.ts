/**
 * Runs Step Sequencer edits through the timeline ops (SQ46). A list of ops is
 * applied in order to one working copy and written back with one
 * `applyAgentEdit`, so one gesture or command is one undo entry and goes
 * through the same code path as the agent tools.
 *
 * Runs are serialized per document, across every hook instance: each starts
 * from the state the previous one wrote, so concurrent edits never overwrite
 * each other (F2, F55). A run whose document changed while it awaited library
 * ops starts again from the new state. Each run is one gesture
 * and one undo entry (F48), and fails alone (F49). Callers group a MIDI chord
 * into one run at the chord boundary.
 */

import { useCallback, useMemo } from "react";
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

/** Attempts before a run gives up rebasing onto a document that keeps changing. */
const MAX_REBASES = 3;

/** The document fields a run reads; a change to any of them makes the run stale. */
const DOCUMENT_KEYS = [
  "fps", "width", "height", "tracks", "trackFolders", "clips", "markers", "mediaTracks", "tempo", "music",
  "master", "setup", "transcript", "scriptEnabled", "camera2d", "storyboardMaterializations"
] as const;

/** One queue per document store, shared by every hook instance (F55). */
const documentQueues = new WeakMap<object, Promise<void>>();

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
    async (
      ops: readonly StepPatternOpStep[],
      options?: StepPatternRunOptions,
      attempt = 0
    ): Promise<TimelineOpResult[]> => {
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
        const now = doc.getState();
        const stale = DOCUMENT_KEYS.some((key) => s[key] !== now[key]);
        if (stale && attempt < MAX_REBASES) {
          return apply(ops, options, attempt + 1);
        }
        if (stale) throw new Error("The timeline changed during the edit. Try again.");
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
            // The resolution can move clips, so the duration follows it (F56).
            const after = doc.getState();
            const durationMs = after.clips.reduce((end, c) => Math.max(end, c.startMs + c.durationMs), 0);
            if (durationMs !== after.durationMs) doc.setState({ durationMs });
          });
        } else {
          write();
        }
      }
      return results;
    },
    [doc, ui, library]
  );

  // One run is one gesture: it applies atomically and writes one undo entry.
  // A failed run rejects alone and leaves the runs queued after it intact.
  const run = useCallback(
    (ops: readonly StepPatternOpStep[], options?: StepPatternRunOptions): Promise<TimelineOpResult[]> => {
      const tail = documentQueues.get(doc) ?? Promise.resolve();
      const result = tail.then(() => apply(ops, options));
      documentQueues.set(
        doc,
        result.then(
          () => undefined,
          () => undefined
        )
      );
      return result;
    },
    [doc, apply]
  );

  return useMemo(() => ({ run }), [run]);
}
