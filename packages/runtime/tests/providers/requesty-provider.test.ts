import { describe, it, expect, vi } from "vitest";
import { RequestyProvider } from "../../src/providers/requesty-provider.js";
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

describe("RequestyProvider", () => {
  it("throws if REQUESTY_API_KEY is missing", () => {
    expect(() => new RequestyProvider({})).toThrow(
      "REQUESTY_API_KEY is required"
    );
  });

  it("reports provider id as requesty", () => {
    const provider = new RequestyProvider(
      { REQUESTY_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.provider).toBe("requesty");
  });

  it("returns required secrets", () => {
    expect(RequestyProvider.requiredSecrets()).toEqual(["REQUESTY_API_KEY"]);
  });

  it("returns container env with REQUESTY_API_KEY", () => {
    const provider = new RequestyProvider(
      { REQUESTY_API_KEY: "test-key" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({
      REQUESTY_API_KEY: "test-key"
    });
  });

  it("honors supports_tool_calling from discovery, defaulting to true", async () => {
    const mockFetch = vi.fn(async (url: string) =>
      url.endsWith("/models/managed")
        ? modelsResponse([
            { id: "gpt-5.4-mini", api: "chat", supports_tool_calling: true },
            { id: "laguna-xs.2", api: "chat", supports_tool_calling: false }
          ])
        : modelsResponse([
            { id: "openai/gpt-4o-mini", api: "chat" },
            {
              id: "deepinfra/microsoft/phi-4",
              api: "chat",
              supports_tool_calling: false
            }
          ])
    );
    const provider = new RequestyProvider(
      { REQUESTY_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    expect(await provider.hasToolSupport("gpt-5.4-mini")).toBe(true);
    expect(await provider.hasToolSupport("openai/gpt-4o-mini")).toBe(true);
    expect(await provider.hasToolSupport("laguna-xs.2")).toBe(false);
    expect(await provider.hasToolSupport("deepinfra/microsoft/phi-4")).toBe(
      false
    );
    expect(await provider.hasToolSupport("unlisted/model")).toBe(true);
    // One discovery pass serves every lookup.
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("keeps native tools off the request for a model that reports no tool calling", async () => {
    const chatFetch = mockChatFetch(
      chatJsonResponse({
        choices: [{ message: { content: "ok", tool_calls: null } }]
      })
    );
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      url.endsWith("/models/managed")
        ? modelsResponse([])
        : url.endsWith("/models")
          ? modelsResponse([
              {
                id: "openai/gpt-4o-mini",
                api: "chat",
                supports_tool_calling: true
              },
              {
                id: "deepinfra/microsoft/phi-4",
                api: "chat",
                supports_tool_calling: false
              }
            ])
          : chatFetch(url, init)
    );
    const provider = new RequestyProvider(
      { REQUESTY_API_KEY: "k" },
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
      model: "deepinfra/microsoft/phi-4",
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

  it("lists managed models first, then the catalog, chat only and deduplicated", async () => {
    const mockFetch = vi.fn(async (url: string) =>
      url.endsWith("/models/managed")
        ? modelsResponse([
            { id: "gpt-5.4-mini", api: "chat" },
            { id: "claude-sonnet-4-5", api: "chat" }
          ])
        : modelsResponse([
            { id: "openai/gpt-4o-mini", api: "chat" },
            { id: "openai/text-embedding-3-small", api: "embedding" },
            { id: "gpt-5.4-mini", api: "chat" }
          ])
    );

    const provider = new RequestyProvider(
      { REQUESTY_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "gpt-5.4-mini", name: "gpt-5.4-mini", provider: "requesty" },
      {
        id: "claude-sonnet-4-5",
        name: "claude-sonnet-4-5",
        provider: "requesty"
      },
      {
        id: "openai/gpt-4o-mini",
        name: "openai/gpt-4o-mini",
        provider: "requesty"
      }
    ]);

    for (const url of [
      "https://router.requesty.ai/v1/models/managed",
      "https://router.requesty.ai/v1/models"
    ]) {
      expect(mockFetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer k",
            "HTTP-Referer": "https://github.com/nodetool-ai/nodetool-core",
            "X-Title": "NodeTool"
          })
        })
      );
    }
  });

  it("falls back to the catalog when the managed listing fails", async () => {
    const mockFetch = vi.fn(async (url: string) =>
      url.endsWith("/models/managed")
        ? { ok: false, status: 500 }
        : modelsResponse([{ id: "openai/gpt-4o-mini", api: "chat" }])
    );
    const provider = new RequestyProvider(
      { REQUESTY_API_KEY: "k" },
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
      "the managed fetch rejects",
      "/models/managed",
      () => Promise.reject(new TypeError("fetch failed")),
      ["openai/gpt-4o-mini"]
    ],
    [
      "the managed listing is not valid JSON",
      "/models/managed",
      async () => invalidJsonResponse(),
      ["openai/gpt-4o-mini"]
    ],
    [
      "the catalog fetch rejects",
      "/models",
      () => Promise.reject(new TypeError("fetch failed")),
      ["gpt-5.4-mini"]
    ],
    [
      "the catalog listing is not valid JSON",
      "/models",
      async () => invalidJsonResponse(),
      ["gpt-5.4-mini"]
    ]
  ])(
    "keeps the other listing when %s",
    async (_case, failingPath, failure, expected) => {
      const mockFetch = vi.fn(async (url: string) => {
        if (url.endsWith(failingPath)) return failure();
        return url.endsWith("/models/managed")
          ? modelsResponse([{ id: "gpt-5.4-mini", api: "chat" }])
          : modelsResponse([{ id: "openai/gpt-4o-mini", api: "chat" }]);
      });
      const provider = new RequestyProvider(
        { REQUESTY_API_KEY: "k" },
        { client: {} as any, fetchFn: mockFetch as any }
      );

      const models = await provider.getAvailableLanguageModels();
      expect(models.map((m) => m.id)).toEqual(expected);
    }
  );

  it("returns empty list when both model fetches fail", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new RequestyProvider(
      { REQUESTY_API_KEY: "k" },
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

    const provider = new RequestyProvider(
      { REQUESTY_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "openai/gpt-4o-mini"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("routed response");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://router.requesty.ai/v1/chat/completions"
    );
    expect(requestBodyOf(fetchMock).model).toBe("openai/gpt-4o-mini");
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

    const provider = new RequestyProvider(
      { REQUESTY_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hi" }];
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages,
      model: "openai/gpt-4o-mini"
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});
