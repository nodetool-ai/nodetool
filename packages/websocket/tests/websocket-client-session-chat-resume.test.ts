/**
 * Chat-turn resilience: a turn keeps executing when its socket disconnects,
 * and a later connection replays the missed frames via `resume_chat`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { unpack } from "msgpackr";
import { initTestDb } from "@nodetool-ai/models";
import { BaseProvider } from "@nodetool-ai/runtime";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";
import { chatTurnRegistry } from "../src/chat-turn-registry.js";

class MockWS implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  queue: Array<WebSocketReceiveFrame> = [];
  async accept() {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return this.queue.shift() ?? { type: "websocket.disconnect" };
  }
  async sendBytes(data: Uint8Array) {
    this.sentBytes.push(data);
  }
  async sendText() {}
  async close() {
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

/** Provider that streams "hello " then blocks until released, then "world". */
function gatedProvider() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Real providers abort the in-flight request when the turn's signal fires;
  // the mock mirrors that by racing the gate against the abort.
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
      generateLoop: BaseProvider.prototype.generateLoop
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
  return { provider, release: () => release() };
}

describe("chat turn resilience across disconnect", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("keeps the turn running after disconnect and replays it on resume_chat", async () => {
    const threadId = `t-resume-${Date.now()}-${Math.random()}`;
    const { provider, release } = gatedProvider();

    const runnerA = new WebSocketClientSession({
      resolveExecutor: noopExecutor,
      resolveProvider: provider
    });
    const wsA = new MockWS();
    await runnerA.connect(wsA);
    await runnerA.handleCommand({
      command: "chat_message",
      data: { thread_id: threadId, content: "hi", provider: "mock", model: "m" }
    });

    // Wait for the first chunk to reach client A, then note its seq.
    await vi.waitFor(() => {
      expect(
        sentMsgs(wsA).some((m) => m.type === "chunk" && m.content === "hello ")
      ).toBe(true);
    });
    const firstChunk = sentMsgs(wsA).find(
      (m) => m.type === "chunk" && m.content === "hello "
    )!;
    expect(typeof firstChunk.chat_seq).toBe("number");
    const lastSeq = firstChunk.chat_seq as number;

    // Socket drops mid-turn: the turn must keep running (not be aborted).
    await runnerA.disconnect();
    const session = chatTurnRegistry.get("1", threadId);
    expect(session).not.toBeNull();
    expect(session!.status).toBe("running");

    // The provider finishes while nobody is connected.
    release();
    await vi.waitFor(() => {
      expect(chatTurnRegistry.get("1", threadId)!.status).toBe("finished");
    });

    // A fresh connection resumes and receives everything after lastSeq.
    const runnerB = new WebSocketClientSession({
      resolveExecutor: noopExecutor,
      resolveProvider: provider
    });
    const wsB = new MockWS();
    await runnerB.connect(wsB);
    await runnerB.handleCommand({
      command: "resume_chat",
      data: { thread_id: threadId, last_seq: lastSeq }
    });

    const replayed = sentMsgs(wsB);
    const header = replayed.find((m) => m.type === "chat_resumed");
    expect(header).toBeDefined();
    expect(header!.status).toBe("finished");
    expect(header!.replay_incomplete).toBe(false);
    expect(header!.thread_id).toBe(threadId);

    // The second chunk and the terminal frames arrived, none re-sent from
    // before lastSeq.
    const chunks = replayed.filter((m) => m.type === "chunk");
    expect(chunks.some((m) => m.content === "world")).toBe(true);
    expect(chunks.some((m) => m.content === "hello ")).toBe(false);
    expect(chunks.some((m) => m.done === true)).toBe(true);
    expect(
      replayed.some((m) => m.type === "message" && m.role === "assistant")
    ).toBe(true);
    for (const m of replayed) {
      if (typeof m.chat_seq === "number") {
        expect(m.chat_seq).toBeGreaterThan(lastSeq);
      }
    }

    await runnerB.disconnect();
  });

  it("lets a fresh client (page reload) discover and reattach a running turn", async () => {
    // Reproduces the reported bug: the agent keeps running server-side, but a
    // reloaded page has no threadRuntime/cursor state, so before
    // `list_chat_turns` existed it never learned a turn was in flight and
    // never reattached — the turn streamed to nobody until the detach grace
    // aborted it.
    const threadId = `t-reload-${Date.now()}-${Math.random()}`;
    const { provider, release } = gatedProvider();

    const runnerA = new WebSocketClientSession({
      resolveExecutor: noopExecutor,
      resolveProvider: provider
    });
    const wsA = new MockWS();
    await runnerA.connect(wsA);
    await runnerA.handleCommand({
      command: "chat_message",
      data: { thread_id: threadId, content: "hi", provider: "mock", model: "m" }
    });
    await vi.waitFor(() => {
      expect(
        sentMsgs(wsA).some((m) => m.type === "chunk" && m.content === "hello ")
      ).toBe(true);
    });

    // The page reloads: old socket gone, new connection with zero state.
    await runnerA.disconnect();
    const runnerB = new WebSocketClientSession({
      resolveExecutor: noopExecutor,
      resolveProvider: provider
    });
    const wsB = new MockWS();
    await runnerB.connect(wsB);

    // Discovery: the fresh client learns which threads still have a turn.
    await runnerB.handleCommand({ command: "list_chat_turns", data: {} });
    const active = sentMsgs(wsB).find((m) => m.type === "chat_turn_active");
    expect(active).toBeDefined();
    expect(active!.thread_id).toBe(threadId);
    expect(active!.status).toBe("running");

    // Reattach with no cursor: replay starts after the last persisted
    // message frame (none yet mid-turn, so the streamed chunk is replayed
    // and the client can rebuild the in-progress reply), and the header
    // tells the client to reconcile persisted history over REST.
    await runnerB.handleCommand({
      command: "resume_chat",
      data: { thread_id: threadId, last_seq: 0 }
    });
    const header = sentMsgs(wsB).find((m) => m.type === "chat_resumed");
    expect(header).toBeDefined();
    expect(header!.status).toBe("running");
    expect(header!.replay_incomplete).toBe(true);
    expect(
      sentMsgs(wsB).some((m) => m.type === "chunk" && m.content === "hello ")
    ).toBe(true);

    // The turn finishes against the reattached connection.
    release();
    await vi.waitFor(() => {
      expect(
        sentMsgs(wsB).some(
          (m) => m.type === "message" && m.role === "assistant"
        )
      ).toBe(true);
    });
    expect(
      sentMsgs(wsB).some((m) => m.type === "chunk" && m.content === "world")
    ).toBe(true);
    await runnerB.disconnect();
  });

  it("fresh reattach after the reply finalized replays no stale chunks", async () => {
    const threadId = `t-reload-late-${Date.now()}-${Math.random()}`;
    const { provider, release } = gatedProvider();

    const runnerA = new WebSocketClientSession({
      resolveExecutor: noopExecutor,
      resolveProvider: provider
    });
    const wsA = new MockWS();
    await runnerA.connect(wsA);
    await runnerA.handleCommand({
      command: "chat_message",
      data: { thread_id: threadId, content: "hi", provider: "mock", model: "m" }
    });
    await vi.waitFor(() => {
      expect(sentMsgs(wsA).some((m) => m.type === "chunk")).toBe(true);
    });
    await runnerA.disconnect();
    release();
    await vi.waitFor(() => {
      expect(chatTurnRegistry.get("1", threadId)!.status).toBe("finished");
    });

    // Reload after the turn finished (within retention). The assistant
    // message is persisted, so a fresh attach must not replay the chunks
    // that built it — REST history already carries the final text and a
    // chunk replay would render it twice.
    const runnerB = new WebSocketClientSession({
      resolveExecutor: noopExecutor,
      resolveProvider: provider
    });
    const wsB = new MockWS();
    await runnerB.connect(wsB);
    await runnerB.handleCommand({
      command: "resume_chat",
      data: { thread_id: threadId, last_seq: 0 }
    });
    const header = sentMsgs(wsB).find((m) => m.type === "chat_resumed");
    expect(header).toBeDefined();
    expect(header!.status).toBe("finished");
    expect(header!.replay_incomplete).toBe(true);
    // Only the terminal done-chunk may follow the persisted message; the
    // text chunks that built the reply must not be replayed.
    expect(
      sentMsgs(wsB).some((m) => m.type === "chunk" && m.content !== "")
    ).toBe(false);
    expect(
      sentMsgs(wsB).some((m) => m.type === "message" && m.role === "assistant")
    ).toBe(false);
    await runnerB.disconnect();
  });

  it("answers resume_chat for an unknown thread with status unknown", async () => {
    const runner = new WebSocketClientSession({
      resolveExecutor: noopExecutor
    });
    const ws = new MockWS();
    await runner.connect(ws);
    await runner.handleCommand({
      command: "resume_chat",
      data: { thread_id: "never-ran", last_seq: 0 }
    });
    const out = sentMsgs(ws).find((m) => m.type === "chat_resumed");
    expect(out).toBeDefined();
    expect(out!.status).toBe("unknown");
    await runner.disconnect();
  });

  it("stop from a later connection aborts a detached turn", async () => {
    const threadId = `t-stop-${Date.now()}-${Math.random()}`;
    const { provider } = gatedProvider();

    const runnerA = new WebSocketClientSession({
      resolveExecutor: noopExecutor,
      resolveProvider: provider
    });
    const wsA = new MockWS();
    await runnerA.connect(wsA);
    await runnerA.handleCommand({
      command: "chat_message",
      data: { thread_id: threadId, content: "hi", provider: "mock", model: "m" }
    });
    await vi.waitFor(() => {
      expect(sentMsgs(wsA).some((m) => m.type === "chunk")).toBe(true);
    });
    await runnerA.disconnect();
    expect(chatTurnRegistry.get("1", threadId)!.status).toBe("running");

    const runnerB = new WebSocketClientSession({
      resolveExecutor: noopExecutor,
      resolveProvider: provider
    });
    const wsB = new MockWS();
    await runnerB.connect(wsB);
    await runnerB.handleCommand({
      command: "stop",
      data: { thread_id: threadId }
    });

    await vi.waitFor(() => {
      const session = chatTurnRegistry.get("1", threadId);
      expect(session === null || session.status === "finished").toBe(true);
    });
    await runnerB.disconnect();
  });
});
