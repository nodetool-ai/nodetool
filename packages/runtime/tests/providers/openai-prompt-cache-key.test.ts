import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { OpenAIProvider } from "../../src/providers/openai-provider.js";

function responsesProvider(providerId?: string) {
  const create = vi.fn().mockResolvedValue({
    id: "resp_1",
    output_text: "done",
    output: []
  });
  const provider = new OpenAIProvider(
    { OPENAI_API_KEY: "k" },
    {
      client: { responses: { create } } as unknown as OpenAI,
      ...(providerId ? { providerId } : {})
    } as ConstructorParameters<typeof OpenAIProvider>[1]
  );
  return { provider, create };
}

function chatProvider(providerId?: string) {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { role: "assistant", content: "done" } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 }
  });
  const provider = new OpenAIProvider(
    { OPENAI_API_KEY: "k" },
    {
      client: { chat: { completions: { create } } } as unknown as OpenAI,
      ...(providerId ? { providerId } : {})
    } as ConstructorParameters<typeof OpenAIProvider>[1]
  );
  return { provider, create };
}

describe("OpenAIProvider prompt_cache_key", () => {
  it("keys a thread's requests together and apart from other threads", async () => {
    const { provider, create } = responsesProvider();
    const call = (threadId: string, text: string) =>
      provider.generateMessage({
        model: "gpt-5",
        threadId,
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: text }
        ]
      });
    await call("thread-a", "first");
    await call("thread-a", "second");
    await call("thread-b", "first");

    const keys = create.mock.calls.map((c) => c[0].prompt_cache_key);
    expect(keys[0]).toMatch(/^nodetool-[0-9a-f]+$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    // The key is a hash, not the thread id itself.
    expect(keys[0]).not.toContain("thread-a");
  });

  it("falls back to the system prompt without a thread", async () => {
    const { provider, create } = responsesProvider();
    const call = (system: string) =>
      provider.generateMessage({
        model: "gpt-5",
        messages: [
          { role: "system", content: system },
          { role: "user", content: "hi" }
        ]
      });
    await call("Agent A");
    await call("Agent A");
    await call("Agent B");

    const keys = create.mock.calls.map((c) => c[0].prompt_cache_key);
    expect(keys[0]).toBeDefined();
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("sends no key when there is nothing stable to key on", async () => {
    const { provider, create } = responsesProvider();
    await provider.generateMessage({
      model: "gpt-5",
      messages: [{ role: "user", content: "hi" }]
    });
    expect(create.mock.calls[0][0]).not.toHaveProperty("prompt_cache_key");
  });

  it("keys Chat Completions requests too", async () => {
    const { provider, create } = chatProvider();
    await provider.generateMessage({
      model: "gpt-3.5-turbo",
      threadId: "thread-a",
      messages: [{ role: "user", content: "hi" }]
    });
    expect(create.mock.calls[0][0].prompt_cache_key).toMatch(/^nodetool-/);
  });

  it("leaves the field off for OpenAI-compatible endpoints", async () => {
    const { provider, create } = chatProvider("groq");
    await provider.generateMessage({
      model: "llama-3.3-70b",
      threadId: "thread-a",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" }
      ]
    });
    expect(create.mock.calls[0][0]).not.toHaveProperty("prompt_cache_key");
  });
});
