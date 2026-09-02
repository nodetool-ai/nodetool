/**
 * Where a chat turn puts each kind of context, and why.
 *
 * Providers cache the longest stable prefix on their own, and Anthropic and
 * the OpenAI Responses API hoist *every* system-role message into one system
 * string ahead of the conversation. So the placement rule this file pins is:
 * stable context (the skill catalog) belongs in the system message, volatile
 * context (an invoked skill's body, thread memory, RAG hits) belongs at the
 * tail, folded into the last user message. A volatile system message would
 * rewrite that hoisted string every turn and invalidate the whole prefix.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  COMPACTION_EVENT_TYPE,
  compactionMessageContent,
  initTestDb,
  Memory,
  Message,
  Skill
} from "@nodetool-ai/models";
import { BaseProvider } from "@nodetool-ai/runtime";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";
import { borrowedLoopBudgetMembers } from "./chat-turn-test-harness.js";

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

interface CapturedMessage {
  role: string;
  content: unknown;
}

/** Run one chat turn and return the messages the provider was handed. */
async function runTurn(
  threadId: string,
  content: string
): Promise<CapturedMessage[]> {
  let captured: CapturedMessage[] = [];
  const provider = async () =>
    ({
      provider: "mock",
      async *generateMessages() {
        yield { type: "chunk" as const, content: "ok" };
      },
      async *generateMessagesTraced(opts: { messages: CapturedMessage[] }) {
        captured = opts.messages;
        yield { type: "chunk" as const, content: "ok" };
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
      generateLoop: BaseProvider.prototype.generateLoop,
      ...borrowedLoopBudgetMembers
    }) as never;

  const ws = new MockWS();
  const runner = new WebSocketClientSession({
    resolveExecutor: noop,
    resolveProvider: provider
  });
  await runner.connect(ws);
  await runner.handleCommand({
    command: "chat_message",
    data: { thread_id: threadId, content, provider: "mock", model: "m" }
  });
  await new Promise((r) => setTimeout(r, 200));
  await runner.disconnect();
  return captured;
}

/** The last user message — the tail every volatile block folds into. */
const lastUser = (messages: CapturedMessage[]): CapturedMessage => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i];
  }
  throw new Error("no user message was sent");
};

const textOf = (message: CapturedMessage): string =>
  typeof message.content === "string"
    ? message.content
    : Array.isArray(message.content)
      ? message.content
          .map((part) =>
            typeof part === "object" && part !== null && "text" in part
              ? String((part as { text: unknown }).text)
              : ""
          )
          .join("\n")
      : "";

async function makeSkill(name: string, description: string, body: string) {
  return Skill.create<Skill>({
    user_id: "1",
    name,
    description,
    content: body
  });
}

describe("chat prompt placement", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("puts the skill catalog in the system message and nothing else there", async () => {
    await makeSkill(
      "release-notes",
      "Use when writing release notes.",
      "Lead with what changed."
    );

    const messages = await runTurn("t-catalog", "Hello");

    const systemMessages = messages.filter((m) => m.role === "system");
    expect(systemMessages).toHaveLength(1);
    expect(messages[0].role).toBe("system");
    expect(textOf(messages[0])).toContain(
      "`/release-notes` — Use when writing release notes."
    );
    // The catalog is the description, not the body — the body costs a
    // `load_skill` call or a `/name`.
    expect(textOf(messages[0])).not.toContain("Lead with what changed.");
  });

  it("puts an invoked skill's body in the last user message, never in a system message", async () => {
    await makeSkill(
      "release-notes",
      "Use when writing release notes.",
      "Lead with what changed."
    );

    const messages = await runTurn("t-invoke", "/release-notes for v2");

    expect(messages.filter((m) => m.role === "system")).toHaveLength(1);
    expect(textOf(messages[0])).not.toContain("Lead with what changed.");

    const last = lastUser(messages);
    expect(textOf(last)).toContain("Lead with what changed.");
    // The user's own words survive the append.
    expect(textOf(last)).toContain("/release-notes for v2");
  });

  it("puts thread memory in the last user message, never in a system message", async () => {
    await Memory.create<Memory>({
      user_id: "1",
      thread_id: "t-memory",
      kind: "decision",
      title: "palette",
      content: "The user approved a teal palette."
    });

    const messages = await runTurn("t-memory", "What did we decide?");

    expect(messages.filter((m) => m.role === "system")).toHaveLength(1);
    expect(textOf(messages[0])).not.toContain("teal palette");

    expect(textOf(lastUser(messages))).toContain("teal palette");
  });

  it("names memories from other threads without pasting them in", async () => {
    await Memory.create<Memory>({
      user_id: "1",
      thread_id: "t-memory-here",
      kind: "fact",
      title: "",
      content: "Saved in this conversation."
    });
    await Memory.create<Memory>({
      user_id: "1",
      thread_id: "some-other-thread",
      kind: "decision",
      title: "",
      content: "Saved somewhere else entirely."
    });

    const messages = await runTurn("t-memory-here", "What do you know?");
    const tail = textOf(lastUser(messages));

    expect(tail).toContain("Saved in this conversation.");
    // The other thread's memory costs nothing until the agent searches for it.
    expect(tail).not.toContain("Saved somewhere else entirely.");
    expect(tail).toContain("1 more memory");
    expect(tail).toContain("memory_search");
  });

  it("keeps the system message byte-identical across turns while volatile context changes", async () => {
    await makeSkill(
      "release-notes",
      "Use when writing release notes.",
      "Lead with what changed."
    );

    const first = await runTurn("t-stable", "Hello");
    await Memory.create<Memory>({
      user_id: "1",
      thread_id: "t-stable",
      kind: "fact",
      title: "",
      content: "A memory saved between the two turns."
    });
    const second = await runTurn("t-stable", "/release-notes now");

    expect(textOf(second[0])).toBe(textOf(first[0]));
    // ...and the turn really did carry new volatile context.
    const last = lastUser(second);
    expect(textOf(last)).toContain("A memory saved between the two turns.");
    expect(textOf(last)).toContain("Lead with what changed.");
  });

  it("keeps the system message byte-identical across a compaction", async () => {
    // I-7: compaction cuts the conversation, never the cached prefix. The
    // summary is a `role: "user"` row, so the system message a provider hashes
    // its cache on is the same string before and after.
    const first = await runTurn("t-compacted", "Hello");

    await Message.create({
      thread_id: "t-compacted",
      user_id: "1",
      role: "user",
      execution_event_type: COMPACTION_EVENT_TYPE,
      content: compactionMessageContent("The user greeted us and asked for X.")
    });
    const second = await runTurn("t-compacted", "Carry on");

    expect(textOf(second[0])).toBe(textOf(first[0]));
    expect(second.filter((m) => m.role === "system")).toHaveLength(1);
    // The summary rides as ordinary conversation, after the system message.
    expect(second[1].role).toBe("user");
    expect(textOf(second[1])).toContain("[Conversation so far]");
  });
});
