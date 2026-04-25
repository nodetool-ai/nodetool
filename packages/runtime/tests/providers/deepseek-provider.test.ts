import { describe, it, expect, vi } from "vitest";
import { DeepSeekProvider } from "../../src/providers/deepseek-provider.js";
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
    }
  };
}

describe("DeepSeekProvider", () => {
  it("throws if DEEPSEEK_API_KEY is missing", () => {
    expect(() => new DeepSeekProvider({})).toThrow(
      "DEEPSEEK_API_KEY is required"
    );
  });

  it("reports provider id as deepseek", () => {
    const provider = new DeepSeekProvider(
      { DEEPSEEK_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.provider).toBe("deepseek");
  });

  it("returns required secrets", () => {
    expect(DeepSeekProvider.requiredSecrets()).toEqual(["DEEPSEEK_API_KEY"]);
  });

  it("returns container env with DEEPSEEK_API_KEY", () => {
    const provider = new DeepSeekProvider(
      { DEEPSEEK_API_KEY: "test-key" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({
      DEEPSEEK_API_KEY: "test-key"
    });
  });

  it("has tool support for all models", async () => {
    const provider = new DeepSeekProvider(
      { DEEPSEEK_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("deepseek-chat")).toBe(true);
  });

  it("fetches available language models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "deepseek-chat", name: "DeepSeek V3" },
          { id: "deepseek-reasoner" }
        ]
      })
    });

    const provider = new DeepSeekProvider(
      { DEEPSEEK_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      {
        id: "deepseek-chat",
        name: "DeepSeek V3",
        provider: "deepseek"
      },
      {
        id: "deepseek-reasoner",
        name: "deepseek-reasoner",
        provider: "deepseek"
      }
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.deepseek.com/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer k" }
      })
    );
  });

  it("returns empty list when model fetch fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new DeepSeekProvider(
      { DEEPSEEK_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([]);
  });

  it("generates non-streaming message via inherited OpenAI logic", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "deepseek response",
            tool_calls: null
          }
        }
      ]
    });

    const provider = new DeepSeekProvider(
      { DEEPSEEK_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create } }
        } as any
      }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "deepseek-chat"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("deepseek response");
  });

  it("streams messages via inherited OpenAI logic", async () => {
    const chunks = [
      {
        choices: [{ delta: { content: "hello" }, finish_reason: null }]
      },
      {
        choices: [{ delta: { content: "" }, finish_reason: "stop" }]
      }
    ];

    const create = vi.fn().mockResolvedValue(makeAsyncIterable(chunks));

    const provider = new DeepSeekProvider(
      { DEEPSEEK_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create } }
        } as any
      }
    );

    const messages: Message[] = [{ role: "user", content: "hi" }];
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages,
      model: "deepseek-chat"
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});
