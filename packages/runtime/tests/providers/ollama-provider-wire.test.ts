/**
 * What Ollama's chat template renders depends on two request fields NodeTool
 * controls: the `tool_name` on each tool result (Gemma 4 renders it as
 * `response:<name>`, and without it the model cannot tell which tool
 * answered) and `think`, which switches the template between thinking and
 * non-thinking prompts. A fine-tuned model only works when inference renders
 * the same tokens it was trained on, so both are pinned here.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "../../src/providers/ollama-provider.js";
import type { Message } from "../../src/providers/types.js";

const URL_ = "http://localhost:11434";

function fetchWith(show: Record<string, unknown>): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string) => {
    const payload = String(url).endsWith("/api/show")
      ? show
      : { message: { role: "assistant", content: "ok" }, done: true };
    return new Response(JSON.stringify(payload), { status: 200 });
  });
}

function chatBody(fetchFn: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchFn.mock.calls.find((c) => String(c[0]).endsWith("/api/chat"));
  return JSON.parse(String((call?.[1] as RequestInit).body)) as Record<string, unknown>;
}

const conversation: Message[] = [
  { role: "user", content: "Make it red." },
  {
    role: "assistant",
    content: "",
    toolCalls: [
      { id: "c1", name: "execute_code", args: { code: "1" } },
      { id: "c2", name: "view_image", args: {} }
    ]
  },
  { role: "tool", toolCallId: "c1", content: "{\"ok\":true}" },
  { role: "tool", toolCallId: "c2", content: "{\"ok\":true}" },
  { role: "tool", toolCallId: "unknown", content: "orphan" }
];

async function send(
  show: Record<string, unknown>,
  secrets: Record<string, string> = {}
): Promise<Record<string, unknown>> {
  const fetchFn = fetchWith(show);
  const provider = new OllamaProvider(
    { OLLAMA_API_URL: URL_, ...secrets },
    { fetchFn: fetchFn as unknown as typeof fetch }
  );
  await provider.generateMessage({ messages: conversation, model: "gemma4" });
  return chatBody(fetchFn);
}

afterEach(() => {
  delete process.env.OLLAMA_THINK;
});

describe("OllamaProvider tool results", () => {
  it("names each tool result after the call it answers", async () => {
    const body = await send({ capabilities: ["completion", "tools"] });
    const tools = (body.messages as Array<Record<string, unknown>>).filter((m) => m.role === "tool");
    expect(tools.map((m) => m.tool_name)).toEqual(["execute_code", "view_image", undefined]);
  });
});

describe("OllamaProvider OLLAMA_THINK", () => {
  const thinking = { capabilities: ["completion", "tools", "thinking"] };

  it("leaves thinking to the model's default when unset", async () => {
    expect(await send(thinking)).not.toHaveProperty("think");
  });

  it("sends a boolean for true and false", async () => {
    expect((await send(thinking, { OLLAMA_THINK: "false" })).think).toBe(false);
    process.env.OLLAMA_THINK = "true";
    expect((await send(thinking)).think).toBe(true);
  });

  it("passes a reasoning level through", async () => {
    expect((await send(thinking, { OLLAMA_THINK: "low" })).think).toBe("low");
  });

  it("does not send think to a model without thinking", async () => {
    expect(await send({ capabilities: ["completion", "tools"] }, { OLLAMA_THINK: "false" })).not.toHaveProperty("think");
  });

  it("ignores a value Ollama would reject", async () => {
    expect(await send(thinking, { OLLAMA_THINK: "maybe" })).not.toHaveProperty("think");
  });
});
