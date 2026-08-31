/**
 * A chat turn superseded by a new user message must not leave the thread
 * holding a tool call nobody answered.
 *
 * The original bug: the consumer loop checked its turn sequence at the top of
 * every iteration and returned, discarding whatever the provider had just
 * handed it. When that item was a tool result, the result was lost — and since
 * a tool already dispatched runs to completion, the model lost track of a side
 * effect it had caused and silently redid the work. The orphaned row also
 * makes the thread malformed: Anthropic rejects a `tool_use` with no
 * `tool_result`, so switching model on that thread failed every later turn.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { initTestDb, Message } from "@nodetool-ai/models";
import { BaseProvider } from "@nodetool-ai/runtime";
import type { Message as ProviderMessage } from "@nodetool-ai/runtime";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";
import { SUPERSEDED_TOOL_RESULT } from "../src/chat-tool-call-repair.js";

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

const noop = () => ({
  async process() {
    return {};
  }
});

const CALL_ID = "call_under_test";
const REAL_RESULT = '{"ok":true,"boardId":"48da4e"}';

const providerShell = {
  provider: "mock",
  async generateMessageTraced() {
    return {};
  },
  generateMessage: vi.fn(),
  hasToolSupport: async () => true,
  getAvailableLanguageModels: async () => [],
  getAvailableImageModels: async () => [],
  getAvailableVideoModels: async () => [],
  getAvailableTTSModels: async () => [],
  getAvailableASRModels: async () => [],
  getAvailableTTSModelsList: async () => [],
  getAvailableASRModels2: async () => [],
  getAvailableEmbeddingModels: async () => [],
  getContainerEnv: () => ({})
};

/**
 * A provider whose first turn announces a tool call and then waits. Whether it
 * ever yields the result models the two regimes: `deliversResult: true` is the
 * tool that ran to completion after the abort, `false` is the tool the
 * pre-dispatch signal check spared.
 */
function supersedableProvider(opts: { deliversResult: boolean }) {
  let turn = 0;
  let announceToolCall!: () => void;
  const announced = new Promise<void>((r) => {
    announceToolCall = r;
  });
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });

  async function* firstTurn(
    args: { signal?: AbortSignal } = {}
  ): AsyncGenerator<unknown> {
    yield {
      type: "message",
      message: {
        role: "assistant",
        content: null,
        toolCalls: [{ id: CALL_ID, name: "ui_storyboard_set_screenplay", args: {} }]
      }
    };
    announceToolCall();
    await gate;
    if (!opts.deliversResult) {
      // The abort landed before dispatch: no result exists, and the loop ends.
      expect(args.signal?.aborted).toBe(true);
      return;
    }
    // The tool had already been dispatched, so it finished and its result
    // arrives regardless of the abort.
    yield {
      type: "message",
      message: { role: "tool", toolCallId: CALL_ID, content: REAL_RESULT }
    };
  }

  async function* laterTurn(): AsyncGenerator<unknown> {
    yield { type: "chunk", content: "ok", done: true };
  }

  const provider = async () =>
    ({
      ...providerShell,
      async *generateMessages() {},
      async *generateMessagesTraced() {},
      generateLoop: (args: { signal?: AbortSignal }) =>
        turn++ === 0 ? firstTurn(args) : laterTurn()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

  return { provider, announced, release: () => release() };
}

async function toolRows(threadId: string) {
  const [rows] = await Message.paginate(threadId, { limit: 100 });
  return rows.filter((m) => m.role === "tool");
}

describe("a superseded chat turn keeps the transcript well-formed", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("persists a tool result that arrives after the turn was superseded", async () => {
    const threadId = `t-supersede-ran-${Date.now()}`;
    const { provider, announced, release } = supersedableProvider({
      deliversResult: true
    });
    const runner = new WebSocketClientSession({
      resolveExecutor: noop,
      resolveProvider: provider
    });
    await runner.connect(new MockWS());

    void runner.handleCommand({
      command: "chat_message",
      data: { thread_id: threadId, content: "hi", provider: "mock", model: "m" }
    });
    await announced;

    // The user sends another message while the tool is still running.
    void runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: threadId,
        content: "do it",
        provider: "mock",
        model: "m"
      }
    });
    release();

    await vi.waitFor(async () => {
      expect((await toolRows(threadId)).length).toBe(1);
    });

    // The real result was rescued, not replaced by the stand-in.
    const [row] = await toolRows(threadId);
    expect(row.tool_call_id).toBe(CALL_ID);
    expect(row.content).toBe(REAL_RESULT);

    await runner.disconnect();
  });

  it("writes a stand-in result when the superseded turn produced none", async () => {
    const threadId = `t-supersede-spared-${Date.now()}`;
    const { provider, announced, release } = supersedableProvider({
      deliversResult: false
    });
    const runner = new WebSocketClientSession({
      resolveExecutor: noop,
      resolveProvider: provider
    });
    await runner.connect(new MockWS());

    void runner.handleCommand({
      command: "chat_message",
      data: { thread_id: threadId, content: "hi", provider: "mock", model: "m" }
    });
    await announced;
    void runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: threadId,
        content: "do it",
        provider: "mock",
        model: "m"
      }
    });
    release();

    await vi.waitFor(async () => {
      expect((await toolRows(threadId)).length).toBe(1);
    });

    const [row] = await toolRows(threadId);
    expect(row.tool_call_id).toBe(CALL_ID);
    expect(row.content).toBe(SUPERSEDED_TOOL_RESULT);

    await runner.disconnect();
  });

  it("never tells the model an abandoned call did not run", () => {
    // The two regimes are indistinguishable after the fact (see
    // packages/runtime/tests/generate-loop-abort.test.ts), and in the common
    // one the tool DID run. Claiming otherwise would invite the model to
    // repeat a side effect that already landed.
    expect(SUPERSEDED_TOOL_RESULT).not.toMatch(/did not run|was not executed|never ran/i);
    expect(SUPERSEDED_TOOL_RESULT).toMatch(/unknown/i);
    expect(SUPERSEDED_TOOL_RESULT).toMatch(/may already have run/i);
  });
});

