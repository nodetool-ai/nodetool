/**
 * A chat turn taken in a project's own agent thread spends that project's
 * money. The ledger rows it writes used to carry `project_id: null`, so a
 * project's spend rollup read $0 no matter how much the thread cost.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { initTestDb, Prediction, Project } from "@nodetool-ai/models";
import { BaseProvider } from "@nodetool-ai/runtime";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";

class MockWS implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  sentText: string[] = [];
  queue: Array<WebSocketReceiveFrame> = [];
  async accept() {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return this.queue.shift() ?? { type: "websocket.disconnect" };
  }
  async sendBytes(data: Uint8Array) {
    this.sentBytes.push(data);
  }
  async sendText(data: string) {
    this.sentText.push(data);
  }
  async close() {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

const noop = () => ({
  async process() {
    return {};
  }
});

/** A provider that answers once and reports what the call cost. */
function billingProvider() {
  return async () =>
    ({
      provider: "mock",
      cost: 0.25,
      async *generateMessages() {
        yield { type: "chunk" as const, content: "hi" };
      },
      async *generateMessagesTraced() {
        yield { type: "chunk" as const, content: "hi" };
      },
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
}

async function ledgerRows(userId: string): Promise<Prediction[]> {
  const [rows] = await Prediction.paginate(userId, { limit: 100 });
  return rows;
}

/**
 * The turn is started, not awaited — `chat_message` returns as soon as the
 * runner has kicked off its task. Waiting a fixed 250ms for the row was a bet
 * on the machine being fast enough, so this polls for the row the assertions
 * are about and fails loudly when the deadline passes instead of asserting
 * against an empty table.
 */
async function ledgerRowsWhenWritten(
  userId: string,
  deadlineMs = 10_000
): Promise<Prediction[]> {
  const until = Date.now() + deadlineMs;
  for (;;) {
    const rows = await ledgerRows(userId);
    if (rows.length > 0) return rows;
    if (Date.now() > until) {
      throw new Error(
        `No spend row written for ${userId} within ${deadlineMs}ms`
      );
    }
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Run one chat turn and answer with the ledger rows it wrote. */
async function chatTurn(threadId: string): Promise<Prediction[]> {
  const ws = new MockWS();
  const runner = new WebSocketClientSession({
    resolveExecutor: noop,
    resolveProvider: billingProvider()
  });
  await runner.connect(ws);
  await runner.handleCommand({
    command: "chat_message",
    data: {
      thread_id: threadId,
      content: "Hello",
      provider: "mock",
      model: "m"
    }
  });
  try {
    return await ledgerRowsWhenWritten("1");
  } finally {
    await runner.disconnect();
  }
}

describe("chat-turn spend attribution", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("attributes an LLM call to the project whose thread it ran in", async () => {
    const project = new Project({
      user_id: "1",
      name: "Spot",
      thread_id: "t-project"
    });
    await project.save();

    const rows = await chatTurn("t-project");

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.project_id).toBe(project.id);
    }
  });

  it("leaves the project null for a thread outside any project", async () => {
    const rows = await chatTurn("t-loose");

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.project_id).toBeNull();
    }
  });
});
