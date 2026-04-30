import { describe, it, expect, vi } from "vitest";
import { encodeBinary } from "@aki-io/aki-io";
import OpenAI from "openai";
import { AkiProvider } from "../../src/providers/aki-provider.js";

type DoApiRequest = ReturnType<typeof vi.fn>;
type GetGenerator = (params: unknown) => AsyncGenerator<unknown>;

interface FakeAkiClient {
  doApiRequest: DoApiRequest;
  getApiRequestGenerator: GetGenerator;
}

function makeAkiFactory(client: Partial<FakeAkiClient> = {}) {
  const base: FakeAkiClient = {
    doApiRequest: vi.fn(),
    getApiRequestGenerator: async function* () { /* empty */ }
  };
  const merged = { ...base, ...client } as FakeAkiClient;
  const factory = vi.fn().mockReturnValue(merged);
  return { factory, client: merged };
}

function makeOpenAIClient(overrides: { create?: ReturnType<typeof vi.fn> } = {}): OpenAI {
  return {
    chat: {
      completions: {
        create: overrides.create ?? vi.fn()
      }
    }
  } as unknown as OpenAI;
}

describe("AkiProvider", () => {
  it("reports required secrets, container env, and provider id", () => {
    const provider = new AkiProvider({ AKI_API_KEY: "secret" });

    expect(AkiProvider.requiredSecrets()).toEqual(["AKI_API_KEY"]);
    expect(provider.getContainerEnv()).toEqual({ AKI_API_KEY: "secret" });
    expect((provider as unknown as { provider: string }).provider).toBe("aki");
  });

  it("throws when AKI_API_KEY is missing or empty", () => {
    expect(() => new AkiProvider({})).toThrow("AKI_API_KEY is not configured");
    expect(() => new AkiProvider({ AKI_API_KEY: "   " })).toThrow(
      "AKI_API_KEY is not configured"
    );
  });

  it("advertises tool support for all models", async () => {
    const provider = new AkiProvider({ AKI_API_KEY: "k" });
    expect(await provider.hasToolSupport("llama3_chat")).toBe(true);
    expect(await provider.hasToolSupport("any-model")).toBe(true);
  });

  // ── LLM via OpenAI endpoint ────────────────────────────────────────────────

  it("generateMessage calls the OpenAI-compatible endpoint", async () => {
    const mockCompletion = {
      choices: [
        {
          message: { role: "assistant", content: "hello from aki", tool_calls: null },
          finish_reason: "stop"
        }
      ],
      usage: { prompt_tokens: 4, completion_tokens: 7 }
    };
    const create = vi.fn().mockResolvedValue(mockCompletion);
    const provider = new AkiProvider(
      { AKI_API_KEY: "k" },
      { client: makeOpenAIClient({ create }) }
    );

    const result = await provider.generateMessage({
      model: "llama3_chat",
      messages: [
        { role: "system", content: "you are helpful" },
        { role: "user", content: "hi" }
      ],
      maxTokens: 128,
      temperature: 0.5,
      topP: 0.9
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("hello from aki");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "llama3_chat", stream: false })
    );
  });

  it("uses https://aki.io/v1 as the OpenAI base URL", () => {
    let capturedConfig: ConstructorParameters<typeof OpenAI>[0] | undefined;
    const openaiClientFactory = (key: string) => {
      capturedConfig = { apiKey: key, baseURL: "https://aki.io/v1" };
      return makeOpenAIClient();
    };

    const provider = new AkiProvider(
      { AKI_API_KEY: "my-key" },
      { openaiClientFactory }
    );
    provider.getClient();
    expect(capturedConfig?.baseURL).toBe("https://aki.io/v1");
  });

  // ── Language model listing ─────────────────────────────────────────────────

  it("getAvailableLanguageModels fetches from https://aki.io/v1/models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "llama3_chat", name: "Llama 3 Chat" },
          { id: "mistral-7b", name: "Mistral 7B" }
        ]
      })
    } as Response);

    const provider = new AkiProvider({ AKI_API_KEY: "k" }, { fetchFn: mockFetch });

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "llama3_chat", name: "Llama 3 Chat", provider: "aki" },
      { id: "mistral-7b", name: "Mistral 7B", provider: "aki" }
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://aki.io/v1/models",
      expect.objectContaining({ headers: { Authorization: "Bearer k" } })
    );
  });

  it("getAvailableLanguageModels returns empty array on fetch failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response);
    const provider = new AkiProvider({ AKI_API_KEY: "bad" }, { fetchFn: mockFetch });
    expect(await provider.getAvailableLanguageModels()).toEqual([]);
  });

  // ── Image model listing from manifest ─────────────────────────────────────

  it("getAvailableImageModels loads image endpoints from the manifest", async () => {
    const { factory } = makeAkiFactory();
    const provider = new AkiProvider(
      { AKI_API_KEY: "k" },
      { akiClientFactory: factory }
    );

    const models = await provider.getAvailableImageModels();
    expect(models).toEqual([
      { id: "sdxl_img", name: "SDXL", provider: "aki", supportedTasks: ["text_to_image"] },
      { id: "flux-text2img", name: "FLUX Text to Image", provider: "aki", supportedTasks: ["text_to_image"] },
      { id: "flux-img2img", name: "FLUX Image to Image", provider: "aki", supportedTasks: ["image_to_image"] }
    ]);
  });

  // ── Image generation via AKI SDK ──────────────────────────────────────────

  it("textToImage decodes image bytes from the AKI response", async () => {
    const doApiRequest = vi.fn().mockResolvedValue({
      success: true,
      images: encodeBinary(Uint8Array.from([1, 2, 3]), "png")
    });
    const { factory } = makeAkiFactory({ doApiRequest });
    const provider = new AkiProvider(
      { AKI_API_KEY: "k" },
      { akiClientFactory: factory }
    );

    const result = await provider.textToImage({
      model: { id: "sdxl_img", name: "SDXL", provider: "aki", supportedTasks: ["text_to_image"] },
      prompt: "a castle",
      width: 1024,
      height: 1024,
      negativePrompt: "low quality"
    });

    expect(result).toEqual(Uint8Array.from([1, 2, 3]));
    expect(doApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "a castle",
        width: 1024,
        height: 1024,
        negative_prompt: "low quality"
      })
    );
  });

  it("imageToImage sends the encoded image and decodes image bytes", async () => {
    const doApiRequest = vi.fn().mockResolvedValue({
      success: true,
      images: encodeBinary(Uint8Array.from([4, 5, 6]), "png")
    });
    const { factory } = makeAkiFactory({ doApiRequest });
    const provider = new AkiProvider(
      { AKI_API_KEY: "k" },
      { akiClientFactory: factory }
    );

    const inputImage = Uint8Array.from([9, 8, 7]);
    const result = await provider.imageToImage(inputImage, {
      model: { id: "flux-img2img", name: "FLUX Image to Image", provider: "aki", supportedTasks: ["image_to_image"] },
      prompt: "make it cinematic",
      targetWidth: 512,
      targetHeight: 768,
      strength: 0.7
    });

    expect(result).toEqual(Uint8Array.from([4, 5, 6]));
    expect(doApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "make it cinematic",
        image: Buffer.from(inputImage).toString("base64"),
        width: 512,
        height: 768,
        strength: 0.7
      })
    );
  });

  it("retries image requests with prompt when AKI rejects prompt_input", async () => {
    const doApiRequest = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          "api request at https://aki.io/api/ failed!\nHTTP status code: 400\nError message: Invalid input parameter(s): prompt_input;Missing required argument: prompt"
        )
      )
      .mockResolvedValueOnce({
        success: true,
        images: encodeBinary(Uint8Array.from([7, 8, 9]), "png")
      });
    const { factory } = makeAkiFactory({ doApiRequest });
    const provider = new AkiProvider(
      { AKI_API_KEY: "k" },
      { akiClientFactory: factory }
    );

    const result = await provider.textToImage({
      model: { id: "qwen_image", name: "Qwen Image", provider: "aki", supportedTasks: ["text_to_image"] },
      prompt: "a neon city"
    });

    expect(result).toEqual(Uint8Array.from([7, 8, 9]));
    expect(doApiRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ prompt_input: "a neon city" })
    );
    expect(doApiRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ prompt: "a neon city" })
    );
  });
});
