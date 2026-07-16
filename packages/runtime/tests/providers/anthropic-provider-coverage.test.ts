/**
 * Additional coverage tests for AnthropicProvider – uncovered branches
 * in message conversion, structured output, and streaming.
 */

import { describe, it, expect, vi } from "vitest";
import { AnthropicProvider } from "../../src/providers/anthropic-provider.js";
import type { Message, ProviderTool } from "../../src/providers/types.js";

function makeAsyncIterable(items: unknown[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    }
  };
}

describe("AnthropicProvider – constructor edge cases", () => {
  it("throws on empty/whitespace API key", () => {
    expect(() => new AnthropicProvider({ ANTHROPIC_API_KEY: "  " })).toThrow(
      "Anthropic authentication is not configured"
    );
  });

  it("uses clientFactory when client not provided", () => {
    const mockClient = { messages: {} } as any;
    const factory = vi.fn().mockReturnValue(mockClient);
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "test-key" },
      { clientFactory: factory }
    );

    const client = provider.getClient();
    expect(factory).toHaveBeenCalledWith("test-key");
    expect(client).toBe(mockClient);
    // second call returns cached
    provider.getClient();
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe("AnthropicProvider – convertMessage branches", () => {
  const provider = new AnthropicProvider(
    { ANTHROPIC_API_KEY: "k" },
    { client: {} as any }
  );

  it("folds a stray system message into a user message", async () => {
    // Anthropic has no `system` role in the messages array; a system message
    // reaching convertMessage is folded into a user message (not assistant).
    const result = await provider.convertMessage({
      role: "system",
      content: "You are helpful"
    });
    expect(result).toEqual({ role: "user", content: "You are helpful" });
  });

  it("handles system message with non-string content", async () => {
    const result = await provider.convertMessage({
      role: "system",
      content: null
    });
    expect(result).toEqual({ role: "user", content: "" });
  });

  it("converts user text message", async () => {
    const result = await provider.convertMessage({
      role: "user",
      content: "hello"
    });
    expect(result).toEqual({ role: "user", content: "hello" });
  });

  it("converts user with multipart text content", async () => {
    const result = await provider.convertMessage({
      role: "user",
      content: [
        { type: "text", text: "first" },
        { type: "text", text: "second" }
      ]
    });
    expect(result).toEqual({
      role: "user",
      content: [
        { type: "text", text: "first" },
        { type: "text", text: "second" }
      ]
    });
  });

  it("converts user image with data URI", async () => {
    const base64 = Buffer.from("imgdata").toString("base64");
    const result = await provider.convertMessage({
      role: "user",
      content: [
        {
          type: "image_url",
          image: { uri: `data:image/png;base64,${base64}` }
        }
      ]
    });
    expect((result as any).content[0].type).toBe("image");
    expect((result as any).content[0].source.type).toBe("base64");
    expect((result as any).content[0].source.media_type).toBe("image/png");
    expect((result as any).content[0].source.data).toBe(base64);
  });

  it("converts user image with raw data string", async () => {
    const result = await provider.convertMessage({
      role: "user",
      content: [
        { type: "image_url", image: { data: "AQID" } } // base64 raw string
      ]
    });
    expect((result as any).content[0].source.data).toBe("AQID");
  });

  it("converts user image with data as data URI string", async () => {
    const base64 = Buffer.from("test").toString("base64");
    const result = await provider.convertMessage({
      role: "user",
      content: [
        { type: "image_url", image: { data: `data:image/jpeg;base64,${base64}` } }
      ]
    });
    expect((result as any).content[0].source.data).toBe(base64);
    expect((result as any).content[0].source.media_type).toBe("image/jpeg");
  });

  it("normalizes the image/jpg alias to image/jpeg", async () => {
    const base64 = Buffer.from("test").toString("base64");
    const result = await provider.convertMessage({
      role: "user",
      content: [
        { type: "image_url", image: { data: base64, mimeType: "image/jpg" } }
      ]
    });
    expect((result as any).content[0].source.media_type).toBe("image/jpeg");
  });

  it("rejects image media types Anthropic does not accept", async () => {
    const base64 = Buffer.from("test").toString("base64");
    await expect(
      provider.convertMessage({
        role: "user",
        content: [
          {
            type: "image_url",
            image: { data: base64, mimeType: "application/octet-stream" }
          }
        ]
      })
    ).rejects.toThrow("does not support image media type");
  });

  it("converts PDF and text document blocks", async () => {
    const result = await provider.convertMessage({
      role: "user",
      content: [
        {
          type: "document",
          document: {
            data: Buffer.from("pdf").toString("base64"),
            mimeType: "application/pdf",
            title: "Report"
          },
          citations: true
        },
        {
          type: "document",
          document: { data: "notes", mimeType: "text/plain" }
        }
      ]
    });
    expect(result).toEqual({
      role: "user",
      content: [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: Buffer.from("pdf").toString("base64")
          },
          title: "Report",
          citations: { enabled: true }
        },
        {
          type: "document",
          source: { type: "text", media_type: "text/plain", data: "notes" }
        }
      ]
    });
  });

  it("strips Content-Type parameters from a fetched image mime", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "image/jpeg; charset=binary" },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
    });
    const p = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { fetchFn: fetchFn as any }
    );
    const result = await p.convertMessage({
      role: "user",
      content: [
        { type: "image_url", image: { uri: "https://example.com/pic" } }
      ]
    });
    expect((result as any).content[0].source.media_type).toBe("image/jpeg");
  });

  it("throws for image with no uri or data", async () => {
    await expect(
      provider.convertMessage({
        role: "user",
        content: [{ type: "image_url", image: {} }]
      })
    ).rejects.toThrow("Invalid image reference");
  });

  it("returns null for assistant with no content and no tool calls", async () => {
    const result = await provider.convertMessage({
      role: "assistant",
      content: null
    });
    expect(result).toBeNull();
  });

  it("handles assistant with string content only", async () => {
    const result = await provider.convertMessage({
      role: "assistant",
      content: "just text"
    });
    expect(result).toEqual({ role: "assistant", content: "just text" });
  });

  it("handles assistant with array content (text parts)", async () => {
    const result = await provider.convertMessage({
      role: "assistant",
      content: [{ type: "text", text: "part1" }]
    });
    expect(result).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "part1" }]
    });
  });

  it("handles assistant with tool calls and array content", async () => {
    const result = await provider.convertMessage({
      role: "assistant",
      content: [{ type: "text", text: "thinking..." }],
      toolCalls: [{ id: "tc1", name: "search", args: { q: "x" } }]
    });
    expect(result).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "thinking..." },
        { type: "tool_use", id: "tc1", name: "search", input: { q: "x" } }
      ]
    });
  });

  it("throws for unknown role", async () => {
    await expect(
      provider.convertMessage({ role: "unknown" as any, content: "x" })
    ).rejects.toThrow("Unknown message role");
  });

  it("throws for unknown content type on assistant", async () => {
    await expect(
      provider.convertMessage({ role: "assistant", content: 42 as any })
    ).rejects.toThrow("Unknown message content type");
  });

  it("converts tool message with string content", async () => {
    const result = await provider.convertMessage({
      role: "tool",
      content: "result text",
      toolCallId: "tc1"
    });
    expect((result as any).content[0].content).toBe("result text");
  });

  it("maps structured tool failures to is_error", async () => {
    const result = await provider.convertMessage({
      role: "tool",
      content: "failed",
      toolCallId: "tc1",
      isError: true
    });
    expect((result as any).content[0].is_error).toBe(true);
  });

  it("converts tool message with text + image content into blocks", async () => {
    const base64 = Buffer.from("png-bytes").toString("base64");
    const result = await provider.convertMessage({
      role: "tool",
      toolCallId: "tc-img",
      content: [
        { type: "text", text: "Rendered viewport:" },
        { type: "image_url", image: { data: base64, mimeType: "image/png" } }
      ]
    });
    const toolResult = (result as any).content[0];
    expect(toolResult.type).toBe("tool_result");
    expect(toolResult.tool_use_id).toBe("tc-img");
    expect(toolResult.content).toEqual([
      { type: "text", text: "Rendered viewport:" },
      {
        type: "image",
        source: { type: "base64", media_type: "image/png", data: base64 }
      }
    ]);
  });

  it("stringifies tool message array content with no convertible blocks", async () => {
    const result = await provider.convertMessage({
      role: "tool",
      toolCallId: "tc-empty",
      content: [{ type: "audio", audio: { uri: "x" } }] as any
    });
    expect((result as any).content[0].content).toBe(
      JSON.stringify([{ type: "audio", audio: { uri: "x" } }])
    );
  });
});

