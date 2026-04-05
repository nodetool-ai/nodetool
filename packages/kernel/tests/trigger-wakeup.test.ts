import { describe, it, expect } from "vitest";
import { TriggerWakeupService } from "../src/trigger-wakeup.js";

describe("TriggerWakeupService", () => {
  it("deliverTriggerInput() stores input and returns true", async () => {
    const svc = new TriggerWakeupService();

    const result = await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "input-1",
      payload: { event: "click" }
    });

    expect(result).toBe(true);

    const pending = svc.getPendingInputs("r1", "n1");
    expect(pending).toHaveLength(1);
    expect(pending[0].inputId).toBe("input-1");
    expect(pending[0].payload).toEqual({ event: "click" });
    expect(pending[0].processed).toBe(false);
  });

  it("deliverTriggerInput() is idempotent — duplicate inputId returns false", async () => {
    const svc = new TriggerWakeupService();

    const first = await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "input-1",
      payload: { a: 1 }
    });
    expect(first).toBe(true);

    const second = await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "input-1",
      payload: { a: 2 }
    });
    expect(second).toBe(false);

    // Only one input stored
    const pending = svc.getPendingInputs("r1", "n1");
    expect(pending).toHaveLength(1);
  });

  it("getPendingInputs() returns unprocessed inputs", async () => {
    const svc = new TriggerWakeupService();

    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "i1",
      payload: { x: 1 }
    });
    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "i2",
      payload: { x: 2 }
    });
    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n2",
      inputId: "i3",
      payload: { x: 3 }
    });

    // Only inputs for n1
    const pending = svc.getPendingInputs("r1", "n1");
    expect(pending).toHaveLength(2);

    // Different node
    const pendingN2 = svc.getPendingInputs("r1", "n2");
    expect(pendingN2).toHaveLength(1);
  });

  it("markProcessed() marks input as processed, excluded from pending", async () => {
    const svc = new TriggerWakeupService();

    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "i1",
      payload: { v: 1 }
    });
    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "i2",
      payload: { v: 2 }
    });

    svc.markProcessed("i1");

    const pending = svc.getPendingInputs("r1", "n1");
    expect(pending).toHaveLength(1);
    expect(pending[0].inputId).toBe("i2");
  });

  it("cleanupProcessed() removes old processed inputs", async () => {
    const svc = new TriggerWakeupService();

    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "i1",
      payload: {}
    });

    svc.markProcessed("i1");

    // Wait 1ms so processedAt is strictly in the past
    await new Promise((r) => setTimeout(r, 2));

    // olderThanHours=0 means cutoff = Date.now(), processedAt < now
    const removed = svc.cleanupProcessed("r1", "n1", 0);
    expect(removed).toBe(1);

    // Nothing left to clean
    const removed2 = svc.cleanupProcessed("r1", "n1", 0);
    expect(removed2).toBe(0);
  });

  it("cleanupProcessed() does not remove unprocessed or recent inputs", async () => {
    const svc = new TriggerWakeupService();

    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "i1",
      payload: {}
    });

    // Not processed — should not be removed
    const removed = svc.cleanupProcessed("r1", "n1", 0);
    expect(removed).toBe(0);

    const pending = svc.getPendingInputs("r1", "n1");
    expect(pending).toHaveLength(1);
  });
});
