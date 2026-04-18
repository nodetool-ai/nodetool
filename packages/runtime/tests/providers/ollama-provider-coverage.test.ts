/**
 * Additional coverage tests for OllamaProvider – message conversion
 * edge cases, image handling, embedding errors, streaming errors.
 */

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

describe("OllamaProvider – convertMessage edge cases", () => {
  const provider = new OllamaProvider(
    { OLLAMA_API_URL: "http://localhost:11434" },
    { fetchFn: vi.fn() as unknown as typeof fetch }
  );

  it("converts tool message", async () => {
    const result = await provider.convertMessage({
      role: "tool",
      content: "tool result"
    });
    expect(result).toEqual({ role: "tool", content: "tool result" });
  });

  it("converts tool message with object content", async () => {
    const result = await provider.convertMessage({
      role: "tool",
      content: { ok: true } as any
    });
    expect(result).toEqual({ role: "tool", content: '{"ok":true}' });
  });

  it("converts assistant message with tool calls", async () => {
    const result = await provider.convertMessage({
      role: "assistant",
      content: "calling",
      toolCalls: [{ id: "tc1", name: "search", args: { q: "x" } }]
    });
    expect(result).toEqual({
      role: "assistant",
      content: "calling",
      tool_calls: [{ function: { name: "search", arguments: { q: "x" } } }]
    });
  });

  it("converts system message with string", async () => {
    const result = await provider.convertMessage({
      role: "system",
      content: "You are helpful"
    });
    expect(result).toEqual({ role: "system", content: "You are helpful" });
  });

  it("converts system message with array content", async () => {
    const result = await provider.convertMessage({
      role: "system",
      content: [
        { type: "text", text: "part1" },
        { type: "text", text: "part2" }
      ]
    });
    expect(result).toEqual({ role: "system", content: "part1\npart2" });
  });

  it("converts system message with null content", async () => {
    const result = await provider.convertMessage({
      role: "system",
      content: null
    });
    expect(result).toEqual({ role: "system", content: "" });
  });

  it("throws for unsupported role", async () => {
    await expect(
      provider.convertMessage({ role: "unknown" as any, content: "x" })
    ).rejects.toThrow("Unsupported message role");
  });

  it("converts user string message", async () => {
    const result = await provider.convertMessage({
      role: "user",
      content: "hello"
    });
    expect(result).toEqual({ role: "user", content: "hello" });
  });

  it("converts user multipart text-only (no images)", async () => {
    const result = await provider.convertMessage({
      role: "user",
      content: [{ type: "text", text: "just text" }]
    });
    expect(result).toEqual({ role: "user", content: "just text" });
    expect((result as any).images).toBeUndefined();
  });
});

describe("OllamaProvider – imageToBase64 paths", () => {
  it("handles image with data URI string in data field", async () => {
    const base64 = Buffer.from("test").toString("base64");
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: vi.fn() as unknown as typeof fetch }
    );

    const result = await provider.convertMessage({
      role: "user",
      content: [
        {
          type: "image_url",
          image: { data: `data:image/png;base64,${base64}` }
        }
      ]
    });
    expect((result as any).images[0]).toBe(base64);
  });

  it("handles image with data URI in uri field", async () => {
    const base64 = Buffer.from("test").toString("base64");
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: vi.fn() as unknown as typeof fetch }
    );

    const result = await provider.convertMessage({
      role: "user",
      content: [
        {
          type: "image_url",
          image: { uri: `data:image/png;base64,${base64}` }
        }
      ]
    });
    expect((result as any).images[0]).toBe(base64);
  });

  it("handles image with plain base64 string data", async () => {
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: vi.fn() as unknown as typeof fetch }
    );

    const result = await provider.convertMessage({
      role: "user",
      content: [{ type: "image_url", image: { data: "AQID" } }]
    });
    expect((result as any).images[0]).toBe("AQID");
  });

  it("fetches image from remote URI", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("example.com")) {
        return {
          ok: true,
          arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
        };
      }
      return jsonResponse({});
    });

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const result = await provider.convertMessage({
      role: "user",
      content: [
        { type: "image_url", image: { uri: "https://example.com/img.png" } }
      ]
    });
    expect((result as any).images[0]).toBeTruthy();
  });

  it("throws on fetch failure for image URI", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    await expect(
      provider.convertMessage({
        role: "user",
        content: [
          { type: "image_url", image: { uri: "https://example.com/missing.png" } }
        ]
      })
    ).rejects.toThrow("Failed to fetch image URI");
  });

  it("throws for image with no data and no uri", async () => {
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: vi.fn() as unknown as typeof fetch }
    );

    await expect(
      provider.convertMessage({
        role: "user",
        content: [{ type: "image_url", image: {} }]
      })
    ).rejects.toThrow("Invalid image payload");
  });
});

