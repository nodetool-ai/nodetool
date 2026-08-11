import { describe, it, expect, vi } from "vitest";
import { MetaProvider } from "../../src/providers/meta-provider.js";
import type { Message } from "../../src/providers/types.js";
import {
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch
} from "./helpers/compat-fetch.js";

const FALLBACK = [
  { id: "muse-spark-1.2", name: "muse-spark-1.2", provider: "meta" },
  {
    id: "muse-spark-1.2-contributor",
    name: "muse-spark-1.2-contributor",
    provider: "meta"
  },
  { id: "muse-spark-1.1", name: "muse-spark-1.1", provider: "meta" }
];

describe("MetaProvider", () => {
  it("throws if META_API_KEY is missing", () => {
    expect(() => new MetaProvider({})).toThrow("META_API_KEY is required");
  });

  it("throws if META_API_KEY is blank", () => {
    expect(() => new MetaProvider({ META_API_KEY: "  " })).toThrow(
      "META_API_KEY is required"
    );
  });

  it("reports provider id as meta", () => {
    const provider = new MetaProvider(
      { META_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.provider).toBe("meta");
  });

  it("returns required secrets", () => {
    expect(MetaProvider.requiredSecrets()).toEqual(["META_API_KEY"]);
  });

  it("returns container env with META_API_KEY", () => {
    const provider = new MetaProvider(
      { META_API_KEY: "test-key" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({ META_API_KEY: "test-key" });
  });

  it("has tool support for all models", async () => {
    const provider = new MetaProvider(
      { META_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("muse-spark-1.2")).toBe(true);
  });

  it("fetches available language models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "muse-spark-1.2", name: "Muse Spark 1.2" },
          { id: "muse-spark-1.1" },
          { id: "" }
        ]
      })
    });

    const provider = new MetaProvider(
      { META_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    expect(await provider.getAvailableLanguageModels()).toEqual([
      { id: "muse-spark-1.2", name: "Muse Spark 1.2", provider: "meta" },
      { id: "muse-spark-1.1", name: "muse-spark-1.1", provider: "meta" }
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.meta.ai/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer k" }
      })
    );
  });

  it("falls back to the known models when the model fetch fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new MetaProvider(
      { META_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    expect(await provider.getAvailableLanguageModels()).toEqual(FALLBACK);
  });

  it("falls back to the known models when the listing is empty", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    const provider = new MetaProvider(
      { META_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    expect(await provider.getAvailableLanguageModels()).toEqual(FALLBACK);
  });

  it("suppresses inherited OpenAI media and embedding models", async () => {
    const provider = new MetaProvider(
      { META_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.getAvailableTTSModels()).toEqual([]);
    expect(await provider.getAvailableASRModels()).toEqual([]);
    expect(await provider.getAvailableVideoModels()).toEqual([]);
    expect(await provider.getAvailableImageModels()).toEqual([]);
    expect(await provider.getAvailableEmbeddingModels()).toEqual([]);
  });

  it("generates non-streaming message via the compat chat client", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [{ message: { content: "meta response", tool_calls: null } }]
      })
    );

    const provider = new MetaProvider(
      { META_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "muse-spark-1.2"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("meta response");
  });

  it("streams messages via the compat chat client", async () => {
    const chunks = [
      { choices: [{ delta: { content: "hello" }, finish_reason: null }] },
      { choices: [{ delta: { content: "" }, finish_reason: "stop" }] }
    ];

    const fetchMock = mockChatFetch(() => chatSSEResponse(chunks));

    const provider = new MetaProvider(
      { META_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hi" }];
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages,
      model: "muse-spark-1.2"
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});
