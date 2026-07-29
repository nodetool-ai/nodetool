import { createStore, StoreApi } from "zustand";
import { temporal, TemporalState, WithTemporal } from "../temporal";

interface CounterState {
  count: number;
  untracked: string;
  increment: () => void;
  setCount: (n: number) => void;
  setUntracked: (s: string) => void;
}

type Partialized = { count: number };

const makeStore = (options?: {
  limit?: number;
  equality?: (a: Partialized, b: Partialized) => boolean;
  partialize?: boolean;
}) => {
  const store = createStore<CounterState>()(
    temporal<CounterState, Partialized>(
      (set) => ({
        count: 0,
        untracked: "initial",
        increment: () => set((s) => ({ count: s.count + 1 })),
        setCount: (n: number) => set({ count: n }),
        setUntracked: (s: string) => set({ untracked: s })
      }),
      {
        limit: options?.limit,
        equality: options?.equality,
        partialize:
          options?.partialize === false
            ? undefined
            : (state): Partialized => ({ count: state.count })
      }
    )
  ) as WithTemporal<StoreApi<CounterState>, Partialized>;
  return store;
};

const temporalOf = (
  store: WithTemporal<StoreApi<CounterState>, Partialized>
): TemporalState<Partialized> => store.temporal.getState();

describe("temporal middleware", () => {
  it("attaches a temporal store with the expected API", () => {
    const store = makeStore();
    const t = temporalOf(store);
    expect(t.pastStates).toEqual([]);
    expect(t.futureStates).toEqual([]);
    expect(t.isTracking).toBe(true);
    expect(typeof t.undo).toBe("function");
    expect(typeof t.redo).toBe("function");
    expect(typeof t.clear).toBe("function");
    expect(typeof t.pause).toBe("function");
    expect(typeof t.resume).toBe("function");
  });

  it("pushes the pre-set snapshot onto pastStates", () => {
    const store = makeStore();
    store.getState().setCount(1);
    store.getState().setCount(2);
    expect(temporalOf(store).pastStates).toEqual([{ count: 0 }, { count: 1 }]);
    expect(temporalOf(store).futureStates).toEqual([]);
  });

  it("tracks direct store.setState calls too", () => {
    const store = makeStore();
    store.setState({ count: 5 });
    expect(temporalOf(store).pastStates).toEqual([{ count: 0 }]);
    expect(store.getState().count).toBe(5);
  });

  it("undo restores the previous state and moves current to futureStates", () => {
    const store = makeStore();
    store.getState().setCount(1);
    store.getState().setCount(2);
    temporalOf(store).undo();
    expect(store.getState().count).toBe(1);
    expect(temporalOf(store).pastStates).toEqual([{ count: 0 }]);
    expect(temporalOf(store).futureStates).toEqual([{ count: 2 }]);
  });

  it("redo re-applies the undone state", () => {
    const store = makeStore();
    store.getState().setCount(1);
    store.getState().setCount(2);
    temporalOf(store).undo();
    temporalOf(store).redo();
    expect(store.getState().count).toBe(2);
    expect(temporalOf(store).pastStates).toEqual([{ count: 0 }, { count: 1 }]);
    expect(temporalOf(store).futureStates).toEqual([]);
  });

  it("undo/redo with multiple steps", () => {
    const store = makeStore();
    store.getState().setCount(1);
    store.getState().setCount(2);
    store.getState().setCount(3);
    temporalOf(store).undo(2);
    expect(store.getState().count).toBe(1);
    expect(temporalOf(store).pastStates).toEqual([{ count: 0 }]);
    // zundo order: current first, then skipped snapshots newest-first
    expect(temporalOf(store).futureStates).toEqual([{ count: 3 }, { count: 2 }]);
    temporalOf(store).redo(2);
    expect(store.getState().count).toBe(3);
    expect(temporalOf(store).pastStates).toEqual([
      { count: 0 },
      { count: 1 },
      { count: 2 }
    ]);
    expect(temporalOf(store).futureStates).toEqual([]);
  });

  it("undo with more steps than history clamps to the oldest state", () => {
    const store = makeStore();
    store.getState().setCount(1);
    temporalOf(store).undo(10);
    expect(store.getState().count).toBe(0);
    expect(temporalOf(store).pastStates).toEqual([]);
  });

  it("undo/redo are no-ops with empty stacks", () => {
    const store = makeStore();
    temporalOf(store).undo();
    temporalOf(store).redo();
    expect(store.getState().count).toBe(0);
    expect(temporalOf(store).pastStates).toEqual([]);
    expect(temporalOf(store).futureStates).toEqual([]);
  });

  it("a new set after undo clears futureStates", () => {
    const store = makeStore();
    store.getState().setCount(1);
    store.getState().setCount(2);
    temporalOf(store).undo();
    store.getState().setCount(9);
    expect(temporalOf(store).futureStates).toEqual([]);
    expect(temporalOf(store).pastStates).toEqual([{ count: 0 }, { count: 1 }]);
  });

  it("undo does not itself push history", () => {
    const store = makeStore();
    store.getState().setCount(1);
    temporalOf(store).undo();
    expect(temporalOf(store).pastStates).toEqual([]);
    expect(temporalOf(store).futureStates).toEqual([{ count: 1 }]);
  });

  it("clear empties both stacks without touching current state", () => {
    const store = makeStore();
    store.getState().setCount(1);
    store.getState().setCount(2);
    temporalOf(store).undo();
    temporalOf(store).clear();
    expect(temporalOf(store).pastStates).toEqual([]);
    expect(temporalOf(store).futureStates).toEqual([]);
    expect(store.getState().count).toBe(1);
  });

  it("pause stops tracking, resume restarts it", () => {
    const store = makeStore();
    store.getState().setCount(1);
    temporalOf(store).pause();
    expect(temporalOf(store).isTracking).toBe(false);
    store.getState().setCount(2);
    store.getState().setCount(3);
    expect(temporalOf(store).pastStates).toEqual([{ count: 0 }]);
    temporalOf(store).resume();
    expect(temporalOf(store).isTracking).toBe(true);
    store.getState().setCount(4);
    expect(temporalOf(store).pastStates).toEqual([{ count: 0 }, { count: 3 }]);
  });

  it("partialize keeps untracked fields out of history and undo leaves them alone", () => {
    const store = makeStore();
    store.getState().setCount(1);
    store.getState().setUntracked("changed");
    // untracked change: equality not provided, so a snapshot IS pushed
    // (zundo behavior), but the snapshot only contains partialized keys.
    expect(
      temporalOf(store).pastStates.every(
        (s) => !("untracked" in (s as Record<string, unknown>))
      )
    ).toBe(true);
    temporalOf(store).undo();
    expect(store.getState().untracked).toBe("changed");
  });

  it("equality dedupes snapshots that compare equal", () => {
    const store = makeStore({
      equality: (a, b) => a.count === b.count
    });
    store.getState().setCount(1);
    store.getState().setUntracked("x"); // partialized snapshot unchanged
    store.getState().setCount(1); // value-identical set
    expect(temporalOf(store).pastStates).toEqual([{ count: 0 }]);
  });

  it("limit caps pastStates, dropping oldest entries", () => {
    const store = makeStore({ limit: 3 });
    for (let i = 1; i <= 6; i++) {
      store.getState().setCount(i);
    }
    expect(temporalOf(store).pastStates).toEqual([
      { count: 3 },
      { count: 4 },
      { count: 5 }
    ]);
    temporalOf(store).undo();
    expect(store.getState().count).toBe(5);
  });

  it("temporal store is subscribable (Zustand StoreApi)", () => {
    const store = makeStore();
    const seen: number[] = [];
    const unsub = store.temporal.subscribe((s) => {
      seen.push(s.pastStates.length);
    });
    store.getState().setCount(1);
    store.getState().setCount(2);
    unsub();
    expect(seen).toEqual([1, 2]);
  });

  it("works without partialize (tracks full state)", () => {
    const store = createStore<{ n: number; bump: () => void }>()(
      temporal((set) => ({
        n: 0,
        bump: () => set((s) => ({ n: s.n + 1 }))
      }))
    ) as WithTemporal<
      StoreApi<{ n: number; bump: () => void }>,
      { n: number; bump: () => void }
    >;
    store.getState().bump();
    expect(store.temporal.getState().pastStates).toHaveLength(1);
    expect(store.temporal.getState().pastStates[0].n).toBe(0);
    store.temporal.getState().undo();
    expect(store.getState().n).toBe(0);
  });
});
