import { describe, it, expect, vi } from "vitest";
import { LlamaProvider } from "../../src/providers/llama-provider.js";
import type { Message } from "../../src/providers/types.js";
import {
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch
} from "./helpers/compat-fetch.js";

describe("LlamaProvider", () => {
  it("requires LLAMA_CPP_URL and reports container env behavior", async () => {
    expect(LlamaProvider.requiredSecrets()).toEqual(["LLAMA_CPP_URL"]);
    expect(() => new LlamaProvider({})).toThrow("LLAMA_CPP_URL is required");

    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://127.0.0.1:8080/" },
      {}
    );
    expect(provider.baseUrl).toBe("http://127.0.0.1:8080");
    expect(provider.getContainerEnv()).toEqual({});
    // llama-server does grammar-constrained tool calling natively.
    expect(await provider.hasToolSupport("any")).toBe(true);
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
      { fetchFn: fetchFn as unknown as typeof fetch }
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
      {}
    );

    const user: Message = { role: "user", content: "hello" };
    const tool: Message = {
      role: "tool",
      content: "42",
      toolCallId: "tc1"
    };
    const assistant: Message = {
      role: "assistant",
      content: "doing work",
      toolCalls: [{ id: "tc1", name: "sum", args: { a: 1 } }]
    };

    await expect(provider.convertMessage(user)).resolves.toEqual({
      role: "user",
      content: "hello"
    });
    await expect(provider.convertMessage(tool)).resolves.toMatchObject({
      role: "tool",
      tool_call_id: "tc1"
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

  it("generates a non-streaming response with native tool calls", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "call_abc",
                  function: {
                    name: "calculator",
                    arguments: '{"expression":"5 + 3"}'
                  }
                }
              ]
            }
          }
        ]
      })
    );

    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://127.0.0.1:8080" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const result = await provider.generateMessage({
      model: "gemma3:4b",
      messages: [{ role: "user", content: "calc" }],
      tools: [{ name: "calculator" }]
    });

    expect(result.toolCalls).toEqual([
      { id: "call_abc", name: "calculator", args: { expression: "5 + 3" } }
    ]);
  });

  it("streams text chunks and native tool calls", async () => {
    const fetchMock = mockChatFetch(
      chatSSEResponse([
        {
          choices: [
            { delta: { content: "on it" }, finish_reason: null }
          ]
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_abc",
                    function: {
                      name: "calculator",
                      arguments: '{"expression":"9+1"}'
                    }
                  }
                ]
              },
              finish_reason: null
            }
          ]
        },
        { choices: [{ delta: {}, finish_reason: "tool_calls" }] }
      ])
    );
    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://127.0.0.1:8080" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const out: Array<unknown> = [];
    for await (const item of provider.generateMessages({
      model: "gemma3:4b",
      messages: [{ role: "user", content: "calc" }],
      tools: [{ name: "calculator" }]
    })) {
      out.push(item);
    }

    expect(out).toContainEqual({
      type: "chunk",
      content: "on it",
      done: false
    });
    expect(out).toContainEqual({
      id: "call_abc",
      name: "calculator",
      args: { expression: "9+1" }
    });
    expect(out).toContainEqual({ type: "chunk", content: "", done: true });
  });

  it("does not start chat requests when the caller has aborted", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://127.0.0.1:8080" },
      { fetchFn: fetchMock }
    );
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const args = {
      messages: [{ role: "user" as const, content: "hi" }],
      model: "gemma3:4b",
      signal: controller.signal
    };

    await expect(provider.generateMessage(args)).rejects.toThrow("cancelled");

    const collect = async () => {
      for await (const item of provider.generateMessages(args)) {
        void item;
      }
    };
    await expect(collect()).rejects.toThrow("cancelled");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("detects context-length errors", () => {
    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://127.0.0.1:8080" },
      {}
    );

    expect(
      provider.isContextLengthError(new Error("context window exceeded"))
    ).toBe(true);
    expect(provider.isContextLengthError(new Error("unrelated"))).toBe(false);
  });
});
