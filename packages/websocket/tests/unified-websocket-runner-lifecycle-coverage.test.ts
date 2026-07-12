import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pack, unpack } from "msgpackr";
import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/unified-websocket-runner.js";
import { resetEnvironment } from "@nodetool-ai/config";
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
    if (!next) {
      return { type: "websocket.disconnect" };
    }
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

/** Decode everything sent over the wire (both binary and text) into objects. */
function decodeAll(ws: MockWebSocket): Record<string, unknown>[] {
  const binary = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
  const text = ws.sentText.map((t) => JSON.parse(t) as Record<string, unknown>);
  return [...binary, ...text];
}

const asAny = (r: UnifiedWebSocketRunner) => r as unknown as Record<string, any>;

describe("UnifiedWebSocketRunner lifecycle — handleCommand dispatch guards", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;

  beforeEach(async () => {
    await initTestDb();
    ws = new MockWebSocket();
    runner = new UnifiedWebSocketRunner({ resolveExecutor });
  });

  it("clear_models returns the managed-by-provider message", async () => {
    const res = await runner.handleCommand({ command: "clear_models", data: {} });
    expect(res?.message).toContain("Model clearing");
  });

  it("reconnect_job / resume_job / cancel_job require a job_id", async () => {
    expect(
      (await runner.handleCommand({ command: "reconnect_job", data: {} }))?.error
    ).toBe("job_id is required");
    expect(
      (await runner.handleCommand({ command: "resume_job", data: {} }))?.error
    ).toBe("job_id is required");
    expect(
      (await runner.handleCommand({ command: "cancel_job", data: {} }))?.error
    ).toBe("job_id is required");
  });

  it("stream_input reports missing job, missing active context, and blank input", async () => {
    expect(
      (await runner.handleCommand({ command: "stream_input", data: {} }))?.error
    ).toBe("job_id is required");
    expect(
      (
        await runner.handleCommand({
          command: "stream_input",
          data: { job_id: "nope", input: "x" }
        })
      )?.error
    ).toBe("No active job/context");
    // Active job present but a blank input name is rejected before touching it.
    asAny(runner).activeJobs.set("J", {
      jobId: "J",
      workflowId: "wf",
      status: "running",
      runner: { pushInputValue: vi.fn() }
    });
    expect(
      (
        await runner.handleCommand({
          command: "stream_input",
          data: { job_id: "J", input: "   " }
        })
      )?.error
    ).toBe("Invalid input name");
  });

  it("stream_input pushes a value and surfaces executor errors", async () => {
    const pushInputValue = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("push boom"));
    asAny(runner).activeJobs.set("J", {
      jobId: "J",
      workflowId: "wf",
      status: "running",
      runner: { pushInputValue }
    });
    const ok = await runner.handleCommand({
      command: "stream_input",
      data: { job_id: "J", input: "in", value: 7, handle: "h" }
    });
    expect(ok?.message).toBe("Input item streamed");
    expect(pushInputValue).toHaveBeenCalledWith("in", 7, "h");

    const err = await runner.handleCommand({
      command: "stream_input",
      data: { job_id: "J", input: "in", value: 1 }
    });
    expect(err?.error).toBe("push boom");
  });

  it("end_input_stream guards and finishes the stream", async () => {
    expect(
      (await runner.handleCommand({ command: "end_input_stream", data: {} }))
        ?.error
    ).toBe("job_id is required");
    expect(
      (
        await runner.handleCommand({
          command: "end_input_stream",
          data: { job_id: "nope", input: "x" }
        })
      )?.error
    ).toBe("No active job/context");

    const finishInputStream = vi.fn();
    asAny(runner).activeJobs.set("J", {
      jobId: "J",
      workflowId: "wf",
      status: "running",
      runner: { finishInputStream }
    });
    expect(
      (
        await runner.handleCommand({
          command: "end_input_stream",
          data: { job_id: "J", input: "  " }
        })
      )?.error
    ).toBe("Invalid input name");
    const ok = await runner.handleCommand({
      command: "end_input_stream",
      data: { job_id: "J", input: "in", handle: "h" }
    });
    expect(ok?.message).toBe("Input stream ended");
    expect(finishInputStream).toHaveBeenCalledWith("in", "h");
  });

  it("end_input_stream surfaces a thrown finishInputStream error", async () => {
    asAny(runner).activeJobs.set("J", {
      jobId: "J",
      workflowId: "wf",
      status: "running",
      runner: {
        finishInputStream: () => {
          throw new Error("finish boom");
        }
      }
    });
    const err = await runner.handleCommand({
      command: "end_input_stream",
      data: { job_id: "J", input: "in" }
    });
    expect(err?.error).toBe("finish boom");
  });

  it("update_node_properties validates inputs and reports applied", async () => {
    expect(
      (await runner.handleCommand({ command: "update_node_properties", data: {} }))
        ?.error
    ).toBe("job_id is required");
    expect(
      (
        await runner.handleCommand({
          command: "update_node_properties",
          data: { job_id: "J" }
        })
      )?.error
    ).toBe("node_id is required");
    expect(
      (
        await runner.handleCommand({
          command: "update_node_properties",
          data: { job_id: "J", node_id: "n1", properties: 42 }
        })
      )?.error
    ).toBe("properties must be an object");
    // No active job → applied is false (a miss is not an error).
    expect(
      (
        await runner.handleCommand({
          command: "update_node_properties",
          data: { job_id: "J", node_id: "n1", properties: {} }
        })
      )?.applied
    ).toBe(false);
    // Active job → delegates to the runner and returns its boolean.
    const updateNodeProperties = vi.fn().mockReturnValue(true);
    asAny(runner).activeJobs.set("J", {
      jobId: "J",
      workflowId: "wf",
      status: "running",
      runner: { updateNodeProperties }
    });
    const res = await runner.handleCommand({
      command: "update_node_properties",
      data: { job_id: "J", node_id: "n1", properties: { gain: 0.5 } }
    });
    expect(res?.applied).toBe(true);
    expect(updateNodeProperties).toHaveBeenCalledWith("n1", { gain: 0.5 });
  });

  it("set_mode rejects an invalid mode and accepts binary/text", async () => {
    expect(
      (await runner.handleCommand({ command: "set_mode", data: { mode: "xml" } }))
        ?.error
    ).toBe("mode must be binary or text");
    expect(runner.mode).toBe("binary");
    await runner.handleCommand({ command: "set_mode", data: { mode: "text" } });
    expect(runner.mode).toBe("text");
    await runner.handleCommand({ command: "set_mode", data: { mode: "binary" } });
    expect(runner.mode).toBe("binary");
  });

  it("returns 'Unknown command' for an unrecognized command", async () => {
    const res = await runner.handleCommand({
      command: "totally_made_up" as never,
      data: {}
    });
    expect(res?.error).toBe("Unknown command");
  });

  it("RPC commands throw when required deps are not configured", async () => {
    await expect(
      runner.handleCommand({ command: "list_workflows", data: {} })
    ).rejects.toThrow(/RPC commands require/);
    await expect(
      runner.handleCommand({ command: "get_node", data: { node_type: "x" } })
    ).rejects.toThrow(/RPC commands require/);
  });

  it("generate_media / transcribe_audio require a request_id (runRpc guard)", async () => {
    // These dispatch straight into runRpc without a tRPC caller, so the
    // request_id guard is reachable without providers or a DB.
    const gm = await runner.handleCommand({
      command: "generate_media",
      data: { prompt: "hi" }
    });
    expect(gm?.error).toBe("request_id is required for RPC commands");
    const ta = await runner.handleCommand({
      command: "transcribe_audio",
      data: { asset_id: "a" }
    });
    expect(ta?.error).toBe("request_id is required for RPC commands");
  });

  it("stop cancels the active job and scoped waiters", async () => {
    await runner.connect(ws);
    const cancel = vi.fn();
    const active = {
      jobId: "J",
      workflowId: "wf",
      status: "running",
      finished: false,
      runner: { cancel }
    };
    asAny(runner).activeJobs.set("J", active);
    const cancelToolScope = vi.spyOn(asAny(runner).toolBridge, "cancelScope");
    const cancelApprovalScope = vi.spyOn(
      asAny(runner).approvalBridge,
      "cancelScope"
    );
    const seqBefore = asAny(runner).chatRequestSeq;

    const res = await runner.handleCommand({
      command: "stop",
      data: { job_id: "J", thread_id: "T" }
    });
    expect(res?.message).toBe("Stop command processed");
    expect(res?.job_id).toBe("J");
    expect(res?.thread_id).toBe("T");
    expect(cancel).toHaveBeenCalledOnce();
    expect(active.finished).toBe(false);
    expect(active.status).toBe("cancelled");
    expect(cancelToolScope).toHaveBeenCalledWith("T");
    expect(cancelApprovalScope).toHaveBeenCalledWith("T");
    expect(asAny(runner).chatRequestSeq).toBe(seqBefore + 1);

    const stopped = decodeAll(ws).find((m) => m.type === "generation_stopped");
    expect(stopped).toBeDefined();
    expect(stopped?.job_id).toBe("J");
    await runner.disconnect();
  });

  it("chat_message rejects a missing thread_id", async () => {
    const res = await runner.handleCommand({
      command: "chat_message",
      data: { content: "hi" }
    });
    expect(res?.error).toContain("thread_id is required");
  });
});

