import { describe, it, expect, vi } from "vitest";
import { EvolinkProvider } from "../../src/providers/evolink-provider.js";
import { providerCapabilities } from "../../src/providers/base-provider.js";
import type { Message } from "../../src/providers/types.js";
import {
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch
} from "./helpers/compat-fetch.js";

/**
 * Route Evolink's media calls (file upload, task submit, task poll, result
 * download) to canned responses keyed by URL.
 */
function makeMediaFetch(resultBytes: Uint8Array) {
  return vi.fn(async (input: unknown, init?: { method?: string }) => {
    const url = String(input);
    if (url.includes("files-api.evolink.ai")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: { file_url: "https://files.evolink.ai/upload.png" }
        })
      };
    }
    if (
      url.includes("/v1/images/generations") ||
      url.includes("/v1/videos/generations")
    ) {
      expect(init?.method).toBe("POST");
      return { ok: true, json: async () => ({ id: "task-1" }) };
    }
    if (url.includes("/v1/tasks/task-1")) {
      return {
        ok: true,
        json: async () => ({
          status: "completed",
          progress: 100,
          results: ["https://results.evolink.ai/out.bin"]
        })
      };
    }
    if (url.includes("results.evolink.ai/out.bin")) {
      return {
        ok: true,
        arrayBuffer: async () => resultBytes.buffer
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
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

  it("inherits OpenAI per-model tool support (excludes o1/o3 reasoning models)", async () => {
    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("gpt-5.2")).toBe(true);
    expect(await provider.hasToolSupport("deepseek-v4-pro")).toBe(true);
    expect(await provider.hasToolSupport("o1-preview")).toBe(false);
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

  it("generates non-streaming message via the compat chat client", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [
          {
            message: {
              content: "evolink response",
              tool_calls: null
            }
          }
        ]
        })
    );

    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "gpt-5.2"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("evolink response");
  });

  it("streams messages via the compat chat client", async () => {
    const chunks = [
      {
        choices: [{ delta: { content: "hello" }, finish_reason: null }]
      },
      {
        choices: [{ delta: { content: "" }, finish_reason: "stop" }]
      }
    ];

    const fetchMock = mockChatFetch(() => chatSSEResponse(chunks));

    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
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

  it("advertises image and video capabilities", () => {
    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "k" },
      { client: {} as any }
    );
    const caps = providerCapabilities(provider);
    expect(caps).toContain("text_to_image");
    expect(caps).toContain("image_to_image");
    expect(caps).toContain("text_to_video");
    expect(caps).toContain("image_to_video");
  });

  it("lists evolink image models tagged with the evolink provider", async () => {
    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "k" },
      { client: {} as any }
    );
    const models = await provider.getAvailableImageModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider === "evolink")).toBe(true);
    expect(models.map((m) => m.id)).toContain("gpt-image-2");
    expect(
      models.every((m) => m.supportedTasks?.includes("text_to_image"))
    ).toBe(true);
  });

  it("lists evolink video models with per-task support", async () => {
    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "k" },
      { client: {} as any }
    );
    const models = await provider.getAvailableVideoModels();
    expect(models.every((m) => m.provider === "evolink")).toBe(true);
    const t2v = models.find((m) => m.id === "seedance-2.0-text-to-video");
    expect(t2v?.supportedTasks).toEqual(["text_to_video"]);
    const i2v = models.find((m) => m.id === "seedance-2.0-image-to-video");
    expect(i2v?.supportedTasks).toEqual(["image_to_video"]);
  });

  it("returns empty TTS/ASR/embedding lists (not OpenAI defaults)", async () => {
    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.getAvailableTTSModels()).toEqual([]);
    expect(await provider.getAvailableASRModels()).toEqual([]);
    expect(await provider.getAvailableEmbeddingModels()).toEqual([]);
  });

  it("generates an image via the async media task API", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const mockFetch = makeMediaFetch(bytes);
    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const result = await provider.textToImage({
      model: { id: "gpt-image-2", name: "GPT Image 2", provider: "evolink" },
      prompt: "a cat",
      aspectRatio: "16:9"
    });

    expect(result).toEqual(bytes);
    const submit = mockFetch.mock.calls.find((c) =>
      String(c[0]).includes("/v1/images/generations")
    );
    const body = JSON.parse((submit?.[1] as any).body);
    expect(body).toMatchObject({ model: "gpt-image-2", size: "16:9" });
    expect(body.prompt).toBe("a cat");
  });

  it("uploads the input image before image-to-image generation", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const mockFetch = makeMediaFetch(bytes);
    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const result = await provider.imageToImage([new Uint8Array([1, 2, 3])], {
      model: { id: "gpt-image-2", name: "GPT Image 2", provider: "evolink" },
      prompt: "make it blue"
    });

    expect(result).toEqual(bytes);
    expect(
      mockFetch.mock.calls.some((c) =>
        String(c[0]).includes("files-api.evolink.ai")
      )
    ).toBe(true);
    const submit = mockFetch.mock.calls.find((c) =>
      String(c[0]).includes("/v1/images/generations")
    );
    const body = JSON.parse((submit?.[1] as any).body);
    expect(body.image_urls).toEqual(["https://files.evolink.ai/upload.png"]);
  });

  it("generates a video mapping resolution to quality", async () => {
    const bytes = new Uint8Array([5, 6]);
    const mockFetch = makeMediaFetch(bytes);
    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const result = await provider.textToVideo({
      model: {
        id: "seedance-2.0-text-to-video",
        name: "Seedance 2.0",
        provider: "evolink"
      },
      prompt: "a dog running",
      resolution: "720p",
      aspectRatio: "16:9",
      durationSeconds: 5
    });

    expect(result).toEqual(bytes);
    const submit = mockFetch.mock.calls.find((c) =>
      String(c[0]).includes("/v1/videos/generations")
    );
    const body = JSON.parse((submit?.[1] as any).body);
    expect(body).toMatchObject({
      model: "seedance-2.0-text-to-video",
      prompt: "a dog running",
      quality: "720p",
      aspect_ratio: "16:9",
      duration: 5
    });
  });

  it("throws when a media task fails", async () => {
    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/v1/images/generations")) {
        return { ok: true, json: async () => ({ id: "task-1" }) };
      }
      return {
        ok: true,
        json: async () => ({
          status: "failed",
          error: { message: "content policy" }
        })
      };
    });
    const provider = new EvolinkProvider(
      { EVOLINK_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    await expect(
      provider.textToImage({
        model: { id: "gpt-image-2", name: "GPT Image 2", provider: "evolink" },
        prompt: "x"
      })
    ).rejects.toThrow("content policy");
  });
});
