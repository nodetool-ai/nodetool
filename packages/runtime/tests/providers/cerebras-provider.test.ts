import { describe, it, expect, vi } from "vitest";
import { CerebrasProvider } from "../../src/providers/cerebras-provider.js";
import type { Message } from "../../src/providers/types.js";
import {
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch
} from "./helpers/compat-fetch.js";

describe("CerebrasProvider", () => {
  it("throws if CEREBRAS_API_KEY is missing", () => {
    expect(() => new CerebrasProvider({})).toThrow(
      "CEREBRAS_API_KEY is required"
    );
  });

  it("reports provider id as cerebras", () => {
    const provider = new CerebrasProvider(
      { CEREBRAS_API_KEY: "k" },
      { client: {} as any }
    );
    expect(provider.provider).toBe("cerebras");
  });

  it("returns required secrets", () => {
    expect(CerebrasProvider.requiredSecrets()).toEqual(["CEREBRAS_API_KEY"]);
  });

  it("returns container env with CEREBRAS_API_KEY", () => {
    const provider = new CerebrasProvider(
      { CEREBRAS_API_KEY: "test-key" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({
      CEREBRAS_API_KEY: "test-key"
    });
  });

  it("has tool support for all models", async () => {
    const provider = new CerebrasProvider(
      { CEREBRAS_API_KEY: "k" },
      { client: {} as any }
    );
    expect(await provider.hasToolSupport("llama3.1-70b")).toBe(true);
  });

  it("fetches available language models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "llama3.1-70b", name: "Llama 3.1 70B" },
          { id: "llama3.1-8b" }
        ]
      })
    });

    const provider = new CerebrasProvider(
      { CEREBRAS_API_KEY: "k" },
      { client: {} as any, fetchFn: mockFetch as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      {
        id: "llama3.1-70b",
        name: "Llama 3.1 70B",
        provider: "cerebras"
      },
      {
        id: "llama3.1-8b",
        name: "llama3.1-8b",
        provider: "cerebras"
      }
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.cerebras.ai/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer k" }
      })
    );
  });

  it("returns empty list when model fetch fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new CerebrasProvider(
      { CEREBRAS_API_KEY: "k" },
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
              content: "cerebras response",
              tool_calls: null
            }
          }
        ]
        })
    );

    const provider = new CerebrasProvider(
      { CEREBRAS_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = await provider.generateMessage({
      messages,
      model: "llama3.1-70b"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("cerebras response");
  });

  it("streams messages via the compat chat client", async () => {
    const chunks = [
      {
        choices: [{ delta: { content: "hello" }, finish_reason: null }]
      },
      {
        choices: [{ delta: { content: "" }, finish_reason: "stop" }]
      }
    ];

    const fetchMock = mockChatFetch(() => chatSSEResponse(chunks));

    const provider = new CerebrasProvider(
      { CEREBRAS_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hi" }];
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages,
      model: "llama3.1-70b"
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});
