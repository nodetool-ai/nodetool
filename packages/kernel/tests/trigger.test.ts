import { describe, it, expect } from "vitest";
import { TriggerState, TriggerInactivityTimeout } from "../src/trigger.js";
import { WorkflowSuspendedError } from "../src/suspendable.js";

describe("TriggerInactivityTimeout", () => {
  it("stores timeoutSeconds", () => {
    const err = new TriggerInactivityTimeout(120);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("TriggerInactivityTimeout");
    expect(err.timeoutSeconds).toBe(120);
    expect(err.message).toContain("120");
  });
});

describe("TriggerState", () => {
  it("default inactivity timeout is 300s", () => {
    const ts = new TriggerState("n1");
    expect(ts.inactivityTimeout).toBe(300);
  });

  it("custom timeout via constructor", () => {
    const ts = new TriggerState("n1", 60);
    expect(ts.inactivityTimeout).toBe(60);
  });

  it("inactivityTimeout setter validates minimum of 1", () => {
    const ts = new TriggerState("n1");
    ts.inactivityTimeout = 10;
    expect(ts.inactivityTimeout).toBe(10);

    expect(() => {
      ts.inactivityTimeout = 0;
    }).toThrow("at least 1 second");

    expect(() => {
      ts.inactivityTimeout = -5;
    }).toThrow("at least 1 second");
  });

  it("sendTriggerEvent() + waitForTriggerEvent() — event delivered immediately when waiter exists", async () => {
    const ts = new TriggerState("n1", 10);

    // Start waiting (no event queued yet)
    const promise = ts.waitForTriggerEvent(5);

    // Send event while waiter is active
    ts.sendTriggerEvent({ type: "webhook", data: 42 });

    const event = await promise;
    expect(event).toEqual({ type: "webhook", data: 42 });
  });

  it("waitForTriggerEvent() with pre-queued event returns immediately", async () => {
    const ts = new TriggerState("n1", 10);

    // Queue event first
    ts.sendTriggerEvent({ kind: "ping" });

    // Now wait — should return immediately
    const event = await ts.waitForTriggerEvent(5);
    expect(event).toEqual({ kind: "ping" });
  });

  it("waitForTriggerEvent() timeout rejects with TriggerInactivityTimeout", async () => {
    const ts = new TriggerState("n1");

    // Use a very short timeout (50ms = 0.05s)
    await expect(ts.waitForTriggerEvent(0.05)).rejects.toThrow(
      TriggerInactivityTimeout
    );
  });

  it("shouldSuspendForInactivity() returns false initially, true after timeout", async () => {
    // Use a very short timeout: 0.01s = 10ms
    const ts = new TriggerState("n1", 0.01);

    // No activity yet — lastActivityTime is null
    expect(ts.shouldSuspendForInactivity()).toBe(false);

    // Trigger some activity to set lastActivityTime
    ts.sendTriggerEvent({ x: 1 });

    // Immediately after activity, should not suspend
    expect(ts.shouldSuspendForInactivity()).toBe(false);

    // Wait for the timeout to elapse
    await new Promise((r) => setTimeout(r, 30));

    expect(ts.shouldSuspendForInactivity()).toBe(true);
  });

  it("suspendForInactivity() throws WorkflowSuspendedError with trigger metadata", () => {
    const ts = new TriggerState("n1", 60);

    try {
      ts.suspendForInactivity({ custom: "data" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(WorkflowSuspendedError);
      const e = err as WorkflowSuspendedError;
      expect(e.nodeId).toBe("n1");
      expect(e.reason).toContain("60");
      expect(e.reason).toContain("inactivity");
      expect(e.state).toHaveProperty("suspended_at");
      expect(e.state).toHaveProperty("inactivity_timeout_seconds", 60);
      expect(e.state).toHaveProperty("custom", "data");
      expect(e.metadata).toEqual({
        trigger_node: true,
        inactivity_suspension: true
      });
    }
  });
});
