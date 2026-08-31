/**
 * Runs on a server that is more than one process.
 *
 * A run's {@link JobRunSession} lives in the process executing it, so the two
 * things a client does after a drop — resume the stream, stop the run — have
 * to be routed to that process. The job row records which instance owns the
 * run: a resume is replayed there, and a cancel is written to the row, which
 * the owner's poller picks up.
 *
 * `NODETOOL_INSTANCE_ID` stands in for `FLY_MACHINE_ID` here; with neither set
 * every path below is inert and the single-process behavior is unchanged,
 * which is what the "single-machine" case pins.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unpack } from "msgpackr";

import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";
import {
  jobRunRegistry,
  type JobRunExecutionHooks
} from "../src/job-run-registry.js";
import { pollCancelledJobsOnce } from "../src/job-control.js";
import { initTestDb, Job } from "@nodetool-ai/models";

class MockWebSocket implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  sentText: string[] = [];
  queue: Array<WebSocketReceiveFrame> = [];

  async accept(): Promise<void> {
    return;
  }
  async receive(): Promise<WebSocketReceiveFrame> {
    return this.queue.shift() ?? { type: "websocket.disconnect" };
  }
  async sendBytes(data: Uint8Array): Promise<void> {
    this.sentBytes.push(data);
  }
  async sendText(data: string): Promise<void> {
    this.sentText.push(data);
  }
  async close(): Promise<void> {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

const resolveExecutor = () => ({
  async process() {
    return {};
  }
});

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

function decodeAll(ws: MockWebSocket): Record<string, unknown>[] {
  return [
    ...ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>),
    ...ws.sentText.map((t) => JSON.parse(t) as Record<string, unknown>)
  ];
}

async function waitForTerminal(
  ws: MockWebSocket,
  jobId: string
): Promise<void> {
  const terminal = new Set(["completed", "failed", "cancelled"]);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (
      decodeAll(ws).some(
        (m) =>
          m.type === "job_update" &&
          m.job_id === jobId &&
          terminal.has(String(m.status))
      )
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`job ${jobId} never reached a terminal job_update`);
}

function makeHooks(): JobRunExecutionHooks & {
  cancel: ReturnType<typeof vi.fn>;
} {
  return {
    cancel: vi.fn(),
    pushInput: vi.fn().mockResolvedValue(undefined),
    finishInputStream: vi.fn(),
    updateNodeProperties: vi.fn().mockReturnValue(true)
  };
}

const openedJobIds: string[] = [];
function openSession(jobId: string, hooks: JobRunExecutionHooks) {
  const session = jobRunRegistry.open("1", jobId, "wf", hooks);
  openedJobIds.push(jobId);
  return session;
}

describe("multi-instance job routing", () => {
  let ws: MockWebSocket;
  let runner: WebSocketClientSession;

  beforeEach(async () => {
    await initTestDb();
    vi.clearAllMocks();
    ws = new MockWebSocket();
    runner = new WebSocketClientSession({ resolveExecutor });
    await runner.connect(ws);
  });

  afterEach(async () => {
    delete process.env["NODETOOL_INSTANCE_ID"];
    await runner.disconnect();
    for (const jobId of openedJobIds.splice(0)) {
      const session = jobRunRegistry.get("1", jobId);
      if (session) jobRunRegistry.drop(session);
    }
  });

  it("stamps the executing instance on the job row at start", async () => {
    process.env["NODETOOL_INSTANCE_ID"] = "machine-a";
    const jobId = "stamped-job";

    await runner.runJob({
      job_id: jobId,
      workflow_id: "wf",
      graph: trivialGraph,
      execution_options: { persistence: "job" }
    });
    await waitForTerminal(ws, jobId);

    expect((await Job.get(jobId))?.runner_instance).toBe("machine-a");
  });

  it("stamps a row another instance queued when this one starts running it", async () => {
    process.env["NODETOOL_INSTANCE_ID"] = "machine-b";
    const jobId = "requeued-job";
    await Job.create({
      id: jobId,
      workflow_id: "wf",
      user_id: "1",
      status: "queued",
      params: {},
      graph: trivialGraph,
      runner_instance: "machine-a"
    });

    await runner.runJob({
      job_id: jobId,
      workflow_id: "wf",
      graph: trivialGraph,
      execution_options: { persistence: "job" }
    });
    await waitForTerminal(ws, jobId);

    expect((await Job.get(jobId))?.runner_instance).toBe("machine-b");
  });

  it("leaves the stamp null when no instance id is configured", async () => {
    const jobId = "unstamped-job";

    await runner.runJob({
      job_id: jobId,
      workflow_id: "wf",
      graph: trivialGraph,
      execution_options: { persistence: "job" }
    });
    await waitForTerminal(ws, jobId);

    expect((await Job.get(jobId))?.runner_instance).toBeNull();
  });

  it("cancels a run owned elsewhere by writing its row", async () => {
    process.env["NODETOOL_INSTANCE_ID"] = "machine-b";
    const jobId = "foreign-job";
    await Job.create({
      id: jobId,
      workflow_id: "wf",
      user_id: "1",
      status: "running",
      params: {},
      graph: trivialGraph,
      runner_instance: "machine-a"
    });

    // No local session: this instance is not the one executing the run, which
    // is what makes `cancelJob` fall past its local-registry branch.
    const result = await runner.handleCommand({
      command: "cancel_job",
      data: { job_id: jobId }
    });

    expect(result?.message).toBe("Job cancellation requested");
    expect(result?.workflow_id).toBe("wf");
    expect((await Job.get(jobId))?.status).toBe("cancelled");
  });

  it("leaves a completed row alone when a cancel races the owner's terminal write", async () => {
    process.env["NODETOOL_INSTANCE_ID"] = "machine-b";
    const jobId = "raced-job";
    await Job.create({
      id: jobId,
      workflow_id: "wf",
      user_id: "1",
      status: "running",
      params: {},
      graph: trivialGraph,
      runner_instance: "machine-a"
    });

    // The owner finishes between this instance reading the row and writing to
    // it. The conditional update must find nothing to change.
    const original = Job.markCancelledIfActive.bind(Job);
    const raced = vi
      .spyOn(Job, "markCancelledIfActive")
      .mockImplementation(async (id, userId) => {
        const owner = await Job.get(id);
        if (owner) {
          owner.markCompleted();
          owner.cost = 0.42;
          await owner.save();
        }
        return original(id, userId);
      });

    const result = await runner.handleCommand({
      command: "cancel_job",
      data: { job_id: jobId }
    });
    raced.mockRestore();

    expect(result?.error).toBe("Job not found or already completed");
    const row = await Job.get(jobId);
    expect(row?.status).toBe("completed");
    expect(row?.cost).toBe(0.42);
  });

  it("does not touch a run nothing stamped — an HTTP or trigger run has no owner", async () => {
    process.env["NODETOOL_INSTANCE_ID"] = "machine-b";
    const jobId = "unowned-running";
    await Job.create({
      id: jobId,
      workflow_id: "wf",
      user_id: "1",
      status: "running",
      params: {},
      graph: trivialGraph
    });

    const result = await runner.handleCommand({
      command: "cancel_job",
      data: { job_id: jobId }
    });

    expect(result?.error).toBe("Job not found or already completed");
    expect((await Job.get(jobId))?.status).toBe("running");
  });

  it("cancels a local run whose row was cancelled on another instance", async () => {
    const jobId = "cancelled-by-row";
    await Job.create({
      id: jobId,
      workflow_id: "wf",
      user_id: "1",
      status: "running",
      params: {},
      graph: trivialGraph,
      runner_instance: "machine-a"
    });
    const hooks = makeHooks();
    openSession(jobId, hooks);

    // The other instance wrote the row; nothing else reached us.
    expect(await Job.markCancelledIfActive(jobId, "1")).toBe(true);
    await pollCancelledJobsOnce();

    expect(hooks.cancel).toHaveBeenCalledTimes(1);
  });

  it("leaves a still-running local session alone on a poll", async () => {
    const jobId = "still-running";
    await Job.create({
      id: jobId,
      workflow_id: "wf",
      user_id: "1",
      status: "running",
      params: {},
      graph: trivialGraph
    });
    const hooks = makeHooks();
    openSession(jobId, hooks);

    await pollCancelledJobsOnce();

    expect(hooks.cancel).not.toHaveBeenCalled();
  });

  it("still reports a job nothing knows about as not found", async () => {
    const result = await runner.handleCommand({
      command: "cancel_job",
      data: { job_id: "never-existed" }
    });

    expect(result?.error).toBe("Job not found or already completed");
  });

  it("does not resurrect a job that already finished", async () => {
    const jobId = "already-done";
    await Job.create({
      id: jobId,
      workflow_id: "wf",
      user_id: "1",
      status: "completed",
      params: {},
      graph: trivialGraph
    });

    const result = await runner.handleCommand({
      command: "cancel_job",
      data: { job_id: jobId }
    });

    expect(result?.error).toBe("Job not found or already completed");
    expect((await Job.get(jobId))?.status).toBe("completed");
  });

  it("leaves a session for a different run alone when the poller runs", async () => {
    const jobId = "elsewhere-job";
    await Job.create({
      id: jobId,
      workflow_id: "wf",
      user_id: "1",
      status: "cancelled",
      params: {},
      graph: trivialGraph
    });
    const hooks = makeHooks();
    // A session for a *different* run than the cancelled row.
    openSession("unrelated-job", hooks);

    await pollCancelledJobsOnce();

    expect(hooks.cancel).not.toHaveBeenCalled();
  });
});
