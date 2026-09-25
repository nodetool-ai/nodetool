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

  it("reports tool support for every model", async () => {
    const provider = new RequestyProvider(
      { REQUESTY_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("openai/gpt-4o-mini")).toBe(true);
    expect(await provider.hasToolSupport("gpt-5.4-mini")).toBe(true);
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
