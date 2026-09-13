import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  atlasAwaitResult,
  atlasSubmit,
  atlasWebhookUrl,
  hasPendingAtlasWebhook,
  rejectAtlasWebhook,
  resolveAtlasWebhook
} from "../../src/providers/index.js";

const PUBLIC_URL = "https://nodetool.example.com";
const CALLBACK = `${PUBLIC_URL}/api/providers/atlascloud/webhook`;

const originalFetch = global.fetch;
let originalPublicUrl: string | undefined;

beforeEach(() => {
  originalPublicUrl = process.env["NODETOOL_PUBLIC_URL"];
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalPublicUrl === undefined) delete process.env["NODETOOL_PUBLIC_URL"];
  else process.env["NODETOOL_PUBLIC_URL"] = originalPublicUrl;
  vi.restoreAllMocks();
});

describe("atlasWebhookUrl", () => {
  it("builds the callback path from a public https base", () => {
    expect(atlasWebhookUrl({ NODETOOL_PUBLIC_URL: PUBLIC_URL })).toBe(CALLBACK);
  });

  it("strips trailing slashes", () => {
    expect(atlasWebhookUrl({ NODETOOL_PUBLIC_URL: `${PUBLIC_URL}//` })).toBe(
      CALLBACK
    );
  });

  it("walks a long slash run in linear time", () => {
    // The slashes are not at the end, so `replace(/\/+$/, "")` retried the
    // whole run from every start position before failing: 1.0s for this input
    // locally, 14.8s at 200k. A regression to that form fails here.
    const base = `https://nodetool.example.com${"/".repeat(50_000)}x`;
    const started = performance.now();
    // Far past AtlasCloud's 1024-character limit, so there is no callback URL.
    expect(atlasWebhookUrl({ NODETOOL_PUBLIC_URL: base })).toBeUndefined();
    expect(performance.now() - started).toBeLessThan(250);
  });

  it("is undefined without a public URL", () => {
    expect(atlasWebhookUrl({})).toBeUndefined();
    expect(atlasWebhookUrl({ NODETOOL_PUBLIC_URL: "   " })).toBeUndefined();
  });

  it.each([
    ["http", "http://nodetool.example.com"],
    ["loopback", "https://localhost"],
    ["private", "https://10.0.0.4"],
    ["metadata", "https://169.254.169.254"]
  ])("refuses an address AtlasCloud cannot reach: %s", (_label, base) => {
    expect(atlasWebhookUrl({ NODETOOL_PUBLIC_URL: base })).toBeUndefined();
  });

  it("refuses a URL over AtlasCloud's 1024-character limit", () => {
    const base = `https://${"a".repeat(1100)}.example.com`;
    expect(atlasWebhookUrl({ NODETOOL_PUBLIC_URL: base })).toBeUndefined();
  });
});

describe("atlasSubmit callback registration", () => {
  function mockSubmit(capture: { body?: Record<string, unknown> }): void {
    global.fetch = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      capture.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { id: "pred-1" } })
      } as Response;
    }) as unknown as typeof fetch;
  }

  it("sends webhook_url when the server has a reachable address", async () => {
    process.env["NODETOOL_PUBLIC_URL"] = PUBLIC_URL;
    const capture: { body?: Record<string, unknown> } = {};
    mockSubmit(capture);

    await atlasSubmit("key", "image", "x/y/z", { prompt: "a cat" });

    expect(capture.body).toEqual({
      model: "x/y/z",
      prompt: "a cat",
      webhook_url: CALLBACK
    });
  });

  it("omits webhook_url when there is no reachable address", async () => {
    delete process.env["NODETOOL_PUBLIC_URL"];
    const capture: { body?: Record<string, unknown> } = {};
    mockSubmit(capture);

    await atlasSubmit("key", "image", "x/y/z", { prompt: "a cat" });

    expect(capture.body).toEqual({ model: "x/y/z", prompt: "a cat" });
  });
});

