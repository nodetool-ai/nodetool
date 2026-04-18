import { describe, it, expect, vi } from "vitest";
import { MinimaxProvider } from "../../src/providers/minimax-provider.js";
import type {
  ImageModel,
  Message,
  VideoModel
} from "../../src/providers/types.js";

describe("MinimaxProvider", () => {
  it("throws if MINIMAX_API_KEY is missing", () => {
    expect(() => new MinimaxProvider({})).toThrow(
      "MINIMAX_API_KEY is required"
    );
  });

  it("reports provider id as minimax", () => {
    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.provider).toBe("minimax");
  });

  it("returns required secrets", () => {
    expect(MinimaxProvider.requiredSecrets()).toEqual(["MINIMAX_API_KEY"]);
  });

  it("returns container env with MINIMAX_API_KEY", () => {
    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "test-key" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({
      MINIMAX_API_KEY: "test-key"
    });
  });

  it("has tool support for all models", async () => {
    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("MiniMax-M2.7")).toBe(true);
  });

  it("returns a static language model catalogue", async () => {
    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "k" },
      { client: {} as any }
    );
    const models = await provider.getAvailableLanguageModels();
    expect(models.map((m) => m.id)).toContain("MiniMax-M2.7");
    expect(models.every((m) => m.provider === "minimax")).toBe(true);
  });

  it("exposes image, video, and tts model catalogues", async () => {
    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "k" },
      { client: {} as any }
    );

    const images = await provider.getAvailableImageModels();
    expect(images.map((m) => m.id)).toContain("image-01");

    const videos = await provider.getAvailableVideoModels();
    expect(videos.map((m) => m.id)).toEqual(
      expect.arrayContaining([
        "MiniMax-Hailuo-2.3",
        "MiniMax-Hailuo-2.3-Fast",
        "MiniMax-Hailuo-02"
      ])
    );

    const tts = await provider.getAvailableTTSModels();
    expect(tts.map((m) => m.id)).toEqual(
      expect.arrayContaining(["speech-2.8-hd", "speech-2.6-turbo"])
    );
    expect(tts[0].voices?.length ?? 0).toBeGreaterThan(5);

    expect(await provider.getAvailableASRModels()).toEqual([]);
    expect(await provider.getAvailableEmbeddingModels()).toEqual([]);
  });

  it("rejects unsupported modalities explicitly", async () => {
    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "k" },
      { client: {} as any }
    );
    await expect(
      provider.automaticSpeechRecognition({
        audio: new Uint8Array([1, 2, 3]),
        model: "whisper"
      })
    ).rejects.toThrow(/automaticSpeechRecognition/);
    await expect(
      provider.generateEmbedding({ text: "hi", model: "embo-01" })
    ).rejects.toThrow(/generateEmbedding/);
  });

  it("generates images via the MiniMax REST endpoint", async () => {
    const base64Png = Buffer.from("abcd").toString("base64");
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { image_base64: [base64Png, base64Png] },
        base_resp: { status_code: 0 }
      })
    });

    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const model: ImageModel = {
      id: "image-01",
      name: "image-01",
      provider: "minimax"
    };
    const images = await provider.textToImages(
      { model, prompt: "a cat", width: 1024, height: 1024 },
      2
    );

    expect(images).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.minimax.io/v1/image_generation",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body
    );
    expect(body.model).toBe("image-01");
    expect(body.n).toBe(2);
    expect(body.aspect_ratio).toBe("1:1");
    expect(body.response_format).toBe("base64");
  });

  it("surfaces MiniMax base_resp errors", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        base_resp: { status_code: 1001, status_msg: "invalid api key" }
      })
    });
    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );
    const model: ImageModel = {
      id: "image-01",
      name: "image-01",
      provider: "minimax"
    };
    await expect(
      provider.textToImage({ model, prompt: "cat" })
    ).rejects.toThrow(/invalid api key/);
  });

  it("submits a video task and polls until success", async () => {
    const responses: Array<() => Promise<any>> = [
      async () => ({
        ok: true,
        json: async () => ({
          task_id: "task-42",
          base_resp: { status_code: 0 }
        })
      }),
      async () => ({
        ok: true,
        json: async () => ({ status: "Processing" })
      }),
      async () => ({
        ok: true,
        json: async () => ({ status: "Success", file_id: "file-9" })
      }),
      async () => ({
        ok: true,
        json: async () => ({
          file: { download_url: "https://cdn.minimax.io/video.mp4" },
          base_resp: { status_code: 0 }
        })
      }),
      async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([7, 7, 7]).buffer
      })
    ];
    const mockFetch = vi.fn(async (..._args: unknown[]) => {
      const next = responses.shift();
      if (!next) throw new Error("unexpected fetch call");
      return next();
    });

    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const model: VideoModel = {
      id: "MiniMax-Hailuo-02",
      name: "Hailuo 02",
      provider: "minimax"
    };

    // Patch the poll interval via a private method call – speed up test.
    // Monkey-patch setTimeout to fire immediately.
    const realSetTimeout = globalThis.setTimeout;
    (globalThis as any).setTimeout = (fn: () => void, _ms: number) =>
      realSetTimeout(fn, 0);

    try {
      const bytes = await provider.textToVideo({
        model,
        prompt: "a cat surfing",
        durationSeconds: 6,
        resolution: "768p"
      });
      expect(Array.from(bytes)).toEqual([7, 7, 7]);
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }

    const urls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toBe("https://api.minimax.io/v1/video_generation");
    expect(urls[1]).toContain("/v1/query/video_generation?task_id=task-42");
    expect(urls[3]).toContain("/v1/files/retrieve?file_id=file-9");
    expect(urls[4]).toBe("https://cdn.minimax.io/video.mp4");
  });

  it("encodes MP3 audio via the t2a_v2 endpoint", async () => {
    const audioHex = "01020304";
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { audio: audioHex },
        base_resp: { status_code: 0 }
      })
    });

    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const encoded = await provider.textToSpeechEncoded({
      text: "hello",
      model: "speech-2.6-hd",
      voice: "English_Insightful_Speaker",
      audioFormat: "mp3"
    });

    expect(encoded).not.toBeNull();
    expect(encoded?.mimeType).toBe("audio/mpeg");
    expect(Array.from(encoded!.data)).toEqual([1, 2, 3, 4]);

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body
    );
    expect(body.model).toBe("speech-2.6-hd");
    expect(body.voice_setting.voice_id).toBe("English_Insightful_Speaker");
    expect(body.audio_setting.format).toBe("mp3");
  });

  it("generates a chat completion via the inherited OpenAI path", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "hi", tool_calls: null } }]
    });
    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "k" },
      { client: { chat: { completions: { create } } } as any }
    );
    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "MiniMax-M2.7"
    });
    expect(result.role).toBe("assistant");
    expect(result.content).toBe("hi");
  });
});