describe("AnthropicProvider – prepareJsonSchema via formatTools", () => {
  const provider = new AnthropicProvider(
    { ANTHROPIC_API_KEY: "k" },
    { client: {} as any }
  );

  it("preserves JSON schema validation keywords", () => {
    const tools: ProviderTool[] = [
      {
        name: "tool",
        inputSchema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: { type: "string", default: "x", minLength: 1 },
              minItems: 1,
              maxItems: 10,
              uniqueItems: true
            }
          },
          definitions: {
            Foo: {
              type: "object",
              properties: { n: { type: "number", minimum: 0, maximum: 100 } }
            }
          },
          $defs: {
            Bar: {
              type: "object",
              properties: { s: { type: "string", maxLength: 50 } }
            }
          }
        }
      }
    ];

    const formatted = provider.formatTools(tools);
    const schema = formatted[0].input_schema as any;

    expect(schema.properties.items.items.default).toBe("x");
    expect(schema.properties.items.items.minLength).toBe(1);
    expect(schema.properties.items.minItems).toBe(1);
    expect(schema.properties.items.maxItems).toBe(10);
    expect(schema.properties.items.uniqueItems).toBe(true);
    expect(schema.definitions.Foo.properties.n.minimum).toBe(0);
    expect(schema.definitions.Foo.properties.n.maximum).toBe(100);
    expect(schema.$defs.Bar.properties.s.maxLength).toBe(50);
    // additionalProperties should be added to object types
    expect(schema.additionalProperties).toBe(false);
    expect(schema.definitions.Foo.additionalProperties).toBe(false);
    expect(schema.$defs.Bar.additionalProperties).toBe(false);
  });

  it("handles missing inputSchema with default", () => {
    const tools: ProviderTool[] = [{ name: "tool" }];
    const formatted = provider.formatTools(tools);
    // should use default schema
    expect(formatted[0].input_schema).toEqual({
      type: "object",
      additionalProperties: false,
      properties: {}
    });
  });

  it("maps Anthropic tool metadata", () => {
    const [formatted] = provider.formatTools([
      {
        name: "lookup",
        inputExamples: [{ id: "42" }],
        cacheControl: { type: "ephemeral", ttl: "1h" },
        strict: true,
        deferLoading: true,
        allowedCallers: ["direct"]
      }
    ]);
    expect(formatted).toMatchObject({
      input_examples: [{ id: "42" }],
      cache_control: { type: "ephemeral", ttl: "1h" },
      strict: true,
      defer_loading: true,
      allowed_callers: ["direct"]
    });
  });
});


