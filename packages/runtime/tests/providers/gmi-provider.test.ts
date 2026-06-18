import { describe, it, expect, vi } from "vitest";
import { GMIProvider } from "../../src/providers/gmi-provider.js";
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

describe("GMIProvider", () => {
  it("throws if GMI_API_KEY is missing", () => {
    expect(() => new GMIProvider({})).toThrow("GMI_API_KEY is required");
  });

  it("reports provider id as gmi", () => {
    const provider = new GMIProvider(
      { GMI_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.provider).toBe("gmi");
  });

  it("returns required secrets", () => {
    expect(GMIProvider.requiredSecrets()).toEqual(["GMI_API_KEY"]);
  });

  it("returns container env with GMI_API_KEY", () => {
    const provider = new GMIProvider(
      { GMI_API_KEY: "test-key" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({ GMI_API_KEY: "test-key" });
  });

  it("has tool support for all models", async () => {
    const provider = new GMIProvider(
      { GMI_API_KEY: "k" },
      { client: {} as any }
    );
    expect(
      await provider.hasToolSupport("meta-llama/Llama-3.3-70B-Instruct")
    ).toBe(true);
  });

  it("fetches available language models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "meta-llama/Llama-3.3-70B-Instruct",
            name: "Llama 3.3 70B"
          },
          { id: "deepseek-ai/DeepSeek-V3" }
        ]
      })
    });

    const provider = new GMIProvider(
      { GMI_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      {
        id: "meta-llama/Llama-3.3-70B-Instruct",
        name: "Llama 3.3 70B",
        provider: "gmi"
      },
      {
        id: "deepseek-ai/DeepSeek-V3",
        name: "deepseek-ai/DeepSeek-V3",
        provider: "gmi"
      }
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.gmi-serving.com/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer k" }
      })
    );
  });

  it("returns empty list when model fetch fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new GMIProvider(
      { GMI_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    expect(await provider.getAvailableLanguageModels()).toEqual([]);
  });

  it("suppresses inherited OpenAI media and embedding models", async () => {
    const provider = new GMIProvider(
      { GMI_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.getAvailableTTSModels()).toEqual([]);
    expect(await provider.getAvailableASRModels()).toEqual([]);
    expect(await provider.getAvailableVideoModels()).toEqual([]);
    expect(await provider.getAvailableImageModels()).toEqual([]);
    expect(await provider.getAvailableEmbeddingModels()).toEqual([]);
  });

  it("generates non-streaming message via inherited OpenAI logic", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "gmi response",
            tool_calls: null
          }
        }
      ]
    });

    const provider = new GMIProvider(
      { GMI_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create } }
        } as any
      }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "meta-llama/Llama-3.3-70B-Instruct"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("gmi response");
  });

  it("streams messages via inherited OpenAI logic", async () => {
    const chunks = [
      { choices: [{ delta: { content: "hello" }, finish_reason: null }] },
      { choices: [{ delta: { content: "" }, finish_reason: "stop" }] }
    ];

    const create = vi.fn().mockResolvedValue(makeAsyncIterable(chunks));

    const provider = new GMIProvider(
      { GMI_API_KEY: "k" },
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
      model: "meta-llama/Llama-3.3-70B-Instruct"
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});
