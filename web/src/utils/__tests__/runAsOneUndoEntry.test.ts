import { create } from "zustand";
import { temporal } from "../../stores/temporal";
import { runAsOneUndoEntry } from "../runAsOneUndoEntry";

const makeStore = (limit?: number) =>
  create<{ count: number }>()(
    temporal(() => ({ count: 0 }), {
      limit,
      partialize: (state) => ({ count: state.count })
    })
  );

describe("runAsOneUndoEntry", () => {
  it("collapses several writes into the state before the first", () => {
    const store = makeStore();
    store.setState({ count: 1 });
    runAsOneUndoEntry(store, () => {
      store.setState({ count: 2 });
      store.setState({ count: 3 });
      store.setState({ count: 4 });
    });

    expect(store.temporal.getState().pastStates).toEqual([
      { count: 0 },
      { count: 1 }
    ]);
    store.temporal.getState().undo();
    expect(store.getState().count).toBe(1);
  });

  it("finds the boundary when the stack is at its limit", () => {
    const store = makeStore(3);
    store.setState({ count: 1 });
    store.setState({ count: 2 });
    store.setState({ count: 3 });
    runAsOneUndoEntry(store, () => {
      store.setState({ count: 4 });
      store.setState({ count: 5 });
    });

    // The group's one entry, { count: 3 }, pushed out the oldest entry.
    expect(store.temporal.getState().pastStates).toEqual([
      { count: 1 },
      { count: 2 },
      { count: 3 }
    ]);
    store.temporal.getState().undo();
    expect(store.getState().count).toBe(3);
  });

  it("returns the callback's result", () => {
    const store = makeStore();
    expect(runAsOneUndoEntry(store, () => 42)).toBe(42);
  });
});
