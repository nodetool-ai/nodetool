import { describe, it, expect, vi } from "vitest";
import { ReplicateProvider } from "../../src/providers/replicate-provider.js";
import type { Message } from "../../src/providers/types.js";
import { runWithGenerationReceipt } from "../../src/generation-receipt.js";

/** Helper to create a provider with a mock Replicate client. */
function createProvider(overrides: Record<string, unknown> = {}) {
  return new ReplicateProvider(
    { REPLICATE_API_TOKEN: "r8_test" },
    { client: { run: vi.fn(), stream: vi.fn(), ...overrides } as any }
  );
}

describe("ReplicateProvider", () => {
  it("throws if REPLICATE_API_TOKEN is missing", () => {
    expect(() => new ReplicateProvider({})).toThrow(
      "REPLICATE_API_TOKEN is required"
    );
  });

  it("reports provider id as replicate", () => {
    expect(createProvider().provider).toBe("replicate");
  });

  it("returns required secrets", () => {
    expect(ReplicateProvider.requiredSecrets()).toEqual([
      "REPLICATE_API_TOKEN"
    ]);
  });

  it("returns container env with REPLICATE_API_TOKEN", () => {
    expect(createProvider().getContainerEnv()).toEqual({
      REPLICATE_API_TOKEN: "r8_test"
    });
  });

  it("hasToolSupport returns false", async () => {
    expect(await createProvider().hasToolSupport("any-model")).toBe(false);
  });

  it("returns a non-empty list of language models", async () => {
    const models = await createProvider().getAvailableLanguageModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].provider).toBe("replicate");
    expect(models.some((m) => m.id.includes("llama"))).toBe(true);
  });

  it("returns a non-empty list of image models", async () => {
    const models = await createProvider().getAvailableImageModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].provider).toBe("replicate");
    expect(models.some((m) => m.id.includes("flux"))).toBe(true);
  });

  // --- Chat via replicate.run() ---

  it("generateMessage calls client.run with correct model and input", async () => {
    const runMock = vi
      .fn()
      .mockResolvedValue(["Hello", " from", " Replicate!"]);
    const provider = createProvider({ run: runMock });

    const messages: Message[] = [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "hello" }
    ];
    const result = await provider.generateMessage({
      messages,
      model: "qwen/qwen3-235b-a22b-instruct-2507"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("Hello from Replicate!");

    expect(runMock).toHaveBeenCalledWith("qwen/qwen3-235b-a22b-instruct-2507", {
      input: expect.objectContaining({
        prompt: "hello",
        system_prompt: "You are helpful"
      })
    });
  });

  it("generateMessage handles string output", async () => {
    const runMock = vi.fn().mockResolvedValue("Direct string response");
    const provider = createProvider({ run: runMock });

    const result = await provider.generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "meta/meta-llama-3-70b-instruct"
    });

    expect(result.content).toBe("Direct string response");
  });

  it("generateMessage passes temperature and topP", async () => {
    const runMock = vi.fn().mockResolvedValue("ok");
    const provider = createProvider({ run: runMock });

    await provider.generateMessage({
      messages: [{ role: "user", content: "test" }],
      model: "meta/meta-llama-3-70b-instruct",
      temperature: 0.5,
      topP: 0.9,
      maxTokens: 100
    });

    const input = runMock.mock.calls[0][1].input;
    expect(input.temperature).toBe(0.5);
    expect(input.top_p).toBe(0.9);
    expect(input.max_tokens).toBe(100);
  });

  // --- Streaming via replicate.stream() ---

  it("generateMessages streams via client.stream()", async () => {
    async function* fakeStream() {
      yield { event: "output", data: "Hello" };
      yield { event: "output", data: " world" };
      yield { event: "done", data: {} };
    }
    const streamMock = vi.fn().mockReturnValue(fakeStream());
    const provider = createProvider({ stream: streamMock });

    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages: [{ role: "user", content: "hi" }],
      model: "meta/meta-llama-3-70b-instruct"
    })) {
      items.push(item);
    }

    expect(items.length).toBe(3);
    expect((items[0] as any).content).toBe("Hello");
    expect((items[1] as any).content).toBe(" world");
    expect((items[2] as any).done).toBe(true);

    expect(streamMock).toHaveBeenCalledWith("meta/meta-llama-3-70b-instruct", {
      input: expect.objectContaining({ prompt: "hi" })
    });
  });

  it("generateMessages throws on stream error event", async () => {
    async function* fakeStream() {
      yield { event: "output", data: "partial" };
      yield { event: "error", data: "model crashed" };
    }
    const streamMock = vi.fn().mockReturnValue(fakeStream());
    const provider = createProvider({ stream: streamMock });

    const items: unknown[] = [];
    await expect(async () => {
      for await (const item of provider.generateMessages({
        messages: [{ role: "user", content: "hi" }],
        model: "meta/meta-llama-3-70b-instruct"
      })) {
        items.push(item);
      }
    }).rejects.toThrow("Replicate stream error: model crashed");

    // Should have received the partial output before the error
    expect(items.length).toBe(1);
  });

  // --- Image generation via replicate.run() ---

  it("textToImage calls client.run and reads FileOutput stream", async () => {
    // Simulate a FileOutput (ReadableStream)
    const fakeBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    let readCount = 0;
    const fakeReadableStream = {
      getReader: () => ({
        read: () => {
          if (readCount === 0) {
            readCount++;
            return Promise.resolve({ done: false, value: fakeBytes });
          }
          return Promise.resolve({ done: true, value: undefined });
        }
      })
    };

    const runMock = vi.fn().mockResolvedValue([fakeReadableStream]);
    const provider = createProvider({ run: runMock });

    const result = await provider.textToImage({
      model: {
        id: "black-forest-labs/flux-schnell",
        name: "FLUX Schnell",
        provider: "replicate"
      },
      prompt: "a cat"
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(4);

    expect(runMock).toHaveBeenCalledWith("black-forest-labs/flux-schnell", {
      input: expect.objectContaining({ prompt: "a cat" })
    });
  });

  it("imageToImage uses the model schema's single image field (input_image)", async () => {
    const runMock = vi.fn().mockResolvedValue("https://replicate.dev/out.png");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2]).buffer)
      })
    );
    const provider = createProvider({ run: runMock });

    // flux-kontext-pro declares `input_image` (single), not `image`.
    await provider.imageToImage([new Uint8Array([1, 2, 3])], {
      model: {
        id: "black-forest-labs/flux-kontext-pro",
        name: "Kontext Pro",
        provider: "replicate"
      },
      prompt: "make it blue"
    });

    const input = runMock.mock.calls[0][1].input;
    expect(input.input_image).toMatch(/^data:image\/png;base64,/);
    expect(input.image).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("imageToVideo sends the end frame to the field the schema declares", async () => {
    const runMock = vi.fn().mockResolvedValue("https://replicate.dev/out.mp4");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2]).buffer)
      })
    );
    const provider = createProvider({ run: runMock });
    for (const [id, field] of [["minimax/hailuo-02", "last_frame_image"], ["luma/ray-2-540p", "end_image"]] as const) {
      runMock.mockClear();
      await provider.imageToVideo(new Uint8Array([1, 2, 3]), {
        model: { id, name: id, provider: "replicate" },
        prompt: "transition",
        endImage: new Uint8Array([4, 5, 6])
      });
      const input = runMock.mock.calls[0][1].input;
      expect(input[field]).toMatch(/^data:image\/png;base64,/);
    }
    vi.unstubAllGlobals();
  });

  it("imageToVideo refuses an end frame on a model that declares none", async () => {
    const runMock = vi.fn();
    const provider = createProvider({ run: runMock });
    await expect(provider.imageToVideo(new Uint8Array([1, 2, 3]), {
      model: { id: "minimax/video-01", name: "video-01", provider: "replicate" },
      prompt: "transition",
      endImage: new Uint8Array([4, 5, 6])
    })).rejects.toThrow("Replicate model minimax/video-01 takes no end frame");
    expect(runMock).not.toHaveBeenCalled();
  });

  it("imageToImage uses the model schema's list field for multiple images", async () => {
    const runMock = vi.fn().mockResolvedValue("https://replicate.dev/out.png");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2]).buffer)
      })
    );
    const provider = createProvider({ run: runMock });

    // bytedance/seedream-4 declares `image_input` (list[image]).
    await provider.imageToImage(
      [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])],
      {
        model: {
          id: "bytedance/seedream-4",
          name: "Seedream 4",
          provider: "replicate"
        },
        prompt: "compose"
      }
    );

    const input = runMock.mock.calls[0][1].input;
    expect(Array.isArray(input.image_input)).toBe(true);
    expect((input.image_input as string[]).length).toBe(2);
    expect(input.image).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("imageToImage sends the requested aspect ratio and resolution the model declares", async () => {
    const runMock = vi.fn().mockResolvedValue("https://replicate.dev/out.png");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2]).buffer)
      })
    );
    const provider = createProvider({ run: runMock });

    // nano-banana-2 defaults aspect_ratio to match_input_image, so square
    // reference images would give a square still without the ratio.
    await provider.imageToImage([new Uint8Array([1, 2, 3])], {
      model: {
        id: "google/nano-banana-2",
        name: "Nano Banana 2",
        provider: "replicate"
      },
      prompt: "a storyboard still",
      aspectRatio: "16:9",
      resolution: "1K",
      targetWidth: 1820,
      targetHeight: 1024
    });

    const input = runMock.mock.calls[0][1].input;
    expect(input.aspect_ratio).toBe("16:9");
    expect(input.resolution).toBe("1K");
    expect(input.width).toBeUndefined();
    expect(input.height).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("textToImage sends the requested aspect ratio the model declares", async () => {
    const runMock = vi.fn().mockResolvedValue("https://replicate.dev/out.png");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2]).buffer)
      })
    );
    const provider = createProvider({ run: runMock });

    await provider.textToImage({
      model: {
        id: "google/nano-banana-2",
        name: "Nano Banana 2",
        provider: "replicate"
      },
      prompt: "a storyboard still",
      aspectRatio: "16:9",
      resolution: "2K",
      width: 1820,
      height: 1024
    });

    const input = runMock.mock.calls[0][1].input;
    expect(input.aspect_ratio).toBe("16:9");
    expect(input.resolution).toBe("2K");
    expect(input.width).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("imageToImage falls back to `image` for models not in the manifest", async () => {
    const runMock = vi.fn().mockResolvedValue("https://replicate.dev/out.png");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2]).buffer)
      })
    );
    const provider = createProvider({ run: runMock });

    await provider.imageToImage([new Uint8Array([1, 2, 3])], {
      model: { id: "owner/unknown-model", name: "Unknown", provider: "replicate" },
      prompt: "x"
    });

    const input = runMock.mock.calls[0][1].input;
    expect(input.image).toMatch(/^data:image\/png;base64,/);
    expect(input.image_input).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("inpaint routes the mask to the model's declared mask field", async () => {
    const runMock = vi.fn().mockResolvedValue("https://replicate.dev/out.png");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2]).buffer)
      })
    );
    const provider = createProvider({ run: runMock });

    // stable-diffusion-inpainting declares `image` (primary) and `mask`.
    await provider.inpaint([new Uint8Array([1, 2, 3])], {
      model: {
        id: "stability-ai/stable-diffusion-inpainting",
        name: "SD Inpainting",
        provider: "replicate"
      },
      prompt: "fill the hole",
      mask: new Uint8Array([9, 9, 9])
    });

    const input = runMock.mock.calls[0][1].input;
    expect(input.image).toMatch(/^data:image\/png;base64,/);
    expect(input.mask).toMatch(/^data:image\/png;base64,/);

    vi.unstubAllGlobals();
  });

  it("inpaint falls back to mask_url when the model declares no mask field", async () => {
    const runMock = vi.fn().mockResolvedValue("https://replicate.dev/out.png");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2]).buffer)
      })
    );
    const provider = createProvider({ run: runMock });

    await provider.inpaint([new Uint8Array([1, 2, 3])], {
      model: { id: "owner/unknown-model", name: "Unknown", provider: "replicate" },
      prompt: "x",
      mask: new Uint8Array([9, 9, 9])
    });

    const input = runMock.mock.calls[0][1].input;
    expect(input.mask_url).toMatch(/^data:image\/png;base64,/);

    vi.unstubAllGlobals();
  });

  it("textToImage handles string URL output", async () => {
    const fakeBytes = new Uint8Array([0xff, 0xd8]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(fakeBytes.buffer)
      })
    );

    const runMock = vi
      .fn()
      .mockResolvedValue("https://replicate.delivery/image.png");
    const provider = createProvider({ run: runMock });

    const result = await provider.textToImage({
      model: {
        id: "black-forest-labs/flux-schnell",
        name: "FLUX Schnell",
        provider: "replicate"
      },
      prompt: "a dog"
    });

    expect(result).toBeInstanceOf(Uint8Array);
    vi.unstubAllGlobals();
  });

  it("textToImage waits out the low-credit 429 instead of failing", async () => {
    const throttled = Object.assign(
      new Error(
        'Request to https://api.replicate.com/v1/predictions failed with status 429 Too Many Requests: {"status":429,"retry_after":5}.'
      ),
      { response: { status: 429, headers: new Headers() } }
    );
    const fakeReadableStream = {
      getReader: () => ({
        read: () => Promise.resolve({ done: true, value: undefined })
      })
    };
    const runMock = vi
      .fn()
      .mockRejectedValueOnce(throttled)
      .mockResolvedValue([fakeReadableStream]);
    const provider = createProvider({ run: runMock });

    vi.useFakeTimers();
    const result = provider.textToImage({
      model: {
        id: "black-forest-labs/flux-schnell",
        name: "FLUX Schnell",
        provider: "replicate"
      },
      prompt: "a cat"
    });
    await vi.advanceTimersByTimeAsync(120_000);

    expect(await result).toBeInstanceOf(Uint8Array);
    expect(runMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("textToImage throws on empty prompt", async () => {
    await expect(
      createProvider().textToImage({
        model: {
          id: "black-forest-labs/flux-schnell",
          name: "FLUX Schnell",
          provider: "replicate"
        },
        prompt: ""
      })
    ).rejects.toThrow("Prompt is required");
  });

  it("textToImage passes optional params", async () => {
    const fakeReadableStream = {
      getReader: () => ({
        read: () => Promise.resolve({ done: true, value: undefined })
      })
    };
    const runMock = vi.fn().mockResolvedValue([fakeReadableStream]);
    const provider = createProvider({ run: runMock });

    // An unlisted model has no declared inputs, so nothing is pruned.
    await provider.textToImage({
      model: {
        id: "owner/unknown-model",
        name: "Unknown",
        provider: "replicate"
      },
      prompt: "test",
      width: 1024,
      height: 768,
      negativePrompt: "blurry",
      guidanceScale: 7.5,
      numInferenceSteps: 30,
      seed: 42
    });

    const input = runMock.mock.calls[0][1].input;
    expect(input.width).toBe(1024);
    expect(input.height).toBe(768);
    expect(input.negative_prompt).toBe("blurry");
    expect(input.guidance_scale).toBe(7.5);
    expect(input.num_inference_steps).toBe(30);
    expect(input.seed).toBe(42);
  });
});

describe("ReplicateProvider endpoint calls", () => {
  function throttled(): Error {
    return Object.assign(new Error("status 429 Too Many Requests"), {
      response: { status: 429, headers: new Headers({ "retry-after": "5" }) }
    });
  }

  it("supports endpoint calls", () => {
    expect(createProvider().supportsEndpointCalls()).toBe(true);
  });

  it("runs the model with the input unchanged and records the prediction id", async () => {
    const runMock = vi.fn(
      async (
        _model: string,
        _options: unknown,
        progress?: (prediction: { id: string; status: string }) => void
      ) => {
        progress?.({ id: "pred-1", status: "starting" });
        progress?.({ id: "pred-1", status: "succeeded" });
        return { image: "https://replicate.delivery/out.png" };
      }
    );
    const provider = createProvider({ run: runMock });
    const progress: unknown[] = [];

    const { value, receipt } = await runWithGenerationReceipt(() =>
      provider.callEndpoint({
        model: "owner/model:abc123",
        input: { prompt: "a fox", nested: { keep: "" } },
        onProgress: (event) => progress.push(event)
      })
    );

    expect(runMock).toHaveBeenCalledWith(
      "owner/model:abc123",
      { input: { prompt: "a fox", nested: { keep: "" } } },
      expect.any(Function)
    );
    expect(value).toEqual({
      output: { image: "https://replicate.delivery/out.png" },
      requestId: "pred-1"
    });
    expect(receipt).toEqual({ provider_request_id: "pred-1" });
    expect(progress).toEqual([
      { message: "starting" },
      { message: "succeeded" }
    ]);
  });

  it("returns output URLs as strings, without FileOutput downloads", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "pred-2",
            status: "succeeded",
            output: ["https://replicate.delivery/out.mp4"]
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        )
    );
    const provider = new ReplicateProvider(
      { REPLICATE_API_TOKEN: "r8_test" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const result = await provider.callEndpoint({
      model: "owner/video",
      input: { prompt: "a fox runs" }
    });

    expect(result).toEqual({
      output: ["https://replicate.delivery/out.mp4"],
      requestId: "pred-2"
    });
    // One request: the prediction. A FileOutput would have fetched the file.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      URL,
      RequestInit
    ];
    expect(String(url)).toBe("https://api.replicate.com/v1/models/owner/video/predictions");
    expect(JSON.parse(String(init.body))).toEqual({
      input: { prompt: "a fox runs" }
    });
  });

  it("rejects a route", async () => {
    const runMock = vi.fn();
    await expect(
      createProvider({ run: runMock }).callEndpoint({
        model: "owner/model",
        input: {},
        route: "suno"
      })
    ).rejects.toThrow("replicate does not accept an endpoint route: suno");
    expect(runMock).not.toHaveBeenCalled();
  });

  it("waits out the low-credit throttle", async () => {
    vi.useFakeTimers();
    try {
      const runMock = vi
        .fn()
        .mockRejectedValueOnce(throttled())
        .mockResolvedValue("https://replicate.delivery/relit.png");
      const result = createProvider({ run: runMock }).callEndpoint({
        model: "owner/relight",
        input: {}
      });
      await vi.advanceTimersByTimeAsync(120_000);
      await expect(result).resolves.toEqual({
        output: "https://replicate.delivery/relit.png",
        requestId: null
      });
      expect(runMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("forwards the abort signal and fails when the run was cancelled", async () => {
    const controller = new AbortController();
    const runMock = vi.fn(async () => {
      // The SDK cancels the prediction and resolves with its partial output.
      controller.abort(new Error("Generation cancelled"));
      return null;
    });
    await expect(
      createProvider({ run: runMock }).callEndpoint({
        model: "owner/model",
        input: {},
        signal: controller.signal
      })
    ).rejects.toThrow("Generation cancelled");
    const [model, options] = runMock.mock.calls[0] as unknown as [
      string,
      { input: unknown; signal?: AbortSignal }
    ];
    expect(model).toBe("owner/model");
    expect(options.signal).toBe(controller.signal);
  });

  it("uploads bytes through the files API", async () => {
    const create = vi.fn(async () => ({
      urls: { get: "https://api.replicate.com/v1/files/f1" }
    }));
    const provider = createProvider({ files: { create } });

    const url = await provider.uploadMedia({
      bytes: Uint8Array.from([1, 2, 3]),
      mimeType: "image/png",
      filename: "upload.png"
    });

    expect(url).toBe("https://api.replicate.com/v1/files/f1");
    const [blob, metadata, options] = create.mock.calls[0] as unknown as [
      Blob,
      Record<string, unknown>,
      Record<string, unknown>
    ];
    expect(blob.type).toBe("image/png");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(
      Uint8Array.from([1, 2, 3])
    );
    expect(metadata).toEqual({ filename: "upload.png" });
    expect(options).toEqual({});
  });

  it("fails an upload whose response has no URL", async () => {
    const provider = createProvider({
      files: { create: vi.fn(async () => ({ urls: {} })) }
    });
    await expect(
      provider.uploadMedia({ bytes: new Uint8Array([1]), mimeType: "audio/wav" })
    ).rejects.toThrow("No URL in upload response");
  });
});
