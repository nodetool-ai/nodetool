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
      "ANTHROPIC_API_KEY is not configured"
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

  it("converts system message to assistant role", async () => {
    const result = await provider.convertMessage({
      role: "system",
      content: "You are helpful"
    });
    expect(result).toEqual({ role: "assistant", content: "You are helpful" });
  });

  it("handles system message with non-string content", async () => {
    const result = await provider.convertMessage({
      role: "system",
      content: null
    });
    expect(result).toEqual({ role: "assistant", content: "" });
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
          type: "image",
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
        { type: "image", image: { data: "AQID" } } // base64 raw string
      ]
    });
    expect((result as any).content[0].source.data).toBe("AQID");
  });

  it("converts user image with data as data URI string", async () => {
    const base64 = Buffer.from("test").toString("base64");
    const result = await provider.convertMessage({
      role: "user",
      content: [
        { type: "image", image: { data: `data:image/jpeg;base64,${base64}` } }
      ]
    });
    expect((result as any).content[0].source.data).toBe(base64);
    expect((result as any).content[0].source.media_type).toBe("image/jpeg");
  });

  it("throws for image with no uri or data", async () => {
    await expect(
      provider.convertMessage({
        role: "user",
        content: [{ type: "image", image: {} }]
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
});

describe("AnthropicProvider – prepareJsonSchema via formatTools", () => {
  const provider = new AnthropicProvider(
    { ANTHROPIC_API_KEY: "k" },
    { client: {} as any }
  );

  it("strips unsupported JSON schema keywords", () => {
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

    // unsupported keywords should be removed
    expect(schema.properties.items.items.default).toBeUndefined();
    expect(schema.properties.items.items.minLength).toBeUndefined();
    expect(schema.properties.items.minItems).toBeUndefined();
    expect(schema.properties.items.maxItems).toBeUndefined();
    expect(schema.properties.items.uniqueItems).toBeUndefined();
    expect(schema.definitions.Foo.properties.n.minimum).toBeUndefined();
    expect(schema.$defs.Bar.properties.s.maxLength).toBeUndefined();
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
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: {} as any, fetchFn: fetchFn as any }
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
          type: "image",
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
      content: [{ type: "image", image: { data: new Uint8Array([1, 2, 3]) } }]
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
        { type: "image", image: { uri: "https://example.com/img.jpg" } }
      ]
    });
    expect((result as any).content[0].source.media_type).toBe("image/jpeg");
    expect(fetchFn).toHaveBeenCalledWith("https://example.com/img.jpg");
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
          { type: "image", image: { uri: "https://example.com/missing.jpg" } }
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
});

