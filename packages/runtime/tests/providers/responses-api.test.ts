import { describe, expect, it, vi } from "vitest";
import {
  extractResponsesText,
  extractResponsesToolCalls,
  messagesToResponsesInput,
  responseTools,
  responseUsage,
  streamResponsesEvents
} from "../../src/providers/responses-api.js";
import type { Message, ProviderStreamItem } from "../../src/providers/types.js";

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

describe("Responses API helpers", () => {
  it("converts text, assistant tool calls, tool outputs, and images", async () => {
    const messages: Message[] = [
      { role: "system", content: "Be terse." },
      {
        role: "user",
        content: [
          { type: "text", text: "look" },
          {
            type: "image_url",
            image: { uri: "file:///tmp/a.png", mimeType: "image/png" }
          }
        ]
      },
      {
        role: "assistant",
        content: "calling",
        toolCalls: [{ id: "call_1", name: "lookup", args: { q: "x" } }]
      },
      { role: "tool", toolCallId: "call_1", content: { ok: true } }
    ];

    const input = await messagesToResponsesInput(messages, async (uri) =>
      uri === "file:///tmp/a.png" ? "data:image/png;base64,QUJD" : uri
    );

    expect(input).toEqual([
      {
        role: "system",
        content: [{ type: "input_text", text: "Be terse." }]
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: "look" },
          { type: "input_image", image_url: "data:image/png;base64,QUJD" }
        ]
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "calling" }]
      },
      {
        type: "function_call",
        id: "call_1",
        call_id: "call_1",
        name: "lookup",
        arguments: '{"q":"x"}'
      },
      {
        type: "function_call_output",
        call_id: "call_1",
        output: '{"ok":true}'
      }
    ]);
  });

  it("formats function tools for Responses", () => {
    expect(
      responseTools([
        {
          name: "lookup",
          description: "Lookup data",
          inputSchema: { type: "object", properties: { q: { type: "string" } } }
        }
      ])
    ).toEqual([
      {
        type: "function",
        name: "lookup",
        description: "Lookup data",
        parameters: { type: "object", properties: { q: { type: "string" } } }
      }
    ]);
  });

  it("extracts text and function tool calls while ignoring hosted web search", () => {
    const output = [
      {
        type: "web_search_call",
        id: "ws_1",
        status: "completed"
      },
      {
        type: "message",
        content: [
          { type: "output_text", text: "hello " },
          { type: "output_text", text: "world" }
        ]
      },
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "lookup",
        arguments: '{"q":"x"}'
      }
    ];
    const build = vi.fn((id: string, name: string, args: unknown) => ({
      id,
      name,
      args:
        typeof args === "string"
          ? (JSON.parse(args) as Record<string, unknown>)
          : {}
    }));

    expect(extractResponsesText(output)).toBe("hello world");
    expect(extractResponsesToolCalls(output, build)).toEqual([
      { id: "call_1", name: "lookup", args: { q: "x" } }
    ]);
  });

  it("streams chunks, usage, response ids, and call ids", async () => {
    const onUsage = vi.fn();
    const onResponseId = vi.fn();
    const build = vi.fn((id: string, name: string, args: unknown) => ({
      id,
      name,
      args:
        typeof args === "string"
          ? (JSON.parse(args) as Record<string, unknown>)
          : {}
    }));
    const stream = makeAsyncIterable([
      { type: "response.created", response: { id: "resp_1" } },
      { type: "response.output_text.delta", delta: "hi" },
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
        type: "response.function_call_arguments.delta",
        item_id: "fc_1",
        delta: '{"q":'
      },
      {
        type: "response.function_call_arguments.done",
        item_id: "fc_1",
        name: "lookup",
        arguments: '{"q":"x"}'
      },
      {
        type: "response.web_search_call.completed",
        item_id: "ws_1",
        output_index: 0,
        sequence_number: 0
      },
      {
        type: "response.completed",
        response: {
          id: "resp_1",
          usage: {
            input_tokens: 10,
            output_tokens: 3,
            input_tokens_details: { cached_tokens: 4 }
          }
        }
      }
    ]);

    const items = await collect(
      streamResponsesEvents(stream, {
        model: "gpt-5",
        buildToolCall: build,
        onUsage,
        onResponseId
      })
    );

    expect(items).toEqual([
      { type: "chunk", content: "hi", done: false },
      { id: "call_1", name: "lookup", args: { q: "x" } },
      { type: "chunk", content: "", done: true }
    ]);
    expect(onResponseId).toHaveBeenCalledWith("resp_1");
    expect(onUsage).toHaveBeenCalledWith("gpt-5", {
      inputTokens: 10,
      outputTokens: 3,
      cachedTokens: 4
    });
  });

  it("returns zero usage when the response has no usage object", () => {
    expect(responseUsage({})).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0
    });
  });
});
