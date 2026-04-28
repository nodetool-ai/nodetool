import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  handleOpenAIRequest,
  convertMessages,
  convertTools,
  createSSEStream,
  resolveProvider,
  type OpenAIApiOptions
} from "../src/openai-api.js";
import * as models from "@nodetool/models";
import type { BaseProvider } from "@nodetool/runtime";
import type {
  Message,
  ProviderStreamItem,
  ProviderTool
} from "@nodetool/runtime";
import type { Chunk } from "@nodetool/protocol";

// ---------------------------------------------------------------------------
// Mock provider
// ---------------------------------------------------------------------------

function createMockProvider(items: ProviderStreamItem[]): BaseProvider {
  return {
    provider: "mock",
    generateMessages: vi.fn(async function* () {
      for (const item of items) {
        yield item;
      }
    }),
    async *generateMessagesTraced(...args: any[]) {
      yield* (this as any).generateMessages(...args);
    },
    async generateMessageTraced(...args: any[]) {
      return (this as any).generateMessage(...args);
    },
    generateMessage: vi.fn(),
    hasToolSupport: async () => true,
    getAvailableLanguageModels: async () => [],
    getAvailableImageModels: async () => [],
    getAvailableVideoModels: async () => [],
    getAvailableTTSModels: async () => [],
    getAvailableASRModels: async () => [],
    getAvailableEmbeddingModels: async () => [],
    getContainerEnv: () => ({})
  } as unknown as BaseProvider;
}

function makeChunk(content: string): Chunk {
  return { type: "chunk", content };
}