describe("UnifiedWebSocketRunner lifecycle — job status/cancel/reconnect", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;

  beforeEach(async () => {
    await initTestDb();
    ws = new MockWebSocket();
    runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
  });

  afterEach(async () => {
    await runner.disconnect();
  });

  it("getStatus reports not_found, a single job, and the active list", async () => {
    expect(runner.getStatus("missing")).toEqual({
      status: "not_found",
      job_id: "missing"
    });
    asAny(runner).activeJobs.set("J", {
      jobId: "J",
      workflowId: "wf",
      status: "running"
    });
    expect(runner.getStatus("J")).toEqual({
      status: "running",
      job_id: "J",
      workflow_id: "wf"
    });
    const all = runner.getStatus() as { active_jobs: Array<{ job_id: string }> };
    expect(all.active_jobs.map((j) => j.job_id)).toContain("J");
  });

  it("cancelJob rejects an empty id and an unknown job", async () => {
    expect((await runner.cancelJob("")).error).toBe("No job_id provided");
    const res = await runner.cancelJob("ghost", "wf");
    expect(res.error).toBe("Job not found or already completed");
    expect(res.job_id).toBe("ghost");
    expect(res.workflow_id).toBe("wf");
  });

  it("cancelJob on an active job cancels the runner and announces it", async () => {
    const cancel = vi.fn();
    asAny(runner).activeJobs.set("J", {
      jobId: "J",
      workflowId: "wf-a",
      status: "running",
      finished: false,
      runner: { cancel }
    });
    const res = await runner.cancelJob("J");
    expect(res.message).toBe("Job cancellation requested");
    expect(cancel).toHaveBeenCalledOnce();
    // finished is intentionally NOT flipped so the runner drains its messages.
    expect(asAny(runner).activeJobs.get("J").finished).toBe(false);
    const cancelled = decodeAll(ws).filter(
      (m) => m.type === "job_update" && m.status === "cancelled" && m.job_id === "J"
    );
    expect(cancelled.length).toBeGreaterThan(0);
  });

  it("reconnectJob reports an unknown job and replays active statuses", async () => {
    await runner.reconnectJob("missing");
    expect(decodeAll(ws)).toContainEqual(
      expect.objectContaining({
        type: "job_update",
        job_id: "missing",
        error: "Job missing not found"
      })
    );
    asAny(runner).activeJobs.set("J", {
      jobId: "J",
      workflowId: "wf",
      status: "running",
      context: {
        getNodeStatuses: () => ({
          n1: { type: "node_update", node_id: "n1", status: "completed" }
        }),
        getEdgeStatuses: () => ({
          e1: { type: "edge_update", edge_id: "e1", status: "message_sent" }
        })
      }
    });
    ws.sentBytes = [];
    await runner.reconnectJob("J", "wf-override");
    const sent = decodeAll(ws);
    expect(
      sent.some(
        (m) =>
          m.type === "job_update" &&
          m.job_id === "J" &&
          m.workflow_id === "wf-override"
      )
    ).toBe(true);
    expect(
      sent.some((m) => m.type === "node_update" && m.node_id === "n1")
    ).toBe(true);
    expect(
      sent.some((m) => m.type === "edge_update" && m.edge_id === "e1")
    ).toBe(true);
    await expect(runner.resumeJob("missing")).resolves.toBeUndefined();
  });
});

