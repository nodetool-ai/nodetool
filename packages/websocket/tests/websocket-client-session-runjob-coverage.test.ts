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
 * autosave, provider cost, failed/cancelled persistence, the
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
  DEFAULT_RUN_JOB_EXECUTION_OPTIONS,
  WebSocketClientSession,
  resolveRunJobExecutionOptions,
  resolveRunJobUserId,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";
import { initTestDb, Job } from "@nodetool-ai/models";
import type { ProcessingContext } from "@nodetool-ai/runtime";

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

const asAny = (r: WebSocketClientSession) =>
  r as unknown as Record<string, any>;

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
/**
 * Fill in the required-but-tangential protocol fields these fixtures omit
 * (real `node_update`/`output_update` frames always carry `node_name`/
 * `node_type`/`output_name`/`output_type`/`metadata` — the kernel stamps them
 * on every emit) so the outbound Zod validation gate
 * (`NODETOOL_VALIDATE_OUTBOUND_WS`, on under vitest) doesn't reject an
 * otherwise-fine test fixture for omitting a field the test doesn't care
 * about.
 */
function withRequiredProtocolFields(
  message: Record<string, unknown>
): Record<string, unknown> {
  const nodeId = typeof message.node_id === "string" ? message.node_id : "n";
  if (message.type === "node_update") {
    return {
      node_name: nodeId,
      node_type: "test.Node",
      ...message
    };
  }
  if (message.type === "output_update") {
    return {
      node_name: nodeId,
      output_name: "output",
      output_type: "any",
      metadata: {},
      ...message
    };
  }
  if (message.type === "generation_complete") {
    return {
      node_name: nodeId,
      node_type: "test.Node",
      outputs: {},
      ...message
    };
  }
  if (message.type === "notification") {
    return {
      node_id: nodeId,
      content: "",
      severity: "info",
      ...message
    };
  }
  return message;
}

function fakeContext(messages: Record<string, unknown>[]) {
  const q = [...messages.map(withRequiredProtocolFields)];
  const listeners = new Set<() => void>();
  return {
    hasMessages: () => q.length > 0,
    popMessage: () => q.shift(),
    addMessageListener: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: (message: Record<string, unknown>) => {
      q.push(withRequiredProtocolFields(message));
      for (const listener of listeners) listener();
    },
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
  requireTerminalResult?: boolean;
  executionOptions?: {
    persistence?: "job" | "session";
    event_detail?: "full" | "outputs" | "terminal";
    asset_persistence?: "auto" | "temporary";
  };
}) {
  const context = fakeContext(opts.messages);
  const now = performance.now();
  const active = {
    jobId: opts.jobId,
    workflowId: opts.workflowId ?? null,
    context,
    runner: { cancel: vi.fn() },
    graph: { nodes: opts.nodes ?? [], edges: [] },
    finished: false,
    status: "running" as const,
    requireTerminalResult: opts.requireTerminalResult ?? false,
    executionOptions: resolveRunJobExecutionOptions(opts.executionOptions),
    timings: {
      acceptedAt: now,
      graphLoadedMs: 0,
      graphHydratedMs: 0,
      preRunMs: 0,
      persistenceMs: 0,
      kernelStartedAt: now
    }
  };
  return active;
}

describe("run_job execution option defaults", () => {
  it("preserves current behavior when absent or invalid", () => {
    expect(resolveRunJobExecutionOptions(undefined)).toEqual(
      DEFAULT_RUN_JOB_EXECUTION_OPTIONS
    );
    expect(
      resolveRunJobExecutionOptions({
        persistence: "invalid" as never,
        event_detail: "invalid" as never,
        asset_persistence: "invalid" as never
      })
    ).toEqual(DEFAULT_RUN_JOB_EXECUTION_OPTIONS);
  });

  it("defaults SDK runs to temporary assets without changing ordinary runs", () => {
    expect(resolveRunJobExecutionOptions(undefined, true)).toEqual({
      persistence: "job",
      eventDetail: "full",
      assetPersistence: "temporary"
    });
    expect(
      resolveRunJobExecutionOptions({ asset_persistence: "auto" }, true)
    ).toEqual(DEFAULT_RUN_JOB_EXECUTION_OPTIONS);
  });

  it("treats a blank request user id as absent", () => {
    expect(resolveRunJobUserId("", "connection-user")).toBe(
      "connection-user"
    );
    expect(resolveRunJobUserId("   ", "connection-user")).toBe(
      "connection-user"
    );
    expect(resolveRunJobUserId("request-user", "connection-user")).toBe(
      "request-user"
    );
  });
});

