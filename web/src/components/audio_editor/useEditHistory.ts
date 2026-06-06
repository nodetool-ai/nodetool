import { useCallback, useState } from "react";

/**
 * A tiny undo/redo stack for an immutable editor value.
 *
 * `commit` replaces the present and clears the redo branch; `undo`/`redo` walk
 * the stack. The value is held by reference, so callers must produce new
 * objects on each edit (the audio ops in `audioSample.ts` already do). Past
 * states are capped so long sessions don't grow without bound.
 */

const MAX_HISTORY = 50;

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export interface EditHistory<T> {
  present: T | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Discard history and start fresh from `value`. */
  reset: (value: T) => void;
  /** Push a new present, clearing the redo branch. */
  commit: (value: T) => void;
  undo: () => void;
  redo: () => void;
}

export function useEditHistory<T>(): EditHistory<T> {
  const [state, setState] = useState<HistoryState<T> | null>(null);

  const reset = useCallback((value: T) => {
    setState({ past: [], present: value, future: [] });
  }, []);

  const commit = useCallback((value: T) => {
    setState((prev) =>
      prev
        ? {
            past: [...prev.past, prev.present].slice(-MAX_HISTORY),
            present: value,
            future: []
          }
        : { past: [], present: value, future: [] }
    );
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      if (!prev || prev.past.length === 0) return prev;
      const present = prev.past[prev.past.length - 1];
      return {
        past: prev.past.slice(0, -1),
        present,
        future: [prev.present, ...prev.future]
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (!prev || prev.future.length === 0) return prev;
      const [present, ...future] = prev.future;
      return { past: [...prev.past, prev.present], present, future };
    });
  }, []);

  return {
    present: state?.present ?? null,
    canUndo: !!state && state.past.length > 0,
    canRedo: !!state && state.future.length > 0,
    reset,
    commit,
    undo,
    redo
  };
}
