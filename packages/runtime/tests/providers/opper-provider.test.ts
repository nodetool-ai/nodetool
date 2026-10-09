import { describe, it, expect, vi } from "vitest";
import { OpperProvider } from "../../src/providers/opper-provider.js";
import type { Message } from "../../src/providers/types.js";
import {
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch,
  requestBodyOf
} from "./helpers/compat-fetch.js";

const modelsResponse = (data: unknown[]) => ({
  ok: true,
  json: async () => ({ object: "list", data })
});

const POOLS = "/models?type=pool";

describe("OpperProvider", () => {
  it("throws if OPPER_API_KEY is missing", () => {
    expect(() => new OpperProvider({})).toThrow("OPPER_API_KEY is required");
  });

  it("reports provider id as opper", () => {
    const provider = new OpperProvider(
      { OPPER_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.provider).toBe("opper");
  });

  it("returns required secrets", () => {
    expect(OpperProvider.requiredSecrets()).toEqual(["OPPER_API_KEY"]);
  });

  it("returns container env with OPPER_API_KEY", () => {
    const provider = new OpperProvider(
      { OPPER_API_KEY: "test-key" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({
      OPPER_API_KEY: "test-key"
    });
  });

  it("honors listed capabilities from discovery, defaulting to true", async () => {
    const mockFetch = vi.fn(async (url: string) =>
      url.endsWith(POOLS)
        ? modelsResponse([
            {
              id: "claude-sonnet-4-6",
              opper: { kind: "pool", type: "llm", capabilities: ["text", "tools"] }
            },
            {
              id: "deepseek-ocr",
              opper: { kind: "pool", type: "llm", capabilities: ["text", "vision"] }
            }
          ])
        : modelsResponse([
            { id: "dynamic/support-router", opper: { kind: "dynamic_route" } },
            {
              id: "novita/deepseek-ocr-2",
              opper: { kind: "model", type: "llm", capabilities: ["text", "vision"] }
            }
          ])
    );
    const provider = new OpperProvider(
      { OPPER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    expect(await provider.hasToolSupport("claude-sonnet-4-6")).toBe(true);
    expect(await provider.hasToolSupport("dynamic/support-router")).toBe(true);
    expect(await provider.hasToolSupport("deepseek-ocr")).toBe(false);
    expect(await provider.hasToolSupport("novita/deepseek-ocr-2")).toBe(false);
    expect(await provider.hasToolSupport("unlisted/model")).toBe(true);
    // One discovery pass serves every lookup.
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("keeps native tools off the request for a model that lists no tools", async () => {
    const chatFetch = mockChatFetch(
      chatJsonResponse({
        choices: [{ message: { content: "ok", tool_calls: null } }]
      })
    );
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      url.endsWith(POOLS)
        ? modelsResponse([])
        : url.endsWith("/models")
          ? modelsResponse([
              {
                id: "openai/gpt-4o-mini",
                opper: { kind: "model", type: "llm", capabilities: ["text", "tools"] }
              },
              {
                id: "novita/deepseek-ocr-2",
                opper: { kind: "model", type: "llm", capabilities: ["text", "vision"] }
              }
            ])
          : chatFetch(url, init)
    );
    const provider = new OpperProvider(
      { OPPER_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );
    const tools = [
      {
        name: "lookup",
        description: "Look something up",
        inputSchema: { type: "object", properties: {} }
      }
    ];
    const messages: Message[] = [{ role: "user", content: "hi" }];

    await provider.generateMessage({
      messages,
      model: "novita/deepseek-ocr-2",
      tools
    });
    await provider.generateMessage({
      messages,
      model: "openai/gpt-4o-mini",
      tools
    });

    expect(requestBodyOf(chatFetch, 0).tools).toBeUndefined();
    expect(requestBodyOf(chatFetch, 1).tools).toHaveLength(1);
  });

  it("lists pools first, then the catalog, LLMs only and deduplicated", async () => {
    const mockFetch = vi.fn(async (url: string) =>
      url.endsWith(POOLS)
        ? modelsResponse([
            { id: "claude-sonnet-4-6", opper: { kind: "pool", type: "llm" } },
            { id: "gpt-5.5", opper: { kind: "pool", type: "llm" } }
          ])
        : modelsResponse([
            { id: "openai/gpt-4o-mini", opper: { kind: "model", type: "llm" } },
            {
              id: "openai/text-embedding-3-small",
              opper: { kind: "model", type: "embedding" }
            },
            { id: "claude-sonnet-4-6", opper: { kind: "pool", type: "llm" } }
          ])
    );

    const provider = new OpperProvider(
      { OPPER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      {
        id: "claude-sonnet-4-6",
        name: "claude-sonnet-4-6",
        provider: "opper"
      },
      { id: "gpt-5.5", name: "gpt-5.5", provider: "opper" },
      {
        id: "openai/gpt-4o-mini",
        name: "openai/gpt-4o-mini",
        provider: "opper"
      }
    ]);

    for (const url of [
      "https://api.opper.ai/v3/compat/models?type=pool",
      "https://api.opper.ai/v3/compat/models"
    ]) {
      expect(mockFetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer k"
          })
        })
      );
    }
  });

  it("falls back to the catalog when the pool listing fails", async () => {
    const mockFetch = vi.fn(async (url: string) =>
      url.endsWith(POOLS)
        ? { ok: false, status: 500 }
        : modelsResponse([
            { id: "openai/gpt-4o-mini", opper: { kind: "model", type: "llm" } }
          ])
    );
    const provider = new OpperProvider(
      { OPPER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models.map((m) => m.id)).toEqual(["openai/gpt-4o-mini"]);
  });

  const invalidJsonResponse = () => ({
    ok: true,
    json: async () => {
      throw new SyntaxError("Unexpected token '<' in JSON at position 0");
    }
  });

  it.each([
    [
      "the pool fetch rejects",
      POOLS,
      () => Promise.reject(new TypeError("fetch failed")),
      ["openai/gpt-4o-mini"]
    ],
    [
      "the pool listing is not valid JSON",
      POOLS,
      async () => invalidJsonResponse(),
      ["openai/gpt-4o-mini"]
    ],
    [
      "the catalog fetch rejects",
      "/models",
      () => Promise.reject(new TypeError("fetch failed")),
      ["claude-sonnet-4-6"]
    ],
    [
      "the catalog listing is not valid JSON",
      "/models",
      async () => invalidJsonResponse(),
      ["claude-sonnet-4-6"]
    ]
  ])(
    "keeps the other listing when %s",
    async (_case, failingPath, failure, expected) => {
      const mockFetch = vi.fn(async (url: string) => {
        if (url.endsWith(failingPath)) return failure();
        return url.endsWith(POOLS)
          ? modelsResponse([
              { id: "claude-sonnet-4-6", opper: { kind: "pool", type: "llm" } }
            ])
          : modelsResponse([
              { id: "openai/gpt-4o-mini", opper: { kind: "model", type: "llm" } }
            ]);
      });
      const provider = new OpperProvider(
        { OPPER_API_KEY: "k" },
        { client: {} as any, fetchFn: mockFetch as any }
      );

      const models = await provider.getAvailableLanguageModels();
      expect(models.map((m) => m.id)).toEqual(expected);
    }
  );

  it("returns empty list when both model fetches fail", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new OpperProvider(
      { OPPER_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([]);
  });

  it("generates non-streaming message via the compat chat client", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [
          {
            message: {
              content: "routed response",
              tool_calls: null
            }
          }
        ]
      })
    );

    const provider = new OpperProvider(
      { OPPER_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "claude-sonnet-4-6"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("routed response");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.opper.ai/v3/compat/chat/completions"
    );
    expect(requestBodyOf(fetchMock).model).toBe("claude-sonnet-4-6");
  });

  it("streams messages via the compat chat client", async () => {
    const chunks = [
      {
        choices: [
          {
            delta: { content: "streamed" },
            finish_reason: null
          }
        ]
      },
      {
        choices: [
          {
            delta: { content: "" },
            finish_reason: "stop"
          }
        ]
      }
    ];

    const fetchMock = mockChatFetch(() => chatSSEResponse(chunks));

    const provider = new OpperProvider(
      { OPPER_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hi" }];
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages,
      model: "claude-sonnet-4-6"
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});
