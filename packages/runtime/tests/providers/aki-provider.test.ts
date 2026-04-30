import { describe, it, expect, vi } from "vitest";
import OpenAI from "openai";
import { AkiProvider } from "../../src/providers/aki-provider.js";

function makeOpenAIClient(overrides: Partial<{
  create: ReturnType<typeof vi.fn>;
  stream: ReturnType<typeof vi.fn>;
}> = {}): OpenAI {
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

  it("generateMessage calls the OpenAI-compatible endpoint and returns assistant text", async () => {
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
    const client = makeOpenAIClient({ create });

    const provider = new AkiProvider(
      { AKI_API_KEY: "k" },
      { client }
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
      expect.objectContaining({
        model: "llama3_chat",
        stream: false
      })
    );
  });

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

    const provider = new AkiProvider(
      { AKI_API_KEY: "k" },
      { fetchFn: mockFetch }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "llama3_chat", name: "Llama 3 Chat", provider: "aki" },
      { id: "mistral-7b", name: "Mistral 7B", provider: "aki" }
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://aki.io/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer k" }
      })
    );
  });

  it("getAvailableLanguageModels returns empty array on fetch failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401
    } as Response);

    const provider = new AkiProvider(
      { AKI_API_KEY: "bad-key" },
      { fetchFn: mockFetch }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([]);
  });

  it("uses AKI_API_KEY as the OpenAI client api key", () => {
    let capturedKey: string | undefined;
    const clientFactory = (key: string) => {
      capturedKey = key;
      return makeOpenAIClient();
    };

    new AkiProvider({ AKI_API_KEY: "my-aki-key" }, { clientFactory });
    // Access getClient() to trigger factory
    const provider = new AkiProvider(
      { AKI_API_KEY: "my-aki-key" },
      { clientFactory }
    );
    provider.getClient();
    expect(capturedKey).toBe("my-aki-key");
  });
});
