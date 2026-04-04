import { describe, it, expect, vi } from "vitest";
import { LMStudioProvider } from "../../src/providers/lmstudio-provider.js";
import type { Message } from "../../src/providers/types.js";

describe("LMStudioProvider", () => {
  it("creates without secrets (no API key required)", () => {
    const provider = new LMStudioProvider({}, { client: {} as any });
    expect(provider.provider).toBe("lmstudio");
  });

  it("returns empty required secrets", () => {
    expect(LMStudioProvider.requiredSecrets()).toEqual([]);
  });

  it("returns container env with base URL", () => {
    const provider = new LMStudioProvider(
      {},
      { client: {} as any, baseURL: "http://localhost:9999" }
    );
    expect(provider.getContainerEnv()).toEqual({
      LMSTUDIO_API_URL: "http://localhost:9999"
    });
  });

  it("returns container env with API key when set", () => {
    const provider = new LMStudioProvider(
      { LMSTUDIO_API_KEY: "my-key" },
      { client: {} as any }
    );
    const env = provider.getContainerEnv();
    expect(env.LMSTUDIO_API_KEY).toBe("my-key");
    expect(env.LMSTUDIO_API_URL).toBe("http://127.0.0.1:1234");
  });

  it("has tool support for all models", async () => {
    const provider = new LMStudioProvider({}, { client: {} as any });
    expect(await provider.hasToolSupport("some-model")).toBe(true);
  });

  it("fetches available language models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: "local-model-1" }, { id: "local-model-2" }]
      })
    });

    const provider = new LMStudioProvider(
      {},
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "local-model-1", name: "local-model-1", provider: "lmstudio" },
      { id: "local-model-2", name: "local-model-2", provider: "lmstudio" }
    ]);
  });

  it("returns empty list when LM Studio not available", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const provider = new LMStudioProvider(
      {},
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([]);
  });

  it("returns empty list when fetch returns not ok", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new LMStudioProvider(
      {},
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([]);
  });

  it("generates non-streaming message", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "lmstudio response",
            tool_calls: null
          }
        }
      ]
    });

    const provider = new LMStudioProvider(
      {},
      {
        client: {
          chat: { completions: { create } }
        } as any
      }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "local-model"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("lmstudio response");
  });
});