describe("loading a thread that already carries an orphaned tool call", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("sends no unanswered tool call when reloaded under a different provider", async () => {
    const threadId = `t-orphan-reload-${Date.now()}`;
    // A thread written before the fix: the assistant announced a call and the
    // result row never landed.
    await Message.create({
      thread_id: threadId,
      user_id: "1",
      role: "user",
      content: "create a storyboard",
      provider: "claude_agent_sdk",
      model: "sonnet"
    });
    await Message.create({
      thread_id: threadId,
      user_id: "1",
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "toolu_orphan", name: "execute_code", args: {}, result: null }
      ],
      provider: "claude_agent_sdk",
      model: "sonnet"
    });

    let sent: ProviderMessage[] = [];
    const provider = async () =>
      ({
        ...providerShell,
        async *generateMessages() {
          yield { type: "chunk", content: "hi", done: true };
        },
        async *generateMessagesTraced(args: { messages: ProviderMessage[] }) {
          sent = args.messages;
          yield { type: "chunk", content: "hi", done: true };
        },
        generateLoop: BaseProvider.prototype.generateLoop
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;

    const runner = new WebSocketClientSession({
      resolveExecutor: noop,
      resolveProvider: provider
    });
    await runner.connect(new MockWS());
    // A DIFFERENT provider and model than the thread was written with, which
    // is what skips the session-resume path and replays the whole thread.
    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: threadId,
        content: "carry on",
        provider: "mock",
        model: "other-model"
      }
    });
    await vi.waitFor(() => {
      expect(sent.length).toBeGreaterThan(0);
    });

    const answered = new Set(
      sent.filter((m) => m.role === "tool").map((m) => m.toolCallId)
    );
    const announced = sent
      .filter((m) => m.role === "assistant" && Array.isArray(m.toolCalls))
      .flatMap((m) => m.toolCalls ?? [])
      .map((c) => c.id);

    expect(announced).toContain("toolu_orphan");
    for (const id of announced) {
      expect(answered.has(id)).toBe(true);
    }

    await runner.disconnect();
  });
});