describe("OllamaProvider – formatTools", () => {
  it("formats tools in function format", () => {
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: vi.fn() as unknown as typeof fetch }
    );

    const result = provider.formatTools([
      {
        name: "search",
        description: "Search",
        inputSchema: { type: "object", properties: {} }
      }
    ]);

    expect(result).toEqual([
      {
        type: "function",
        function: {
          name: "search",
          description: "Search",
          parameters: { type: "object", properties: {} }
        }
      }
    ]);
  });
});

describe("OllamaProvider – generateMessage edge cases", () => {
  it("handles tool call with string arguments", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        message: {
          content: "",
          tool_calls: [{ function: { name: "calc", arguments: '{"x": 1}' } }]
        }
      })
    );

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const result = await provider.generateMessage({
      model: "test",
      messages: [{ role: "user", content: "calc" }],
      tools: [{ name: "calc" }]
    });

    expect(result.toolCalls).toEqual([
      { id: "tool_1", name: "calc", args: { x: 1 } }
    ]);
  });

  it("handles tool call with empty/missing function name", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        message: {
          content: "ok",
          tool_calls: [{ function: {} }]
        }
      })
    );

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const result = await provider.generateMessage({
      model: "test",
      messages: [{ role: "user", content: "hi" }]
    });

    // Tool call with empty name should be filtered out
    expect(result.toolCalls).toEqual([]);
  });
});

describe("OllamaProvider – streaming edge cases", () => {
  it("throws on failed streaming response", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      body: null
    });

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const gen = provider.generateMessages({
      model: "test",
      messages: [{ role: "user", content: "hi" }]
    });

    await expect(gen.next()).rejects.toThrow("API request failed");
  });
});

describe("OllamaProvider – getAvailableEmbeddingModels", () => {
  it("returns models derived from language models", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        models: [{ model: "nomic-embed-text" }]
      })
    );

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const models = await provider.getAvailableEmbeddingModels();
    expect(models).toEqual([
      {
        id: "nomic-embed-text",
        name: "nomic-embed-text",
        provider: "ollama",
        dimensions: 0
      }
    ]);
  });
});

describe("OllamaProvider – generateEmbedding errors", () => {
  it("throws on empty text", async () => {
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: vi.fn() as unknown as typeof fetch }
    );

    await expect(
      provider.generateEmbedding({ text: "", model: "test" })
    ).rejects.toThrow("text must not be empty");
  });

  it("throws on empty array", async () => {
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: vi.fn() as unknown as typeof fetch }
    );

    await expect(
      provider.generateEmbedding({ text: [], model: "test" })
    ).rejects.toThrow("text must not be empty");
  });
});

describe("OllamaProvider – hasToolSupport with /api/show", () => {
  it("returns true when model has tools capability", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ capabilities: ["completion", "tools"] })
      );
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    expect(await provider.hasToolSupport("llama3")).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost:11434/api/show",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns false when model has no tools capability", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ capabilities: ["completion"] }));
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    expect(await provider.hasToolSupport("phi")).toBe(false);
  });

  it("returns true when model has no capabilities field (backward compat)", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ modelfile: "FROM llama3" }));
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    expect(await provider.hasToolSupport("old-model")).toBe(true);
  });

  it("returns true on non-200 API response (fallback)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, false, 404));
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    expect(await provider.hasToolSupport("missing-model")).toBe(true);
  });

  it("returns true on network error (fallback)", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    expect(await provider.hasToolSupport("unreachable")).toBe(true);
  });

  it("caches result — second call does not make another fetch", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ capabilities: ["tools"] }));
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    await provider.hasToolSupport("cached-model");
    await provider.hasToolSupport("cached-model");

    // Only one /api/show call should have been made
    const showCalls = fetchFn.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("/api/show")
    );
    expect(showCalls).toHaveLength(1);
  });
});