describe("AnthropicProvider – extractSystemMessage", () => {
  it("uses default when no system message", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }]
    });

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create } } as any }
    );

    await provider.generateMessage({
      model: "claude-sonnet",
      messages: [{ role: "user", content: "hi" }]
    });

    expect(create.mock.calls[0][0].system).toBe("You are a helpful assistant.");
  });

  it("extracts system from array content", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }]
    });

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create } } as any }
    );

    await provider.generateMessage({
      model: "claude-sonnet",
      messages: [
        {
          role: "system",
          content: [
            { type: "text", text: "part1" },
            { type: "text", text: "part2" }
          ]
        },
        { role: "user", content: "hi" }
      ]
    });

    expect(create.mock.calls[0][0].system).toBe("part1 part2");
  });
});

describe("AnthropicProvider – streaming thinking chunks", () => {
  it("emits thinking chunks", async () => {
    const stream = vi
      .fn()
      .mockReturnValue(
        makeAsyncIterable([
          { type: "content_block_delta", delta: { thinking: "hmm..." } },
          { type: "content_block_delta", delta: { text: "answer" } },
          { type: "message_stop" }
        ])
      );

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create: stream } } as any }
    );

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "claude-sonnet",
      messages: [{ role: "user", content: "think about this" }]
    })) {
      out.push(item);
    }

    expect(out[0]).toEqual({
      type: "chunk",
      content: "hmm...",
      done: false,
      thinking: true
    });
    expect(out[1]).toEqual({
      type: "chunk",
      content: "answer",
      done: false
    });
  });

});


