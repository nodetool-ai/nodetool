/**
 * Ollama regressions from the local-inference review: `num_ctx` is always
 * sent (Ollama's server default silently truncates long prompts), the window
 * is reported for compaction, mid-stream `{"error"}` lines throw, error
 * bodies reach the message, tool-call ids never repeat, and an unterminated
 * last NDJSON line is still parsed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OLLAMA_DEFAULT_NUM_CTX,
  OllamaProvider
} from "../../src/providers/ollama-provider.js";
import { resolveContextWindow } from "../../src/providers/context-window.js";
import type { ProviderStreamItem } from "../../src/providers/types.js";

const URL_ = "http://localhost:11434";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function ndjson(text: string): Response {
  return new Response(text, { status: 200 });
}

/** Fetch that answers `/api/show` with `show` and `/api/chat` with `chat()`. */
function fetchWith(
  show: Record<string, unknown> | null,
  chat: () => Response
): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string) => {
    if (String(url).endsWith("/api/show")) {
      return show ? json(show) : json({ error: "not found" }, 404);
    }
    return chat();
  });
}

function chatBody(fetchFn: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchFn.mock.calls.find((c) =>
    String(c[0]).endsWith("/api/chat")
  );
  return JSON.parse(String((call?.[1] as RequestInit).body)) as Record<
    string,
    unknown
  >;
}

const doneLine = `${JSON.stringify({ message: { content: "" }, done: true })}\n`;

async function drain(
  gen: AsyncGenerator<ProviderStreamItem>
): Promise<ProviderStreamItem[]> {
  const out: ProviderStreamItem[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

afterEach(() => {
  delete process.env.OLLAMA_CONTEXT_LENGTH;
});

describe("OllamaProvider num_ctx", () => {
  it("caps the model's trained context length at the default", async () => {
    const fetchFn = fetchWith(
      { model_info: { "llama.context_length": 131072 } },
      () => json({ message: { content: "ok" } })
    );
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: URL_ },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    await provider.generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "llama3.1"
    });
    expect(chatBody(fetchFn).options).toMatchObject({
      num_ctx: OLLAMA_DEFAULT_NUM_CTX
    });
  });

  it("uses a smaller trained length as is", async () => {
    const fetchFn = fetchWith(
      { model_info: { "gemma.context_length": 8192 } },
      () => json({ message: { content: "ok" } })
    );
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: URL_ },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    await provider.generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "gemma"
    });
    expect(chatBody(fetchFn).options).toMatchObject({ num_ctx: 8192 });
  });

  it("honors a Modelfile num_ctx", async () => {
    const fetchFn = fetchWith(
      {
        parameters: 'stop "<|eot|>"\nnum_ctx                        65536',
        model_info: { "llama.context_length": 131072 }
      },
      () => json({ message: { content: "ok" } })
    );
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: URL_ },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    await expect(provider.getContextWindow("custom")).resolves.toBe(65536);
  });

  it("lets OLLAMA_CONTEXT_LENGTH override the model", async () => {
    process.env.OLLAMA_CONTEXT_LENGTH = "16384";
    const fetchFn = fetchWith(
      { model_info: { "llama.context_length": 131072 } },
      () => json({ message: { content: "ok" } })
    );
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: URL_ },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    await provider.generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "llama3.1"
    });
    expect(chatBody(fetchFn).options).toMatchObject({ num_ctx: 16384 });
  });

  it("falls back to the default when /api/show fails", async () => {
    const fetchFn = fetchWith(null, () => json({ message: { content: "ok" } }));
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: URL_ },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    await expect(provider.getContextWindow("missing")).resolves.toBe(
      OLLAMA_DEFAULT_NUM_CTX
    );
  });

  it("reports the window to resolveContextWindow instead of the 128k fallback", async () => {
    const fetchFn = fetchWith(
      { model_info: { "qwen3.context_length": 40960 } },
      () => json({})
    );
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: URL_ },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    await expect(resolveContextWindow(provider, "qwen3")).resolves.toEqual({
      tokens: OLLAMA_DEFAULT_NUM_CTX,
      source: "provider"
    });
  });
});

describe("OllamaProvider stream errors", () => {
  it("throws on a mid-stream error line instead of ending quietly", async () => {
    const fetchFn = fetchWith({}, () =>
      ndjson(
        `${JSON.stringify({ message: { content: "partial" }, done: false })}\n` +
          `${JSON.stringify({ error: "llama runner process has terminated" })}\n`
      )
    );
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: URL_ },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    await expect(
      drain(
        provider.generateMessages({
          messages: [{ role: "user", content: "hi" }],
          model: "m"
        })
      )
    ).rejects.toThrow(/llama runner process has terminated/);
  });

  it("includes the server's error message on a non-2xx response", async () => {
    const fetchFn = fetchWith({}, () =>
      json({ error: "model 'x' not found, try pulling it first" }, 404)
    );
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: URL_ },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    await expect(
      provider.generateMessage({
        messages: [{ role: "user", content: "hi" }],
        model: "x"
      })
    ).rejects.toThrow(
      "Ollama API request failed (404): model 'x' not found, try pulling it first"
    );
    await expect(
      drain(
        provider.generateMessages({
          messages: [{ role: "user", content: "hi" }],
          model: "x"
        })
      )
    ).rejects.toThrow(/\(404\): model 'x' not found/);
  });

  it("parses a final line that has no trailing newline", async () => {
    const fetchFn = fetchWith({}, () =>
      ndjson(
        `${JSON.stringify({ message: { content: "hello" }, done: false })}\n` +
          JSON.stringify({
            message: { content: "" },
            done: true,
            prompt_eval_count: 3,
            eval_count: 1
          })
      )
    );
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: URL_ },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    const items = await drain(
      provider.generateMessages({
        messages: [{ role: "user", content: "hi" }],
        model: "m"
      })
    );
    expect(items.at(-1)).toMatchObject({ type: "chunk", done: true });
  });
});

describe("OllamaProvider tool-call ids", () => {
  it("never repeats an id across streamed events or rounds", async () => {
    const callLine = (city: string) =>
      `${JSON.stringify({
        message: {
          content: "",
          tool_calls: [{ function: { name: "weather", arguments: { city } } }]
        },
        done: false
      })}\n`;
    const fetchFn = fetchWith({ capabilities: ["tools"] }, () =>
      ndjson(callLine("a") + callLine("b") + doneLine)
    );
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: URL_ },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    const tools = [{ name: "weather", inputSchema: { type: "object" } }];
    const ids: string[] = [];
    for (let round = 0; round < 2; round++) {
      for (const item of await drain(
        provider.generateMessages({
          messages: [{ role: "user", content: "hi" }],
          model: "m",
          tools
        })
      )) {
        if ("args" in item) ids.push(item.id);
      }
    }
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });
});

describe("OllamaProvider model listing", () => {
  it("bounds /api/tags with a timeout signal", async () => {
    const fetchFn = vi.fn(async () => json({ models: [{ name: "a" }] }));
    const provider = new OllamaProvider(
      { OLLAMA_API_URL: URL_ },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    await provider.getAvailableLanguageModels();
    const init = fetchFn.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
