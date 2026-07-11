import { describe, it, expect, vi, afterEach } from "vitest";
import { ReplicateProvider } from "../../src/providers/replicate-provider.js";
import type { Message } from "../../src/providers/types.js";

/** Helper to create a provider with a mock Replicate client. */
function createProvider(overrides: Record<string, unknown> = {}) {
  return new ReplicateProvider(
    { REPLICATE_API_TOKEN: "r8_test" },
    { client: { run: vi.fn(), stream: vi.fn(), ...overrides } as any }
  );
}

/** Build a fake FileOutput (ReadableStream) that yields `bytes` once. */
function fakeFileOutput(bytes: Uint8Array) {
  let read = false;
  return {
    getReader: () => ({
      read: () => {
        if (!read) {
          read = true;
          return Promise.resolve({ done: false, value: bytes });
        }
        return Promise.resolve({ done: true, value: undefined });
      }
    })
  };
}

function stubFetchOk(bytes: Uint8Array) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      arrayBuffer: () => Promise.resolve(bytes.buffer)
    })
  );
}

const IMG = new Uint8Array([1, 2, 3, 4]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReplicateProvider coverage", () => {
  // --- constructor with fetchFn injection ---

  it("constructs a client when fetchFn is provided instead of a client", () => {
    const provider = new ReplicateProvider(
      { REPLICATE_API_TOKEN: "r8_x" },
      { fetchFn: vi.fn() as unknown as typeof fetch }
    );
    expect(provider.provider).toBe("replicate");
    expect(provider.apiKey).toBe("r8_x");
  });

  // --- generateMessage output-shape branches ---

  it("generateMessage coerces object output via String()", async () => {
    const runMock = vi.fn().mockResolvedValue({ toString: () => "obj-text" });
    const provider = createProvider({ run: runMock });
    const result = await provider.generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "meta/meta-llama-3-70b-instruct"
    });
    expect(result.content).toBe("obj-text");
  });

  it("generateMessage coerces null output to empty string", async () => {
    const runMock = vi.fn().mockResolvedValue(null);
    const provider = createProvider({ run: runMock });
    const result = await provider.generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "meta/meta-llama-3-70b-instruct"
    });
    expect(result.content).toBe("");
  });

  it("generateMessage flattens array text content across messages", async () => {
    const runMock = vi.fn().mockResolvedValue("ok");
    const provider = createProvider({ run: runMock });
    const messages: Message[] = [
      {
        role: "system",
        content: [
          { type: "text", text: "sys-a" },
          { type: "text", text: "sys-b" }
        ]
      },
      {
        role: "user",
        content: [
          { type: "text", text: "line1" },
          { type: "text", text: "line2" }
        ]
      }
    ];
    await provider.generateMessage({
      messages,
      model: "meta/meta-llama-3-70b-instruct"
    });
    const input = runMock.mock.calls[0][1].input;
    expect(input.system_prompt).toBe("sys-a\nsys-b");
    expect(input.prompt).toBe("line1\nline2");
  });

  // --- generateMessages fallback (stream ends without done event) ---

  it("generateMessages emits a done chunk when the stream ends without a done event", async () => {
    async function* fakeStream() {
      yield { event: "output", data: "part" };
      // no done event
    }
    const provider = createProvider({
      stream: vi.fn().mockReturnValue(fakeStream())
    });
    const items: any[] = [];
    for await (const item of provider.generateMessages({
      messages: [{ role: "user", content: "hi" }],
      model: "meta/meta-llama-3-70b-instruct"
    })) {
      items.push(item);
    }
    expect(items.length).toBe(2);
    expect(items[0].content).toBe("part");
    expect(items[items.length - 1].done).toBe(true);
  });

  // --- model catalogs ---

  it("returns non-empty video / tts / music / asr / embedding model lists", async () => {
    const provider = createProvider();
    const [videos, tts, music, asr, embeds] = await Promise.all([
      provider.getAvailableVideoModels(),
      provider.getAvailableTTSModels(),
      provider.getAvailableMusicModels(),
      provider.getAvailableASRModels(),
      provider.getAvailableEmbeddingModels()
    ]);
    expect(tts.length).toBeGreaterThan(0);
    expect(tts[0].provider).toBe("replicate");
    expect(asr.some((m) => m.id.includes("whisper"))).toBe(true);
    expect(embeds.every((m) => (m.dimensions ?? 0) > 0)).toBe(true);
    expect(Array.isArray(videos)).toBe(true);
    expect(Array.isArray(music)).toBe(true);
  });

  // --- _fetchOutputBytes error branches ---

  it("throws when fetch of a string URL is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new Uint8Array().buffer)
      })
    );
    const runMock = vi.fn().mockResolvedValue("https://replicate.delivery/x.png");
    const provider = createProvider({ run: runMock });
    await expect(
      provider.textToImage({
        model: { id: "black-forest-labs/flux-schnell", name: "F", provider: "replicate" },
        prompt: "a cat"
      })
    ).rejects.toThrow("Failed to fetch output: 503");
  });

  it("throws when the prediction returns no usable output (number)", async () => {
    const runMock = vi.fn().mockResolvedValue(123);
    const provider = createProvider({ run: runMock });
    await expect(
      provider.textToImage({
        model: { id: "black-forest-labs/flux-schnell", name: "F", provider: "replicate" },
        prompt: "a cat"
      })
    ).rejects.toThrow("Replicate prediction returned no usable output");
  });

  it("throws when the prediction returns null output", async () => {
    const runMock = vi.fn().mockResolvedValue(null);
    const provider = createProvider({ run: runMock });
    await expect(
      provider.textToImage({
        model: { id: "black-forest-labs/flux-schnell", name: "F", provider: "replicate" },
        prompt: "a cat"
      })
    ).rejects.toThrow("Replicate prediction returned no usable output");
  });

  // --- textToVideo ---

  it("textToVideo throws on empty prompt", async () => {
    await expect(
      createProvider().textToVideo({
        model: { id: "owner/vid", name: "V", provider: "replicate" },
        prompt: ""
      })
    ).rejects.toThrow("Prompt is required");
  });

  it("textToVideo passes optional params and reads FileOutput", async () => {
    const runMock = vi.fn().mockResolvedValue(fakeFileOutput(IMG));
    const provider = createProvider({ run: runMock });
    const bytes = await provider.textToVideo({
      model: { id: "owner/vid", name: "V", provider: "replicate" },
      prompt: "a river",
      negativePrompt: "blur",
      aspectRatio: "16:9",
      numFrames: 24,
      guidanceScale: 5,
      seed: 7
    });
    expect(bytes).toEqual(IMG);
    const input = runMock.mock.calls[0][1].input;
    expect(input.prompt).toBe("a river");
    expect(input.negative_prompt).toBe("blur");
    expect(input.aspect_ratio).toBe("16:9");
    expect(input.num_frames).toBe(24);
    expect(input.guidance_scale).toBe(5);
    expect(input.seed).toBe(7);
  });

  // --- imageToVideo ---

  it("imageToVideo feeds image input and optional params", async () => {
    const runMock = vi.fn().mockResolvedValue(fakeFileOutput(IMG));
    const provider = createProvider({ run: runMock });
    const bytes = await provider.imageToVideo([IMG], {
      model: { id: "owner/unknown-i2v", name: "I2V", provider: "replicate" },
      prompt: "animate",
      negativePrompt: "static",
      aspectRatio: "1:1",
      numFrames: 16,
      guidanceScale: 3,
      seed: 9
    });
    expect(bytes).toEqual(IMG);
    const input = runMock.mock.calls[0][1].input;
    expect(input.image).toMatch(/^data:image\/png;base64,/);
    expect(input.aspect_ratio).toBe("1:1");
    expect(input.num_frames).toBe(16);
  });

  // --- upscaleImage ---

  it("upscaleImage passes scale, prompt, creativity and seed", async () => {
    const runMock = vi.fn().mockResolvedValue(fakeFileOutput(IMG));
    const provider = createProvider({ run: runMock });
    const bytes = await provider.upscaleImage(IMG, {
      model: { id: "owner/upscale", name: "U", provider: "replicate" },
      scale: 4,
      prompt: "sharpen",
      creativity: 0.3,
      seed: 5
    });
    expect(bytes).toEqual(IMG);
    const input = runMock.mock.calls[0][1].input;
    expect(input.image).toMatch(/^data:image\/png;base64,/);
    expect(input.scale).toBe(4);
    expect(input.prompt).toBe("sharpen");
    expect(input.creativity).toBe(0.3);
    expect(input.seed).toBe(5);
  });

  // --- removeBackground ---

  it("removeBackground sends only the image", async () => {
    const runMock = vi.fn().mockResolvedValue(fakeFileOutput(IMG));
    const provider = createProvider({ run: runMock });
    const bytes = await provider.removeBackground(IMG, {
      model: { id: "owner/rembg", name: "R", provider: "replicate" }
    });
    expect(bytes).toEqual(IMG);
    const input = runMock.mock.calls[0][1].input;
    expect(input.image).toMatch(/^data:image\/png;base64,/);
    expect(Object.keys(input)).toEqual(["image"]);
  });

  // --- relightImage ---

  it("relightImage passes prompt, negativePrompt and seed", async () => {
    const runMock = vi.fn().mockResolvedValue(fakeFileOutput(IMG));
    const provider = createProvider({ run: runMock });
    await provider.relightImage(IMG, {
      model: { id: "owner/relight", name: "L", provider: "replicate" },
      prompt: "sunset",
      negativePrompt: "dark",
      seed: 11
    });
    const input = runMock.mock.calls[0][1].input;
    expect(input.prompt).toBe("sunset");
    expect(input.negative_prompt).toBe("dark");
    expect(input.seed).toBe(11);
  });

  // --- vectorizeImage ---

  it("vectorizeImage sends only the image", async () => {
    const runMock = vi.fn().mockResolvedValue(fakeFileOutput(IMG));
    const provider = createProvider({ run: runMock });
    const bytes = await provider.vectorizeImage(IMG, {
      model: { id: "owner/vector", name: "Vec", provider: "replicate" }
    });
    expect(bytes).toEqual(IMG);
    expect(runMock.mock.calls[0][1].input.image).toMatch(
      /^data:image\/png;base64,/
    );
  });

  // --- videoToVideo ---

  it("videoToVideo passes video data uri and optional params", async () => {
    const runMock = vi.fn().mockResolvedValue(fakeFileOutput(IMG));
    const provider = createProvider({ run: runMock });
    await provider.videoToVideo(new Uint8Array([9, 8, 7]), {
      model: { id: "owner/v2v", name: "V2V", provider: "replicate" },
      prompt: "restyle",
      negativePrompt: "ugly",
      strength: 0.6,
      seed: 3
    });
    const input = runMock.mock.calls[0][1].input;
    expect(input.video).toMatch(/^data:video\/mp4;base64,/);
    expect(input.strength).toBe(0.6);
    expect(input.seed).toBe(3);
  });

  // --- lipSync ---

  it("lipSync sends video, audio and seed", async () => {
    const runMock = vi.fn().mockResolvedValue(fakeFileOutput(IMG));
    const provider = createProvider({ run: runMock });
    await provider.lipSync(new Uint8Array([1]), {
      model: { id: "owner/lipsync", name: "LS", provider: "replicate" },
      audio: new Uint8Array([2]),
      seed: 42
    });
    const input = runMock.mock.calls[0][1].input;
    expect(input.video).toMatch(/^data:video\/mp4;base64,/);
    expect(input.audio).toMatch(/^data:audio\/mpeg;base64,/);
    expect(input.seed).toBe(42);
  });

  // --- textToSpeech ---

  it("textToSpeech yields Int16Array samples from downloaded bytes", async () => {
    // 4-byte payload => 2 Int16 samples
    const pcm = new Uint8Array([0x01, 0x00, 0x02, 0x00]);
    const runMock = vi.fn().mockResolvedValue(fakeFileOutput(pcm));
    const provider = createProvider({ run: runMock });
    const out: { samples: Int16Array }[] = [];
    for await (const chunk of provider.textToSpeech({
      text: "hello",
      model: "jaaari/kokoro-82m",
      voice: "af",
      speed: 1.2
    })) {
      out.push(chunk);
    }
    expect(out.length).toBe(1);
    expect(out[0].samples).toBeInstanceOf(Int16Array);
    expect(out[0].samples.length).toBe(2);
    const input = runMock.mock.calls[0][1].input;
    expect(input.text).toBe("hello");
    expect(input.voice).toBe("af");
    expect(input.speed).toBe(1.2);
  });

  // --- textToMusic ---

  it("textToMusic throws on empty prompt", async () => {
    await expect(
      createProvider().textToMusic({
        model: { id: "owner/music", name: "M", provider: "replicate" },
        prompt: ""
      })
    ).rejects.toThrow("Prompt is required");
  });

  it("textToMusic downloads bytes, rounds duration and sniffs mime", async () => {
    // MP3 frame-sync header so sniffAudioMime detects audio/mpeg-ish output.
    const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00]);
    const runMock = vi.fn().mockResolvedValue(fakeFileOutput(mp3));
    const provider = createProvider({ run: runMock });
    const result = await provider.textToMusic({
      model: { id: "owner/music", name: "M", provider: "replicate" },
      prompt: "lofi beat",
      lyrics: "la la",
      durationSeconds: 12.7,
      seed: 1
    });
    expect(result.data).toEqual(mp3);
    expect(typeof result.mimeType).toBe("string");
    const input = runMock.mock.calls[0][1].input;
    expect(input.duration).toBe(13);
    expect(input.lyrics).toBe("la la");
    expect(input.seed).toBe(1);
  });

  // --- _fetchOutputBytes via string URL (safeFetch happy path) ---

  it("downloads bytes from a public https string URL", async () => {
    stubFetchOk(new Uint8Array([0xaa, 0xbb]));
    const runMock = vi.fn().mockResolvedValue("https://replicate.delivery/out.png");
    const provider = createProvider({ run: runMock });
    const bytes = await provider.textToImage({
      model: { id: "black-forest-labs/flux-schnell", name: "F", provider: "replicate" },
      prompt: "a fox"
    });
    expect(bytes).toEqual(new Uint8Array([0xaa, 0xbb]));
  });
});
