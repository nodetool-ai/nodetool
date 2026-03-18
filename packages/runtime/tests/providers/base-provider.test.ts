/**
 * Tests for BaseProvider utility methods and default behaviors.
 */

import { describe, it, expect } from "vitest";
import { BaseProvider } from "../../src/providers/base-provider.js";
import type {
  Message,
  ProviderStreamItem,
  ProviderTool,
  ToolCall,
} from "../../src/providers/types.js";

/**
 * Concrete subclass that exposes protected methods for testing.
 */
class TestProvider extends BaseProvider {
  constructor() {
    super("test");
  }

  public testParseToolCallArgs(raw: unknown): Record<string, unknown> {
    return this.parseToolCallArgs(raw);
  }

  public testBuildToolCall(
    id: string,
    name: string,
    args: unknown
  ): ToolCall {
    return this.buildToolCall(id, name, args);
  }

  async generateMessage(_args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    responseFormat?: Record<string, unknown>;
    jsonSchema?: Record<string, unknown>;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  }): Promise<Message> {
    return { role: "assistant", content: "ok" };
  }

  async *generateMessages(_args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    responseFormat?: Record<string, unknown>;
    jsonSchema?: Record<string, unknown>;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
  }): AsyncGenerator<ProviderStreamItem> {
    yield { type: "chunk", content: "ok", done: true };
  }
}

describe("BaseProvider – parseToolCallArgs", () => {
  const provider = new TestProvider();

  it("parses valid JSON string into object", () => {
    const result = provider.testParseToolCallArgs('{"key": "value", "n": 42}');
    expect(result).toEqual({ key: "value", n: 42 });
  });

  it("returns {} for non-string input", () => {
    expect(provider.testParseToolCallArgs(123)).toEqual({});
    expect(provider.testParseToolCallArgs(null)).toEqual({});
    expect(provider.testParseToolCallArgs(undefined)).toEqual({});
    expect(provider.testParseToolCallArgs({ key: "val" })).toEqual({});
  });

  it("returns {} for invalid JSON", () => {
    expect(provider.testParseToolCallArgs("not json")).toEqual({});
    expect(provider.testParseToolCallArgs("{broken")).toEqual({});
  });

  it("returns {} for JSON that parses to array", () => {
    expect(provider.testParseToolCallArgs("[1, 2, 3]")).toEqual({});
  });

  it("returns {} for JSON that parses to primitive", () => {
    expect(provider.testParseToolCallArgs('"hello"')).toEqual({});
    expect(provider.testParseToolCallArgs("42")).toEqual({});
    expect(provider.testParseToolCallArgs("true")).toEqual({});
    expect(provider.testParseToolCallArgs("null")).toEqual({});
  });
});

describe("BaseProvider – buildToolCall", () => {
  const provider = new TestProvider();

  it("builds ToolCall with parsed args from JSON string", () => {
    const tc = provider.testBuildToolCall(
      "call-1",
      "myTool",
      '{"foo": "bar"}'
    );
    expect(tc).toEqual({
      id: "call-1",
      name: "myTool",
      args: { foo: "bar" },
    });
  });

  it("handles string args", () => {
    const tc = provider.testBuildToolCall("call-2", "tool", '{"x": 1}');
    expect(tc.id).toBe("call-2");
    expect(tc.name).toBe("tool");
    expect(tc.args).toEqual({ x: 1 });
  });

  it("handles non-string args (returns empty args)", () => {
    const tc = provider.testBuildToolCall("call-3", "tool", 999);
    expect(tc.args).toEqual({});
  });
});

