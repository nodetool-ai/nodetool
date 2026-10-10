/**
 * In-repo replacement for the `zundo` temporal (undo/redo) middleware.
 *
 * Replicates the zundo v2 API surface this codebase uses:
 *   temporal(config, { partialize, equality, limit })
 * attaching a vanilla Zustand store at `store.temporal` whose state is
 * `TemporalState<PartialState>`: `pastStates`, `futureStates`,
 * `undo(steps?)`, `redo(steps?)`, `clear()`, `pause()`, `resume()`,
 * `isTracking`, plus `beginGroup()`/`endGroup()` for one undo entry per
 * continuous edit and an `onRestore` option called after undo and redo.
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

declare module "zustand/vanilla" {
  /**
   * Registers the middleware with zustand's mutator table so
   * `create<TState>()(temporal(config, { partialize }))` is typed as a store
   * carrying `temporal: StoreApi<TemporalState<PartialState>>` — no cast at
   * the call site.
   */
  interface StoreMutators<S, A> {
    "nodetool/temporal": S & { temporal: StoreApi<TemporalState<A>> };
  }
}

/** The mutator entry this middleware contributes to a store's type. */
type TemporalMutator<PartialState> = ["nodetool/temporal", PartialState];

export interface TemporalState<PartialState> {
  pastStates: PartialState[];
  futureStates: PartialState[];
  undo: (steps?: number) => void;
  redo: (steps?: number) => void;
  clear: () => void;
  isTracking: boolean;
  pause: () => void;
  resume: () => void;
  /**
   * Open an edit group: record the current state as one undo entry, then stop
   * tracking until the matching `endGroup`, so a continuous edit (typing, a
   * slider drag) undoes in one step. Groups nest; only the outermost records.
   * Does nothing while tracking is already paused.
   */
  beginGroup: () => void;
  /**
   * Close the group `beginGroup` opened and restore tracking. When the group
   * changed nothing, its entry is dropped and the redo stack is kept.
   */
  endGroup: () => void;
}

export interface TemporalOptions<TState, PartialState> {
  /** Project the tracked slice of state; defaults to the full state. */
  partialize?: (state: TState) => PartialState;
  /**
   * Return true when two partialized snapshots are equivalent, so no-op
   * sets don't push duplicate undo entries. Without it every set pushes.
   *
   * `NoInfer` keeps `partialize` the single source of `PartialState`: an
   * `equality` that accepts a wider argument type (e.g. `Snapshot |
   * undefined`) stays assignable instead of widening the tracked slice.
   */
  equality?: (
    pastState: NoInfer<PartialState>,
    currentState: NoInfer<PartialState>
  ) => boolean;
  /** Maximum number of past states retained (oldest dropped first). */
  limit?: number;
  /** Called with the restored state after every `undo` and `redo`. */
  onRestore?: (state: TState) => void;
}

/** A store augmented with the temporal (undo/redo) sub-store. */
export type WithTemporal<S, PartialState> = S & {
  temporal: StoreApi<TemporalState<PartialState>>;
};

/** Tracks the whole state — the default when no `partialize` is given. */
export function temporal<TState extends object>(
  config: StateCreator<TState, [], []>,
  options?: TemporalOptions<TState, TState>
): StateCreator<TState, [], [TemporalMutator<TState>]>;
/** Tracks the slice `partialize` projects out of the state. */
export function temporal<
  TState extends object,
  PartialState extends Partial<TState>
>(
  config: StateCreator<TState, [], []>,
  options: TemporalOptions<TState, PartialState> & {
    partialize: (state: TState) => PartialState;
  }
): StateCreator<TState, [], [TemporalMutator<PartialState>]>;
export function temporal<TState extends object>(
  config: StateCreator<TState, [], []>,
  options: TemporalOptions<TState, TState> = {}
): StateCreator<TState, [], [TemporalMutator<TState>]> {
  return createTemporal(
    config,
    options.partialize ?? ((state: TState) => state),
    options
  );
}

function createTemporal<
  TState extends object,
  PartialState extends Partial<TState>
>(
  config: StateCreator<TState, [], []>,
  partialize: (state: TState) => PartialState,
  options: TemporalOptions<TState, PartialState>
): StateCreator<TState, [], [TemporalMutator<PartialState>]> {
  return (set, get, store) => {
    // undo/redo restore through the RAW setter so they don't re-enter the
    // history tracking below. A partialized snapshot is a subset of the state,
    // so it applies as a merge patch.
    const restore = (state: PartialState): void => {
      set(state);
    };

    const withinLimit = (pastStates: PartialState[]): PartialState[] =>
      options.limit !== undefined && pastStates.length >= options.limit
        ? pastStates.slice(pastStates.length - options.limit + 1)
        : pastStates;

    // The open edit group: nesting depth and, when the outermost group
    // recorded an entry, the redo stack it cleared (kept for an empty group).
    let groupDepth = 0;
    let groupFuture: PartialState[] | null = null;

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
          options.onRestore?.(get());
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
          options.onRestore?.(get());
        },
        clear: () => tset({ pastStates: [], futureStates: [] }),
        pause: () => tset({ isTracking: false }),
        resume: () => tset({ isTracking: true }),
        beginGroup: () => {
          groupDepth += 1;
          if (groupDepth > 1) {
            return;
          }
          const { isTracking, pastStates, futureStates } = tget();
          if (!isTracking) {
            groupFuture = null;
            return;
          }
          groupFuture = futureStates;
          tset({
            pastStates: [...withinLimit(pastStates), partialize(get())],
            futureStates: [],
            isTracking: false
          });
        },
        endGroup: () => {
          if (groupDepth === 0) {
            return;
          }
          groupDepth -= 1;
          if (groupDepth > 0 || groupFuture === null) {
            return;
          }
          const savedFuture = groupFuture;
          groupFuture = null;
          const { pastStates, futureStates } = tget();
          const last = pastStates[pastStates.length - 1];
          // The entry may have been rebased since beginGroup, so compare by
          // value: an entry equal to the current state is an empty undo step.
          const unchanged =
            last !== undefined &&
            options.equality?.(last, partialize(get())) === true;
          tset(
            unchanged
              ? {
                  isTracking: true,
                  pastStates: pastStates.slice(0, -1),
                  futureStates:
                    futureStates.length === 0 ? savedFuture : futureStates
                }
              : { isTracking: true }
          );
        }
      })
    );

    // SAFETY: the `store` handed to a state creator is typed with the mutators
    // applied *before* this one, so it does not yet carry the `temporal`
    // property this line is attaching. The store the caller receives does —
    // that is what the `nodetool/temporal` mutator entry above declares.
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
      // Drop the oldest entries so the new push lands within the limit.
      temporalStore.setState({
        pastStates: [...withinLimit(t.pastStates), pastState],
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
