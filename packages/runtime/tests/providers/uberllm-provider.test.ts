import { describe, it, expect, vi } from "vitest";
import { UberLLMProvider } from "../../src/providers/uberllm-provider.js";
import type { Message } from "../../src/providers/types.js";
import {
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch,
  requestBodyOf
} from "./helpers/compat-fetch.js";

/** A chat `/v1/models` listing shaped like UberLLM's. */
const LISTING = {
  object: "list",
  data: [
    {
      id: "deepseek/deepseek-v4.1-flash",
      object: "model",
      type: "chat",
      display_name: "DeepSeek V4.1 Flash",
      context_length: 1000000,
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      supported_parameters: ["tools", "tool_choice", "response_format"]
    },
    {
      id: "google/gemma-3-27b-it",
      object: "model",
      type: "chat",
      display_name: "Gemma 3 27B",
      context_length: 131072,
      architecture: {
        input_modalities: ["text", "image"],
        output_modalities: ["text"]
      },
      supported_parameters: ["response_format"]
    },
    {
      id: "example/image-model",
      architecture: { input_modalities: ["text"], output_modalities: ["image"] }
    },
    {
      id: "deepseek/deepseek-v4.1-flash",
      architecture: { input_modalities: ["text"], output_modalities: ["text"] }
    },
    { id: "" },
    { unrelated: "invalid" }
  ]
};

/** A `/v1/models?type=image` listing shaped like UberLLM's. */
const IMAGE_LISTING = {
  object: "list",
  data: [
    {
      id: "venice/z-image-turbo",
      type: "image",
      display_name: "Z-Image Turbo",
      endpoints: ["/v1/images/generations"],
      output_modalities: ["image"],
      available: true
    },
    {
      id: "black-forest-labs/flux-2-max-edit",
      type: "image",
      display_name: "Flux 2 Max — Edit",
      endpoints: ["/v1/images/edits"],
      available: true
    },
    {
      id: "example/offline-image",
      type: "image",
      endpoints: ["/v1/images/generations"],
      available: false
    },
    { id: "example/no-endpoints", type: "image" }
  ]
};

const KEY = { UBERLLM_API_KEY: "test-key" };
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
const IMAGE_MODEL = {
  id: "venice/z-image-turbo",
  name: "Z-Image Turbo",
  provider: "uberllm" as const
};

