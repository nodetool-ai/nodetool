import { describe, it, expect, vi } from "vitest";
import { APIRouteProvider } from "../../src/providers/api-route-provider.js";
import type { Message } from "../../src/providers/types.js";
import {
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch,
  requestBodyOf
} from "./helpers/compat-fetch.js";

describe("APIRouteProvider", () => {
  it("requires an API Route key", () => {
    expect(() => new APIRouteProvider({})).toThrow(
      "API_ROUTE_API_KEY is required"
    );
    expect(APIRouteProvider.requiredSecrets()).toEqual(["API_ROUTE_API_KEY"]);
    const provider = new APIRouteProvider({ API_ROUTE_API_KEY: "test-key" });
    expect(provider.getContainerEnv()).toEqual({
      API_ROUTE_API_KEY: "test-key"
    });
  });

  it("discovers distinct chat models and excludes non-chat endpoints", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        data: [
          {
            id: "claude-haiku-4-5",
            supported_endpoint_types: ["openai", "anthropic"]
          },
          { id: "gpt-5.5", supported_endpoint_types: ["openai"] },
          {
            id: "gpt-image-2.5",
          supported_endpoint_types: ["image-generation", "openai"]
          },
          { id: "audio-only", supported_endpoint_types: ["audio"] },
          { id: "messages-only", supported_endpoint_types: ["anthropic"] },
          { id: "claude-haiku-4-5", supported_endpoint_types: ["openai"] },
          { id: "legacy-model" },
          { id: "" },
          { unrelated: "invalid" }
        ]
      })
    );
    const provider = new APIRouteProvider(
      { API_ROUTE_API_KEY: "test-key" },
      { fetchFn: fetchMock }
    );
    expect(await provider.getAvailableLanguageModels()).toEqual([
      {
        id: "claude-haiku-4-5",
        name: "claude-haiku-4-5",
        provider: "api_route"
      },
      { id: "gpt-5.5", name: "gpt-5.5", provider: "api_route" },
      { id: "legacy-model", name: "legacy-model", provider: "api_route" }
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://global.api-route.com/v1/models"
    );
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")
    ).toBe("Bearer test-key");
  });

  it.each([401, 500])(
    "keeps model discovery empty on HTTP %s",
    async (status) => {
      const provider = new APIRouteProvider(
        { API_ROUTE_API_KEY: "test-key" },
        { fetchFn: mockChatFetch(new Response("unavailable", { status })) }
      );
      expect(await provider.getAvailableLanguageModels()).toEqual([]);
    }
  );

  it("keeps discovery failures from breaking the model picker", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));
    const provider = new APIRouteProvider(
      { API_ROUTE_API_KEY: "test-key" },
      { fetchFn: fetchMock }
    );
    expect(await provider.getAvailableLanguageModels()).toEqual([]);
    const malformed = new APIRouteProvider(
      { API_ROUTE_API_KEY: "test-key" },
      { fetchFn: mockChatFetch(new Response("not JSON")) }
    );
    expect(await malformed.getAvailableLanguageModels()).toEqual([]);
  });

  it("routes completion and tool calls without rewriting the model ID", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "lookup",
                    arguments: '{"query":"hello"}'
                  }
                }
              ]
            },
            finish_reason: "tool_calls"
          }
        ]
      })
    );
    const provider = new APIRouteProvider(
      { API_ROUTE_API_KEY: "test-key" },
      { fetchFn: fetchMock }
    );
    const messages: Message[] = [{ role: "user", content: "Find hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "claude-haiku-4-5",
      tools: [
        {
          name: "lookup",
          description: "Look up text",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } }
          }
        }
      ]
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://global.api-route.com/v1/chat/completions"
    );
    expect(requestBodyOf(fetchMock).model).toBe("claude-haiku-4-5");
    expect(requestBodyOf(fetchMock).tools).toHaveLength(1);
    expect(result.toolCalls).toEqual([
      { id: "call_1", name: "lookup", args: { query: "hello" } }
    ]);
  });

  it("emits one terminal chunk when a stream finishes with tool calls", async () => {
    const fetchMock = mockChatFetch(() =>
      chatSSEResponse([
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_1",
                    type: "function",
                    function: { name: "lookup", arguments: '{"query":"hello"}' }
                  }
                ]
              },
              finish_reason: null
            }
          ]
        },
        { choices: [{ delta: {}, finish_reason: "tool_calls" }] }
      ])
    );
    const provider = new APIRouteProvider(
      { API_ROUTE_API_KEY: "test-key" },
      { fetchFn: fetchMock }
    );
    const items = [];
    for await (const item of provider.generateMessages({
      messages: [{ role: "user", content: "Find hello" }],
      model: "claude-haiku-4-5"
    }))
      items.push(item);
    expect(
      items.filter((item) => "done" in item && item.done === true)
    ).toHaveLength(1);
    expect(items.some((item) => "name" in item && item.name === "lookup")).toBe(
      true
    );
  });
});