describe("AnthropicProvider – getAvailableLanguageModels edge cases", () => {
  it("returns empty on non-OK response", async () => {
    const list = vi.fn().mockRejectedValue({ status: 404 });
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { models: { list } } as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([]);
  });
});

describe("AnthropicProvider – asHttpStatusError", () => {
  it("wraps error as Error", () => {
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: {} as any }
    );
    const err = provider.asHttpStatusError("some error");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("some error");
  });
});

describe("AnthropicProvider – parseDataUri non-base64 path", () => {
  it("converts user image with non-base64 data URI", async () => {
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: {} as any }
    );

    const result = await provider.convertMessage({
      role: "user",
      content: [
        {
          type: "image_url",
          image: { uri: "data:image/png,hello%20world" }
        }
      ]
    });
    expect((result as any).content[0].type).toBe("image");
    expect((result as any).content[0].source.type).toBe("base64");
  });
});

describe("AnthropicProvider – bytesToBase64 with Uint8Array", () => {
  it("converts user image with Uint8Array data", async () => {
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: {} as any }
    );

    const result = await provider.convertMessage({
      role: "user",
      content: [{ type: "image_url", image: { data: new Uint8Array([1, 2, 3]) } }]
    });
    expect((result as any).content[0].source.data).toBeTruthy();
  });
});

describe("AnthropicProvider – image fetch from remote URI", () => {
  it("fetches image from HTTP URI", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => Uint8Array.from([1, 2]).buffer
    });

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: {} as any, fetchFn: fetchFn as any }
    );

    const result = await provider.convertMessage({
      role: "user",
      content: [
        { type: "image_url", image: { uri: "https://example.com/img.jpg" } }
      ]
    });
    expect((result as any).content[0].source.media_type).toBe("image/jpeg");
    expect(fetchFn).toHaveBeenCalledWith("https://example.com/img.jpg", {
      redirect: "manual"
    });
  });

  it("throws when fetch fails", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: {} as any, fetchFn: fetchFn as any }
    );

    await expect(
      provider.convertMessage({
        role: "user",
        content: [
          { type: "image_url", image: { uri: "https://example.com/missing.jpg" } }
        ]
      })
    ).rejects.toThrow("Failed to fetch URI");
  });
});

describe("AnthropicProvider – extractSystemMessage non-string non-array content", () => {
  it("falls back to String() for non-string non-array system content", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }]
    });

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create } } as any }
    );

    await provider.generateMessage({
      model: "claude-sonnet",
      messages: [
        { role: "system", content: 42 as any },
        { role: "user", content: "hi" }
      ]
    });

    expect(create.mock.calls[0][0].system).toBe("42");
  });

  it("uses default for system with null content", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }]
    });

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create } } as any }
    );

    await provider.generateMessage({
      model: "claude-sonnet",
      messages: [
        { role: "system", content: null },
        { role: "user", content: "hi" }
      ]
    });

    expect(create.mock.calls[0][0].system).toBe("You are a helpful assistant.");
  });
});

