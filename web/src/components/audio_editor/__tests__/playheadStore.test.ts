import { createPlayheadStore } from "../playheadStore";

describe("createPlayheadStore", () => {
  it("gets and sets the value", () => {
    const store = createPlayheadStore();
    expect(store.get()).toBe(0);
    store.set(1.5);
    expect(store.get()).toBe(1.5);
  });

  it("notifies subscribers on change", () => {
    const store = createPlayheadStore();
    const listener = jest.fn();
    store.subscribe(listener);
    store.set(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify when the value is unchanged", () => {
    const store = createPlayheadStore(3);
    const listener = jest.fn();
    store.subscribe(listener);
    store.set(3);
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe", () => {
    const store = createPlayheadStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set(4);
    expect(listener).not.toHaveBeenCalled();
  });
});