/** Run streamJobMessages to completion for a resolved/rejected executePromise. */
async function streamTo(
  runner: WebSocketClientSession,
  active: unknown,
  executePromise: Promise<unknown>
): Promise<void> {
  await asAny(runner).jobs.streamJobMessages(active, executePromise);
}

describe("WebSocketClientSession run_job — streamJobMessages relay", () => {
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

  it("does not duplicate the kernel running update for authoritative SDK runs", async () => {
    const active = makeActive({
      jobId: "J-SDK",
      workflowId: "wf-sdk",
      messages: [
        {
          type: "job_update",
          status: "running"
        }
      ],
      requireTerminalResult: true
    });

    await streamTo(
      runner,
      active,
      Promise.resolve({ status: "completed", outputs: {} })
    );

    const runningUpdates = decodeAll(ws).filter(
      (message) =>
        message.type === "job_update" && message.status === "running"
    );
    expect(runningUpdates).toHaveLength(1);
  });

  it("acknowledges an authoritative SDK run that fails before the kernel emits running", async () => {
    // Graph validation can fail before the kernel's running update, leaving the
    // failed job_update as the only kernel frame. The client must still see the
    // run acknowledged before the terminal update.
    const active = makeActive({
      jobId: "J-SDK-INVALID",
      workflowId: "wf-sdk-invalid",
      messages: [
        {
          type: "job_update",
          status: "failed",
          error: "Correlation analysis failed",
          validation_issues: [
            { node_id: "n1", node_type: "test.Node", property: "", message: "x" }
          ]
        }
      ],
      requireTerminalResult: true
    });

    await streamTo(
      runner,
      active,
      Promise.resolve({ status: "failed", error: "Correlation analysis failed" })
    );

    const jobUpdates = decodeAll(ws).filter((m) => m.type === "job_update");
    expect(jobUpdates.map((m) => m.status)).toEqual(["running", "failed"]);
    expect(jobUpdates[1]?.validation_issues).toBeDefined();
  });

  it("waits for execution activity without scheduling a polling timer", async () => {
    vi.useFakeTimers();
    try {
      const active = makeActive({
        jobId: "J-LATENCY",
        workflowId: "wf-latency",
        messages: []
      });
      let resolveExecution:
        | ((value: { status: "completed" }) => void)
        | undefined;
      const executePromise = new Promise<{ status: "completed" }>((resolve) => {
        resolveExecution = resolve;
      });

      const streamPromise = streamTo(runner, active, executePromise);
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);

      resolveExecution?.({ status: "completed" });
      await streamPromise;
      expect(
        decodeAll(ws).some(
          (message) =>
            message.type === "job_update" && message.status === "completed"
        )
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("relays a message emitted while execution is pending", async () => {
    const active = makeActive({
      jobId: "J-ACTIVITY",
      workflowId: "wf-activity",
      nodes: [{ id: "n1", type: "custom.Node" }],
      messages: []
    });
    let resolveExecution:
      | ((value: { status: "completed" }) => void)
      | undefined;
    const executePromise = new Promise<{ status: "completed" }>((resolve) => {
      resolveExecution = resolve;
    });

    const streamPromise = streamTo(runner, active, executePromise);
    active.context.emit({
      type: "node_update",
      node_id: "n1",
      status: "running"
    });
    resolveExecution?.({ status: "completed" });
    await streamPromise;

    const frames = decodeAll(ws);
    expect(
      frames.some(
        (message) =>
          message.type === "node_update" &&
          message.node_id === "n1" &&
          message.status === "running"
      )
    ).toBe(true);
    expect(
      frames.some(
        (message) =>
          message.type === "job_update" && message.status === "completed"
      )
    ).toBe(true);
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
    expect(active.context.normalizeOutputValue).toHaveBeenCalledWith({
      raw: 1
    });
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
      messages: [{ type: "notification", content: "hello", error: bigError }]
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

  it("outputs detail suppresses ordinary node/edge events but retains outputs and errors", async () => {
    const active = makeActive({
      jobId: "J7",
      nodes: [
        { id: "worker", type: "custom.Worker" },
        { id: "out", type: "nodetool.output.Output" }
      ],
      messages: [
        { type: "node_update", node_id: "worker", status: "running" },
        { type: "edge_update", edge_id: "edge", status: "active" },
        { type: "output_update", node_id: "out", value: 42 },
        {
          type: "node_update",
          node_id: "worker",
          status: "error",
          error: "boom"
        }
      ],
      executionOptions: { event_detail: "outputs" }
    });

    await streamTo(runner, active, Promise.resolve({ status: "completed" }));
    const frames = decodeAll(ws);
    expect(
      frames.some((m) => m.type === "node_update" && m.status === "running")
    ).toBe(false);
    expect(frames.some((m) => m.type === "edge_update")).toBe(false);
    expect(
      frames.some((m) => m.type === "output_update" && m.value === 42)
    ).toBe(true);
    expect(
      frames.some((m) => m.type === "node_update" && m.status === "error")
    ).toBe(true);
  });

  it("outputs detail also normalizes the authoritative final outputs", async () => {
    const rawImage = {
      type: "image",
      data: new Uint8Array([1, 2, 3])
    };
    const normalizedImage = {
      type: "image",
      uri: "/api/storage/temp/sdk-image.png"
    };
    const active = makeActive({
      jobId: "J7-MEDIA",
      nodes: [{ id: "out", type: "nodetool.output.Output" }],
      messages: [
        { type: "output_update", node_id: "out", value: rawImage }
      ],
      executionOptions: { event_detail: "outputs" }
    });
    active.context.normalizeOutputValue.mockImplementation(
      async (value: unknown) => value === rawImage ? normalizedImage : value
    );

    await streamTo(
      runner,
      active,
      Promise.resolve({
        status: "completed",
        outputs: { image: [rawImage] }
      })
    );

    const terminal = decodeAll(ws).find(
      (message) =>
        message.type === "job_update" && message.status === "completed"
    );
    expect((terminal?.result as any).outputs).toEqual({
      image: [normalizedImage]
    });
  });

  it("terminal detail emits only lifecycle/errors and normalizes final outputs", async () => {
    const active = makeActive({
      jobId: "J8",
      nodes: [
        { id: "worker", type: "custom.Worker" },
        { id: "out", type: "nodetool.output.Output" }
      ],
      messages: [
        { type: "node_update", node_id: "worker", status: "completed" },
        { type: "output_update", node_id: "out", value: "streamed" }
      ],
      executionOptions: { event_detail: "terminal" }
    });

    await streamTo(
      runner,
      active,
      Promise.resolve({ status: "completed", outputs: { out: ["final"] } })
    );
    const frames = decodeAll(ws);
    expect(frames.some((m) => m.type === "node_update")).toBe(false);
    expect(frames.some((m) => m.type === "output_update")).toBe(false);
    const terminal = frames.find(
      (m) => m.type === "job_update" && m.status === "completed"
    );
    expect((terminal?.result as any).outputs).toEqual({ out: ["final"] });
    expect(active.context.normalizeOutputValue).toHaveBeenCalledWith("final");
  });
});

describe("WebSocketClientSession run_job — terminal persistence", () => {
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

  it("session-scoped execution does not write a final Job status", async () => {
    await seedJob("SESSION");
    const active = makeActive({
      jobId: "SESSION",
      workflowId: "wf",
      messages: [],
      executionOptions: { persistence: "session" }
    });

    await streamTo(runner, active, Promise.resolve({ status: "completed" }));

    const job = await Job.get<Job>("SESSION");
    expect(job?.status).toBe("running");
  });

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

describe("WebSocketClientSession run_job — provider cost", () => {
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
            unit: "USD",
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

describe("WebSocketClientSession run_job — generation autosave", () => {
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
    const runner = new WebSocketClientSession({
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

  it("temporary asset mode relays generation output without autosaving it", async () => {
    const runner = new WebSocketClientSession({
      resolveExecutor,
      getNodeMetadata: () =>
        ({
          auto_save_asset: true,
          outputs: [{ name: "image", type: { type: "image" } }],
          primary_output: "image"
        }) as never
    });
    await runner.connect(ws);
    const imageValue: Record<string, unknown> = {
      type: "image",
      data: Buffer.from([5, 6, 7, 8]).toString("base64")
    };
    const active = makeActive({
      jobId: "GEN-TEMP",
      workflowId: "wf",
      nodes: [{ id: "g1", type: "fal.Image" }],
      messages: [
        {
          type: "generation_complete",
          node_id: "g1",
          outputs: { image: imageValue }
        }
      ],
      executionOptions: { asset_persistence: "temporary" }
    });

    await streamTo(runner, active, Promise.resolve({ status: "completed" }));
    expect(imageValue.asset_id).toBeUndefined();
    expect(imageValue.uri).toBeUndefined();
    expect(decodeAll(ws).some((m) => m.type === "generation_complete")).toBe(
      true
    );
    await runner.disconnect();
  });
});

describe("WebSocketClientSession run_job — queue path", () => {
  let ws: MockWebSocket;
  let runner: WebSocketClientSession;

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
      asAny(runner).jobs.registerJob(`busy-${i}`, {
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
    runner = new WebSocketClientSession({ resolveExecutor });
    await runner.connect(ws);
  });

  afterEach(async () => {
    await runner.disconnect();
  });

  it("queues a run when the global concurrency cap is reached", async () => {
    fillSlots(4); // default MAX_CONCURRENT_JOBS
    await runner.jobs.runJob({ job_id: "Q1", workflow_id: "wf", graph });
    // enqueueJob sends the `queued` frame fire-and-forget; let it flush.
    await new Promise((r) => setTimeout(r, 10));
    expect(asAny(runner).jobs.jobQueue.size).toBe(1);
    const queued = decodeAll(ws).find(
      (m) =>
        m.type === "job_update" && m.status === "queued" && m.job_id === "Q1"
    );
    expect(queued).toBeDefined();
    expect(queued?.queue_position).toBe(1);
    // The queued run is persisted so it shows up in jobs.list.
    const job = await Job.get<Job>("Q1");
    expect(job?.status).toBe("queued");
  });

  it("queues a non-concurrent run when its workflow already has one in flight", async () => {
    asAny(runner).jobs.registerJob("live", {
      jobId: "live",
      workflowId: "wfx",
      status: "running",
      finished: false,
      runner: { cancel: vi.fn() }
    });
    await runner.jobs.runJob({ job_id: "Q2", workflow_id: "wfx", graph });
    await new Promise((r) => setTimeout(r, 10));
    expect(asAny(runner).jobs.jobQueue.size).toBe(1);
    const queued = decodeAll(ws).find(
      (m) => m.status === "queued" && m.job_id === "Q2"
    );
    expect(queued).toBeDefined();
  });

  it("cancelJob removes a still-queued run and announces it cancelled", async () => {
    fillSlots(4);
    await runner.jobs.runJob({ job_id: "Q3", workflow_id: "wf", graph });
    expect(asAny(runner).jobs.jobQueue.size).toBe(1);
    ws.sentBytes = [];
    ws.sentText = [];
    const res = await runner.jobs.cancelJob("Q3", "wf");
    expect(res.message).toBe("Queued job cancelled");
    expect(asAny(runner).jobs.jobQueue.size).toBe(0);
    const cancelled = decodeAll(ws).find(
      (m) =>
        m.type === "job_update" && m.status === "cancelled" && m.job_id === "Q3"
    );
    expect(cancelled).toBeDefined();
    const job = await Job.get<Job>("Q3");
    expect(job?.status).toBe("cancelled");
  });

  it("drainQueue starts a queued run once a slot frees up", async () => {
    fillSlots(4);
    const runProcess = vi.fn(async () => ({ output: "done" }));
    const drainRunner = new WebSocketClientSession({
      resolveExecutor: () => ({ process: runProcess })
    });
    await drainRunner.connect(ws);
    // Fill this runner's own slots, then enqueue a real runnable job.
    for (let i = 0; i < 4; i++) {
      asAny(drainRunner).jobs.registerJob(`b-${i}`, {
        jobId: `b-${i}`,
        workflowId: `bw-${i}`,
        status: "running",
        finished: false,
        runner: { cancel: vi.fn() }
      });
    }
    await drainRunner.jobs.runJob({ job_id: "DQ", workflow_id: "wfq", graph });
    expect(asAny(drainRunner).jobs.jobQueue.size).toBe(1);
    // Free every slot, then drain — the queued job must start.
    for (let i = 0; i < 4; i++) asAny(drainRunner).jobs.dropJob(`b-${i}`);
    asAny(drainRunner).jobs.drainQueue();
    // Wait for the queued job to leave the queue and start executing.
    for (let i = 0; i < 50 && asAny(drainRunner).jobs.jobQueue.size > 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(asAny(drainRunner).jobs.jobQueue.size).toBe(0);
    // Give the real run a moment to complete and drain.
    await new Promise((r) => setTimeout(r, 40));
    await drainRunner.disconnect();
  });
});

describe("WebSocketClientSession run_job — startJobInner branches", () => {
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

  it("uses the connection user and temporary media policy for an SDK session run", async () => {
    let outputContext: ProcessingContext | undefined;
    const runner = new WebSocketClientSession({
      resolveExecutor: (node) => {
        if (node.type === "nodetool.constant.String") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { output: inputs.value ?? "hello" };
            }
          };
        }
        return {
          async process(
            inputs: Record<string, unknown>,
            context?: ProcessingContext
          ) {
            outputContext = context;
            return { output: inputs.value ?? null };
          }
        };
      }
    });
    await runner.connect(ws, "connection-user");

    await runner.jobs.runJob({
      job_id: "SDK_TEMPORARY_SESSION",
      workflow_id: "wf",
      user_id: "",
      require_terminal_result: true,
      execution_options: {
        persistence: "session",
        event_detail: "outputs",
        asset_persistence: "temporary"
      },
      graph: {
        nodes: [
          ...graph.nodes,
          {
            id: "out",
            type: "nodetool.output.Output",
            name: "result",
            properties: { name: "result" }
          }
        ],
        edges: [
          {
            id: "edge",
            source: "n1",
            target: "out",
            sourceHandle: "output",
            targetHandle: "value",
            edge_type: "data"
          }
        ]
      }
    });

    for (
      let i = 0;
      i < 100 &&
      !decodeAll(ws).some(
        (message) =>
          message.type === "job_update" &&
          message.status === "completed" &&
          message.job_id === "SDK_TEMPORARY_SESSION"
      );
      i++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(outputContext?.userId).toBe("connection-user");
    expect(outputContext?.persistOutputAssets).toBe(false);
    expect(await Job.get("SDK_TEMPORARY_SESSION")).toBeNull();
    await runner.disconnect();
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
    const runner = new WebSocketClientSession({ resolveExecutor });
    await runner.connect(ws);
    await asAny(runner).jobs.startJob({
      job_id: "CANCELLED_START",
      workflow_id: "wf",
      graph
    });
    // The job was un-registered instead of executing.
    expect(runner.jobs.hasActiveJob("CANCELLED_START")).toBe(false);
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
    const runner = new WebSocketClientSession({ resolveExecutor });
    await runner.connect(ws);
    await asAny(runner).jobs.startJob({
      job_id: "QUEUED_START",
      workflow_id: "wf",
      graph
    });
    // Let the real run finish and persist its final status.
    for (
      let i = 0;
      i < 50 && runner.jobs.hasActiveJob("QUEUED_START");
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

describe("WebSocketClientSession run_job — emitBeforeRunFailure persistence", () => {
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
    const runner = new WebSocketClientSession({ resolveExecutor });
    await runner.connect(ws);
    await asAny(runner).jobs.emitBeforeRunFailure(
      "BRF",
      "wf",
      new Error("bridge down"),
      true
    );
    const failed = decodeAll(ws).find(
      (m) =>
        m.type === "job_update" && m.status === "failed" && m.job_id === "BRF"
    );
    expect(failed?.error).toBe("bridge down");
    const job = await Job.get<Job>("BRF");
    expect(job?.status).toBe("failed");
    await runner.disconnect();
  });
});
