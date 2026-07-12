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
      { fetchFn: fetchFn as any }
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
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [
          {
            message: {
              content: "calculator(expression='5 + 3')",
              tool_calls: []
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

    expect(result).toEqual({
      role: "assistant",
      content: "calculator(expression='5 + 3')",
      toolCalls: [
        { id: "tool_1", name: "calculator", args: { expression: "5 + 3" } }
      ]
    });
  });

  it("keeps args after a quoted value ending in an escaped backslash (#11)", async () => {
    // Regression: an escaped backslash before the closing quote (a Windows
    // path) was misread as escaping the quote, so the quote never closed and
    // every following argument was swallowed into the string.
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [
          {
            message: {
              content: 'save(path="C:\\\\", overwrite=true)',
              tool_calls: []
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
      messages: [{ role: "user", content: "save" }],
      tools: [{ name: "save" }]
    });
    const args = result.toolCalls?.[0]?.args as Record<string, unknown>;
    // The `overwrite` argument survives instead of being absorbed into `path`.
    expect(args.overwrite).toBe(true);
    expect(String(args.path).startsWith("C:")).toBe(true);
  });

  it("streams chunks and parses emulated tool call on stop", async () => {
    const fetchMock = mockChatFetch(
      chatSSEResponse([
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

    expect(out).toEqual([
      { type: "chunk", content: "calculator(expression='9+1')", done: false },
      { type: "chunk", content: "", done: true },
      { id: "tool_1", name: "calculator", args: { expression: "9+1" } }
    ]);
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
