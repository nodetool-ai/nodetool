/**
 * Coverage tests for the run_job full-execution surface of the unified
 * WebSocket runner — the branches the lifecycle/rpc sibling files deliberately
 * skip because they need a fuller run harness.
 *
 * The heart of a run is {@link streamJobMessages}: it relays node/edge/output
 * updates back over the socket, drives generation autosave and provider-cost
 * persistence, and emits the terminal `job_update` while persisting the final
 * Job status. Rather than stand up a real kernel graph (the main test already
 * exercises the happy path that way), these tests drive `streamJobMessages`
 * directly with a fake ActiveJob + fake ProcessingContext so each branch —
 * autosave, provider cost, suspended/failed/cancelled persistence, the
 * output-update fallback, message sanitization — is reached deterministically.
 *
 * The job-QUEUE surface (enqueue at capacity, per-workflow limit, queued
 * cancel, drain) is driven through the public `runJob`/`cancelJob` entry points
 * with `activeJobs` pre-filled to capacity.
 *
 * No real sockets, no real kernel, no real disk: the only real dependency is
 * the in-memory test DB (Job/Asset/Prediction rows), so persistence branches
 * assert against actual rows. `storeAssetWithThumbnail` is stubbed to a no-op.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { unpack } from "msgpackr";
import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/unified-websocket-runner.js";
import { initTestDb, Job } from "@nodetool-ai/models";

// Autosave persists bytes to storage; make that a no-op so tests touch only DB.
vi.mock("../src/lib/thumbnail.js", () => ({
  storeAssetWithThumbnail: vi.fn(async () => undefined)
}));

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

const asAny = (r: UnifiedWebSocketRunner) => r as unknown as Record<string, any>;

/** Decode every frame sent over the wire (binary first, then text). */
function decodeAll(ws: MockWebSocket): Record<string, unknown>[] {
  return [
    ...ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>),
    ...ws.sentText.map((t) => JSON.parse(t) as Record<string, unknown>)
  ];
}

/**
 * A fake ProcessingContext for streamJobMessages: it hands back a fixed list of
 * processing messages, then reports empty. `normalizeOutputValue` is an identity
 * spy so in-place asset mutations stay visible while still asserting the call.
 */
function fakeContext(messages: Record<string, unknown>[]) {
  const q = [...messages];
  return {
    hasMessages: () => q.length > 0,
    popMessage: () => q.shift(),
    normalizeOutputValue: vi.fn(async (v: unknown) => v),
    getNodeStatuses: () => ({}),
    getEdgeStatuses: () => ({})
  };
}

/** Build a fake ActiveJob whose context replays `messages`. */
function makeActive(opts: {
  jobId: string;
  workflowId?: string | null;
  nodes?: Array<Record<string, unknown>>;
  messages: Record<string, unknown>[];
}) {
  const context = fakeContext(opts.messages);
  const active = {
    jobId: opts.jobId,
    workflowId: opts.workflowId ?? null,
    context,
    runner: { cancel: vi.fn() },
    graph: { nodes: opts.nodes ?? [], edges: [] },
    finished: false,
    status: "running" as const
  };
  return active;
}

/** Run streamJobMessages to completion for a resolved/rejected executePromise. */
async function streamTo(
  runner: UnifiedWebSocketRunner,
  active: unknown,
  executePromise: Promise<unknown>
): Promise<void> {
  await asAny(runner).streamJobMessages(active, executePromise);
}

