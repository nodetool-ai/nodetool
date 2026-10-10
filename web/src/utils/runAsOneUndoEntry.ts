import type { StoreApi } from "zustand";
import type { TemporalState } from "../stores/temporal";

interface TemporalHost<PartialState> {
  temporal: StoreApi<TemporalState<PartialState>>;
}

/**
 * Run `fn` so every mutation it makes lands as one undo entry: the state
 * before `fn`. Synchronous only.
 */
export function runAsOneUndoEntry<T, PartialState>(
  store: TemporalHost<PartialState>,
  fn: () => T
): T {
  const { beginGroup, endGroup } = store.temporal.getState();
  beginGroup();
  try {
    return fn();
  } finally {
    endGroup();
  }
}
