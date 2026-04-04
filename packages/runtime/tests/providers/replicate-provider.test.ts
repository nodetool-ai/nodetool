import { describe, it, expect, vi } from "vitest";
import { ReplicateProvider } from "../../src/providers/replicate-provider.js";
import type { Message } from "../../src/providers/types.js";

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

  it("textToImage handles string URL output", async () => {
    const fakeBytes = new Uint8Array([0xff, 0xd8]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
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

    await provider.textToImage({
      model: {
        id: "black-forest-labs/flux-schnell",
        name: "FLUX",
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
