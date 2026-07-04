import { describe, expect, it, vi } from "vitest";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import type OpenAI from "openai";
import { OpenAIProvider } from "../../src/providers/openai-provider.js";
import { OpenAIResponsesProvider } from "../../src/providers/openai-responses-provider.js";
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

function providerWithCreate(create: ReturnType<typeof vi.fn>) {
  return new OpenAIResponsesProvider(
    { OPENAI_API_KEY: "k" },
    {
      client: {
        responses: { create }
      } as unknown as OpenAI
    }
  );
}

describe("OpenAIResponsesProvider", () => {
  it("reports its provider id, secret, native search support, and tool support", async () => {
    const provider = providerWithCreate(vi.fn());

    expect(OpenAIResponsesProvider.requiredSecrets()).toEqual(["OPENAI_API_KEY"]);
    expect(provider.provider).toBe(PROVIDER_IDS.OPENAI_RESPONSES);
    expect(provider.getContainerEnv()).toEqual({ OPENAI_API_KEY: "k" });
    expect(provider.supportsNativeWebSearch).toBe(true);
    expect(new OpenAIProvider({ OPENAI_API_KEY: "k" }).supportsNativeWebSearch).toBe(
      false
    );
    expect(provider.supportsNativeImageGeneration).toBe(true);
    expect(
      new OpenAIProvider({ OPENAI_API_KEY: "k" }).supportsNativeImageGeneration
    ).toBe(false);
    await expect(provider.hasToolSupport("o3-mini")).resolves.toBe(true);
    await expect(provider.hasToolSupport("text-embedding-3-small")).resolves.toBe(
      false
    );
  });

  it("formats web_search as a hosted Responses tool and functions as flat tools", () => {
    const provider = providerWithCreate(vi.fn());

    expect(
      provider.formatTools([
        { name: "web_search", description: "Search" },
        {
          name: "lookup",
          description: "Lookup",
          inputSchema: { type: "object", properties: { q: { type: "string" } } }
        }
      ])
    ).toEqual([
      { type: "web_search" },
      {
        type: "function",
        name: "lookup",
        description: "Lookup",
        parameters: { type: "object", properties: { q: { type: "string" } } }
      }
    ]);
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

  it("filters live OpenAI models into the Responses provider list", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "gpt-5.4" },
            { id: "gpt-4.1-mini" },
            { id: "text-embedding-3-small" }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const provider = new OpenAIResponsesProvider(
      { OPENAI_API_KEY: "k" },
      { client: { responses: { create: vi.fn() } } as unknown as OpenAI, fetchFn }
    );

    const models = await provider.getAvailableLanguageModels();

    expect(models.map((m) => m.id)).toEqual(["gpt-5.4", "gpt-4.1-mini"]);
    expect(
      models.every((m) => m.provider === PROVIDER_IDS.OPENAI_RESPONSES)
    ).toBe(true);
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

  it("resumes with previous_response_id and chains tool outputs", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const create = vi.fn(
      async (body: Record<string, unknown>) => {
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
      }
    );
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
          providerId: PROVIDER_IDS.OPENAI_RESPONSES,
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
    expect(sessions.every((item) => item.session.checkpoint === messages.length)).toBe(
      true
    );
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

  it("maps the image_generation tool to a hosted Responses tool", () => {
    const provider = providerWithCreate(vi.fn());

    expect(
      provider.formatTools([{ name: IMAGE_GENERATION_TOOL_NAME }])
    ).toEqual([{ type: "image_generation" }]);
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