describe("UnifiedWebSocketRunner lifecycle — sendMessage encoding", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;

  beforeEach(() => {
    ws = new MockWebSocket();
    runner = new UnifiedWebSocketRunner({ resolveExecutor });
  });

  it("is a no-op when no websocket is attached", async () => {
    await expect(
      runner.sendMessage({ type: "x" })
    ).resolves.toBeUndefined();
    expect(ws.sentBytes).toHaveLength(0);
  });

  it("drops messages once the client is disconnected", async () => {
    await runner.connect(ws);
    ws.clientState = "disconnected";
    await runner.sendMessage({ type: "late" });
    expect(ws.sentBytes).toHaveLength(0);
    ws.clientState = "connected";
    ws.applicationState = "disconnected";
    await runner.sendMessage({ type: "late2" });
    expect(ws.sentBytes).toHaveLength(0);
    ws.applicationState = "connected";
    await runner.disconnect();
  });

  it("serializes Uint8Array and Date to JSON-safe forms in text mode", async () => {
    await runner.connect(ws);
    runner.mode = "text";
    const when = new Date("2020-01-02T03:04:05.000Z");
    await runner.sendMessage({
      type: "blob",
      bytes: new Uint8Array([1, 2, 3]),
      when,
      nested: { inner: new Uint8Array([9]) }
    });
    const out = JSON.parse(ws.sentText[0]) as Record<string, any>;
    expect(out.bytes).toEqual([1, 2, 3]);
    expect(out.when).toBe("2020-01-02T03:04:05.000Z");
    expect(out.nested.inner).toEqual([9]);
    await runner.disconnect();
  });

  it("encodes a native Float32Array audio chunk to base64 f32le on the wire", async () => {
    await runner.connect(ws);
    const samples = new Float32Array([0.25, -0.5, 1]);
    await runner.sendMessage({
      type: "chunk",
      content: samples,
      content_metadata: { channels: 1 }
    });
    const out = unpack(ws.sentBytes[0]) as Record<string, any>;
    expect(typeof out.content).toBe("string");
    expect(out.content_metadata.encoding).toBe("f32le");
    expect(out.content_metadata.channels).toBe(1);
    // Round-trips back to the original samples.
    const buf = Buffer.from(out.content as string, "base64");
    const decoded = new Float32Array(
      buf.buffer,
      buf.byteOffset,
      buf.byteLength / 4
    );
    expect(Array.from(decoded)).toEqual([0.25, -0.5, 1]);
    await runner.disconnect();
  });

  it("encodes a native audio chunk carried under the value key", async () => {
    await runner.connect(ws);
    await runner.sendMessage({
      type: "output_update",
      value: { type: "chunk", content: new Float32Array([1, 2]) }
    });
    const out = unpack(ws.sentBytes[0]) as Record<string, any>;
    expect(typeof out.value.content).toBe("string");
    expect(out.value.content_metadata.encoding).toBe("f32le");
    await runner.disconnect();
  });
});

