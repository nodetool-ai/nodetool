import { describe, it, expect, vi } from "vitest";
import { sseEvents } from "../../src/providers/openai-compat/sse.js";
import {
  OpenAICompatClient,
  trimTrailingSlashes
} from "../../src/providers/openai-compat/client.js";
import { OpenAICompatError } from "../../src/providers/openai-compat/errors.js";
import type { ChatCompletionChunk } from "../../src/providers/openai-compat/types.js";
import {
  chatErrorResponse,
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch,
  requestBodyOf,
  sseBody
} from "./helpers/compat-fetch.js";

/** A ReadableStream that emits the given strings as separate network chunks. */
function streamOf(...parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    }
  });
}

async function collect(body: ReadableStream<Uint8Array>): Promise<string[]> {
  const out: string[] = [];
  for await (const event of sseEvents(body)) out.push(event);
  return out;
}

describe("sseEvents", () => {
  it("parses one event per data block", async () => {
    const events = await collect(streamOf('data: {"a":1}\n\ndata: {"b":2}\n\n'));
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("handles events split across network chunks", async () => {
    const events = await collect(
      streamOf("data: {\"a", '":1}', "\n", "\ndata:", ' {"b":2}\n\n')
    );
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("handles multi-byte UTF-8 split across chunk boundaries", async () => {
    const encoded = new TextEncoder().encode('data: "héllo"\n\n');
    const cut = 9; // inside the two-byte é sequence
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, cut));
        controller.enqueue(encoded.slice(cut));
        controller.close();
      }
    });
    expect(await collect(body)).toEqual(['"héllo"']);
  });

  it("handles CRLF line endings", async () => {
    const events = await collect(
      streamOf('data: {"a":1}\r\n\r\ndata: [DONE]\r\n\r\n')
    );
    expect(events).toEqual(['{"a":1}', "[DONE]"]);
  });

  it("joins multiple data lines of one event with newlines", async () => {
    const events = await collect(streamOf("data: line1\ndata: line2\n\n"));
    expect(events).toEqual(["line1\nline2"]);
  });

  it("ignores comments and non-data fields", async () => {
    const events = await collect(
      streamOf(': ping\nevent: message\nid: 42\ndata: {"a":1}\n\n')
    );
    expect(events).toEqual(['{"a":1}']);
  });

  it("flushes a final event not terminated by a blank line", async () => {
    const events = await collect(streamOf('data: {"a":1}\n\ndata: [DONE]'));
    expect(events).toEqual(['{"a":1}', "[DONE]"]);
  });

  it("does not strip more than one leading space from data payloads", async () => {
    const events = await collect(streamOf("data:  spaced\n\n"));
    expect(events).toEqual([" spaced"]);
  });
});

describe("trimTrailingSlashes", () => {
  it("removes any number of trailing slashes", () => {
    expect(trimTrailingSlashes("http://x/v1///")).toBe("http://x/v1");
    expect(trimTrailingSlashes("http://x/v1")).toBe("http://x/v1");
    expect(trimTrailingSlashes("////")).toBe("");
  });
});

