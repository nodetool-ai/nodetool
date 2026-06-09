import { describe, it, expect, vi, afterEach } from "vitest";
import { TriggerState, TriggerInactivityTimeout } from "../src/trigger.js";
import { WorkflowSuspendedError } from "../src/suspendable.js";

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("inactivityTimeout setter accepts exactly 1 second (boundary)", () => {
    const ts = new TriggerState("n1");
    ts.inactivityTimeout = 1;
    expect(ts.inactivityTimeout).toBe(1);
  });

  it("lastActivityTime is null until activity, then a timestamp", () => {
    const ts = new TriggerState("n1");
    expect(ts.lastActivityTime).toBeNull();

    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    ts.sendTriggerEvent({ a: 1 });
    expect(ts.lastActivityTime).toBe(now);
  });

  it("does not time out before the configured delay elapses", async () => {
    const ts = new TriggerState("n1");
    const p = ts.waitForTriggerEvent(0.1); // 100ms
    let rejected = false;
    p.catch(() => {
      rejected = true;
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(rejected).toBe(false); // a /1000 mutant would fire almost immediately
    ts.sendTriggerEvent({ ok: 1 });
    expect(await p).toEqual({ ok: 1 });
  });

  it("a timed-out waiter is dropped so the next event is queued, not lost", async () => {
    const ts = new TriggerState("n1");
    await expect(ts.waitForTriggerEvent(0.02)).rejects.toThrow(
      TriggerInactivityTimeout
    );
    // The stale waiter must be gone: a fresh event is queued and then read.
    ts.sendTriggerEvent({ a: 1 });
    expect(await ts.waitForTriggerEvent(1)).toEqual({ a: 1 });
  });

  it("dropping a timed-out waiter does not disturb other live waiters", async () => {
    const ts = new TriggerState("n1");
    const slow = ts.waitForTriggerEvent(0.03); // times out
    const fast = ts.waitForTriggerEvent(10); // stays registered
    await expect(slow).rejects.toThrow(TriggerInactivityTimeout);
    ts.sendTriggerEvent({ ok: 1 });
    expect(await fast).toEqual({ ok: 1 });
  });

  it("shouldSuspendForInactivity stays false with no activity even at zero timeout", () => {
    // Guards the duration === null branch: without it, null >= 0 would be true.
    const ts = new TriggerState("n1", 0);
    expect(ts.shouldSuspendForInactivity()).toBe(false);
  });

  it("shouldSuspendForInactivity is false below the timeout (pins the * 1000 scaling)", () => {
    const ts = new TriggerState("n1", 1); // 1000ms threshold
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    ts.sendTriggerEvent({});
    vi.spyOn(Date, "now").mockReturnValue(now + 500); // 500ms < 1000ms
    expect(ts.shouldSuspendForInactivity()).toBe(false);
  });

  it("shouldSuspendForInactivity is true exactly at the timeout boundary (>=)", () => {
    const ts = new TriggerState("n1", 1); // 1000ms
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    ts.sendTriggerEvent({}); // lastActivityTime = now
    vi.spyOn(Date, "now").mockReturnValue(now + 1000); // duration == 1000ms
    expect(ts.shouldSuspendForInactivity()).toBe(true);
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
