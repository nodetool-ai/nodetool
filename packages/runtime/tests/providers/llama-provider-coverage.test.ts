/**
 * Coverage for LlamaProvider's llama-server specifics: model listing, the
 * native tool-calling path it shares with the other OpenAI-compatible
 * providers, and context-length classification.
 */

import { describe, it, expect, vi } from "vitest";
import { LlamaProvider } from "../../src/providers/llama-provider.js";
import {
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch,
  requestBodyOf
} from "./helpers/compat-fetch.js";

const makeProvider = (fetchFn?: unknown) =>
  new LlamaProvider(
    { LLAMA_CPP_URL: "http://localhost:8080" },
    fetchFn ? { fetchFn: fetchFn as typeof fetch } : {}
  );

describe("LlamaProvider – native tool calling", () => {
  it("sends tools on the wire instead of emulating them in the prompt", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({ choices: [{ message: { content: "ok" } }] })
    );
    const provider = makeProvider(fetchMock);

    await provider.generateMessage({
      model: "test",
      messages: [{ role: "user", content: "search" }],
      tools: [
        {
          name: "search",
          description: "Search the web",
          inputSchema: { type: "object", properties: { q: { type: "string" } } }
        }
      ]
    });

    const body = requestBodyOf(fetchMock);
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "search",
          description: "Search the web",
          parameters: { type: "object", properties: { q: { type: "string" } } }
        }
      }
    ]);
    // The prompt must stay clean — no injected tool documentation.
    const messages = body.messages as Array<{ content?: string }>;
    expect(messages.some((m) => String(m.content ?? "").includes("search("))).toBe(
      false
    );
  });

  it("forwards sampling parameters", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({ choices: [{ message: { content: "ok" } }] })
    );
    const provider = makeProvider(fetchMock);

    await provider.generateMessage({
      model: "test",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.1,
      topP: 0.5,
      presencePenalty: 0.25,
      frequencyPenalty: 0.75
    });

    const body = requestBodyOf(fetchMock);
    expect(body.temperature).toBe(0.1);
    expect(body.top_p).toBe(0.5);
    expect(body.presence_penalty).toBe(0.25);
    expect(body.frequency_penalty).toBe(0.75);
  });

  it("relays a tool result as a native tool message, not prose", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({ choices: [{ message: { content: "ok" } }] })
    );
    const provider = makeProvider(fetchMock);

    await provider.generateMessage({
      model: "test",
      messages: [
        { role: "user", content: "calc" },
        {
          role: "assistant",
          content: "calling tool",
          toolCalls: [{ id: "tc1", name: "calc", args: {} }]
        },
        { role: "tool", content: "42", toolCallId: "tc1" }
      ]
    });

    const messages = requestBodyOf(fetchMock).messages as Array<
      Record<string, unknown>
    >;
    const toolMsg = messages.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.tool_call_id).toBe("tc1");
    expect(
      messages.some((m) => String(m.content ?? "").includes("Tool result:"))
    ).toBe(false);
  });

  it("yields tool calls from the stream, then a terminal chunk", async () => {
    const fetchMock = mockChatFetch(() =>
      chatSSEResponse([
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
        { choices: [{ delta: {}, finish_reason: "tool_calls" }] }
      ])
    );
    const provider = makeProvider(fetchMock);

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "test",
      messages: [{ role: "user", content: "search" }]
    })) {
      out.push(item);
    }

    expect(out).toContainEqual({ id: "tc1", name: "search", args: { q: "x" } });
    // A completion that ends on `tool_calls` still closes the stream.
    expect(out).toContainEqual({ type: "chunk", content: "", done: true });
  });

  it("emits a terminal chunk when generation stops on the token cap", async () => {
    const fetchMock = mockChatFetch(() =>
      chatSSEResponse([
        { choices: [{ delta: { content: "Once upon" }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: "length" }] }
      ])
    );
    const provider = makeProvider(fetchMock);

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "test",
      messages: [{ role: "user", content: "story" }]
    })) {
      out.push(item);
    }

    expect(out).toContainEqual({ type: "chunk", content: "", done: true });
  });
});

describe("LlamaProvider – generateMessage with native tool calls", () => {
  it("uses native tool calls when available", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
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
      })
    );
    const provider = makeProvider(fetchMock);

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

    const models = await makeProvider(fetchFn).getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "model1", name: "model1", provider: "llama_cpp" }
    ]);
  });

  it("returns empty on failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false });
    expect(
      await makeProvider(fetchFn).getAvailableLanguageModels()
    ).toEqual([]);
  });

  it("returns empty when the host is unreachable", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    expect(
      await makeProvider(fetchFn).getAvailableLanguageModels()
    ).toEqual([]);
  });
});

describe("LlamaProvider – does not inherit OpenAI's catalog", () => {
  it("reports no media or embedding models", async () => {
    const provider = makeProvider();
    expect(await provider.getAvailableImageModels()).toEqual([]);
    expect(await provider.getAvailableTTSModels()).toEqual([]);
    expect(await provider.getAvailableASRModels()).toEqual([]);
    expect(await provider.getAvailableVideoModels()).toEqual([]);
    expect(await provider.getAvailableEmbeddingModels()).toEqual([]);
  });
});
