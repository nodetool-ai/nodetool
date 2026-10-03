/**
 * useTimelineHistoryBatch
 *
 * Collapses a multi-mutation pointer gesture (clip drag, clip trim, track
 * resize) into a SINGLE undo entry.
 *
 * The pattern: let the first store mutation that actually changes the document
 * record the pre-gesture state (the temporal middleware pushes it onto the undo stack), then
 * pause history tracking so the rest of the gesture records nothing, and
 * resume on pointerup.
 *
 * Why gate the pause on the undo stack growing (rather than "pause after the
 * first mutation call"): a gesture's opening pointermoves are often clamped
 * no-ops — trimming past a clip/source boundary throws and the store returns
 * its previous state, dragging a clip already at 0 clamps, resizing a track at
 * its min/max height clamps. Those produce no undo entry. Pausing right after
 * such a no-op would suppress the FIRST real mutation's checkpoint, so undo
 * would over-revert (swallowing the gesture and the action before it). Tying
 * the pause to a genuine push onto `pastStates` (length change or a new newest entry at the limit) guarantees the
 * pre-gesture state is always checkpointed before tracking is paused.
 *
 * Usage:
 *   const history = useTimelineHistoryBatch();
 *   // pointerdown (gesture start):   history.begin();
 *   // after each store mutation:     history.mark();
 *   // pointerup / pointercancel:     history.end();
 */

import { useCallback, useEffect, useRef } from "react";
import {
  useTimelineStoreApi,
  timelineTemporalOf,
  type TimelineStoreApi
} from "./TimelineStore";

interface TimelineHistoryBatch {
  /** Start a gesture: snapshot the current undo-stack depth as the baseline. */
  begin: () => void;
  /** Call after every store mutation; pauses once a checkpoint was recorded. */
  mark: () => void;
  /** End the gesture: resume history tracking if it was paused. */
  end: () => void;
}

interface TimelineHistoryBatchOptions {
  /**
   * Keep the batch open when the owning component unmounts. For gestures
   * driven by window listeners that outlive the component (a clip dragged into
   * another track remounts it); the gesture's own pointerup calls `end()`.
   */
  survivesUnmount?: boolean;
}

export function useTimelineHistoryBatch(
  options: TimelineHistoryBatchOptions = {}
): TimelineHistoryBatch {
  const survivesUnmountRef = useRef(options.survivesUnmount === true);
  survivesUnmountRef.current = options.survivesUnmount === true;
  const api = useTimelineStoreApi();
  const pausedRef = useRef(false);
  const activeRef = useRef(false);
  const baselineRef = useRef<{ length: number; last: unknown }>({
    length: 0,
    last: undefined
  });

  const begin = useCallback(() => {
    activeRef.current = true;
    const past = timelineTemporalOf(api).pastStates;
    baselineRef.current = { length: past.length, last: past[past.length - 1] };
  }, [api]);

  const mark = useCallback(() => {
    if (!activeRef.current || pausedRef.current) {
      return;
    }
    // A push at the stack limit drops the oldest entry, so the length stays
    // flat: compare the newest entry's identity as well.
    const past = timelineTemporalOf(api).pastStates;
    const base = baselineRef.current;
    if (past.length !== base.length || past[past.length - 1] !== base.last) {
      timelineTemporalOf(api).pause();
      pausedRef.current = true;
    }
  }, [api]);

  const end = useCallback(() => {
    activeRef.current = false;
    if (pausedRef.current) {
      pausedRef.current = false;
      timelineTemporalOf(api).resume();
    }
  }, [api]);

  // Safety net: never leave history paused if the owner unmounts mid-gesture.
  useEffect(
    () => () => {
      if (!survivesUnmountRef.current) {
        end();
      }
    },
    [end]
  );

  return { begin, mark, end };
}

/**
 * Run `fn` so every mutation it makes lands as ONE undo entry (the state
 * before `fn`). Entries pushed during `fn` are collapsed onto the first one.
 * Synchronous only. Handles a stack sitting at its limit by locating the
 * pre-`fn` newest entry by identity rather than by length.
 */
export function runAsOneUndoEntry<T>(api: TimelineStoreApi, fn: () => T): T {
  const before = timelineTemporalOf(api).pastStates;
  const lastBefore = before[before.length - 1];
  const result = fn();
  const after = timelineTemporalOf(api).pastStates;
  const anchor = lastBefore === undefined ? -1 : after.lastIndexOf(lastBefore);
  const added = after.length - (anchor + 1);
  if (added > 1) {
    api.temporal.setState({
      pastStates: [...after.slice(0, anchor + 1), after[anchor + 1]]
    });
  }
  return result;
}

/**
 * Run `fn` without recording undo entries (async fill-ins that follow a
 * recorded action). Leaves tracking as it found it, so it never resumes a
 * gesture batch that paused history.
 */
export function runWithoutUndoEntry<T>(api: TimelineStoreApi, fn: () => T): T {
  const t = timelineTemporalOf(api);
  if (!t.isTracking) {
    return fn();
  }
  t.pause();
  try {
    return fn();
  } finally {
    timelineTemporalOf(api).resume();
  }
}
