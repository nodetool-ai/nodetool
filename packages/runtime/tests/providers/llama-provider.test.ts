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

describe("LlamaProvider", () => {
  it("requires LLAMA_CPP_URL and reports container env behavior", async () => {
    expect(LlamaProvider.requiredSecrets()).toEqual(["LLAMA_CPP_URL"]);
    expect(() => new LlamaProvider({})).toThrow("LLAMA_CPP_URL is required");

    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://127.0.0.1:8080/" },
      { client: {} as any }
    );
    expect(provider.baseUrl).toBe("http://127.0.0.1:8080");
    expect(provider.getContainerEnv()).toEqual({});
    expect(await provider.hasToolSupport("any")).toBe(false);
  });

  it("lists available language models from /v1/models", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "Qwen/Qwen3-4B-GGUF:Qwen3-4B-Q4_K_M.gguf" },
          { id: "gemma3:4b" }
        ]
      })
    });

    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://127.0.0.1:8080" },
      { client: {} as any, fetchFn: fetchFn as any }
    );

    await expect(provider.getAvailableLanguageModels()).resolves.toEqual([
      {
        id: "Qwen/Qwen3-4B-GGUF:Qwen3-4B-Q4_K_M.gguf",
        name: "Qwen/Qwen3-4B-GGUF:Qwen3-4B-Q4_K_M.gguf",
        provider: "llama_cpp"
      },
      { id: "gemma3:4b", name: "gemma3:4b", provider: "llama_cpp" }
    ]);
  });

  it("converts messages to OpenAI-compatible payloads", async () => {
    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://127.0.0.1:8080" },
      { client: {} as any }
    );

    const user: Message = { role: "user", content: "hello" };
    const tool: Message = { role: "tool", content: { ok: true } };
    const assistant: Message = {
      role: "assistant",
      content: "doing work",
      toolCalls: [{ id: "tc1", name: "sum", args: { a: 1 } }]
    };

    await expect(provider.convertMessage(user)).resolves.toEqual({
      role: "user",
      content: "hello"
    });
    await expect(provider.convertMessage(tool)).resolves.toEqual({
      role: "user",
      content: 'Tool result:\n{"ok":true}'
    });
    await expect(provider.convertMessage(assistant)).resolves.toEqual({
      role: "assistant",
      content: "doing work",
      tool_calls: [
        {
          type: "function",
          id: "tc1",
          function: { name: "sum", arguments: '{"a":1}' }
        }
      ]
    });
  });

  it("generates non-streaming response and parses emulated tool calls", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "calculator(expression='5 + 3')",
            tool_calls: []
          }
        }
      ]
    });

    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://127.0.0.1:8080" },
      {
        client: {
          chat: { completions: { create } }
        } as any
      }
    );

    const result = await provider.generateMessage({
      model: "gemma3:4b",
      messages: [{ role: "user", content: "calc" }],
      tools: [{ name: "calculator" }]
    });

    expect(result).toEqual({
      role: "assistant",
      content: "calculator(expression='5 + 3')",
      toolCalls: [
        { id: "tool_1", name: "calculator", args: { expression: "5 + 3" } }
      ]
    });
  });

  it("streams chunks and parses emulated tool call on stop", async () => {
    const stream = makeAsyncIterable([
      {
        choices: [
          {
            delta: { content: "calculator(expression='9+1')" },
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
      { LLAMA_CPP_URL: "http://127.0.0.1:8080" },
      {
        client: {
          chat: { completions: { create } }
        } as any
      }
    );

    const out: Array<unknown> = [];
    for await (const item of provider.generateMessages({
      model: "gemma3:4b",
      messages: [{ role: "user", content: "calc" }],
      tools: [{ name: "calculator" }]
    })) {
      out.push(item);
    }

    expect(out).toEqual([
      { type: "chunk", content: "calculator(expression='9+1')", done: false },
      { type: "chunk", content: "", done: true },
      { id: "tool_1", name: "calculator", args: { expression: "9+1" } }
    ]);
  });

  it("detects context-length errors", () => {
    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://127.0.0.1:8080" },
      { client: {} as any }
    );

    expect(
      provider.isContextLengthError(new Error("context window exceeded"))
    ).toBe(true);
    expect(provider.isContextLengthError(new Error("unrelated"))).toBe(false);
  });
});
