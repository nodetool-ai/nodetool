/**
 * Regression tests for the automation-nodes trigger fixes.
 */
import { describe, expect, it } from "vitest";
import { WaitNode, IntervalTriggerNode } from "@nodetool-ai/automation-nodes";

describe("WaitNode — timeout 0 passes through without waiting", () => {
  it("returns the input immediately when timeout is 0", async () => {
    const node = new WaitNode();
    node.assign({ timeout_seconds: 0, input: "hello" });
    const start = Date.now();
    const result = await node.process();
    expect(Date.now() - start).toBeLessThan(500);
    expect(result.data).toBe("hello");
    expect(result.waited_seconds as number).toBeLessThan(0.5);
  });
});

describe("IntervalTrigger — emit_on_start=false respects the interval under drift compensation", () => {
  it("waits a full interval before the first tick rather than firing immediately", async () => {
    const node = new IntervalTriggerNode();
    node.assign({
      interval_seconds: 0.2,
      initial_delay_seconds: 0,
      emit_on_start: false,
      include_drift_compensation: true,
      max_events: 1
    });
    const start = Date.now();
    const events: Array<Record<string, unknown>> = [];
    for await (const event of node.genProcess()) {
      events.push(event);
    }
    const elapsed = Date.now() - start;
    expect(events).toHaveLength(1);
    expect(events[0].tick).toBe(1);
    // Pre-fix the first tick fired in ~1ms; it must now wait ~one interval.
    expect(elapsed).toBeGreaterThanOrEqual(150);
  });
});
