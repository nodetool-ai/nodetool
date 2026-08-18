import { describe, expect, it } from "vitest";

import type { RenderFrame, RenderOp } from "../src/frame-renderer.js";
import type { IdentityResolution } from "../src/identity-client.js";
import type {
  BridgeChatSocket,
  BridgeClient,
  BridgeSendOptions,
  DeliveryContext
} from "../src/turn-router.js";
import { TurnRouter, deriveThreadId, highestThreadIndex, userHash8 } from "../src/turn-router.js";

/** A socket that records commands and lets the test push frames back. */
class FakeSocket implements BridgeChatSocket {
  readonly sent: BridgeSendOptions[] = [];
  readonly stopped: string[] = [];
  readonly resumed: { threadId: string; lastSeq: number }[] = [];
  connected = false;
  private readonly frameListeners = new Set<(frame: RenderFrame) => void>();
  private readonly stateListeners = new Set<(state: string) => void>();

  connect(): void {
    this.connected = true;
    for (const listener of this.stateListeners) {
      listener("connected");
    }
  }

  disconnect(): void {
    this.connected = false;
  }

  send(options: BridgeSendOptions): void {
    this.sent.push(options);
  }

  stop(threadId: string): void {
    this.stopped.push(threadId);
  }

  resume(threadId: string, lastSeq: number): void {
    this.resumed.push({ threadId, lastSeq });
  }

