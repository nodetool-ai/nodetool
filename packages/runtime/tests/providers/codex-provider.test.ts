import { describe, it, expect, vi, afterEach } from "vitest";
import { CodexProvider } from "../../src/providers/codex-provider.js";
import { CODEX_BACKEND_BASE_URL } from "@nodetool-ai/protocol";

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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [{ slug: "gpt-5.5", display_name: "GPT-5.5" }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    const models = await provider.getAvailableLanguageModels();
    expect(models.map((m) => m.id)).toEqual(["gpt-5.5"]);
    expect(models.every((m) => m.provider === "codex")).toBe(true);
  });

  it("falls back to a default model when /models is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const provider = new CodexProvider({ CODEX_ACCESS_TOKEN: "tok" });
    const models = await provider.getAvailableLanguageModels();
    expect(models.map((m) => m.id)).toEqual(["gpt-5.5"]);
  });

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

  it("extracts PNG bytes from the image_generation_call output item", async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const b64 = Buffer.from(png).toString("base64");
    const sse =
      `data: ${JSON.stringify({ type: "response.image_generation_call.in_progress" })}\n\n` +
      `data: ${JSON.stringify({ type: "response.output_item.done", item: { type: "image_generation_call", result: b64 } })}\n\n` +
      `data: ${JSON.stringify({ type: "response.completed", response: {} })}\n\n`;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
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
});
