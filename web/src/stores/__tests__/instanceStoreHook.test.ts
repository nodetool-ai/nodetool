import { describe, it, expect, jest } from "@jest/globals";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { UseBoundStore } from "zustand";
import { createInstanceHook } from "../instanceStoreHook";

interface TestState {
  count: number;
  increment: () => void;
}

function makeTestStore(initial = 0): UseBoundStore<StoreApi<TestState>> {
  const store = createStore<TestState>((set) => ({
    count: initial,
    increment: () => set((s) => ({ count: s.count + 1 }))
  }));
  const hook = (() => store.getState()) as UseBoundStore<StoreApi<TestState>>;
  hook.getState = store.getState;
  hook.getInitialState = store.getInitialState;
  hook.setState = store.setState;
  hook.subscribe = store.subscribe;
  return hook;
}

describe("createInstanceHook", () => {
  it("delegates getState to pickCurrent", () => {
    const storeA = makeTestStore(10);
    const storeB = makeTestStore(20);
    let current = storeA;

    const hook = createInstanceHook(
      () => current,
      () => current
    );

    expect(hook.getState().count).toBe(10);

    current = storeB;
    expect(hook.getState().count).toBe(20);
  });

  it("delegates setState to pickCurrent", () => {
    const store = makeTestStore(0);

    const hook = createInstanceHook(
      () => store,
      () => store
    );

    hook.setState({ count: 42 });
    expect(store.getState().count).toBe(42);
  });

  it("delegates subscribe to pickCurrent", () => {
    const store = makeTestStore(0);
    const listener = jest.fn();

    const hook = createInstanceHook(
      () => store,
      () => store
    );

    const unsub = hook.subscribe(listener);
    store.setState({ count: 5 });
    expect(listener).toHaveBeenCalled();

    unsub();
    store.setState({ count: 10 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("delegates getInitialState to pickCurrent", () => {
    const store = makeTestStore(7);

    const hook = createInstanceHook(
      () => store,
      () => store
    );

    expect(hook.getInitialState().count).toBe(7);
  });

  it("switches target when pickCurrent changes", () => {
    const storeA = makeTestStore(1);
    const storeB = makeTestStore(2);
    let current = storeA;

    const hook = createInstanceHook(
      () => current,
      () => current
    );

    hook.setState({ count: 100 });
    expect(storeA.getState().count).toBe(100);
    expect(storeB.getState().count).toBe(2);

    current = storeB;
    hook.setState({ count: 200 });
    expect(storeA.getState().count).toBe(100);
    expect(storeB.getState().count).toBe(200);
  });
});
