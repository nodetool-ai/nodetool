import { describe, it, expect, vi } from "vitest";
import { VLLMProvider } from "../../src/providers/vllm-provider.js";
import type { Message } from "../../src/providers/types.js";

describe("VLLMProvider", () => {
  it("throws if baseURL is not provided", () => {
    expect(() => new VLLMProvider({}, {})).toThrow(
      "VLLM_BASE_URL is required"
    );
  });

  it("creates with baseURL", () => {
    const provider = new VLLMProvider(
      {},
      { baseURL: "http://localhost:8000", client: {} as any }
    );
    expect(provider.provider).toBe("vllm");
  });

  it("returns empty required secrets", () => {
    expect(VLLMProvider.requiredSecrets()).toEqual([]);
  });

  it("returns container env with VLLM_BASE_URL", () => {
    const provider = new VLLMProvider(
      {},
      { baseURL: "http://localhost:8000", client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({
      VLLM_BASE_URL: "http://localhost:8000",
    });
  });

  it("returns container env with API key when set", () => {
    const provider = new VLLMProvider(
      { VLLM_API_KEY: "my-key" },
      { baseURL: "http://localhost:8000", client: {} as any }
    );
    const env = provider.getContainerEnv();
    expect(env.VLLM_API_KEY).toBe("my-key");
    expect(env.VLLM_BASE_URL).toBe("http://localhost:8000");
  });

  it("has tool support for all models", async () => {
    const provider = new VLLMProvider(
      {},
      { baseURL: "http://localhost:8000", client: {} as any }
    );
    expect(await provider.hasToolSupport("some-model")).toBe(true);
  });

  it("fetches available language models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "meta-llama/Llama-3-70b" },
          { id: "mistralai/Mistral-7B" },
        ],
      }),
    });

    const provider = new VLLMProvider(
      {},
      {
        baseURL: "http://localhost:8000",
        client: {} as any,
        fetchFn: mockFetch as any,
      }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      {
        id: "meta-llama/Llama-3-70b",
        name: "meta-llama/Llama-3-70b",
        provider: "vllm",
      },
      {
        id: "mistralai/Mistral-7B",
        name: "mistralai/Mistral-7B",
        provider: "vllm",
      },
    ]);
  });

  it("returns empty list when server not available", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED"));
    const provider = new VLLMProvider(
      {},
      {
        baseURL: "http://localhost:8000",
        client: {} as any,
        fetchFn: mockFetch as any,
      }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([]);
  });

  it("returns empty list when fetch returns not ok", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new VLLMProvider(
      {},
      {
        baseURL: "http://localhost:8000",
        client: {} as any,
        fetchFn: mockFetch as any,
      }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([]);
  });

  it("generates non-streaming message", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "vllm response",
            tool_calls: null,
          },
        },
      ],
    });

    const provider = new VLLMProvider(
      {},
      {
        baseURL: "http://localhost:8000",
        client: {
          chat: { completions: { create } },
        } as any,
      }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "meta-llama/Llama-3-70b",
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("vllm response");
  });
});