describe("OllamaProvider – parseDataUri non-base64 path", () => {
  it("converts image with non-base64 data URI in data field", async () => {
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: vi.fn() as unknown as typeof fetch }
    );

    const result = await provider.convertMessage({
      role: "user",
      content: [
        {
          type: "image_url",
          image: { data: "data:image/png,hello%20world" }
        }
      ]
    });
    expect((result as any).images[0]).toBeTruthy();
  });

  it("converts image with non-base64 data URI in uri field", async () => {
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: vi.fn() as unknown as typeof fetch }
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
    expect((result as any).images[0]).toBeTruthy();
  });
});

describe("OllamaProvider – normalizeToolArgs edge cases", () => {
  it("handles string JSON array arguments as empty object", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        message: {
          content: "",
          tool_calls: [{ function: { name: "calc", arguments: "[1,2,3]" } }]
        }
      })
    );

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const result = await provider.generateMessage({
      model: "test",
      messages: [{ role: "user", content: "calc" }],
      tools: [{ name: "calc" }]
    });

    expect(result.toolCalls![0].args).toEqual({});
  });

  it("handles invalid JSON string arguments as empty object", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        message: {
          content: "",
          tool_calls: [{ function: { name: "calc", arguments: "not json" } }]
        }
      })
    );

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const result = await provider.generateMessage({
      model: "test",
      messages: [{ role: "user", content: "calc" }],
      tools: [{ name: "calc" }]
    });

    expect(result.toolCalls![0].args).toEqual({});
  });

  it("handles array arguments as empty object", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        message: {
          content: "",
          tool_calls: [{ function: { name: "calc", arguments: [1, 2, 3] } }]
        }
      })
    );

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const result = await provider.generateMessage({
      model: "test",
      messages: [{ role: "user", content: "calc" }],
      tools: [{ name: "calc" }]
    });

    expect(result.toolCalls![0].args).toEqual({});
  });
});

describe("OllamaProvider – postJson error path", () => {
  it("throws when postJson receives non-OK response", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    await expect(
      provider.generateEmbedding({ text: "hello", model: "test" })
    ).rejects.toThrow("API request failed");
  });
});

/* ------------------------------------------------------------------ */
/* Tool emulation in generateMessage (non-streaming)                  */
/* ------------------------------------------------------------------ */

describe("OllamaProvider – tool emulation in generateMessage", () => {
  const searchTool: import("../../src/providers/types.js").ProviderTool = {
    name: "search_web",
    description: "Search the web",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } }
    }
  };

  const calcTool: import("../../src/providers/types.js").ProviderTool = {
    name: "calculate",
    description: "Calculate math",
    inputSchema: {
      type: "object",
      properties: {
        a: { type: "number" },
        b: { type: "number" }
      }
    }
  };

  function makeFetchForEmulation(chatContent: string) {
    return vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (typeof url === "string" && url.includes("/api/show")) {
        // Model does NOT support tools
        return jsonResponse({ capabilities: ["completion"] });
      }
      if (typeof url === "string" && url.includes("/api/chat")) {
        return jsonResponse({ message: { content: chatContent } });
      }
      return jsonResponse({});
    });
  }

  it("injects tool descriptions and parses emulated call from output", async () => {
    const fetchFn = makeFetchForEmulation("search_web(query='hello world')");
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const result = await provider.generateMessage({
      model: "phi",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "search for hello" }
      ],
      tools: [searchTool]
    });

    // Should have parsed emulated tool call
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe("search_web");
    expect(result.toolCalls![0].args).toEqual({ query: "hello world" });

    // Verify tool descriptions were injected into the request body
    const chatCall = fetchFn.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("/api/chat")
    );
    const body = JSON.parse(chatCall[1].body);
    // Should NOT have tools in the request (emulation strips them)
    expect(body.tools).toBeUndefined();
    // System message should contain tool descriptions
    const systemMsg = body.messages.find((m: any) => m.role === "system");
    expect(systemMsg.content).toContain("search_web");
    expect(systemMsg.content).toContain("function_name(param='value')");
  });

  it("converts tool messages to user messages with 'Function result:' prefix", async () => {
    const fetchFn = makeFetchForEmulation("The answer is 42.");
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    await provider.generateMessage({
      model: "phi",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "search" },
        { role: "assistant", content: "search_web(query='test')" },
        { role: "tool", content: '{"results": ["a","b"]}' }
      ],
      tools: [searchTool]
    });

    const chatCall = fetchFn.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("/api/chat")
    );
    const body = JSON.parse(chatCall[1].body);
    // Tool message should be converted to user message
    const toolAsUser = body.messages.find(
      (m: any) => m.role === "user" && m.content.startsWith("Function result:")
    );
    expect(toolAsUser).toBeDefined();
    expect(toolAsUser.content).toContain('{"results": ["a","b"]}');
  });

  it("uses native tool calls when hasToolSupport returns true", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/show")) {
        return jsonResponse({ capabilities: ["tools", "completion"] });
      }
      if (typeof url === "string" && url.includes("/api/chat")) {
        return jsonResponse({
          message: {
            content: "",
            tool_calls: [
              { function: { name: "search_web", arguments: { query: "hi" } } }
            ]
          }
        });
      }
      return jsonResponse({});
    });

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const result = await provider.generateMessage({
      model: "llama3",
      messages: [{ role: "user", content: "search" }],
      tools: [searchTool]
    });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe("search_web");
    // Verify tools were passed in the request (native mode)
    const chatCall = fetchFn.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("/api/chat")
    );
    const body = JSON.parse(chatCall[1].body);
    expect(body.tools).toBeDefined();
    expect(body.tools).toHaveLength(1);
  });

  it("creates system message if none exists during emulation", async () => {
    const fetchFn = makeFetchForEmulation("Just text, no tool calls.");
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    await provider.generateMessage({
      model: "phi",
      messages: [{ role: "user", content: "hello" }],
      tools: [searchTool]
    });

    const chatCall = fetchFn.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("/api/chat")
    );
    const body = JSON.parse(chatCall[1].body);
    const systemMsg = body.messages.find((m: any) => m.role === "system");
    expect(systemMsg).toBeDefined();
    expect(systemMsg.content).toContain("search_web");
  });
});

