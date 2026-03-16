import { describe, it, expect, vi } from "vitest";
import { GeminiProvider } from "../../src/providers/gemini-provider.js";
import type { Message } from "../../src/providers/types.js";

function makeFetchResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
    body: null,
  } as unknown as Response;
}

function makeSSEStream(events: unknown[]): Response {
  const lines = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  const encoder = new TextEncoder();
  const bytes = encoder.encode(lines);

  let released = false;
  const reader = {
    async read() {
      if (released) return { done: true, value: undefined };
      released = true;
      return { done: false, value: bytes };
    },
    releaseLock() {},
  };

  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    body: { getReader: () => reader },
  } as unknown as Response;
}

describe("GeminiProvider", () => {
  it("requires GEMINI_API_KEY", () => {
    expect(() => new GeminiProvider({})).toThrow("GEMINI_API_KEY is required");
  });

  it("reports required secrets", () => {
    expect(GeminiProvider.requiredSecrets()).toEqual(["GEMINI_API_KEY"]);
  });

  it("has tool support for all models", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    expect(await provider.hasToolSupport("gemini-2.0-flash")).toBe(true);
    expect(await provider.hasToolSupport("gemini-1.5-pro")).toBe(true);
  });

  it("converts messages to Gemini format", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const messages: Message[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
      { role: "user", content: "Thanks" },
    ];

    const result = await provider.convertMessages(messages);

    expect(result.systemInstruction).toBe("You are helpful.");
    expect(result.contents).toHaveLength(3);
    expect(result.contents[0]).toEqual({
      role: "user",
      parts: [{ text: "Hello" }],
    });
    expect(result.contents[1]).toEqual({
      role: "model",
      parts: [{ text: "Hi there" }],
    });
    expect(result.contents[2]).toEqual({
      role: "user",
      parts: [{ text: "Thanks" }],
    });
  });

  it("converts tool call messages", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const messages: Message[] = [
      {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "tc1", name: "search", args: { q: "test" } }],
      },
      {
        role: "tool",
        content: "result text",
        toolCallId: "search",
      },
    ];

    const result = await provider.convertMessages(messages);

    expect(result.contents).toHaveLength(2);
    expect(result.contents[0]).toEqual({
      role: "model",
      parts: [{ functionCall: { name: "search", args: { q: "test" } } }],
    });
    expect(result.contents[1]).toEqual({
      role: "user",
      parts: [
        {
          functionResponse: {
            name: "search",
            response: { result: "result text" },
          },
        },
      ],
    });
  });

  it("formats tools with name sanitization", () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const { geminiTools, nameMap, reverseMap } = provider.formatTools([
      { name: "my tool!", description: "A tool", inputSchema: { type: "object", properties: {} } },
      { name: "valid_name", description: "Another" },
    ]);

    expect(geminiTools).toHaveLength(1);
    expect(geminiTools[0].functionDeclarations).toHaveLength(2);

    // "my tool!" should be sanitized
    const sanitized = nameMap.get("my tool!");
    expect(sanitized).toBe("my_tool_");
    expect(reverseMap.get(sanitized!)).toBe("my tool!");

    // "valid_name" should stay the same
    expect(nameMap.get("valid_name")).toBe("valid_name");
  });

  it("fetches available language models", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        models: [
          {
            name: "models/gemini-2.0-flash",
            displayName: "Gemini 2.0 Flash",
            supportedGenerationMethods: ["generateContent", "countTokens"],
          },
          {
            name: "models/text-embedding-004",
            displayName: "Text Embedding",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      })
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "test-key" }, { fetchFn });
    const models = await provider.getAvailableLanguageModels();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toContain("/models?key=test-key");
    expect(models).toEqual([
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "gemini" },
    ]);
  });

  it("returns empty list on model fetch failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeFetchResponse({}, false, 401));

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([]);
  });

  it("generates a non-streaming message", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [
          {
            content: {
              parts: [{ text: "Hello world" }],
            },
          },
        ],
      })
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const result = await provider.generateMessage({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toContain("gemini-2.0-flash:generateContent");
    expect(opts.method).toBe("POST");
    expect(result.role).toBe("assistant");
    expect(result.content).toBe("Hello world");
    expect(result.toolCalls).toBeUndefined();
  });

  it("generates a non-streaming message with tool calls", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "search",
                    args: { query: "weather" },
                  },
                },
              ],
            },
          },
        ],
      })
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const result = await provider.generateMessage({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "What is the weather?" }],
      tools: [{ name: "search", description: "Search the web" }],
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBeNull();
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe("search");
    expect(result.toolCalls![0].args).toEqual({ query: "weather" });
  });

  it("passes system instruction and generation config", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
      })
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    await provider.generateMessage({
      model: "gemini-2.0-flash",
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "hi" },
      ],
      temperature: 0.5,
      topP: 0.9,
      maxTokens: 1024,
    });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "Be concise." }] });
    expect(body.generationConfig.temperature).toBe(0.5);
    expect(body.generationConfig.topP).toBe(0.9);
    expect(body.generationConfig.maxOutputTokens).toBe(1024);
  });

  it("streams text chunks", async () => {
    const events = [
      {
        candidates: [{ content: { parts: [{ text: "Hello" }] } }],
      },
      {
        candidates: [{ content: { parts: [{ text: " world" }] } }],
      },
    ];

    const fetchFn = vi.fn().mockResolvedValue(makeSSEStream(events));

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "hi" }],
    })) {
      out.push(item);
    }

    expect(out).toEqual([
      { type: "chunk", content: "Hello", done: false },
      { type: "chunk", content: " world", done: false },
      { type: "chunk", content: "", done: true },
    ]);
  });

  it("streams tool calls", async () => {
    const events = [
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: { name: "lookup", args: { q: "test" } },
                },
              ],
            },
          },
        ],
      },
    ];

    const fetchFn = vi.fn().mockResolvedValue(makeSSEStream(events));

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "search" }],
      tools: [{ name: "lookup", description: "Lookup" }],
    })) {
      out.push(item);
    }

    // Should have tool call + done chunk
    expect(out).toHaveLength(2);
    const tc = out[0] as any;
    expect(tc.name).toBe("lookup");
    expect(tc.args).toEqual({ q: "test" });
    expect(tc.id).toBeDefined();
    expect((out[1] as any).done).toBe(true);
  });

  it("uses SSE streaming URL", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeSSEStream([]));

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "hi" }],
    })) {
      out.push(item);
    }

    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain(":streamGenerateContent");
    expect(url).toContain("alt=sse");
  });

  it("throws on API error in non-streaming", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({ error: { message: "bad request" } }, false, 400)
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    await expect(
      provider.generateMessage({
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "hi" }],
      })
    ).rejects.toThrow("Gemini API error 400");
  });

  it("detects context length errors", () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    expect(provider.isContextLengthError("request is too long")).toBe(true);
    expect(provider.isContextLengthError("token limit exceeded")).toBe(true);
    expect(provider.isContextLengthError("context length exceeded")).toBe(true);
    expect(provider.isContextLengthError("some other error")).toBe(false);
  });

  it("returns container env", () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "test-key" });
    expect(provider.getContainerEnv()).toEqual({ GEMINI_API_KEY: "test-key" });
  });
});
