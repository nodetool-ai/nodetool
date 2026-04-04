import { describe, it, expect, vi } from "vitest";
import { MistralProvider } from "../../src/providers/mistral-provider.js";
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

describe("MistralProvider", () => {
  it("throws if MISTRAL_API_KEY is missing", () => {
    expect(() => new MistralProvider({})).toThrow(
      "MISTRAL_API_KEY is required"
    );
  });

  it("reports provider id as mistral", () => {
    const provider = new MistralProvider(
      { MISTRAL_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.provider).toBe("mistral");
  });

  it("returns required secrets", () => {
    expect(MistralProvider.requiredSecrets()).toEqual(["MISTRAL_API_KEY"]);
  });

  it("returns container env with MISTRAL_API_KEY", () => {
    const provider = new MistralProvider(
      { MISTRAL_API_KEY: "test-key" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({ MISTRAL_API_KEY: "test-key" });
  });

  it("has tool support for all models", async () => {
    const provider = new MistralProvider(
      { MISTRAL_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("mistral-large")).toBe(true);
    expect(await provider.hasToolSupport("pixtral-12b")).toBe(true);
  });

  it("fetches available language models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "mistral-large", name: "Mistral Large" },
          { id: "mistral-small" }
        ]
      })
    });

    const provider = new MistralProvider(
      { MISTRAL_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "mistral-large", name: "Mistral Large", provider: "mistral" },
      { id: "mistral-small", name: "mistral-small", provider: "mistral" }
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.mistral.ai/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer k" }
      })
    );
  });

  it("returns empty list when model fetch fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new MistralProvider(
      { MISTRAL_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([]);
  });

  it("returns embedding models", async () => {
    const provider = new MistralProvider(
      { MISTRAL_API_KEY: "k" },
      { client: {} as any }
    );

    const models = await provider.getAvailableEmbeddingModels();
    expect(models).toEqual([
      {
        id: "mistral-embed",
        name: "Mistral Embed",
        provider: "mistral",
        dimensions: 1024
      }
    ]);
  });

  it("generates non-streaming message via inherited OpenAI logic", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "bonjour",
            tool_calls: null
          }
        }
      ]
    });

    const provider = new MistralProvider(
      { MISTRAL_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create } }
        } as any
      }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "mistral-large"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("bonjour");
  });

  it("streams messages via inherited OpenAI logic", async () => {
    const chunks = [
      {
        choices: [
          {
            delta: { content: "salut" },
            finish_reason: null
          }
        ]
      },
      {
        choices: [
          {
            delta: { content: "" },
            finish_reason: "stop"
          }
        ]
      }
    ];

    const create = vi.fn().mockResolvedValue(makeAsyncIterable(chunks));

    const provider = new MistralProvider(
      { MISTRAL_API_KEY: "k" },
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
      model: "mistral-large"
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it("generates embeddings via OpenAI client", async () => {
    const embeddingsCreate = vi.fn().mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }, { embedding: [0.4, 0.5, 0.6] }]
    });

    const provider = new MistralProvider(
      { MISTRAL_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create: vi.fn() } },
          embeddings: { create: embeddingsCreate }
        } as any
      }
    );

    const result = await provider.generateEmbedding({
      text: ["hello", "world"],
      model: "mistral-embed"
    });

    expect(result).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6]
    ]);
    expect(embeddingsCreate).toHaveBeenCalledWith({
      model: "mistral-embed",
      input: ["hello", "world"]
    });
  });

  it("uses default model mistral-embed when model is empty", async () => {
    const embeddingsCreate = vi.fn().mockResolvedValue({
      data: [{ embedding: [1.0, 2.0] }]
    });

    const provider = new MistralProvider(
      { MISTRAL_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create: vi.fn() } },
          embeddings: { create: embeddingsCreate }
        } as any
      }
    );

    await provider.generateEmbedding({ text: "test", model: "" });
    expect(embeddingsCreate).toHaveBeenCalledWith({
      model: "mistral-embed",
      input: ["test"]
    });
  });

  it("throws on empty text for embeddings", async () => {
    const provider = new MistralProvider(
      { MISTRAL_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create: vi.fn() } },
          embeddings: { create: vi.fn() }
        } as any
      }
    );

    await expect(
      provider.generateEmbedding({ text: [], model: "mistral-embed" })
    ).rejects.toThrow("text must not be empty");

    await expect(
      provider.generateEmbedding({ text: [""], model: "mistral-embed" })
    ).rejects.toThrow("text must not be empty");
  });
});
