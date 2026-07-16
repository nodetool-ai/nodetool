import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

describe("AnthropicProvider", () => {
  it("reports tool support and required env", async () => {
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: {} as any }
    );

    expect(AnthropicProvider.requiredSecrets()).toEqual(["ANTHROPIC_API_KEY"]);
    expect(provider.getContainerEnv()).toEqual({ ANTHROPIC_API_KEY: "k" });
    expect(await provider.hasToolSupport("claude-sonnet")).toBe(true);
  });

  it("formats tools with Anthropic schema preparation", () => {
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: {} as any }
    );

    const tools: ProviderTool[] = [
      {
        name: "extract",
        description: "Extract fields",
        inputSchema: {
          type: "object",
          properties: {
            value: { type: "string", minLength: 2 },
            nested: {
              type: "object",
              properties: { n: { type: "number", minimum: 0 } }
            }
          }
        }
      }
    ];

    expect(provider.formatTools(tools)).toEqual([
      {
        name: "extract",
        description: "Extract fields",
        input_schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            value: { type: "string", minLength: 2 },
            nested: {
              type: "object",
              additionalProperties: false,
              properties: { n: { type: "number", minimum: 0 } }
            }
          }
        }
      }
    ]);
  });

  it("renders the web_search tool as Anthropic's native server tool", () => {
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.supportsNativeWebSearch).toBe(true);

    const tools: ProviderTool[] = [
      { name: "web_search", description: "Search the web", inputSchema: { type: "object", properties: {} } },
      { name: "extract", description: "Extract", inputSchema: { type: "object", properties: {} } }
    ];
    const formatted = provider.formatTools(tools);
    expect(formatted[0]).toEqual({
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 5
    });
    // Other tools are still normal function tools.
    expect(formatted[1].name).toBe("extract");
    expect(formatted[1].input_schema).toBeDefined();
  });

  it("converts tool and assistant messages", async () => {
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: {} as any }
    );

    await expect(
      provider.convertMessage({
        role: "tool",
        toolCallId: "tool_1",
        content: { ok: true }
      })
    ).resolves.toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tool_1",
          content: '{"ok":true}'
        }
      ]
    });

    await expect(
      provider.convertMessage({
        role: "assistant",
        content: "Working on it",
        toolCalls: [{ id: "tc1", name: "search", args: { q: "x" } }]
      })
    ).resolves.toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "Working on it" },
        { type: "tool_use", id: "tc1", name: "search", input: { q: "x" } }
      ]
    });
  });

  it("converts user image URI into base64 image block", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
    });

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: {} as any, fetchFn: fetchFn as any }
    );

    await expect(
      provider.convertMessage({
        role: "user",
        content: [
          { type: "image_url", image: { uri: "https://example.com/a.jpg" } }
        ]
      })
    ).resolves.toEqual({
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: "AQID"
          }
        }
      ]
    });

    expect(fetchFn).toHaveBeenCalledWith("https://example.com/a.jpg", {
      redirect: "manual"
    });
  });

  it("fetches language models through Anthropic models API", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ id: "claude-sonnet-4", display_name: "Claude Sonnet 4" }],
        has_more: true,
        last_id: "claude-sonnet-4"
      })
      .mockResolvedValueOnce({
        data: [{ id: "claude-haiku-4", display_name: "Claude Haiku 4" }],
        has_more: false,
        last_id: "claude-haiku-4"
      });

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { models: { list } } as any }
    );

    await expect(provider.getAvailableLanguageModels()).resolves.toEqual([
      { id: "claude-sonnet-4", name: "Claude Sonnet 4", provider: "anthropic" },
      { id: "claude-haiku-4", name: "Claude Haiku 4", provider: "anthropic" }
    ]);
    expect(list).toHaveBeenNthCalledWith(
      2,
      { limit: 1000, after_id: "claude-sonnet-4" },
      { timeout: 10_000, maxRetries: 0 }
    );
  });

  it("forwards the abort signal to messages.create (non-streaming)", async () => {
    // Regression: the Anthropic provider dropped args.signal, so a request
    // could not be cancelled and kept billing after an abort.
    const create = vi.fn().mockResolvedValueOnce({
      content: [{ type: "text", text: "ok" }]
    });
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: { messages: { create } } as any }
    );
    const controller = new AbortController();
    await provider.generateMessage({
      model: "claude-sonnet",
      messages: [{ role: "user", content: "hi" }],
      signal: controller.signal
    } as any);
    expect(create.mock.calls[0][1]).toMatchObject({
      signal: controller.signal
    });
  });

  it("generates non-streaming messages with tool calls", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [
          { type: "text", text: "before tool" },
          { type: "tool_use", id: "tc1", name: "sum", input: { a: 1 } }
        ]
      });

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      {
        client: {
          messages: { create }
        } as any
      }
    );

    await expect(
      provider.generateMessage({
        model: "claude-sonnet",
        messages: [{ role: "user", content: "hi" }]
      })
    ).resolves.toEqual({
      role: "assistant",
      content: "before tool",
      toolCalls: [{ id: "tc1", name: "sum", args: { a: 1 } }]
    });
  });

  it("streams text/tool calls", async () => {
    const stream = vi
      .fn()
      .mockReturnValueOnce(
        makeAsyncIterable([
          { type: "content_block_delta", delta: { text: "Hel" } },
          { type: "content_block_delta", delta: { text: "lo" } },
          {
            type: "content_block_start",
            index: 1,
            content_block: {
              type: "tool_use",
              id: "tc1",
              name: "lookup"
            }
          },
          {
            type: "content_block_delta",
            index: 1,
            delta: { partial_json: '{"q":"x"}' }
          },
          { type: "content_block_stop", index: 1 },
          { type: "message_stop" }
        ])
      );

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      {
        client: {
          messages: { create: stream }
        } as any
      }
    );

    const out1: Array<unknown> = [];
    for await (const item of provider.generateMessages({
      model: "claude-sonnet",
      messages: [{ role: "user", content: "hi" }]
    })) {
      out1.push(item);
    }

    expect(out1).toEqual([
      { type: "chunk", content: "Hel", done: false },
      { type: "chunk", content: "lo", done: false },
      { id: "tc1", name: "lookup", args: { q: "x" } },
      { type: "chunk", content: "", done: true }
    ]);
  });

  it("detects context-length errors", () => {
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: {} as any }
    );

    expect(
      provider.isContextLengthError(new Error("maximum context exceeded"))
    ).toBe(true);
    expect(
      provider.isContextLengthError(new Error("context window too long"))
    ).toBe(true);
    expect(provider.isContextLengthError(new Error("network timeout"))).toBe(
      false
    );
  });

  describe("getAvailableLanguageModels retry logic", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function makeProvider(list: ReturnType<typeof vi.fn>) {
      return new AnthropicProvider(
        { ANTHROPIC_API_KEY: "k" },
        { client: { models: { list } } as any }
      );
    }

    async function runWithTimers<T>(promise: Promise<T>): Promise<T> {
      let result: T | undefined;
      let done = false;
      promise.then((r) => {
        result = r;
        done = true;
      });
      while (!done) {
        await vi.advanceTimersByTimeAsync(5000);
      }
      return result as T;
    }

    it("retries 529 responses using Retry-After", async () => {
      const overloaded = {
        status: 529,
        headers: new Headers({ "retry-after": "2" })
      };
      const list = vi
        .fn()
        .mockRejectedValueOnce(overloaded)
        .mockResolvedValueOnce({
          data: [{ id: "claude-sonnet-4", display_name: "Claude Sonnet 4" }],
          has_more: false,
          last_id: "claude-sonnet-4"
        });

      const result = await runWithTimers(
        makeProvider(list).getAvailableLanguageModels()
      );

      expect(result[0]?.name).toBe("Claude Sonnet 4");
      expect(list).toHaveBeenCalledTimes(2);
    });

    it("stops after three retryable failures", async () => {
      const list = vi.fn().mockRejectedValue({ status: 503 });
      const result = await runWithTimers(
        makeProvider(list).getAvailableLanguageModels()
      );
      expect(result).toEqual([]);
      expect(list).toHaveBeenCalledTimes(3);
    });

    it("does not retry authentication failures", async () => {
      const list = vi.fn().mockRejectedValue({ status: 401 });
      expect(await makeProvider(list).getAvailableLanguageModels()).toEqual([]);
      expect(list).toHaveBeenCalledTimes(1);
    });

    it("retries network failures", async () => {
      const list = vi
        .fn()
        .mockRejectedValueOnce(new Error("ECONNRESET"))
        .mockResolvedValueOnce({ data: [], has_more: false, last_id: null });
      await runWithTimers(makeProvider(list).getAvailableLanguageModels());
      expect(list).toHaveBeenCalledTimes(2);
    });
  });

  it("throws on missing api key and invalid tool result payload", async () => {
    expect(() => new AnthropicProvider({}, { client: {} as any })).toThrow(
      "Anthropic authentication is not configured"
    );

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: {} as any }
    );

    const msg: Message = { role: "tool", content: "x" };
    await expect(provider.convertMessage(msg)).rejects.toThrow(
      "Tool call ID must not be None"
    );
  });
});