describe("UnifiedWebSocketRunner run_job — streamJobMessages relay", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;

  beforeEach(async () => {
    await initTestDb();
    vi.clearAllMocks();
    ws = new MockWebSocket();
    runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
  });

  afterEach(async () => {
    await runner.disconnect();
  });

  it("emits a running job_update first and a terminal completed job_update with outputs", async () => {
    const active = makeActive({ jobId: "J1", workflowId: "wf1", messages: [] });
    await streamTo(
      runner,
      active,
      Promise.resolve({ status: "completed", outputs: { out: ["v1"] } })
    );
    const frames = decodeAll(ws);
    const first = frames.find(
      (m) => m.type === "job_update" && m.status === "running"
    );
    expect(first).toBeDefined();
    // No output_update was streamed, so the fallback emits one per output value.
    const outUpdate = frames.find(
      (m) => m.type === "output_update" && m.value === "v1"
    );
    expect(outUpdate).toBeDefined();
    const terminal = frames.find(
      (m) => m.type === "job_update" && m.status === "completed"
    );
    expect(terminal).toBeDefined();
    expect((terminal?.result as any).outputs).toEqual({ out: ["v1"] });
  });

  it("relays a node_update and normalizes its result before sending", async () => {
    const active = makeActive({
      jobId: "J2",
      workflowId: "wf2",
      nodes: [{ id: "n1", type: "custom.Node" }],
      messages: [
        {
          type: "node_update",
          node_id: "n1",
          status: "running",
          result: { raw: 1 }
        }
      ]
    });
    await streamTo(runner, active, Promise.resolve({ status: "completed" }));
    expect(active.context.normalizeOutputValue).toHaveBeenCalledWith({ raw: 1 });
    const node = decodeAll(ws).find(
      (m) => m.type === "node_update" && m.node_id === "n1"
    );
    expect(node).toBeDefined();
    // job_id / workflow_id backfilled from the active job.
    expect(node?.job_id).toBe("J2");
    expect(node?.workflow_id).toBe("wf2");
  });

  it("skips constant and input node updates entirely", async () => {
    const active = makeActive({
      jobId: "J3",
      nodes: [
        { id: "c1", type: "nodetool.constant.String" },
        { id: "i1", type: "nodetool.input.IntInput" }
      ],
      messages: [
        { type: "node_update", node_id: "c1", status: "completed" },
        { type: "output_update", node_id: "i1", value: 5 }
      ]
    });
    await streamTo(runner, active, Promise.resolve({ status: "completed" }));
    const frames = decodeAll(ws);
    expect(frames.some((m) => m.node_id === "c1")).toBe(false);
    expect(frames.some((m) => m.node_id === "i1")).toBe(false);
  });

  it("drops output_update for a non-sink node but relays it for an Output node", async () => {
    const active = makeActive({
      jobId: "J4",
      nodes: [
        { id: "plain", type: "custom.Plain" },
        { id: "out", type: "nodetool.output.Output" }
      ],
      messages: [
        { type: "output_update", node_id: "plain", value: "hidden" },
        { type: "output_update", node_id: "out", value: "shown" }
      ]
    });
    await streamTo(runner, active, Promise.resolve({ status: "completed" }));
    const outs = decodeAll(ws).filter((m) => m.type === "output_update");
    // Only the Output node's update is relayed; the plain node's is dropped, and
    // because one output_update was streamed the empty-outputs fallback is not
    // re-run for those keys.
    expect(outs.map((m) => m.value)).toEqual(["shown"]);
  });

  it("sanitizes error text and notification content on relayed messages", async () => {
    const bigError = "x".repeat(5000);
    const active = makeActive({
      jobId: "J5",
      messages: [
        { type: "notification", content: "hello", error: bigError }
      ]
    });
    await streamTo(runner, active, Promise.resolve({ status: "completed" }));
    const note = decodeAll(ws).find((m) => m.type === "notification");
    expect(note).toBeDefined();
    // 5000-char error is truncated to the 4000-char cap + a truncation notice.
    expect(String(note?.error).length).toBeLessThan(5000);
    expect(String(note?.error)).toContain("truncated");
  });

  it("does not double-emit a terminal when the runner already streamed one with a result", async () => {
    const active = makeActive({
      jobId: "J6",
      messages: [
        {
          type: "job_update",
          status: "completed",
          result: { outputs: {} }
        }
      ]
    });
    await streamTo(runner, active, Promise.resolve({ status: "completed" }));
    const completed = decodeAll(ws).filter(
      (m) => m.type === "job_update" && m.status === "completed"
    );
    expect(completed).toHaveLength(1);
  });
});

