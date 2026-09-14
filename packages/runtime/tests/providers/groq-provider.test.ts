import { describe, it, expect, vi } from "vitest";
import { GroqProvider } from "../../src/providers/groq-provider.js";
import type { Message, ProviderTool } from "../../src/providers/types.js";
import {
  chatErrorResponse,
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch
} from "./helpers/compat-fetch.js";

describe("GroqProvider", () => {
  it("throws if GROQ_API_KEY is missing", () => {
    expect(() => new GroqProvider({})).toThrow("GROQ_API_KEY is required");
  });

  it("reports provider id as groq", () => {
    const provider = new GroqProvider(
      { GROQ_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.provider).toBe("groq");
  });

  it("returns required secrets", () => {
    expect(GroqProvider.requiredSecrets()).toEqual(["GROQ_API_KEY"]);
  });

  it("returns container env with GROQ_API_KEY", () => {
    const provider = new GroqProvider(
      { GROQ_API_KEY: "test-key" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({ GROQ_API_KEY: "test-key" });
  });

  it("has tool support for all models", async () => {
    const provider = new GroqProvider(
      { GROQ_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("llama-3.1-70b")).toBe(true);
    expect(await provider.hasToolSupport("mixtral-8x7b")).toBe(true);
  });

  it("fetches available language models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "llama-3.1-70b", name: "Llama 3.1 70B" },
          { id: "mixtral-8x7b" }
        ]
      })
    });

    const provider = new GroqProvider(
      { GROQ_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "llama-3.1-70b", name: "Llama 3.1 70B", provider: "groq" },
      { id: "mixtral-8x7b", name: "mixtral-8x7b", provider: "groq" }
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer k" }
      })
    );
  });

  it("returns empty list when model fetch fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new GroqProvider(
      { GROQ_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([]);
  });

  it("generates non-streaming message via the compat chat client", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [
          {
            message: {
              content: "fast response",
              tool_calls: null
            }
          }
        ]
      })
    );

    const provider = new GroqProvider(
      { GROQ_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "llama-3.1-70b"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("fast response");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer k" })
      })
    );
  });

  it("reproduces Groq oversized TPM requests with reported counts", async () => {
    const fetchMock = mockChatFetch(
      chatErrorResponse(
        413,
        "Request too large for model llama-3.1-70b on tokens per minute (TPM): Limit 6000, Requested 27151"
      )
    );
    const provider = new GroqProvider(
      { GROQ_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    await expect(
      provider.generateMessage({
        messages: [{ role: "user", content: "hi" }],
        model: "llama-3.1-70b"
      })
    ).rejects.toThrow("reduce the prompt");
  });

  it("reports the final converted request breakdown and preserves HTTP details", async () => {
    const fetchMock = mockChatFetch(
      chatErrorResponse(
        413,
        "Request too large for model llama-3.1-70b on tokens per minute (TPM): Limit 6000, Requested 27151"
      )
    );
    const provider = new GroqProvider(
      { GROQ_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );
    const tools: ProviderTool[] = [
      {
        name: "lookup",
        description: "Look up a value",
        inputSchema: { type: "object", properties: { key: { type: "string" } } }
      }
    ];

    try {
      await provider.generateMessage({
        messages: [
          { role: "system", content: "Be concise." },
          { role: "user", content: "hi" }
        ],
        model: "llama-3.1-70b",
        tools
      });
      throw new Error("expected Groq request to fail");
    } catch (error) {
      expect(error).toMatchObject({
        status: 413,
        body: {
          error: {
            message: expect.stringContaining("Request too large")
          }
        }
      });
      expect(error).toHaveProperty(
        "message",
        expect.stringMatching(
          /requested 27,151 input tokens against a 6,000 token limit; local estimate \d+ \(system \d+, messages \d+, tools \d+\)/
        )
      );
    }
  });

  it("distinguishes temporary TPM exhaustion from an oversized request", async () => {
    const fetchMock = mockChatFetch(
      chatErrorResponse(
        400,
        "Rate limit reached for model llama-3.1-70b on input tokens per minute (ITPM): Limit 6000, Requested 100"
      )
    );
    const provider = new GroqProvider(
      { GROQ_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    await expect(
      provider.generateMessage({
        messages: [{ role: "user", content: "hi" }],
        model: "llama-3.1-70b"
      })
    ).rejects.toThrow(/temporarily exhausted.*requested 100 input tokens.*6,000/);
  });

  it("preserves structured context-length detection", () => {
    const provider = new GroqProvider({ GROQ_API_KEY: "k" });
    const error = Object.assign(
      new Error("Please reduce the length of the messages."),
      { status: 400, code: "context_length_exceeded" }
    );

    expect(provider.isContextExceededError(error)).toBe(true);
  });

  it("does not classify a TPM allowance failure as context overflow", () => {
    const provider = new GroqProvider({ GROQ_API_KEY: "k" });
    const error = Object.assign(
      new Error(
        "Request too large on input tokens per minute (ITPM): Limit 6000, Requested 100"
      ),
      { status: 413, code: "context_length_exceeded" }
    );

    expect(provider.isContextExceededError(error)).toBe(false);
  });

  it("reports oversized TPM failures from the streaming path", async () => {
    const fetchMock = mockChatFetch(
      chatErrorResponse(
        413,
        "Request too large for model llama-3.1-70b on tokens per minute (TPM): Limit 6000, Requested 27151"
      )
    );
    const provider = new GroqProvider(
      { GROQ_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const collect = async () => {
      for await (const item of provider.generateMessages({
        messages: [{ role: "user", content: "hi" }],
        model: "llama-3.1-70b"
      })) {
        void item;
      }
    };
    await expect(collect()).rejects.toThrow("reduce the prompt");
  });

  it("streams messages via the compat chat client", async () => {
    const chunks = [
      {
        choices: [
          {
            delta: { content: "hello" },
            finish_reason: null
          }
        ]
      },
      {
        choices: [
          {
            delta: { content: "" },
            finish_reason: "stop"
          }
        ]
      }
    ];

    const fetchMock = mockChatFetch(() => chatSSEResponse(chunks));

    const provider = new GroqProvider(
      { GROQ_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hi" }];
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages,
      model: "llama-3.1-70b"
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it("does not start chat requests when the caller has aborted", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const provider = new GroqProvider(
      { GROQ_API_KEY: "k" },
      { fetchFn: fetchMock }
    );
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const args = {
      messages: [{ role: "user" as const, content: "hi" }],
      model: "llama-3.1-70b",
      signal: controller.signal
    };

    await expect(provider.generateMessage(args)).rejects.toThrow("cancelled");

    const collect = async () => {
      for await (const item of provider.generateMessages(args)) {
        void item;
      }
    };
    await expect(collect()).rejects.toThrow("cancelled");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