describe("OpenAICompatClient.chatCompletions", () => {
  const request = {
    model: "test-model",
    messages: [{ role: "user", content: "hi" }]
  };

  it("POSTs to /chat/completions with auth and body, parses the response", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [{ message: { content: "hello" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 3, completion_tokens: 2 }
      })
    );
    const client = new OpenAICompatClient({
      baseURL: "https://api.example.com/v1/",
      apiKey: "secret",
      defaultHeaders: { "X-Title": "NodeTool" },
      fetchFn: fetchMock as unknown as typeof fetch
    });

    const response = await client.chatCompletions(request);

    expect(response.choices?.[0]?.message?.content).toBe("hello");
    expect(response.usage?.prompt_tokens).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret",
          "Content-Type": "application/json",
          "X-Title": "NodeTool"
        })
      })
    );
    expect(requestBodyOf(fetchMock as never)).toEqual({
      model: "test-model",
      messages: [{ role: "user", content: "hi" }],
      stream: false
    });
  });

  it("maps a 400 with an OpenAI-style error body to a typed error", async () => {
    const fetchMock = mockChatFetch(
      chatErrorResponse(400, "context length exceeded")
    );
    const client = new OpenAICompatClient({
      baseURL: "https://api.example.com/v1",
      apiKey: "k",
      fetchFn: fetchMock as unknown as typeof fetch,
      maxRetries: 0
    });

    const error = await client.chatCompletions(request).catch((e) => e);
    expect(error).toBeInstanceOf(OpenAICompatError);
    expect(error.status).toBe(400);
    // Message matches the openai SDK "<status> <message>" shape callers grep.
    expect(String(error)).toContain("400 context length exceeded");
  });

  it("maps a 429 so BaseProvider rate-limit detection keeps working", async () => {
    const fetchMock = mockChatFetch(
      chatErrorResponse(429, "Rate limit reached")
    );
    const client = new OpenAICompatClient({
      baseURL: "https://api.example.com/v1",
      apiKey: "k",
      fetchFn: fetchMock as unknown as typeof fetch,
      maxRetries: 0
    });

    const error = await client.chatCompletions(request).catch((e) => e);
    expect(error.status).toBe(429);
    expect(/429|rate.?limit|too many requests/i.test(String(error))).toBe(true);
  });

  it("surfaces a non-JSON error body as the message", async () => {
    const fetchMock = mockChatFetch(
      () => new Response("upstream exploded", { status: 502 })
    );
    const client = new OpenAICompatClient({
      baseURL: "https://api.example.com/v1",
      apiKey: "k",
      fetchFn: fetchMock as unknown as typeof fetch,
      maxRetries: 0
    });

    const error = await client.chatCompletions(request).catch((e) => e);
    expect(error.status).toBe(502);
    expect(String(error)).toContain("upstream exploded");
  });

  it("retries retryable statuses then succeeds", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const fetchMock = vi.fn(async () => {
        calls += 1;
        if (calls === 1) return chatErrorResponse(500, "flaky");
        return chatJsonResponse({ choices: [{ message: { content: "ok" } }] });
      });
      const client = new OpenAICompatClient({
        baseURL: "https://api.example.com/v1",
        apiKey: "k",
        fetchFn: fetchMock as unknown as typeof fetch,
        maxRetries: 2
      });

      const pending = client.chatCompletions(request);
      await vi.runAllTimersAsync();
      const response = await pending;
      expect(response.choices?.[0]?.message?.content).toBe("ok");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry non-retryable statuses", async () => {
    const fetchMock = mockChatFetch(chatErrorResponse(400, "bad request"));
    const client = new OpenAICompatClient({
      baseURL: "https://api.example.com/v1",
      apiKey: "k",
      fetchFn: fetchMock as unknown as typeof fetch,
      maxRetries: 2
    });

    await expect(client.chatCompletions(request)).rejects.toThrow(
      "400 bad request"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("OpenAICompatClient.chatCompletionsStream", () => {
  const request = {
    model: "test-model",
    messages: [{ role: "user", content: "hi" }]
  };

  function clientFor(fetchMock: unknown): OpenAICompatClient {
    return new OpenAICompatClient({
      baseURL: "https://api.example.com/v1",
      apiKey: "k",
      fetchFn: fetchMock as typeof fetch,
      maxRetries: 0
    });
  }

  it("yields parsed chunks and stops at [DONE]", async () => {
    const fetchMock = mockChatFetch(() =>
      chatSSEResponse([
        { choices: [{ delta: { content: "he" }, finish_reason: null }] },
        { choices: [{ delta: { content: "llo" }, finish_reason: "stop" }] }
      ])
    );

    const chunks: ChatCompletionChunk[] = [];
    for await (const chunk of clientFor(fetchMock).chatCompletionsStream(
      request
    )) {
      chunks.push(chunk);
    }

    expect(chunks.map((c) => c.choices?.[0]?.delta?.content)).toEqual([
      "he",
      "llo"
    ]);
    expect(requestBodyOf(fetchMock as never)).toMatchObject({ stream: true });
    const headers = (
      (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    ).headers as Record<string, string>;
    expect(headers.Accept).toBe("text/event-stream");
  });

  it("assembles tool-call deltas across chunks (provider-side contract)", async () => {
    const fetchMock = mockChatFetch(() =>
      chatSSEResponse([
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: "c1", function: { name: "f", arguments: '{"a"' } }
                ]
              },
              finish_reason: null
            }
          ]
        },
        {
          choices: [
            {
              delta: { tool_calls: [{ index: 0, function: { arguments: ":1}" } }] },
              finish_reason: null
            }
          ]
        },
        { choices: [{ delta: {}, finish_reason: "tool_calls" }] }
      ])
    );

    const chunks: ChatCompletionChunk[] = [];
    for await (const chunk of clientFor(fetchMock).chatCompletionsStream(
      request
    )) {
      chunks.push(chunk);
    }

    // The client passes deltas through untouched; providers assemble them.
    expect(chunks[0].choices?.[0]?.delta?.tool_calls?.[0]?.id).toBe("c1");
    expect(chunks[1].choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments).toBe(
      ":1}"
    );
    expect(chunks[2].choices?.[0]?.finish_reason).toBe("tool_calls");
  });

  it("throws a typed error on a mid-stream error event", async () => {
    const body =
      'data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}\n\n' +
      'data: {"error":{"message":"stream blew up","code":"boom"}}\n\n';
    const fetchMock = vi.fn(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" }
        })
    );

    const seen: string[] = [];
    const error = await (async () => {
      try {
        for await (const chunk of clientFor(fetchMock).chatCompletionsStream(
          request
        )) {
          seen.push(String(chunk.choices?.[0]?.delta?.content));
        }
        return null;
      } catch (e) {
        return e;
      }
    })();

    expect(seen).toEqual(["hi"]);
    expect(error).toBeInstanceOf(OpenAICompatError);
    expect(String(error)).toContain("stream blew up");
    expect((error as OpenAICompatError).code).toBe("boom");
  });

  it("throws on a mid-stream error event carrying a completion choice", async () => {
    const body =
      'data: {"error":{"message":"stream blew up","code":429},"choices":[{"index":0,"delta":{"content":""},"finish_reason":"error"}]}\n\n';
    const fetchMock = vi.fn(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" }
        })
    );

    const error = await (async () => {
      try {
        for await (const chunk of clientFor(fetchMock).chatCompletionsStream(
          request
        )) {
          void chunk;
        }
        return null;
      } catch (e) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(OpenAICompatError);
    expect((error as OpenAICompatError).code).toBe("429");
  });

  it("throws on a non-2xx streaming response with the parsed error message", async () => {
    const fetchMock = mockChatFetch(chatErrorResponse(401, "bad key"));
    const error = await (async () => {
      try {
        for await (const chunk of clientFor(fetchMock).chatCompletionsStream(
          request
        )) {
          void chunk;
        }
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect((error as OpenAICompatError).status).toBe(401);
    expect(String(error)).toContain("401 bad key");
  });

  it("throws on unparseable stream data", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("data: not-json\n\n", {
          status: 200,
          headers: { "Content-Type": "text/event-stream" }
        })
    );
    const iterate = async () => {
      for await (const chunk of clientFor(fetchMock).chatCompletionsStream(
        request
      )) {
        void chunk;
      }
    };
    await expect(iterate()).rejects.toThrow(
      "could not parse stream event as JSON"
    );
  });

  it("sseBody helper round-trips through the parser", async () => {
    const body = sseBody([{ a: 1 }]);
    expect(body).toBe('data: {"a":1}\n\ndata: [DONE]\n\n');
  });
});
