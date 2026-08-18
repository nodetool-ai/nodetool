import { describe, it, expect, vi } from "vitest";
import { AnthropicProvider } from "../../src/providers/anthropic-provider.js";
import { GeminiProvider } from "../../src/providers/gemini-provider.js";
import { OllamaProvider } from "../../src/providers/ollama-provider.js";
import { CostCalculator } from "../../src/providers/cost-calculator.js";
import type { Message } from "../../src/providers/types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

function anthropicProvider(create: ReturnType<typeof vi.fn>) {
  return new AnthropicProvider(
    { ANTHROPIC_API_KEY: "k" },
    { client: { messages: { create } } as any }
  );
}

describe("Anthropic – forced tool choice vs. thinking policy", () => {
  it("keeps a forced tool choice usable on adaptive-default models", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    await anthropicProvider(create).generateMessage({
      model: "claude-sonnet-5",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "plan" }],
      toolChoice: "plan"
    });
    const request = create.mock.calls[0][0];
    expect(request.tool_choice).toEqual({ type: "tool", name: "plan" });
    expect(request.thinking).toEqual({ type: "disabled" });
  });

  it("leaves adaptive-optional models untouched", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    await anthropicProvider(create).generateMessage({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "plan" }],
      toolChoice: "any"
    });
    const request = create.mock.calls[0][0];
    expect(request.tool_choice).toEqual({ type: "any" });
    expect(request.thinking).toBeUndefined();
  });

  it("leaves manual-policy models untouched", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    await anthropicProvider(create).generateMessage({
      model: "claude-3-5-sonnet-latest",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "plan" }],
      toolChoice: "any"
    });
    const request = create.mock.calls[0][0];
    expect(request.tool_choice).toEqual({ type: "any" });
    expect(request.thinking).toBeUndefined();
  });

  it("still enables policy-default thinking without a forced tool choice", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    await anthropicProvider(create).generateMessage({
      model: "claude-sonnet-5",
      messages: [{ role: "user", content: "hi" }]
    });
    expect(create.mock.calls[0][0].thinking).toBeUndefined();
    expect(create.mock.calls[0][0].tool_choice).toBeUndefined();
  });
});