describe("UnifiedWebSocketRunner run_job — terminal persistence", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;

  beforeEach(async () => {
    await initTestDb();
    vi.clearAllMocks();
    ws = new MockWebSocket();
    runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
  });

  afterEach(async () => {
    await runner.disconnect();
  });

  async function seedJob(id: string): Promise<void> {
    await Job.create({
      id,
      workflow_id: "wf",
      user_id: "1",
      status: "running",
      name: "",
      params: {},
      graph: { nodes: [], edges: [] }
    });
  }

  it("marks the persisted job failed when the executor promise rejects", async () => {
    await seedJob("FJ");
    const active = makeActive({ jobId: "FJ", workflowId: "wf", messages: [] });
    await streamTo(runner, active, Promise.reject(new Error("exec boom")));
    expect((active as any).status).toBe("failed");
    const failed = decodeAll(ws).find(
      (m) => m.type === "job_update" && m.status === "failed"
    );
    expect(failed?.error).toBe("exec boom");
    const job = await Job.get<Job>("FJ");
    expect(job?.status).toBe("failed");
  });

  it("persists a suspended terminal state with its saved node state", async () => {
    await seedJob("SJ");
    const active = makeActive({ jobId: "SJ", workflowId: "wf", messages: [] });
    await streamTo(
      runner,
      active,
      Promise.resolve({
        status: "suspended",
        suspend: {
          node_id: "pauseNode",
          reason: "await-human",
          state: { step: 2 },
          metadata: { kind: "hitl" }
        }
      })
    );
    const job = await Job.get<Job>("SJ");
    expect(job?.status).toBe("suspended");
  });

  it("persists a cancelled terminal state", async () => {
    await seedJob("CJ");
    const active = makeActive({ jobId: "CJ", workflowId: "wf", messages: [] });
    await streamTo(runner, active, Promise.resolve({ status: "cancelled" }));
    const job = await Job.get<Job>("CJ");
    expect(job?.status).toBe("cancelled");
  });

  it("does not overwrite a DB-only cancellation with completed", async () => {
    await seedJob("DC");
    const row = await Job.get<Job>("DC");
    row!.markCancelled();
    await row!.save();
    const active = makeActive({ jobId: "DC", workflowId: "wf", messages: [] });
    await streamTo(runner, active, Promise.resolve({ status: "completed" }));
    const job = await Job.get<Job>("DC");
    // The in-memory run completed, but the row was already cancelled — keep it.
    expect(job?.status).toBe("cancelled");
  });
});

describe("UnifiedWebSocketRunner run_job — provider cost", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;

  beforeEach(async () => {
    await initTestDb();
    vi.clearAllMocks();
    ws = new MockWebSocket();
    runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
  });

  afterEach(async () => {
    await runner.disconnect();
  });

  it("accumulates node provider cost and persists it on the job row", async () => {
    await Job.create({
      id: "PC",
      workflow_id: "wf",
      user_id: "1",
      status: "running",
      name: "",
      params: {},
      graph: { nodes: [], edges: [] }
    });
    const active = makeActive({
      jobId: "PC",
      workflowId: "wf",
      nodes: [{ id: "k1", type: "kie.Node" }],
      messages: [
        {
          type: "node_update",
          node_id: "k1",
          status: "completed",
          provider_cost: {
            provider: "kie",
            amount: 0.5,
            currency: "USD"
          }
        }
      ]
    });
    await streamTo(runner, active, Promise.resolve({ status: "completed" }));
    expect((active as any).providerCostTotal).toBe(0.5);
    const job = await Job.get<Job>("PC");
    expect(job?.cost).toBe(0.5);
  });

  it("ignores a provider cost with a non-finite amount", async () => {
    const active = makeActive({
      jobId: "PC2",
      workflowId: "wf",
      nodes: [{ id: "k2", type: "kie.Node" }],
      messages: [
        {
          type: "node_update",
          node_id: "k2",
          status: "completed",
          provider_cost: { provider: "kie", amount: Number.NaN }
        }
      ]
    });
    await streamTo(runner, active, Promise.resolve({ status: "completed" }));
    expect((active as any).providerCostTotal).toBeUndefined();
  });
});