describe("UnifiedWebSocketRunner lifecycle — receiveMessages dispatch", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;

  beforeEach(async () => {
    await initTestDb();
    ws = new MockWebSocket();
    runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
  });

  it("stores only well-formed entries from a client_tools_manifest", async () => {
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        type: "client_tools_manifest",
        tools: [
          { name: "good_tool", description: "ok" },
          { description: "no name" },
          "not an object",
          { name: 123 }
        ]
      })
    });
    ws.queue.push({ type: "websocket.disconnect" });
    await runner.receiveMessages();
    const manifest = asAny(runner).clientToolsManifest as Record<string, unknown>;
    expect(Object.keys(manifest)).toEqual(["good_tool"]);
  });

  it("routes tool_result frames to the ToolBridge waiter", async () => {
    const waiter = asAny(runner).toolBridge.createWaiter("tc1", 0) as Promise<
      Record<string, unknown>
    >;
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        type: "tool_result",
        tool_call_id: "tc1",
        result: { ok: true }
      })
    });
    ws.queue.push({ type: "websocket.disconnect" });
    await runner.receiveMessages();
    await expect(waiter).resolves.toMatchObject({ result: { ok: true } });
  });

  it("routes approval responses to the approval bridge", async () => {
    const w1 = asAny(runner).approvalBridge.createWaiter("ap1", 0) as Promise<
      Record<string, unknown>
    >;
    const w2 = asAny(runner).approvalBridge.createWaiter("ap2", 0) as Promise<
      Record<string, unknown>
    >;
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        type: "tool_approval_response",
        approval_id: "ap1",
        decision: "allow"
      })
    });
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        type: "plan_approval_response",
        approval_id: "ap2",
        decision: "approve"
      })
    });
    ws.queue.push({ type: "websocket.disconnect" });
    await runner.receiveMessages();
    await expect(w1).resolves.toMatchObject({ decision: "allow" });
    await expect(w2).resolves.toMatchObject({ decision: "approve" });
  });

  it("emits invalid_message when a frame has neither type nor command", async () => {
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({ foo: "bar" })
    });
    ws.queue.push({ type: "websocket.disconnect" });
    await runner.receiveMessages();
    const err = decodeAll(ws).find((m) => m.error === "invalid_message");
    expect(err).toBeDefined();
    await runner.disconnect();
  });

  it("wraps a throwing command in an invalid_command reply", async () => {
    // list_workflows throws synchronously (no RPC deps), and the receive loop
    // must convert that into an invalid_command frame rather than crash.
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({ command: "list_workflows", data: {} })
    });
    ws.queue.push({ type: "websocket.disconnect" });
    await runner.receiveMessages();
    const err = decodeAll(ws).find((m) => m.error === "invalid_command");
    expect(err).toBeDefined();
    expect(String(err?.details)).toMatch(/RPC commands require/);
    await runner.disconnect();
  });
});

