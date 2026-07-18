import { describe, it, expect, vi } from "vitest";
import { MinimaxProvider } from "../../src/providers/minimax-provider.js";
import type {
  ImageModel,
  Message,
  VideoModel
} from "../../src/providers/types.js";
import {
  chatJsonResponse,
  mockChatFetch
} from "./helpers/compat-fetch.js";

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
        // The download now goes through safeFetch, which inspects response
        // headers for redirects; provide a no-op headers accessor.
        headers: { get: () => null },
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

  it("rejects image requests for more than 9 images", async () => {
    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "k" },
      { client: {} as any, fetchFn: vi.fn() as any }
    );
    const model: ImageModel = {
      id: "image-01",
      name: "image-01",
      provider: "minimax"
    };
    await expect(
      provider.textToImages({ model, prompt: "cat" }, 10)
    ).rejects.toThrow(/at most 9 images/);
  });

  it("marks Hailuo 2.3 Fast as image-to-video only", async () => {
    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "k" },
      { client: {} as any }
    );
    const models = await provider.getAvailableVideoModels();
    const fast = models.find((m) => m.id === "MiniMax-Hailuo-2.3-Fast");
    expect(fast?.supportedTasks).toEqual(["image_to_video"]);
  });

  it("sends a subject_reference instead of first_frame_image for S2V-01", async () => {
    const responses: Array<() => Promise<any>> = [
      async () => ({
        ok: true,
        json: async () => ({ task_id: "t", base_resp: { status_code: 0 } })
      }),
      async () => ({
        ok: true,
        json: async () => ({ status: "Success", file_id: "f" })
      }),
      async () => ({
        ok: true,
        json: async () => ({
          file: { download_url: "https://cdn.minimax.io/v.mp4" },
          base_resp: { status_code: 0 }
        })
      }),
      async () => ({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array([1]).buffer
      })
    ];
    const mockFetch = vi.fn(async () => {
      const next = responses.shift();
      if (!next) throw new Error("unexpected fetch call");
      return next();
    });
    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );
    const model: VideoModel = {
      id: "S2V-01",
      name: "Subject",
      provider: "minimax"
    };
    await provider.imageToVideo([new Uint8Array([1, 2, 3])], {
      model,
      prompt: "wave",
      durationSeconds: 10,
      resolution: "1080p"
    });
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body
    );
    expect(body.first_frame_image).toBeUndefined();
    // S2V-01 is fixed at 6s/720P; the API rejects these parameters.
    expect(body.duration).toBeUndefined();
    expect(body.resolution).toBeUndefined();
    expect(body.subject_reference).toEqual([
      {
        type: "character",
        image: [expect.stringContaining("data:image/png;base64,")]
      }
    ]);
  });

  it("omits duration/resolution for 01-series models and clamps Hailuo combos", async () => {
    const submitBodies: Array<Record<string, unknown>> = [];
    const mockFetch = vi.fn(async (url: string, init?: { body?: string }) => {
      if (url.endsWith("/v1/video_generation")) {
        submitBodies.push(JSON.parse(init!.body!));
        return {
          ok: true,
          json: async () => ({ task_id: "t", base_resp: { status_code: 0 } })
        };
      }
      if (url.includes("/v1/query/")) {
        return {
          ok: true,
          json: async () => ({ status: "Success", file_id: "f" })
        };
      }
      if (url.includes("/v1/files/retrieve")) {
        return {
          ok: true,
          json: async () => ({
            file: { download_url: "https://cdn.minimax.io/v.mp4" },
            base_resp: { status_code: 0 }
          })
        };
      }
      return {
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array([1]).buffer
      };
    });
    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const director: VideoModel = {
      id: "T2V-01-Director",
      name: "Director",
      provider: "minimax"
    };
    await provider.textToVideo({
      model: director,
      prompt: "x",
      durationSeconds: 10,
      resolution: "1080p"
    });
    expect(submitBodies[0].duration).toBeUndefined();
    expect(submitBodies[0].resolution).toBeUndefined();

    const hailuo23: VideoModel = {
      id: "MiniMax-Hailuo-2.3",
      name: "Hailuo 2.3",
      provider: "minimax"
    };
    // 10s clips only render at 768P → 1080P downgrades.
    await provider.textToVideo({
      model: hailuo23,
      prompt: "x",
      durationSeconds: 10,
      resolution: "1080p"
    });
    expect(submitBodies[1].duration).toBe(10);
    expect(submitBodies[1].resolution).toBe("768P");

    // 512P only exists on Hailuo-02 → falls back to 768P on 2.3.
    await provider.textToVideo({
      model: hailuo23,
      prompt: "x",
      durationSeconds: 6,
      resolution: "512p"
    });
    expect(submitBodies[2].resolution).toBe("768P");
  });

  it("aborts polling when the status query reports a base_resp error", async () => {
    const responses: Array<() => Promise<any>> = [
      async () => ({
        ok: true,
        json: async () => ({ task_id: "t", base_resp: { status_code: 0 } })
      }),
      async () => ({
        ok: true,
        json: async () => ({
          base_resp: { status_code: 1004, status_msg: "auth failed" }
        })
      })
    ];
    const mockFetch = vi.fn(async () => {
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
    await expect(
      provider.textToVideo({ model, prompt: "x" })
    ).rejects.toThrow(/auth failed/);
    expect(mockFetch).toHaveBeenCalledTimes(2);
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

  it("advertises text_to_music and lists music models", async () => {
    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "k" },
      { client: {} as any, fetchFn: vi.fn() as any }
    );
    expect(provider.getCapabilities()).toContain("text_to_music");
    const models = await provider.getAvailableMusicModels();
    expect(models.map((m) => m.id)).toContain("music-2.6");
    expect(models.every((m) => m.provider === "minimax")).toBe(true);
  });

  it("generates music via the music_generation endpoint", async () => {
    const audioHex = "0a0b0c";
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

    const encoded = await provider.textToMusic({
      model: { id: "music-2.6", name: "MiniMax Music 2.6", provider: "minimax" },
      prompt: "an upbeat pop song",
      lyrics: "[Verse]\nHello world"
    });

    expect(encoded.mimeType).toBe("audio/mpeg");
    expect(Array.from(encoded.data)).toEqual([10, 11, 12]);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/v1/music_generation");
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body
    );
    expect(body.model).toBe("music-2.6");
    expect(body.prompt).toBe("an upbeat pop song");
    expect(body.lyrics).toBe("[Verse]\nHello world");
    expect(body.output_format).toBe("hex");
  });

  it("defaults missing lyrics to an instrumental marker", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { audio: "00" },
        base_resp: { status_code: 0 }
      })
    });
    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );
    await provider.textToMusic({
      model: { id: "music-2.6", name: "MiniMax Music 2.6", provider: "minimax" },
      prompt: "lofi beats"
    });
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body
    );
    expect(body.lyrics).toBe("[Instrumental]");
  });

  it("generates a chat completion via the compat chat client", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [{ message: { content: "hi", tool_calls: null } }]
      })
    );
    const provider = new MinimaxProvider(
      { MINIMAX_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
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
