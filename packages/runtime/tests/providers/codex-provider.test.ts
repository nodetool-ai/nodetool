import { describe, it, expect, vi, afterEach } from "vitest";
import {
  CodexProvider,
  CODEX_FALLBACK_MODELS
} from "../../src/providers/codex-provider.js";
import { CHATGPT_API_BASE_URL } from "@nodetool-ai/protocol";
import { providerFailureDetail } from "../../src/providers/provider-error.js";

afterEach(() => vi.restoreAllMocks());

describe("CodexProvider", () => {
  it("requires an access token", () => {
    expect(() => new CodexProvider({})).toThrow("CODEX_ACCESS_TOKEN");
  });

  it("reports the codex provider id and serves no container env", () => {
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    expect(provider.provider).toBe("codex");
    expect(provider.getContainerEnv()).toEqual({});
  });

  it("points the OpenAI client at the public API without a Platform org or project", () => {
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    const client = provider.getClient();
    expect(client.baseURL).toBe(CHATGPT_API_BASE_URL);
    expect(client.baseURL).toBe("https://api.openai.com/v1");
    expect(client.organization).toBeNull();
    expect(client.project).toBeNull();
    expect(client.maxRetries).toBe(0);
  });

  it("lists the account's models from the live /models endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            { slug: "gpt-5.5", display_name: "GPT-5.5", visibility: "list" },
            {
              slug: "account-model",
              display_name: "Account model",
              visibility: "list"
            },
            {
              slug: "auto-review",
              display_name: "Auto Review",
              visibility: "hide"
            },
            { slug: "unlisted", display_name: "Unlisted" }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    const models = await provider.getAvailableLanguageModels();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://api.openai.com/v1/models");
    expect(init?.headers).toEqual({
      authorization: "Bearer tok",
      "content-type": "application/json",
      accept: "application/json"
    });
    expect(models).toEqual([
      { id: "gpt-5.5", name: "GPT-5.5", provider: "codex" },
      {
        id: "account-model",
        name: "Account model",
        provider: "codex"
      }
    ]);
    expect(models.every((m) => m.provider === "codex")).toBe(true);
  });

  it.each(["offline", "http-error", "empty", "invalid-json"])(
    "lists the Codex fallback catalog when /models returns %s",
    async (scenario) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      if (scenario === "offline") {
        fetchSpy.mockRejectedValue(new Error("offline"));
      } else {
        fetchSpy.mockResolvedValue(
          new Response(
            scenario === "invalid-json"
              ? "invalid"
              : JSON.stringify({ models: [] }),
            { status: scenario === "http-error" ? 503 : 200 }
          )
        );
      }
      const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
      const models = await provider.getAvailableLanguageModels();
      expect(models).toEqual(CODEX_FALLBACK_MODELS);
      expect(models.map((m) => m.id)).toContain("gpt-6.1-sol");
    }
  );

  it("advertises the gpt-image models for text_to_image", async () => {
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    const models = await provider.getAvailableImageModels();
    expect(models.map((m) => m.id)).toEqual([
      "gpt-image-2.6-flare",
      "gpt-image-2.6-sunburst",
      "gpt-image-2",
      "gpt-image-1.5",
      "gpt-image-1-mini"
    ]);
    expect(models.every((m) => m.supportedTasks?.includes("text_to_image"))).toBe(
      true
    );
  });

  it("emits a terminal done chunk when the SSE stream closes early", async () => {
    // A stream that yields one text delta and a tool call, then closes
    // WITHOUT a `response.completed` event (connection dropped early).
    const sse =
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "hi" })}\n\n` +
      `data: ${JSON.stringify({ type: "response.output_item.added", item: { type: "function_call", id: "i1", call_id: "c1", name: "foo" } })}\n\n` +
      `data: ${JSON.stringify({ type: "response.output_item.done", item: { type: "function_call", id: "i1" } })}\n\n`;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    const items = [];
    for await (const item of provider.generateMessages({
      messages: [{ role: "user", content: "hi" }],
      model: "gpt-5.5"
    })) {
      items.push(item);
    }
    const last = items[items.length - 1];
    expect(last).toMatchObject({ type: "chunk", done: true });
    // Exactly one terminal chunk — not one per event.
    const terminals = items.filter(
      (i) => "done" in i && (i as { done?: boolean }).done
    );
    expect(terminals).toHaveLength(1);
  });

  it("omits empty output_text message items on tool round-trips", async () => {
    let captured: Record<string, unknown> = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_url, init?: RequestInit) => {
        captured = JSON.parse(String(init?.body));
        return new Response(
          `data: ${JSON.stringify({ type: "response.completed", response: {} })}\n\n`,
          {
            status: 200,
            headers: { "content-type": "text/event-stream" }
          }
        );
      }
    );
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    // An assistant turn that is purely a tool call (no text), followed by the
    // tool result — the classic tool round-trip.
    for await (const _ of provider.generateMessages({
      messages: [
        { role: "user", content: "call the tool" },
        {
          role: "assistant",
          content: null,
          toolCalls: [{ id: "c1", name: "foo", args: {} }]
        },
        { role: "tool", content: "result", toolCallId: "c1" }
      ],
      model: "gpt-5.5"
    })) {
      void _;
    }
    const input = captured.input as Array<Record<string, unknown>>;
    // The assistant tool-call round must contribute a function_call, but no
    // empty message item.
    expect(input.some((i) => i.type === "function_call")).toBe(true);
    const emptyMessages = input.filter(
      (i) =>
        i.type === "message" &&
        Array.isArray(i.content) &&
        (i.content as Array<{ text?: string }>).every((c) => !c.text)
    );
    expect(emptyMessages).toHaveLength(0);
  });

  it("posts to the public Responses API with only the bearer token", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(
        `data: ${JSON.stringify({ type: "response.completed", response: {} })}\n\n`,
        { status: 200, headers: { "content-type": "text/event-stream" } }
      );
    });
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    for await (const _ of provider.generateMessages({
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "hi" }
      ],
      model: "gpt-5.5",
      threadId: "thread-1"
    })) {
      void _;
    }
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.openai.com/v1/responses");
    expect(requests[0].init?.headers).toEqual({
      authorization: "Bearer tok",
      "content-type": "application/json",
      accept: "text/event-stream"
    });
    const body = JSON.parse(String(requests[0].init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "gpt-5.5",
      instructions: "Be brief.",
      store: false,
      stream: true
    });
    expect(body).not.toHaveProperty("prompt_cache_key");
  });

  it("explains a usage limit reported after the stream opened", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({
          type: "response.failed",
          response: {
            error: {
              code: "subscription_sharing_usage_limit_exceeded",
              message: "limit"
            }
          }
        })}\n\n`,
        { status: 200 }
      )
    );
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    const run = async () => {
      for await (const _ of provider.generateMessages({
        messages: [{ role: "user", content: "hi" }],
        model: "gpt-5.5"
      })) {
        void _;
      }
    };
    await expect(run()).rejects.toThrow(
      /usage limit.*https:\/\/chatgpt\.com\/settings\/usage/
    );
  });

  it("names the parameter a ChatGPT plan does not support", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "subscription_sharing_unsupported_capability",
            param: "tools[0]",
            message: "unsupported"
          }
        }),
        { status: 400 }
      )
    );
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    await expect(
      provider.webSearch({ query: "q", model: "gpt-5.5" })
    ).rejects.toThrow('does not support "tools[0]"');
  });

  it("ends the turn on response.incomplete", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        [
          { type: "response.output_text.delta", delta: "Part" },
          { type: "response.incomplete", response: {} }
        ]
          .map((e) => `data: ${JSON.stringify(e)}\n\n`)
          .join(""),
        { status: 200 }
      )
    );
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    const items = [];
    for await (const item of provider.generateMessages({
      messages: [{ role: "user", content: "hi" }],
      model: "gpt-5.5"
    })) {
      items.push(item);
    }
    expect(items).toEqual([
      { type: "chunk", content: "Part", done: false },
      { type: "chunk", content: "", done: true }
    ]);
  });

  it("extracts PNG bytes from the image_generation_call output item", async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const b64 = Buffer.from(png).toString("base64");
    const sse =
      `data: ${JSON.stringify({ type: "response.image_generation_call.in_progress" })}\n\n` +
      `data: ${JSON.stringify({ type: "response.output_item.done", item: { type: "image_generation_call", result: b64 } })}\n\n` +
      `data: ${JSON.stringify({ type: "response.completed", response: {} })}\n\n`;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(sse, {
          status: 200,
          headers: { "content-type": "text/event-stream" }
        })
    );
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    const [model] = await provider.getAvailableImageModels();
    const bytes = await provider.textToImage({ model, prompt: "a dot" });
    expect(Array.from(bytes)).toEqual(Array.from(png));
  });

  it("orchestrates image generation with the first live chat model", async () => {
    const b64 = Buffer.from([1, 2, 3]).toString("base64");
    const sse = `data: ${JSON.stringify({ type: "response.output_item.done", item: { type: "image_generation_call", result: b64 } })}\n\n`;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) =>
        String(input).includes("/models")
          ? new Response(
              JSON.stringify({ models: [{ slug: "gpt-6.1-sol" }] }),
              { status: 200 }
            )
          : new Response(sse, { status: 200 })
      );
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    const [model] = await provider.getAvailableImageModels();
    await provider.textToImage({ model, prompt: "a dot", width: 2048, height: 1152 });
    const call = fetchSpy.mock.calls.find(([u]) =>
      String(u).endsWith("/responses")
    );
    const sent = JSON.parse(String(call?.[1]?.body)) as { model: string; tools: Array<{ model: string; size: string }> };
    expect(sent.model).toBe("gpt-6.1-sol");
    expect(sent.tools[0]).toMatchObject({ model: "gpt-image-2.6-flare", size: "2048x1152" });
  });

  it("classifies an expired sign-in as a credential failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "Provided authentication token is expired.",
            code: "token_expired"
          }
        }),
        { status: 401 }
      )
    );
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    let failure: unknown;
    try {
      for await (const item of provider.generateMessagesTraced({
        messages: [{ role: "user", content: "hi" }],
        model: "gpt-5.5"
      })) {
        expect(item).toBeDefined();
      }
    } catch (err) {
      failure = err;
    }
    expect(providerFailureDetail(failure)).toMatchObject({
      code: "provider_auth",
      provider: "codex"
    });
    expect(String(failure)).toMatch(/sign in to Codex again/);
  });
});

