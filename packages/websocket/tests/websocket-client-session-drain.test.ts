/**
 * What a connection does while the process is draining: an idle one closes at
 * once with 1012, one driving a turn closes when the turn settles, and a new
 * `chat_message` is refused before it is persisted — so the client's retry on
 * the machine that is staying is the only copy of the message.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { unpack } from "msgpackr";
import { initTestDb, Message } from "@nodetool-ai/models";
import { BaseProvider } from "@nodetool-ai/runtime";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";
import { chatTurnRegistry } from "../src/chat-turn-registry.js";
import { startDrain, _resetDrainForTest } from "../src/drain.js";
import { borrowedLoopBudgetMembers } from "./chat-turn-test-harness.js";

class MockWS implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  queue: Array<WebSocketReceiveFrame> = [];
  closes: Array<{ code?: number; reason?: string }> = [];
  async accept() {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return this.queue.shift() ?? { type: "websocket.disconnect" };
  }
  async sendBytes(data: Uint8Array) {
    this.sentBytes.push(data);
  }
  async sendText() {}
  async close(code?: number, reason?: string) {
    this.closes.push({ code, reason });
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

const noopExecutor = () => ({
  async process() {
    return {};
  }
});

function sentMsgs(ws: MockWS): Record<string, unknown>[] {
  return ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
}

/** Streams one chunk, then blocks until released or aborted. */
function gatedProvider() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  async function* generate(opts?: { signal?: AbortSignal }) {
    yield { type: "chunk" as const, content: "hello " };
    const aborted = new Promise<never>((_, reject) => {
      opts?.signal?.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true }
      );
    });
    await Promise.race([gate, aborted]);
    yield { type: "chunk" as const, content: "world" };
  }
  const provider = async () =>
    ({
      provider: "mock",
      generateMessages: generate,
      generateMessagesTraced: generate,
      async generateMessageTraced() {
        return {};
      },
      generateMessage: vi.fn(),
      hasToolSupport: async () => false,
      getAvailableLanguageModels: async () => [],
      getAvailableImageModels: async () => [],
      getAvailableVideoModels: async () => [],
      getAvailableTTSModels: async () => [],
      getAvailableASRModels: async () => [],
      getAvailableEmbeddingModels: async () => [],
      getContainerEnv: () => ({}),
      generateLoop: BaseProvider.prototype.generateLoop,
      ...borrowedLoopBudgetMembers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
  return { provider, release: () => release() };
}

describe("a connection while the process drains", () => {
  beforeEach(() => {
    initTestDb();
    _resetDrainForTest();
  });

  afterEach(() => {
    _resetDrainForTest();
  });

  it("closes an idle connection with 1012", async () => {
    const runner = new WebSocketClientSession({
      resolveExecutor: noopExecutor
    });
    const ws = new MockWS();
    await runner.connect(ws);

    startDrain();
    await vi.waitFor(() => {
      expect(ws.closes).toHaveLength(1);
    });
    expect(ws.closes[0].code).toBe(1012);
    await runner.disconnect();
  });

  it("closes a connection accepted after the drain started", async () => {
    startDrain();
    const runner = new WebSocketClientSession({
      resolveExecutor: noopExecutor
    });
    const ws = new MockWS();
    await runner.connect(ws);

    await vi.waitFor(() => {
      expect(ws.closes.map((c) => c.code)).toEqual([1012]);
    });
    await runner.disconnect();
  });

  it("keeps a connection with a running turn until the turn finishes", async () => {
    const threadId = `t-drain-${Date.now()}-${Math.random()}`;
    const { provider, release } = gatedProvider();
    const runner = new WebSocketClientSession({
      resolveExecutor: noopExecutor,
      resolveProvider: provider
    });
    const ws = new MockWS();
    await runner.connect(ws);
    await runner.handleCommand({
      command: "chat_message",
      data: { thread_id: threadId, content: "hi", provider: "mock", model: "m" }
    });
    await vi.waitFor(() => {
      expect(sentMsgs(ws).some((m) => m.type === "chunk")).toBe(true);
    });

    startDrain();
    // The turn is still running, so the socket stays open past several polls.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(ws.closes).toHaveLength(0);

    release();
    await vi.waitFor(() => {
      expect(chatTurnRegistry.get("1", threadId)?.status).toBe("finished");
    });
    await vi.waitFor(() => {
      expect(ws.closes.map((c) => c.code)).toEqual([1012]);
    });
    await runner.disconnect();
  });

  /**
   * A socket that is still open mid-drain: it holds a running turn, which is
   * the only reason a command can still arrive after the drain began. An idle
   * one is closed before the client could send anything.
   */
  async function busyConnection() {
    const busyThread = `t-drain-busy-${Date.now()}-${Math.random()}`;
    const { provider, release } = gatedProvider();
    const runner = new WebSocketClientSession({
      resolveExecutor: noopExecutor,
      resolveProvider: provider
    });
    const ws = new MockWS();
    await runner.connect(ws);
    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: busyThread,
        content: "hi",
        provider: "mock",
        model: "m"
      }
    });
    await vi.waitFor(() => {
      expect(sentMsgs(ws).some((m) => m.type === "chunk")).toBe(true);
    });
    startDrain();
    return { runner, ws, release, busyThread };
  }

  it("refuses chat_message and persists no message row", async () => {
    const threadId = `t-drain-refused-${Date.now()}-${Math.random()}`;
    const { runner, ws, release } = await busyConnection();

    const reply = await runner.handleCommand({
      command: "chat_message",
      data: { thread_id: threadId, content: "hi", provider: "mock", model: "m" }
    });

    expect(reply).toBeNull();
    const error = sentMsgs(ws).find((m) => m.type === "error");
    expect(error).toBeDefined();
    expect(error!.thread_id).toBe(threadId);
    expect(String(error!.message)).toContain("restarting");
    // No turn opened, and nothing written: the client's retry elsewhere is the
    // only copy of the message.
    expect(chatTurnRegistry.get("1", threadId)).toBeNull();
    const [rows] = await Message.paginate(threadId, { limit: 10 });
    expect(rows).toHaveLength(0);
    // The refusal does not cut the turn this connection is already driving.
    expect(ws.closes).toHaveLength(0);

    release();
    await vi.waitFor(() => {
      expect(ws.closes.map((c) => c.code)).toEqual([1012]);
    });
    await runner.disconnect();
  });

  it("refuses run_job the same way", async () => {
    const { runner, ws, release } = await busyConnection();

    const reply = await runner.handleCommand({
      command: "run_job",
      data: { workflow_id: "wf-1", graph: { nodes: [], edges: [] } }
    });

    expect(reply).toBeNull();
    const error = sentMsgs(ws).find((m) => m.type === "error");
    expect(error).toBeDefined();
    expect(error!.workflow_id).toBe("wf-1");
    expect(runner.jobs.activeJobIds()).toEqual([]);

    release();
    await runner.disconnect();
  });
});
