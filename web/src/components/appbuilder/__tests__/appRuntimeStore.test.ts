import { createAppRuntimeStore } from "../runtime/appRuntimeStore";

describe("appRuntimeStore", () => {
  it("seeds initial values", () => {
    const store = createAppRuntimeStore({ prompt: "hello" });
    expect(store.getState().values.prompt).toBe("hello");
    expect(store.getState().runnerState).toBe("idle");
  });

  it("sets and merges values", () => {
    const store = createAppRuntimeStore();
    store.getState().setValue("a", 1);
    store.getState().setValues({ b: 2, c: 3 });
    expect(store.getState().values).toMatchObject({ a: 1, b: 2, c: 3 });
  });

  it("toggles a boolean value", () => {
    const store = createAppRuntimeStore({ on: false });
    store.getState().toggleValue("on");
    expect(store.getState().values.on).toBe(true);
    store.getState().toggleValue("on");
    expect(store.getState().values.on).toBe(false);
  });

  it("clears only the given output keys and resets progress/error", () => {
    const store = createAppRuntimeStore({ prompt: "keep", result: "old" });
    store.getState().setProgress({ current: 1, total: 2 });
    store.getState().setError("boom");
    store.getState().clearOutputs(["result"]);
    expect(store.getState().values.prompt).toBe("keep");
    expect(store.getState().values.result).toBeUndefined();
    expect(store.getState().progress).toBeNull();
    expect(store.getState().error).toBeNull();
  });

  it("tracks runner state and duration", () => {
    const store = createAppRuntimeStore();
    store.getState().setRunnerState("running");
    expect(store.getState().runnerState).toBe("running");
    store.getState().setLastRunDuration(1.5);
    expect(store.getState().lastRunDuration).toBe(1.5);
  });
});
