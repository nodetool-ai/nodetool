import { createStore } from "zustand";
import { temporal, WithTemporal, TemporalOptions } from "./temporal";
import type { StoreApi } from "zustand";

interface CounterState {
  count: number;
  label: string;
  inc: () => void;
  setLabel: (label: string) => void;
}

function makeStore(
  options: TemporalOptions<CounterState, Partial<CounterState>> = {}
) {
  const store = createStore<CounterState>()(
    temporal<CounterState, Partial<CounterState>>(
      (set) => ({
        count: 0,
        label: "init",
        inc: () => set((s) => ({ count: s.count + 1 })),
        setLabel: (label: string) => set({ label }),
      }),
      options
    )
  );
  return store as typeof store &
    WithTemporal<StoreApi<CounterState>, unknown>;
}

describe("temporal middleware", () => {
  it("attaches a temporal store to the main store", () => {
    const store = makeStore();
    expect(store.temporal).toBeDefined();
    expect(store.temporal.getState().pastStates).toEqual([]);
    expect(store.temporal.getState().futureStates).toEqual([]);
  });

  it("records past states on set", () => {
    const store = makeStore();
    store.getState().inc();
    const t = store.temporal.getState();
    expect(t.pastStates).toHaveLength(1);
  });

  it("undo restores the previous state", () => {
    const store = makeStore();
    store.getState().inc();
    expect(store.getState().count).toBe(1);
    store.temporal.getState().undo();
    expect(store.getState().count).toBe(0);
  });

  it("redo re-applies the undone state", () => {
    const store = makeStore();
    store.getState().inc();
    store.temporal.getState().undo();
    expect(store.getState().count).toBe(0);
    store.temporal.getState().redo();
    expect(store.getState().count).toBe(1);
  });

  it("clear empties history", () => {
    const store = makeStore();
    store.getState().inc();
    store.getState().inc();
    store.temporal.getState().clear();
    expect(store.temporal.getState().pastStates).toEqual([]);
    expect(store.temporal.getState().futureStates).toEqual([]);
  });

  it("pause and resume control tracking", () => {
    const store = makeStore();
    store.temporal.getState().pause();
    expect(store.temporal.getState().isTracking).toBe(false);
    store.getState().inc();
    expect(store.temporal.getState().pastStates).toHaveLength(0);

    store.temporal.getState().resume();
    expect(store.temporal.getState().isTracking).toBe(true);
    store.getState().inc();
    expect(store.temporal.getState().pastStates).toHaveLength(1);
  });

  it("partialize tracks only the selected slice", () => {
    const store = makeStore({
      partialize: (state: CounterState) => ({ count: state.count }),
    });
    store.getState().setLabel("new-label");
    const past = store.temporal.getState().pastStates;
    expect(past).toHaveLength(1);
    expect(past[0]).toEqual({ count: 0 });
  });

  it("equality skips duplicate snapshots", () => {
    const store = makeStore({
      partialize: (state: CounterState) => ({ count: state.count }),
      equality: (a, b) =>
        (a as { count: number }).count === (b as { count: number }).count,
    });
    store.getState().setLabel("a");
    store.getState().setLabel("b");
    expect(store.temporal.getState().pastStates).toHaveLength(0);
  });

  it("limit caps the number of past states", () => {
    const store = makeStore({ limit: 3 });
    for (let i = 0; i < 5; i++) {
      store.getState().inc();
    }
    expect(store.temporal.getState().pastStates.length).toBeLessThanOrEqual(3);
  });

  it("undo with no history is a no-op", () => {
    const store = makeStore();
    store.temporal.getState().undo();
    expect(store.getState().count).toBe(0);
  });

  it("redo with no future is a no-op", () => {
    const store = makeStore();
    store.getState().inc();
    store.temporal.getState().redo();
    expect(store.getState().count).toBe(1);
  });

  it("new set after undo clears future states", () => {
    const store = makeStore();
    store.getState().inc();
    store.getState().inc();
    store.temporal.getState().undo();
    expect(store.temporal.getState().futureStates.length).toBeGreaterThan(0);
    store.getState().inc();
    expect(store.temporal.getState().futureStates).toEqual([]);
  });
});
