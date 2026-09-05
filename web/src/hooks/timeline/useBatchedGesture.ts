/**
 * The coalescing half of a timeline pointer gesture.
 *
 * `useTimelineHistoryBatch` owns the undo side — one entry per gesture. This
 * owns the write side: at most one store write per animation frame while a
 * pointer or a key repeat is producing ticks, and a synchronous flush on
 * commit so the value the gesture ended on is never dropped to a frame that
 * never runs.
 *
 * A single arrow-key press on an MUI slider fires `onChange` immediately
 * followed by `onChangeCommitted`, both synchronous. `commit` cancels the
 * pending frame and applies the value itself, so that press is still exactly
 * one write and one undo entry.
 */

import { useCallback, useEffect, useRef, type RefObject } from "react";

import { useTimelineHistoryBatch } from "../../stores/timeline/useTimelineHistoryBatch";

export interface BatchedGesture<T> {
  /** Open the undo batch. A no-op while a gesture is already open. */
  begin: () => void;
  /** Queue a value for the next frame, opening the gesture if needed. */
  schedule: (value: T) => void;
  /**
   * Flush synchronously and close the gesture. With `value`, that value wins
   * over anything queued; without one, the queued value is applied. A no-op
   * when no gesture is open.
   */
  commit: (value?: T) => void;
  /** Drop the queued value and close the gesture without applying it. */
  cancel: () => void;
}

export function useBatchedGesture<T>(
  apply: (value: T) => void
): BatchedGesture<T> {
  const { begin: historyBegin, mark, end } = useTimelineHistoryBatch();

  const applyRef = useRef(apply);
  applyRef.current = apply;
  const activeRef = useRef(false);
  const pendingRef = useRef<{ value: T } | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafIdRef.current = null;
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    applyRef.current(pending.value);
    mark();
  }, [mark]);

  const begin = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    historyBegin();
  }, [historyBegin]);

  const schedule = useCallback(
    (value: T) => {
      begin();
      pendingRef.current = { value };
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flush);
      }
    },
    [begin, flush]
  );

  const cancelFrame = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const commit = useCallback(
    (value?: T) => {
      if (!activeRef.current) return;
      cancelFrame();
      const pending = pendingRef.current;
      pendingRef.current = null;
      const next = value !== undefined ? value : pending?.value;
      if (next !== undefined) {
        applyRef.current(next);
        mark();
      }
      end();
      activeRef.current = false;
    },
    [cancelFrame, mark, end]
  );

  const cancel = useCallback(() => {
    if (!activeRef.current) return;
    cancelFrame();
    pendingRef.current = null;
    end();
    activeRef.current = false;
  }, [cancelFrame, end]);

  useEffect(() => cancelFrame, [cancelFrame]);

  return { begin, schedule, commit, cancel };
}

/**
 * A wheel burst as one undo entry.
 *
 * Attached natively with `passive: false`: React's `onWheel` is passive, so
 * `preventDefault()` there cannot stop the page from scrolling under the
 * handle. `onTick` and `disabled` are read through refs so the listener is
 * attached once and a re-render mid-burst cannot close the batch early.
 *
 * `direction` is `1` for a wheel-up tick and `-1` for wheel-down, so a call
 * site reads as an increment rather than as a `deltaY` sign test.
 */
export function useWheelBatch(
  ref: RefObject<Element | null>,
  onTick: (direction: 1 | -1) => void,
  disabled = false,
  quietMs = 300
): void {
  const { begin, mark, end } = useTimelineHistoryBatch();
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let active = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const onWheel = (e: Event) => {
      if (disabledRef.current) return;
      e.preventDefault();
      if (!active) {
        active = true;
        begin();
      }
      onTickRef.current((e as WheelEvent).deltaY > 0 ? -1 : 1);
      mark();
      if (timeout !== null) clearTimeout(timeout);
      timeout = setTimeout(() => {
        timeout = null;
        active = false;
        end();
      }, quietMs);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (timeout !== null) clearTimeout(timeout);
      if (active) {
        active = false;
        end();
      }
    };
  }, [ref, begin, mark, end, quietMs]);
}