describe("CodexProvider.webSearch", () => {
  const sse = (...events: unknown[]) =>
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");

  it("sends the built-in web_search tool and returns the answer with its cited pages", async () => {
    const body = sse(
      { type: "response.output_item.done", item: { type: "web_search_call", status: "completed" } },
      { type: "response.output_text.delta", delta: "It is " },
      { type: "response.output_text.delta", delta: "sunny." },
      {
        type: "response.output_item.done",
        item: {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "It is sunny.",
              annotations: [
                { type: "url_citation", url: "https://weather.example/a", title: "Weather" },
                { type: "url_citation", url: "https://weather.example/a", title: "Weather" }
              ]
            }
          ]
        }
      },
      { type: "response.completed", response: {} }
    );
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(body, { status: 200 }));
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    const result = await provider.webSearch({ query: "weather?", model: "gpt-5.5" });
    expect(result).toEqual({
      text: "It is sunny.",
      sources: [{ title: "Weather", url: "https://weather.example/a" }]
    });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe(`${CHATGPT_API_BASE_URL}/responses`);
    const sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(sent.model).toBe("gpt-5.5");
    expect(sent.tools).toEqual([{ type: "web_search" }]);
    expect(sent.stream).toBe(true);
    expect(sent.store).toBe(false);
  });

  it("falls back to the streamed text when no message item arrives", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(sse({ type: "response.output_text.delta", delta: "Partial" }), {
          status: 200
        })
    );
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    const result = await provider.webSearch({ query: "q", model: "gpt-5.5" });
    expect(result).toEqual({ text: "Partial", sources: [] });
  });

  it("surfaces a failed response", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          sse({ type: "response.failed", response: { error: { message: "tool not allowed" } } }),
          { status: 200 }
        )
    );
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    await expect(
      provider.webSearch({ query: "q", model: "gpt-5.5" })
    ).rejects.toThrow("tool not allowed");
  });

  it("rejects an empty query without a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    await expect(provider.webSearch({ query: "  " })).rejects.toThrow("empty");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
