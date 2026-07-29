import { describe, it, expect, vi } from "vitest";
import { OllamaProvider } from "../../src/providers/ollama-provider.js";
import type { Message } from "../../src/providers/types.js";

function jsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => payload,
    body: null
  } as unknown as Response;
}

function streamResponse(lines: unknown[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      }
      controller.close();
    }
  });

  return {
    ok: true,
    status: 200,
    body,
    json: async () => ({})
  } as unknown as Response;
}

describe("OllamaProvider", () => {
  it("validates secrets and container env", () => {
    expect(OllamaProvider.requiredSecrets()).toEqual(["OLLAMA_API_URL"]);
    expect(() => new OllamaProvider({})).toThrow("OLLAMA_API_URL is required");

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: vi.fn() as unknown as typeof fetch }
    );
    expect(provider.getContainerEnv()).toEqual({
      OLLAMA_API_URL: "http://localhost:11434"
    });
  });

  it("fetches available models from /api/tags", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        models: [{ model: "llama3.1:8b" }, { name: "qwen2.5:7b" }, {}]
      })
    );

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    await expect(provider.getAvailableLanguageModels()).resolves.toEqual([
      { id: "llama3.1:8b", name: "llama3.1:8b", provider: "ollama" },
      { id: "qwen2.5:7b", name: "qwen2.5:7b", provider: "ollama" }
    ]);
  });

  it("converts user multimodal messages to Ollama format", async () => {
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: vi.fn() as unknown as typeof fetch }
    );

    const message: Message = {
      role: "user",
      content: [
        { type: "text", text: "Describe this image" },
        { type: "image_url", image: { data: Uint8Array.from([1, 2, 3]) } }
      ]
    };

    await expect(provider.convertMessage(message)).resolves.toEqual({
      role: "user",
      content: "Describe this image",
      images: ["AQID"]
    });
  });

  it("generates non-streaming message with tool calls", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        message: {
          content: "done",
          tool_calls: [{ function: { name: "sum", arguments: { a: 1, b: 2 } } }]
        }
      })
    );

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const result = await provider.generateMessage({
      model: "llama3.1:8b",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "sum", inputSchema: { type: "object", properties: {} } }]
    });

    expect(result).toEqual({
      role: "assistant",
      content: "done",
      toolCalls: [{ id: "tool_1", name: "sum", args: { a: 1, b: 2 } }]
    });

    // keep_alive is sent so large models stay resident between turns.
    const sentBody = JSON.parse(
      (fetchFn.mock.calls[fetchFn.mock.calls.length - 1][1] as RequestInit)
        .body as string
    );
    expect(sentBody.keep_alive).toBe("10m");
  });

  it("streams chunks and tool calls from NDJSON", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      streamResponse([
        { message: { content: "Hel" }, done: false },
        {
          message: {
            content: "lo",
            tool_calls: [
              { function: { name: "lookup", arguments: { q: "x" } } }
            ]
          },
          done: false
        },
        { message: { content: "" }, done: true }
      ])
    );

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const out: Array<unknown> = [];
    for await (const item of provider.generateMessages({
      model: "llama3.1:8b",
      messages: [{ role: "user", content: "hi" }]
    })) {
      out.push(item);
    }

    expect(out).toEqual([
      { type: "chunk", content: "Hel", done: false },
      { id: "tool_1", name: "lookup", args: { q: "x" } },
      { type: "chunk", content: "lo", done: false },
      { type: "chunk", content: "", done: true }
    ]);
  });

  // Emulation path helper: /api/show reports no "tools" capability, then
  // /api/chat returns the given assistant content.
  function emulationFetch(chatContent: string) {
    return vi.fn(async (url: string) => {
      if (String(url).includes("/api/show")) {
        return jsonResponse({ capabilities: ["completion"] });
      }
      return jsonResponse({ message: { content: chatContent } });
    });
  }

  it("strips emulated tool-call syntax from returned content (#1)", async () => {
    // Regression: the emulation branch returned the RAW content, leaving the
    // literal call text in the message alongside the structured tool call.
    const fetchFn = emulationFetch("get_weather(city='Paris')");
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const result = await provider.generateMessage({
      model: "gemma:2b",
      messages: [{ role: "user", content: "weather?" }],
      tools: [
        {
          name: "get_weather",
          inputSchema: {
            type: "object",
            properties: { city: { type: "string" } }
          }
        }
      ]
    });

    expect(result.toolCalls?.[0]?.name).toBe("get_weather");
    expect(result.toolCalls?.[0]?.args).toEqual({ city: "Paris" });
    // The literal call syntax must NOT survive in the assistant content.
    expect(String(result.content ?? "")).not.toContain("get_weather(");
  });

  it("keeps numeric-looking string args as strings in emulated calls (#4)", async () => {
    // Regression: unquoted-but-quoted values were coerced to numbers, so a
    // quoted zip like '01234' became 1234. Quoted values must stay strings.
    const fetchFn = emulationFetch("lookup(zip='01234')");
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const result = await provider.generateMessage({
      model: "gemma:2b",
      messages: [{ role: "user", content: "lookup" }],
      tools: [
        {
          name: "lookup",
          inputSchema: {
            type: "object",
            properties: { zip: { type: "string" } }
          }
        }
      ]
    });

    expect(result.toolCalls?.[0]?.args).toEqual({ zip: "01234" });
  });

  it("preserves array-typed assistant content in convertMessage (#2)", async () => {
    // Regression: the assistant branch collapsed MessageContent[] to "",
    // erasing a prior assistant turn from replayed history.
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: vi.fn() as unknown as typeof fetch }
    );

    const message: Message = {
      role: "assistant",
      content: [
        { type: "text", text: "Prior" },
        { type: "text", text: "answer" }
      ]
    };

    // asTextParts joins text parts with a newline (matching system/user roles).
    await expect(provider.convertMessage(message)).resolves.toEqual({
      role: "assistant",
      content: "Prior\nanswer"
    });
  });

  it("surfaces reasoning-model thinking tokens as thinking chunks", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      streamResponse([
        { message: { content: "", thinking: "Let me" }, done: false },
        { message: { content: "", thinking: " think" }, done: false },
        { message: { content: "Hi" }, done: false },
        { message: { content: "" }, done: true }
      ])
    );

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const out: Array<unknown> = [];
    for await (const item of provider.generateMessages({
      model: "gpt-oss:20b",
      messages: [{ role: "user", content: "hi" }]
    })) {
      out.push(item);
    }

    expect(out).toEqual([
      { type: "chunk", content: "Let me", done: false, thinking: true },
      { type: "chunk", content: " think", done: false, thinking: true },
      { type: "chunk", content: "Hi", done: false },
      { type: "chunk", content: "", done: true }
    ]);
  });

  it("generates embeddings via /api/embed", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        embeddings: [
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6]
        ]
      })
    );

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    await expect(
      provider.generateEmbedding({
        model: "nomic-embed-text",
        text: ["hello", "world"]
      })
    ).resolves.toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6]
    ]);
  });

  it("detects context-length style errors", () => {
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: vi.fn() as unknown as typeof fetch }
    );
    expect(
      provider.isContextLengthError(new Error("context window exceeded"))
    ).toBe(true);
    expect(provider.isContextLengthError(new Error("other failure"))).toBe(
      false
    );
  });
});
