/**
 * ContextCompactor unit tests.
 *
 * Covers the token estimator, the shouldCompact gate, the boundary-safe split
 * that preserves tool-call/tool-result pairing, and the best-effort error path.
 *
 * The provider is a scripted fake exposing the non-streaming
 * `generateMessageTraced` method (mirroring createScriptedProvider in
 * compiler-agent.test.ts, but for the one-shot summary call).
 */

import { describe, expect, it, vi } from "vitest";
import type { BaseProvider, Message } from "@nodetool-ai/runtime";
import {
  ContextCompactor,
  estimateMessageTokens,
  type CompactionOptions
} from "../src/context-compactor.js";

const SUMMARY_TEXT = "SCRIPTED SUMMARY: primary intent recorded.";

/**
 * Scripted provider whose `generateMessageTraced` returns a single assistant
 * message containing the scripted summary text. The vi.fn wrapper lets tests
 * assert call count and the exact args passed.
 */
function createScriptedProvider(opts?: {
  throws?: boolean;
  summary?: string;
}): { provider: BaseProvider; generateMessageTraced: ReturnType<typeof vi.fn> } {
  const generateMessageTraced = vi.fn(async () => {
    if (opts?.throws) {
      throw new Error("provider exploded");
    }
    return {
      role: "assistant" as const,
      content: opts?.summary ?? SUMMARY_TEXT
    } satisfies Message;
  });

  const provider = {
    provider: "scripted",
    hasToolSupport: async () => true,
    generateMessageTraced,
    generateMessage: vi.fn(),
    generateMessages: vi.fn(),
    async *generateMessagesTraced() {
      // not used by the compactor
    },
    getAvailableLanguageModels: vi.fn().mockResolvedValue([]),
    getAvailableImageModels: vi.fn().mockResolvedValue([]),
    getAvailableVideoModels: vi.fn().mockResolvedValue([]),
    getAvailableTTSModels: vi.fn().mockResolvedValue([]),
    getAvailableASRModels: vi.fn().mockResolvedValue([]),
    getAvailableEmbeddingModels: vi.fn().mockResolvedValue([]),
    getContainerEnv: () => ({}),
    textToImage: vi.fn(),
    imageToImage: vi.fn(),
    textToSpeech: vi.fn(),
    automaticSpeechRecognition: vi.fn(),
    textToVideo: vi.fn(),
    imageToVideo: vi.fn(),
    generateEmbedding: vi.fn(),
    isContextLengthError: () => false
  } as unknown as BaseProvider;

  return { provider, generateMessageTraced };
}

function makeCompactor(
  provider: BaseProvider,
  options: Partial<Required<CompactionOptions>> = {},
  threadId?: string
): ContextCompactor {
  return new ContextCompactor({
    provider,
    model: "scripted-model",
    threadId,
    options: {
      enabled: true,
      thresholdTokens: options.thresholdTokens ?? 100,
      keepRecent: options.keepRecent ?? 2
    }
  });
}

/** Build a history of `count` user/assistant messages plus a system prompt. */
function makeSimpleHistory(count: number): Message[] {
  const history: Message[] = [{ role: "system", content: "SYSTEM PROMPT" }];
  for (let i = 0; i < count; i++) {
    history.push({ role: "user", content: `user message ${i}` });
    history.push({ role: "assistant", content: `assistant reply ${i}` });
  }
  return history;
}

describe("estimateMessageTokens", () => {
  it("returns Math.ceil(JSON.stringify(messages).length / 4)", () => {
    const messages: Message[] = [{ role: "user", content: "hello" }];
    const expected = Math.ceil(JSON.stringify(messages).length / 4);
    expect(estimateMessageTokens(messages)).toBe(expected);
    // Sanity: a known small fixture is deterministic.
    expect(estimateMessageTokens([])).toBe(Math.ceil("[]".length / 4));
  });
});

describe("ContextCompactor.shouldCompact", () => {
  it("returns false when estimated tokens are below the threshold", () => {
    const { provider } = createScriptedProvider();
    const compactor = makeCompactor(provider, {
      thresholdTokens: 1_000_000,
      keepRecent: 2
    });
    const history = makeSimpleHistory(10);
    expect(compactor.shouldCompact(history)).toBe(false);
  });

  it("returns false when over threshold but <= keepRecent + 1 messages", () => {
    const { provider } = createScriptedProvider();
    const compactor = makeCompactor(provider, {
      thresholdTokens: 0,
      keepRecent: 8
    });
    // 3 messages, keepRecent + 1 = 9 → nothing older worth folding.
    const history: Message[] = [
      { role: "system", content: "S" },
      { role: "user", content: "u" },
      { role: "assistant", content: "a" }
    ];
    expect(compactor.shouldCompact(history)).toBe(false);
  });

  it("returns true when over threshold AND a compactible prefix exists", () => {
    const { provider } = createScriptedProvider();
    const compactor = makeCompactor(provider, {
      thresholdTokens: 0,
      keepRecent: 2
    });
    const history = makeSimpleHistory(10);
    expect(compactor.shouldCompact(history)).toBe(true);
  });
});