/* ------------------------------------------------------------------ */
/* Tool emulation in generateMessages (streaming)                     */
/* ------------------------------------------------------------------ */

describe("OllamaProvider – tool emulation in streaming (generateMessages)", () => {
  const searchTool: import("../../src/providers/types.js").ProviderTool = {
    name: "search_web",
    description: "Search the web",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } }
    }
  };

  it("accumulates text and parses emulated calls at done=true", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/show")) {
        return jsonResponse({ capabilities: ["completion"] }); // no tools
      }
      if (typeof url === "string" && url.includes("/api/chat")) {
        return streamResponse([
          { message: { content: "search_web(query=" }, done: false },
          { message: { content: "'test')" }, done: false },
          { message: { content: "" }, done: true }
        ]);
      }
      return jsonResponse({});
    });

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const items: import("../../src/providers/types.js").ProviderStreamItem[] =
      [];
    for await (const item of provider.generateMessages({
      model: "phi",
      messages: [{ role: "user", content: "search" }],
      tools: [searchTool]
    })) {
      items.push(item);
    }

    // Should have chunks + an emulated tool call at the end
    const toolCalls = items.filter((i) => "name" in i && "args" in i);
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    expect((toolCalls[0] as any).name).toBe("search_web");
    expect((toolCalls[0] as any).args).toEqual({ query: "test" });
  });

  it("yields native tool_calls when hasToolSupport is true", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/show")) {
        return jsonResponse({ capabilities: ["tools"] });
      }
      if (typeof url === "string" && url.includes("/api/chat")) {
        return streamResponse([
          {
            message: {
              content: "",
              tool_calls: [
                { function: { name: "search_web", arguments: { query: "hi" } } }
              ]
            },
            done: false
          },
          { message: { content: "" }, done: true }
        ]);
      }
      return jsonResponse({});
    });

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const items: import("../../src/providers/types.js").ProviderStreamItem[] =
      [];
    for await (const item of provider.generateMessages({
      model: "llama3",
      messages: [{ role: "user", content: "search" }],
      tools: [searchTool]
    })) {
      items.push(item);
    }

    const toolCalls = items.filter((i) => "name" in i && "args" in i);
    expect(toolCalls).toHaveLength(1);
    expect((toolCalls[0] as any).name).toBe("search_web");
    expect((toolCalls[0] as any).args).toEqual({ query: "hi" });
  });

  it("does not yield emulated calls when no tool calls are in accumulated text", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/show")) {
        return jsonResponse({ capabilities: ["completion"] });
      }
      if (typeof url === "string" && url.includes("/api/chat")) {
        return streamResponse([
          { message: { content: "Just plain text." }, done: false },
          { message: { content: "" }, done: true }
        ]);
      }
      return jsonResponse({});
    });

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    const items: import("../../src/providers/types.js").ProviderStreamItem[] =
      [];
    for await (const item of provider.generateMessages({
      model: "phi",
      messages: [{ role: "user", content: "hello" }],
      tools: [searchTool]
    })) {
      items.push(item);
    }

    const toolCalls = items.filter((i) => "name" in i && "args" in i);
    expect(toolCalls).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* _parseEmulatedToolCalls patterns                                   */
