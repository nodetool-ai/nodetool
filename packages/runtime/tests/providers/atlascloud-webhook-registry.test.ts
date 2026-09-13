import { describe, it, expect, vi, afterEach } from "vitest";
import {
  registerAtlasWebhookWait,
  resolveAtlasWebhook,
  rejectAtlasWebhook,
  hasPendingAtlasWebhook,
  atlasWebhookPendingCount
} from "../../src/providers/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("atlascloud-webhook-registry", () => {
  it("resolves with the callback's account of the prediction", async () => {
    const promise = registerAtlasWebhookWait("pred-1", 5000);
    expect(hasPendingAtlasWebhook("pred-1")).toBe(true);

    const resolved = resolveAtlasWebhook("pred-1", {
      status: "completed",
      outputs: ["https://cdn.example.test/a.png"]
    });
    expect(resolved).toBe(true);
    expect(hasPendingAtlasWebhook("pred-1")).toBe(false);

    await expect(promise).resolves.toEqual({
      status: "completed",
      outputs: ["https://cdn.example.test/a.png"]
    });
  });

  it("rejects on a failure callback, naming the prediction", async () => {
    const promise = registerAtlasWebhookWait("pred-2", 5000);
    expect(rejectAtlasWebhook("pred-2", "content policy")).toBe(true);

    await expect(promise).rejects.toThrow(
      "AtlasCloud job failed (webhook): content policy (predictionId: pred-2)"
    );
    expect(hasPendingAtlasWebhook("pred-2")).toBe(false);
  });

  it("rejects on timeout and forgets the prediction", async () => {
    vi.useFakeTimers();
    const promise = registerAtlasWebhookWait("pred-3", 100);
    vi.advanceTimersByTime(150);

    await expect(promise).rejects.toThrow("AtlasCloud webhook not received");
    expect(hasPendingAtlasWebhook("pred-3")).toBe(false);
    vi.useRealTimers();
  });

  it("reports no match for an unknown prediction", () => {
    expect(resolveAtlasWebhook("unknown", { status: "completed" })).toBe(false);
    expect(rejectAtlasWebhook("unknown", "boom")).toBe(false);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("pre-aborted"));

    await expect(
      registerAtlasWebhookWait("pred-4", 5000, controller.signal)
    ).rejects.toThrow("pre-aborted");
    expect(hasPendingAtlasWebhook("pred-4")).toBe(false);
  });

  it("rejects when the signal aborts during the wait", async () => {
    const controller = new AbortController();
    const promise = registerAtlasWebhookWait("pred-5", 60_000, controller.signal);
    expect(hasPendingAtlasWebhook("pred-5")).toBe(true);

    controller.abort(new Error("cancelled"));
    await expect(promise).rejects.toThrow("cancelled");
    expect(hasPendingAtlasWebhook("pred-5")).toBe(false);
  });

  it("clears the timeout timer once a callback settles the wait", async () => {
    vi.useFakeTimers();
    const promise = registerAtlasWebhookWait("pred-6", 1000);
    resolveAtlasWebhook("pred-6", { status: "completed" });
    await promise;

    // A timer left behind would reject an already-settled promise here.
    vi.advanceTimersByTime(2000);
    expect(atlasWebhookPendingCount()).toBe(0);
    vi.useRealTimers();
  });

  it("tracks several predictions at once", async () => {
    const before = atlasWebhookPendingCount();
    const first = registerAtlasWebhookWait("count-1", 5000);
    const second = registerAtlasWebhookWait("count-2", 5000);
    expect(atlasWebhookPendingCount()).toBe(before + 2);

    resolveAtlasWebhook("count-1", { status: "completed" });
    resolveAtlasWebhook("count-2", { status: "completed" });
    await Promise.all([first, second]);
    expect(atlasWebhookPendingCount()).toBe(before);
  });
});
