/**
 * Workflow runs survive a dropped socket.
 *
 * A run registers a {@link JobRunSession} at start, so `disconnect()` detaches
 * it instead of cancelling the run, every frame keeps being seq-stamped and
 * buffered, and a *different* connection's `reconnect_job` replays the tail —
 * including the terminal `job_update` — and can then cancel or feed the run
 * through the session's hooks.
 *
 * These tests drive `streamJobMessages` directly against a fake ActiveJob (the
 * same harness `unified-websocket-runner-runjob-coverage.test.ts` uses) so the
 * disconnect can be timed precisely mid-run, and wire the session exactly as
 * `startJobInner` does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { unpack } from "msgpackr";
import {
  UnifiedWebSocketRunner,
  resolveRunJobExecutionOptions,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/unified-websocket-runner.js";
import {
  jobRunRegistry,
  type JobRunExecutionHooks
} from "../src/job-run-registry.js";
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
    return this.queue.shift() ?? { type: "websocket.disconnect" };
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

/** Reach the runner's private job wiring, the way the sibling suites do. */
const asAny = (r: UnifiedWebSocketRunner) =>
  r as unknown as Record<string, never> & {
    activeJobs: Map<string, unknown>;
    jobDeliveryTarget: { deliver(m: Record<string, unknown>): Promise<void> };
    streamJobMessages(
      active: unknown,
      promise: Promise<unknown>
    ): Promise<void>;
  };

function decodeAll(ws: MockWebSocket): Record<string, unknown>[] {
  return [
    ...ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>),
    ...ws.sentText.map((t) => JSON.parse(t) as Record<string, unknown>)
  ];
}

function fakeContext() {
  const q: Record<string, unknown>[] = [];
  const listeners = new Set<() => void>();
  return {
    hasMessages: () => q.length > 0,
    popMessage: () => q.shift(),
    addMessageListener: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: (message: Record<string, unknown>) => {
      q.push(message);
      for (const listener of listeners) listener();
    },
    normalizeOutputValue: vi.fn(async (v: unknown) => v),
    getNodeStatuses: () => ({}),
    getEdgeStatuses: () => ({})
  };
}

function makeHooks(): JobRunExecutionHooks & {
  cancel: ReturnType<typeof vi.fn>;
  pushInput: ReturnType<typeof vi.fn>;
} {
  return {
    cancel: vi.fn(),
    pushInput: vi.fn().mockResolvedValue(undefined),
    finishInputStream: vi.fn(),
    updateNodeProperties: vi.fn().mockReturnValue(true)
  };
}

/**
 * Register a running job on `runner` the way `startJobInner` does: a fake
 * ActiveJob in `activeJobs`, plus a registry session attached to that
 * connection's job delivery target.
 */
function registerRun(
  runner: UnifiedWebSocketRunner,
  jobId: string,
  hooks: JobRunExecutionHooks
) {
  const context = fakeContext();
  const now = performance.now();
  const active = {
    jobId,
    workflowId: "wf",
    context,
    session: { cancel: vi.fn() },
    graph: { nodes: [], edges: [] },
    finished: false,
    status: "running" as const,
    requireTerminalResult: false,
    executionOptions: resolveRunJobExecutionOptions({ persistence: "job" }),
    timings: {
      acceptedAt: now,
      queueMs: 0,
      graphLoadedMs: 0,
      graphHydratedMs: 0,
      preRunMs: 0,
      persistenceMs: 0,
      kernelStartedAt: now
    },
    runSession: jobRunRegistry.open("1", jobId, "wf", hooks)
  };
  active.runSession.attach(asAny(runner).jobDeliveryTarget, 0);
  asAny(runner).activeJobs.set(jobId, active);
  registeredJobIds.push(jobId);
  return active;
}

/**
 * The registry is process-wide, so a run one test leaves executing would
 * still occupy a concurrency slot in the next. Torn down per test.
 */