describe("BaseProvider – isContextLengthError", () => {
  const provider = new TestProvider();

  it('returns true for "context length exceeded"', () => {
    expect(
      provider.isContextLengthError(
        new Error("The context length exceeded the maximum allowed")
      )
    ).toBe(true);
  });

  it('returns true for "maximum context"', () => {
    expect(
      provider.isContextLengthError("maximum context size reached")
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(provider.isContextLengthError(new Error("rate limit"))).toBe(false);
    expect(provider.isContextLengthError("something else")).toBe(false);
    expect(provider.isContextLengthError(42)).toBe(false);
  });
});

describe("BaseProvider – isRateLimitError", () => {
  const provider = new TestProvider();

  it('returns true for messages containing "429"', () => {
    expect(provider.isRateLimitError(new Error("HTTP 429 Too Many Requests"))).toBe(true);
    expect(provider.isRateLimitError("status 429")).toBe(true);
  });

  it('returns true for messages containing "rate limit" (case-insensitive)', () => {
    expect(provider.isRateLimitError(new Error("rate limit exceeded"))).toBe(true);
    expect(provider.isRateLimitError(new Error("Rate Limit"))).toBe(true);
    expect(provider.isRateLimitError("rate_limit reached")).toBe(true);
  });

  it('returns true for messages containing "too many requests" (case-insensitive)', () => {
    expect(provider.isRateLimitError(new Error("too many requests"))).toBe(true);
    expect(provider.isRateLimitError(new Error("Too Many Requests"))).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(provider.isRateLimitError(new Error("400 Bad Request"))).toBe(false);
    expect(provider.isRateLimitError(new Error("not found"))).toBe(false);
    expect(provider.isRateLimitError(new Error("timeout"))).toBe(false);
    expect(provider.isRateLimitError("something else")).toBe(false);
    expect(provider.isRateLimitError(42)).toBe(false);
  });
});

describe("BaseProvider – isAuthError", () => {
  const provider = new TestProvider();

  it('returns true for messages containing "401"', () => {
    expect(provider.isAuthError(new Error("HTTP 401"))).toBe(true);
    expect(provider.isAuthError("status 401")).toBe(true);
  });

  it('returns true for messages containing "403"', () => {
    expect(provider.isAuthError(new Error("HTTP 403 Forbidden"))).toBe(true);
    expect(provider.isAuthError("403 error")).toBe(true);
  });

  it('returns true for messages containing "unauthorized" (case-insensitive)', () => {
    expect(provider.isAuthError(new Error("unauthorized"))).toBe(true);
    expect(provider.isAuthError(new Error("Unauthorized"))).toBe(true);
  });

  it('returns true for messages containing "forbidden" (case-insensitive)', () => {
    expect(provider.isAuthError(new Error("forbidden"))).toBe(true);
    expect(provider.isAuthError(new Error("Forbidden"))).toBe(true);
  });

  it('returns true for messages containing "invalid api key" (case-insensitive)', () => {
    expect(provider.isAuthError(new Error("invalid api key"))).toBe(true);
    expect(provider.isAuthError(new Error("Invalid API Key provided"))).toBe(true);
  });

  it('returns true for messages containing "authentication" (case-insensitive)', () => {
    expect(provider.isAuthError(new Error("authentication failed"))).toBe(true);
    expect(provider.isAuthError(new Error("Authentication required"))).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(provider.isAuthError(new Error("400 Bad Request"))).toBe(false);
    expect(provider.isAuthError(new Error("rate limit"))).toBe(false);
    expect(provider.isAuthError(new Error("timeout"))).toBe(false);
    expect(provider.isAuthError("something else")).toBe(false);
    expect(provider.isAuthError(42)).toBe(false);
  });
});

describe("BaseProvider – default method behaviors", () => {
  const provider = new TestProvider();

  it("requiredSecrets() returns []", () => {
    expect(TestProvider.requiredSecrets()).toEqual([]);
  });

  it("getContainerEnv() returns {}", () => {
    expect(provider.getContainerEnv()).toEqual({});
  });

  it("hasToolSupport() returns true", async () => {
    expect(await provider.hasToolSupport("any-model")).toBe(true);
  });

  it("getAvailableLanguageModels() returns []", async () => {
    await expect(provider.getAvailableLanguageModels()).resolves.toEqual([]);
  });

  it("textToImage() throws 'does not support'", async () => {
    await expect(
      provider.textToImage({
        model: { id: "m", name: "m", provider: "test" },
        prompt: "test",
      })
    ).rejects.toThrow("does not support");
  });

  it("imageToImage() throws 'does not support'", async () => {
    await expect(
      provider.imageToImage(new Uint8Array(), {
        model: { id: "m", name: "m", provider: "test" },
        prompt: "test",
      })
    ).rejects.toThrow("does not support");
  });

  it("textToSpeech() throws 'does not support'", async () => {
    const gen = provider.textToSpeech({ text: "hi", model: "m" });
    await expect(gen.next()).rejects.toThrow("does not support");
  });

  it("automaticSpeechRecognition() throws 'does not support'", async () => {
    await expect(
      provider.automaticSpeechRecognition({
        audio: new Uint8Array(),
        model: "m",
      })
    ).rejects.toThrow("does not support");
  });

  it("generateEmbedding() throws 'does not support'", async () => {
    await expect(
      provider.generateEmbedding({ text: "hi", model: "m" })
    ).rejects.toThrow("does not support");
  });

  it("getAvailableImageModels() returns []", async () => {
    await expect(provider.getAvailableImageModels()).resolves.toEqual([]);
  });

  it("getAvailableVideoModels() returns []", async () => {
    await expect(provider.getAvailableVideoModels()).resolves.toEqual([]);
  });

  it("getAvailableTTSModels() returns []", async () => {
    await expect(provider.getAvailableTTSModels()).resolves.toEqual([]);
  });

  it("getAvailableASRModels() returns []", async () => {
    await expect(provider.getAvailableASRModels()).resolves.toEqual([]);
  });

  it("getAvailableEmbeddingModels() returns []", async () => {
    await expect(provider.getAvailableEmbeddingModels()).resolves.toEqual([]);
  });

  it("textToVideo() throws 'does not support'", async () => {
    await expect(
      provider.textToVideo({
        model: { id: "m", name: "m", provider: "test" },
        prompt: "test",
      })
    ).rejects.toThrow("does not support");
  });

  it("imageToVideo() throws 'does not support'", async () => {
    await expect(
      provider.imageToVideo(new Uint8Array(), {
        model: { id: "m", name: "m", provider: "test" },
        prompt: "test",
      })
    ).rejects.toThrow("does not support");
  });
});
