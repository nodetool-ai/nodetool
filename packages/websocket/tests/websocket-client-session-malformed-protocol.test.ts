/**
 * Malformed-protocol corpus (RELIABILITY_ARCHITECTURE.md §5 journey 14,
 * Track B task B2): near-valid client frames — wrong field type, unknown
 * `type`, an oversized payload, truncated msgpack — must each get a
 * structured rejection without killing the connection or corrupting a
 * running job.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { pack, unpack } from "msgpackr";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";
import { resetEnvironment } from "@nodetool-ai/config";

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
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

function decodeAll(ws: MockWebSocket): Record<string, unknown>[] {
  return [
    ...ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>),
    ...ws.sentText.map((t) => JSON.parse(t) as Record<string, unknown>)
  ];
}

const resolveExecutor = () => ({
  async process() {
    return {};
  }
});

const KEY = "NODETOOL_WS_MAX_MESSAGE_BYTES";

describe("WebSocketClientSession malformed-protocol corpus", () => {
  let ws: MockWebSocket;
  let runner: WebSocketClientSession;

  beforeEach(async () => {
    resetEnvironment();
    delete process.env[KEY];
    ws = new MockWebSocket();
    runner = new WebSocketClientSession({ resolveExecutor });
    await runner.connect(ws);
  });

  afterEach(async () => {
    delete process.env[KEY];
    resetEnvironment();
    await runner.disconnect();
  });

  it("rejects a command with a wrong-typed field without dropping the connection", async () => {
    // `graph` must be an object with `nodes`/`edges` arrays — a string is a
    // "near-valid" frame: well-formed envelope, wrong payload shape.
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        command: "run_job",
        data: { graph: "not-a-graph", params: {} }
      })
    });
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({ type: "ping" })
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();

    const out = decodeAll(ws);
    const rejection = out.find((m) => m.error === "invalid_command");
    expect(rejection).toBeDefined();
    expect(String(rejection?.details)).toContain("run_job");

    // The bad frame never reached runJob: no job was registered.
    const status = runner.jobs.getStatus() as {
      active_jobs: Array<{ job_id: string }>;
    };
    expect(status.active_jobs).toHaveLength(0);

    // The connection is still alive — the ping right after it still gets a pong.
    expect(out.some((m) => m.type === "pong")).toBe(true);
  });

  it("accepts MessagePack nil in the C# SDK run_job envelope", async () => {
    const runJob = vi.spyOn(runner.jobs, "runJob").mockResolvedValue();
    ws.queue.push({
      type: "websocket.message",
      bytes: pack({
        command: "run_job",
        type: "run_job",
        request_id: null,
        data: {
          job_id: "csharp-job",
          workflow_id: "workflow-1",
          graph: null,
          params: null,
          execution_options: null
        }
      })
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();

    expect(runJob).toHaveBeenCalledOnce();
    expect(runJob).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: "csharp-job",
        workflow_id: "workflow-1",
        graph: null,
        params: null,
        execution_options: null
      })
    );
    const out = decodeAll(ws);
    expect(out.some((message) => message.error === "invalid_command")).toBe(false);
    expect(out).toContainEqual({
      message: "Job started",
      workflow_id: "workflow-1"
    });
  });

  it("rejects an unknown frame type without dropping the connection", async () => {
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({ type: "totally_unknown_frame_kind", foo: 1 })
    });
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({ type: "ping" })
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();

    const out = decodeAll(ws);
    expect(out.some((m) => m.error === "invalid_message")).toBe(true);
    expect(out.some((m) => m.type === "pong")).toBe(true);
  });

  it("rejects an oversized frame without dropping the connection", async () => {
    process.env[KEY] = "16";
    ws.queue.push({ type: "websocket.message", bytes: new Uint8Array(17) });
    // NODETOOL_WS_MAX_MESSAGE_BYTES only bounds inbound frames — reset it so
    // the ping reply and any later frame aren't clipped by the same cap.
    ws.queue.push({
      type: "websocket.message",
      bytes: pack({ type: "ping" })
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();

    const out = decodeAll(ws);
    expect(
      out.some(
        (m) => m.error === "invalid_frame" && /exceeds maximum size/.test(String(m.message))
      )
    ).toBe(true);
    // The loop kept reading after the oversized frame instead of dying with it.
    expect(out.some((m) => m.type === "pong")).toBe(true);
  });

  it("rejects truncated/corrupt msgpack without dropping the connection", async () => {
    const valid = pack({ type: "ping" });
    // Slice a valid msgpack frame mid-payload so it fails to decode.
    const truncated = valid.slice(0, Math.max(1, valid.length - 1));
    ws.queue.push({ type: "websocket.message", bytes: truncated });
    ws.queue.push({ type: "websocket.message", bytes: pack({ type: "ping" }) });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();

    const out = decodeAll(ws);
    expect(out.some((m) => m.error === "invalid_frame")).toBe(true);
    expect(out.some((m) => m.type === "pong")).toBe(true);
  });

  it("leaves a running job unaffected by malformed frames interleaved on the same connection", async () => {
    const graph = {
      nodes: [
        { id: "stream_input", type: "test.Input", name: "stream_input" },
        { id: "sink", type: "test.Sink", name: "sink" }
      ],
      edges: [
        {
          source: "stream_input",
          sourceHandle: "value",
          target: "sink",
          targetHandle: "value"
        }
      ]
    };

    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        command: "run_job",
        data: { job_id: "J-malformed-corpus", graph, params: {} }
      })
    });
    // Interleave the whole corpus while the job is active and awaiting its
    // streamed input.
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({ type: "totally_unknown_frame_kind" })
    });
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        command: "run_job",
        data: { graph: 12345 }
      })
    });
    const validPing = pack({ type: "ping" });
    ws.queue.push({
      type: "websocket.message",
      bytes: validPing.slice(0, validPing.length - 1)
    });
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        command: "stream_input",
        data: { job_id: "J-malformed-corpus", input: "stream_input", value: 7 }
      })
    });
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        command: "end_input_stream",
        data: { job_id: "J-malformed-corpus", input: "stream_input" }
      })
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();
    // Give the runner time to drain the queue and complete the job.
    await new Promise((r) => setTimeout(r, 20));

    const out = decodeAll(ws);
    // All three malformed frames were rejected...
    expect(out.filter((m) => typeof m.error === "string").length).toBeGreaterThanOrEqual(3);
    // ...yet the legitimate run_job/stream_input/end_input_stream commands on
    // the same connection all completed normally.
    expect(
      out.some((m) => m.message === "Job started" || m.job_id === "J-malformed-corpus")
    ).toBe(true);
    expect(out.some((m) => m.message === "Input item streamed")).toBe(true);
    expect(out.some((m) => m.message === "Input stream ended")).toBe(true);
    expect(
      out.some((m) => m.type === "job_update" && m.status === "completed")
    ).toBe(true);
  });
});