describe("atlasAwaitResult", () => {
  function mockPoll(
    responses: Array<{ status: string; outputs?: string[] }>
  ): { calls: () => number } {
    let index = 0;
    global.fetch = vi.fn(async () => {
      const body = responses[Math.min(index, responses.length - 1)];
      index += 1;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: body })
      } as Response;
    }) as unknown as typeof fetch;
    return { calls: () => index };
  }

  it("polls when the server has no reachable callback address", async () => {
    delete process.env["NODETOOL_PUBLIC_URL"];
    mockPoll([{ status: "completed", outputs: ["https://cdn/a.png"] }]);

    await expect(
      atlasAwaitResult("key", "pred-1", { pollInterval: 0, maxAttempts: 2 })
    ).resolves.toEqual({
      status: "completed",
      outputs: ["https://cdn/a.png"]
    });
    expect(hasPendingAtlasWebhook("pred-1")).toBe(false);
  });

  it("settles on the callback and stops the reconciliation poll", async () => {
    process.env["NODETOOL_PUBLIC_URL"] = PUBLIC_URL;
    const poll = mockPoll([{ status: "processing" }]);

    const waiting = atlasAwaitResult("key", "pred-2", {
      pollInterval: 1,
      maxAttempts: 100
    });
    expect(hasPendingAtlasWebhook("pred-2")).toBe(true);
    resolveAtlasWebhook("pred-2", {
      status: "completed",
      outputs: ["https://cdn/b.mp4"]
    });

    await expect(waiting).resolves.toEqual({
      status: "completed",
      outputs: ["https://cdn/b.mp4"]
    });
    expect(hasPendingAtlasWebhook("pred-2")).toBe(false);
    // The poll that lost the race must not keep running.
    const settledCalls = poll.calls();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(poll.calls()).toBe(settledCalls);
  });

  it("fails the wait on a failure callback", async () => {
    process.env["NODETOOL_PUBLIC_URL"] = PUBLIC_URL;
    mockPoll([{ status: "processing" }]);

    const waiting = atlasAwaitResult("key", "pred-3", {
      pollInterval: 1,
      maxAttempts: 100
    });
    rejectAtlasWebhook("pred-3", "content policy");

    await expect(waiting).rejects.toThrow("content policy");
    expect(hasPendingAtlasWebhook("pred-3")).toBe(false);
  });

  it("keeps waiting when the reconciliation budget runs out first", async () => {
    // F1: runJob turns a 10s timeout and a 3s interval into maxAttempts 4, so
    // the window is 12s — shorter than one 15s reconcile interval. The poll
    // must not end the wait when its attempts run out with time left.
    process.env["NODETOOL_PUBLIC_URL"] = PUBLIC_URL;
    const poll = mockPoll([{ status: "processing" }]);

    const waiting = atlasAwaitResult("key", "pred-5", {
      pollInterval: 3000,
      maxAttempts: 4
    });
    // Let the first poll settle; before the fix it rejected "job timed out"
    // here and dropped the waiter.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(poll.calls()).toBeGreaterThan(0);
    expect(hasPendingAtlasWebhook("pred-5")).toBe(true);

    resolveAtlasWebhook("pred-5", {
      status: "completed",
      outputs: ["https://cdn/late.png"]
    });
    await expect(waiting).resolves.toEqual({
      status: "completed",
      outputs: ["https://cdn/late.png"]
    });
  });

  it("reports a window that expires with no terminal state as a timeout", async () => {
    process.env["NODETOOL_PUBLIC_URL"] = PUBLIC_URL;
    mockPoll([{ status: "processing" }]);

    // Both halves run out: the poll sees `processing`, no callback arrives.
    await expect(
      atlasAwaitResult("key", "pred-6", { pollInterval: 20, maxAttempts: 2 })
    ).rejects.toThrow("AtlasCloud job timed out (predictionId: pred-6)");
    expect(hasPendingAtlasWebhook("pred-6")).toBe(false);
  });

  it("honours a signal that was already aborted before the wait", async () => {
    // F2: `addEventListener` never fires for an abort that already happened,
    // so this used to poll and resolve a cancelled request.
    process.env["NODETOOL_PUBLIC_URL"] = PUBLIC_URL;
    const poll = mockPoll([
      { status: "completed", outputs: ["https://cdn/d.png"] }
    ]);
    const controller = new AbortController();
    controller.abort(new Error("cancelled before wait"));

    await expect(
      atlasAwaitResult("key", "pred-7", {
        pollInterval: 1,
        maxAttempts: 100,
        signal: controller.signal
      })
    ).rejects.toThrow("cancelled before wait");
    expect(poll.calls()).toBe(0);
    expect(hasPendingAtlasWebhook("pred-7")).toBe(false);
  });

  it("honours a signal that aborts during the wait", async () => {
    process.env["NODETOOL_PUBLIC_URL"] = PUBLIC_URL;
    mockPoll([{ status: "processing" }]);
    const controller = new AbortController();

    const waiting = atlasAwaitResult("key", "pred-8", {
      pollInterval: 3000,
      maxAttempts: 100,
      signal: controller.signal
    });
    expect(hasPendingAtlasWebhook("pred-8")).toBe(true);
    controller.abort(new Error("cancelled mid-wait"));

    await expect(waiting).rejects.toThrow("cancelled mid-wait");
    expect(hasPendingAtlasWebhook("pred-8")).toBe(false);
  });

  it("settles on a poll that turns from processing to completed", async () => {
    process.env["NODETOOL_PUBLIC_URL"] = PUBLIC_URL;
    mockPoll([
      { status: "processing" },
      { status: "completed", outputs: ["https://cdn/e.png"] }
    ]);

    await expect(
      atlasAwaitResult("key", "pred-9", { pollInterval: 20, maxAttempts: 10 })
    ).resolves.toEqual({
      status: "completed",
      outputs: ["https://cdn/e.png"]
    });
  });

  it("settles on the poll when no callback arrives", async () => {
    process.env["NODETOOL_PUBLIC_URL"] = PUBLIC_URL;
    mockPoll([{ status: "completed", outputs: ["https://cdn/c.png"] }]);

    await expect(
      atlasAwaitResult("key", "pred-4", { pollInterval: 1, maxAttempts: 100 })
    ).resolves.toEqual({
      status: "completed",
      outputs: ["https://cdn/c.png"]
    });
    expect(hasPendingAtlasWebhook("pred-4")).toBe(false);
  });
});
