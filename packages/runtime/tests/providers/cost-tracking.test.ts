import { describe, it, expect, vi } from "vitest";
import { OpenAIProvider } from "../../src/providers/openai-provider.js";
import { AnthropicProvider } from "../../src/providers/anthropic-provider.js";
import type { Message } from "../../src/providers/types.js";

function makeAsyncIterable(items: unknown[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
    async close() {
      return;
    },
  };
}

describe("Cost tracking – BaseProvider", () => {
  it("starts with zero cost", () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.getTotalCost()).toBe(0);
  });

  it("trackUsage accumulates cost", () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );

    const cost1 = provider.trackUsage("gpt-4o", {
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(cost1).toBeGreaterThan(0);
    expect(provider.getTotalCost()).toBe(cost1);

    const cost2 = provider.trackUsage("gpt-4o", {
      inputTokens: 2000,
      outputTokens: 1000,
    });
    expect(provider.getTotalCost()).toBe(cost1 + cost2);
  });

  it("resetCost clears accumulated cost", () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );

    provider.trackUsage("gpt-4o", { inputTokens: 1000, outputTokens: 500 });
    expect(provider.getTotalCost()).toBeGreaterThan(0);

    provider.resetCost();
    expect(provider.getTotalCost()).toBe(0);
  });

  it("returns 0 for unknown models", () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );

    const cost = provider.trackUsage("unknown-model-xyz", {
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(cost).toBe(0);
  });
});

describe("Cost tracking – OpenAI generateMessage", () => {
  it("tracks cost from non-streaming response usage", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: { content: "hello", tool_calls: null },
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
      },
    });

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create } },
        } as any,
      }
    );

    const messages: Message[] = [{ role: "user", content: "hi" }];
    await provider.generateMessage({ messages, model: "gpt-4o" });

    expect(provider.getTotalCost()).toBeGreaterThan(0);
  });

  it("does not crash if usage is missing", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: { content: "hello", tool_calls: null },
        },
      ],
    });

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create } },
        } as any,
      }
    );

    const messages: Message[] = [{ role: "user", content: "hi" }];
    await provider.generateMessage({ messages, model: "gpt-4o" });

    expect(provider.getTotalCost()).toBe(0);
  });
});

describe("Cost tracking – OpenAI generateMessages (streaming)", () => {
  it("tracks cost from streaming usage chunk", async () => {
    const chunks = [
      {
        choices: [
          { delta: { content: "hi" }, finish_reason: null },
        ],
      },
      {
        choices: [
          { delta: { content: "" }, finish_reason: "stop" },
        ],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 100,
        },
      },
    ];

    const create = vi.fn().mockResolvedValue(makeAsyncIterable(chunks));

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create } },
        } as any,
      }
    );

    const messages: Message[] = [{ role: "user", content: "hi" }];
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages,
      model: "gpt-4o",
    })) {
      items.push(item);
    }

    expect(provider.getTotalCost()).toBeGreaterThan(0);
  });
});

describe("Cost tracking – Anthropic generateMessage", () => {
  it("tracks cost from non-streaming response usage", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "hello" }],
      usage: {
        input_tokens: 150,
        output_tokens: 75,
      },
    });

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      {
        client: {
          messages: { create: mockCreate, stream: vi.fn() },
        } as any,
      }
    );

    const messages: Message[] = [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "hi" },
    ];
    await provider.generateMessage({
      messages,
      model: "claude-3-5-sonnet-20241022",
    });

    expect(provider.getTotalCost()).toBeGreaterThan(0);
  });
});

describe("Cost tracking – Anthropic generateMessages (streaming)", () => {
  it("tracks cost from streaming events", async () => {
    const events = [
      {
        type: "message_start",
        message: {
          usage: { input_tokens: 200 },
        },
      },
      {
        type: "content_block_delta",
        delta: { text: "hello" },
      },
      {
        type: "message_delta",
        usage: { output_tokens: 100 },
      },
      {
        type: "message_stop",
      },
    ];

    const mockStream = vi.fn().mockReturnValue(makeAsyncIterable(events));

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      {
        client: {
          messages: { create: vi.fn(), stream: mockStream },
        } as any,
      }
    );

    const messages: Message[] = [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "hi" },
    ];
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages,
      model: "claude-3-5-sonnet-20241022",
    })) {
      items.push(item);
    }

    expect(provider.getTotalCost()).toBeGreaterThan(0);
  });
});
