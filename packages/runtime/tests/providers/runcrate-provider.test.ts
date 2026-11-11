import { describe, it, expect, vi } from "vitest";
import { RuncrateProvider } from "../../src/providers/runcrate-provider.js";
import type { Message } from "../../src/providers/types.js";
import {
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch,
  requestBodyOf
} from "./helpers/compat-fetch.js";

/** A `/v1/models` listing shaped like Runcrate's: chat, embedding, image, video and speech rows. */
const LISTING = {
  object: "list",
  data: [
    {
      id: "deepseek-ai/DeepSeek-V4.1-Flash",
      name: "DeepSeek V4.1 Flash",
      input_modalities: ["text", "image"],
      output_modalities: ["text"],
      context_length: 1048576,
      supported_features: ["tools", "json_mode", "reasoning"]
    },
    {
      id: "zai-org/GLM-5.3",
      name: "GLM 5.3",
      input_modalities: ["text"],
      output_modalities: ["text"],
      context_length: 1048576,
      supported_features: ["tools", "json_mode"]
    },
    {
      id: "google/gemma-3-27b-it",
      name: "Gemma 3 27B",
      input_modalities: ["text", "image"],
      output_modalities: ["text"],
      context_length: 131072,
      supported_features: ["json_mode"]
    },
    {
      id: "Qwen/Qwen3-Embedding-8B",
      input_modalities: ["text"],
      output_modalities: ["embeddings"]
    },
    {
      id: "black-forest-labs/FLUX.2-flex",
      input_modalities: ["text"],
      output_modalities: ["image"]
    },
    {
      id: "kuaishou/kling-v2.6",
      input_modalities: ["text"],
      output_modalities: ["video"]
    },
    {
      id: "hexgrad/Kokoro-82M",
      input_modalities: ["text"],
      output_modalities: ["audio"]
    },
    {
      id: "openai/whisper-large-v3",
      input_modalities: ["audio"],
      output_modalities: ["text"]
    },
    { id: "legacy-chat-model" },
    { id: "legacy-flux-dev" },
    {
      id: "zai-org/GLM-5.3",
      input_modalities: ["text"],
      output_modalities: ["text"]
    },
    { id: "" },
    { unrelated: "invalid" }
  ]
};

describe("RuncrateProvider", () => {
  it("requires a Runcrate key", () => {
    expect(() => new RuncrateProvider({})).toThrow(
      "RUNCRATE_API_KEY is required"
    );
    expect(RuncrateProvider.requiredSecrets()).toEqual(["RUNCRATE_API_KEY"]);
    const provider = new RuncrateProvider({ RUNCRATE_API_KEY: "test-key" });
    expect(provider.provider).toBe("runcrate");
    expect(provider.getContainerEnv()).toEqual({
      RUNCRATE_API_KEY: "test-key"
    });
  });

  it("discovers distinct text chat models and skips embedding, image, video and speech rows", async () => {
    const fetchMock = mockChatFetch(chatJsonResponse(LISTING));
    const provider = new RuncrateProvider(
      { RUNCRATE_API_KEY: "test-key" },
      { fetchFn: fetchMock }
    );
    expect(await provider.getAvailableLanguageModels()).toEqual([
      {
        id: "deepseek-ai/DeepSeek-V4.1-Flash",
        name: "DeepSeek V4.1 Flash",
        provider: "runcrate"
      },
      { id: "zai-org/GLM-5.3", name: "GLM 5.3", provider: "runcrate" },
      {
        id: "google/gemma-3-27b-it",
        name: "Gemma 3 27B",
        provider: "runcrate"
      },
      {
        id: "legacy-chat-model",
        name: "legacy-chat-model",
        provider: "runcrate"
      }
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.runcrate.ai/v1/models"
    );
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")
    ).toBe("Bearer test-key");
  });

  it("reads tool support and the context window from the listing, discovering once", async () => {
    const fetchMock = mockChatFetch(chatJsonResponse(LISTING));
    const provider = new RuncrateProvider(
      { RUNCRATE_API_KEY: "test-key" },
      { fetchFn: fetchMock }
    );
    expect(await provider.hasToolSupport("zai-org/GLM-5.3")).toBe(true);
    expect(await provider.hasToolSupport("google/gemma-3-27b-it")).toBe(false);
    expect(await provider.getContextWindow("zai-org/GLM-5.3")).toBe(1048576);
    expect(await provider.getContextWindow("google/gemma-3-27b-it")).toBe(
      131072
    );
    // A row without metadata keeps tools on and reports no window of its own.
    expect(await provider.hasToolSupport("legacy-chat-model")).toBe(true);
    expect(await provider.getContextWindow("legacy-chat-model")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([401, 500])(
    "keeps model discovery empty on HTTP %s",
    async (status) => {
      const provider = new RuncrateProvider(
        { RUNCRATE_API_KEY: "test-key" },
        { fetchFn: mockChatFetch(new Response("unavailable", { status })) }
      );
      expect(await provider.getAvailableLanguageModels()).toEqual([]);
      expect(await provider.hasToolSupport("zai-org/GLM-5.3")).toBe(true);
    }
  );

  it("keeps discovery failures from breaking the model picker", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));
    const provider = new RuncrateProvider(
      { RUNCRATE_API_KEY: "test-key" },
      { fetchFn: fetchMock }
    );
    expect(await provider.getAvailableLanguageModels()).toEqual([]);
    const malformed = new RuncrateProvider(
      { RUNCRATE_API_KEY: "test-key" },
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
    const provider = new RuncrateProvider(
      { RUNCRATE_API_KEY: "test-key" },
      { fetchFn: fetchMock }
    );
    const messages: Message[] = [{ role: "user", content: "Find hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "deepseek-ai/DeepSeek-V4.1-Flash",
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
      "https://api.runcrate.ai/v1/chat/completions"
    );
    expect(requestBodyOf(fetchMock, chatCall).model).toBe(
      "deepseek-ai/DeepSeek-V4.1-Flash"
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
    const provider = new RuncrateProvider(
      { RUNCRATE_API_KEY: "test-key" },
      { fetchFn: fetchMock }
    );
    const items = [];
    for await (const item of provider.generateMessages({
      messages: [{ role: "user", content: "Find hello" }],
      model: "zai-org/GLM-5.3"
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
