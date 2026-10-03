import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ModelObserver,
  initTestDb,
  listErrorTraces,
  listUnsyncedErrorTraces,
  recordErrorTrace
} from "@nodetool-ai/models";
import {
  errorTraceSyncConfig,
  syncErrorTraces
} from "../src/error-traces.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);

function makeCtx(userId: string): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

// Each test records distinct messages, well under the per-minute flood cap.
beforeEach(() => {
  initTestDb();
});
afterEach(() => ModelObserver.clear());

describe("errorTraceSyncConfig", () => {
  it("is off unless both the URL and the token are set", () => {
    expect(errorTraceSyncConfig({})).toBeNull();
    expect(
      errorTraceSyncConfig({ NODETOOL_ERROR_TRACE_SYNC_URL: "https://api.example.com" })
    ).toBeNull();
  });

  it("refuses to send the token over plain HTTP to a remote host", () => {
    expect(
      errorTraceSyncConfig({
        NODETOOL_ERROR_TRACE_SYNC_URL: "http://api.example.com",
        NODETOOL_ERROR_TRACE_SYNC_TOKEN: "tok"
      })
    ).toBeNull();
    expect(
      errorTraceSyncConfig({
        NODETOOL_ERROR_TRACE_SYNC_URL: "http://localhost:7777/ignored/path",
        NODETOOL_ERROR_TRACE_SYNC_TOKEN: "tok"
      })
    ).toEqual({ url: "http://localhost:7777", token: "tok" });
  });
});

describe("syncErrorTraces", () => {
  it("posts unsynced traces with the bearer token and marks them synced", async () => {
    await recordErrorTrace({ userId: "1", source: "server", message: "boom" });
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const result = await syncErrorTraces(
      { url: "https://api.example.com", token: "tok" },
      fetchImpl as unknown as typeof fetch
    );
    expect(result).toEqual({ pushed: 1 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/trpc/errorTraces.ingest");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    const body = JSON.parse(String(init.body));
    expect(body.traces[0].message).toBe("boom");
    expect(body.traces[0].user_id).toBeUndefined();
    expect(await listUnsyncedErrorTraces()).toEqual([]);
  });

  it("keeps traces unsynced when the target refuses them", async () => {
    await recordErrorTrace({ userId: "1", source: "server", message: "boom" });
    const fetchImpl = vi.fn(async () => new Response("no", { status: 401 }));
    const result = await syncErrorTraces(
      { url: "https://api.example.com", token: "bad" },
      fetchImpl as unknown as typeof fetch
    );
    expect(result.pushed).toBe(0);
    expect(result.error).toContain("401");
    expect(await listUnsyncedErrorTraces()).toHaveLength(1);
  });
});

describe("errorTraces router", () => {
  it("captures a client crash under the caller and redacts it", async () => {
    const caller = createCaller(makeCtx("user-1"));
    const { id } = await caller.errorTraces.capture({
      source: "web",
      error_type: "TypeError",
      message: "failed for jane@example.com",
      context: { component: "Inspector", prompt: "should be dropped" }
    });
    expect(id).toBeTruthy();
    const [trace] = await listErrorTraces("user-1");
    expect(trace.message).toBe("failed for [REDACTED:email]");
    expect(trace.context).toEqual({ component: "Inspector" });
  });

  it("only shows a caller their own traces", async () => {
    const theirs = await recordErrorTrace({ userId: "user-2", source: "job", message: "theirs" });
    const caller = createCaller(makeCtx("user-1"));
    expect((await caller.errorTraces.list({})).traces).toEqual([]);
    await expect(caller.errorTraces.get({ id: theirs!.id })).rejects.toThrow();
    const report = await caller.errorTraces.report({ ids: [theirs!.id] });
    expect(report.trace_ids).toEqual([]);
  });

  it("ingests synced traces under the token's user, never a sender-chosen one", async () => {
    const caller = createCaller(makeCtx("user-1"));
    const res = await caller.errorTraces.ingest({
      traces: [{ source: "server", message: "remote failure" }]
    });
    expect(res.stored).toBe(1);
    const [trace] = await listErrorTraces("user-1");
    expect(trace.origin).toBe("ingest");
  });

  it("renders a Markdown report", async () => {
    await recordErrorTrace({ userId: "user-1", source: "job", errorType: "Error", message: "node failed" });
    const caller = createCaller(makeCtx("user-1"));
    const report = await caller.errorTraces.report({});
    expect(report.trace_ids).toHaveLength(1);
    expect(report.markdown).toContain("### Error: node failed");
  });
});