describe("Anthropic – parallel tool results", () => {
  const parallelHistory: Message[] = [
    { role: "user", content: "do both" },
    {
      role: "assistant",
      content: null,
      toolCalls: [
        { id: "call_1", name: "a", args: {} },
        { id: "call_2", name: "b", args: {} }
      ]
    },
    { role: "tool", toolCallId: "call_1", content: "one" },
    { role: "tool", toolCallId: "call_2", content: "two" }
  ];

  it("merges consecutive tool results into one user message (non-streaming)", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    await anthropicProvider(create).generateMessage({
      model: "claude-3-5-sonnet-latest",
      messages: parallelHistory
    });
    const messages = create.mock.calls[0][0].messages as Array<{
      role: string;
      content: unknown;
    }>;
    const userRoles = messages.filter((m) => m.role === "user");
    expect(userRoles).toHaveLength(2);
    const last = messages[messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toEqual([
      { type: "tool_result", tool_use_id: "call_1", content: "one" },
      { type: "tool_result", tool_use_id: "call_2", content: "two" }
    ]);
  });

  it("merges consecutive tool results into one user message (streaming)", async () => {
    const create = vi.fn().mockResolvedValue(
      (async function* () {
        yield {
          type: "message_start",
          message: { usage: { input_tokens: 1, output_tokens: 0 } }
        };
        yield { type: "message_stop" };
      })()
    );
    const gen = anthropicProvider(create).generateMessages({
      model: "claude-3-5-sonnet-latest",
      messages: parallelHistory
    });
    for await (const _ of gen) {
      // drain
    }
    const messages = create.mock.calls[0][0].messages as Array<{
      role: string;
      content: unknown[];
    }>;
    const last = messages[messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toHaveLength(2);
  });
});

describe("Gemini – media URI handling", () => {
  function geminiWithFetch(fetchFn: ReturnType<typeof vi.fn>) {
    return new GeminiProvider(
      { GEMINI_API_KEY: "k" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
  }

  it("strips the data: prefix and reads the real mime type from inline data", async () => {
    const provider = geminiWithFetch(vi.fn());
    const part = await (provider as any).messageContentToGeminiPart({
      type: "image_url",
      image: { type: "image", data: "data:image/png;base64,QUJD" }
    });
    expect(part.inlineData).toEqual({ mimeType: "image/png", data: "QUJD" });
  });

  it("strips the data: prefix when the URI carries the payload", async () => {
    const provider = geminiWithFetch(vi.fn());
    const part = await (provider as any).messageContentToGeminiPart({
      type: "image_url",
      image: { type: "image", uri: "data:image/webp;base64,QUJD" }
    });
    expect(part.inlineData).toEqual({ mimeType: "image/webp", data: "QUJD" });
  });

  it("resolves file:// image URIs through resolveUri instead of fetching them", async () => {
    const fetchFn = vi.fn();
    const provider = geminiWithFetch(fetchFn);
    const resolveUri = vi
      .spyOn(provider as any, "resolveUri")
      .mockResolvedValue("data:image/png;base64,QUJD");

    const part = await (provider as any).messageContentToGeminiPart({
      type: "image_url",
      image: { type: "image", uri: "file:///assets/u1/a1.png" }
    });

    expect(resolveUri).toHaveBeenCalledWith("file:///assets/u1/a1.png");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(part.inlineData).toEqual({ mimeType: "image/png", data: "QUJD" });
  });

  it("names the unresolved asset instead of reporting an unsafe fetch", async () => {
    const fetchFn = vi.fn();
    const provider = geminiWithFetch(fetchFn);

    await expect(
      (provider as any).messageContentToGeminiPart({
        type: "image_url",
        image: { type: "image", uri: "asset://abc.png" }
      })
    ).rejects.toThrow(/Unresolved asset reference.*asset:\/\/abc\.png/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("resolves file:// audio URIs through resolveUri", async () => {
    const fetchFn = vi.fn();
    const provider = geminiWithFetch(fetchFn);
    vi.spyOn(provider as any, "resolveUri").mockResolvedValue(
      "data:audio/wav;base64,QUJD"
    );

    const part = await (provider as any).messageContentToGeminiPart({
      type: "audio",
      audio: { type: "audio", uri: "file:///assets/u1/a1.wav" }
    });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(part.inlineData).toEqual({ mimeType: "audio/wav", data: "QUJD" });
  });
});

describe("Gemini – sampling penalties", () => {
  it("passes presence and frequency penalties into generationConfig", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "ok" }] } }]
      })
    });
    const provider = new GeminiProvider(
      { GEMINI_API_KEY: "k" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    await provider.generateMessage({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.3,
      topP: 0.8,
      presencePenalty: 0.5,
      frequencyPenalty: 0.25
    });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body as string);
    expect(body.generationConfig).toMatchObject({
      temperature: 0.3,
      topP: 0.8,
      presencePenalty: 0.5,
      frequencyPenalty: 0.25
    });
  });
});

