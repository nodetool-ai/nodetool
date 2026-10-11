import { describe, it, expect, vi } from "vitest";
import { MetaProvider } from "../../src/providers/meta-provider.js";
import type { Message } from "../../src/providers/types.js";

const FALLBACK = [
  { id: "muse-spark-1.3", name: "muse-spark-1.3", provider: "meta" },
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

  it("serves only Meta's own media models", async () => {
    const provider = new MetaProvider(
      { META_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.getAvailableTTSModels()).toEqual([]);
    expect(await provider.getAvailableVideoModels()).toEqual([]);
    expect(await provider.getAvailableEmbeddingModels()).toEqual([]);
    expect(await provider.getAvailableASRModels()).toEqual([
      {
        id: "muse-voice-transcribe-1.0",
        name: "Muse Voice Transcribe 1.0",
        provider: "meta"
      }
    ]);
    expect(
      (await provider.getAvailableImageModels()).map((m) => [
        m.id,
        m.supportedTasks
      ])
    ).toEqual([
      ["muse-image-1.0", ["text_to_image", "image_to_image"]],
      ["sam-3.1", ["segment"]]
    ]);
    expect(provider.getCapabilities()).toEqual(
      expect.arrayContaining([
        "text_to_image",
        "image_to_image",
        "segment_image",
        "automatic_speech_recognition"
      ])
    );
  });

  it("keeps media models out of the language model list", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "muse-spark-1.3" },
          { id: "muse-image-1.0" },
          { id: "muse-voice-transcribe-1.0" },
          { id: "sam-3.1" }
        ]
      })
    });
    const provider = new MetaProvider(
      { META_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    expect(await provider.getAvailableLanguageModels()).toEqual([
      { id: "muse-spark-1.3", name: "muse-spark-1.3", provider: "meta" }
    ]);
  });

  it("generates a non-streaming message through the Responses API", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "resp_1",
      output_text: "meta response",
      output: []
    });
    const fetchMock = vi.fn();
    const provider = new MetaProvider(
      { META_API_KEY: "k" },
      {
        client: { responses: { create } } as any,
        fetchFn: fetchMock as unknown as typeof fetch
      }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "muse-spark-1.3"
    });

    expect(result).toMatchObject({
      role: "assistant",
      content: "meta response"
    });
    expect(create.mock.calls[0][0]).toMatchObject({
      model: "muse-spark-1.3",
      input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }]
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("streams messages through the Responses API", async () => {
    const create = vi.fn().mockResolvedValue(
      (async function* () {
        yield { type: "response.created", response: { id: "resp_1" } };
        yield { type: "response.output_text.delta", delta: "hello" };
        yield {
          type: "response.completed",
          response: { id: "resp_1", usage: { input_tokens: 3, output_tokens: 1 } }
        };
      })()
    );
    const provider = new MetaProvider(
      { META_API_KEY: "k" },
      { client: { responses: { create } } as any }
    );

    const messages: Message[] = [{ role: "user", content: "hi" }];
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages,
      model: "muse-spark-1.3"
    })) {
      items.push(item);
    }

    expect(create.mock.calls[0][0]).toMatchObject({ stream: true });
    expect(items).toContainEqual({
      type: "chunk",
      content: "hello",
      done: false
    });
    expect(items.at(-1)).toEqual({ type: "chunk", content: "", done: true });
  });
});
