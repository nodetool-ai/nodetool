/**
 * The Director run in flight for each board.
 *
 * The setup flow, the board's own Direct button and the agent's
 * `ui_storyboard_direct` each hold their own `useDirectScreenplay`. Without one
 * record per board, a press during another caller's run paid for a second
 * screenplay, and the flow showed the agent's run as nothing at all.
 */

import { useCallback, useSyncExternalStore } from "react";

const runs = new Map<string, AbortController>();
const listeners = new Set<() => void>();

const announce = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Record a run for the board. Returns null when one is already running. The
 * caller's own signal, when given, cancels the run too.
 */
export function startBoardDirecting(
  boardId: string,
  signal?: AbortSignal
): AbortController | null {
  if (runs.has(boardId)) {
    return null;
  }
  const run = new AbortController();
  if (signal?.aborted) {
    run.abort();
  } else {
    signal?.addEventListener("abort", () => run.abort(), { once: true });
  }
  runs.set(boardId, run);
  announce();
  return run;
}

export function endBoardDirecting(boardId: string, run: AbortController): void {
  if (runs.get(boardId) === run) {
    runs.delete(boardId);
    announce();
  }
}

/** Stop the board's run, whichever caller started it. */
export function cancelBoardDirecting(boardId: string): void {
  runs.get(boardId)?.abort();
}

/** True while a Director run is writing this board's screenplay. */
export function useBoardDirecting(boardId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    useCallback(() => runs.has(boardId), [boardId])
  );
}
