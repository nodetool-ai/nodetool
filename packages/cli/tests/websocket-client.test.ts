/**
 * Tests for src/websocket-client.ts
 *
 * WebSocketChatClient: event routing, chat/inference streaming, job commands,
 * connect/disconnect lifecycle.
 */
import { describe, expect, it, vi } from "vitest";
import { WebSocketChatClient } from "../src/websocket-client.js";

// ─── Synchronous FakeWebSocket ───────────────────────────────────────────────

type WsListener = (...args: unknown[]) => void;

class FakeWebSocket {
  static OPEN = 1;
  readonly OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  private listeners: Record<string, WsListener[]> = {};

  constructor(public url: string) {}

  on(event: string, cb: WsListener) {
    this.listeners[event] ??= [];
    this.listeners[event]!.push(cb);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this._emit("close");
  }

  open() {
    this._emit("open");
  }
  error(err: Error) {
    this._emit("error", err);
  }

  /** Push a server-side message to the client. */
  push(msg: Record<string, unknown>) {
    this._emit("message", JSON.stringify(msg));
  }

  private _emit(event: string, ...args: unknown[]) {
    for (const cb of this.listeners[event] ?? []) cb(...args);
  }
}

// ─── Mock "ws" ────────────────────────────────────────────────────────────────

let currentFakeWs: FakeWebSocket;

