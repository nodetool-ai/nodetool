/**
 * Task D3 (docs/RELIABILITY_ARCHITECTURE.md §9 "Process/host" faults): pins
 * the CURRENTLY-swallowed job-persistence failure in
 * `websocket-client-session.ts`'s `runJob` — the
 * `catch (error) { this.logError("runJob persistence failed", error); }`
 * block guarding the `Job.get`/`Job.create`/`existing.save()` calls made when
 * `execution_options.persistence === "job"` (~line 2940 as of this writing;
 * the architecture doc cites ~2868, drift is expected as the file evolves).
 *
 * THIS TEST DOCUMENTS INTENDED-TO-BE-REVISITED BEHAVIOR, not a spec: today, a
 * DB failure while starting/updating a "job"-persisted run's row is caught,
 * logged, and otherwise ignored — the run itself proceeds and reaches its own
 * terminal `job_update` over the socket exactly as if persistence had
 * succeeded, but the Job row silently never reflects that. Per task D3, this
 * is a *pin*, not a fix — if a future change makes the runner surface, retry,
 * or fail the run on a persistence error, update this test and this comment
 * deliberately; don't just relax the assertions to make it pass again.
 *
 * Per docs/RELIABILITY_TASKS.md's A5 note, `websocket-client-session.ts`
 * itself is not refactored here — this test only observes it through its
 * public `runJob`/socket surface, same as every other `unified-websocket-
 * runner*.test.ts` file.
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

const resolveExecutor = () => ({
  async process() {
    return {};
  }
});

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

describe("job persistence failure during run_job (task D3, pinned behavior)", () => {
  let ws: MockWebSocket;
  let runner: WebSocketClientSession;

  beforeEach(async () => {
    await initTestDb();
    ws = new MockWebSocket();
    runner = new WebSocketClientSession({ resolveExecutor });
    await runner.connect(ws);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await runner.disconnect();
  });

  it("swallows a DB failure creating the Job row: the run still completes, but no Job row is ever created", async () => {
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
    expect(terminal.status).toBe("completed");
    expect(createSpy).toHaveBeenCalled();

    // The intended-to-be-revisited part: the run finished normally over the
    // socket, but the failed Job.create means no row ever landed in the DB.
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