function makeToolCall(
  id: string,
  name: string,
  args: Record<string, unknown>
): ProviderStreamItem {
  return { id, name, args } as ProviderStreamItem;
}

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function collectSSE(
  stream: ReadableStream<Uint8Array>
): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const events: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    // Split by double newlines to get individual SSE events
    const parts = text.split("\n\n").filter((p) => p.trim().length > 0);
    events.push(...parts);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OpenAI-compatible API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /v1/models", () => {
    it("returns a list of models", async () => {
      const request = new Request("http://localhost/v1/models", {
        method: "GET"
      });
      const response = await handleOpenAIRequest(
        request,
        "/v1/models",
        "user-1"
      );

      expect(response).not.toBeNull();
      expect(response!.status).toBe(200);

      const body = (await jsonBody(response!)) as {
        object: string;
        data: Array<{ id: string; object: string; owned_by: string }>;
      };
      expect(body.object).toBe("list");
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data[0].object).toBe("model");
      expect(body.data[0]).toHaveProperty("id");
      expect(body.data[0]).toHaveProperty("owned_by");
    });
  });

  describe("POST /v1/chat/completions (non-streaming)", () => {
    it("returns a chat completion response", async () => {
      const mockProvider = createMockProvider([
        makeChunk("Hello"),
        makeChunk(", world!")
      ]);

      const options: OpenAIApiOptions = { provider: mockProvider };
      const request = new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "test-model",
          messages: [{ role: "user", content: "Hi" }],
          stream: false
        })
      });

      const response = await handleOpenAIRequest(
        request,
        "/v1/chat/completions",
        "user-1",
        options
      );

      expect(response).not.toBeNull();
      expect(response!.status).toBe(200);

      const body = (await jsonBody(response!)) as {
        id: string;
        object: string;
        model: string;
        choices: Array<{
          index: number;
          message: { role: string; content: string };
          finish_reason: string;
        }>;
        usage: Record<string, number>;
      };

      expect(body.object).toBe("chat.completion");
      expect(body.id).toMatch(/^chatcmpl-/);
      expect(body.model).toBe("test-model");
      expect(body.choices).toHaveLength(1);
      expect(body.choices[0].message.role).toBe("assistant");
      expect(body.choices[0].message.content).toBe("Hello, world!");
      expect(body.choices[0].finish_reason).toBe("stop");
      expect(body.usage).toBeDefined();
    });

    it("includes tool calls in non-streaming response", async () => {
      const mockProvider = createMockProvider([
        makeToolCall("call-1", "get_weather", { city: "NYC" })
      ]);

      const options: OpenAIApiOptions = { provider: mockProvider };
      const request = new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "test-model",
          messages: [{ role: "user", content: "What is the weather?" }],
          stream: false,
          tools: [
            {
              type: "function",
              function: {
                name: "get_weather",
                description: "Get weather",
                parameters: {
                  type: "object",
                  properties: { city: { type: "string" } }
                }
              }
            }
          ]
        })
      });

      const response = await handleOpenAIRequest(
        request,
        "/v1/chat/completions",
        "user-1",
        options
      );

      expect(response).not.toBeNull();
      const body = (await jsonBody(response!)) as {
        choices: Array<{
          message: {
            role: string;
            tool_calls?: Array<{
              id: string;
              type: string;
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason: string;
        }>;
      };

      expect(body.choices[0].finish_reason).toBe("tool_calls");
      expect(body.choices[0].message.tool_calls).toHaveLength(1);
      expect(body.choices[0].message.tool_calls![0].id).toBe("call-1");
      expect(body.choices[0].message.tool_calls![0].function.name).toBe(
        "get_weather"
      );
      expect(
        JSON.parse(body.choices[0].message.tool_calls![0].function.arguments)
      ).toEqual({
        city: "NYC"
      });
    });
  });

  describe("POST /v1/chat/completions (streaming)", () => {
    it("returns SSE-formatted stream", async () => {
      const mockProvider = createMockProvider([
        makeChunk("Hello"),
        makeChunk(" there")
      ]);

      const options: OpenAIApiOptions = { provider: mockProvider };
      const request = new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "test-model",
          messages: [{ role: "user", content: "Hi" }],
          stream: true
        })
      });

      const response = await handleOpenAIRequest(
        request,
        "/v1/chat/completions",
        "user-1",
        options
      );

      expect(response).not.toBeNull();
      expect(response!.headers.get("content-type")).toBe("text/event-stream");

      const events = await collectSSE(response!.body!);

      // Should have: chunk "Hello", chunk " there", final chunk with finish_reason, [DONE]
      expect(events.length).toBeGreaterThanOrEqual(4);

      // First event should be a data chunk with content
      const first = events[0];
      expect(first).toMatch(/^data: /);
      const firstData = JSON.parse(first.replace("data: ", ""));
      expect(firstData.object).toBe("chat.completion.chunk");
      expect(firstData.choices[0].delta.content).toBe("Hello");
      expect(firstData.choices[0].finish_reason).toBeNull();

      // Second chunk
      const secondData = JSON.parse(events[1].replace("data: ", ""));
      expect(secondData.choices[0].delta.content).toBe(" there");

      // Final chunk should have finish_reason = "stop"
      const finalData = JSON.parse(
        events[events.length - 2].replace("data: ", "")
      );
      expect(finalData.choices[0].finish_reason).toBe("stop");
      expect(finalData.choices[0].delta).toEqual({});

      // Last event should be [DONE]
      expect(events[events.length - 1]).toBe("data: [DONE]");
    });

    it("streams tool calls in SSE format", async () => {
      const mockProvider = createMockProvider([
        makeToolCall("call-42", "search", { query: "test" })
      ]);

      const options: OpenAIApiOptions = { provider: mockProvider };
      const request = new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "test-model",
          messages: [{ role: "user", content: "search for test" }],
          stream: true
        })
      });

      const response = await handleOpenAIRequest(
        request,
        "/v1/chat/completions",
        "user-1",
        options
      );

      const events = await collectSSE(response!.body!);
      // tool call chunk, finish chunk, [DONE]
      expect(events.length).toBeGreaterThanOrEqual(3);

      const toolChunkData = JSON.parse(events[0].replace("data: ", ""));
      expect(toolChunkData.choices[0].delta.tool_calls).toBeDefined();
      expect(toolChunkData.choices[0].delta.tool_calls[0].id).toBe("call-42");
      expect(toolChunkData.choices[0].delta.tool_calls[0].function.name).toBe(
        "search"
      );

      // finish_reason should be "tool_calls"
      const finalData = JSON.parse(
        events[events.length - 2].replace("data: ", "")
      );
      expect(finalData.choices[0].finish_reason).toBe("tool_calls");
    });

    it("defaults to non-streaming when stream is not specified", async () => {
      const mockProvider = createMockProvider([makeChunk("test")]);
      const options: OpenAIApiOptions = { provider: mockProvider };
      const request = new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "test-model",
          messages: [{ role: "user", content: "Hi" }]
        })
      });

      const response = await handleOpenAIRequest(
        request,
        "/v1/chat/completions",
        "user-1",
        options
      );

      // Per OpenAI API spec, default is non-streaming (stream must be explicitly true)
      expect(response!.headers.get("content-type")).toBe("application/json");
    });
  });

  describe("convertMessages", () => {
    it("converts basic messages", () => {
      const result = convertMessages([
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" }
      ]);

      expect(result).toEqual([
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" }
      ]);
    });

    it("converts messages with tool calls", () => {
      const result = convertMessages([
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "tc-1",
              type: "function" as const,
              function: { name: "get_time", arguments: "{}" }
            }
          ]
        }
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("assistant");
      expect(result[0].toolCalls).toEqual([
        { id: "tc-1", name: "get_time", args: {} }
      ]);
    });

    it("converts tool result messages", () => {
      const result = convertMessages([
        { role: "tool", content: "result data", tool_call_id: "tc-1" }
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("tool");
      expect(result[0].content).toBe("result data");
      expect(result[0].toolCallId).toBe("tc-1");
    });
  });

  describe("convertTools", () => {
    it("returns undefined for empty tools", () => {
      expect(convertTools(undefined)).toBeUndefined();
      expect(convertTools([])).toBeUndefined();
    });

    it("converts OpenAI tool format to internal format", () => {
      const result = convertTools([
        {
          type: "function",
          function: {
            name: "search",
            description: "Search the web",
            parameters: {
              type: "object",
              properties: { query: { type: "string" } }
            }
          }
        }
      ]);

      expect(result).toEqual([
        {
          name: "search",
          description: "Search the web",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } }
          }
        }
      ]);
    });
  });

  describe("unmatched routes", () => {
    it("returns null for unknown paths", async () => {
      const request = new Request("http://localhost/v1/unknown", {
        method: "GET"
      });
      const response = await handleOpenAIRequest(
        request,
        "/v1/unknown",
        "user-1"
      );
      expect(response).toBeNull();
    });

    it("returns null for wrong method on /v1/models", async () => {
      const request = new Request("http://localhost/v1/models", {
        method: "POST"
      });
      const response = await handleOpenAIRequest(
        request,
        "/v1/models",
        "user-1"
      );
      expect(response).toBeNull();
    });

    it("returns null for wrong method on /v1/chat/completions", async () => {
      const request = new Request("http://localhost/v1/chat/completions", {
        method: "GET"
      });
      const response = await handleOpenAIRequest(
        request,
        "/v1/chat/completions",
        "user-1"
      );
      expect(response).toBeNull();
    });
  });

  describe("error handling", () => {
    it("returns 400 for invalid JSON body", async () => {
      const request = new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json"
      });

      const response = await handleOpenAIRequest(
        request,
        "/v1/chat/completions",
        "user-1",
        { provider: createMockProvider([]) }
      );

      expect(response).not.toBeNull();
      expect(response!.status).toBe(400);
    });
  });

  describe("provider resolution", () => {
    it("uses the authenticated user's secret when resolving providers", async () => {
      const getSecretSpy = vi
        .spyOn(models, "getSecret")
        .mockImplementation(async (key, userId) => `${userId}-${key}`);

      const provider = (await resolveProvider(
        "gpt-4o",
        undefined,
        "user-2"
      )) as { apiKey: string };
      expect(getSecretSpy).toHaveBeenCalledWith("OPENAI_API_KEY", "user-2");
      expect(provider.apiKey).toBe("user-2-OPENAI_API_KEY");
    });
  });
});
