import { describe, it, expect, vi } from "vitest";
import { TogetherProvider } from "../../src/providers/together-provider.js";
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

describe("TogetherProvider", () => {
  it("throws if TOGETHER_API_KEY is missing", () => {
    expect(() => new TogetherProvider({})).toThrow(
      "TOGETHER_API_KEY is required"
    );
  });

  it("reports provider id as together", () => {
    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.provider).toBe("together");
  });

  it("returns required secrets", () => {
    expect(TogetherProvider.requiredSecrets()).toEqual([
      "TOGETHER_API_KEY",
    ]);
  });

  it("returns container env with TOGETHER_API_KEY", () => {
    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "test-key" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({
      TOGETHER_API_KEY: "test-key",
    });
  });

  it("has tool support for all models", async () => {
    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("meta-llama/Llama-3-70b")).toBe(true);
  });

  it("fetches available language models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "meta-llama/Llama-3-70b",
            display_name: "Llama 3 70B",
            type: "chat",
          },
          { id: "mistralai/Mixtral-8x7B", type: "language" },
          { id: "stabilityai/sdxl", type: "image" },
        ],
      }),
    });

    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      {
        id: "meta-llama/Llama-3-70b",
        name: "Llama 3 70B",
        provider: "together",
      },
      {
        id: "mistralai/Mixtral-8x7B",
        name: "mistralai/Mixtral-8x7B",
        provider: "together",
      },
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.together.xyz/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer k" },
      })
    );
  });

  it("returns empty list when model fetch fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
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
            content: "together response",
            tool_calls: null,
          },
        },
      ],
    });

    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create } },
        } as any,
      }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "meta-llama/Llama-3-70b",
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("together response");
    expect(create).toHaveBeenCalled();
  });

  it("streams messages via inherited OpenAI logic", async () => {
    const chunks = [
      {
        choices: [
          { delta: { content: "hello" }, finish_reason: null },
        ],
      },
      {
        choices: [
          { delta: { content: "" }, finish_reason: "stop" },
        ],
      },
    ];

    const create = vi.fn().mockResolvedValue(makeAsyncIterable(chunks));

    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
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
      model: "meta-llama/Llama-3-70b",
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});