describe("UnifiedWebSocketRunner run_job — generation autosave", () => {
  let ws: MockWebSocket;

  beforeEach(async () => {
    await initTestDb();
    vi.clearAllMocks();
    ws = new MockWebSocket();
  });

  it("autosaves a generation_complete image asset and stamps an arrival index", async () => {
    const meta = {
      auto_save_asset: true,
      is_streaming_output: false,
      outputs: [{ name: "image", type: { type: "image" } }],
      primary_output: "image"
    };
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor,
      getNodeMetadata: () => meta as never
    });
    await runner.connect(ws);
    const imageValue: Record<string, unknown> = {
      type: "image",
      data: Buffer.from([1, 2, 3, 4]).toString("base64")
    };
    const active = makeActive({
      jobId: "GEN1",
      workflowId: "wf",
      nodes: [{ id: "g1", type: "fal.Image" }],
      messages: [
        {
          type: "generation_complete",
          node_id: "g1",
          outputs: { image: imageValue },
          properties: { prompt: "a fox" }
        }
      ]
    });
    await streamTo(runner, active, Promise.resolve({ status: "completed" }));
    // The asset-like value was mutated in place with a saved asset_id + uri.
    expect(typeof imageValue.asset_id).toBe("string");
    expect(String(imageValue.uri)).toMatch(/^asset:\/\//);
    const gen = decodeAll(ws).find((m) => m.type === "generation_complete");
    expect(gen).toBeDefined();
    expect(gen?.index).toBe(0);
    await runner.disconnect();
  });
});

describe("UnifiedWebSocketRunner run_job — queue path", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;

  const graph = {
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

  /** Occupy `n` concurrency slots with inert fake active jobs. */
  function fillSlots(n: number): void {
    for (let i = 0; i < n; i++) {
      asAny(runner).activeJobs.set(`busy-${i}`, {
        jobId: `busy-${i}`,
        workflowId: `busy-wf-${i}`,
        status: "running",
        finished: false,
        runner: { cancel: vi.fn() }
      });
    }
  }

  beforeEach(async () => {
    await initTestDb();
    vi.clearAllMocks();
    ws = new MockWebSocket();
    runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
  });

  afterEach(async () => {
    await runner.disconnect();
  });

  it("queues a run when the global concurrency cap is reached", async () => {
    fillSlots(4); // default MAX_CONCURRENT_JOBS
    await runner.runJob({ job_id: "Q1", workflow_id: "wf", graph });
    // enqueueJob sends the `queued` frame fire-and-forget; let it flush.
    await new Promise((r) => setTimeout(r, 10));
    expect(asAny(runner).jobQueue.size).toBe(1);
    const queued = decodeAll(ws).find(
      (m) => m.type === "job_update" && m.status === "queued" && m.job_id === "Q1"
    );
    expect(queued).toBeDefined();
    expect(queued?.queue_position).toBe(1);
    // The queued run is persisted so it shows up in jobs.list.
    const job = await Job.get<Job>("Q1");
    expect(job?.status).toBe("queued");
  });

  it("queues a non-concurrent run when its workflow already has one in flight", async () => {
    asAny(runner).activeJobs.set("live", {
      jobId: "live",
      workflowId: "wfx",
      status: "running",
      finished: false,
      runner: { cancel: vi.fn() }
    });
    await runner.runJob({ job_id: "Q2", workflow_id: "wfx", graph });
    await new Promise((r) => setTimeout(r, 10));
    expect(asAny(runner).jobQueue.size).toBe(1);
    const queued = decodeAll(ws).find(
      (m) => m.status === "queued" && m.job_id === "Q2"
    );
    expect(queued).toBeDefined();
  });

  it("cancelJob removes a still-queued run and announces it cancelled", async () => {
    fillSlots(4);
    await runner.runJob({ job_id: "Q3", workflow_id: "wf", graph });
    expect(asAny(runner).jobQueue.size).toBe(1);
    ws.sentBytes = [];
    ws.sentText = [];
    const res = await runner.cancelJob("Q3", "wf");
    expect(res.message).toBe("Queued job cancelled");
    expect(asAny(runner).jobQueue.size).toBe(0);
    const cancelled = decodeAll(ws).find(
      (m) => m.type === "job_update" && m.status === "cancelled" && m.job_id === "Q3"
    );
    expect(cancelled).toBeDefined();
    const job = await Job.get<Job>("Q3");
    expect(job?.status).toBe("cancelled");
  });

  it("drainQueue starts a queued run once a slot frees up", async () => {
    fillSlots(4);
    const runProcess = vi.fn(async () => ({ output: "done" }));
    const drainRunner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({ process: runProcess })
    });
    await drainRunner.connect(ws);
    // Fill this runner's own slots, then enqueue a real runnable job.
    for (let i = 0; i < 4; i++) {
      asAny(drainRunner).activeJobs.set(`b-${i}`, {
        jobId: `b-${i}`,
        workflowId: `bw-${i}`,
        status: "running",
        finished: false,
        runner: { cancel: vi.fn() }
      });
    }
    await drainRunner.runJob({ job_id: "DQ", workflow_id: "wfq", graph });
    expect(asAny(drainRunner).jobQueue.size).toBe(1);
    // Free every slot, then drain — the queued job must start.
    for (let i = 0; i < 4; i++) asAny(drainRunner).activeJobs.delete(`b-${i}`);
    asAny(drainRunner).drainQueue();
    // Wait for the queued job to leave the queue and start executing.
    for (let i = 0; i < 50 && asAny(drainRunner).jobQueue.size > 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(asAny(drainRunner).jobQueue.size).toBe(0);
    // Give the real run a moment to complete and drain.
    await new Promise((r) => setTimeout(r, 40));
    await drainRunner.disconnect();
  });
});

