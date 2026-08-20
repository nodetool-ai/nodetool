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
    body: null
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
    async cancel() {},
    releaseLock() {}
  };

  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    body: { getReader: () => reader }
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
      { role: "user", content: "Thanks" }
    ];

    const result = await provider.convertMessages(messages);

    expect(result.systemInstruction).toBe("You are helpful.");
    expect(result.contents).toHaveLength(3);
    expect(result.contents[0]).toEqual({
      role: "user",
      parts: [{ text: "Hello" }]
    });
    expect(result.contents[1]).toEqual({
      role: "model",
      parts: [{ text: "Hi there" }]
    });
    expect(result.contents[2]).toEqual({
      role: "user",
      parts: [{ text: "Thanks" }]
    });
  });

  it("converts tool call messages", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const messages: Message[] = [
      {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "tc1", name: "search", args: { q: "test" } }]
      },
      {
        role: "tool",
        content: "result text",
        toolCallId: "search"
      }
    ];

    const result = await provider.convertMessages(messages);

    expect(result.contents).toHaveLength(2);
    expect(result.contents[0]).toEqual({
      role: "model",
      parts: [
        {
          functionCall: { id: "tc1", name: "search", args: { q: "test" } },
          thoughtSignature: "skip_thought_signature_validator"
        }
      ]
    });
    expect(result.contents[1]).toEqual({
      role: "user",
      parts: [
        {
          functionResponse: {
            id: "search",
            name: "search",
            response: { result: "result text" }
          }
        }
      ]
    });
  });

  it("resolves functionResponse name from the call id", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    // Real flow: tool result carries the generated call id, not the name.
    const messages: Message[] = [
      {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "call_123_abc", name: "search", args: { q: "x" } }]
      },
      {
        role: "tool",
        content: "result text",
        toolCallId: "call_123_abc"
      }
    ];

    const result = await provider.convertMessages(messages);

    expect(result.contents[1]).toEqual({
      role: "user",
      parts: [
        {
          functionResponse: {
            id: "call_123_abc",
            name: "search",
            response: { result: "result text" }
          }
        }
      ]
    });
  });

  it("merges parallel tool results into one user turn", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const messages: Message[] = [
      {
        role: "assistant",
        content: null,
        toolCalls: [
          { id: "call_1", name: "search", args: {} },
          { id: "call_2", name: "lookup", args: {} }
        ]
      },
      { role: "tool", content: "a", toolCallId: "call_1" },
      { role: "tool", content: "b", toolCallId: "call_2" }
    ];

    const result = await provider.convertMessages(messages);

    expect(result.contents).toHaveLength(2);
    expect(result.contents[1]).toEqual({
      role: "user",
      parts: [
        {
          functionResponse: {
            id: "call_1",
            name: "search",
            response: { result: "a" }
          }
        },
        {
          functionResponse: {
            id: "call_2",
            name: "lookup",
            response: { result: "b" }
          }
        }
      ]
    });
  });

  it("formats tools with name sanitization", () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const { geminiTools, nameMap, reverseMap } = provider.formatTools([
      {
        name: "my.tool:name!",
        description: "A tool",
        inputSchema: { type: "object", properties: {} }
      },
      { name: "valid_name", description: "Another" }
    ]);

    expect(geminiTools).toHaveLength(1);
    expect(geminiTools[0].functionDeclarations).toHaveLength(2);

    // Unsupported punctuation should be sanitized.
    const sanitized = nameMap.get("my.tool:name!");
    expect(sanitized).toBe("my_tool_name_");
    expect(reverseMap.get(sanitized!)).toBe("my.tool:name!");

    // "valid_name" should stay the same
    expect(nameMap.get("valid_name")).toBe("valid_name");
  });

  it("assigns distinct names when sanitized tool names collide", () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    const { nameMap, reverseMap } = provider.formatTools([
      { name: "a b" },
      { name: "a@b" }
    ]);
    expect(nameMap.get("a b")).toBe("a_b");
    expect(nameMap.get("a@b")).toBe("a_b_2");
    expect(reverseMap.get("a_b_2")).toBe("a@b");
  });

  it("adds default items to array schemas missing them (Gemini requires items)", () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const { geminiTools } = provider.formatTools([
      {
        name: "finish_step",
        description: "Finish",
        inputSchema: {
          type: "object",
          properties: {
            result: {
              type: "object",
              properties: {
                pain_points: { type: "array" },
                tags: { type: ["array", "null"] }
              }
            }
          }
        }
      }
    ]);

    const params = geminiTools[0].functionDeclarations[0].parameters as any;
    expect(params.properties.result.properties.pain_points.items).toEqual({
      type: "string"
    });
    expect(params.properties.result.properties.tags.items).toEqual({
      type: "string"
    });
  });

  it("preserves existing array items", () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const { geminiTools } = provider.formatTools([
      {
        name: "tool",
        description: "",
        inputSchema: {
          type: "object",
          properties: {
            ids: { type: "array", items: { type: "number" } }
          }
        }
      }
    ]);

    const params = geminiTools[0].functionDeclarations[0].parameters as any;
    expect(params.properties.ids.items).toEqual({ type: "number" });
  });

  it("rewrites `const` (Zod literals) into a form Gemini accepts", () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const { geminiTools } = provider.formatTools([
      {
        name: "animate",
        description: "",
        inputSchema: {
          type: "object",
          properties: {
            animations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  role: { const: "in" },
                  weight: { const: 1 },
                  enabled: { const: true, description: "Flag." }
                }
              }
            }
          }
        }
      }
    ]);

    const params = geminiTools[0].functionDeclarations[0].parameters as any;
    const item = params.properties.animations.items.properties;
    expect(JSON.stringify(params)).not.toContain('"const"');
    expect(item.role).toEqual({ type: "string", enum: ["in"] });
    expect(item.weight).toEqual({
      type: "integer",
      description: "Must be 1."
    });
    expect(item.enabled).toEqual({
      type: "boolean",
      description: "Flag. Must be true."
    });
  });

  it("keeps a property literally named `const`", () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const { geminiTools } = provider.formatTools([
      {
        name: "tool",
        description: "",
        inputSchema: {
          type: "object",
          properties: { const: { type: "string" } }
        }
      }
    ]);

    const params = geminiTools[0].functionDeclarations[0].parameters as any;
    expect(params.properties.const).toEqual({ type: "string" });
  });

  it("inlines local $refs and drops $defs", () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const { geminiTools } = provider.formatTools([
      {
        name: "tool",
        description: "",
        inputSchema: {
          type: "object",
          $defs: {
            Point: { type: "object", properties: { x: { type: "number" } } }
          },
          properties: {
            start: { $ref: "#/$defs/Point" },
            end: { $ref: "#/$defs/Point", description: "End." }
          }
        }
      }
    ]);

    const params = geminiTools[0].functionDeclarations[0].parameters as any;
    expect(params.$defs).toBeUndefined();
    expect(params.properties.start).toEqual({
      type: "object",
      properties: { x: { type: "number" } }
    });
    expect(params.properties.end.description).toBe("End.");
    expect(params.properties.end.properties.x).toEqual({ type: "number" });
  });

  it("degrades a recursive $ref to a permissive object", () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const { geminiTools } = provider.formatTools([
      {
        name: "tool",
        description: "",
        inputSchema: {
          type: "object",
          $defs: {
            Node: {
              type: "object",
              properties: { child: { $ref: "#/$defs/Node" } }
            }
          },
          properties: { root: { $ref: "#/$defs/Node" } }
        }
      }
    ]);

    const params = geminiTools[0].functionDeclarations[0].parameters as any;
    expect(params.properties.root.properties.child).toEqual({
      type: "object"
    });
  });

  it("maps oneOf/allOf and nullable unions onto Gemini's dialect", () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const { geminiTools } = provider.formatTools([
      {
        name: "tool",
        description: "",
        inputSchema: {
          type: "object",
          properties: {
            choice: {
              oneOf: [{ type: "string" }, { type: "number" }]
            },
            merged: {
              allOf: [
                {
                  type: "object",
                  properties: { a: { type: "string" } },
                  required: ["a"]
                },
                { properties: { b: { type: "string" } }, required: ["b"] }
              ]
            },
            note: { type: ["string", "null"] }
          }
        }
      }
    ]);

    const params = geminiTools[0].functionDeclarations[0].parameters as any;
    expect(params.properties.choice.anyOf).toEqual([
      { type: "string" },
      { type: "number" }
    ]);
    expect(params.properties.choice.oneOf).toBeUndefined();
    expect(params.properties.merged.type).toBe("object");
    expect(Object.keys(params.properties.merged.properties).sort()).toEqual([
      "a",
      "b"
    ]);
    expect(params.properties.merged.required.sort()).toEqual(["a", "b"]);
    expect(params.properties.note).toEqual({
      type: "string",
      nullable: true
    });
  });

  it("fetches available language models", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        models: [
          {
            name: "models/gemini-2.0-flash",
            displayName: "Gemini 2.0 Flash",
            supportedGenerationMethods: ["generateContent", "countTokens"]
          },
          {
            name: "models/text-embedding-004",
            displayName: "Text Embedding",
            supportedGenerationMethods: ["embedContent"]
          }
        ]
      })
    );

    const provider = new GeminiProvider(
      { GEMINI_API_KEY: "test-key" },
      { fetchFn }
    );
    const models = await provider.getAvailableLanguageModels();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toContain("/models?key=test-key");
    expect(models).toEqual([
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "gemini" }
    ]);
  });

  it("paginates and filters language model discovery", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        makeFetchResponse({
          models: [
            {
              name: "models/gemini-3.5-flash",
              supportedGenerationMethods: ["generateContent"]
            }
          ],
          nextPageToken: "next"
        })
      )
      .mockResolvedValueOnce(
        makeFetchResponse({
          models: [
            {
              name: "models/gemini-embedding-2",
              supportedGenerationMethods: ["generateContent"]
            },
            {
              name: "models/gemini-3.1-flash-lite",
              supportedGenerationMethods: ["generateContent"]
            }
          ]
        })
      );
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    await expect(provider.getAvailableLanguageModels()).resolves.toEqual([
      { id: "gemini-3.5-flash", name: "gemini-3.5-flash", provider: "gemini" },
      {
        id: "gemini-3.1-flash-lite",
        name: "gemini-3.1-flash-lite",
        provider: "gemini"
      }
    ]);
    expect(fetchFn.mock.calls[1][0]).toContain("pageToken=next");
  });

  it("returns empty list on model fetch failure", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(makeFetchResponse({}, false, 401));

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
              parts: [{ text: "Hello world" }]
            }
          }
        ]
      })
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const result = await provider.generateMessage({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "hi" }]
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toContain("gemini-2.0-flash:generateContent");
    expect(opts.method).toBe("POST");
    expect(result.role).toBe("assistant");
    expect(result.content).toBe("Hello world");
    expect(result.toolCalls).toBeUndefined();
  });

  it("tracks token usage from usageMetadata (regression: Gemini reported $0)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [{ content: { parts: [{ text: "Hi" }] } }],
        usageMetadata: {
          promptTokenCount: 12,
          candidatesTokenCount: 8,
          totalTokenCount: 20
        }
      })
    );
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    await provider.generateMessage({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "hi" }]
    });
    // Usage was recorded (non-zero) rather than left null/zero.
    expect(provider.getTotalCost()).toBeGreaterThan(0);
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
                    args: { query: "weather" }
                  }
                }
              ]
            }
          }
        ]
      })
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const result = await provider.generateMessage({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "What is the weather?" }],
      tools: [{ name: "search", description: "Search the web" }]
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
        candidates: [{ content: { parts: [{ text: "ok" }] } }]
      })
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    await provider.generateMessage({
      model: "gemini-2.0-flash",
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "hi" }
      ],
      temperature: 0.5,
      topP: 0.9,
      maxTokens: 1024
    });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.systemInstruction).toEqual({
      parts: [{ text: "Be concise." }]
    });
    expect(body.generationConfig.temperature).toBe(0.5);
    expect(body.generationConfig.topP).toBe(0.9);
    expect(body.generationConfig.maxOutputTokens).toBe(1024);
  });

  it("streams text chunks", async () => {
    const events = [
      {
        candidates: [{ content: { parts: [{ text: "Hello" }] } }]
      },
      {
        candidates: [{ content: { parts: [{ text: " world" }] } }]
      }
    ];

    const fetchFn = vi.fn().mockResolvedValue(makeSSEStream(events));

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "hi" }]
    })) {
      out.push(item);
    }

    expect(out).toEqual([
      { type: "chunk", content: "Hello", done: false },
      { type: "chunk", content: " world", done: false },
      { type: "chunk", content: "", done: true }
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
                  functionCall: {
                    id: "gemini-call-7",
                    name: "lookup",
                    args: { q: "test" }
                  }
                }
              ]
            }
          }
        ]
      }
    ];

    const fetchFn = vi.fn().mockResolvedValue(makeSSEStream(events));

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "search" }],
      tools: [{ name: "lookup", description: "Lookup" }]
    })) {
      out.push(item);
    }

    // Should have tool call + done chunk
    expect(out).toHaveLength(2);
    const tc = out[0] as any;
    expect(tc.name).toBe("lookup");
    expect(tc.args).toEqual({ q: "test" });
    expect(tc.id).toBe("gemini-call-7");
    expect((out[1] as any).done).toBe(true);
  });

  it("uses SSE streaming URL", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeSSEStream([]));

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "hi" }]
    })) {
      out.push(item);
    }

    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain(":streamGenerateContent");
    expect(url).toContain("alt=sse");
  });

  it("throws on API error in non-streaming", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        makeFetchResponse({ error: { message: "bad request" } }, false, 400)
      );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    await expect(
      provider.generateMessage({
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "hi" }]
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

  it("preserves Gemini function IDs through a tool response round trip", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    const converted = await provider.convertMessages([
      {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "vendor-call-1", name: "lookup", args: { q: "x" } }]
      },
      { role: "tool", toolCallId: "vendor-call-1", content: "ok" }
    ]);
    expect(converted.contents[0].parts[0]).toEqual({
      functionCall: { id: "vendor-call-1", name: "lookup", args: { q: "x" } },
      thoughtSignature: "skip_thought_signature_validator"
    });
    expect(converted.contents[1].parts[0]).toEqual({
      functionResponse: {
        id: "vendor-call-1",
        name: "lookup",
        response: { result: "ok" }
      }
    });
  });

  it("uses the declared sanitized tool name throughout follow-up history", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [{ content: { parts: [{ text: "done" }] } }]
      })
    );
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    await provider.generateMessage({
      model: "gemini-3.5-flash",
      tools: [{ name: "my tool!" }],
      messages: [
        {
          role: "assistant",
          content: null,
          toolCalls: [{ id: "id-1", name: "my tool!", args: {} }]
        },
        { role: "tool", toolCallId: "id-1", content: "ok" }
      ]
    });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.tools[0].functionDeclarations[0].name).toBe("my_tool_");
    expect(body.contents[0].parts[0].functionCall.name).toBe("my_tool_");
    expect(body.contents[1].parts[0].functionResponse.name).toBe("my_tool_");
  });

  it("maps toolChoice and native web search without dropping function tools", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [{ content: { parts: [{ text: "ok" }] } }]
      })
    );
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    expect(provider.supportsNativeWebSearch).toBe(true);
    await provider.generateMessage({
      model: "gemini-3.5-flash",
      messages: [{ role: "user", content: "search" }],
      tools: [{ name: "web_search" }, { name: "my tool!" }],
      toolChoice: "my tool!"
    });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.tools).toEqual([
      { functionDeclarations: [expect.objectContaining({ name: "my_tool_" })] },
      { googleSearch: {} }
    ]);
    expect(body.toolConfig).toEqual({
      includeServerSideToolInvocations: true,
      functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["my_tool_"] }
    });
  });

  it("enables server-side tool invocations when built-ins ride along with function tools", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [{ content: { parts: [{ text: "ok" }] } }]
      })
    );
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    for (const builtIn of [
      { name: "web_search" },
      { name: "run_code", type: "code_interpreter" as const }
    ]) {
      fetchFn.mockClear();
      await provider.generateMessage({
        model: "gemini-3.5-flash",
        messages: [{ role: "user", content: "go" }],
        tools: [builtIn, { name: "ui_storyboard_add_shot" }]
      });
      const body = JSON.parse(fetchFn.mock.calls[0][1].body);
      expect(body.toolConfig.includeServerSideToolInvocations).toBe(true);
    }
  });

  it("omits toolConfig when there is nothing to configure", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [{ content: { parts: [{ text: "ok" }] } }]
      })
    );
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    // Function tools alone — no built-in in play, so no flag.
    await provider.generateMessage({
      model: "gemini-3.5-flash",
      messages: [{ role: "user", content: "go" }],
      tools: [{ name: "ui_storyboard_add_shot" }]
    });
    expect(
      JSON.parse(fetchFn.mock.calls[0][1].body).toolConfig
    ).toBeUndefined();

    // A built-in with no function declarations needs no flag either.
    fetchFn.mockClear();
    await provider.generateMessage({
      model: "gemini-3.5-flash",
      messages: [{ role: "user", content: "go" }],
      tools: [{ name: "web_search" }]
    });
    expect(
      JSON.parse(fetchFn.mock.calls[0][1].body).toolConfig
    ).toBeUndefined();
  });

  it("maps code-interpreter tools to Gemini code execution", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [{ content: { parts: [{ text: "ok" }] } }]
      })
    );
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    await provider.generateMessage({
      model: "gemini-3.5-flash",
      messages: [{ role: "user", content: "calculate" }],
      tools: [{ name: "python", type: "code_interpreter" }]
    });
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).tools).toEqual([
      { codeExecution: {} }
    ]);
  });

  it("passes the caller AbortSignal to chat fetch", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [{ content: { parts: [{ text: "ok" }] } }]
      })
    );
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const controller = new AbortController();
    await provider.generateMessage({
      model: "gemini-3.5-flash",
      messages: [{ role: "user", content: "hi" }],
      signal: controller.signal
    });
    expect(fetchFn.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("passes the caller AbortSignal to streaming fetch", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeSSEStream([]));
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const controller = new AbortController();
    for await (const _item of provider.generateMessages({
      model: "gemini-3.5-flash",
      messages: [{ role: "user", content: "hi" }],
      signal: controller.signal
    })) {
      // exhaust the stream
    }
    expect(fetchFn.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("normalizes non-Error streaming abort reasons", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeSSEStream([]));
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const controller = new AbortController();
    controller.abort("stop");

    const consume = async (): Promise<void> => {
      for await (const _item of provider.generateMessages({
        model: "gemini-3.5-flash",
        messages: [{ role: "user", content: "hi" }],
        signal: controller.signal
      })) {
        // Consume the stream.
      }
    };

    await expect(consume()).rejects.toMatchObject({ name: "AbortError" });
  });

  it("accounts for thought tokens as billable output", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          thoughtsTokenCount: 20
        }
      })
    );
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const emitted: unknown[] = [];
    provider.setMessageEmitter((message) => emitted.push(message));
    await provider.generateMessageTraced({
      model: "gemini-3.5-flash",
      messages: [{ role: "user", content: "hi" }]
    });
    expect(emitted).toContainEqual(
      expect.objectContaining({ tokens_input: 10, tokens_output: 25 })
    );
  });

  it("coalesces adjacent roles and concatenates system instructions", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    const converted = await provider.convertMessages([
      { role: "system", content: "first" },
      { role: "system", content: "second" },
      { role: "user", content: "a" },
      { role: "user", content: "b" },
      { role: "assistant", content: "c" },
      { role: "assistant", content: "d" }
    ]);
    expect(converted.systemInstruction).toBe("first\nsecond");
    expect(converted.contents).toEqual([
      { role: "user", parts: [{ text: "a" }, { text: "b" }] },
      { role: "model", parts: [{ text: "c" }, { text: "d" }] }
    ]);
  });

  it("replays a persisted tool call with its thought signature", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    const converted = await provider.convertMessages([
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: null,
        toolCalls: [
          { id: "c1", name: "search", args: { q: "x" }, thought_signature: "sig" },
          { id: "c2", name: "search", args: { q: "y" } }
        ]
      }
    ]);
    const parts = converted.contents[1].parts;
    expect(parts[0].thoughtSignature).toBe("sig");
    // Gemini signs only the first call of a parallel batch — leave the rest bare.
    expect(parts[1].thoughtSignature).toBeUndefined();
  });

  it("stamps the skip sentinel on an unsigned tool call in history", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    const converted = await provider.convertMessages([
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "c1", name: "search", args: {} }]
      },
      { role: "tool", content: "result", toolCallId: "c1" },
      { role: "user", content: "again" }
    ]);
    expect(converted.contents[1].parts[0].thoughtSignature).toBe(
      "skip_thought_signature_validator"
    );
  });

  it("leaves the message's own raw parts untouched when replaying them", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    const rawParts = [
      { functionCall: { id: "c1", name: "search", args: {} } }
    ];
    const message: Message = {
      role: "assistant",
      content: null,
      toolCalls: [{ id: "c1", name: "search", args: {} }],
      _rawGeminiParts: rawParts
    };
    const converted = await provider.convertMessages([
      { role: "user", content: "hi" },
      message
    ]);
    expect(converted.contents[1].parts[0].thoughtSignature).toBe(
      "skip_thought_signature_validator"
    );
    expect(rawParts[0]).toEqual({
      functionCall: { id: "c1", name: "search", args: {} }
    });
  });

  it("preserves text-part thought signatures in non-streaming history", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [
          { content: { parts: [{ text: "answer", thoughtSignature: "sig" }] } }
        ]
      })
    );
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const message = await provider.generateMessage({
      model: "gemini-3.5-flash",
      messages: [{ role: "user", content: "hi" }]
    });
    expect(message._rawGeminiParts).toEqual([
      { text: "answer", thoughtSignature: "sig" }
    ]);
  });

  it("throws streamed API and prompt-block errors without a terminal chunk", async () => {
    for (const event of [
      { error: { message: "stream failed" } },
      { promptFeedback: { blockReason: "SAFETY" } }
    ]) {
      const provider = new GeminiProvider(
        { GEMINI_API_KEY: "k" },
        { fetchFn: vi.fn().mockResolvedValue(makeSSEStream([event])) }
      );
      const gen = provider.generateMessages({
        model: "gemini-3.5-flash",
        messages: [{ role: "user", content: "hi" }]
      });
      await expect(gen.next()).rejects.toThrow();
    }
  });

  it("rejects malformed non-streaming response shapes", async () => {
    const provider = new GeminiProvider(
      { GEMINI_API_KEY: "k" },
      {
        fetchFn: vi
          .fn()
          .mockResolvedValue(makeFetchResponse({ candidates: {} }))
      }
    );
    await expect(
      provider.generateMessage({
        model: "gemini-3.5-flash",
        messages: [{ role: "user", content: "hi" }]
      })
    ).rejects.toThrow("invalid candidates");
  });
});
