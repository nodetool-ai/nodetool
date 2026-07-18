/**
 * @jest-environment node
 */
import { createAppRuntimeStore } from "../appRuntimeStore";

describe("appRuntimeStore", () => {
  describe("initial state", () => {
    it("starts with provided initial values", () => {
      const store = createAppRuntimeStore({ prompt: "hi", count: 5 });
      const state = store.getState();
      expect(state.values).toEqual({ prompt: "hi", count: 5 });
    });

    it("starts with empty values when none provided", () => {
      const store = createAppRuntimeStore();
      expect(store.getState().values).toEqual({});
    });

    it("starts idle with no progress or error", () => {
      const store = createAppRuntimeStore();
      const state = store.getState();
      expect(state.runnerState).toBe("idle");
      expect(state.progress).toBeNull();
      expect(state.error).toBeNull();
      expect(state.lastRunDuration).toBeNull();
    });
  });

  describe("setValue", () => {
    it("sets a single key", () => {
      const store = createAppRuntimeStore({ a: 1 });
      store.getState().setValue("b", 2);
      expect(store.getState().values).toEqual({ a: 1, b: 2 });
    });

    it("overwrites an existing key", () => {
      const store = createAppRuntimeStore({ x: "old" });
      store.getState().setValue("x", "new");
      expect(store.getState().values.x).toBe("new");
    });
  });

  describe("setValues", () => {
    it("merges multiple values", () => {
      const store = createAppRuntimeStore({ a: 1 });
      store.getState().setValues({ b: 2, c: 3 });
      expect(store.getState().values).toEqual({ a: 1, b: 2, c: 3 });
    });

    it("overwrites existing keys while preserving others", () => {
      const store = createAppRuntimeStore({ a: 1, b: 2 });
      store.getState().setValues({ b: 99 });
      expect(store.getState().values).toEqual({ a: 1, b: 99 });
    });
  });

  describe("toggleValue", () => {
    it("toggles a falsy value to true", () => {
      const store = createAppRuntimeStore({ flag: false });
      store.getState().toggleValue("flag");
      expect(store.getState().values.flag).toBe(true);
    });

    it("toggles a truthy value to false", () => {
      const store = createAppRuntimeStore({ flag: true });
      store.getState().toggleValue("flag");
      expect(store.getState().values.flag).toBe(false);
    });

    it("toggles an undefined value to true", () => {
      const store = createAppRuntimeStore({});
      store.getState().toggleValue("missing");
      expect(store.getState().values.missing).toBe(true);
    });
  });

  describe("setRunnerState", () => {
    it("updates the runner state", () => {
      const store = createAppRuntimeStore();
      store.getState().setRunnerState("running");
      expect(store.getState().runnerState).toBe("running");
    });

    it("transitions through all valid states", () => {
      const store = createAppRuntimeStore();
      const states = ["connecting", "running", "error", "idle"] as const;
      for (const s of states) {
        store.getState().setRunnerState(s);
        expect(store.getState().runnerState).toBe(s);
      }
    });
  });

  describe("setProgress", () => {
    it("sets progress object", () => {
      const store = createAppRuntimeStore();
      store.getState().setProgress({ current: 3, total: 10 });
      expect(store.getState().progress).toEqual({ current: 3, total: 10 });
    });

    it("clears progress with null", () => {
      const store = createAppRuntimeStore();
      store.getState().setProgress({ current: 5, total: 5 });
      store.getState().setProgress(null);
      expect(store.getState().progress).toBeNull();
    });
  });

  describe("setError", () => {
    it("sets an error message", () => {
      const store = createAppRuntimeStore();
      store.getState().setError("something broke");
      expect(store.getState().error).toBe("something broke");
    });

    it("clears the error with null", () => {
      const store = createAppRuntimeStore();
      store.getState().setError("fail");
      store.getState().setError(null);
      expect(store.getState().error).toBeNull();
    });
  });

  describe("setLastRunDuration", () => {
    it("records the duration", () => {
      const store = createAppRuntimeStore();
      store.getState().setLastRunDuration(1234);
      expect(store.getState().lastRunDuration).toBe(1234);
    });

    it("clears with null", () => {
      const store = createAppRuntimeStore();
      store.getState().setLastRunDuration(500);
      store.getState().setLastRunDuration(null);
      expect(store.getState().lastRunDuration).toBeNull();
    });
  });

  describe("clearOutputs", () => {
    it("removes listed output keys and resets progress/error", () => {
      const store = createAppRuntimeStore({ input: "hi", result: "done" });
      store.getState().setProgress({ current: 1, total: 1 });
      store.getState().setError("old error");

      store.getState().clearOutputs(["result"]);

      const state = store.getState();
      expect(state.values).toEqual({ input: "hi" });
      expect(state.progress).toBeNull();
      expect(state.error).toBeNull();
    });

    it("resets progress/error even when output keys list is empty", () => {
      const store = createAppRuntimeStore({ input: "hi" });
      store.getState().setProgress({ current: 1, total: 1 });
      store.getState().setError("err");

      store.getState().clearOutputs([]);

      const state = store.getState();
      expect(state.values).toEqual({ input: "hi" });
      expect(state.progress).toBeNull();
      expect(state.error).toBeNull();
    });

    it("preserves keys not in the output list", () => {
      const store = createAppRuntimeStore({ a: 1, b: 2, c: 3 });
      store.getState().clearOutputs(["b"]);
      expect(store.getState().values).toEqual({ a: 1, c: 3 });
    });
  });
});
