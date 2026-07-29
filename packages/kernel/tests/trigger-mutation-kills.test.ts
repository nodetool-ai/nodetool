import { describe, it, expect, vi, afterEach } from "vitest";
import { TriggerState, TriggerInactivityTimeout } from "../src/trigger.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("TriggerState.waitForTriggerEvent deadline boundary", () => {
  it("rejects without waiting on a timer when the timeout is already exhausted", async () => {
    vi.useFakeTimers();
    const state = new TriggerState("n1");

    let settled = false;
    const outcome = state.waitForTriggerEvent(0).then(
      () => "resolved" as const,
      (err: unknown) => {
        settled = true;
        return err;
      }
    );

    // Drain microtasks without advancing fake timers. An already-elapsed
    // deadline must reject on the spot; re-arming a timer instead would leave
    // the caller hanging until something advances the clock.
    for (let i = 0; i < 50; i++) await Promise.resolve();

    expect(settled).toBe(true);
    expect(await outcome).toBeInstanceOf(TriggerInactivityTimeout);
  });

  it("keeps a later event deliverable after an exhausted wait rejects", async () => {
    const state = new TriggerState("n1");

    await expect(state.waitForTriggerEvent(0)).rejects.toBeInstanceOf(
      TriggerInactivityTimeout
    );

    // The rejected waiter must have been removed, so the next event is queued
    // for the following waiter instead of being swallowed by a dead promise.
    state.sendTriggerEvent({ kind: "tick" });

    await expect(state.waitForTriggerEvent(60)).resolves.toEqual({
      kind: "tick",
    });
  });
});
