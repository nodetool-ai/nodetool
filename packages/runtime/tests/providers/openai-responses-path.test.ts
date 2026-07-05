import { describe, expect, it, vi } from "vitest";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import type OpenAI from "openai";
import { OpenAIProvider } from "../../src/providers/openai-provider.js";
import {
  extractResponsesImages,
  messagesToResponsesInput
} from "../../src/providers/responses-api.js";
import {
  IMAGE_GENERATION_TOOL_NAME,
  type Message,
  type MessageContent,
  type MessageImageContent,
  type ProviderStreamItem
} from "../../src/providers/types.js";

function makeAsyncIterable(
  items: Array<Record<string, unknown>>
): AsyncIterable<Record<string, unknown>> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    }
  };
}

async function collect(
  stream: AsyncGenerator<ProviderStreamItem>
): Promise<ProviderStreamItem[]> {
  const items: ProviderStreamItem[] = [];
  for await (const item of stream) items.push(item);
  return items;
}

// The merged OpenAIProvider routes Responses-capable models (gpt-5*, gpt-4.1*,
// gpt-4o*, o<n>*) through the Responses API. These tests exercise that path by
// constructing the provider with a mocked `responses.create` and a Responses
// model id.
function providerWithCreate(create: ReturnType<typeof vi.fn>) {
  return new OpenAIProvider(
    { OPENAI_API_KEY: "k" },
    {
      client: {
        responses: { create }
      } as unknown as OpenAI
    }
  );
}

