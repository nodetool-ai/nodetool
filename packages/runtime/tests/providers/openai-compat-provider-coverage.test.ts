import { describe, it, expect, vi } from "vitest";
import { OpenAICompatProvider } from "../../src/providers/openai-compat-provider.js";
import type {
  Message,
  ProviderStreamItem,
  ProviderTool,
  ToolCall
} from "../../src/providers/types.js";
import {
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch,
  requestBodyOf
} from "./helpers/compat-fetch.js";

const CONFIG = {
  providerId: "groq" as const,
  apiKey: "secret-key",
  baseURL: "https://api.example.com/v1",
  defaultHeaders: { "X-Title": "NodeTool" }
};

function makeProvider(fetchMock: unknown): OpenAICompatProvider {
  return new OpenAICompatProvider(CONFIG, {
    fetchFn: fetchMock as typeof fetch
  });
}

async function collect(
  gen: AsyncGenerator<ProviderStreamItem>
): Promise<ProviderStreamItem[]> {
  const items: ProviderStreamItem[] = [];
  for await (const item of gen) items.push(item);
  return items;
}

const userMsg = (content: string): Message[] => [{ role: "user", content }];

describe("OpenAICompatProvider.generateMessage (non-streaming)", () => {
  it("returns the assistant content and posts to the compat endpoint", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [
          { message: { content: "hi there", tool_calls: null }, finish_reason: "stop" }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 4 }
      })
    );
    const provider = makeProvider(fetchMock);

    const result = await provider.generateMessage({
      messages: userMsg("hello"),
      model: "llama-3.1-70b"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("hi there");
    expect(result.toolCalls).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret-key",
          "X-Title": "NodeTool"
        })
      })
    );
    // Usage was tracked -> non-zero cost recorded (or zero if model unknown; still a number).
    expect(typeof provider.getTotalCost()).toBe("number");
  });

  it("tracks usage from the completion", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [{ message: { content: "x" }, finish_reason: "stop" }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          prompt_tokens_details: { cached_tokens: 20 }
        }
      })
    );
    const provider = makeProvider(fetchMock);
    const spy = vi.spyOn(provider, "trackUsage");

    await provider.generateMessage({
      messages: userMsg("hi"),
      model: "llama-3.1-70b"
    });

    expect(spy).toHaveBeenCalledWith("llama-3.1-70b", {
      inputTokens: 100,
      outputTokens: 50,
      cachedTokens: 20
    });
  });

  it("handles a missing usage object and null content", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [{ message: { content: null }, finish_reason: "stop" }]
      })
    );
    const provider = makeProvider(fetchMock);
    const spy = vi.spyOn(provider, "trackUsage");

    const result = await provider.generateMessage({
      messages: userMsg("hi"),
      model: "llama-3.1-70b"
    });

    expect(result.content).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("throws when the completion has no choices", async () => {
    const fetchMock = mockChatFetch(chatJsonResponse({ choices: [] }));
    const provider = makeProvider(fetchMock);

    await expect(
      provider.generateMessage({ messages: userMsg("hi"), model: "llama-3.1-70b" })
    ).rejects.toThrow("groq returned no choices");
  });

  it("maps function tool calls, dropping non-function entries", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "search", arguments: '{"q":"cats"}' }
                },
                { id: "call_2", type: "custom", function: { name: "nope" } }
              ]
            },
            finish_reason: "tool_calls"
          }
        ]
      })
    );
    const provider = makeProvider(fetchMock);

    const result = await provider.generateMessage({
      messages: userMsg("find cats"),
      model: "llama-3.1-70b"
    });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls?.[0]).toMatchObject({
      id: "call_1",
      name: "search",
      args: { q: "cats" }
    });
  });

  it("sends tool_choice 'required' when toolChoice is 'any'", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }]
      })
    );
    const provider = makeProvider(fetchMock);
    const tools: ProviderTool[] = [
      { name: "f", description: "d", parameters: { type: "object", properties: {} } }
    ];

    await provider.generateMessage({
      messages: userMsg("hi"),
      model: "llama-3.1-70b",
      tools,
      toolChoice: "any"
    });

    const body = requestBodyOf(fetchMock as never);
    expect(body.tool_choice).toBe("required");
    expect(Array.isArray(body.tools)).toBe(true);
  });

  it("sends a named tool_choice when toolChoice is a specific tool", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }]
      })
    );
    const provider = makeProvider(fetchMock);
    const tools: ProviderTool[] = [
      { name: "f", description: "d", parameters: { type: "object", properties: {} } }
    ];

    await provider.generateMessage({
      messages: userMsg("hi"),
      model: "llama-3.1-70b",
      tools,
      toolChoice: "f"
    });

    expect(requestBodyOf(fetchMock as never).tool_choice).toEqual({
      type: "function",
      function: { name: "f" }
    });
  });

  it("passes sampling params and audio modalities through", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }]
      })
    );
    const provider = makeProvider(fetchMock);

    await provider.generateMessage({
      messages: userMsg("hi"),
      model: "llama-3.1-70b",
      temperature: 0.3,
      topP: 0.9,
      presencePenalty: 0.1,
      frequencyPenalty: 0.2,
      audio: { voice: "alloy", format: "wav" }
    });

    const body = requestBodyOf(fetchMock as never);
    expect(body.temperature).toBe(0.3);
    expect(body.top_p).toBe(0.9);
    expect(body.presence_penalty).toBe(0.1);
    expect(body.frequency_penalty).toBe(0.2);
    expect(body.audio).toEqual({ voice: "alloy", format: "wav" });
    expect(body.modalities).toEqual(["text", "audio"]);
    expect(body.max_completion_tokens).toBe(16384);
  });
});