describe("UnifiedWebSocketRunner run_job — startJobInner branches", () => {
  let ws: MockWebSocket;

  const graph = {
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

  beforeEach(async () => {
    await initTestDb();
    vi.clearAllMocks();
    ws = new MockWebSocket();
  });

  it("honors a DB-only cancellation and does not resurrect a cancelled queued job", async () => {
    await Job.create({
      id: "CANCELLED_START",
      workflow_id: "wf",
      user_id: "1",
      status: "cancelled",
      name: "",
      params: {},
      graph
    });
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
    await asAny(runner).startJob({
      job_id: "CANCELLED_START",
      workflow_id: "wf",
      graph
    });
    // The job was un-registered instead of executing.
    expect(asAny(runner).activeJobs.has("CANCELLED_START")).toBe(false);
    const cancelled = decodeAll(ws).find(
      (m) =>
        m.type === "job_update" &&
        m.status === "cancelled" &&
        m.job_id === "CANCELLED_START"
    );
    expect(cancelled).toBeDefined();
    await runner.disconnect();
  });

  it("flips a persisted 'queued' row to running when it finally starts", async () => {
    await Job.create({
      id: "QUEUED_START",
      workflow_id: "wf",
      user_id: "1",
      status: "queued",
      name: "",
      params: {},
      graph
    });
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
    await asAny(runner).startJob({
      job_id: "QUEUED_START",
      workflow_id: "wf",
      graph
    });
    // Let the real run finish and persist its final status.
    for (
      let i = 0;
      i < 50 && asAny(runner).activeJobs.has("QUEUED_START");
      i++
    ) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const running = decodeAll(ws).find(
      (m) =>
        m.type === "job_update" &&
        m.status === "running" &&
        m.job_id === "QUEUED_START"
    );
    expect(running).toBeDefined();
    await runner.disconnect();
  });
});

describe("UnifiedWebSocketRunner run_job — emitBeforeRunFailure persistence", () => {
  it("persists a failed job row and emits a failed job_update", async () => {
    await initTestDb();
    const ws = new MockWebSocket();
    await Job.create({
      id: "BRF",
      workflow_id: "wf",
      user_id: "1",
      status: "running",
      name: "",
      params: {},
      graph: { nodes: [], edges: [] }
    });
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
    await asAny(runner).emitBeforeRunFailure("BRF", "wf", new Error("bridge down"));
    const failed = decodeAll(ws).find(
      (m) => m.type === "job_update" && m.status === "failed" && m.job_id === "BRF"
    );
    expect(failed?.error).toBe("bridge down");
    const job = await Job.get<Job>("BRF");
    expect(job?.status).toBe("failed");
    await runner.disconnect();
  });
});
