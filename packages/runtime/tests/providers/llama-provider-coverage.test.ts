/**
 * Additional coverage tests for LlamaProvider – parseKeywordArgs,
 * normalizeMessagesForLlama, edge cases.
 */

import { describe, it, expect, vi } from "vitest";
import { LlamaProvider } from "../../src/providers/llama-provider.js";
import type { Message } from "../../src/providers/types.js";

function makeAsyncIterable(items: unknown[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
    async close() {
      return;
    }
  };
}

describe("LlamaProvider – message normalization for strict alternation", () => {
  it("inserts empty messages to maintain user/assistant alternation", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "ok" } }]
    });

    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://localhost:8080" },
      { client: { chat: { completions: { create } } } as any }
    );

    // Two consecutive user messages should get an empty assistant between them
    await provider.generateMessage({
      model: "test",
      messages: [
        { role: "user", content: "first" },
        { role: "user", content: "second" }
      ]
    });

    const sentMessages = create.mock.calls[0][0].messages;
    // Should have system-injected padding for alternation
    // user -> assistant (empty) -> user
    const roles = sentMessages.map((m: any) => m.role);
    // Verify alternation is maintained
    for (let i = 1; i < roles.length; i++) {
      if (roles[i - 1] !== "system") {
        expect(roles[i]).not.toBe(roles[i - 1]);
      }
    }
  });

  it("converts system messages into a merged system message", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "ok" } }]
    });

    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://localhost:8080" },
      { client: { chat: { completions: { create } } } as any }
    );

    await provider.generateMessage({
      model: "test",
      messages: [
        { role: "system", content: "Be concise." },
        { role: "system", content: "Be helpful." },
        { role: "user", content: "hi" }
      ]
    });

    const sentMessages = create.mock.calls[0][0].messages;
    const systemMsg = sentMessages.find((m: any) => m.role === "system");
    expect(systemMsg.content).toContain("Be concise.");
    expect(systemMsg.content).toContain("Be helpful.");
  });

  it("converts tool messages to user messages", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "ok" } }]
    });

    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://localhost:8080" },
      { client: { chat: { completions: { create } } } as any }
    );

    await provider.generateMessage({
      model: "test",
      messages: [
        { role: "user", content: "calc" },
        {
          role: "assistant",
          content: "calling tool",
          toolCalls: [{ id: "tc1", name: "calc", args: {} }]
        },
        { role: "tool", content: { result: 42 }, toolCallId: "tc1" }
      ]
    });

    const sentMessages = create.mock.calls[0][0].messages;
    const toolResult = sentMessages.find((m: any) =>
      (m.content || "").includes("Tool result:")
    );
    expect(toolResult).toBeDefined();
    expect(toolResult.role).toBe("user");
  });
});

describe("LlamaProvider – convertMessage system message", () => {
  it("converts system role message", async () => {
    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://localhost:8080" },
      { client: {} as any }
    );

    const result = await provider.convertMessage({
      role: "system",
      content: "Be helpful"
    });
    expect(result).toEqual({ role: "system", content: "Be helpful" });
  });

  it("handles system message with array content", async () => {
    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://localhost:8080" },
      { client: {} as any }
    );

    const result = await provider.convertMessage({
      role: "system",
      content: [{ type: "text", text: "part1" }]
    });
    expect(result).toEqual({ role: "system", content: "part1" });
  });
});

describe("LlamaProvider – formatTools", () => {
  it("formats tools in OpenAI function format", () => {
    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://localhost:8080" },
      { client: {} as any }
    );

    const result = provider.formatTools([
      {
        name: "search",
        description: "Search the web",
        inputSchema: { type: "object", properties: { q: { type: "string" } } }
      }
    ]);

    expect(result).toEqual([
      {
        type: "function",
        function: {
          name: "search",
          description: "Search the web",
          parameters: { type: "object", properties: { q: { type: "string" } } }
        }
      }
    ]);
  });
});


describe("LlamaProvider – generateMessages with native tool_calls in stream", () => {
  it("yields tool calls from stream", async () => {
    const stream = makeAsyncIterable([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "tc1",
                  function: { name: "search", arguments: '{"q":"x"}' }
                }
              ]
            },
            finish_reason: null
          }
        ]
      },
      {
        choices: [{ delta: {}, finish_reason: "tool_calls" }]
      }
    ]);

    const create = vi.fn().mockResolvedValue(stream);
    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://localhost:8080" },
      { client: { chat: { completions: { create } } } as any }
    );

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "test",
      messages: [{ role: "user", content: "search" }]
    })) {
      out.push(item);
    }

    expect(out).toEqual([{ id: "tc1", name: "search", args: { q: "x" } }]);
  });

});

describe("LlamaProvider – generateMessage with native tool calls", () => {
  it("uses native tool calls when available", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              {
                id: "tc1",
                function: { name: "calc", arguments: '{"expr":"1+1"}' }
              }
            ]
          }
        }
      ]
    });

    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://localhost:8080" },
      { client: { chat: { completions: { create } } } as any }
    );

    const result = await provider.generateMessage({
      model: "test",
      messages: [{ role: "user", content: "calc" }],
      tools: [{ name: "calc" }]
    });

    expect(result.toolCalls).toEqual([
      { id: "tc1", name: "calc", args: { expr: "1+1" } }
    ]);
  });
});

