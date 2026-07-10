import { describe, it, expect, vi } from "vitest";
import { LMStudioProvider } from "../../src/providers/lmstudio-provider.js";
import type { Message } from "../../src/providers/types.js";
import {
  chatJsonResponse,
  mockChatFetch
} from "./helpers/compat-fetch.js";

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

  it("uses LMSTUDIO_API_URL from secrets when no explicit baseURL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "m" }] })
    });
    const provider = new LMStudioProvider(
      { LMSTUDIO_API_URL: "http://localhost:5678/" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    await provider.getAvailableLanguageModels();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:5678/v1/models",
      expect.anything()
    );
    expect(provider.getContainerEnv()).toMatchObject({
      LMSTUDIO_API_URL: "http://localhost:5678"
    });
  });

  it("options.baseURL takes precedence over secrets URL", () => {
    const provider = new LMStudioProvider(
      { LMSTUDIO_API_URL: "http://from-secrets:1111" },
      { client: {} as any, baseURL: "http://from-options:2222" }
    );
    expect(provider.getContainerEnv()).toMatchObject({
      LMSTUDIO_API_URL: "http://from-options:2222"
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
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [
          {
            message: {
              content: "lmstudio response",
              tool_calls: null
            }
          }
        ]
      })
    );

    const provider = new LMStudioProvider(
      {},
      { fetchFn: fetchMock as unknown as typeof fetch }
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