describe("ContextCompactor.compact", () => {
  it("preserves the system message at index 0 unchanged", async () => {
    const { provider } = createScriptedProvider();
    const compactor = makeCompactor(provider, { keepRecent: 2 });
    const history = makeSimpleHistory(6);
    const system = history[0];

    const result = await compactor.compact(history);

    expect(result[0]).toBe(system);
    expect(result[0].role).toBe("system");
    expect(result[0].content).toBe("SYSTEM PROMPT");
  });

  it("keeps exactly the last keepRecent messages as the tail", async () => {
    const { provider } = createScriptedProvider();
    const keepRecent = 3;
    const compactor = makeCompactor(provider, { keepRecent });
    const history = makeSimpleHistory(6); // 1 system + 12 messages
    const expectedTail = history.slice(history.length - keepRecent);

    const result = await compactor.compact(history);

    const actualTail = result.slice(result.length - keepRecent);
    expect(actualTail).toEqual(expectedTail);
    // Result is: system + summary + tail.
    expect(result.length).toBe(2 + keepRecent);
  });

  it("replaces the older prefix with a single user summary message", async () => {
    const { provider } = createScriptedProvider();
    const compactor = makeCompactor(provider, { keepRecent: 2 });
    const history = makeSimpleHistory(6);

    const result = await compactor.compact(history);

    const summary = result[1];
    // Must be a user turn, not assistant: after a provider hoists the system
    // message out, the array would otherwise begin with `assistant` and be
    // rejected (e.g. Anthropic's "first message must use the 'user' role").
    expect(summary.role).toBe("user");
    expect(result[0].role).toBe("system");
    expect(typeof summary.content).toBe("string");
    expect(summary.content as string).toContain(SUMMARY_TEXT);
  });

  it("calls generateMessageTraced exactly once with no tools and threaded model/threadId", async () => {
    const { provider, generateMessageTraced } = createScriptedProvider();
    const compactor = makeCompactor(provider, { keepRecent: 2 }, "thread-xyz");
    const history = makeSimpleHistory(6);

    await compactor.compact(history);

    expect(generateMessageTraced).toHaveBeenCalledTimes(1);
    const callArgs = generateMessageTraced.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(callArgs.tools).toBeUndefined();
    expect(callArgs.model).toBe("scripted-model");
    expect(callArgs.threadId).toBe("thread-xyz");
    // Exactly the summary system + user messages.
    const msgs = callArgs.messages as Message[];
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
  });

  it("respects tool-call/tool-result boundaries: tail never starts with an orphan tool message, prefix never ends on a dangling tool call", async () => {
    const { provider } = createScriptedProvider();
    // keepRecent positioned so the naive window would split a tool group.
    const compactor = makeCompactor(provider, { keepRecent: 2 });

    // Layout (index): 0 system, 1 user, 2 assistant(toolCalls), 3 tool, 4 tool,
    // 5 assistant, 6 user. With keepRecent=2 the naive tail is [5,6]; the split
    // logic must not strand index 3/4 tool messages without their owner (2).
    const history: Message[] = [
      { role: "system", content: "S" },
      { role: "user", content: "do work" },
      {
        role: "assistant",
        content: "calling tools",
        toolCalls: [
          { id: "call_a", name: "search", args: {} },
          { id: "call_b", name: "fetch", args: {} }
        ]
      },
      { role: "tool", toolCallId: "call_a", content: "result a" },
      { role: "tool", toolCallId: "call_b", content: "result b" },
      { role: "assistant", content: "analysis" },
      { role: "user", content: "continue" }
    ];

    const result = await compactor.compact(history);

    // Invariant: for every tool message in the result, the immediately
    // preceding assistant message carries a matching toolCall id.
    for (let i = 0; i < result.length; i++) {
      if (result[i].role !== "tool") continue;
      const toolCallId = result[i].toolCallId;
      const prev = result[i - 1];
      expect(prev).toBeDefined();
      expect(prev.role).toBe("assistant");
      const ids = (prev.toolCalls ?? []).map((c) => c.id);
      expect(ids).toContain(toolCallId);
    }

    // The tail must not begin with an orphan tool message.
    const summaryIndex = result.findIndex(
      (m) =>
        m.role === "user" &&
        typeof m.content === "string" &&
        m.content.startsWith("<compacted summary>")
    );
    expect(summaryIndex).toBe(1);
    expect(result[summaryIndex + 1]?.role).not.toBe("tool");
  });

  it("returns the original messages unchanged when the provider throws (best-effort)", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const { provider, generateMessageTraced } = createScriptedProvider({
      throws: true
    });
    const compactor = makeCompactor(provider, { keepRecent: 2 });
    const history = makeSimpleHistory(6);
    const snapshot = JSON.parse(JSON.stringify(history));

    const result = await compactor.compact(history);

    expect(generateMessageTraced).toHaveBeenCalledTimes(1);
    // Same array reference returned, structurally equal to the input.
    expect(result).toBe(history);
    expect(JSON.parse(JSON.stringify(result))).toEqual(snapshot);
    warnSpy.mockRestore();
  });

  it("returns messages unchanged when there is no older prefix to fold", async () => {
    const { provider, generateMessageTraced } = createScriptedProvider();
    // keepRecent large enough that the split leaves no olderPrefix.
    const compactor = makeCompactor(provider, { keepRecent: 100 });
    const history = makeSimpleHistory(2); // 1 system + 4 messages
    const snapshot = JSON.parse(JSON.stringify(history));

    const result = await compactor.compact(history);

    expect(generateMessageTraced).not.toHaveBeenCalled();
    expect(result).toBe(history);
    expect(JSON.parse(JSON.stringify(result))).toEqual(snapshot);
  });
});
