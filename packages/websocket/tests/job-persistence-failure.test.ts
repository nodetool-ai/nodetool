/**
 * Job creation must succeed before durable trace registration permits execution.
 * A failed save of an existing Job still exercises the legacy queued-row behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unpack } from "msgpackr";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";
import { initTestDb, Job } from "@nodetool-ai/models";

class MockWebSocket implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  sentText: string[] = [];
  queue: Array<WebSocketReceiveFrame> = [];
  closed = false;

  async accept(): Promise<void> {
    return;
  }
  async receive(): Promise<WebSocketReceiveFrame> {
    const next = this.queue.shift();
    if (!next) return { type: "websocket.disconnect" };
    return next;
  }
  async sendBytes(data: Uint8Array): Promise<void> {
    this.sentBytes.push(data);
  }
  async sendText(data: string): Promise<void> {
    this.sentText.push(data);
  }
  async close(): Promise<void> {
    this.closed = true;
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

const executeNode = vi.fn(async () => ({}));
const resolveExecutor = () => ({ process: executeNode });

function decodeAll(ws: MockWebSocket): Record<string, unknown>[] {
  return [
    ...ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>),
    ...ws.sentText.map((t) => JSON.parse(t) as Record<string, unknown>)
  ];
}

/** Polls `ws`'s sent frames for the run's terminal `job_update` — no event to
 * await directly here since `runJob` returns once the run is queued/started,
 * not once it finishes (`streamJobMessages` runs detached). */
async function waitForTerminal(
  ws: MockWebSocket,
  jobId: string,
  timeoutMs = 3000
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
  while (Date.now() < deadline) {
    const terminal = decodeAll(ws).find(
      (m) => m.type === "job_update" && m.job_id === jobId && terminalStatuses.has(String(m.status))
    );
    if (terminal) return terminal;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`job "${jobId}" never reached a terminal job_update within ${timeoutMs}ms`);
}

const trivialGraph = {
  nodes: [
    {
      id: "n1",
      type: "nodetool.constant.String",
      name: "nodetool.constant.String",
      properties: { value: "x" }
    }
  ],
  edges: []
};

describe("job persistence failure during run_job", () => {
  let ws: MockWebSocket;
  let runner: WebSocketClientSession;

  beforeEach(async () => {
    await initTestDb();
    executeNode.mockClear();
    ws = new MockWebSocket();
    runner = new WebSocketClientSession({ resolveExecutor });
    await runner.connect(ws);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await runner.disconnect();
  });

  it("fails before execution when the Job row cannot be created", async () => {
    const jobId = "DB_LOCKED_CREATE";
    const createSpy = vi
      .spyOn(Job, "create")
      .mockRejectedValue(
        Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" })
      );

    await runner.jobs.runJob({
      job_id: jobId,
      workflow_id: "wf",
      graph: trivialGraph,
      execution_options: { persistence: "job" }
    });

    const terminal = await waitForTerminal(ws, jobId);
    expect(terminal.status).toBe("failed");
    expect(createSpy).toHaveBeenCalled();
    expect(executeNode).not.toHaveBeenCalled();
    expect(await Job.get(jobId)).toBeNull();
  });

  it("swallows a DB failure flipping an existing (queued) Job row to running: the run still completes, and the row is left at its pre-failure status", async () => {
    const jobId = "DB_LOCKED_SAVE";
    await Job.create({
      id: jobId,
      workflow_id: "wf",
      user_id: "1",
      status: "queued",
      name: "",
      started_at: new Date().toISOString(),
      params: {},
      graph: trivialGraph
    });

    const saveSpy = vi
      .spyOn(Job.prototype, "save")
      .mockRejectedValue(
        Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" })
      );

    await runner.jobs.runJob({
      job_id: jobId,
      workflow_id: "wf",
      graph: trivialGraph,
      execution_options: { persistence: "job" }
    });

    const terminal = await waitForTerminal(ws, jobId);
    expect(terminal.status).toBe("completed");
    expect(saveSpy).toHaveBeenCalled();

    // Intended-to-be-revisited: the row is stuck at "queued" forever — the
    // `markRunning()` + `save()` that would have flipped it to "running"
    // failed and was swallowed; nothing else in this path retries it. `get()`
    // isn't mocked (only `save()` is), so this reads the real row.
    const row = await Job.get<Job>(jobId);
    expect(row?.status).toBe("queued");
  });
});