describe("LlamaProvider – getAvailableLanguageModels fallback", () => {
  it("uses models key as fallback", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ id: "model1" }] })
    });

    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://localhost:8080" },
      { client: {} as any, fetchFn: fetchFn as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "model1", name: "model1", provider: "llama_cpp" }
    ]);
  });

  it("returns empty on failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false });

    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://localhost:8080" },
      { client: {} as any, fetchFn: fetchFn as any }
    );

    expect(await provider.getAvailableLanguageModels()).toEqual([]);
  });
});

describe("LlamaProvider – emulated tool calls in streaming (hasToolSupport=false)", () => {
  it("parses emulated tool calls on stop when tools are provided", async () => {
    const stream = makeAsyncIterable([
      {
        choices: [
          {
            delta: { content: 'search(q="test")' },
            finish_reason: null
          }
        ]
      },
      {
        choices: [{ delta: { content: "" }, finish_reason: "stop" }]
      }
    ]);

    const create = vi.fn().mockResolvedValue(stream);
    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://localhost:8080" },
      { client: { chat: { completions: { create } } } as any }
    );

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "test",
      messages: [{ role: "user", content: "search for test" }],
      tools: [
        {
          name: "search",
          description: "Search",
          inputSchema: { type: "object" }
        }
      ]
    })) {
      out.push(item);
    }

    // Should have both chunk outputs and the emulated tool call
    const toolCalls = out.filter((o: any) => o.name === "search");
    expect(toolCalls.length).toBe(1);
  });
});

describe("LlamaProvider – emulated tool calls in generateMessage (non-streaming)", () => {
  it("parses emulated tool calls when no native tool_calls", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: { content: 'search(q="test")' }
        }
      ]
    });

    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://localhost:8080" },
      { client: { chat: { completions: { create } } } as any }
    );

    const result = await provider.generateMessage({
      model: "test",
      messages: [{ role: "user", content: "search" }],
      tools: [{ name: "search", description: "Search" }]
    });

    expect(result.toolCalls).toBeDefined();
    expect(result.toolCalls!.length).toBe(1);
    expect(result.toolCalls![0].name).toBe("search");
  });
});

describe("LlamaProvider – parseKeywordArgs edge cases", () => {
  it("parses JSON objects and arrays in arguments", async () => {
    const stream = makeAsyncIterable([
      {
        choices: [
          {
            delta: { content: 'calc(data={"x":1}, items=[1,2])' },
            finish_reason: null
          }
        ]
      },
      {
        choices: [{ delta: { content: "" }, finish_reason: "stop" }]
      }
    ]);

    const create = vi.fn().mockResolvedValue(stream);
    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://localhost:8080" },
      { client: { chat: { completions: { create } } } as any }
    );

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "test",
      messages: [{ role: "user", content: "calc" }],
      tools: [{ name: "calc" }]
    })) {
      out.push(item);
    }

    const tc = out.find((o: any) => o.name === "calc") as any;
    expect(tc).toBeDefined();
    expect(tc.args.data).toEqual({ x: 1 });
    expect(tc.args.items).toEqual([1, 2]);
  });

  it("parses quoted strings, booleans, nulls, numbers", async () => {
    const stream = makeAsyncIterable([
      {
        choices: [
          {
            delta: {
              content: 'fn(a="hello", b=true, c=false, d=null, e=42.5, f=plain)'
            },
            finish_reason: null
          }
        ]
      },
      {
        choices: [{ delta: { content: "" }, finish_reason: "stop" }]
      }
    ]);

    const create = vi.fn().mockResolvedValue(stream);
    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://localhost:8080" },
      { client: { chat: { completions: { create } } } as any }
    );

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "test",
      messages: [{ role: "user", content: "fn" }],
      tools: [{ name: "fn" }]
    })) {
      out.push(item);
    }

    const tc = out.find((o: any) => o.name === "fn") as any;
    expect(tc.args.a).toBe("hello");
    expect(tc.args.b).toBe(true);
    expect(tc.args.c).toBe(false);
    expect(tc.args.d).toBeNull();
    expect(tc.args.e).toBe(42.5);
    expect(tc.args.f).toBe("plain");
  });

  it("handles single-quoted strings", async () => {
    const stream = makeAsyncIterable([
      {
        choices: [
          {
            delta: { content: "fn(a='hello')" },
            finish_reason: null
          }
        ]
      },
      {
        choices: [{ delta: { content: "" }, finish_reason: "stop" }]
      }
    ]);

    const create = vi.fn().mockResolvedValue(stream);
    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://localhost:8080" },
      { client: { chat: { completions: { create } } } as any }
    );

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "test",
      messages: [{ role: "user", content: "fn" }],
      tools: [{ name: "fn" }]
    })) {
      out.push(item);
    }

    const tc = out.find((o: any) => o.name === "fn") as any;
    expect(tc.args.a).toBe("hello");
  });
});


describe("LlamaProvider – isContextLengthError", () => {
  it("detects context length errors", () => {
    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://localhost:8080" },
      { client: {} as any }
    );
    expect(provider.isContextLengthError("context length exceeded")).toBe(true);
    expect(provider.isContextLengthError("random error")).toBe(false);
  });
});

describe("LlamaProvider – convertMessage tool role", () => {
  it("converts tool role with object content", async () => {
    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://localhost:8080" },
      { client: {} as any }
    );

    const result = await provider.convertMessage({
      role: "tool",
      content: { result: 42 } as any
    });
    expect((result as any).content).toContain("Tool result:");
    expect((result as any).content).toContain("42");
  });
});
