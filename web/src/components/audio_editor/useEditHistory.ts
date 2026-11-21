import { useCallback, useRef, useState } from "react";

/**
 * A tiny undo/redo stack for an immutable editor value.
 *
 * `commit` replaces the present and clears the redo branch; `undo`/`redo` walk
 * the stack. The value is held by reference, so callers must produce new
 * objects on each edit (the audio ops in `audioSample.ts` already do). Past
 * states are capped so long sessions don't grow without bound.
 *
 * The stack lives in a ref that every call updates at once, and the state
 * only triggers the render. Agent tool calls in one turn run faster than a
 * render, and they read `previous()` to check the step they undo is still
 * there.
 */

export const MAX_HISTORY = 50;

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

interface EditHistory<T> {
  present: T | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Discard history and start fresh from `value`. */
  reset: (value: T) => void;
  /** Push a new present, clearing the redo branch. */
  commit: (value: T) => void;
  undo: () => void;
  redo: () => void;
  /** The state one undo returns to, as of the latest call, or null. */
  previous: () => T | null;
  /** The present as of the latest call, before React renders it. */
  current: () => T | null;
}

export function useEditHistory<T>(): EditHistory<T> {
  const stack = useRef<HistoryState<T> | null>(null);
  const [state, setState] = useState<HistoryState<T> | null>(null);

  const apply = useCallback((next: HistoryState<T> | null) => {
    if (next === stack.current) {return;}
    stack.current = next;
    setState(next);
  }, []);

  const reset = useCallback(
    (value: T) => apply({ past: [], present: value, future: [] }),
    [apply]
  );

  const commit = useCallback(
    (value: T) => {
      const prev = stack.current;
      if (!prev) {
        apply({ past: [], present: value, future: [] });
        return;
      }
      // An edit that returned the same value changed nothing, so it is no
      // undo step. Recording it would let one undo appear to do nothing.
      if (prev.present === value) {return;}
      apply({
        past: [...prev.past, prev.present].slice(-MAX_HISTORY),
        present: value,
        future: []
      });
    },
    [apply]
  );

  const undo = useCallback(() => {
    const prev = stack.current;
    if (!prev || prev.past.length === 0) {return;}
    apply({
      past: prev.past.slice(0, -1),
      present: prev.past[prev.past.length - 1],
      future: [prev.present, ...prev.future]
    });
  }, [apply]);

  const redo = useCallback(() => {
    const prev = stack.current;
    if (!prev || prev.future.length === 0) {return;}
    const [present, ...future] = prev.future;
    apply({ past: [...prev.past, prev.present], present, future });
  }, [apply]);

  const previous = useCallback(
    (): T | null => stack.current?.past.at(-1) ?? null,
    []
  );
  const current = useCallback((): T | null => stack.current?.present ?? null, []);

  return {
    present: state?.present ?? null,
    canUndo: !!state && state.past.length > 0,
    canRedo: !!state && state.future.length > 0,
    reset,
    commit,
    undo,
    redo,
    previous,
    current
  };
}
