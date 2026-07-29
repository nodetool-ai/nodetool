/**
 * In-repo replacement for the `zundo` temporal (undo/redo) middleware.
 *
 * Replicates the zundo v2 API surface this codebase uses:
 *   temporal(config, { partialize, equality, limit })
 * attaching a vanilla Zustand store at `store.temporal` whose state is
 * `TemporalState<PartialState>`: `pastStates`, `futureStates`,
 * `undo(steps?)`, `redo(steps?)`, `clear()`, `pause()`, `resume()`,
 * `isTracking`.
 *
 * Semantics mirror zundo exactly for these options:
 * - Every `set` (both the one passed to the state creator and direct
 *   `store.setState` calls) snapshots the partialized state BEFORE the
 *   update; if tracking is on and `equality(pastState, currentState)` is
 *   false, the snapshot is pushed to `pastStates` and `futureStates` is
 *   cleared.
 * - `undo`/`redo` restore via the RAW store setter (a merge, not a
 *   replace), so they never push history themselves.
 * - `limit` drops the oldest entries so `pastStates` never exceeds it.
 *
 * Unsupported zundo options (`diff`, `onSave`, `handleSet`, `wrapTemporal`)
 * are intentionally omitted — nothing in this codebase uses them.
 */
import { createStore, StoreApi, StateCreator } from "zustand";

export interface TemporalState<PartialState> {
  pastStates: PartialState[];
  futureStates: PartialState[];
  undo: (steps?: number) => void;
  redo: (steps?: number) => void;
  clear: () => void;
  isTracking: boolean;
  pause: () => void;
  resume: () => void;
}

export interface TemporalOptions<TState, PartialState> {
  /** Project the tracked slice of state; defaults to the full state. */
  partialize?: (state: TState) => PartialState;
  /**
   * Return true when two partialized snapshots are equivalent, so no-op
   * sets don't push duplicate undo entries. Without it every set pushes.
   */
  equality?: (pastState: PartialState, currentState: PartialState) => boolean;
  /** Maximum number of past states retained (oldest dropped first). */
  limit?: number;
}

/** A store augmented with the temporal (undo/redo) sub-store. */
export type WithTemporal<S, PartialState> = S & {
  temporal: StoreApi<TemporalState<PartialState>>;
};

export function temporal<TState, PartialState = TState>(
  config: StateCreator<TState, [], []>,
  options: TemporalOptions<TState, PartialState> = {}
): StateCreator<TState, [], []> {
  return (set, get, store) => {
    const partialize =
      options.partialize ?? ((state: TState) => state as unknown as PartialState);

    // undo/redo restore through the RAW setter so they don't re-enter the
    // history tracking below. PartialState is a subset of TState by
    // construction (zundo semantics), hence the cast.
    const restore = (state: PartialState): void => {
      set(state as unknown as Partial<TState>);
    };

    const temporalStore = createStore<TemporalState<PartialState>>(
      (tset, tget) => ({
        pastStates: [],
        futureStates: [],
        isTracking: true,
        undo: (steps = 1) => {
          const { pastStates, futureStates } = tget();
          if (pastStates.length === 0) {
            return;
          }
          const currentState = partialize(get());
          const n = Math.min(steps, pastStates.length);
          // The last n snapshots, oldest first; the oldest is applied and
          // the rest land on futureStates newest-first (zundo behavior).
          const popped = pastStates.slice(pastStates.length - n);
          const nextState = popped[0];
          const skipped = popped.slice(1).reverse();
          restore(nextState);
          tset({
            pastStates: pastStates.slice(0, pastStates.length - n),
            futureStates: [...futureStates, currentState, ...skipped]
          });
        },
        redo: (steps = 1) => {
          const { pastStates, futureStates } = tget();
          if (futureStates.length === 0) {
            return;
          }
          const currentState = partialize(get());
          const n = Math.min(steps, futureStates.length);
          const popped = futureStates.slice(futureStates.length - n);
          const nextState = popped[0];
          const skipped = popped.slice(1).reverse();
          restore(nextState);
          tset({
            pastStates: [...pastStates, currentState, ...skipped],
            futureStates: futureStates.slice(0, futureStates.length - n)
          });
        },
        clear: () => tset({ pastStates: [], futureStates: [] }),
        pause: () => tset({ isTracking: false }),
        resume: () => tset({ isTracking: true })
      })
    );

    (
      store as WithTemporal<StoreApi<TState>, PartialState>
    ).temporal = temporalStore;

    const handleSet = (pastState: PartialState): void => {
      const t = temporalStore.getState();
      if (!t.isTracking) {
        return;
      }
      const currentState = partialize(get());
      if (options.equality?.(pastState, currentState)) {
        return;
      }
      let pastStates = t.pastStates;
      if (options.limit !== undefined && pastStates.length >= options.limit) {
        // Drop the oldest entries so the new push lands within the limit.
        pastStates = pastStates.slice(pastStates.length - options.limit + 1);
      }
      temporalStore.setState({
        pastStates: [...pastStates, pastState],
        futureStates: []
      });
    };

    const wrappedSet = ((...args: Parameters<typeof set>) => {
      const pastState = partialize(get());
      (set as (...a: Parameters<typeof set>) => void)(...args);
      handleSet(pastState);
    }) as typeof set;

    const rawSetState = store.setState;
    store.setState = ((...args: Parameters<typeof rawSetState>) => {
      const pastState = partialize(get());
      (rawSetState as (...a: Parameters<typeof rawSetState>) => void)(...args);
      handleSet(pastState);
    }) as typeof rawSetState;

    return config(wrappedSet, get, store);
  };
}