describe("UnifiedWebSocketRunner lifecycle — runRpc frame", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;

  beforeEach(async () => {
    ws = new MockWebSocket();
    runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
  });

  afterEach(async () => {
    await runner.disconnect();
  });

  it("sends an rpc_response with the result and returns null on success", async () => {
    const ret = await asAny(runner).runRpc(
      { command: "list_workflows", request_id: "r1", data: {} },
      async () => ({ items: [1, 2] })
    );
    expect(ret).toBeNull();
    const resp = decodeAll(ws).find((m) => m.type === "rpc_response");
    expect(resp?.request_id).toBe("r1");
    expect(resp?.result).toEqual({ items: [1, 2] });
  });

  it("maps a thrown apiCode into the rpc_response error payload", async () => {
    const ret = await asAny(runner).runRpc(
      { command: "get_workflow", request_id: "r2", data: {} },
      async () => {
        throw Object.assign(new Error("nope"), {
          code: "BAD_REQUEST",
          cause: { apiCode: "NOT_FOUND" }
        });
      }
    );
    expect(ret).toBeNull();
    const resp = decodeAll(ws).find((m) => m.type === "rpc_response") as any;
    expect(resp.error.code).toBe("NOT_FOUND");
    expect(resp.error.apiCode).toBe("NOT_FOUND");
    expect(resp.error.trpcCode).toBe("BAD_REQUEST");
    expect(resp.error.message).toBe("nope");
  });

  it("rejects an RPC command missing a request_id", async () => {
    const ret = await asAny(runner).runRpc(
      { command: "list_assets", data: {} },
      async () => ({})
    );
    expect(ret?.error).toBe("request_id is required for RPC commands");
  });
});

