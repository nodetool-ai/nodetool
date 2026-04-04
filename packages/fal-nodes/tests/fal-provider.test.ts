import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  FalProvider,
  FAL_IMAGE_MODELS,
  type TextToImageParams,
  type ImageToImageParams,
  type TextToSpeechParams
} from "../src/fal-provider.js";

/* ------------------------------------------------------------------ */
/*  Mock @fal-ai/client SDK                                            */
/* ------------------------------------------------------------------ */

const mockSubscribe = vi.fn();
const mockStorageUpload = vi.fn();

vi.mock("@fal-ai/client", () => ({
  createFalClient: vi.fn(() => ({
    subscribe: mockSubscribe,
    storage: { upload: mockStorageUpload }
  }))
}));

/* ------------------------------------------------------------------ */
/*  Fetch mock                                                          */
/* ------------------------------------------------------------------ */

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  mockSubscribe.mockReset();
  mockStorageUpload.mockReset();
  delete process.env.FAL_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.FAL_API_KEY;
});

/* ================================================================== */
/*  FAL_IMAGE_MODELS catalogue                                         */
/* ================================================================== */

describe("FAL_IMAGE_MODELS", () => {
  it("is a non-empty readonly array", () => {
    expect(Array.isArray(FAL_IMAGE_MODELS)).toBe(true);
    expect(FAL_IMAGE_MODELS.length).toBeGreaterThan(0);
  });

  it("every model has an id and a name", () => {
    for (const model of FAL_IMAGE_MODELS) {
      expect(typeof model.id).toBe("string");
      expect(model.id.length).toBeGreaterThan(0);
      expect(typeof model.name).toBe("string");
      expect(model.name.length).toBeGreaterThan(0);
    }
  });

  it("contains known FLUX model IDs", () => {
    const ids = FAL_IMAGE_MODELS.map((m) => m.id);
    expect(ids).toContain("fal-ai/flux/dev");
    expect(ids).toContain("fal-ai/flux/schnell");
  });
});

/* ================================================================== */
/*  FalProvider constructor                                             */
/* ================================================================== */

describe("FalProvider constructor", () => {
  it("accepts a plain string API key", () => {
    const provider = new FalProvider("my-api-key");
    expect(provider).toBeInstanceOf(FalProvider);
  });

  it("accepts a secrets object with FAL_API_KEY", () => {
    const provider = new FalProvider({ FAL_API_KEY: "secret-key" });
    expect(provider).toBeInstanceOf(FalProvider);
  });

  it("accepts an inputs object with process.env fallback", () => {
    process.env.FAL_API_KEY = "env-key";
    const provider = new FalProvider({});
    expect(provider).toBeInstanceOf(FalProvider);
  });

  it("throws when no API key can be found in inputs object", () => {
    expect(() => new FalProvider({})).toThrow("FAL_API_KEY is not configured");
  });

  it("initializes totalRequests and totalImages to 0", () => {
    const provider = new FalProvider("key");
    expect(provider.totalRequests).toBe(0);
    expect(provider.totalImages).toBe(0);
  });
});

/* ================================================================== */
/*  getAvailableImageModels                                             */
/* ================================================================== */

describe("FalProvider.getAvailableImageModels", () => {
  it("returns the FAL_IMAGE_MODELS array", () => {
    const provider = new FalProvider("key");
    const models = provider.getAvailableImageModels();
    expect(models).toBe(FAL_IMAGE_MODELS);
  });
});

/* ================================================================== */
/*  upload                                                              */
/* ================================================================== */

describe("FalProvider.upload", () => {
  it("delegates to falUpload and returns CDN URL", async () => {
    mockStorageUpload.mockResolvedValue("https://cdn.fal.media/uploaded.png");
    const provider = new FalProvider("key");
    const url = await provider.upload(new Uint8Array([1, 2, 3]), "image/png");
    expect(url).toBe("https://cdn.fal.media/uploaded.png");
    expect(mockStorageUpload).toHaveBeenCalledOnce();
  });
});