describe("Ollama – request options and usage", () => {
  const OLLAMA = { OLLAMA_API_URL: "http://localhost:11434" };

  function chatResponse(payload: unknown) {
    return {
      ok: true,
      status: 200,
      json: async () => payload,
      body: null
    } as unknown as Response;
  }

  it("writes sampling params into options", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(chatResponse({ message: { content: "hi" } }));
    const provider = new OllamaProvider(OLLAMA, {
      fetchFn: fetchFn as unknown as typeof fetch
    });
    await provider.generateMessage({
      model: "llama3.1:8b",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
      temperature: 0.4,
      topP: 0.7,
      frequencyPenalty: 0.2
    });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body as string);
    expect(body.options).toEqual({
      num_predict: 100,
      temperature: 0.4,
      top_p: 0.7,
      repeat_penalty: 1.2
    });
  });

  it("tracks prompt/eval token counts", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      chatResponse({
        message: { content: "hi" },
        prompt_eval_count: 42,
        eval_count: 7
      })
    );
    const provider = new OllamaProvider(OLLAMA, {
      fetchFn: fetchFn as unknown as typeof fetch
    });
    const tracked = vi.spyOn(provider, "trackUsage");
    await provider.generateMessage({
      model: "llama3.1:8b",
      messages: [{ role: "user", content: "hi" }]
    });
    expect(tracked).toHaveBeenCalledWith("llama3.1:8b", {
      inputTokens: 42,
      outputTokens: 7
    });
    // Local models are free, but the counts must still be recorded.
    expect(provider.getTotalCost()).toBe(0);
  });

  it("tracks token counts from the final streaming object", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ message: { content: "hi" }, done: false })}\n`
          )
        );
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              message: { content: "" },
              done: true,
              prompt_eval_count: 11,
              eval_count: 3
            })}\n`
          )
        );
        controller.close();
      }
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        body
      } as unknown as Response);
    const provider = new OllamaProvider(OLLAMA, {
      fetchFn: fetchFn as unknown as typeof fetch
    });
    const tracked = vi.spyOn(provider, "trackUsage");
    for await (const _ of provider.generateMessages({
      model: "llama3.1:8b",
      messages: [{ role: "user", content: "hi" }]
    })) {
      // drain
    }
    expect(tracked).toHaveBeenCalledWith("llama3.1:8b", {
      inputTokens: 11,
      outputTokens: 3
    });
  });

  it("keeps an array-form system prompt when emulating tools", async () => {
    const showResponse = {
      ok: true,
      status: 200,
      json: async () => ({ capabilities: ["completion"] }),
      body: null
    } as unknown as Response;
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(showResponse)
      .mockResolvedValue(chatResponse({ message: { content: "hi" } }));
    const provider = new OllamaProvider(OLLAMA, {
      fetchFn: fetchFn as unknown as typeof fetch
    });
    await provider.generateMessage({
      model: "tinyllama",
      messages: [
        {
          role: "system",
          content: [{ type: "text", text: "You are a careful assistant." }]
        },
        { role: "user", content: "hi" }
      ],
      tools: [{ name: "lookup", description: "look things up" }]
    });
    const chatCall = fetchFn.mock.calls.find((c) =>
      String(c[0]).endsWith("/api/chat")
    );
    const body = JSON.parse(chatCall![1].body as string);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("You are a careful assistant.");
    expect(body.messages[0].content).toContain("lookup");
  });
});

describe("CostCalculator – accounting never throws", () => {
  it("returns 0 instead of throwing on inconsistent cache counts", () => {
    expect(() =>
      CostCalculator.calculate(
        "gpt-4o-mini",
        { inputTokens: 100, cachedTokens: 900, outputTokens: 10 },
        "openai"
      )
    ).not.toThrow();
  });

  it("prices images per image by quality", () => {
    expect(
      CostCalculator.calculate(
        "gpt-image-1",
        { imageCount: 100, imageQuality: "low" },
        "openai"
      )
    ).toBeCloseTo(1.1, 6);
    expect(
      CostCalculator.calculate("gpt-image-1", { imageCount: 2 }, "openai")
    ).toBeCloseTo(0.084, 6);
  });

  it("prices TTS characters and ASR duration", () => {
    expect(
      CostCalculator.calculate("tts-1", { inputCharacters: 2000 }, "openai")
    ).toBeCloseTo(0.03, 6);
    expect(
      CostCalculator.calculate("whisper-1", { durationSeconds: 120 }, "openai")
    ).toBeCloseTo(0.012, 6);
  });
});
