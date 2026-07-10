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
 * the pause to a genuine increase in `pastStates.length` guarantees the
 * pre-gesture state is always checkpointed before tracking is paused.
 *
 * Usage:
 *   const history = useTimelineHistoryBatch();
 *   // pointerdown (gesture start):   history.begin();
 *   // after each store mutation:     history.mark();
 *   // pointerup / pointercancel:     history.end();
 */

import { useCallback, useEffect, useRef } from "react";
import { useTimelineStoreApi, timelineTemporalOf } from "./TimelineStore";

export interface TimelineHistoryBatch {
  /** Start a gesture: snapshot the current undo-stack depth as the baseline. */
  begin: () => void;
  /** Call after every store mutation; pauses once a checkpoint was recorded. */
  mark: () => void;
  /** End the gesture: resume history tracking if it was paused. */
  end: () => void;
}

export function useTimelineHistoryBatch(): TimelineHistoryBatch {
  const api = useTimelineStoreApi();
  const pausedRef = useRef(false);
  const activeRef = useRef(false);
  const baselineRef = useRef(0);

  const begin = useCallback(() => {
    activeRef.current = true;
    baselineRef.current = timelineTemporalOf(api).pastStates.length;
  }, [api]);

  const mark = useCallback(() => {
    if (
      activeRef.current &&
      !pausedRef.current &&
      timelineTemporalOf(api).pastStates.length > baselineRef.current
    ) {
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
  useEffect(() => end, [end]);

  return { begin, mark, end };
}
