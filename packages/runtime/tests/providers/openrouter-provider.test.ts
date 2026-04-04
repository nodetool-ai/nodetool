import { describe, it, expect, vi } from "vitest";
import { OpenRouterProvider } from "../../src/providers/openrouter-provider.js";
import type { Message, TextToImageParams } from "../../src/providers/types.js";

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

describe("OpenRouterProvider", () => {
  it("throws if OPENROUTER_API_KEY is missing", () => {
    expect(() => new OpenRouterProvider({})).toThrow(
      "OPENROUTER_API_KEY is required"
    );
  });

  it("reports provider id as openrouter", () => {
    const provider = new OpenRouterProvider(
      { OPENROUTER_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.provider).toBe("openrouter");
  });

  it("returns required secrets", () => {
    expect(OpenRouterProvider.requiredSecrets()).toEqual([
      "OPENROUTER_API_KEY"
    ]);
  });

  it("returns container env with OPENROUTER_API_KEY", () => {
    const provider = new OpenRouterProvider(
      { OPENROUTER_API_KEY: "test-key" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({
      OPENROUTER_API_KEY: "test-key"
    });
  });

  it("reports tool support with o1/o3 exceptions", async () => {
    const provider = new OpenRouterProvider(
      { OPENROUTER_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("gpt-4o")).toBe(true);
    expect(await provider.hasToolSupport("claude-3-opus")).toBe(true);
    expect(await provider.hasToolSupport("openai/o1-mini")).toBe(false);
    expect(await provider.hasToolSupport("openai/o3-mini")).toBe(false);
  });

  it("fetches available language models with extra headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "openai/gpt-4o", name: "GPT-4o" },
          { id: "anthropic/claude-3-opus" }
        ]
      })
    });

    const provider = new OpenRouterProvider(
      { OPENROUTER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "openai/gpt-4o", name: "GPT-4o", provider: "openrouter" },
      {
        id: "anthropic/claude-3-opus",
        name: "anthropic/claude-3-opus",
        provider: "openrouter"
      }
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer k",
          "HTTP-Referer": "https://github.com/nodetool-ai/nodetool-core",
          "X-Title": "NodeTool"
        })
      })
    );
  });

  it("returns empty list when model fetch fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new OpenRouterProvider(
      { OPENROUTER_API_KEY: "k" },
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
            content: "routed response",
            tool_calls: null
          }
        }
      ]
    });

    const provider = new OpenRouterProvider(
      { OPENROUTER_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create } }
        } as any
      }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "openai/gpt-4o"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("routed response");
  });

  it("streams messages via inherited OpenAI logic", async () => {
    const chunks = [
      {
        choices: [
          {
            delta: { content: "streamed" },
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

    const provider = new OpenRouterProvider(
      { OPENROUTER_API_KEY: "k" },
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
      model: "openai/gpt-4o"
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  describe("o1/o3 system message conversion", () => {
    it("converts system messages to user with Instructions prefix for o1 models", async () => {
      const create = vi.fn().mockResolvedValue({
        choices: [
          {
            message: { content: "ok", tool_calls: null }
          }
        ]
      });

      const provider = new OpenRouterProvider(
        { OPENROUTER_API_KEY: "k" },
        {
          client: {
            chat: { completions: { create } }
          } as any
        }
      );

      const messages: Message[] = [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "hello" }
      ];

      await provider.generateMessage({
        messages,
        model: "openai/o1-preview"
      });

      // The first message should have been converted from system to user
      const sentMessages = create.mock.calls[0][0].messages;
      expect(sentMessages[0].role).toBe("user");
      expect(sentMessages[0].content).toBe("Instructions: You are helpful.");
    });

    it("converts system messages to user for o3 models in streaming", async () => {
      const chunks = [
        {
          choices: [
            {
              delta: { content: "ok" },
              finish_reason: "stop"
            }
          ]
        }
      ];

      const create = vi.fn().mockResolvedValue(makeAsyncIterable(chunks));

      const provider = new OpenRouterProvider(
        { OPENROUTER_API_KEY: "k" },
        {
          client: {
            chat: { completions: { create } }
          } as any
        }
      );

      const messages: Message[] = [
        { role: "system", content: "Be concise." },
        { role: "user", content: "hi" }
      ];

      const items: unknown[] = [];
      for await (const item of provider.generateMessages({
        messages,
        model: "openai/o3-mini"
      })) {
        items.push(item);
      }

      const sentMessages = create.mock.calls[0][0].messages;
      expect(sentMessages[0].role).toBe("user");
      expect(sentMessages[0].content).toBe("Instructions: Be concise.");
    });

    it("does not convert system messages for non-o1/o3 models", async () => {
      const create = vi.fn().mockResolvedValue({
        choices: [
          {
            message: { content: "ok", tool_calls: null }
          }
        ]
      });

      const provider = new OpenRouterProvider(
        { OPENROUTER_API_KEY: "k" },
        {
          client: {
            chat: { completions: { create } }
          } as any
        }
      );

      const messages: Message[] = [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "hello" }
      ];

      await provider.generateMessage({
        messages,
        model: "anthropic/claude-3-opus"
      });

      const sentMessages = create.mock.calls[0][0].messages;
      expect(sentMessages[0].role).toBe("system");
    });
  });

  describe("image generation", () => {
    it("generates images via OpenAI images API", async () => {
      const imageGenerate = vi.fn().mockResolvedValue({
        data: [
          {
            b64_json: Buffer.from("fake-image-data").toString("base64")
          }
        ]
      });

      const provider = new OpenRouterProvider(
        { OPENROUTER_API_KEY: "k" },
        {
          client: {
            chat: { completions: { create: vi.fn() } },
            images: { generate: imageGenerate }
          } as any
        }
      );

      const params: TextToImageParams = {
        model: {
          id: "openai/dall-e-3",
          name: "DALL-E 3",
          provider: "openrouter"
        },
        prompt: "A cat in a hat"
      };

      const result = await provider.textToImage(params);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
      expect(imageGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "openai/dall-e-3",
          prompt: "A cat in a hat"
        })
      );
    });

    it("fetches image from URL when b64_json is not available", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8)
      });

      const imageGenerate = vi.fn().mockResolvedValue({
        data: [{ url: "https://example.com/image.png" }]
      });

      const provider = new OpenRouterProvider(
        { OPENROUTER_API_KEY: "k" },
        {
          client: {
            chat: { completions: { create: vi.fn() } },
            images: { generate: imageGenerate }
          } as any,
          fetchFn: mockFetch as any
        }
      );

      const result = await provider.textToImage({
        model: {
          id: "openai/dall-e-3",
          name: "DALL-E 3",
          provider: "openrouter"
        },
        prompt: "A cat"
      });

      expect(result).toBeInstanceOf(Uint8Array);
      expect(mockFetch).toHaveBeenCalledWith("https://example.com/image.png");
    });

    it("throws on empty prompt for textToImage", async () => {
      const provider = new OpenRouterProvider(
        { OPENROUTER_API_KEY: "k" },
        {
          client: {
            chat: { completions: { create: vi.fn() } },
            images: { generate: vi.fn() }
          } as any
        }
      );

      await expect(
        provider.textToImage({
          model: {
            id: "openai/dall-e-3",
            name: "DALL-E 3",
            provider: "openrouter"
          },
          prompt: ""
        })
      ).rejects.toThrow("The input prompt cannot be empty.");
    });

    it("appends negative prompt to main prompt", async () => {
      const imageGenerate = vi.fn().mockResolvedValue({
        data: [
          {
            b64_json: Buffer.from("fake").toString("base64")
          }
        ]
      });

      const provider = new OpenRouterProvider(
        { OPENROUTER_API_KEY: "k" },
        {
          client: {
            chat: { completions: { create: vi.fn() } },
            images: { generate: imageGenerate }
          } as any
        }
      );

      await provider.textToImage({
        model: {
          id: "openai/dall-e-3",
          name: "DALL-E 3",
          provider: "openrouter"
        },
        prompt: "A landscape",
        negativePrompt: "blurry"
      });

      const call = imageGenerate.mock.calls[0][0];
      expect(call.prompt).toContain("A landscape");
      expect(call.prompt).toContain("Do not include: blurry");
    });
  });

  describe("image models", () => {
    it("returns available image models", async () => {
      const provider = new OpenRouterProvider(
        { OPENROUTER_API_KEY: "k" },
        { client: {} as any }
      );

      const models = await provider.getAvailableImageModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models[0].provider).toBe("openrouter");
      expect(models.every((m) => m.id && m.name)).toBe(true);
    });
  });
});