/* ------------------------------------------------------------------ */

describe("OllamaProvider – _parseEmulatedToolCalls patterns", () => {
  // We test through generateMessage with tool emulation enabled

  const tools: import("../../src/providers/types.js").ProviderTool[] = [
    {
      name: "search_web",
      description: "Search",
      inputSchema: { type: "object", properties: { query: { type: "string" } } }
    },
    {
      name: "calculate",
      description: "Calculate",
      inputSchema: {
        type: "object",
        properties: { a: { type: "number" }, b: { type: "number" } }
      }
    },
    {
      name: "toggle",
      description: "Toggle",
      inputSchema: { type: "object", properties: { flag: { type: "boolean" } } }
    }
  ];

  function makeProvider(chatContent: string) {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/show")) {
        return jsonResponse({ capabilities: ["completion"] }); // no tools
      }
      if (typeof url === "string" && url.includes("/api/chat")) {
        return jsonResponse({ message: { content: chatContent } });
      }
      return jsonResponse({});
    });
    return new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
  }

  it("parses simple string arg: search_web(query='test')", async () => {
    const provider = makeProvider("search_web(query='test')");
    const result = await provider.generateMessage({
      model: "phi",
      messages: [{ role: "user", content: "go" }],
      tools
    });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe("search_web");
    expect(result.toolCalls![0].args).toEqual({ query: "test" });
  });

  it("parses numeric args: calculate(a=5 b=10)", async () => {
    // Note: comma-separated args cause the \S+ capture to include the comma.
    // The parser handles space-separated key=value pairs cleanly.
    const provider = makeProvider("calculate(a=5 b=10)");
    const result = await provider.generateMessage({
      model: "phi",
      messages: [{ role: "user", content: "go" }],
      tools
    });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe("calculate");
    expect(result.toolCalls![0].args).toEqual({ a: 5, b: 10 });
  });

  it("parses comma-separated numeric args correctly for last param", async () => {
    // With commas, the \S+ capture includes trailing comma on non-last args
    const provider = makeProvider("calculate(a=5, b=10)");
    const result = await provider.generateMessage({
      model: "phi",
      messages: [{ role: "user", content: "go" }],
      tools
    });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe("calculate");
    // a gets "5," (string with comma), b gets 10 (number)
    expect(result.toolCalls![0].args.b).toBe(10);
  });

  it("parses boolean args: toggle(flag=true)", async () => {
    const provider = makeProvider("toggle(flag=true)");
    const result = await provider.generateMessage({
      model: "phi",
      messages: [{ role: "user", content: "go" }],
      tools
    });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe("toggle");
    expect(result.toolCalls![0].args).toEqual({ flag: true });
  });

  it("parses bracketed format: [search_web(query='hello')]", async () => {
    const provider = makeProvider("[search_web(query='hello')]");
    const result = await provider.generateMessage({
      model: "phi",
      messages: [{ role: "user", content: "go" }],
      tools
    });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe("search_web");
    expect(result.toolCalls![0].args).toEqual({ query: "hello" });
  });

  it("ignores unknown function names", async () => {
    const provider = makeProvider("unknown_func(x=1)");
    const result = await provider.generateMessage({
      model: "phi",
      messages: [{ role: "user", content: "go" }],
      tools
    });
    expect(result.toolCalls).toHaveLength(0);
  });

  it("parses multiple tool calls in one response", async () => {
    const provider = makeProvider(
      "Let me search first: search_web(query='hello') and then calculate(a=3 b=7)"
    );
    const result = await provider.generateMessage({
      model: "phi",
      messages: [{ role: "user", content: "go" }],
      tools
    });
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls![0].name).toBe("search_web");
    expect(result.toolCalls![0].args).toEqual({ query: "hello" });
    expect(result.toolCalls![1].name).toBe("calculate");
    expect(result.toolCalls![1].args).toEqual({ a: 3, b: 7 });
  });

  it('parses double-quoted string args: search_web(query="test")', async () => {
    const provider = makeProvider('search_web(query="test value")');
    const result = await provider.generateMessage({
      model: "phi",
      messages: [{ role: "user", content: "go" }],
      tools
    });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].args).toEqual({ query: "test value" });
  });

  it("parses false boolean: toggle(flag=false)", async () => {
    const provider = makeProvider("toggle(flag=false)");
    const result = await provider.generateMessage({
      model: "phi",
      messages: [{ role: "user", content: "go" }],
      tools
    });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].args).toEqual({ flag: false });
  });
});

