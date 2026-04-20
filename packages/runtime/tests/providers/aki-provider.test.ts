import { describe, it, expect, vi } from "vitest";
import { AkiProvider } from "../../src/providers/aki-provider.js";

type DoApiRequest = ReturnType<typeof vi.fn>;
type GetGenerator = (params: unknown) => AsyncGenerator<unknown>;
type GetEndpoints = ReturnType<typeof vi.fn>;

interface FakeClient {
  doApiRequest: DoApiRequest;
  getApiRequestGenerator: GetGenerator;
  getEndpointList: GetEndpoints;
}

function makeFactory(client: Partial<FakeClient>) {
  const base: FakeClient = {
    doApiRequest: vi.fn(),
    getApiRequestGenerator: async function* () {
      /* empty */
    },
    getEndpointList: vi.fn().mockResolvedValue([])
  };
  const merged = { ...base, ...client } as FakeClient;
  const factory = vi.fn().mockReturnValue(merged);
  return { factory, client: merged };
}

describe("AkiProvider", () => {
  it("reports required secrets, container env, and provider id", () => {
    const { factory } = makeFactory({});
    const provider = new AkiProvider(
      { AKI_API_KEY: "secret" },
      { clientFactory: factory as unknown as never }
    );

    expect(AkiProvider.requiredSecrets()).toEqual(["AKI_API_KEY"]);
    expect(provider.getContainerEnv()).toEqual({ AKI_API_KEY: "secret" });
    expect((provider as unknown as { provider: string }).provider).toBe("aki");
  });

  it("throws when AKI_API_KEY is missing or empty", () => {
    expect(() => new AkiProvider({})).toThrow("AKI_API_KEY is not configured");
    expect(
      () => new AkiProvider({ AKI_API_KEY: "   " })
    ).toThrow("AKI_API_KEY is not configured");
  });

  it("does not advertise tool support", async () => {
    const { factory } = makeFactory({});
    const provider = new AkiProvider(
      { AKI_API_KEY: "k" },
      { clientFactory: factory as unknown as never }
    );
    expect(await provider.hasToolSupport("llama3_chat")).toBe(false);
  });

  it("generateMessage sends chat_context and returns assistant text", async () => {
    const doApiRequest = vi.fn().mockResolvedValue({
      success: true,
      text: "hello from aki",
      prompt_length: 4,
      num_generated_tokens: 7
    });
    const { factory } = makeFactory({ doApiRequest });
    const provider = new AkiProvider(
      { AKI_API_KEY: "k" },
      { clientFactory: factory as unknown as never }
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

    expect(result).toEqual({ role: "assistant", content: "hello from aki" });
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointName: "llama3_chat",
        apiKey: "k"
      })
    );
    expect(doApiRequest).toHaveBeenCalledWith({
      chat_context: [
        { role: "system", content: "you are helpful" },
        { role: "user", content: "hi" }
      ],
      max_gen_tokens: 128,
      temperature: 0.5,
      top_p: 0.9
    });
  });

  it("generateMessage throws on unsuccessful response", async () => {
    const doApiRequest = vi.fn().mockResolvedValue({
      success: false,
      error: "invalid key",
      error_code: 401
    });
    const { factory } = makeFactory({ doApiRequest });
    const provider = new AkiProvider(
      { AKI_API_KEY: "k" },
      { clientFactory: factory as unknown as never }
    );

    await expect(
      provider.generateMessage({
        model: "llama3_chat",
        messages: [{ role: "user", content: "hi" }]
      })
    ).rejects.toThrow("invalid key");
  });

  it("generateMessages yields deltas between progress updates", async () => {
    async function* stream() {
      yield { job_id: "j1", success: true, job_state: "started" };
      yield {
        job_id: "j1",
        success: true,
        job_state: "processing",
        progress_data: { text: "Hello" }
      };
      yield {
        job_id: "j1",
        success: true,
        job_state: "processing",
        progress_data: { text: "Hello, world" }
      };
      yield {
        job_id: "j1",
        success: true,
        job_state: "done",
        result_data: { text: "Hello, world!" }
      };
    }
    const { factory } = makeFactory({
      getApiRequestGenerator: stream as unknown as GetGenerator
    });
    const provider = new AkiProvider(
      { AKI_API_KEY: "k" },
      { clientFactory: factory as unknown as never }
    );

    const deltas: string[] = [];
    for await (const item of provider.generateMessages({
      model: "llama3_chat",
      messages: [{ role: "user", content: "hi" }]
    })) {
      if ("type" in item && item.type === "chunk") {
        deltas.push(item.content ?? "");
      }
    }

    // Hello, then ", world", then "!", then trailing done chunk with ""
    expect(deltas).toEqual(["Hello", ", world", "!", ""]);
  });

  it("generateMessages surfaces error payloads", async () => {
    async function* stream() {
      yield { success: false, error: "quota exceeded" };
    }
    const { factory } = makeFactory({
      getApiRequestGenerator: stream as unknown as GetGenerator
    });
    const provider = new AkiProvider(
      { AKI_API_KEY: "k" },
      { clientFactory: factory as unknown as never }
    );

    const run = async () => {
      const collected: unknown[] = [];
      for await (const item of provider.generateMessages({
        model: "llama3_chat",
        messages: [{ role: "user", content: "hi" }]
      })) {
        collected.push(item);
      }
      return collected;
    };

    await expect(run()).rejects.toThrow("quota exceeded");
  });

  it("getAvailableLanguageModels excludes image endpoints from SDK list", async () => {
    const getEndpointList = vi
      .fn()
      .mockResolvedValue(["llama3_chat", "sdxl_img"]);
    const { factory } = makeFactory({ getEndpointList });
    const provider = new AkiProvider(
      { AKI_API_KEY: "k" },
      { clientFactory: factory as unknown as never }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "llama3_chat", name: "llama3_chat", provider: "aki" }
    ]);
  });

  it("getAvailableLanguageModels falls back to default when SDK fails", async () => {
    const getEndpointList = vi.fn().mockRejectedValue(new Error("boom"));
    const { factory } = makeFactory({ getEndpointList });
    const provider = new AkiProvider(
      { AKI_API_KEY: "k" },
      { clientFactory: factory as unknown as never }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "llama3_chat", name: "Llama 3 Chat", provider: "aki" }
    ]);
  });

  it("getAvailableImageModels returns image endpoints from SDK list", async () => {
    const getEndpointList = vi
      .fn()
      .mockResolvedValue(["llama3_chat", "sdxl_img", "flux-text2img"]);
    const { factory } = makeFactory({ getEndpointList });
    const provider = new AkiProvider(
      { AKI_API_KEY: "k" },
      { clientFactory: factory as unknown as never }
    );

    const models = await provider.getAvailableImageModels();
    expect(models).toEqual([
      {
        id: "sdxl_img",
        name: "sdxl_img",
        provider: "aki",
        supportedTasks: ["text_to_image"]
      },
      {
        id: "flux-text2img",
        name: "flux-text2img",
        provider: "aki",
        supportedTasks: ["text_to_image"]
      }
    ]);
  });

  it("classifies endpoint naming patterns across language/image model lists", async () => {
    const getEndpointList = vi.fn().mockResolvedValue([
      "llama3_chat",
      "sdxl_img",
      "flux-text2img",
      "mysteryendpoint",
      "",
      "  ",
      "SDXL_IMAGE"
    ]);
    const { factory } = makeFactory({ getEndpointList });
    const provider = new AkiProvider(
      { AKI_API_KEY: "k" },
      { clientFactory: factory as unknown as never }
    );

    const languageModels = await provider.getAvailableLanguageModels();
    const imageModels = await provider.getAvailableImageModels();

    expect(languageModels).toEqual([
      { id: "llama3_chat", name: "llama3_chat", provider: "aki" },
      { id: "mysteryendpoint", name: "mysteryendpoint", provider: "aki" }
    ]);
    expect(imageModels).toEqual([
      {
        id: "sdxl_img",
        name: "sdxl_img",
        provider: "aki",
        supportedTasks: ["text_to_image"]
      },
      {
        id: "flux-text2img",
        name: "flux-text2img",
        provider: "aki",
        supportedTasks: ["text_to_image"]
      },
      {
        id: "SDXL_IMAGE",
        name: "SDXL_IMAGE",
        provider: "aki",
        supportedTasks: ["text_to_image"]
      }
    ]);
    expect(languageModels.some((model) => model.id.trim().length === 0)).toBe(
      false
    );
    expect(imageModels.some((model) => model.id.trim().length === 0)).toBe(
      false
    );
  });

  it("collapses multi-part content and attaches the last image", async () => {
    const doApiRequest = vi
      .fn()
      .mockResolvedValue({ success: true, text: "ok" });
    const { factory } = makeFactory({ doApiRequest });
    const provider = new AkiProvider(
      { AKI_API_KEY: "k" },
      { clientFactory: factory as unknown as never }
    );

    await provider.generateMessage({
      model: "llama3_chat",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "what is this" },
            {
              type: "image_url",
              image: { data: "BASE64DATA", mimeType: "image/png" }
            }
          ]
        }
      ]
    });

    expect(doApiRequest).toHaveBeenCalledWith({
      chat_context: [{ role: "user", content: "what is this" }],
      image: "BASE64DATA"
    });
  });
});
