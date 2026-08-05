import { describe, it, expect, vi } from "vitest";
import { AlibabaProvider } from "../../src/providers/alibaba-provider.js";
import type { Message } from "../../src/providers/types.js";
import {
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch,
  requestBodyOf
} from "./helpers/compat-fetch.js";

describe("AlibabaProvider", () => {
  it("throws if DASHSCOPE_API_KEY is missing", () => {
    expect(() => new AlibabaProvider({})).toThrow(
      "DASHSCOPE_API_KEY is required"
    );
  });

  it("reports provider id as alibaba", () => {
    const provider = new AlibabaProvider(
      { DASHSCOPE_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.provider).toBe("alibaba");
  });

  it("returns required secrets", () => {
    expect(AlibabaProvider.requiredSecrets()).toEqual(["DASHSCOPE_API_KEY"]);
  });

  it("returns container env with DASHSCOPE_API_KEY", () => {
    const provider = new AlibabaProvider(
      { DASHSCOPE_API_KEY: "test-key" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({
      DASHSCOPE_API_KEY: "test-key"
    });
  });

  it("has tool support for function-calling model families", async () => {
    const provider = new AlibabaProvider(
      { DASHSCOPE_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("qwen3-max")).toBe(true);
    expect(await provider.hasToolSupport("qwen-plus")).toBe(true);
    expect(await provider.hasToolSupport("qwen-flash")).toBe(true);
  });

  it("denies tool support for families outside the function-calling list", async () => {
    const provider = new AlibabaProvider(
      { DASHSCOPE_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("qwen-math-plus")).toBe(false);
    expect(await provider.hasToolSupport("qvq-max")).toBe(false);
    expect(await provider.hasToolSupport("qwen-vl-ocr")).toBe(false);
    expect(await provider.hasToolSupport("qwen-mt-turbo")).toBe(false);
    expect(await provider.hasToolSupport("QVQ-72B-Preview")).toBe(false);
  });

  it("honors DASHSCOPE_BASE_URL for region-specific endpoints", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "qwen-plus" }] })
    });
    const provider = new AlibabaProvider(
      {
        DASHSCOPE_API_KEY: "k",
        DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1/"
      },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    await provider.getAvailableLanguageModels();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
      expect.anything()
    );
    expect(provider.getContainerEnv()).toEqual({
      DASHSCOPE_API_KEY: "k",
      DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
    });
  });

  it("sends max_tokens instead of max_completion_tokens", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [{ message: { content: "ok", tool_calls: null } }]
      })
    );

    const provider = new AlibabaProvider(
      { DASHSCOPE_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    await provider.generateMessage({
      messages: [{ role: "user", content: "hi" }] as Message[],
      model: "qwen-plus",
      maxTokens: 512
    });

    const body = requestBodyOf(fetchMock);
    expect(body.max_tokens).toBe(512);
    expect(body).not.toHaveProperty("max_completion_tokens");
  });

  it("fetches available language models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "qwen3-max", name: "Qwen3 Max" },
          { id: "qwen-plus" }
        ]
      })
    });

    const provider = new AlibabaProvider(
      { DASHSCOPE_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "qwen3-max", name: "Qwen3 Max", provider: "alibaba" },
      { id: "qwen-plus", name: "qwen-plus", provider: "alibaba" }
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer k" }
      })
    );
  });

  it("returns empty list when model fetch fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new AlibabaProvider(
      { DASHSCOPE_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    expect(await provider.getAvailableLanguageModels()).toEqual([]);
  });

  it("suppresses inherited OpenAI media and embedding models", async () => {
    const provider = new AlibabaProvider(
      { DASHSCOPE_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.getAvailableTTSModels()).toEqual([]);
    expect(await provider.getAvailableASRModels()).toEqual([]);
    expect(await provider.getAvailableVideoModels()).toEqual([]);
    expect(await provider.getAvailableImageModels()).toEqual([]);
    expect(await provider.getAvailableEmbeddingModels()).toEqual([]);
  });

  it("generates non-streaming message via the compat chat client", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [
          {
            message: {
              content: "alibaba response",
              tool_calls: null
            }
          }
        ]
      })
    );

    const provider = new AlibabaProvider(
      { DASHSCOPE_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "qwen3-max"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("alibaba response");
  });

  it("streams messages via the compat chat client", async () => {
    const chunks = [
      { choices: [{ delta: { content: "hello" }, finish_reason: null }] },
      { choices: [{ delta: { content: "" }, finish_reason: "stop" }] }
    ];

    const fetchMock = mockChatFetch(() => chatSSEResponse(chunks));

    const provider = new AlibabaProvider(
      { DASHSCOPE_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hi" }];
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages,
      model: "qwen3-max"
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});