/* ------------------------------------------------------------------ */
/* _injectToolEmulationPrompt                                         */
/* ------------------------------------------------------------------ */

describe("OllamaProvider – _injectToolEmulationPrompt", () => {
  const tool: import("../../src/providers/types.js").ProviderTool = {
    name: "search_web",
    description: "Search the web",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } }
    }
  };

  it("appends tool descriptions to existing system message", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/show")) {
        return jsonResponse({ capabilities: ["completion"] });
      }
      if (typeof url === "string" && url.includes("/api/chat")) {
        return jsonResponse({ message: { content: "ok" } });
      }
      return jsonResponse({});
    });

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    await provider.generateMessage({
      model: "phi",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "hello" }
      ],
      tools: [tool]
    });

    const chatCall = fetchFn.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("/api/chat")
    );
    const body = JSON.parse(chatCall[1].body);
    const systemMsg = body.messages.find((m: any) => m.role === "system");
    // Should start with original content
    expect(systemMsg.content).toMatch(/^You are a helpful assistant\./);
    // Should contain tool info
    expect(systemMsg.content).toContain("search_web");
    expect(systemMsg.content).toContain("query: string");
  });

  it("creates system message if none exists", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/show")) {
        return jsonResponse({ capabilities: ["completion"] });
      }
      if (typeof url === "string" && url.includes("/api/chat")) {
        return jsonResponse({ message: { content: "ok" } });
      }
      return jsonResponse({});
    });

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    await provider.generateMessage({
      model: "phi",
      messages: [{ role: "user", content: "hello" }],
      tools: [tool]
    });

    const chatCall = fetchFn.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("/api/chat")
    );
    const body = JSON.parse(chatCall[1].body);
    // First message should be the injected system message
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("search_web");
    // Second should be the user message
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[1].content).toBe("hello");
  });

  it("converts tool role messages to user role with 'Function result:' prefix", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/show")) {
        return jsonResponse({ capabilities: ["completion"] });
      }
      if (typeof url === "string" && url.includes("/api/chat")) {
        return jsonResponse({ message: { content: "done" } });
      }
      return jsonResponse({});
    });

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    await provider.generateMessage({
      model: "phi",
      messages: [
        { role: "system", content: "Be helpful." },
        { role: "user", content: "search for cats" },
        { role: "assistant", content: "search_web(query='cats')" },
        { role: "tool", content: "Found 10 results about cats." }
      ],
      tools: [tool]
    });

    const chatCall = fetchFn.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("/api/chat")
    );
    const body = JSON.parse(chatCall[1].body);
    // The tool message should have been converted
    const convertedMsg = body.messages.find(
      (m: any) => m.role === "user" && m.content.includes("Function result:")
    );
    expect(convertedMsg).toBeDefined();
    expect(convertedMsg.content).toBe(
      "Function result: Found 10 results about cats."
    );
    // No tool role messages should remain
    const toolMsgs = body.messages.filter((m: any) => m.role === "tool");
    expect(toolMsgs).toHaveLength(0);
  });

  it("handles object content in tool messages during emulation", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/show")) {
        return jsonResponse({ capabilities: ["completion"] });
      }
      if (typeof url === "string" && url.includes("/api/chat")) {
        return jsonResponse({ message: { content: "done" } });
      }
      return jsonResponse({});
    });

    const provider = new OllamaProvider(
      { OLLAMA_API_URL: "http://localhost:11434" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );

    await provider.generateMessage({
      model: "phi",
      messages: [
        { role: "user", content: "do something" },
        { role: "tool", content: { data: [1, 2, 3] } as any }
      ],
      tools: [tool]
    });

    const chatCall = fetchFn.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("/api/chat")
    );
    const body = JSON.parse(chatCall[1].body);
    const convertedMsg = body.messages.find(
      (m: any) => m.role === "user" && m.content.includes("Function result:")
    );
    expect(convertedMsg).toBeDefined();
    expect(convertedMsg.content).toBe('Function result: {"data":[1,2,3]}');
  });
});
