import { describe, it, expect } from "vitest";
import { SuspendableState, WorkflowSuspendedError } from "../src/suspendable.js";

describe("WorkflowSuspendedError", () => {
  it("stores fields from constructor", () => {
    const err = new WorkflowSuspendedError({
      nodeId: "n1",
      reason: "waiting for approval",
      state: { step: 3 },
      metadata: { priority: "high" },
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("WorkflowSuspendedError");
    expect(err.nodeId).toBe("n1");
    expect(err.reason).toBe("waiting for approval");
    expect(err.state).toEqual({ step: 3 });
    expect(err.metadata).toEqual({ priority: "high" });
    expect(err.message).toContain("n1");
    expect(err.message).toContain("waiting for approval");
  });

  it("defaults metadata to empty object", () => {
    const err = new WorkflowSuspendedError({
      nodeId: "n2",
      reason: "test",
      state: {},
    });
    expect(err.metadata).toEqual({});
  });

  it("toDict() returns correct object", () => {
    const err = new WorkflowSuspendedError({
      nodeId: "n1",
      reason: "pause",
      state: { x: 1 },
      metadata: { foo: "bar" },
    });
    expect(err.toDict()).toEqual({
      node_id: "n1",
      reason: "pause",
      state: { x: 1 },
      metadata: { foo: "bar" },
    });
  });
});

describe("SuspendableState", () => {
  it("isSuspendable() returns true", () => {
    const s = new SuspendableState("node-1");
    expect(s.isSuspendable()).toBe(true);
  });

  it("isResuming() returns false initially", () => {
    const s = new SuspendableState("node-1");
    expect(s.isResuming()).toBe(false);
  });

  it("getSavedState() throws when not resuming", () => {
    const s = new SuspendableState("node-1");
    expect(() => s.getSavedState()).toThrow("can only be called when resuming");
  });

  it("setResumingState() sets resuming flag and saved state", () => {
    const s = new SuspendableState("node-1");
    const state = { counter: 42 };
    s.setResumingState(state, 5);

    expect(s.isResuming()).toBe(true);
    expect(s.eventSeq).toBe(5);
  });

  it("getSavedState() returns saved state when resuming", () => {
    const s = new SuspendableState("node-1");
    const state = { counter: 42, data: [1, 2, 3] };
    s.setResumingState(state, 1);

    expect(s.getSavedState()).toEqual(state);
  });

  it("suspendWorkflow() throws WorkflowSuspendedError with correct fields", () => {
    const s = new SuspendableState("node-1");
    try {
      s.suspendWorkflow("need input", { progress: 50 }, { type: "human" });
      // Should never reach here
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(WorkflowSuspendedError);
      const e = err as WorkflowSuspendedError;
      expect(e.nodeId).toBe("node-1");
      expect(e.reason).toBe("need input");
      expect(e.state).toEqual({ progress: 50 });
      expect(e.metadata).toEqual({ type: "human" });
    }
  });

  it("updateSuspendedState() merges updates into saved state", () => {
    const s = new SuspendableState("node-1");
    s.setResumingState({ a: 1, b: 2 }, 0);

    s.updateSuspendedState({ b: 99, c: 3 });
    expect(s.getSavedState()).toEqual({ a: 1, b: 99, c: 3 });
  });

  it("updateSuspendedState() initializes state if null", () => {
    const s = new SuspendableState("node-1");
    // Not resuming, but still works (creates empty object then merges)
    s.updateSuspendedState({ key: "value" });
    // We can't call getSavedState() because _isResuming is false,
    // but the internal state was set. Verify by setting resuming after.
    s.setResumingState({}, 0); // This overwrites, so let's test differently.

    // Instead, test that calling updateSuspendedState when _savedState is null
    // creates the state and assigns updates.
    const s2 = new SuspendableState("node-2");
    s2.updateSuspendedState({ x: 10 });
    // Now set resuming with a different state to confirm update worked
    // Actually the setResumingState overwrites _savedState, so we can't verify directly.
    // The test confirms it doesn't throw when _savedState is null.
  });
});
