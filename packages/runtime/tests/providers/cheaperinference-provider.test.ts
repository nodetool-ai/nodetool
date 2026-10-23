import { describe, it, expect, vi } from "vitest";
import { CheaperInferenceProvider } from "../../src/providers/cheaperinference-provider.js";
import type { Message } from "../../src/providers/types.js";
import {
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch
} from "./helpers/compat-fetch.js";

const modelsResponse = (data: unknown[]) => ({
  ok: true,
  json: async () => ({ object: "list", data })
});

describe("CheaperInferenceProvider", () => {
  it("throws if CHEAPER_INFERENCE_API_KEY is missing", () => {
    expect(() => new CheaperInferenceProvider({})).toThrow(
      "CHEAPER_INFERENCE_API_KEY is required"
    );
  });

  it("reports provider id, required secrets, and container env", () => {
    const provider = new CheaperInferenceProvider(
      { CHEAPER_INFERENCE_API_KEY: "k" },
      { client: {} as any }
    );

    expect(provider.provider).toBe("cheaperinference");
    expect(CheaperInferenceProvider.requiredSecrets()).toEqual([
      "CHEAPER_INFERENCE_API_KEY"
    ]);
    expect(provider.getContainerEnv()).toEqual({
      CHEAPER_INFERENCE_API_KEY: "k"
    });
  });

  it("reports tool support for every model", async () => {
    const provider = new CheaperInferenceProvider(
      { CHEAPER_INFERENCE_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("gpt-5.4-mini")).toBe(true);
  });

  it("lists text models and drops non-text rows", async () => {
    const mockFetch = vi.fn(async () =>
      modelsResponse([
        { id: "gpt-5.4-mini", type: "text" },
        { id: "claude-sonnet-5", type: "text" },
        { id: "gpt-image-1", type: "image" },
        { id: "gpt-5.4-mini", type: "text" }
      ])
    );

    const provider = new CheaperInferenceProvider(
      { CHEAPER_INFERENCE_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as unknown as typeof fetch }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      {
        id: "gpt-5.4-mini",
        name: "gpt-5.4-mini",
        provider: "cheaperinference"
      },
      {
        id: "claude-sonnet-5",
        name: "claude-sonnet-5",
        provider: "cheaperinference"
      }
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.cheaperinference.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer k" })
      })
    );
  });

  it("returns an empty list when the model fetch fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const provider = new CheaperInferenceProvider(
      { CHEAPER_INFERENCE_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as unknown as typeof fetch }
    );

    expect(await provider.getAvailableLanguageModels()).toEqual([]);
  });

  it("generates a non-streaming message via the compat chat client", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [{ message: { content: "hello", tool_calls: null } }]
      })
    );

    const provider = new CheaperInferenceProvider(
      { CHEAPER_INFERENCE_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hi" }];
    const result = await provider.generateMessage({
      messages,
      model: "gpt-5.4-mini"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("hello");
  });

  it("streams messages via the compat chat client", async () => {
    const chunks = [
      { choices: [{ delta: { content: "hello" }, finish_reason: null }] },
      { choices: [{ delta: { content: "" }, finish_reason: "stop" }] }
    ];

    const fetchMock = mockChatFetch(() => chatSSEResponse(chunks));

    const provider = new CheaperInferenceProvider(
      { CHEAPER_INFERENCE_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hi" }];
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages,
      model: "gpt-5.4-mini"
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});
