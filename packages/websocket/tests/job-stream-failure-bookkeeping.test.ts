/**
 * Regression: a throw inside the job message drain loop must not orphan the
 * rejection.
 *
 * `runJob` assigns `active.streamTask = this.streamJobMessages(...)` and never
 * awaits it. `streamJobMessages` had a `try`/`finally` but no `catch`, so any
 * throw from the drain loop's awaited calls (`Asset.paginate` in the autosave
 * gate, `context.normalizeOutputValue` → `storage.store`, `sendMessage`)
 * escaped as an unhandled rejection — which Node 22 turns into a process exit —
 * and skipped every terminal bookkeeping step: the Job row stayed at "running",
 * no terminal `job_update` reached the client, and the app ledger kept holding
 * the estimate.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { unpack } from "msgpackr";
import { initTestDb, Asset, Job } from "@nodetool-ai/models";
import type { NodeTypeResolver, ResolvedNodeType } from "@nodetool-ai/kernel";
import type { NodeMetadata } from "@nodetool-ai/node-sdk";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";

class MockWS implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  sentText: string[] = [];
  async accept() {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return { type: "websocket.disconnect" };
  }
  async sendBytes(data: Uint8Array) {
    this.sentBytes.push(data);
  }
  async sendText(data: string) {
    this.sentText.push(data);
  }
  async close() {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

function sentMsgs(ws: MockWS): Record<string, unknown>[] {
  return ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
}

async function waitFor<T>(
  read: () => T | undefined,
  timeoutMs = 5000
): Promise<T | undefined> {
  const start = Date.now();
  for (;;) {
    const value = read();
    if (value !== undefined || Date.now() - start > timeoutMs) return value;
    await new Promise((r) => setTimeout(r, 10));
  }
}

const resolveNodeType: NodeTypeResolver = {
  resolveNodeType: async (
    nodeType: string
  ): Promise<ResolvedNodeType | null> => {
    if (nodeType === "test.ImageGen") {
      return {
        nodeType,
        propertyTypes: {},
        outputs: { image: "any" },
        descriptorDefaults: { name: "ImageGen" }
      };
    }
    return null;
  }
};

// `auto_save_asset` puts the run through the autosave gate, whose first awaited
// call is `Asset.paginate` — the injection point for the failure under test.
const imageGenMeta = {
  auto_save_asset: true,
  outputs: [{ name: "image", type: { type: "image" } }]
} as unknown as NodeMetadata;

function makeRunner() {
  return new WebSocketClientSession({
    resolveExecutor: () => ({
      async process() {
        return { image: { type: "image", data: new Uint8Array([1, 2, 3]) } };
      }
    }),
    resolveNodeType,
    getNodeMetadata: (nodeType: string) =>
      nodeType === "test.ImageGen" ? imageGenMeta : undefined
  });
}

const graph = {
  nodes: [{ id: "gen", type: "test.ImageGen", properties: {} }],
  edges: []
};

let ws: MockWS;
let unhandled: unknown[];
const recordUnhandled = (reason: unknown) => {
  unhandled.push(reason);
};

beforeEach(async () => {
  await initTestDb();
  ws = new MockWS();
  unhandled = [];
  process.on("unhandledRejection", recordUnhandled);
});

afterEach(() => {
  process.off("unhandledRejection", recordUnhandled);
  vi.restoreAllMocks();
});

describe("drain-loop failure bookkeeping", () => {
  it("marks the job failed, emits a terminal job_update, and never orphans the rejection", async () => {
    // Fault injection: fail the relay of node-level frames. `Asset.paginate`
    // is no longer a valid injection point — the autosave dedupe read is
    // best-effort now (see the sibling test below) — but a send failure on
    // the drain loop's own relay is still fatal by design.
    const runner = makeRunner();
    const realSend = runner.sendMessage.bind(runner);
    vi.spyOn(runner, "sendMessage").mockImplementation(async (message) => {
      if (
        message.type === "generation_complete" ||
        message.type === "output_update"
      ) {
        throw new Error("relay transport unavailable");
      }
      return realSend(message);
    });

    await runner.connect(ws);
    await runner.runJob({
      job_id: "JOBFAIL",
      workflow_id: "WFFAIL",
      graph
    });

    const terminal = await waitFor(() =>
      sentMsgs(ws).find(
        (m) => m.type === "job_update" && m.status === "failed"
      )
    );
    expect(terminal).toBeDefined();
    expect(terminal?.job_id).toBe("JOBFAIL");
    expect(String(terminal?.error)).toContain("relay transport unavailable");

    // The persisted row must not be stranded at "running".
    let status: string | undefined;
    for (let i = 0; i < 200; i++) {
      status = ((await Job.get("JOBFAIL")) as Job | null)?.status;
      if (status === "failed") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(status).toBe("failed");

    // Let any escaped rejection surface before asserting.
    await new Promise((r) => setTimeout(r, 50));
    expect(unhandled).toEqual([]);

    await runner.disconnect();
  });

  it("completes the run when the autosave dedupe read fails (best-effort, DB-free runs)", async () => {
    // The reliability harness runs ws-server jobs with no DB at all; an
    // unavailable Asset store must degrade to skipping replay dedupe, not
    // fail the job (regression: provider-failure-mid-stream journey died
    // with "Database not initialized" mid-drain).
    vi.spyOn(Asset, "paginate").mockRejectedValue(
      new Error("storage backend unavailable")
    );

    const runner = makeRunner();
    await runner.connect(ws);
    await runner.runJob({
      job_id: "JOBOK",
      workflow_id: "WFOK",
      graph
    });

    const terminal = await waitFor(() =>
      sentMsgs(ws).find(
        (m) =>
          m.type === "job_update" &&
          (m.status === "completed" || m.status === "failed")
      )
    );
    expect(terminal).toBeDefined();
    expect(terminal?.status).toBe("completed");

    await new Promise((r) => setTimeout(r, 50));
    expect(unhandled).toEqual([]);

    await runner.disconnect();
  });
});
