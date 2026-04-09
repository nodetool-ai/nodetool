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
            value: { type: "string" },
            nested: {
              type: "object",
              additionalProperties: false,
              properties: { n: { type: "number" } }
            }
          }
        }
      }
    ]);
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
          { type: "image", image: { uri: "https://example.com/a.jpg" } }
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

    expect(fetchFn).toHaveBeenCalledWith("https://example.com/a.jpg");
  });

  it("fetches language models through Anthropic models API", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: "claude-sonnet-4" }, { name: "claude-haiku-4" }, {}]
      })
    });

    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: {} as any, fetchFn: fetchFn as any }
    );

    await expect(provider.getAvailableLanguageModels()).resolves.toEqual([
      { id: "claude-sonnet-4", name: "claude-sonnet-4", provider: "anthropic" },
      { id: "claude-haiku-4", name: "claude-haiku-4", provider: "anthropic" }
    ]);
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

    function makeProvider(fetchFn: any) {
      return new AnthropicProvider(
        { ANTHROPIC_API_KEY: "k" },
        { client: {} as any, fetchFn: fetchFn as any }
      );
    }

    function okResponse(data: unknown[]) {
      return { ok: true, status: 200, json: async () => ({ data }) };
    }

    function errorResponse(status: number) {
      return { ok: false, status, json: async () => ({}) };
    }

    /** Drive the promise forward by advancing fake timers until it resolves. */
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

    it("retries on 429 status and eventually returns empty", async () => {
      const fetchFn = vi.fn().mockResolvedValue(errorResponse(429));
      const provider = makeProvider(fetchFn);

      const result = await runWithTimers(provider.getAvailableLanguageModels());

      expect(result).toEqual([]);
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it("retries on 500 status and eventually returns empty", async () => {
      const fetchFn = vi.fn().mockResolvedValue(errorResponse(500));
      const provider = makeProvider(fetchFn);

      const result = await runWithTimers(provider.getAvailableLanguageModels());

      expect(result).toEqual([]);
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it("retries on 502 status and eventually returns empty", async () => {
      const fetchFn = vi.fn().mockResolvedValue(errorResponse(502));
      const provider = makeProvider(fetchFn);

      const result = await runWithTimers(provider.getAvailableLanguageModels());

      expect(result).toEqual([]);
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it("retries on 503 status and eventually returns empty", async () => {
      const fetchFn = vi.fn().mockResolvedValue(errorResponse(503));
      const provider = makeProvider(fetchFn);

      const result = await runWithTimers(provider.getAvailableLanguageModels());

      expect(result).toEqual([]);
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it("retries on 504 status and eventually returns empty", async () => {
      const fetchFn = vi.fn().mockResolvedValue(errorResponse(504));
      const provider = makeProvider(fetchFn);

      const result = await runWithTimers(provider.getAvailableLanguageModels());

      expect(result).toEqual([]);
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it("does NOT retry on 401 auth error — returns empty immediately", async () => {
      const fetchFn = vi.fn().mockResolvedValue(errorResponse(401));
      const provider = makeProvider(fetchFn);

      const result = await runWithTimers(provider.getAvailableLanguageModels());

      expect(result).toEqual([]);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry on 403 auth error — returns empty immediately", async () => {
      const fetchFn = vi.fn().mockResolvedValue(errorResponse(403));
      const provider = makeProvider(fetchFn);

      const result = await runWithTimers(provider.getAvailableLanguageModels());

      expect(result).toEqual([]);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("retries on AbortError (timeout) and eventually returns empty", async () => {
      const abortError = new DOMException(
        "The operation was aborted",
        "AbortError"
      );
      const fetchFn = vi.fn().mockRejectedValue(abortError);
      const provider = makeProvider(fetchFn);

      const result = await runWithTimers(provider.getAvailableLanguageModels());

      expect(result).toEqual([]);
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it("succeeds on retry after first request fails with 500", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(okResponse([{ id: "claude-sonnet-4" }]));
      const provider = makeProvider(fetchFn);

      const result = await runWithTimers(provider.getAvailableLanguageModels());

      expect(result).toEqual([
        {
          id: "claude-sonnet-4",
          name: "claude-sonnet-4",
          provider: "anthropic"
        }
      ]);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it("retries on network error (fetch throws) and eventually returns empty", async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const provider = makeProvider(fetchFn);

      const result = await runWithTimers(provider.getAvailableLanguageModels());

      expect(result).toEqual([]);
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it("succeeds on retry after network error", async () => {
      const fetchFn = vi
        .fn()
        .mockRejectedValueOnce(new Error("ECONNRESET"))
        .mockResolvedValueOnce(okResponse([{ id: "claude-haiku-4" }]));
      const provider = makeProvider(fetchFn);

      const result = await runWithTimers(provider.getAvailableLanguageModels());

      expect(result).toEqual([
        { id: "claude-haiku-4", name: "claude-haiku-4", provider: "anthropic" }
      ]);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it("returns empty on non-retryable HTTP error (e.g. 404)", async () => {
      const fetchFn = vi.fn().mockResolvedValue(errorResponse(404));
      const provider = makeProvider(fetchFn);

      const result = await runWithTimers(provider.getAvailableLanguageModels());

      expect(result).toEqual([]);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  it("throws on missing api key and invalid tool result payload", async () => {
    expect(() => new AnthropicProvider({}, { client: {} as any })).toThrow(
      "ANTHROPIC_API_KEY is not configured"
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
