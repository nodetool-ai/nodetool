import { useCallback, useEffect, useMemo, useRef } from "react";

import { useOptionalTemporalNodes } from "../contexts/NodeContext";

/** Outside the graph editor there is no undo history to group. */
const NO_OP = (): void => undefined;

interface UndoGroup {
  /** Start a continuous edit. Repeated calls before `end` are ignored. */
  begin: () => void;
  /** Finish the edit. Safe to call when no edit is open. */
  end: () => void;
  /**
   * Start an edit that ends at `end` or, at the latest, when the pointer is
   * released. For gestures whose end callback only fires after movement, such
   * as React Flow's resizer: a click without a drag would otherwise leave
   * history paused, and every later edit would be missing from undo.
   */
  beginGesture: () => void;
}

/**
 * Records one undo entry for a continuous edit of the graph, such as typing
 * into a text property or dragging a number slider. Call `begin` when the edit
 * starts (focus, drag start) and `end` when it finishes (blur, drag end). An
 * edit still open when the component unmounts is ended then, so history is
 * never left paused.
 */
export function useUndoGroup(): UndoGroup {
  const beginGroup = useOptionalTemporalNodes(
    (state) => state.beginGroup,
    NO_OP
  );
  const endGroup = useOptionalTemporalNodes((state) => state.endGroup, NO_OP);
  // The `endGroup` of the store the open edit began on, or null.
  const openRef = useRef<(() => void) | null>(null);

  const end = useCallback((): void => {
    const close = openRef.current;
    openRef.current = null;
    close?.();
  }, []);

  const begin = useCallback((): void => {
    if (openRef.current) {
      return;
    }
    beginGroup();
    openRef.current = endGroup;
  }, [beginGroup, endGroup]);

  const beginGesture = useCallback((): void => {
    if (openRef.current) {
      return;
    }
    begin();
    const release = (): void => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      // Let the gesture's own end callback, which fires on the mouseup
      // after this pointerup, close the edit first.
      setTimeout(end, 0);
    };
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
  }, [begin, end]);

  useEffect(() => end, [end]);

  return { begin, end, beginGesture };
}

/** Quiet time after which a run of writes counts as finished. */
const IDLE_UNDO_GROUP_MS = 800;

interface IdleUndoGroup {
  /** Record a write: opens the edit, or keeps the open one going. */
  touch: () => void;
  /** Finish the edit now, as at a slider's release. */
  end: () => void;
}

/**
 * One undo entry for a run of writes whose end is not always signalled, such
 * as a node-body slider: the edit ends at `end` or after a short pause in
 * writes, so history is never left paused.
 */
export function useIdleUndoGroup(): IdleUndoGroup {
  const { begin, end: endGroup } = useUndoGroup();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const end = useCallback((): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    endGroup();
  }, [endGroup]);

  const touch = useCallback((): void => {
    begin();
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(end, IDLE_UNDO_GROUP_MS);
  }, [begin, end]);

  useEffect(() => end, [end]);

  return useMemo(() => ({ touch, end }), [touch, end]);
}
