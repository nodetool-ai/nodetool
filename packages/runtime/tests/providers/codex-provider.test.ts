import { describe, it, expect, vi, afterEach } from "vitest";
import {
  CodexProvider,
  CODEX_FALLBACK_MODELS
} from "../../src/providers/codex-provider.js";
import { CODEX_BACKEND_BASE_URL } from "@nodetool-ai/protocol";
import { providerFailureDetail } from "../../src/providers/provider-error.js";
import type { Message } from "../../src/providers/types.js";

afterEach(() => vi.restoreAllMocks());

/** Build a minimal unsigned JWT carrying a ChatGPT account id claim. */
function fakeCodexJwt(accountId: string): string {
  const payload = {
    "https://api.openai.com/auth": { chatgpt_account_id: accountId }
  };
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64(payload)}.`;
}

describe("CodexProvider", () => {
  it("requires an access token", () => {
    expect(() => new CodexProvider({})).toThrow("CODEX_ACCESS_TOKEN");
  });

  it("reports the codex provider id and serves no container env", () => {
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    expect(provider.provider).toBe("codex");
    expect(provider.getContainerEnv()).toEqual({});
  });

  it("points the OpenAI client at the Codex backend", () => {
    const provider = new CodexProvider({
      CODEX_ACCESS_TOKEN: fakeCodexJwt("acct-123")
    });
    const client = provider.getClient();
    expect(client.baseURL).toBe(CODEX_BACKEND_BASE_URL);
  });

  it("lists the account's models from the live /models endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            { slug: "gpt-5.5", display_name: "GPT-5.5" },
            { slug: "codex-account-model", display_name: "Account model" },
            {
              slug: "codex-auto-review",
              display_name: "Codex Auto Review",
              visibility: "hide"
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    const models = await provider.getAvailableLanguageModels();
    expect(fetchSpy).toHaveBeenCalledWith(
      `${CODEX_BACKEND_BASE_URL}/models?client_version=0.162.1`,
      expect.any(Object)
    );
    expect(models).toEqual([
      { id: "gpt-5.5", name: "GPT-5.5", provider: "codex" },
      {
        id: "codex-account-model",
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
      "gpt-image-2",
      "gpt-image-1.5",
      "gpt-image-1",
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

  it("keys every turn and tool round of a thread to one cache session", async () => {
    const requests: Array<{
      body: Record<string, unknown>;
      headers: Record<string, string>;
    }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_url, init?: RequestInit) => {
        requests.push({
          body: JSON.parse(String(init?.body)),
          headers: init?.headers as Record<string, string>
        });
        return new Response(
          `data: ${JSON.stringify({ type: "response.completed", response: {} })}\n\n`,
          { status: 200, headers: { "content-type": "text/event-stream" } }
        );
      }
    );
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    const tools = [
      {
        name: "foo",
        description: "Foo",
        inputSchema: { type: "object", properties: {} }
      }
    ];
    const turn1 = [
      { role: "system" as const, content: "Be brief." },
      { role: "user" as const, content: "call the tool" }
    ];
    const round2 = [
      ...turn1,
      {
        role: "assistant" as const,
        content: null,
        toolCalls: [{ id: "c1", name: "foo", args: { a: 1 } }]
      },
      { role: "tool" as const, content: "result", toolCallId: "c1" }
    ];
    const turn2 = [
      ...round2,
      { role: "assistant" as const, content: "done" },
      { role: "user" as const, content: "again" }
    ];
    for (const messages of [turn1, round2, turn2]) {
      for await (const _ of provider.generateMessages({
        messages,
        tools,
        model: "gpt-5.5",
        threadId: "thread-1"
      })) {
        void _;
      }
    }
    // Another thread with the same prompt gets its own key.
    for await (const _ of provider.generateMessages({
      messages: turn1,
      tools,
      model: "gpt-5.5",
      threadId: "thread-2"
    })) {
      void _;
    }

    const keys = requests.map((r) => r.body.prompt_cache_key);
    expect(keys[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(keys.slice(0, 3)).toEqual([keys[0], keys[0], keys[0]]);
    expect(keys[3]).not.toBe(keys[0]);
    // The session header carries the same id, as the Codex CLI sends it.
    expect(requests.map((r) => r.headers.session_id)).toEqual(keys);

    // Each request's input is the previous one's plus what came after it, and
    // the instructions and tools never move, so the prefix stays cached.
    const [a, b, c] = requests.map((r) => r.body);
    for (const [prev, next] of [
      [a, b],
      [b, c]
    ]) {
      const prevInput = prev.input as unknown[];
      expect((next.input as unknown[]).slice(0, prevInput.length)).toEqual(
        prevInput
      );
      expect(next.instructions).toBe(prev.instructions);
      expect(next.tools).toEqual(prev.tools);
    }
  });

  it("keys threadless calls by their instructions", async () => {
    const requests: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_url, init?: RequestInit) => {
        requests.push(JSON.parse(String(init?.body)));
        return new Response(
          `data: ${JSON.stringify({ type: "response.completed", response: {} })}\n\n`,
          { status: 200, headers: { "content-type": "text/event-stream" } }
        );
      }
    );
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    const run = async (messages: Message[]) => {
      for await (const _ of provider.generateMessages({
        messages,
        model: "gpt-5.5"
      })) {
        void _;
      }
    };
    await run([
      { role: "system", content: "Summarize." },
      { role: "user", content: "one" }
    ]);
    await run([
      { role: "system", content: "Summarize." },
      { role: "user", content: "two" }
    ]);
    await run([
      { role: "system", content: "Translate." },
      { role: "user", content: "one" }
    ]);
    await run([{ role: "user", content: "no system prompt" }]);
    const keys = requests.map((r) => r.prompt_cache_key);
    expect(keys[0]).toBeDefined();
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys[3]).toBeUndefined();
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
    await provider.textToImage({ model, prompt: "a dot" });
    const call = fetchSpy.mock.calls.find(([u]) =>
      String(u).endsWith("/responses")
    );
    const sent = JSON.parse(String(call?.[1]?.body)) as { model: string };
    expect(sent.model).toBe("gpt-6.1-sol");
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
    expect(String(url)).toBe(`${CODEX_BACKEND_BASE_URL}/responses`);
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