describe("AnthropicProvider – extended thinking (T-RT-5)", () => {
  it("replays signed thinking blocks before tool use", async () => {
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create: vi.fn() } } as any }
    );
    const converted = await provider.convertMessage({
      role: "assistant",
      content: null,
      toolCalls: [{ id: "call", name: "lookup", args: {} }],
      _anthropicThinkingBlocks: [
        { type: "thinking", thinking: "reason", signature: "signed" }
      ]
    });
    expect(converted?.content).toEqual([
      { type: "thinking", thinking: "reason", signature: "signed" },
      { type: "tool_use", id: "call", name: "lookup", input: {} }
    ]);
  });

  it("captures streamed thinking signatures on tool calls", async () => {
    const create = vi.fn().mockReturnValue(
      makeAsyncIterable([
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "thinking", thinking: "", signature: "" }
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { thinking: "reason" }
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { signature: "signed" }
        },
        { type: "content_block_stop", index: 0 },
        {
          type: "content_block_start",
          index: 1,
          content_block: { type: "tool_use", id: "call", name: "lookup" }
        },
        {
          type: "content_block_delta",
          index: 1,
          delta: { partial_json: "{}" }
        },
        { type: "content_block_stop", index: 1 },
        { type: "message_stop" }
      ])
    );
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create } } as any }
    );
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "claude-sonnet",
      messages: [{ role: "user", content: "think" }],
      thinkingBudget: 2048
    })) {
      items.push(item);
    }
    expect(items).toContainEqual(
      expect.objectContaining({
        id: "call",
        _anthropicThinkingBlocks: [
          { type: "thinking", thinking: "reason", signature: "signed" }
        ]
      })
    );
  });

  it("includes thinking config in streaming request when thinkingBudget is set", async () => {
    const stream = vi.fn().mockReturnValue(
      makeAsyncIterable([
        {
          type: "content_block_delta",
          delta: { thinking: "let me think..." }
        },
        { type: "content_block_delta", delta: { text: "answer" } },
        { type: "message_stop" }
      ])
    );

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create: stream } } as any }
    );

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "think hard" }],
      thinkingBudget: 5000
    })) {
      out.push(item);
    }

    // Verify the request included the thinking config
    const requestBody = stream.mock.calls[0][0];
    expect(requestBody.thinking).toEqual({
      type: "enabled",
      budget_tokens: 5000
    });
    expect(requestBody.max_tokens).toBe(8192);
    expect(requestBody.temperature).toBeUndefined();
    expect(requestBody.top_p).toBeUndefined();

    // Verify thinking chunks are emitted
    expect(out[0]).toEqual({
      type: "chunk",
      content: "let me think...",
      done: false,
      thinking: true
    });
  });

  it("does not include thinking config when thinkingBudget is not set", async () => {
    const stream = vi
      .fn()
      .mockReturnValue(
        makeAsyncIterable([
          { type: "content_block_delta", delta: { text: "answer" } },
          { type: "message_stop" }
        ])
      );

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create: stream } } as any }
    );

    for await (const _item of provider.generateMessages({
      model: "claude-sonnet",
      messages: [{ role: "user", content: "hi" }]
    })) {
      // drain
    }

    const requestBody = stream.mock.calls[0][0];
    expect(requestBody.thinking).toBeUndefined();
  });

  it("includes thinking config in non-streaming request when thinkingBudget is set", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "thought about it" }]
    });

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create } } as any }
    );

    await provider.generateMessage({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "think" }],
      thinkingBudget: 10000
    });

    const requestBody = create.mock.calls[0][0];
    expect(requestBody.thinking).toEqual({
      type: "enabled",
      budget_tokens: 10000
    });
    expect(requestBody.max_tokens).toBe(10001);
  });

  it("does not include thinking config in non-streaming when not set", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }]
    });

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create } } as any }
    );

    await provider.generateMessage({
      model: "claude-sonnet",
      messages: [{ role: "user", content: "hi" }]
    });

    const requestBody = create.mock.calls[0][0];
    expect(requestBody.thinking).toBeUndefined();
  });

  it("maps adaptive thinking display and effort", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }]
    });
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create } } as any }
    );

    await provider.generateMessage({
      model: "claude-sonnet-5",
      messages: [{ role: "user", content: "think" }],
      thinking: { type: "adaptive", display: "omitted" },
      effort: "high",
      temperature: 0.2,
      topP: 0.8
    });

    expect(create.mock.calls[0][0]).toMatchObject({
      thinking: { type: "adaptive", display: "omitted" },
      output_config: { effort: "high" }
    });
    expect(create.mock.calls[0][0].temperature).toBeUndefined();
    expect(create.mock.calls[0][0].top_p).toBeUndefined();
  });

  it("rejects manual thinking on adaptive-only models", async () => {
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create: vi.fn() } } as any }
    );
    await expect(
      provider.generateMessage({
        model: "claude-sonnet-5",
        messages: [{ role: "user", content: "think" }],
        thinking: { type: "manual", budgetTokens: 2048 }
      })
    ).rejects.toThrow("requires adaptive thinking");
  });

  it("joins multiple system messages without dropping one", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }]
    });
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create } } as any }
    );
    await provider.generateMessage({
      model: "claude-sonnet",
      messages: [
        { role: "system", content: "first" },
        { role: "system", content: "second" },
        { role: "user", content: "hello" }
      ]
    });
    expect(create.mock.calls[0][0].system).toBe("first\n\nsecond");
  });

  it("allows deprecated manual thinking on Opus 4.6", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }]
    });
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create } } as any }
    );
    await provider.generateMessage({
      model: "claude-opus-4-6",
      messages: [{ role: "user", content: "think" }],
      thinking: { type: "manual", budgetTokens: 2048 }
    });
    expect(create.mock.calls[0][0].thinking).toEqual({
      type: "enabled",
      budget_tokens: 2048
    });
  });

  it("rejects forced tool choice when model-default thinking is active", async () => {
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create: vi.fn() } } as any }
    );
    await expect(
      provider.generateMessage({
        model: "claude-sonnet-5",
        messages: [{ role: "user", content: "search" }],
        tools: [{ name: "lookup" }],
        toolChoice: "any"
      })
    ).rejects.toThrow("forced tool choice");
  });

  it("rejects disabling thinking on always-thinking models", async () => {
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create: vi.fn() } } as any }
    );
    await expect(
      provider.generateMessage({
        model: "claude-fable-5",
        messages: [{ role: "user", content: "hello" }],
        thinking: { type: "disabled" }
      })
    ).rejects.toThrow("does not allow thinking to be disabled");
  });

  it("preserves non-streaming citation metadata", async () => {
    const citation = {
      type: "page_location",
      cited_text: "source text",
      document_index: 0,
      document_title: "Report",
      file_id: null,
      start_page_number: 2,
      end_page_number: 3
    };
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "answer", citations: [citation] }]
    });
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create } } as any }
    );
    const message = await provider.generateMessage({
      model: "claude-sonnet",
      messages: [{ role: "user", content: "question" }]
    });
    expect(message.content).toEqual([
      {
        type: "text",
        text: "answer",
        citations: [
          {
            type: "page_location",
            citedText: "source text",
            documentIndex: 0,
            documentTitle: "Report",
            fileId: null,
            startPageNumber: 2,
            endPageNumber: 3
          }
        ]
      }
    ]);
  });

  it("emits a finalized structured message for streaming citations", async () => {
    const stream = vi.fn().mockReturnValue(
      makeAsyncIterable([
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "", citations: [] }
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "answer" }
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "citations_delta",
            citation: {
              type: "web_search_result_location",
              cited_text: "source",
              encrypted_index: "enc",
              url: "https://example.com",
              title: "Example"
            }
          }
        }
      ])
    );
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create: stream } } as any }
    );
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "claude-sonnet",
      messages: [{ role: "user", content: "question" }]
    })) {
      items.push(item);
    }
    expect(items).toContainEqual({
      type: "message",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "answer",
            citations: [
              {
                type: "web_search_result_location",
                citedText: "source",
                encryptedIndex: "enc",
                url: "https://example.com",
                title: "Example"
              }
            ]
          }
        ]
      }
    });
  });

  it("rejects oversized inline images and mismatched document data URIs", async () => {
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: {} as any }
    );
    await expect(
      provider.convertMessage({
        role: "user",
        content: [
          {
            type: "image_url",
            image: {
              data: Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64"),
              mimeType: "image/png"
            }
          }
        ]
      })
    ).rejects.toThrow("exceeds the 5 MB limit");
    await expect(
      provider.convertMessage({
        role: "user",
        content: [
          {
            type: "document",
            document: {
              data: "data:text/plain;base64,dGV4dA==",
              mimeType: "application/pdf"
            }
          }
        ]
      })
    ).rejects.toThrow("MIME mismatch");
  });

  it("preserves later server-tool blocks on earlier client tool calls", async () => {
    const create = vi.fn().mockReturnValue(
      makeAsyncIterable([
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "call", name: "lookup", input: {} }
        },
        { type: "content_block_stop", index: 0 },
        {
          type: "content_block_start",
          index: 1,
          content_block: { type: "server_tool_use", id: "server", name: "web_search", input: {} }
        },
        {
          type: "content_block_start",
          index: 2,
          content_block: { type: "web_search_tool_result", tool_use_id: "server", content: [] }
        }
      ])
    );
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create } } as any }
    );
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "claude-sonnet",
      messages: [{ role: "user", content: "search" }]
    })) {
      items.push(item);
    }
    const toolCall = items.find(
      (item): item is { id: string; _anthropicContentBlocks: unknown[] } =>
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        item.id === "call" &&
        "_anthropicContentBlocks" in item &&
        Array.isArray(item._anthropicContentBlocks)
    );
    expect(toolCall?._anthropicContentBlocks).toHaveLength(3);
    expect(toolCall?._anthropicContentBlocks[2]).toMatchObject({
      type: "web_search_tool_result"
    });
  });
});