describe("OpenAIProvider Responses path", () => {
  it("reports native search/image support and Responses tool support", async () => {
    const provider = providerWithCreate(vi.fn());

    expect(provider.provider).toBe(PROVIDER_IDS.OPENAI);
    expect(provider.getContainerEnv()).toEqual({ OPENAI_API_KEY: "k" });
    expect(provider.supportsNativeWebSearch).toBe(true);
    expect(provider.supportsNativeImageGeneration).toBe(true);
    await expect(provider.hasToolSupport("gpt-5")).resolves.toBe(true);
    await expect(provider.hasToolSupport("gpt-5.4")).resolves.toBe(true);
  });

  it("does not force hosted web_search through function tool_choice", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "resp_1",
      output_text: "done",
      output: []
    });
    const provider = providerWithCreate(create);

    await provider.generateMessage({
      model: "gpt-5",
      messages: [{ role: "user", content: "search" }],
      tools: [{ name: "web_search" }],
      toolChoice: "web_search"
    });

    expect(create.mock.calls[0][0]).toMatchObject({
      tools: [{ type: "web_search" }],
      tool_choice: "auto"
    });
  });

  it("filters the live model list to the supported gpt-5 family", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "gpt-5.4" },
            { id: "gpt-4.1-mini" },
            { id: "gpt-4o" },
            { id: "o3-mini" },
            { id: "text-embedding-3-small" }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: { responses: { create: vi.fn() } } as unknown as OpenAI, fetchFn }
    );

    const models = await provider.getAvailableLanguageModels();

    // Everything before gpt-5 is retired.
    expect(models.map((m) => m.id)).toEqual(["gpt-5.4"]);
    expect(models.every((m) => m.provider === PROVIDER_IDS.OPENAI)).toBe(true);
  });

  it("generates a non-streaming Responses message", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "resp_1",
      output_text: "done",
      output: [
        {
          type: "function_call",
          id: "fc_1",
          call_id: "call_1",
          name: "lookup",
          arguments: '{"q":"x"}'
        }
      ],
      usage: {
        input_tokens: 11,
        output_tokens: 2,
        input_tokens_details: { cached_tokens: 3 }
      }
    });
    const provider = providerWithCreate(create);

    const result = await provider.generateMessage({
      model: "gpt-5",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "web_search" }, { name: "lookup" }]
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      model: "gpt-5",
      stream: false,
      store: false,
      tools: [{ type: "web_search" }, { type: "function", name: "lookup" }],
      tool_choice: "auto"
    });
    expect(result).toEqual({
      role: "assistant",
      content: "done",
      toolCalls: [{ id: "call_1", name: "lookup", args: { q: "x" } }]
    });
  });

  it("streams text and ignores hosted web search call events", async () => {
    const create = vi.fn().mockResolvedValue(
      makeAsyncIterable([
        { type: "response.created", response: { id: "resp_1" } },
        { type: "response.web_search_call.searching", item_id: "ws_1" },
        { type: "response.output_text.delta", delta: "live result" },
        { type: "response.web_search_call.completed", item_id: "ws_1" },
        { type: "response.completed", response: { id: "resp_1" } }
      ])
    );
    const provider = providerWithCreate(create);

    const items = await collect(
      provider.generateMessages({
        model: "gpt-5",
        messages: [{ role: "user", content: "latest news?" }],
        tools: [{ name: "web_search" }]
      })
    );

    expect(items).toEqual([
      { type: "chunk", content: "live result", done: false },
      { type: "chunk", content: "", done: true }
    ]);
    expect(create.mock.calls[0][0].tools).toEqual([{ type: "web_search" }]);
  });

  it("routes non-Responses models through Chat Completions", async () => {
    const chatCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "hi", tool_calls: [] } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 }
    });
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      {
        client: {
          responses: { create: vi.fn() },
          chat: { completions: { create: chatCreate } }
        } as unknown as OpenAI
      }
    );

    await provider.generateMessage({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "hi" }]
    });

    expect(chatCreate).toHaveBeenCalledTimes(1);
  });

  it("resumes with previous_response_id and chains tool outputs", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const create = vi.fn(async (body: Record<string, unknown>) => {
      requests.push(body);
      if (requests.length === 1) {
        return makeAsyncIterable([
          { type: "response.created", response: { id: "resp_2" } },
          {
            type: "response.output_item.added",
            item: {
              type: "function_call",
              id: "fc_1",
              call_id: "call_1",
              name: "lookup"
            }
          },
          {
            type: "response.function_call_arguments.done",
            item_id: "fc_1",
            name: "lookup",
            arguments: '{"q":"x"}'
          },
          { type: "response.completed", response: { id: "resp_2" } }
        ]);
      }
      return makeAsyncIterable([
        { type: "response.created", response: { id: "resp_3" } },
        { type: "response.output_text.delta", delta: "final" },
        { type: "response.completed", response: { id: "resp_3" } }
      ]);
    });
    const provider = providerWithCreate(create);
    const messages: Message[] = [
      { role: "system", content: "Be terse." },
      { role: "user", content: "second" }
    ];

    const items = await collect(
      provider.generateLoop({
        model: "gpt-5",
        messages,
        providerSession: {
          providerId: PROVIDER_IDS.OPENAI,
          model: "gpt-5",
          token: "resp_1",
          checkpoint: 1
        },
        tools: [
          {
            name: "lookup",
            execute: async () => "tool result"
          }
        ]
      })
    );

    expect(requests[0].previous_response_id).toBe("resp_1");
    expect(requests[0].store).toBe(true);
    expect(requests[0].input).toEqual([
      {
        role: "user",
        content: [{ type: "input_text", text: "second" }]
      }
    ]);
    expect(requests[1].previous_response_id).toBe("resp_2");
    expect(requests[1].input).toEqual([
      {
        type: "function_call_output",
        call_id: "call_1",
        output: "tool result"
      }
    ]);
    const sessions = items.filter(
      (item): item is Extract<ProviderStreamItem, { type: "session" }> =>
        "type" in item && item.type === "session"
    );
    expect(sessions.map((item) => item.session.token)).toEqual([
      "resp_2",
      "resp_3"
    ]);
    expect(
      sessions.every((item) => item.session.checkpoint === messages.length)
    ).toBe(true);
    const persistedMessages = items.filter(
      (item): item is Extract<ProviderStreamItem, { type: "message" }> =>
        "type" in item && item.type === "message"
    );
    expect(persistedMessages.map((item) => item.message.role)).toEqual([
      "assistant",
      "tool",
      "assistant"
    ]);
  });

  it("surfaces a native image_generation_call as assistant image content", async () => {
    const b64 = "aGVsbG8="; // "hello"
    const create = vi.fn().mockResolvedValue(
      makeAsyncIterable([
        { type: "response.created", response: { id: "resp_img" } },
        { type: "response.output_text.delta", delta: "Here you go" },
        {
          type: "response.output_item.done",
          item: {
            type: "image_generation_call",
            id: "ig_1",
            result: b64,
            output_format: "webp",
            revised_prompt: "a red fox"
          }
        },
        { type: "response.completed", response: { id: "resp_img" } }
      ])
    );
    const provider = providerWithCreate(create);

    const items = await collect(
      provider.generateLoop({
        model: "gpt-5",
        messages: [{ role: "user", content: "draw a fox" }],
        tools: [{ name: IMAGE_GENERATION_TOOL_NAME }]
      })
    );

    // Only one request — the server-side tool must not trigger a tool round.
    expect(create).toHaveBeenCalledTimes(1);

    const chunks = items.filter(
      (item): item is Extract<ProviderStreamItem, { type: "chunk" }> =>
        "type" in item && item.type === "chunk"
    );
    // The base64 blob must never leak into the outward chunk stream.
    expect(chunks.every((c) => c.content !== b64)).toBe(true);
    expect(chunks.some((c) => c.content === "Here you go")).toBe(true);

    const messages = items.filter(
      (item): item is Extract<ProviderStreamItem, { type: "message" }> =>
        "type" in item && item.type === "message"
    );
    expect(messages).toHaveLength(1);
    const content = messages[0].message.content as MessageContent[];
    expect(content).toEqual([
      { type: "text", text: "Here you go" },
      { type: "image_url", image: { data: b64, mimeType: "image/webp" } }
    ]);
    expect(messages[0].message.toolCalls).toBeNull();
  });

  it("re-presents an assistant image as a user input_image in replay input", async () => {
    const b64 = "aGVsbG8=";
    const messages: Message[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "here is your image" },
          { type: "image_url", image: { data: b64, mimeType: "image/png" } }
        ] as MessageContent[]
      }
    ];

    const input = await messagesToResponsesInput(messages, async (uri) => uri);

    expect(input).toEqual([
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "here is your image" }]
      },
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_image", image_url: `data:image/png;base64,${b64}` }
        ]
      }
    ]);
  });

  it("keeps function_call/function_call_output adjacent when replaying an image+tool turn", async () => {
    const b64 = "aGVsbG8=";
    const messages: Message[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "image and a lookup" },
          { type: "image_url", image: { data: b64, mimeType: "image/png" } }
        ] as MessageContent[],
        toolCalls: [{ id: "call_1", name: "lookup", args: { q: "fox" } }]
      },
      { role: "tool", toolCallId: "call_1", content: "result" },
      { role: "user", content: "make it blue" }
    ];

    const input = await messagesToResponsesInput(messages, async (uri) => uri);

    // The re-presented image must NOT split the call/output pair; it flushes
    // after the tool block, before the next user turn.
    expect(input.map((item) => item.type ?? (item.role as string))).toEqual([
      "message", // assistant text
      "function_call",
      "function_call_output",
      "message", // re-presented user input_image
      "user" // next user turn
    ]);
    expect(input[3]).toEqual({
      type: "message",
      role: "user",
      content: [
        { type: "input_image", image_url: `data:image/png;base64,${b64}` }
      ]
    });
  });

  it("re-presents a trailing assistant image even when history ends on a tool message", async () => {
    const b64 = "aGVsbG8=";
    const messages: Message[] = [
      {
        role: "assistant",
        content: [
          { type: "image_url", image: { data: b64, mimeType: "image/png" } }
        ] as MessageContent[],
        toolCalls: [{ id: "call_1", name: "lookup", args: {} }]
      },
      { role: "tool", toolCallId: "call_1", content: "result" }
    ];

    const input = await messagesToResponsesInput(messages, async (uri) => uri);

    expect(input.map((item) => item.type)).toEqual([
      "function_call",
      "function_call_output",
      "message"
    ]);
  });

  it("absorbs native image chunks on the non-loop generateMessages path", async () => {
    const b64 = "aGVsbG8=";
    const create = vi.fn().mockResolvedValue(
      makeAsyncIterable([
        { type: "response.created", response: { id: "resp_img" } },
        { type: "response.output_text.delta", delta: "Sure" },
        {
          type: "response.output_item.done",
          item: { type: "image_generation_call", id: "ig_1", result: b64 }
        },
        { type: "response.completed", response: { id: "resp_img" } }
      ])
    );
    const provider = providerWithCreate(create);

    const items = await collect(
      provider.generateMessages({
        model: "gpt-5",
        messages: [{ role: "user", content: "draw" }],
        tools: [{ name: IMAGE_GENERATION_TOOL_NAME }]
      })
    );

    const chunks = items.filter(
      (item): item is Extract<ProviderStreamItem, { type: "chunk" }> =>
        "type" in item && item.type === "chunk"
    );
    expect(chunks.every((c) => c.content !== b64)).toBe(true);

    const messages = items.filter(
      (item): item is Extract<ProviderStreamItem, { type: "message" }> =>
        "type" in item && item.type === "message"
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message.content).toEqual([
      { type: "text", text: "Sure" },
      { type: "image_url", image: { data: b64, mimeType: "image/png" } }
    ]);
  });

  it("extractResponsesImages pulls image_generation_call items", () => {
    const b64 = "aGVsbG8=";
    const images = extractResponsesImages([
      { type: "message", content: [{ type: "output_text", text: "x" }] },
      {
        type: "image_generation_call",
        id: "ig_1",
        result: b64,
        output_format: "jpeg"
      },
      { type: "image_generation_call", id: "ig_2", result: b64 }
    ]);

    expect(images).toEqual<MessageImageContent[]>([
      { type: "image_url", image: { data: b64, mimeType: "image/jpeg" } },
      { type: "image_url", image: { data: b64, mimeType: "image/png" } }
    ]);
  });
});
