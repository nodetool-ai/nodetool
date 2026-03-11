import { describe, it, expect, vi } from "vitest";
import { GroqProvider } from "../../src/providers/groq-provider.js";
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

describe("GroqProvider", () => {
  it("throws if GROQ_API_KEY is missing", () => {
    expect(() => new GroqProvider({})).toThrow("GROQ_API_KEY is required");
  });

  it("reports provider id as groq", () => {
    const provider = new GroqProvider(
      { GROQ_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.provider).toBe("groq");
  });

  it("returns required secrets", () => {
    expect(GroqProvider.requiredSecrets()).toEqual(["GROQ_API_KEY"]);
  });

  it("returns container env with GROQ_API_KEY", () => {
    const provider = new GroqProvider(
      { GROQ_API_KEY: "test-key" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({ GROQ_API_KEY: "test-key" });
  });

  it("has tool support for all models", async () => {
    const provider = new GroqProvider(
      { GROQ_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("llama-3.1-70b")).toBe(true);
    expect(await provider.hasToolSupport("mixtral-8x7b")).toBe(true);
  });

  it("fetches available language models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "llama-3.1-70b", name: "Llama 3.1 70B" },
          { id: "mixtral-8x7b" },
        ],
      }),
    });

    const provider = new GroqProvider(
      { GROQ_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "llama-3.1-70b", name: "Llama 3.1 70B", provider: "groq" },
      { id: "mixtral-8x7b", name: "mixtral-8x7b", provider: "groq" },
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer k" },
      })
    );
  });

  it("returns empty list when model fetch fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new GroqProvider(
      { GROQ_API_KEY: "k" },
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
            content: "fast response",
            tool_calls: null,
          },
        },
      ],
    });

    const provider = new GroqProvider(
      { GROQ_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create } },
        } as any,
      }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "llama-3.1-70b",
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("fast response");
    expect(create).toHaveBeenCalled();
  });

  it("streams messages via inherited OpenAI logic", async () => {
    const chunks = [
      {
        choices: [
          {
            delta: { content: "hello" },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [
          {
            delta: { content: "" },
            finish_reason: "stop",
          },
        ],
      },
    ];

    const create = vi.fn().mockResolvedValue(makeAsyncIterable(chunks));

    const provider = new GroqProvider(
      { GROQ_API_KEY: "k" },
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
      model: "llama-3.1-70b",
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});