/* ================================================================== */
/*  imageRefToUrl                                                       */
/* ================================================================== */

describe("FalProvider.imageRefToUrl", () => {
  it("converts a base64 data ref to a data URI", async () => {
    const provider = new FalProvider("key");
    const result = await provider.imageRefToUrl({
      data: "aGVsbG8=", // "hello" in base64
      uri: "test.png"
    });
    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it("returns null for an empty ref", async () => {
    const provider = new FalProvider("key");
    const result = await provider.imageRefToUrl({});
    expect(result).toBeNull();
  });
});

/* ================================================================== */
/*  textToImage                                                         */
/* ================================================================== */

describe("FalProvider.textToImage", () => {
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes

  const makeImageResult = (url = "https://cdn.fal.media/result.png") => ({
    data: { images: [{ url }] }
  });

  beforeEach(() => {
    // Mock the download fetch call that follows falSubmit
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(pngBytes.buffer)
    });
  });

  it("returns image bytes for a basic prompt", async () => {
    mockSubscribe.mockResolvedValue(makeImageResult());
    const provider = new FalProvider("key");
    const params: TextToImageParams = {
      prompt: "a cat on a rainbow",
      model: "fal-ai/flux/dev"
    };
    const result = await provider.textToImage(params);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(mockSubscribe).toHaveBeenCalledOnce();
    const [endpoint, opts] = mockSubscribe.mock.calls[0] as [
      string,
      { input: Record<string, unknown> }
    ];
    expect(endpoint).toBe("fal-ai/flux/dev");
    expect(opts.input.prompt).toBe("a cat on a rainbow");
    expect(opts.input.output_format).toBe("png");
  });

  it("increments totalRequests and totalImages on success", async () => {
    mockSubscribe.mockResolvedValue(makeImageResult());
    const provider = new FalProvider("key");
    await provider.textToImage({ prompt: "test", model: "fal-ai/flux/dev" });
    expect(provider.totalRequests).toBe(1);
    expect(provider.totalImages).toBe(1);
  });

  it("passes optional parameters to the FAL API", async () => {
    mockSubscribe.mockResolvedValue(makeImageResult());
    const provider = new FalProvider("key");
    const params: TextToImageParams = {
      prompt: "test",
      model: "fal-ai/flux/dev",
      negativePrompt: "blurry",
      width: 512,
      height: 512,
      seed: 42,
      guidanceScale: 7.5,
      numInferenceSteps: 20,
      safetyCheck: false
    };
    await provider.textToImage(params);
    const [, opts] = mockSubscribe.mock.calls[0] as [
      string,
      { input: Record<string, unknown> }
    ];
    expect(opts.input.negative_prompt).toBe("blurry");
    expect(opts.input.image_size).toEqual({ width: 512, height: 512 });
    expect(opts.input.seed).toBe(42);
    expect(opts.input.guidance_scale).toBe(7.5);
    expect(opts.input.num_inference_steps).toBe(20);
    expect(opts.input.enable_safety_checker).toBe(false);
  });

  it("accepts response with single `image` field instead of `images` array", async () => {
    mockSubscribe.mockResolvedValue({
      data: { image: { url: "https://cdn.fal.media/single.png" } }
    });
    const provider = new FalProvider("key");
    const result = await provider.textToImage({
      prompt: "test",
      model: "fal-ai/flux/dev"
    });
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it("wraps falSubmit errors with formatted message", async () => {
    mockSubscribe.mockRejectedValue(new Error("FAL submission failed"));
    const provider = new FalProvider("key");
    await expect(
      provider.textToImage({ prompt: "test", model: "fal-ai/flux/dev" })
    ).rejects.toThrow("FAL text-to-image generation failed");
  });

  it("formats pydantic validation errors for out-of-range values", async () => {
    const pydanticErr =
      '[{"loc": ["steps"], "msg": "value too large", "type": "less_than_equal", "ctx": {"le": 50}, "input": 100}]';
    mockSubscribe.mockRejectedValue(new Error(pydanticErr));
    const provider = new FalProvider("key");
    await expect(
      provider.textToImage({ prompt: "x", model: "fal-ai/flux/dev" })
    ).rejects.toThrow(/steps.*50/);
  });

  it("formats pydantic missing-required validation errors", async () => {
    const pydanticErr =
      '[{"loc": ["prompt"], "msg": "Field required", "type": "missing", "input": null}]';
    mockSubscribe.mockRejectedValue(new Error(pydanticErr));
    const provider = new FalProvider("key");
    await expect(
      provider.textToImage({ prompt: "", model: "fal-ai/flux/dev" })
    ).rejects.toThrow(/prompt.*missing/i);
  });

  it("throws when FAL response has no image URLs", async () => {
    mockSubscribe.mockResolvedValue({ data: { no_images: true } });
    const provider = new FalProvider("key");
    await expect(
      provider.textToImage({ prompt: "test", model: "fal-ai/flux/dev" })
    ).rejects.toThrow(/FAL text-to-image generation failed/);
  });

  it("does not include seed in args when seed is -1", async () => {
    mockSubscribe.mockResolvedValue(makeImageResult());
    const provider = new FalProvider("key");
    await provider.textToImage({
      prompt: "test",
      model: "fal-ai/flux/dev",
      seed: -1
    });
    const [, opts] = mockSubscribe.mock.calls[0] as [
      string,
      { input: Record<string, unknown> }
    ];
    expect("seed" in opts.input).toBe(false);
  });
});

/* ================================================================== */
/*  imageToImage                                                        */
/* ================================================================== */

describe("FalProvider.imageToImage", () => {
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(pngBytes.buffer)
    });
  });

  it("returns image bytes", async () => {
    mockSubscribe.mockResolvedValue({
      data: { images: [{ url: "https://cdn.fal.media/out.png" }] }
    });
    const provider = new FalProvider("key");
    const params: ImageToImageParams = {
      imageBytes: new Uint8Array([1, 2, 3]),
      prompt: "make it futuristic",
      model: "fal-ai/flux/dev"
    };
    const result = await provider.imageToImage(params);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it("sends the input image as a data URI", async () => {
    mockSubscribe.mockResolvedValue({
      data: { images: [{ url: "https://cdn.fal.media/out.png" }] }
    });
    const provider = new FalProvider("key");
    await provider.imageToImage({
      imageBytes: new Uint8Array([0x89, 0x50]),
      prompt: "test",
      model: "fal-ai/flux/dev"
    });
    const [, opts] = mockSubscribe.mock.calls[0] as [
      string,
      { input: Record<string, unknown> }
    ];
    expect(typeof opts.input.image_url).toBe("string");
    expect(
      (opts.input.image_url as string).startsWith("data:image/png;base64,")
    ).toBe(true);
  });

  it("increments counters on success", async () => {
    mockSubscribe.mockResolvedValue({
      data: { images: [{ url: "https://cdn.fal.media/out.png" }] }
    });
    const provider = new FalProvider("key");
    await provider.imageToImage({
      imageBytes: new Uint8Array([1]),
      prompt: "test",
      model: "fal-ai/flux/dev"
    });
    expect(provider.totalRequests).toBe(1);
    expect(provider.totalImages).toBe(1);
  });

  it("passes optional parameters", async () => {
    mockSubscribe.mockResolvedValue({
      data: { images: [{ url: "https://cdn.fal.media/out.png" }] }
    });
    const provider = new FalProvider("key");
    const params: ImageToImageParams = {
      imageBytes: new Uint8Array([1]),
      prompt: "test",
      model: "fal-ai/flux/dev",
      strength: 0.8,
      guidanceScale: 5,
      numInferenceSteps: 10,
      targetWidth: 256,
      targetHeight: 256,
      seed: 7
    };
    await provider.imageToImage(params);
    const [, opts] = mockSubscribe.mock.calls[0] as [
      string,
      { input: Record<string, unknown> }
    ];
    expect(opts.input.strength).toBe(0.8);
    expect(opts.input.guidance_scale).toBe(5);
    expect(opts.input.num_inference_steps).toBe(10);
    expect(opts.input.image_size).toEqual({ width: 256, height: 256 });
    expect(opts.input.seed).toBe(7);
  });

  it("wraps errors with formatted message", async () => {
    mockSubscribe.mockRejectedValue(new Error("bad"));
    const provider = new FalProvider("key");
    await expect(
      provider.imageToImage({
        imageBytes: new Uint8Array([1]),
        prompt: "test",
        model: "fal-ai/flux/dev"
      })
    ).rejects.toThrow("FAL image-to-image generation failed");
  });
});