describe("UnifiedWebSocketRunner lifecycle — private graph/type helpers", () => {
  const runner = new UnifiedWebSocketRunner({ resolveExecutor });

  it("normalizeGraph lifts data→properties and normalizes edge types", () => {
    const out = asAny(runner).normalizeGraph({
      nodes: [
        { id: "a", type: "T", data: { x: 1 } },
        { id: "b", type: "T", properties: { y: 2 } }
      ],
      edges: [
        { source: "a", target: "b", type: "control" },
        { source: "a", target: "b", edge_type: "data" },
        { source: "a", target: "b", type: "weird" }
      ]
    });
    expect(out.nodes[0]).toEqual({ id: "a", type: "T", properties: { x: 1 } });
    expect(out.nodes[0]).not.toHaveProperty("data");
    expect(out.nodes[1]).toEqual({ id: "b", type: "T", properties: { y: 2 } });
    expect(out.edges[0].edge_type).toBe("control");
    expect(out.edges[1].edge_type).toBe("data");
    // Unknown edge type collapses to "data" and the raw `type` is stripped.
    expect(out.edges[2].edge_type).toBe("data");
    expect(out.edges[2]).not.toHaveProperty("type");
  });

  it("inferOutputType classifies primitives, arrays, and objects", () => {
    const infer = (v: unknown) => asAny(runner).inferOutputType(v);
    expect(infer(null)).toBe("any");
    expect(infer(undefined)).toBe("any");
    expect(infer("s")).toBe("str");
    expect(infer(3)).toBe("int");
    expect(infer(3.5)).toBe("float");
    expect(infer(true)).toBe("bool");
    expect(infer([1, 2])).toBe("list");
    expect(infer({ a: 1 })).toBe("dict");
  });

  it("extractTextContent flattens strings and text-content arrays", () => {
    const extract = (c: unknown, f?: string) =>
      asAny(runner).extractTextContent(c, f);
    expect(extract("hello")).toBe("hello");
    expect(
      extract([
        { type: "text", text: "a" },
        { type: "image", url: "x" },
        { type: "text", text: "b" }
      ])
    ).toBe("a b");
    // No text items → fallback.
    expect(extract([{ type: "image" }], "fb")).toBe("fb");
    expect(extract(42, "fb")).toBe("fb");
    expect(extract(undefined)).toBe("");
  });

  it("getRawGraph throws when neither graph nor workflow_id is supplied", () => {
    expect(() => asAny(runner).getRawGraph({})).toThrow(
      /workflow_id or graph is required/
    );
  });
});

describe("UnifiedWebSocketRunner lifecycle — run_job + beforeRunJob failure", () => {
  let ws: MockWebSocket;

  beforeEach(async () => {
    await initTestDb();
    ws = new MockWebSocket();
  });

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

  it("run_job command acknowledges with 'Job started'", async () => {
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
    const res = await runner.handleCommand({
      command: "run_job",
      data: { graph, params: {} }
    });
    expect(res?.message).toBe("Job started");
    await new Promise((r) => setTimeout(r, 20));
    await runner.disconnect();
  });

  it("emits a failed job_update when beforeRunJob throws", async () => {
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor,
      beforeRunJob: async () => {
        throw new Error("bridge down");
      }
    });
    await runner.connect(ws);
    await runner.handleCommand({
      command: "run_job",
      data: { job_id: "BR1", workflow_id: "wf", graph, params: {} }
    });
    const failed = decodeAll(ws).find(
      (m) => m.type === "job_update" && m.status === "failed" && m.job_id === "BR1"
    );
    expect(failed).toBeDefined();
    expect(failed?.error).toBe("bridge down");
    await runner.disconnect();
  });
});

describe("UnifiedWebSocketRunner lifecycle — disconnect cleanup", () => {
  it("cancels active job runners and closes the socket", async () => {
    await initTestDb();
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
    const cancel = vi.fn();
    asAny(runner).activeJobs.set("J", {
      jobId: "J",
      workflowId: "wf",
      status: "running",
      runner: { cancel }
    });
    await runner.disconnect();
    expect(cancel).toHaveBeenCalledOnce();
    expect(asAny(runner).activeJobs.size).toBe(0);
    expect(ws.closed).toBe(true);
    expect(runner.websocket).toBeNull();
  });
});
