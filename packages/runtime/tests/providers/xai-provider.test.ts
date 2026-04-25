import { describe, it, expect, vi } from "vitest";
import { XAIProvider } from "../../src/providers/xai-provider.js";
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

describe("XAIProvider", () => {
  it("throws if XAI_API_KEY is missing", () => {
    expect(() => new XAIProvider({})).toThrow("XAI_API_KEY is required");
  });

  it("reports provider id as xai", () => {
    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.provider).toBe("xai");
  });

  it("returns required secrets", () => {
    expect(XAIProvider.requiredSecrets()).toEqual(["XAI_API_KEY"]);
  });

  it("returns container env with XAI_API_KEY", () => {
    const provider = new XAIProvider(
      { XAI_API_KEY: "test-key" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({
      XAI_API_KEY: "test-key"
    });
  });

  it("has tool support for all models", async () => {
    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("grok-4")).toBe(true);
  });

  it("fetches available language models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "grok-4", name: "Grok 4" },
          { id: "grok-3-mini" }
        ]
      })
    });

    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "grok-4", name: "Grok 4", provider: "xai" },
      { id: "grok-3-mini", name: "grok-3-mini", provider: "xai" }
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.x.ai/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer k" }
      })
    );
  });

  it("returns empty list when model fetch fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
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
            content: "grok response",
            tool_calls: null
          }
        }
      ]
    });

    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create } }
        } as any
      }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "grok-4"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("grok response");
  });

  it("streams messages via inherited OpenAI logic", async () => {
    const chunks = [
      {
        choices: [{ delta: { content: "hi" }, finish_reason: null }]
      },
      {
        choices: [{ delta: { content: "" }, finish_reason: "stop" }]
      }
    ];

    const create = vi.fn().mockResolvedValue(makeAsyncIterable(chunks));

    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
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
      model: "grok-4"
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});
