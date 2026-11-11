import { describe, it, expect, vi } from "vitest";
import { StandardComputeProvider } from "../../src/providers/standardcompute-provider.js";
import type { Message } from "../../src/providers/types.js";
import {
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch,
  requestBodyOf
} from "./helpers/compat-fetch.js";

/** A `/v1/models` listing shaped like Standard Compute's: the routed model first, then pinned rows. */
const LISTING = {
  object: "list",
  data: [
    {
      id: "StandardCompute",
      object: "model",
      owned_by: "StandardCompute",
      context_length: 1000000,
      supported_parameters: ["tools", "tool_choice", "response_format"]
    },
    {
      id: "z-ai/glm-5.3",
      object: "model",
      display_name: "GLM 5.3",
      context_length: 1000000,
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      supported_parameters: ["tools", "tool_choice"]
    },
    {
      id: "deepseek/deepseek-v4-flash",
      object: "model",
      display_name: "DeepSeek V4 Flash",
      context_length: 131072,
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      supported_parameters: ["response_format"]
    },
    {
      id: "example/image-model",
      architecture: { input_modalities: ["text"], output_modalities: ["image"] }
    },
    {
      id: "z-ai/glm-5.3",
      architecture: { input_modalities: ["text"], output_modalities: ["text"] }
    },
    { id: "" },
    { unrelated: "invalid" }
  ]
};

const KEY = { STANDARDCOMPUTE_API_KEY: "test-key" };

describe("StandardComputeProvider", () => {
  it("requires a Standard Compute key", () => {
    expect(() => new StandardComputeProvider({})).toThrow(
      "STANDARDCOMPUTE_API_KEY is required"
    );
    expect(StandardComputeProvider.requiredSecrets()).toEqual([
      "STANDARDCOMPUTE_API_KEY"
    ]);
    const provider = new StandardComputeProvider(KEY);
    expect(provider.provider).toBe("standardcompute");
    expect(provider.getContainerEnv()).toEqual(KEY);
  });

  it("discovers the routed model and distinct chat models, skipping non-text rows", async () => {
    const fetchMock = mockChatFetch(chatJsonResponse(LISTING));
    const provider = new StandardComputeProvider(KEY, { fetchFn: fetchMock });
    expect(await provider.getAvailableLanguageModels()).toEqual([
      {
        id: "StandardCompute",
        name: "StandardCompute",
        provider: "standardcompute"
      },
      { id: "z-ai/glm-5.3", name: "GLM 5.3", provider: "standardcompute" },
      {
        id: "deepseek/deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        provider: "standardcompute"
      }
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.stdcmpt.com/v1/models"
    );
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")
    ).toBe("Bearer test-key");
  });

  it("reads tool support and the context window from the listing, discovering once", async () => {
    const fetchMock = mockChatFetch(chatJsonResponse(LISTING));
    const provider = new StandardComputeProvider(KEY, { fetchFn: fetchMock });
    expect(await provider.hasToolSupport("StandardCompute")).toBe(true);
    expect(await provider.hasToolSupport("deepseek/deepseek-v4-flash")).toBe(
      false
    );
    expect(await provider.getContextWindow("StandardCompute")).toBe(1000000);
    expect(
      await provider.getContextWindow("deepseek/deepseek-v4-flash")
    ).toBe(131072);
    // A model the listing did not describe keeps tools on and reports no window.
    expect(await provider.hasToolSupport("unlisted-model")).toBe(true);
    expect(await provider.getContextWindow("unlisted-model")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([401, 500])(
    "keeps model discovery empty on HTTP %s",
    async (status) => {
      const provider = new StandardComputeProvider(
        KEY,
        { fetchFn: mockChatFetch(new Response("unavailable", { status })) }
      );
      expect(await provider.getAvailableLanguageModels()).toEqual([]);
      expect(await provider.hasToolSupport("z-ai/glm-5.3")).toBe(true);
    }
  );

  it("keeps discovery failures from breaking the model picker", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));
    const provider = new StandardComputeProvider(KEY, { fetchFn: fetchMock });
    expect(await provider.getAvailableLanguageModels()).toEqual([]);
    const malformed = new StandardComputeProvider(
      KEY,
      { fetchFn: mockChatFetch(new Response("not JSON")) }
    );
    expect(await malformed.getAvailableLanguageModels()).toEqual([]);
  });

  it("routes completion and tool calls without rewriting the model ID", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith("/models")
        ? chatJsonResponse(LISTING)
        : chatJsonResponse({
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
    const provider = new StandardComputeProvider(KEY, { fetchFn: fetchMock });
    const messages: Message[] = [{ role: "user", content: "Find hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "StandardCompute",
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
    const chatCall = fetchMock.mock.calls.findIndex(([url]) =>
      String(url).endsWith("/chat/completions")
    );
    expect(fetchMock.mock.calls[chatCall]?.[0]).toBe(
      "https://api.stdcmpt.com/v1/chat/completions"
    );
    expect(requestBodyOf(fetchMock, chatCall).model).toBe(
      "StandardCompute"
    );
    expect(requestBodyOf(fetchMock, chatCall).tools).toHaveLength(1);
    expect(result.toolCalls).toEqual([
      { id: "call_1", name: "lookup", args: { query: "hello" } }
    ]);
  });

  it("emits one terminal chunk when a stream finishes with tool calls", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith("/models")
        ? chatJsonResponse(LISTING)
        : chatSSEResponse([
            {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: "call_1",
                        type: "function",
                        function: {
                          name: "lookup",
                          arguments: '{"query":"hello"}'
                        }
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
    const provider = new StandardComputeProvider(KEY, { fetchFn: fetchMock });
    const items = [];
    for await (const item of provider.generateMessages({
      messages: [{ role: "user", content: "Find hello" }],
      model: "z-ai/glm-5.3"
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