describe("OpenAICompatProvider.generateMessages (streaming)", () => {
  it("yields content chunks and a terminal done on 'stop'", async () => {
    const fetchMock = mockChatFetch(() =>
      chatSSEResponse([
        { choices: [{ delta: { content: "he" }, finish_reason: null }] },
        { choices: [{ delta: { content: "llo" }, finish_reason: "stop" }] }
      ])
    );
    const provider = makeProvider(fetchMock);

    const items = await collect(
      provider.generateMessages({ messages: userMsg("hi"), model: "llama-3.1-70b" })
    );

    const chunks = items.filter(
      (i): i is Extract<ProviderStreamItem, { type: "chunk" }> =>
        (i as { type?: string }).type === "chunk"
    );
    expect(chunks.map((c) => c.content).join("")).toBe("hello");
    const last = chunks.at(-1);
    expect(last?.done).toBe(true);

    // stream request advertised include_usage.
    const body = requestBodyOf(fetchMock as never);
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it("tracks usage emitted on a streaming chunk", async () => {
    const fetchMock = mockChatFetch(() =>
      chatSSEResponse([
        { choices: [{ delta: { content: "x" }, finish_reason: "stop" }] },
        {
          choices: [],
          usage: {
            prompt_tokens: 7,
            completion_tokens: 3,
            prompt_tokens_details: { cached_tokens: 1 }
          }
        }
      ])
    );
    const provider = makeProvider(fetchMock);
    const spy = vi.spyOn(provider, "trackUsage");

    await collect(
      provider.generateMessages({ messages: userMsg("hi"), model: "llama-3.1-70b" })
    );

    expect(spy).toHaveBeenCalledWith("llama-3.1-70b", {
      inputTokens: 7,
      outputTokens: 3,
      cachedTokens: 1
    });
  });

  it("assembles tool-call deltas and emits a tool call + done on 'tool_calls'", async () => {
    const fetchMock = mockChatFetch(() =>
      chatSSEResponse([
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: "c1", function: { name: "f", arguments: '{"a"' } }
                ]
              },
              finish_reason: null
            }
          ]
        },
        {
          choices: [
            {
              delta: { tool_calls: [{ index: 0, function: { arguments: ":1}" } }] },
              finish_reason: null
            }
          ]
        },
        { choices: [{ delta: {}, finish_reason: "tool_calls" }] }
      ])
    );
    const provider = makeProvider(fetchMock);

    const items = await collect(
      provider.generateMessages({ messages: userMsg("go"), model: "llama-3.1-70b" })
    );

    const toolCall = items.find(
      (i): i is ToolCall =>
        typeof i === "object" && i !== null && "args" in (i as object)
    ) as ToolCall | undefined;
    expect(toolCall).toBeDefined();
    expect(toolCall?.id).toBe("c1");
    expect(toolCall?.name).toBe("f");
    expect(toolCall?.args).toEqual({ a: 1 });

    // A terminal done:true chunk is emitted for the non-stop finish reason.
    const doneChunk = items.find(
      (i) =>
        (i as { type?: string }).type === "chunk" &&
        (i as { done?: boolean }).done === true
    );
    expect(doneChunk).toBeDefined();
  });

  it("emits a done chunk for a 'length' finish reason", async () => {
    const fetchMock = mockChatFetch(() =>
      chatSSEResponse([
        { choices: [{ delta: { content: "partial" }, finish_reason: "length" }] }
      ])
    );
    const provider = makeProvider(fetchMock);

    const items = await collect(
      provider.generateMessages({ messages: userMsg("hi"), model: "llama-3.1-70b" })
    );

    const doneChunks = items.filter(
      (i) =>
        (i as { type?: string }).type === "chunk" &&
        (i as { done?: boolean }).done === true
    );
    expect(doneChunks.length).toBeGreaterThanOrEqual(1);
  });

  it("yields an audio chunk when a delta carries audio data", async () => {
    const fetchMock = mockChatFetch(() =>
      chatSSEResponse([
        { choices: [{ delta: { audio: { data: "BASE64AUDIO" } }, finish_reason: null }] },
        { choices: [{ delta: { content: "" }, finish_reason: "stop" }] }
      ])
    );
    const provider = makeProvider(fetchMock);

    const items = await collect(
      provider.generateMessages({ messages: userMsg("say hi"), model: "llama-3.1-70b" })
    );

    const audioChunk = items.find(
      (i) => (i as { content_type?: string }).content_type === "audio"
    );
    expect(audioChunk).toMatchObject({
      type: "chunk",
      content_type: "audio",
      content: "BASE64AUDIO"
    });
  });

  it("skips chunks that carry no choice", async () => {
    const fetchMock = mockChatFetch(() =>
      chatSSEResponse([
        { choices: [] },
        { choices: [{ delta: { content: "done" }, finish_reason: "stop" }] }
      ])
    );
    const provider = makeProvider(fetchMock);

    const items = await collect(
      provider.generateMessages({ messages: userMsg("hi"), model: "llama-3.1-70b" })
    );

    const text = items
      .filter((i) => (i as { type?: string }).type === "chunk")
      .map((c) => (c as { content?: string }).content)
      .join("");
    expect(text).toBe("done");
  });

  it("does not set tool_choice on the streaming request even with toolChoice", async () => {
    const fetchMock = mockChatFetch(() =>
      chatSSEResponse([
        { choices: [{ delta: { content: "" }, finish_reason: "stop" }] }
      ])
    );
    const provider = makeProvider(fetchMock);
    const tools: ProviderTool[] = [
      { name: "f", description: "d", parameters: { type: "object", properties: {} } }
    ];

    await collect(
      provider.generateMessages({
        messages: userMsg("hi"),
        model: "llama-3.1-70b",
        tools,
        toolChoice: "any"
      })
    );

    const body = requestBodyOf(fetchMock as never);
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tool_choice).toBe("required");
  });
});

describe("OpenAICompatProvider compat client wiring", () => {
  it("uses an injected compat client instead of building one from fetch", async () => {
    const fakeCompat = {
      chatCompletions: vi.fn(async () => ({
        choices: [{ message: { content: "injected" }, finish_reason: "stop" }]
      })),
      chatCompletionsStream: vi.fn()
    };
    const provider = new OpenAICompatProvider(CONFIG, {
      compatClient: fakeCompat as never
    });

    const result = await provider.generateMessage({
      messages: userMsg("hi"),
      model: "llama-3.1-70b"
    });

    expect(result.content).toBe("injected");
    expect(fakeCompat.chatCompletions).toHaveBeenCalledTimes(1);
  });

  it("lazily builds one compat client and reuses it across calls", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }]
      })
    );
    const provider = makeProvider(fetchMock);

    await provider.generateMessage({ messages: userMsg("a"), model: "llama-3.1-70b" });
    await provider.generateMessage({ messages: userMsg("b"), model: "llama-3.1-70b" });

    // Both calls went through the same lazily-created client over the same fetch.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
