import { describe, it, expect, vi } from "vitest";
import { XAIProvider } from "../../src/providers/xai-provider.js";
import type { Message } from "../../src/providers/types.js";
import {
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch
} from "./helpers/compat-fetch.js";

describe("XAIProvider", () => {
  it("throws if XAI_API_KEY is missing", () => {
    expect(() => new XAIProvider({})).toThrow("XAI_API_KEY is required");
  });

  it("reports provider id as xai", () => {
    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.provider).toBe("xai");
  });

  it("returns required secrets", () => {
    expect(XAIProvider.requiredSecrets()).toEqual(["XAI_API_KEY"]);
  });

  it("returns container env with XAI_API_KEY", () => {
    const provider = new XAIProvider(
      { XAI_API_KEY: "test-key" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({
      XAI_API_KEY: "test-key"
    });
  });

  it("has tool support for all models", async () => {
    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("grok-4")).toBe(true);
  });

  it("fetches available language models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "grok-4", name: "Grok 4" },
          { id: "grok-3-mini" }
        ]
      })
    });

    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "grok-4", name: "Grok 4", provider: "xai" },
      { id: "grok-3-mini", name: "grok-3-mini", provider: "xai" }
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.x.ai/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer k" }
      })
    );
  });

  it("returns empty list when model fetch fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([]);
  });

  function mixedModelsFetch() {
    return vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "grok-4", name: "Grok 4", output_modalities: ["text"] },
          { id: "grok-3-mini" },
          {
            id: "grok-imagine-image-quality",
            name: "Grok Imagine Image",
            output_modalities: ["image"]
          },
          { id: "grok-imagine-video", name: "Grok Imagine Video" }
        ]
      })
    });
  }

  it("classifies image and video models out of the language list", async () => {
    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any, fetchFn: mixedModelsFetch() as any }
    );

    const language = await provider.getAvailableLanguageModels();
    expect(language.map((m) => m.id)).toEqual(["grok-4", "grok-3-mini"]);
  });

  it("exposes Grok Imagine image models as image models", async () => {
    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any, fetchFn: mixedModelsFetch() as any }
    );

    const images = await provider.getAvailableImageModels();
    expect(images).toEqual([
      {
        id: "grok-imagine-image-quality",
        name: "Grok Imagine Image",
        provider: "xai",
        supportedTasks: ["text_to_image", "image_to_image"]
      }
    ]);
  });

  it("exposes Grok Imagine video models as video models", async () => {
    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any, fetchFn: mixedModelsFetch() as any }
    );

    const videos = await provider.getAvailableVideoModels();
    expect(videos).toEqual([
      {
        id: "grok-imagine-video",
        name: "Grok Imagine Video",
        provider: "xai",
        supportedTasks: ["text_to_video", "image_to_video"]
      }
    ]);
  });

  it("returns empty image and video lists when model fetch fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    expect(await provider.getAvailableImageModels()).toEqual([]);
    expect(await provider.getAvailableVideoModels()).toEqual([]);
  });

  it("generates non-streaming message via the compat chat client", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [
          {
            message: {
              content: "grok response",
              tool_calls: null
            }
          }
        ]
        })
    );

    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "grok-4"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("grok response");
  });

  it("streams messages via the compat chat client", async () => {
    const chunks = [
      {
        choices: [{ delta: { content: "hi" }, finish_reason: null }]
      },
      {
        choices: [{ delta: { content: "" }, finish_reason: "stop" }]
      }
    ];

    const fetchMock = mockChatFetch(() => chatSSEResponse(chunks));

    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hi" }];
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages,
      model: "grok-4"
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  const imageModel = {
    id: "grok-imagine-image-quality",
    name: "Grok Imagine Image",
    provider: "xai" as const
  };
  const videoModel = {
    id: "grok-imagine-video",
    name: "Grok Imagine Video",
    provider: "xai" as const
  };
  // PNG magic bytes so the data-URI MIME sniffing resolves to image/png.
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  function jsonOk(body: unknown) {
    return { ok: true, json: async () => body };
  }

  it("maps text-to-image params to xAI's generations endpoint", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        jsonOk({ data: [{ b64_json: Buffer.from("img").toString("base64") }] })
      );
    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const bytes = await provider.textToImage({
      prompt: "a cat",
      negativePrompt: "dogs",
      model: imageModel,
      aspectRatio: "16:9",
      resolution: "2k"
    });

    expect(Buffer.from(bytes).toString()).toBe("img");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.x.ai/v1/images/generations");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer k",
      "Content-Type": "application/json"
    });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: "grok-imagine-image-quality",
      n: 1,
      response_format: "b64_json",
      aspect_ratio: "16:9",
      resolution: "2k"
    });
    expect(body.prompt).toContain("a cat");
    expect(body.prompt).toContain("Do not include: dogs");
  });

  it("sends image-to-image edits as JSON with a base64 data URI", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        jsonOk({ data: [{ b64_json: Buffer.from("edited").toString("base64") }] })
      );
    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const bytes = await provider.imageToImage([pngBytes], {
      prompt: "make it a sketch",
      model: imageModel
    });

    expect(Buffer.from(bytes).toString()).toBe("edited");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.x.ai/v1/images/edits");
    const body = JSON.parse(init.body);
    expect(body.image).toEqual({
      url: `data:image/png;base64,${Buffer.from(pngBytes).toString("base64")}`,
      type: "image_url"
    });
  });

  it("sends multiple edit images as an array", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(jsonOk({ data: [{ b64_json: "QQ==" }] }));
    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    await provider.imageToImage([pngBytes, pngBytes], {
      prompt: "blend",
      model: imageModel
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(Array.isArray(body.image)).toBe(true);
    expect(body.image).toHaveLength(2);
  });

  it("rejects image-to-image with no usable source", async () => {
    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any, fetchFn: vi.fn() as any }
    );
    await expect(
      provider.imageToImage([new Uint8Array()], {
        prompt: "x",
        model: imageModel
      })
    ).rejects.toThrow("image must not be empty.");
  });

  it("runs text-to-video through the async generate + poll flow", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonOk({ request_id: "req-1" }))
      .mockResolvedValueOnce(jsonOk({ status: "pending" }))
      .mockResolvedValueOnce(
        jsonOk({ status: "done", video: { url: "https://vid.x.ai/v.mp4" } })
      )
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode("mp4").buffer
      });
    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    vi.useFakeTimers();
    try {
      const pending = provider.textToVideo({
        prompt: "a rocket",
        model: videoModel,
        durationSeconds: 10,
        aspectRatio: "16:9",
        resolution: "720p"
      });
      await vi.runAllTimersAsync();
      const bytes = await pending;
      expect(Buffer.from(bytes).toString()).toBe("mp4");
    } finally {
      vi.useRealTimers();
    }

    const [startUrl, startInit] = mockFetch.mock.calls[0];
    expect(startUrl).toBe("https://api.x.ai/v1/videos/generations");
    expect(JSON.parse(startInit.body)).toMatchObject({
      model: "grok-imagine-video",
      prompt: "a rocket",
      duration: 10,
      aspect_ratio: "16:9",
      resolution: "720p"
    });
    expect(mockFetch.mock.calls[1][0]).toBe("https://api.x.ai/v1/videos/req-1");
  });

  it("attaches the source frame for image-to-video", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonOk({ request_id: "req-2" }))
      .mockResolvedValueOnce(
        jsonOk({ status: "done", video: { url: "https://vid.x.ai/v.mp4" } })
      )
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode("mp4").buffer
      });
    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    await provider.imageToVideo([pngBytes], {
      prompt: "animate",
      model: videoModel
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.image).toEqual({
      url: `data:image/png;base64,${Buffer.from(pngBytes).toString("base64")}`,
      type: "image_url"
    });
  });

  it("surfaces a failed video job's error message", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonOk({ request_id: "req-3" }))
      .mockResolvedValueOnce(
        jsonOk({ status: "failed", error: { message: "bad prompt" } })
      );
    const provider = new XAIProvider(
      { XAI_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    await expect(
      provider.textToVideo({ prompt: "x", model: videoModel })
    ).rejects.toThrow("bad prompt");
  });
});