  onFrame(listener: (frame: RenderFrame) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  onStateChange(listener: (state: string) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** Simulate a dropped connection that the SDK reconnects. */
  reconnect(): void {
    this.connected = false;
    this.connect();
  }

  emit(frame: RenderFrame): void {
    for (const listener of this.frameListeners) {
      listener(frame);
    }
  }
}

interface Harness {
  router: TurnRouter;
  sockets: Map<string, FakeSocket>;
  delivered: { context: DeliveryContext; ops: readonly RenderOp[] }[];
  threadIds: string[];
  clock: { ms: number };
}

function harness(
  options: {
    resolutions?: Record<string, IdentityResolution>;
    threadIds?: string[];
    maxQueuedTurns?: number;
  } = {}
): Harness {
  const resolutions = options.resolutions ?? {};
  const sockets = new Map<string, FakeSocket>();
  const delivered: { context: DeliveryContext; ops: readonly RenderOp[] }[] = [];
  const threadIds = options.threadIds ?? [];
  const clock = { ms: 0 };

  const identity = {
    async resolve(externalId: string): Promise<IdentityResolution> {
      return (
        resolutions[externalId] ?? {
          unlinked: false,
          token: `tok-${externalId}`,
          userId: `user-${externalId}`,
          expiresAtMs: 10_000_000
        }
      );
    },
    invalidate(): void {
      /* nothing cached in the fake */
    }
  };

  const router = new TurnRouter({
    identity,
    makeClient: ({ userId }): BridgeClient => {
      const socket = new FakeSocket();
      sockets.set(userId, socket);
      return {
        socket,
        listThreadIds: async () => threadIds
      };
    },
    config: {
      editThrottleMs: 1500,
      maxQueuedTurns: options.maxQueuedTurns ?? 3,
      permissionMode: "auto"
    },
    executeOps: (context, ops) => {
      delivered.push({ context, ops });
    },
    nowMs: () => clock.ms
  });

  return { router, sockets, delivered, threadIds, clock };
}

function chunk(content: string, seq: number, threadId: string): RenderFrame {
  return { type: "chunk", content, done: false, thread_id: threadId, chat_seq: seq } as RenderFrame;
}

function finalMessage(threadId: string, seq: number): RenderFrame {
  return {
    type: "message",
    role: "assistant",
    content: "",
    thread_id: threadId,
    chat_seq: seq
  } as RenderFrame;
}

const UID8 = userHash8("user-1");

/** Op delivery is chained through promises, so let the microtasks run. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("thread id derivation", () => {
  it("hashes the NodeTool user into the id", () => {
    expect(deriveThreadId("55", UID8, 3)).toBe(`telegram-55-${UID8}-3`);
    expect(userHash8("user-1")).not.toBe(userHash8("user-2"));
    expect(UID8).toHaveLength(8);
  });

  it("finds the highest existing n and ignores other chats and tenants", () => {
    const ids = [
      `telegram-55-${UID8}-1`,
      `telegram-55-${UID8}-7`,
      `telegram-55-${userHash8("user-2")}-99`,
      `telegram-56-${UID8}-42`,
      "some-other-thread"
    ];
    expect(highestThreadIndex(ids, "55", UID8)).toBe(7);
    expect(highestThreadIndex([], "55", UID8)).toBe(0);
  });
});

describe("TurnRouter", () => {
  it("starts a turn on the user's own socket with agent mode and auto permissions", async () => {
    const h = harness();
    const result = await h.router.submit({ telegramUserId: "1", chatId: "55", text: "hi" });

    expect(result).toEqual({ status: "started", threadId: `telegram-55-${UID8}-1` });
    const socket = h.sockets.get("user-1");
    expect(socket?.connected).toBe(true);
    expect(socket?.sent).toEqual([
      {
        threadId: `telegram-55-${UID8}-1`,
        text: "hi",
        provider: null,
        model: null,
        agentMode: true,
        permissionMode: "auto"
      }
    ]);
  });

  it("answers unlinked without opening a socket", async () => {
    const h = harness({
      resolutions: {
        "1": { unlinked: true, reason: "not-linked", message: "not linked" }
      }
    });
    const result = await h.router.submit({ telegramUserId: "1", chatId: "55", text: "hi" });

    expect(result).toEqual({ status: "unlinked", reason: "not-linked", message: "not linked" });
    expect(h.sockets.size).toBe(0);
  });

  it("recovers the highest n from the server on first use", async () => {
    const h = harness({ threadIds: [`telegram-55-${UID8}-1`, `telegram-55-${UID8}-4`] });
    const result = await h.router.submit({ telegramUserId: "1", chatId: "55", text: "hi" });

    expect(result).toEqual({ status: "started", threadId: `telegram-55-${UID8}-4` });
  });

  it("renders frames into ops for the chat the thread belongs to", async () => {
    const h = harness();
    await h.router.submit({ telegramUserId: "1", chatId: "55", text: "hi" });
    const threadId = `telegram-55-${UID8}-1`;
    const socket = h.sockets.get("user-1");

    socket?.emit(chunk("hello", 1, threadId));
    await tick();
    expect(h.delivered.map((entry) => entry.ops.map((op) => op.kind))).toEqual([
      ["typing", "send"]
    ]);
    expect(h.delivered[0].context).toEqual({
      chatId: "55",
      telegramUserId: "1",
      userId: "user-1",
      threadId,
      token: "tok-1"
    });
  });

  it("queues a second message and runs it when the turn ends", async () => {
    const h = harness();
    await h.router.submit({ telegramUserId: "1", chatId: "55", text: "first" });
    const queued = await h.router.submit({ telegramUserId: "1", chatId: "55", text: "second" });

    expect(queued).toMatchObject({ status: "queued", depth: 1 });
    expect(h.router.queueDepth("55")).toBe(1);

    const socket = h.sockets.get("user-1");
    socket?.emit(finalMessage(`telegram-55-${UID8}-1`, 2));

    expect(socket?.sent.map((s) => s.text)).toEqual(["first", "second"]);
    expect(h.router.queueDepth("55")).toBe(0);
  });

  it("answers busy once the queue is full", async () => {
    const h = harness({ maxQueuedTurns: 1 });
    await h.router.submit({ telegramUserId: "1", chatId: "55", text: "first" });
    await h.router.submit({ telegramUserId: "1", chatId: "55", text: "second" });
    const third = await h.router.submit({ telegramUserId: "1", chatId: "55", text: "third" });

    expect(third).toEqual({ status: "busy", depth: 1 });
  });

  it("does not let one user's running turn block another", async () => {
    const h = harness();
    await h.router.submit({ telegramUserId: "1", chatId: "55", text: "first" });
    const other = await h.router.submit({ telegramUserId: "2", chatId: "66", text: "hello" });

    expect(other.status).toBe("started");
    expect(h.sockets.get("user-2")?.sent).toHaveLength(1);
    // Each user has its own socket, on its own delegated token.
    expect(h.sockets.get("user-1")).not.toBe(h.sockets.get("user-2"));
    expect(h.router.isRunning("55")).toBe(true);
    expect(h.router.isRunning("66")).toBe(true);
  });

  it("resumes after a socket drop without re-rendering replayed frames", async () => {
    const h = harness();
    await h.router.submit({ telegramUserId: "1", chatId: "55", text: "hi" });
    const threadId = `telegram-55-${UID8}-1`;
    const socket = h.sockets.get("user-1");

    h.clock.ms = 0;
    socket?.emit(chunk("one ", 1, threadId));
    h.clock.ms = 5_000;
    socket?.emit(chunk("two ", 2, threadId));
    await tick();
    const before = h.delivered.length;

    socket?.reconnect();
    expect(socket?.resumed).toEqual([{ threadId, lastSeq: 2 }]);

    // The server replays from just before the gap; the renderer drops what it
    // has already applied, so only the new frame produces an op.
    socket?.emit(chunk("one ", 1, threadId));
    socket?.emit(chunk("two ", 2, threadId));
    await tick();
    expect(h.delivered.length).toBe(before);

    h.clock.ms = 10_000;
    socket?.emit(chunk("three", 3, threadId));
    await tick();
    expect(h.delivered.length).toBe(before + 1);
    const ops = h.delivered[h.delivered.length - 1].ops;
    expect(ops[0]).toMatchObject({ kind: "edit", text: "one two three" });
  });

  it("does not resume a conversation with no turn in flight", async () => {
    const h = harness();
    await h.router.submit({ telegramUserId: "1", chatId: "55", text: "hi" });
    const socket = h.sockets.get("user-1");
    socket?.emit(finalMessage(`telegram-55-${UID8}-1`, 1));
    socket?.reconnect();

    expect(socket?.resumed).toEqual([]);
  });

  it("stops the in-flight turn on the right thread", async () => {
    const h = harness();
    expect(h.router.stop("55")).toBe(false);
    await h.router.submit({ telegramUserId: "1", chatId: "55", text: "hi" });

    expect(h.router.stop("55")).toBe(true);
    expect(h.sockets.get("user-1")?.stopped).toEqual([`telegram-55-${UID8}-1`]);
  });

  it("rotates onto a fresh thread and drops what was queued behind", async () => {
    const h = harness();
    await h.router.submit({ telegramUserId: "1", chatId: "55", text: "first" });
    await h.router.submit({ telegramUserId: "1", chatId: "55", text: "second" });

    expect(h.router.newThread("55")).toBe(`telegram-55-${UID8}-2`);
    expect(h.router.queueDepth("55")).toBe(0);
    expect(h.router.isRunning("55")).toBe(false);
    expect(h.router.currentThreadId("55")).toBe(`telegram-55-${UID8}-2`);
  });

  it("opens a new socket when the delegated token is re-minted", async () => {
    let token = "tok-a";
    const sockets: FakeSocket[] = [];
    const router = new TurnRouter({
      identity: {
        resolve: async () => ({
          unlinked: false as const,
          token,
          userId: "user-1",
          expiresAtMs: 10_000_000
        }),
        invalidate: () => undefined
      },
      makeClient: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return { socket, listThreadIds: async () => [] };
      },
      config: { editThrottleMs: 1500, maxQueuedTurns: 3 },
      executeOps: () => undefined,
      nowMs: () => 0
    });

    await router.submit({ telegramUserId: "1", chatId: "55", text: "first" });
    sockets[0].emit(finalMessage(`telegram-55-${UID8}-1`, 1));
    token = "tok-b";
    await router.submit({ telegramUserId: "1", chatId: "55", text: "second" });

    expect(sockets).toHaveLength(2);
    expect(sockets[0].connected).toBe(false);
    expect(sockets[1].sent.map((s) => s.text)).toEqual(["second"]);
  });
});
