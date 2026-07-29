import { describe, it, expect, vi, afterEach } from "vitest";
import {
  registerWebhookWait,
  resolveWebhook,
  rejectWebhook,
  hasPendingWebhook,
  kieWebhookPendingCount
} from "../../src/providers/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("kie-webhook-registry", () => {
  it("resolves when webhook fires", async () => {
    const promise = registerWebhookWait("task-1", 5000);
    expect(hasPendingWebhook("task-1")).toBe(true);

    const resolved = resolveWebhook("task-1", { status: "success" });
    expect(resolved).toBe(true);
    expect(hasPendingWebhook("task-1")).toBe(false);

    const result = await promise;
    expect(result).toEqual({ status: "success" });
  });

  it("rejects when webhook sends failure", async () => {
    const promise = registerWebhookWait("task-2", 5000);
    rejectWebhook("task-2", "GENERATE_AUDIO_FAILED");

    await expect(promise).rejects.toThrow("KIE task failed (webhook)");
    expect(hasPendingWebhook("task-2")).toBe(false);
  });

  it("rejects on timeout", async () => {
    vi.useFakeTimers();
    const promise = registerWebhookWait("task-3", 100);

    vi.advanceTimersByTime(150);

    await expect(promise).rejects.toThrow("Webhook callback not received");
    expect(hasPendingWebhook("task-3")).toBe(false);
    vi.useRealTimers();
  });

  it("returns false for unknown task", () => {
    expect(resolveWebhook("unknown-task")).toBe(false);
    expect(rejectWebhook("unknown-task", "error")).toBe(false);
  });

  it("rejects immediately when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("pre-aborted"));

    const promise = registerWebhookWait("task-4", 5000, controller.signal);
    await expect(promise).rejects.toThrow("pre-aborted");
  });

  it("rejects when signal aborts during wait", async () => {
    const controller = new AbortController();
    const promise = registerWebhookWait("task-5", 60000, controller.signal);

    expect(hasPendingWebhook("task-5")).toBe(true);
    controller.abort(new Error("cancelled"));

    await expect(promise).rejects.toThrow("cancelled");
    expect(hasPendingWebhook("task-5")).toBe(false);
  });

  it("cleans up timer on resolve", async () => {
    vi.useFakeTimers();
    const promise = registerWebhookWait("task-6", 1000);
    resolveWebhook("task-6", "done");
    await promise;

    // Advancing past the timeout should not cause issues
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();
  });

  it("tracks pending count", async () => {
    const initialCount = kieWebhookPendingCount();
    const p1 = registerWebhookWait("count-1", 5000);
    const p2 = registerWebhookWait("count-2", 5000);
    expect(kieWebhookPendingCount()).toBe(initialCount + 2);

    resolveWebhook("count-1");
    resolveWebhook("count-2");
    await p1;
    await p2;
    expect(kieWebhookPendingCount()).toBe(initialCount);
  });
});