const registeredJobIds: string[] = [];
function dropRegisteredRuns(): void {
  for (const jobId of registeredJobIds.splice(0)) {
    const session = jobRunRegistry.get("1", jobId);
    if (session) jobRunRegistry.drop(session);
  }
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline)
      throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("workflow runs survive a dropped socket", () => {
  let ws1: MockWebSocket;
  let runner1: UnifiedWebSocketRunner;

  beforeEach(async () => {
    await initTestDb();
    vi.clearAllMocks();
    ws1 = new MockWebSocket();
    runner1 = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner1.connect(ws1);
  });

  afterEach(async () => {
    await runner1.disconnect();
    dropRegisteredRuns();
  });

  it("keeps a run going after disconnect and replays the missed tail — terminal job_update included — to a second connection", async () => {
    const jobId = "resilient-job-1";
    await Job.create({
      id: jobId,
      workflow_id: "wf",
      user_id: "1",
      status: "running",
      params: {},
      graph: { nodes: [], edges: [] }
    });
    const hooks = makeHooks();
    const active = registerRun(runner1, jobId, hooks);

    let settle: (result: { status: "completed" }) => void = () => undefined;
    const executePromise = new Promise<{ status: "completed" }>((resolve) => {
      settle = resolve;
    });
    const streamTask = asAny(runner1).streamJobMessages(active, executePromise);

    active.context.emit({
      type: "node_update",
      node_id: "n1",
      node_name: "n1",
      node_type: "test.Node",
      status: "completed",
      job_id: jobId
    });
    await waitFor(
      () => decodeAll(ws1).some((m) => m.node_id === "n1"),
      "the first node_update to reach connection 1"
    );

    // The socket drops mid-run. The run must NOT be cancelled.
    await runner1.disconnect();
    expect(hooks.cancel).not.toHaveBeenCalled();
    expect(active.session.cancel).not.toHaveBeenCalled();

    const sentBeforeDrop = decodeAll(ws1).length;
    active.context.emit({
      type: "node_update",
      node_id: "n2",
      node_name: "n2",
      node_type: "test.Node",
      status: "completed",
      job_id: jobId
    });
    settle({ status: "completed" });
    await streamTask;
    expect(decodeAll(ws1)).toHaveLength(sentBeforeDrop);

    // A fresh connection resubscribes from the last seq it saw.
    const ws2 = new MockWebSocket();
    const runner2 = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner2.connect(ws2);
    const lastSeq = decodeAll(ws1).at(-1)?.job_seq as number;
    await runner2.handleCommand({
      command: "reconnect_job",
      data: { job_id: jobId, workflow_id: "wf", last_seq: lastSeq }
    });

    const replayed = decodeAll(ws2);
    const header = replayed[0];
    expect(header.type).toBe("job_resumed");
    expect(header.status).toBe("finished");
    expect(header.replay_incomplete).toBe(false);
    expect(replayed.some((m) => m.node_id === "n2")).toBe(true);
    const terminal = replayed.find(
      (m) => m.type === "job_update" && m.status === "completed"
    );
    expect(terminal).toBeDefined();
    expect(terminal?.job_id).toBe(jobId);
    // Nothing before `last_seq` is re-sent.
    expect(replayed.some((m) => m.node_id === "n1")).toBe(false);

    await runner2.disconnect();
  });

  it("cancels a detached run from the second connection and persists the cancellation", async () => {
    const jobId = "resilient-job-2";
    await Job.create({
      id: jobId,
      workflow_id: "wf",
      user_id: "1",
      status: "running",
      params: {},
      graph: { nodes: [], edges: [] }
    });
    const hooks = makeHooks();
    registerRun(runner1, jobId, hooks);
    await runner1.disconnect();

    const ws2 = new MockWebSocket();
    const runner2 = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner2.connect(ws2);
    const result = await runner2.handleCommand({
      command: "cancel_job",
      data: { job_id: jobId }
    });

    expect(result?.message).toBe("Job cancellation requested");
    expect(hooks.cancel).toHaveBeenCalledTimes(1);
    expect((await Job.get(jobId))?.status).toBe("cancelled");
    await runner2.disconnect();
  });

  it("routes stream_input and stop for an adopted run through the owning runner's hooks", async () => {
    const jobId = "resilient-job-3";
    const hooks = makeHooks();
    registerRun(runner1, jobId, hooks);
    await runner1.disconnect();

    const ws2 = new MockWebSocket();
    const runner2 = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner2.connect(ws2);
    await runner2.handleCommand({
      command: "reconnect_job",
      data: { job_id: jobId, workflow_id: "wf" }
    });

    await runner2.handleCommand({
      command: "stream_input",
      data: { job_id: jobId, input: "prompt", value: "hi" }
    });
    expect(hooks.pushInput).toHaveBeenCalledWith("prompt", "hi", undefined);

    expect(
      await runner2.handleCommand({
        command: "update_node_properties",
        data: { job_id: jobId, node_id: "n1", properties: { gain: 1 } }
      })
    ).toEqual({ applied: true });

    await runner2.handleCommand({ command: "stop", data: { job_id: jobId } });
    expect(hooks.cancel).toHaveBeenCalled();
    await runner2.disconnect();
  });

  it("reports a completed job's real persisted status once its session is gone", async () => {
    const jobId = "resilient-job-4";
    const job = await Job.create({
      id: jobId,
      workflow_id: "wf",
      user_id: "1",
      status: "running",
      params: {},
      graph: { nodes: [], edges: [] }
    });
    job.markCompleted();
    await job.save();

    await runner1.handleCommand({
      command: "reconnect_job",
      data: { job_id: jobId, workflow_id: "wf" }
    });

    const update = decodeAll(ws1).find((m) => m.type === "job_update");
    expect(update?.status).toBe("completed");
    expect(String(update?.error)).toMatch(/replay is unavailable/i);
  });

  it("counts a detached run against a fresh connection's concurrency slots", async () => {
    const jobId = "resilient-job-6";
    registerRun(runner1, jobId, makeHooks());
    await runner1.disconnect();

    const ws2 = new MockWebSocket();
    const runner2 = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner2.connect(ws2);

    // The run is detached, not this connection's, and still occupies a slot:
    // otherwise four abandoned sockets plus a fresh one is eight runs.
    const asCounts = runner2 as unknown as {
      inFlightJobCount: number;
      countActiveJobsForWorkflow(workflowId: string | null): number;
    };
    expect(asCounts.inFlightJobCount).toBe(1);
    expect(asCounts.countActiveJobsForWorkflow("wf")).toBe(1);
    expect(asCounts.countActiveJobsForWorkflow("other-wf")).toBe(0);

    // …and stops occupying one once it settles.
    jobRunRegistry.get("1", jobId)?.finish("completed");
    expect(asCounts.inFlightJobCount).toBe(0);
    expect(asCounts.countActiveJobsForWorkflow("wf")).toBe(0);
    await runner2.disconnect();
  });

  it("does not double-count its own running job", async () => {
    const jobId = "resilient-job-7";
    registerRun(runner1, jobId, makeHooks());
    const asCounts = runner1 as unknown as { inFlightJobCount: number };
    expect(asCounts.inFlightJobCount).toBe(1);
  });

  it("reports a queued row with no session as failed, not queued", async () => {
    const jobId = "resilient-job-8";
    await Job.create({
      id: jobId,
      workflow_id: "wf",
      user_id: "1",
      status: "queued",
      params: {},
      graph: { nodes: [], edges: [] }
    });

    await runner1.handleCommand({
      command: "reconnect_job",
      data: { job_id: jobId, workflow_id: "wf" }
    });

    // Echoing "queued" parks the editor in a run that nothing can ever
    // settle — its Stop button would hang forever.
    const update = decodeAll(ws1).find((m) => m.type === "job_update");
    expect(update?.status).toBe("failed");
    expect(String(update?.error)).toMatch(/replay is unavailable/i);
  });

  it("still reports a row stuck at running with no session as failed", async () => {
    const jobId = "resilient-job-5";
    await Job.create({
      id: jobId,
      workflow_id: "wf",
      user_id: "1",
      status: "running",
      params: {},
      graph: { nodes: [], edges: [] }
    });

    await runner1.handleCommand({
      command: "reconnect_job",
      data: { job_id: jobId, workflow_id: "wf" }
    });

    const update = decodeAll(ws1).find((m) => m.type === "job_update");
    expect(update?.status).toBe("failed");
    expect(String(update?.error)).toMatch(/replay is unavailable/i);

    // …and settles the row itself: an unclaimed zombie row that kept reading
    // "running" would be rediscovered by reload reconciliation on every page
    // load, re-reporting the same loss forever.
    const row = (await Job.get(jobId)) as Job | null;
    expect(row?.status).toBe("failed");
  });

  it("leaves a running row claimed by another instance untouched", async () => {
    const jobId = "resilient-job-9";
    process.env["NODETOOL_INSTANCE_ID"] = "instance-a";
    try {
      await Job.create({
        id: jobId,
        workflow_id: "wf",
        user_id: "1",
        status: "running",
        runner_instance: "instance-b",
        params: {},
        graph: { nodes: [], edges: [] }
      });

      await runner1.handleCommand({
        command: "reconnect_job",
        data: { job_id: jobId, workflow_id: "wf" }
      });

      // Reported failed to THIS client (no replay is possible here), but the
      // row stays running: the run may well be alive on instance-b.
      const update = decodeAll(ws1).find((m) => m.type === "job_update");
      expect(update?.status).toBe("failed");
      const row = (await Job.get(jobId)) as Job | null;
      expect(row?.status).toBe("running");
    } finally {
      delete process.env["NODETOOL_INSTANCE_ID"];
    }
  });

  it("treats another user's row as missing and leaves it untouched", async () => {
    const jobId = "resilient-job-11";
    await Job.create({
      id: jobId,
      workflow_id: "wf",
      user_id: "2",
      status: "running",
      params: {},
      graph: { nodes: [], edges: [] }
    });

    await runner1.handleCommand({
      command: "reconnect_job",
      data: { job_id: jobId, workflow_id: "wf" }
    });

    const update = decodeAll(ws1).find((m) => m.type === "job_update");
    expect(String(update?.error)).toMatch(/not found/i);
    const row = (await Job.get(jobId)) as Job | null;
    expect(row?.status).toBe("running");
  });
});
