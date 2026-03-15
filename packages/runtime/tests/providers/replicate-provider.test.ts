import { describe, it, expect, vi } from "vitest";
import { ReplicateProvider } from "../../src/providers/replicate-provider.js";
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

describe("ReplicateProvider", () => {
  it("throws if REPLICATE_API_TOKEN is missing", () => {
    expect(() => new ReplicateProvider({})).toThrow(
      "REPLICATE_API_TOKEN is required"
    );
  });

  it("reports provider id as replicate", () => {
    const provider = new ReplicateProvider(
      { REPLICATE_API_TOKEN: "r8_test" },
      { client: {} as any }
    );
    expect(provider.provider).toBe("replicate");
  });

  it("returns required secrets", () => {
    expect(ReplicateProvider.requiredSecrets()).toEqual([
      "REPLICATE_API_TOKEN",
    ]);
  });

  it("returns container env with REPLICATE_API_TOKEN", () => {
    const provider = new ReplicateProvider(
      { REPLICATE_API_TOKEN: "r8_test" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({
      REPLICATE_API_TOKEN: "r8_test",
    });
  });

  it("has tool support for all models", async () => {
    const provider = new ReplicateProvider(
      { REPLICATE_API_TOKEN: "r8_test" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("meta/meta-llama-3-70b")).toBe(true);
  });

  it("returns a non-empty list of language models", async () => {
    const provider = new ReplicateProvider(
      { REPLICATE_API_TOKEN: "r8_test" },
      { client: {} as any }
    );
    const models = await provider.getAvailableLanguageModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].provider).toBe("replicate");
    expect(models.some((m) => m.id.includes("llama"))).toBe(true);
  });

  it("returns a non-empty list of image models", async () => {
    const provider = new ReplicateProvider(
      { REPLICATE_API_TOKEN: "r8_test" },
      { client: {} as any }
    );
    const models = await provider.getAvailableImageModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].provider).toBe("replicate");
    expect(models.some((m) => m.id.includes("flux"))).toBe(true);
  });

  it("generates non-streaming message via inherited OpenAI logic", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "hello from replicate",
            tool_calls: null,
          },
        },
      ],
    });

    const provider = new ReplicateProvider(
      { REPLICATE_API_TOKEN: "r8_test" },
      {
        client: {
          chat: { completions: { create } },
        } as any,
      }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "meta/meta-llama-3-70b-instruct",
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("hello from replicate");
    expect(create).toHaveBeenCalled();
  });

  it("streams messages via inherited OpenAI logic", async () => {
    const chunks = [
      {
        choices: [
          {
            delta: { content: "streaming " },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [
          {
            delta: { content: "response" },
            finish_reason: "stop",
          },
        ],
      },
    ];

    const create = vi.fn().mockResolvedValue(makeAsyncIterable(chunks));

    const provider = new ReplicateProvider(
      { REPLICATE_API_TOKEN: "r8_test" },
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
      model: "meta/meta-llama-3-70b-instruct",
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it("textToImage creates prediction and fetches image", async () => {
    const fakeImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    const mockFetch = vi
      .fn()
      // First call: create prediction
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pred123",
          status: "succeeded",
          output: ["https://replicate.delivery/image.png"],
        }),
      })
      // Second call: download image
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => fakeImageBytes.buffer,
      });

    const provider = new ReplicateProvider(
      { REPLICATE_API_TOKEN: "r8_test" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const result = await provider.textToImage({
      model: {
        id: "black-forest-labs/flux-schnell",
        name: "FLUX Schnell",
        provider: "replicate",
      },
      prompt: "a cat",
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(4);

    // Verify prediction creation call
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [createUrl, createOpts] = mockFetch.mock.calls[0];
    expect(createUrl).toContain("models/black-forest-labs/flux-schnell/predictions");
    expect(createOpts.method).toBe("POST");
    const body = JSON.parse(createOpts.body);
    expect(body.input.prompt).toBe("a cat");
  });

  it("textToImage throws on empty prompt", async () => {
    const provider = new ReplicateProvider(
      { REPLICATE_API_TOKEN: "r8_test" },
      { client: {} as any }
    );

    await expect(
      provider.textToImage({
        model: {
          id: "black-forest-labs/flux-schnell",
          name: "FLUX Schnell",
          provider: "replicate",
        },
        prompt: "",
      })
    ).rejects.toThrow("prompt cannot be empty");
  });

  it("textToImage polls when prediction is processing", async () => {
    const fakeImageBytes = new Uint8Array([0xff, 0xd8]);

    const mockFetch = vi
      .fn()
      // Create prediction (still processing)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pred456",
          status: "processing",
          urls: { get: "https://api.replicate.com/v1/predictions/pred456" },
        }),
      })
      // Poll (succeeded)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pred456",
          status: "succeeded",
          output: "https://replicate.delivery/result.png",
        }),
      })
      // Download image
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => fakeImageBytes.buffer,
      });

    const provider = new ReplicateProvider(
      { REPLICATE_API_TOKEN: "r8_test" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const result = await provider.textToImage({
      model: {
        id: "stability-ai/sdxl",
        name: "SDXL",
        provider: "replicate",
      },
      prompt: "a dog",
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