/* ================================================================== */
/*  textToSpeech                                                        */
/* ================================================================== */

describe("FalProvider.textToSpeech", () => {
  const wavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // RIFF header

  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(wavBytes.buffer)
    });
  });

  it("throws immediately for empty text", async () => {
    const provider = new FalProvider("key");
    await expect(
      provider.textToSpeech({
        text: "",
        model: "fal-ai/mmaudio-v2/text-to-audio"
      })
    ).rejects.toThrow("text must not be empty");
  });

  it("returns audio bytes on success", async () => {
    mockSubscribe.mockResolvedValue({
      data: { audio: { url: "https://cdn.fal.media/result.wav" } }
    });
    const provider = new FalProvider("key");
    const result = await provider.textToSpeech({
      text: "Hello, world!",
      model: "fal-ai/mmaudio-v2/text-to-audio"
    });
    expect(result).toBeInstanceOf(Uint8Array);
    const [endpoint, opts] = mockSubscribe.mock.calls[0] as [
      string,
      { input: Record<string, unknown> }
    ];
    expect(endpoint).toBe("fal-ai/mmaudio-v2/text-to-audio");
    expect(opts.input.prompt).toBe("Hello, world!");
  });

  it("passes optional parameters", async () => {
    mockSubscribe.mockResolvedValue({
      data: { audio: { url: "https://cdn.fal.media/result.wav" } }
    });
    const provider = new FalProvider("key");
    const params: TextToSpeechParams = {
      text: "Hello",
      model: "fal-ai/mmaudio-v2/text-to-audio",
      numSteps: 50,
      duration: 10,
      cfgStrength: 4.5,
      negativePrompt: "noise",
      seed: 99
    };
    await provider.textToSpeech(params);
    const [, opts] = mockSubscribe.mock.calls[0] as [
      string,
      { input: Record<string, unknown> }
    ];
    expect(opts.input.num_steps).toBe(50);
    expect(opts.input.duration).toBe(10);
    expect(opts.input.cfg_strength).toBe(4.5);
    expect(opts.input.negative_prompt).toBe("noise");
    expect(opts.input.seed).toBe(99);
  });

  it("throws when response has no audio.url", async () => {
    mockSubscribe.mockResolvedValue({ data: { text: "some text" } });
    const provider = new FalProvider("key");
    await expect(
      provider.textToSpeech({
        text: "test",
        model: "fal-ai/mmaudio-v2/text-to-audio"
      })
    ).rejects.toThrow("FAL text-to-speech generation failed");
  });

  it("wraps submission errors with formatted message", async () => {
    mockSubscribe.mockRejectedValue(new Error("network error"));
    const provider = new FalProvider("key");
    await expect(
      provider.textToSpeech({
        text: "test",
        model: "fal-ai/mmaudio-v2/text-to-audio"
      })
    ).rejects.toThrow("FAL text-to-speech generation failed");
  });
});
