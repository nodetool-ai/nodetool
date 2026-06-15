import { describe, it, expect, vi, beforeEach } from "vitest";
import { FalProvider } from "../../src/providers/fal-provider.js";
import type {
  TextToImageParams,
  ImageToImageParams
} from "../../src/providers/types.js";

// Mock the @fal-ai/client module
vi.mock("@fal-ai/client", () => ({
  createFalClient: vi.fn((_opts: { credentials: string }) => ({
    subscribe: vi.fn()
  }))
}));

function createProvider(apiKey = "test-key"): FalProvider {
  return new FalProvider({ FAL_API_KEY: apiKey });
}

describe("FalProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Construction ---

  // --- getAvailableImageModels ---

  it("returns a non-empty list of image models", async () => {
    const p = createProvider();
    const models = await p.getAvailableImageModels();
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe("fal_ai");
      expect(m.id).toBeTruthy();
      expect(m.name).toBeTruthy();
    }
  });

  it("includes well-known models", async () => {
    const p = createProvider();
    const models = await p.getAvailableImageModels();
    const ids = models.map((m) => m.id);
    expect(ids).toContain("fal-ai/flux/dev");
    expect(ids).toContain("fal-ai/flux/schnell");
    expect(ids).toContain("fal-ai/fast-sdxl");
  });

  // --- Chat generation throws ---

  it("generateMessage throws (not supported)", async () => {
    const p = createProvider();
    await expect(
      p.generateMessage({ messages: [], model: "test" } as any)
    ).rejects.toThrow("fal_ai does not support chat generation");
  });

  it("generateMessages throws (not supported)", async () => {
    const p = createProvider();
    const gen = p.generateMessages({ messages: [], model: "test" } as any);
    await expect(gen.next()).rejects.toThrow(
      "fal_ai does not support chat generation"
    );
  });

  // --- textToImage ---

  it("textToImage sends correct params to client.subscribe", async () => {
    const subscribeMock = vi.fn().mockResolvedValue({
      data: { images: [{ url: "https://fal.ai/result.png" }] }
    });

    // Replace fetch for image download
    const fakePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(fakePng.buffer)
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = createProvider("key-123");
    // Inject mock client
    (p as any)._client = { subscribe: subscribeMock };

    const params: TextToImageParams = {
      prompt: "a cat",
      model: { id: "fal-ai/flux/dev", name: "FLUX.1 Dev", provider: "fal_ai" },
      width: 1024,
      height: 768,
      negativePrompt: "blurry",
      guidanceScale: 7.5,
      numInferenceSteps: 30,
      seed: 42
    };

    const result = await p.textToImage(params);
    expect(result).toBeInstanceOf(Uint8Array);

    expect(subscribeMock).toHaveBeenCalledWith(
      "fal-ai/flux/dev",
      expect.objectContaining({
        input: expect.objectContaining({
          prompt: "a cat",
          guidance_scale: 7.5,
          num_inference_steps: 30,
          seed: 42,
          output_format: "png"
        }),
        logs: true
      })
    );

    vi.unstubAllGlobals();
  });

  it("textToImage skips seed when -1", async () => {
    const subscribeMock = vi.fn().mockResolvedValue({
      data: { images: [{ url: "https://fal.ai/result.png" }] }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4))
      })
    );

    const p = createProvider();
    (p as any)._client = { subscribe: subscribeMock };

    await p.textToImage({
      prompt: "test",
      model: { id: "fal-ai/flux/schnell", name: "FLUX", provider: "fal_ai" },
      seed: -1
    });

    const input = subscribeMock.mock.calls[0][1].input;
    expect(input).not.toHaveProperty("seed");

    vi.unstubAllGlobals();
  });

  // --- imageToImage ---

  it("imageToImage uploads image via client.storage.upload", async () => {
    const uploadedUrl = "https://fal.media/files/uploaded-abc.png";
    const uploadMock = vi.fn().mockResolvedValue(uploadedUrl);
    const subscribeMock = vi.fn().mockResolvedValue({
      data: { image: { url: "https://fal.ai/result.png" } }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4))
      })
    );

    const p = createProvider();
    (p as any)._client = {
      subscribe: subscribeMock,
      storage: { upload: uploadMock }
    };

    const inputImage = new Uint8Array([1, 2, 3, 4]);
    const params: ImageToImageParams = {
      prompt: "enhance",
      model: { id: "fal-ai/kolors/image-to-image", name: "Kolors Image-to-Image", provider: "fal_ai" },
      strength: 0.8
    };

    await p.imageToImage([inputImage], params);

    // Verify the blob was uploaded via the FAL storage API
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const uploadedBlob = uploadMock.mock.calls[0][0];
    expect(uploadedBlob).toBeInstanceOf(Blob);
    expect((uploadedBlob as Blob).type).toBe("image/png");

    const input = subscribeMock.mock.calls[0][1].input;
    expect(input.prompt).toBe("enhance");
    expect(input.image_url).toBe(uploadedUrl);
    expect(input.strength).toBe(0.8);

    vi.unstubAllGlobals();
  });

  it("imageToImage forwards multiple images as image_urls for list endpoints", async () => {
    const uploadMock = vi
      .fn()
      .mockResolvedValueOnce("https://fal.media/files/a.png")
      .mockResolvedValueOnce("https://fal.media/files/b.png");
    const subscribeMock = vi.fn().mockResolvedValue({
      data: { image: { url: "https://fal.ai/result.png" } }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4))
      })
    );

    const p = createProvider();
    (p as any)._client = {
      subscribe: subscribeMock,
      storage: { upload: uploadMock }
    };

    const params: ImageToImageParams = {
      prompt: "merge",
      // qwen-image-edit-2509 declares an `image_urls` (list[image]) input.
      model: {
        id: "fal-ai/qwen-image-edit-2509",
        name: "Qwen Image Edit",
        provider: "fal_ai"
      }
    };

    await p.imageToImage(
      [new Uint8Array([1, 2]), new Uint8Array([3, 4])],
      params
    );

    expect(uploadMock).toHaveBeenCalledTimes(2);
    const input = subscribeMock.mock.calls[0][1].input;
    expect(input.image_urls).toEqual([
      "https://fal.media/files/a.png",
      "https://fal.media/files/b.png"
    ]);
    expect(input.image_url).toBeUndefined();

    vi.unstubAllGlobals();
  });

  // --- inpaint ---

  it("inpaint attaches the mask to the endpoint's declared mask field", async () => {
    const uploadMock = vi
      .fn()
      .mockResolvedValueOnce("https://fal.media/files/src.png")
      .mockResolvedValueOnce("https://fal.media/files/mask.png");
    const subscribeMock = vi.fn().mockResolvedValue({
      data: { image: { url: "https://fal.ai/result.png" } }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4))
      })
    );

    const p = createProvider();
    (p as any)._client = {
      subscribe: subscribeMock,
      storage: { upload: uploadMock }
    };

    // ideogram/v2/edit declares `image_url` (source) plus `mask_url`.
    await p.inpaint([new Uint8Array([1, 2, 3, 4])], {
      prompt: "fill",
      model: {
        id: "fal-ai/ideogram/v2/edit",
        name: "Ideogram Edit",
        provider: "fal_ai"
      },
      mask: new Uint8Array([5, 6, 7, 8])
    });

    expect(uploadMock).toHaveBeenCalledTimes(2);
    const input = subscribeMock.mock.calls[0][1].input;
    expect(input.image_url).toBe("https://fal.media/files/src.png");
    expect(input.mask_url).toBe("https://fal.media/files/mask.png");

    vi.unstubAllGlobals();
  });

  // --- extractImageUrl edge cases ---

  it("textToImage handles response with result.image.url format", async () => {
    const subscribeMock = vi.fn().mockResolvedValue({
      data: { image: { url: "https://fal.ai/single.png" } }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4))
      })
    );

    const p = createProvider();
    (p as any)._client = { subscribe: subscribeMock };

    const result = await p.textToImage({
      prompt: "test",
      model: { id: "fal-ai/recraft-v3", name: "Recraft", provider: "fal_ai" }
    });
    expect(result).toBeInstanceOf(Uint8Array);

    vi.unstubAllGlobals();
  });

  it("textToImage throws on unexpected response format", async () => {
    const subscribeMock = vi
      .fn()
      .mockResolvedValue({ data: { unexpected: true } });

    const p = createProvider();
    (p as any)._client = { subscribe: subscribeMock };

    await expect(
      p.textToImage({
        prompt: "test",
        model: { id: "fal-ai/flux/dev", name: "FLUX", provider: "fal_ai" }
      })
    ).rejects.toThrow("Unexpected FAL image response");
  });

  it("textToImage throws on failed download", async () => {
    const subscribeMock = vi.fn().mockResolvedValue({
      data: { images: [{ url: "https://fal.ai/result.png" }] }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );

    const p = createProvider();
    (p as any)._client = { subscribe: subscribeMock };

    await expect(
      p.textToImage({
        prompt: "test",
        model: { id: "fal-ai/flux/dev", name: "FLUX", provider: "fal_ai" }
      })
    ).rejects.toThrow("Failed to download FAL result: 500");

    vi.unstubAllGlobals();
  });
});