describe("UberLLMProvider", () => {
  it("requires an UberLLM key", () => {
    expect(() => new UberLLMProvider({})).toThrow(
      "UBERLLM_API_KEY is required"
    );
    expect(UberLLMProvider.requiredSecrets()).toEqual(["UBERLLM_API_KEY"]);
    const provider = new UberLLMProvider(KEY);
    expect(provider.provider).toBe("uberllm");
    expect(provider.getContainerEnv()).toEqual(KEY);
    expect(provider.getCapabilities()).toContain("text_to_image");
  });

  it("discovers distinct chat models, skipping non-text rows", async () => {
    const fetchMock = mockChatFetch(chatJsonResponse(LISTING));
    const provider = new UberLLMProvider(KEY, { fetchFn: fetchMock });
    expect(await provider.getAvailableLanguageModels()).toEqual([
      {
        id: "deepseek/deepseek-v4.1-flash",
        name: "DeepSeek V4.1 Flash",
        provider: "uberllm"
      },
      { id: "google/gemma-3-27b-it", name: "Gemma 3 27B", provider: "uberllm" }
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.uberllm.dev/v1/models"
    );
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")
    ).toBe("Bearer test-key");
  });

  it("reads tool support and the context window from the listing, discovering once", async () => {
    const fetchMock = mockChatFetch(chatJsonResponse(LISTING));
    const provider = new UberLLMProvider(KEY, { fetchFn: fetchMock });
    expect(await provider.hasToolSupport("deepseek/deepseek-v4.1-flash")).toBe(
      true
    );
    expect(await provider.hasToolSupport("google/gemma-3-27b-it")).toBe(false);
    expect(await provider.getContextWindow("deepseek/deepseek-v4.1-flash")).toBe(
      1000000
    );
    expect(await provider.getContextWindow("google/gemma-3-27b-it")).toBe(
      131072
    );
    // A model the listing did not describe keeps tools on and reports no window.
    expect(await provider.hasToolSupport("unlisted-model")).toBe(true);
    expect(await provider.getContextWindow("unlisted-model")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([401, 500])(
    "keeps model discovery empty on HTTP %s",
    async (status) => {
      const provider = new UberLLMProvider(KEY, {
        fetchFn: mockChatFetch(new Response("unavailable", { status }))
      });
      expect(await provider.getAvailableLanguageModels()).toEqual([]);
      expect(await provider.getAvailableImageModels()).toEqual([]);
      expect(await provider.hasToolSupport("deepseek/deepseek-v4.1-flash")).toBe(
        true
      );
    }
  );

  it("keeps discovery failures from breaking the model picker", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));
    const provider = new UberLLMProvider(KEY, { fetchFn: fetchMock });
    expect(await provider.getAvailableLanguageModels()).toEqual([]);
    expect(await provider.getAvailableImageModels()).toEqual([]);
    const malformed = new UberLLMProvider(KEY, {
      fetchFn: mockChatFetch(new Response("not JSON"))
    });
    expect(await malformed.getAvailableLanguageModels()).toEqual([]);
  });

  it("lists the available image models served on /v1/images/generations", async () => {
    const fetchMock = mockChatFetch(chatJsonResponse(IMAGE_LISTING));
    const provider = new UberLLMProvider(KEY, { fetchFn: fetchMock });
    expect(await provider.getAvailableImageModels()).toEqual([
      { ...IMAGE_MODEL, supportedTasks: ["text_to_image"] }
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.uberllm.dev/v1/models?type=image"
    );
  });

  it("generates an image from b64_json", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        created: 1,
        data: [{ b64_json: Buffer.from(PNG).toString("base64") }]
      })
    );
    const provider = new UberLLMProvider(KEY, { fetchFn: fetchMock });
    const bytes = await provider.textToImage({
      model: IMAGE_MODEL,
      prompt: "a red apple",
      negativePrompt: "text",
      width: 1024,
      height: 768
    });
    expect(Array.from(bytes)).toEqual(Array.from(PNG));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.uberllm.dev/v1/images/generations"
    );
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer test-key"
    );
    expect(requestBodyOf(fetchMock)).toEqual({
      model: "venice/z-image-turbo",
      prompt: "a red apple\n\nDo not include: text",
      n: 1,
      response_format: "b64_json",
      size: "1024x768"
    });
  });

  it("downloads an UberLLM-hosted url answer with the same key", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith("/images/generations")
        ? chatJsonResponse({
            data: [{ url: "https://api.uberllm.dev/v1/media/artifacts/abc/0" }]
          })
        : new Response(PNG, { status: 200 })
    );
    const provider = new UberLLMProvider(KEY, { fetchFn: fetchMock });
    const bytes = await provider.textToImage({
      model: IMAGE_MODEL,
      prompt: "a red apple"
    });
    expect(Array.from(bytes)).toEqual(Array.from(PNG));
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.uberllm.dev/v1/media/artifacts/abc/0"
    );
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Authorization")
    ).toBe("Bearer test-key");
  });

  it("rejects an empty prompt and surfaces image errors", async () => {
    const provider = new UberLLMProvider(KEY, {
      fetchFn: mockChatFetch(
        new Response('{"error":{"message":"insufficient credit"}}', {
          status: 402
        })
      )
    });
    await expect(
      provider.textToImage({ model: IMAGE_MODEL, prompt: "" })
    ).rejects.toThrow("The input prompt cannot be empty.");
    await expect(
      provider.textToImage({ model: IMAGE_MODEL, prompt: "a red apple" })
    ).rejects.toThrow("UberLLM image generation failed (402)");
    const empty = new UberLLMProvider(KEY, {
      fetchFn: mockChatFetch(chatJsonResponse({ data: [] }))
    });
    await expect(
      empty.textToImage({ model: IMAGE_MODEL, prompt: "a red apple" })
    ).rejects.toThrow("UberLLM image generation returned no image data.");
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
    const provider = new UberLLMProvider(KEY, { fetchFn: fetchMock });
    const messages: Message[] = [{ role: "user", content: "Find hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "deepseek/deepseek-v4.1-flash",
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
      "https://api.uberllm.dev/v1/chat/completions"
    );
    expect(requestBodyOf(fetchMock, chatCall).model).toBe(
      "deepseek/deepseek-v4.1-flash"
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
    const provider = new UberLLMProvider(KEY, { fetchFn: fetchMock });
    const items = [];
    for await (const item of provider.generateMessages({
      messages: [{ role: "user", content: "Find hello" }],
      model: "deepseek/deepseek-v4.1-flash"
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