vi.mock("ws", () => {
  const WebSocketCtor = vi.fn(function (this: FakeWebSocket, url: string) {
    currentFakeWs = new FakeWebSocket(url);
    Object.assign(this, currentFakeWs);
    return currentFakeWs;
  }) as unknown as typeof import("ws").default & { OPEN: number };
  WebSocketCtor.OPEN = 1;
  return { default: WebSocketCtor };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeConnectedClient(
  url = "ws://test"
): Promise<WebSocketChatClient> {
  const client = new WebSocketChatClient(url);
  const connectPromise = client.connect();
  // Allow connect()'s Promise constructor to run and register "open" listener
  await Promise.resolve();
  currentFakeWs.open();
  await connectPromise;
  return client;
}

// ─── connect / disconnect ─────────────────────────────────────────────────────

describe("WebSocketChatClient connect/disconnect", () => {
  it("resolves when the WebSocket emits open", async () => {
    const client = await makeConnectedClient("ws://localhost:7777/ws");
    expect(client).toBeInstanceOf(WebSocketChatClient);
    expect(currentFakeWs.url).toBe("ws://localhost:7777/ws");
  });

  it("rejects when the WebSocket emits error before open", async () => {
    const client = new WebSocketChatClient("ws://test");
    const connectPromise = client.connect();
    await Promise.resolve();
    currentFakeWs.error(new Error("connection refused"));
    await expect(connectPromise).rejects.toThrow("connection refused");
  });

  it("sends set_mode text after connection", async () => {
    await makeConnectedClient();
    const parsed = currentFakeWs.sent.map(
      (s) => JSON.parse(s) as Record<string, unknown>
    );
    const setMode = parsed.find((m) => m["command"] === "set_mode");
    expect(setMode).toBeDefined();
    expect((setMode!["data"] as Record<string, unknown>)["mode"]).toBe("text");
  });

  it("disconnect closes the underlying WebSocket", async () => {
    const client = await makeConnectedClient();
    client.disconnect();
    expect(currentFakeWs.readyState).toBe(3);
  });

  it("second disconnect is idempotent", async () => {
    const client = await makeConnectedClient();
    client.disconnect();
    expect(() => client.disconnect()).not.toThrow();
  });
});

// ─── ping auto-response ───────────────────────────────────────────────────────

describe("WebSocketChatClient ping handling", () => {
  it("replies to server pings with a pong", async () => {
    const client = await makeConnectedClient();
    currentFakeWs.push({ type: "ping" });
    const pong = currentFakeWs.sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((m) => m["type"] === "pong");
    expect(pong).toBeDefined();
  });
});

// ─── chat event streaming ─────────────────────────────────────────────────────

describe("WebSocketChatClient.chat", () => {
  it("yields chunk events and terminates on done-chunk", async () => {
    const client = await makeConnectedClient();
    const gen = client.chat("hello", "t1", "gpt-4o", "openai");

    const p = gen.next();
    currentFakeWs.push({ type: "chunk", content: "Hello" });
    expect((await p).value).toMatchObject({ type: "chunk", content: "Hello" });

    const doneP = gen.next();
    currentFakeWs.push({ type: "chunk", content: "", done: true });
    expect((await doneP).value).toMatchObject({ type: "done" });
  });

  it("yields error event on error message", async () => {
    const client = await makeConnectedClient();
    const gen = client.chat("hi", "t1", "gpt-4o", "openai");
    const p = gen.next();
    currentFakeWs.push({ type: "error", message: "server error" });
    expect((await p).value).toMatchObject({
      type: "error",
      message: "server error"
    });
  });

  it("yields tool_call from assistant message with tool_calls", async () => {
    const client = await makeConnectedClient();
    const gen = client.chat("hi", "t1", "gpt-4o", "openai");

    // Push assistant message with tool_calls; the generator loops back without
    // yielding, then we push a done-chunk to get a yield.
    const p1 = gen.next();
    currentFakeWs.push({
      type: "message",
      role: "assistant",
      tool_calls: [{ id: "tc1", name: "read_file", args: { path: "a.txt" } }]
    });
    const r1 = await p1;

    let toolCallEvent: unknown;
    if ((r1.value as { type: string }).type === "tool_call") {
      toolCallEvent = r1.value;
    } else {
      // generator continued without yielding; push done chunk to get next yield
      const p2 = gen.next();
      currentFakeWs.push({ type: "chunk", content: "", done: true });
      const r2 = await p2;
      toolCallEvent = [r1.value, r2.value].find(
        (e) => (e as { type: string }).type === "tool_call"
      );
    }
    expect(toolCallEvent).toMatchObject({
      type: "tool_call",
      id: "tc1",
      name: "read_file"
    });
  });

  it("yields done when WebSocket closes mid-stream", async () => {
    const client = await makeConnectedClient();
    const gen = client.chat("hi", "t1", "gpt-4o", "openai");
    const p = gen.next();
    currentFakeWs.close();
    expect((await p).value).toMatchObject({ type: "done" });
  });

  it("yields output_update events", async () => {
    const client = await makeConnectedClient();
    const gen = client.chat("hi", "t1", "gpt-4o", "openai");
    const p = gen.next();
    currentFakeWs.push({
      type: "output_update",
      node_id: "n1",
      value: { text: "result" }
    });
    expect((await p).value).toMatchObject({
      type: "output_update",
      node_id: "n1"
    });
  });

  it("yields done on job_update event", async () => {
    const client = await makeConnectedClient();
    const gen = client.chat("hi", "t1", "gpt-4o", "openai");
    const p = gen.next();
    currentFakeWs.push({ type: "job_update", status: "completed" });
    expect((await p).value).toMatchObject({ type: "done" });
  });

  it("treats typeless messages with error field as error events", async () => {
    const client = await makeConnectedClient();
    const gen = client.chat("hi", "t1", "gpt-4o", "openai");
    const p = gen.next();
    currentFakeWs.push({ error: "internal server error" });
    expect((await p).value).toMatchObject({
      type: "error",
      message: "internal server error"
    });
  });

  it("ignores non-content events like system_stats", async () => {
    const client = await makeConnectedClient();
    const gen = client.chat("hi", "t1", "gpt-4o", "openai");
    const p = gen.next();
    currentFakeWs.push({ type: "system_stats", cpu: 12 });
    currentFakeWs.push({ type: "chunk", content: "ok", done: true });
    expect((await p).value).toMatchObject({ type: "chunk" });
  });
});

// ─── inference event streaming ────────────────────────────────────────────────

describe("WebSocketChatClient.inference", () => {
  it("yields chunks and terminates on inference_done", async () => {
    const client = await makeConnectedClient();
    const gen = client.inference([], "gpt-4o", "openai");

    const p = gen.next();
    currentFakeWs.push({ type: "chunk", content: "hi" });
    expect((await p).value).toMatchObject({ type: "chunk", content: "hi" });

    const doneP = gen.next();
    currentFakeWs.push({ type: "inference_done" });
    expect((await doneP).value).toMatchObject({ type: "done" });
  });

  it("terminates on generation_stopped", async () => {
    const client = await makeConnectedClient();
    const gen = client.inference([], "gpt-4o", "openai");
    const p = gen.next();
    currentFakeWs.push({ type: "generation_stopped" });
    expect((await p).value).toMatchObject({ type: "done" });
  });

  it("yields error events from inference", async () => {
    const client = await makeConnectedClient();
    const gen = client.inference([], "gpt-4o", "openai");
    const p = gen.next();
    currentFakeWs.push({ type: "error", message: "inference failed" });
    expect((await p).value).toMatchObject({
      type: "error",
      message: "inference failed"
    });
  });

  it("yields tool_call events from inference", async () => {
    const client = await makeConnectedClient();
    const gen = client.inference([], "gpt-4o", "openai");
    const p = gen.next();
    currentFakeWs.push({
      type: "tool_call",
      id: "tc1",
      name: "search",
      args: { q: "test" }
    });
    expect((await p).value).toMatchObject({
      type: "tool_call",
      id: "tc1",
      name: "search"
    });
  });
});

// ─── job event streaming ──────────────────────────────────────────────────────

describe("WebSocketChatClient.runJob", () => {
  it("yields node_update, output_update, node_progress, job_update, then done", async () => {
    const client = await makeConnectedClient();
    const gen = client.runJob({ workflowId: "wf1" });

    let p = gen.next();
    currentFakeWs.push({
      type: "node_update",
      node_id: "n1",
      status: "running"
    });
    expect((await p).value).toMatchObject({
      type: "node_update",
      node_id: "n1"
    });

    p = gen.next();
    currentFakeWs.push({
      type: "node_progress",
      node_id: "n1",
      progress: 50,
      total: 100
    });
    expect((await p).value).toMatchObject({
      type: "node_progress",
      progress: 50,
      total: 100
    });

    p = gen.next();
    currentFakeWs.push({
      type: "output_update",
      node_id: "n1",
      value: { text: "hi" }
    });
    expect((await p).value).toMatchObject({
      type: "output_update",
      value: { text: "hi" }
    });

    p = gen.next();
    currentFakeWs.push({
      type: "job_update",
      status: "completed",
      job_id: "j1"
    });
    expect((await p).value).toMatchObject({
      type: "job_update",
      status: "completed"
    });

    expect((await gen.next()).value).toMatchObject({ type: "done" });
  });

  it("terminates early on error event", async () => {
    const client = await makeConnectedClient();
    const gen = client.runJob({ workflowId: "wf1" });
    const p = gen.next();
    currentFakeWs.push({ type: "error", message: "workflow failed" });
    expect((await p).value).toMatchObject({
      type: "error",
      message: "workflow failed"
    });
  });

  it("sends run_job command with workflow_id", async () => {
    const client = await makeConnectedClient();
    const gen = client.runJob({ workflowId: "wf42", params: { key: "val" } });
    const p = gen.next();
    currentFakeWs.push({ type: "job_update", status: "completed" });
    await p;

    const runCmd = currentFakeWs.sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((m) => m["command"] === "run_job");
    expect(runCmd).toBeDefined();
    expect((runCmd!["data"] as Record<string, unknown>)["workflow_id"]).toBe(
      "wf42"
    );
  });
});

// ─── reconnectJob / resumeJob ─────────────────────────────────────────────────

describe("WebSocketChatClient.reconnectJob and resumeJob", () => {
  it("reconnectJob sends reconnect_job command", async () => {
    const client = await makeConnectedClient();
    const gen = client.reconnectJob("job-99");
    const p = gen.next();
    currentFakeWs.push({ type: "job_update", status: "completed" });
    await p;

    const cmd = currentFakeWs.sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((m) => m["command"] === "reconnect_job");
    expect(cmd).toBeDefined();
    expect((cmd!["data"] as Record<string, unknown>)["job_id"]).toBe("job-99");
  });

  it("resumeJob sends resume_job command", async () => {
    const client = await makeConnectedClient();
    const gen = client.resumeJob("job-88");
    const p = gen.next();
    currentFakeWs.push({ type: "job_update", status: "completed" });
    await p;

    const cmd = currentFakeWs.sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((m) => m["command"] === "resume_job");
    expect(cmd).toBeDefined();
    expect((cmd!["data"] as Record<string, unknown>)["job_id"]).toBe("job-88");
  });
});

// ─── command methods ──────────────────────────────────────────────────────────

describe("WebSocketChatClient command methods", () => {
  it("cancelJob sends cancel_job with job_id", async () => {
    const client = await makeConnectedClient();
    client.cancelJob("job-123");
    const cmd = currentFakeWs.sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((m) => m["command"] === "cancel_job");
    expect(cmd).toBeDefined();
    expect((cmd!["data"] as Record<string, unknown>)["job_id"]).toBe("job-123");
  });

  it("getStatus with job_id includes job_id", async () => {
    const client = await makeConnectedClient();
    client.getStatus("job-456");
    const cmd = currentFakeWs.sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((m) => m["command"] === "get_status");
    expect((cmd!["data"] as Record<string, unknown>)["job_id"]).toBe("job-456");
  });

  it("getStatus without job_id sends empty data", async () => {
    const client = await makeConnectedClient();
    client.getStatus();
    const cmd = currentFakeWs.sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((m) => m["command"] === "get_status");
    expect((cmd!["data"] as Record<string, unknown>)["job_id"]).toBeUndefined();
  });

  it("stop with threadId includes thread_id", async () => {
    const client = await makeConnectedClient();
    client.stop("thread-abc");
    const cmd = currentFakeWs.sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((m) => m["command"] === "stop");
    expect((cmd!["data"] as Record<string, unknown>)["thread_id"]).toBe(
      "thread-abc"
    );
  });

  it("stop without threadId omits thread_id", async () => {
    const client = await makeConnectedClient();
    client.stop();
    const cmd = currentFakeWs.sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((m) => m["command"] === "stop");
    expect(
      (cmd!["data"] as Record<string, unknown>)["thread_id"]
    ).toBeUndefined();
  });
});
