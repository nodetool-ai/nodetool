import { describe, it, expect, vi } from "vitest";
import { EvolinkProvider } from "../../src/providers/evolink-provider.js";
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

describe("EvolinkProvider", () => {
  it("throws if EVOLINK_API_KEY is missing", () => {
    expect(() => new EvolinkProvider({})).toThrow(
      "EVOLINK_API_KEY is required"
    );
  });

  it("reports provider id as evolink", () => {
    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.provider).toBe("evolink");
  });

  it("returns required secrets", () => {
    expect(EvolinkProvider.requiredSecrets()).toEqual(["EVOLINK_API_KEY"]);
  });

  it("returns container env with EVOLINK_API_KEY", () => {
    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "test-key" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({
      EVOLINK_API_KEY: "test-key"
    });
  });

  it("has tool support for all models", async () => {
    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("gpt-5.2")).toBe(true);
  });

  it("fetches available language models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "gpt-5.2", name: "GPT-5.2" },
          { id: "claude" }
        ]
      })
    });

    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      {
        id: "gpt-5.2",
        name: "GPT-5.2",
        provider: "evolink"
      },
      {
        id: "claude",
        name: "claude",
        provider: "evolink"
      }
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://direct.evolink.ai/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer k" }
      })
    );
  });

  it("returns empty list when model fetch fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "k" },
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
            content: "evolink response",
            tool_calls: null
          }
        }
      ]
    });

    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create } }
        } as any
      }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "gpt-5.2"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("evolink response");
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

    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "k" },
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
      model: "gpt-5.2"
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});
