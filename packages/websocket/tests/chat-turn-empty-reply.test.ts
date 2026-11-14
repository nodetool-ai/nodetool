/**
 * A turn whose model sends back nothing still answers the user.
 *
 * Free routed models (`openrouter/free`) sometimes finish a completion with no
 * text and no tool call. Saved as is, the assistant row was empty and the
 * user's message looked unanswered (plan item A12). A model that stops sending
 * altogether is stopped with a reason instead of running to the deadline (A13).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initTestDb, Message } from "@nodetool-ai/models";
import { BaseProvider } from "@nodetool-ai/runtime";
import type {
  Message as ProviderMessage,
  ProviderStreamItem
} from "@nodetool-ai/runtime";
import { makeChatTurnHarness } from "./chat-turn-test-harness.js";
import {
  EMPTY_REPLY_NOTE,
  idleStopNote,
  isEmptyAssistantReply
} from "../src/session/chat-turn.js";

class ScriptedReplyProvider extends BaseProvider {
  readonly provider = "openrouter";

  constructor(private readonly chunks: ProviderStreamItem[]) {
    super();
  }

  async generateMessage(): Promise<ProviderMessage> {
    return { role: "assistant", content: "unused" };
  }

  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    yield* this.chunks;
  }
}

async function runTurn(
  threadId: string,
  chunks: ProviderStreamItem[]
): Promise<string[]> {
  const provider = new ScriptedReplyProvider(chunks);
  const harness = makeChatTurnHarness({
    session: { resolveProvider: async () => provider }
  });
  await harness.handler.handleChatMessage({
    thread_id: threadId,
    content: "hi",
    provider: "openrouter",
    model: "openrouter/free"
  });
  const [rows] = await Message.paginate(threadId, { limit: 100 });
  return rows
    .filter((m) => m.role === "assistant")
    .map((m) => (typeof m.content === "string" ? m.content : ""));
}

describe("an empty model reply", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("is saved as a note the user can act on", async () => {
    const texts = await runTurn("t-empty", [
      { type: "chunk", content: "", done: true }
    ]);
    expect(texts).toEqual([EMPTY_REPLY_NOTE]);
  });

  it("counts a reply with only reasoning as empty", async () => {
    const texts = await runTurn("t-thinking", [
      { type: "chunk", content: "Let me think.", thinking: true, done: false },
      { type: "chunk", content: "", done: true }
    ]);
    expect(texts).toEqual([EMPTY_REPLY_NOTE]);
  });

  it("leaves a real answer alone", async () => {
    const texts = await runTurn("t-answer", [
      { type: "chunk", content: "Hello.", done: true }
    ]);
    expect(texts).toEqual(["Hello."]);
  });
});

describe("isEmptyAssistantReply", () => {
  it("treats whitespace and empty text blocks as empty", () => {
    expect(isEmptyAssistantReply({ role: "assistant", content: "  \n" })).toBe(
      true
    );
    expect(
      isEmptyAssistantReply({
        role: "assistant",
        content: [{ type: "text", text: "" }]
      })
    ).toBe(true);
  });

  it("keeps a tool call or an image", () => {
    expect(
      isEmptyAssistantReply({
        role: "assistant",
        content: null,
        toolCalls: [{ id: "c1", name: "search", args: {} }]
      })
    ).toBe(false);
    expect(
      isEmptyAssistantReply({
        role: "assistant",
        content: [
          { type: "image", image: { type: "image", uri: "asset://abc" } }
        ]
      })
    ).toBe(false);
  });
});

/** Sends nothing until the turn's signal aborts, then ends or throws. */
class SilentProvider extends BaseProvider {
  readonly provider = "openrouter";

  constructor(private readonly throwOnAbort: boolean) {
    super();
  }

  async generateMessage(): Promise<ProviderMessage> {
    return { role: "assistant", content: "unused" };
  }

  async *generateMessages(args: {
    signal?: AbortSignal;
  }): AsyncGenerator<ProviderStreamItem> {
    await new Promise<void>((resolve) => {
      if (args.signal?.aborted) resolve();
      args.signal?.addEventListener("abort", () => resolve(), { once: true });
    });
    if (this.throwOnAbort) throw new Error("This operation was aborted");
    yield { type: "chunk", content: "", done: true };
  }
}

describe("a turn that goes silent", () => {
  const previous = process.env.NODETOOL_CHAT_IDLE_TIMEOUT_MS;

  beforeEach(() => {
    initTestDb();
    process.env.NODETOOL_CHAT_IDLE_TIMEOUT_MS = "50";
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.NODETOOL_CHAT_IDLE_TIMEOUT_MS;
    else process.env.NODETOOL_CHAT_IDLE_TIMEOUT_MS = previous;
  });

  it.each([
    ["ends its stream", false],
    ["throws", true]
  ])("is stopped with a reason when the provider %s on abort", async (_label, throwOnAbort) => {
    const provider = new SilentProvider(throwOnAbort);
    const harness = makeChatTurnHarness({
      session: { resolveProvider: async () => provider }
    });
    const threadId = `t-silent-${String(throwOnAbort)}`;
    await harness.handler.handleChatMessage({
      thread_id: threadId,
      content: "can you see me do it?",
      provider: "openrouter",
      model: "openrouter/free"
    });
    const [rows] = await Message.paginate(threadId, { limit: 100 });
    const texts = rows
      .filter((m) => m.role === "assistant")
      .map((m) => (typeof m.content === "string" ? m.content : ""));
    expect(texts).toContain(idleStopNote(50));
    expect(texts).not.toContain(EMPTY_REPLY_NOTE);
    expect(texts.some((t) => t.startsWith("I encountered"))).toBe(false);
  });
});
