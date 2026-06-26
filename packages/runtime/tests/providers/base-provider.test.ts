/**
 * Tests for BaseProvider utility methods and default behaviors.
 */

import { describe, it, expect } from "vitest";
import {
  BaseProvider,
  toolResultToText
} from "../../src/providers/base-provider.js";
import { isProviderMessageEvent } from "../../src/providers/types.js";
import type {
  Message,
  MessageContent,
  ProviderStreamItem,
  ProviderTool,
  ToolCall
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

  public testBuildToolCall(id: string, name: string, args: unknown): ToolCall {
    return this.buildToolCall(id, name, args);
  }

  async generateMessage(_args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
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

  it("returns {} for non-string/non-object input", () => {
    expect(provider.testParseToolCallArgs(123)).toEqual({});
    expect(provider.testParseToolCallArgs(null)).toEqual({});
    expect(provider.testParseToolCallArgs(undefined)).toEqual({});
  });

  it("returns object as-is for object input", () => {
    expect(provider.testParseToolCallArgs({ key: "val" })).toEqual({
      key: "val"
    });
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
    const tc = provider.testBuildToolCall("call-1", "myTool", '{"foo": "bar"}');
    expect(tc).toEqual({
      id: "call-1",
      name: "myTool",
      args: { foo: "bar" }
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
    expect(provider.isContextLengthError("maximum context size reached")).toBe(
      true
    );
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
    expect(
      provider.isRateLimitError(new Error("HTTP 429 Too Many Requests"))
    ).toBe(true);
    expect(provider.isRateLimitError("status 429")).toBe(true);
  });

  it('returns true for messages containing "rate limit" (case-insensitive)', () => {
    expect(provider.isRateLimitError(new Error("rate limit exceeded"))).toBe(
      true
    );
    expect(provider.isRateLimitError(new Error("Rate Limit"))).toBe(true);
    expect(provider.isRateLimitError("rate_limit reached")).toBe(true);
  });

  it('returns true for messages containing "too many requests" (case-insensitive)', () => {
    expect(provider.isRateLimitError(new Error("too many requests"))).toBe(
      true
    );
    expect(provider.isRateLimitError(new Error("Too Many Requests"))).toBe(
      true
    );
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
    expect(provider.isAuthError(new Error("Invalid API Key provided"))).toBe(
      true
    );
  });

  it('returns true for messages containing "authentication" (case-insensitive)', () => {
    expect(provider.isAuthError(new Error("authentication failed"))).toBe(true);
    expect(provider.isAuthError(new Error("Authentication required"))).toBe(
      true
    );
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

  it("hasToolSupport() returns true", async () => {
    expect(await provider.hasToolSupport("any-model")).toBe(true);
  });

  it("textToImage() throws 'does not support'", async () => {
    await expect(
      provider.textToImage({
        model: { id: "m", name: "m", provider: "test" },
        prompt: "test"
      })
    ).rejects.toThrow("does not support");
  });

  it("imageToImage() throws 'does not support'", async () => {
    await expect(
      provider.imageToImage([new Uint8Array()], {
        model: { id: "m", name: "m", provider: "test" },
        prompt: "test"
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
        model: "m"
      })
    ).rejects.toThrow("does not support");
  });

  it("generateEmbedding() throws 'does not support'", async () => {
    await expect(
      provider.generateEmbedding({ text: "hi", model: "m" })
    ).rejects.toThrow("does not support");
  });

  it("textToVideo() throws 'does not support'", async () => {
    await expect(
      provider.textToVideo({
        model: { id: "m", name: "m", provider: "test" },
        prompt: "test"
      })
    ).rejects.toThrow("does not support");
  });

  it("imageToVideo() throws 'does not support'", async () => {
    await expect(
      provider.imageToVideo([new Uint8Array()], {
        model: { id: "m", name: "m", provider: "test" },
        prompt: "test"
      })
    ).rejects.toThrow("does not support");
  });
});

describe("BaseProvider – getCapabilities", () => {
  it("defaults to message generation only when nothing is overridden", () => {
    const caps = new TestProvider().getCapabilities();
    expect(caps).toEqual(["generate_message", "generate_messages"]);
  });

  it("derives capabilities from overridden methods (heuristic path)", () => {
    class ImageProvider extends TestProvider {
      override async getAvailableImageModels() {
        return [];
      }
    }
    const caps = new ImageProvider().getCapabilities();
    expect(caps).toContain("text_to_image");
    expect(caps).toContain("image_to_image");
  });

  it("advertises text_to_music when getAvailableMusicModels is overridden", () => {
    class MusicProvider extends TestProvider {
      override async getAvailableMusicModels() {
        return [];
      }
    }
    const caps = new MusicProvider().getCapabilities();
    expect(caps).toContain("text_to_music");
    // Music override must not imply TTS / video.
    expect(caps).not.toContain("text_to_speech");
    expect(caps).not.toContain("text_to_video");
  });

  it("honors an explicit capability declaration (override seam)", () => {
    class ExplicitProvider extends TestProvider {
      protected override declaredCapabilities() {
        return ["text_to_speech" as const];
      }
    }
    const caps = new ExplicitProvider().getCapabilities();
    // Explicit list is honored and message generation is always included.
    expect(caps).toContain("text_to_speech");
    expect(caps).toContain("generate_message");
    expect(caps).toContain("generate_messages");
  });
});

describe("BaseProvider – close lifecycle", () => {
  it("default close() is a safe, idempotent no-op", async () => {
    const provider = new TestProvider();
    await expect(provider.close()).resolves.toBeUndefined();
    await expect(provider.close()).resolves.toBeUndefined();
  });
});

describe("toolResultToText", () => {
  it("passes strings through", () => {
    expect(toolResultToText("hi")).toBe("hi");
  });

  it("joins text blocks and drops images", () => {
    const content: MessageContent[] = [
      { type: "text", text: "a shot" },
      { type: "image_url", image: { data: "QUJD", mimeType: "image/png" } }
    ];
    expect(toolResultToText(content)).toBe("a shot");
  });

  it("falls back to a placeholder when only images are present", () => {
    expect(
      toolResultToText([
        { type: "image_url", image: { data: "QUJD", mimeType: "image/png" } }
      ])
    ).toBe("[image result]");
  });
});

describe("BaseProvider.generateLoop – image tool results", () => {
  // Yields one tool call on the first turn, then finishes — the "real provider"
  // path that emits ToolCall items (vs. the inline onToolCall callback).
  class ToolOnceProvider extends BaseProvider {
    private called = false;
    constructor() {
      super("test");
    }
    async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
      if (!this.called) {
        this.called = true;
        yield { id: "call_1", name: "snap", args: {} } as ToolCall;
        return;
      }
      yield { type: "chunk", content: "done", done: true };
    }
  }

  it("feeds MessageContent[] from executeTool into the tool message", async () => {
    const provider = new ToolOnceProvider();
    const image: MessageContent[] = [
      { type: "text", text: "viewport" },
      { type: "image_url", image: { data: "QUJD", mimeType: "image/png" } }
    ];
    const events: ProviderStreamItem[] = [];
    for await (const item of provider.generateLoop({
      messages: [{ role: "user", content: "look" }],
      model: "m",
      executeTool: async () => image
    })) {
      events.push(item);
    }
    const toolEvent = events.find(
      (e) => isProviderMessageEvent(e) && e.message.role === "tool"
    );
    expect(toolEvent).toBeTruthy();
    expect(
      isProviderMessageEvent(toolEvent!) && toolEvent!.message.content
    ).toEqual(image);
  });
});
