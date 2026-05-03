import { describe, it, expect, vi } from "vitest";
import { TogetherProvider } from "../../src/providers/together-provider.js";
import type {
  ImageToImageParams,
  ImageToVideoParams,
  Message,
  TextToImageParams,
  TextToVideoParams
} from "../../src/providers/types.js";

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

/** Build a minimal valid WAV buffer containing one zero-valued 16-bit sample at 24 kHz. */
function buildMinimalWav(sampleRate = 24000): Uint8Array {
  const pcmData = new Uint8Array([0x00, 0x00]); // one Int16 zero sample
  const buf = new ArrayBuffer(44 + pcmData.length);
  const view = new DataView(buf);

  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + pcmData.length, true); // file size − 8
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true); // sample rate
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, pcmData.length, true);
  new Uint8Array(buf, 44).set(pcmData);

  return new Uint8Array(buf);
}

describe("TogetherProvider", () => {
  // ─── Construction / basics ──────────────────────────────────────────────────

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
    expect(TogetherProvider.requiredSecrets()).toEqual(["TOGETHER_API_KEY"]);
  });

  it("returns container env with TOGETHER_API_KEY", () => {
    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "test-key" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({
      TOGETHER_API_KEY: "test-key"
    });
  });

  it("has tool support for all models", async () => {
    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("meta-llama/Llama-3-70b")).toBe(true);
  });

  // ─── Language models ────────────────────────────────────────────────────────

  it("fetches available language models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "meta-llama/Llama-3-70b",
          display_name: "Llama 3 70B",
          type: "chat"
        },
        { id: "mistralai/Mixtral-8x7B", type: "language" },
        { id: "stabilityai/sdxl", type: "image" }
      ]
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
        provider: "together"
      },
      {
        id: "mistralai/Mixtral-8x7B",
        name: "mistralai/Mixtral-8x7B",
        provider: "together"
      }
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.together.xyz/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer k" }
      })
    );
  });

  it("fetches available language models from { data: [...] } response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "meta-llama/Llama-3-8b", display_name: "Llama 3 8B", type: "chat" }
        ]
      })
    });

    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      {
        id: "meta-llama/Llama-3-8b",
        name: "Llama 3 8B",
        provider: "together"
      }
    ]);
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

  // ─── Chat completions (inherited) ───────────────────────────────────────────

  it("generates non-streaming message via inherited OpenAI logic", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "together response",
            tool_calls: null
          }
        }
      ]
    });

    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create } }
        } as any
      }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "meta-llama/Llama-3-70b"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("together response");
    expect(create).toHaveBeenCalled();
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

    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
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
      model: "meta-llama/Llama-3-70b"
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Image models ───────────────────────────────────────────────────────────

  it("returns Together image models", async () => {
    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any }
    );
    const models = await provider.getAvailableImageModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider === "together")).toBe(true);
    // Should include at least the flagship FLUX Schnell model
    expect(models.some((m) => m.id === "black-forest-labs/FLUX.1-schnell")).toBe(
      true
    );
  });

  it("textToImage posts correct request and decodes b64_json", async () => {
    const imageBytes = new Uint8Array([1, 2, 3, 4]);
    const b64 = Buffer.from(imageBytes).toString("base64");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: b64 }] })
    });

    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const params: TextToImageParams = {
      model: {
        id: "black-forest-labs/FLUX.1-schnell",
        name: "FLUX.1 Schnell",
        provider: "together"
      },
      prompt: "a cat",
      width: 1024,
      height: 1024,
      numInferenceSteps: 4,
      seed: 42
    };

    const result = await provider.textToImage(params);

    expect(result).toEqual(imageBytes);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.together.xyz/v1/images/generations",
      expect.objectContaining({ method: "POST" })
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.model).toBe("black-forest-labs/FLUX.1-schnell");
    expect(body.prompt).toBe("a cat");
    expect(body.width).toBe(1024);
    expect(body.height).toBe(1024);
    expect(body.steps).toBe(4);
    expect(body.seed).toBe(42);
    expect(body.response_format).toBe("b64_json");
  });

  it("textToImage falls back to downloading URL when no b64_json", async () => {
    const imageBytes = new Uint8Array([5, 6, 7, 8]);
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: "https://example.com/img.png" }] })
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => imageBytes.buffer
      });

    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const params: TextToImageParams = {
      model: {
        id: "black-forest-labs/FLUX.1-schnell",
        name: "FLUX.1 Schnell",
        provider: "together"
      },
      prompt: "a dog"
    };

    const result = await provider.textToImage(params);
    expect(result).toEqual(imageBytes);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("textToImage throws on API error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "invalid model"
    });

    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const params: TextToImageParams = {
      model: {
        id: "bad/model",
        name: "Bad",
        provider: "together"
      },
      prompt: "test"
    };

    await expect(provider.textToImage(params)).rejects.toThrow(
      "Together image generation failed"
    );
  });

  it("imageToImage sends image_url as data URI", async () => {
    const imageBytes = new Uint8Array([9, 10, 11, 12]);
    const b64 = Buffer.from(imageBytes).toString("base64");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: b64 }] })
    });

    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const inputImage = new Uint8Array([0xff, 0xd8, 0xff]); // fake JPEG header
    const params: ImageToImageParams = {
      model: {
        id: "black-forest-labs/FLUX.1-kontext-pro",
        name: "Kontext Pro",
        provider: "together"
      },
      prompt: "make it blue",
      guidanceScale: 3.5
    };

    const result = await provider.imageToImage(inputImage, params);
    expect(result).toEqual(imageBytes);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.image_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(body.prompt).toBe("make it blue");
    expect(body.guidance_scale).toBe(3.5);
  });

  // ─── TTS ────────────────────────────────────────────────────────────────────

  it("returns Together TTS models", async () => {
    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any }
    );
    const models = await provider.getAvailableTTSModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((m) => m.id === "canopylabs/orpheus-3b-0.1-ft")).toBe(
      true
    );
    expect(
      models.find((m) => m.id === "canopylabs/orpheus-3b-0.1-ft")?.voices
    ).toContain("tara");
  });

  it("textToSpeech posts to audio endpoint and yields PCM from WAV", async () => {
    const wavBytes = buildMinimalWav(24000);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => wavBytes.buffer
    });

    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const chunks: import("../../src/providers/types.js").StreamingAudioChunk[] =
      [];
    for await (const chunk of provider.textToSpeech({
      text: "hello world",
      model: "canopylabs/orpheus-3b-0.1-ft",
      voice: "tara"
    })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].samples).toBeInstanceOf(Int16Array);
    expect(chunks[0].sampleRate).toBe(24000);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.input).toBe("hello world");
    expect(body.voice).toBe("tara");
    expect(body.response_format).toBe("wav");
  });

  it("textToSpeech defaults to tara voice when none supplied", async () => {
    const wavBytes = buildMinimalWav();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => wavBytes.buffer
    });

    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const chunks = [];
    for await (const c of provider.textToSpeech({
      text: "hi",
      model: "canopylabs/orpheus-3b-0.1-ft"
    })) {
      chunks.push(c);
    }

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.voice).toBe("tara");
  });

  it("textToSpeech throws when API fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "quota exceeded"
    });

    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    await expect(async () => {
      // We must consume the generator to trigger the error
      for await (const _ of provider.textToSpeech({
        text: "hi",
        model: "canopylabs/orpheus-3b-0.1-ft"
      })) {
        // nothing
      }
    }).rejects.toThrow("Together TTS failed");
  });

  it("textToSpeechEncoded returns mp3 bytes", async () => {
    const mp3Bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => mp3Bytes.buffer
    });

    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const result = await provider.textToSpeechEncoded({
      text: "hello",
      model: "canopylabs/orpheus-3b-0.1-ft",
      voice: "leo",
      audioFormat: "mp3"
    });

    expect(result).not.toBeNull();
    expect(result!.mimeType).toBe("audio/mpeg");
    expect(result!.data).toEqual(mp3Bytes);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.response_format).toBe("mp3");
  });

  it("textToSpeechEncoded returns null for unsupported formats", async () => {
    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any }
    );

    const result = await provider.textToSpeechEncoded({
      text: "hi",
      model: "canopylabs/orpheus-3b-0.1-ft",
      audioFormat: "opus"
    });

    expect(result).toBeNull();
  });

  // ─── ASR ────────────────────────────────────────────────────────────────────

  it("returns Together ASR models", async () => {
    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any }
    );
    const models = await provider.getAvailableASRModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((m) => m.id === "openai/whisper-large-v3")).toBe(true);
    expect(models.every((m) => m.provider === "together")).toBe(true);
  });

  // ─── Embeddings ─────────────────────────────────────────────────────────────

  it("returns Together embedding models", async () => {
    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any }
    );
    const models = await provider.getAvailableEmbeddingModels();
    expect(models.length).toBeGreaterThan(0);
    expect(
      models.some(
        (m) => m.id === "intfloat/multilingual-e5-large-instruct"
      )
    ).toBe(true);
    expect(
      models.find((m) => m.id === "intfloat/multilingual-e5-large-instruct")
        ?.dimensions
    ).toBe(1024);
  });

  // ─── Video models ───────────────────────────────────────────────────────────

  it("returns Together video models", async () => {
    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any }
    );
    const models = await provider.getAvailableVideoModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((m) => m.id === "minimax/hailuo-02")).toBe(true);
    expect(models.every((m) => m.provider === "together")).toBe(true);
    // Verify image-to-video support is advertised
    expect(
      models
        .filter((m) => m.supportedTasks?.includes("image_to_video"))
        .length
    ).toBeGreaterThan(0);
  });

  it("textToVideo submits job, polls, and returns video bytes", async () => {
    const videoBytes = new Uint8Array([0x00, 0x00, 0x00, 0x18]);

    const mockFetch = vi
      .fn()
      // 1. Create job
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "job-123", status: "in_progress" })
      })
      // 2. Poll → still in progress
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "job-123", status: "in_progress" })
      })
      // 3. Poll → completed
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "job-123",
          status: "completed",
          outputs: { video_url: "https://cdn.example.com/video.mp4" }
        })
      })
      // 4. Download video
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => videoBytes.buffer
      });

    // Use fake timers to skip the 5 s polling delay
    vi.useFakeTimers();

    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const params: TextToVideoParams = {
      model: {
        id: "minimax/hailuo-02",
        name: "Hailuo 02",
        provider: "together"
      },
      prompt: "a sunset over the ocean",
      aspectRatio: "16:9",
      resolution: "720p",
      seed: 7
    };

    const videoPromise = provider.textToVideo(params);

    // Advance past the two polling intervals
    await vi.runAllTimersAsync();

    const result = await videoPromise;
    vi.useRealTimers();

    expect(result).toEqual(videoBytes);

    // Verify create call
    const createBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(createBody.model).toBe("minimax/hailuo-02");
    expect(createBody.prompt).toBe("a sunset over the ocean");
    expect(createBody.width).toBe(1280);
    expect(createBody.height).toBe(720);
    expect(createBody.seed).toBe(7);

    // Verify polling URL
    expect(mockFetch.mock.calls[1][0]).toBe(
      "https://api.together.xyz/v2/videos/job-123"
    );
  });

  it("textToVideo throws when job fails", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "job-456", status: "in_progress" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "job-456",
          status: "failed",
          error: { message: "GPU OOM" }
        })
      });

    vi.useFakeTimers();

    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const params: TextToVideoParams = {
      model: {
        id: "minimax/hailuo-02",
        name: "Hailuo 02",
        provider: "together"
      },
      prompt: "test"
    };

    const p = provider.textToVideo(params);
    // Attach a no-op handler immediately so Node.js never considers this an
    // "unhandled" rejection: the rejection fires during vi.runAllTimersAsync()
    // which is before our try/catch below can attach a handler.
    p.catch(() => {});

    await vi.runAllTimersAsync();

    let caughtError: unknown;
    try {
      await p;
    } catch (e) {
      caughtError = e;
    }

    vi.useRealTimers();

    expect(String(caughtError)).toContain("Together text-to-video failed");
    expect(String(caughtError)).toContain("GPU OOM");
  });

  it("imageToVideo sends frame_images with base64 data URI", async () => {
    const videoBytes = new Uint8Array([0x01, 0x02]);

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "job-789", status: "in_progress" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "job-789",
          status: "completed",
          outputs: { video_url: "https://cdn.example.com/clip.mp4" }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => videoBytes.buffer
      });

    vi.useFakeTimers();

    const provider = new TogetherProvider(
      { TOGETHER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const fakeImage = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // fake JPEG
    const params: ImageToVideoParams = {
      model: {
        id: "minimax/hailuo-02",
        name: "Hailuo 02",
        provider: "together"
      },
      prompt: "zoom out"
    };

    const videoPromise = provider.imageToVideo(fakeImage, params);
    await vi.runAllTimersAsync();

    const result = await videoPromise;
    vi.useRealTimers();

    expect(result).toEqual(videoBytes);

    const createBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(createBody.frame_images).toHaveLength(1);
    expect(createBody.frame_images[0].frame).toBe("first");
    expect(createBody.frame_images[0].input_image).toMatch(
      /^data:image\/jpeg;base64,/
    );
  });
});
