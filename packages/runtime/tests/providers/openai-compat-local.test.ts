/**
 * OpenAI-compatible behavior that local servers (llama-server, vLLM,
 * LM Studio) depend on: the request timeout covers headers only, reasoning
 * deltas surface as thinking chunks, array-content system prompts survive,
 * vLLM gets no default output cap, and a pasted `/v1` base URL is not doubled.
 */
import { describe, expect, it, vi } from "vitest";
import {
  OpenAICompatClient,
  localServerRoot
} from "../../src/providers/openai-compat/client.js";
import { VLLMProvider } from "../../src/providers/vllm-provider.js";
import { LMStudioProvider } from "../../src/providers/lmstudio-provider.js";
import { LlamaProvider } from "../../src/providers/llama-provider.js";
import type { ProviderStreamItem } from "../../src/providers/types.js";
import {
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch,
  requestBodyOf
} from "./helpers/compat-fetch.js";

/** An SSE response whose events arrive `gapMs` apart, honoring `signal`. */
function slowSSE(events: string[], gapMs: number, signal?: AbortSignal): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const event of events) {
        await new Promise((resolve) => setTimeout(resolve, gapMs));
        if (signal?.aborted) {
          controller.error(signal.reason);
          return;
        }
        controller.enqueue(encoder.encode(`data: ${event}\n\n`));
      }
      controller.close();
    }
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
}

describe("OpenAICompatClient timeout", () => {
  it("does not abort a stream that outlives the header timeout", async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) =>
      slowSSE(
        ['{"choices":[{"delta":{"content":"a"}}]}', '{"choices":[{"delta":{"content":"b"}}]}', "[DONE]"],
        40,
        init?.signal ?? undefined
      )
    );
    const client = new OpenAICompatClient({
      baseURL: "http://local/v1",
      apiKey: "k",
      fetchFn: fetchFn as unknown as typeof fetch,
      timeoutMs: 30,
      maxRetries: 0
    });
    const chunks = [];
    for await (const chunk of client.chatCompletionsStream({
      model: "m",
      messages: []
    })) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(2);
  });

  it("still aborts when headers do not arrive in time", async () => {
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason)
          );
        })
    );
    const client = new OpenAICompatClient({
      baseURL: "http://local/v1",
      apiKey: "k",
      fetchFn: fetchFn as unknown as typeof fetch,
      timeoutMs: 20,
      maxRetries: 0
    });
    await expect(
      client.chatCompletions({ model: "m", messages: [] })
    ).rejects.toThrow(/time/i);
  });
});

async function drain(
  gen: AsyncGenerator<ProviderStreamItem>
): Promise<ProviderStreamItem[]> {
  const out: ProviderStreamItem[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe("OpenAICompatProvider on local servers", () => {
  it("emits reasoning deltas as thinking chunks", async () => {
    const fetchFn = mockChatFetch(
      chatSSEResponse([
        { choices: [{ delta: { reasoning_content: "let me think" } }] },
        { choices: [{ delta: { reasoning: "more" } }] },
        { choices: [{ delta: { content: "answer" } }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] }
      ])
    );
    const provider = new LlamaProvider(
      { LLAMA_CPP_URL: "http://local:8080" },
      { fetchFn }
    );
    const items = await drain(
      provider.generateMessages({
        messages: [{ role: "user", content: "hi" }],
        model: "qwen3"
      })
    );
    const thinking = items.filter(
      (i) => "thinking" in i && i.thinking === true
    );
    expect(thinking.map((i) => ("content" in i ? i.content : ""))).toEqual([
      "let me think",
      "more"
    ]);
  });

  it("keeps the text of an array-content system message", async () => {
    const fetchFn = mockChatFetch(
      chatJsonResponse({ choices: [{ message: { content: "ok" } }] })
    );
    const provider = new LMStudioProvider({}, { fetchFn });
    await provider.generateMessage({
      messages: [
        {
          role: "system",
          content: [
            { type: "text", text: "Rule one." },
            { type: "text", text: "Rule two." }
          ]
        },
        { role: "user", content: "hi" }
      ],
      model: "m"
    });
    const body = requestBodyOf(fetchFn);
    expect((body.messages as Array<Record<string, unknown>>)[0]).toEqual({
      role: "system",
      content: "Rule one.\nRule two."
    });
  });

  it("sends no max_completion_tokens to vLLM unless the caller sets one", async () => {
    const fetchFn = mockChatFetch(
      chatJsonResponse({ choices: [{ message: { content: "ok" } }] })
    );
    const provider = new VLLMProvider(
      { VLLM_BASE_URL: "http://local:8000" },
      { fetchFn }
    );
    await provider.generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "m"
    });
    expect(requestBodyOf(fetchFn, 0)).not.toHaveProperty(
      "max_completion_tokens"
    );
    await provider.generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "m",
      maxTokens: 256
    });
    expect(requestBodyOf(fetchFn, 1).max_completion_tokens).toBe(256);
  });

  it("keeps the default cap for other compat providers", async () => {
    const fetchFn = mockChatFetch(
      chatJsonResponse({ choices: [{ message: { content: "ok" } }] })
    );
    const provider = new LMStudioProvider({}, { fetchFn });
    await provider.generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "m"
    });
    expect(requestBodyOf(fetchFn).max_completion_tokens).toBe(16384);
  });
});

describe("local server base URLs", () => {
  it("strips a trailing /v1 so it is not doubled", () => {
    expect(localServerRoot("http://h:8000/v1")).toBe("http://h:8000");
    expect(localServerRoot("http://h:8000/v1/")).toBe("http://h:8000");
    expect(localServerRoot("http://h:8000/")).toBe("http://h:8000");
    expect(localServerRoot("http://h:8000/api/v1x")).toBe("http://h:8000/api/v1x");
  });

  it("builds /v1 once for vLLM, LM Studio and llama-server", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: "m" }] }), { status: 200 })
    );
    const f = fetchFn as unknown as typeof fetch;
    await new VLLMProvider(
      { VLLM_BASE_URL: "http://a:1/v1" },
      { fetchFn: f }
    ).getAvailableLanguageModels();
    await new LMStudioProvider(
      { LMSTUDIO_API_URL: "http://b:2/v1/" },
      { fetchFn: f }
    ).getAvailableLanguageModels();
    await new LlamaProvider(
      { LLAMA_CPP_URL: "http://c:3/v1" },
      { fetchFn: f }
    ).getAvailableLanguageModels();
    const calls = fetchFn.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map((c) => c[0])).toEqual([
      "http://a:1/v1/models",
      "http://b:2/v1/models",
      "http://c:3/v1/models"
    ]);
    // Every listing is bounded so an unreachable host can't stall the menu.
    expect(calls.every((c) => c[1]?.signal instanceof AbortSignal)).toBe(true);
  });
});
