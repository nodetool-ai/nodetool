import { describe, it, expect } from "vitest";
import {
  annotateProviderError,
  httpStatusFromError
} from "../../src/providers/provider-error.js";
import { BaseProvider } from "../../src/providers/base-provider.js";
import type { Message, ProviderStreamItem } from "../../src/providers/types.js";

class FailingProvider extends BaseProvider {
  constructor(private readonly failure: Error) {
    super("gemini");
  }

  async generateMessage(_args: {
    messages: Message[];
    model: string;
  }): Promise<Message> {
    throw this.failure;
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(_args: {
    messages: Message[];
    model: string;
  }): AsyncGenerator<ProviderStreamItem> {
    throw this.failure;
  }
}

function httpError(status: number, message: string): Error {
  const error = new Error(`${status} ${message}`) as Error & {
    status: number;
  };
  error.status = status;
  return error;
}

describe("httpStatusFromError", () => {
  it("reads a numeric status field", () => {
    expect(
      httpStatusFromError(httpError(403, "Your request was blocked."))
    ).toBe(403);
  });

  it("reads a leading status token when there is no status field", () => {
    expect(httpStatusFromError(new Error("429 Rate limit reached"))).toBe(429);
  });

  it("reads a labelled status", () => {
    expect(httpStatusFromError(new Error("request failed, HTTP 503"))).toBe(
      503
    );
  });

  it("ignores three-digit numbers that are not statuses", () => {
    expect(httpStatusFromError(new Error("model gpt-4-0403 not found"))).toBe(
      null
    );
    expect(httpStatusFromError("403")).toBe(null);
  });
});

describe("annotateProviderError", () => {
  it("explains a 403 and names the provider and model", () => {
    const error = httpError(403, "Your request was blocked.");
    annotateProviderError(error, { provider: "gemini", model: "gemini-3-pro" });
    expect(error.message).toContain("403 Your request was blocked.");
    expect(error.message).toContain("gemini/gemini-3-pro");
    expect(error.message).toContain("Settings → Models & Providers");
  });

  it("keeps the original text first so message matching still works", () => {
    const error = httpError(429, "Rate limit reached");
    annotateProviderError(error, { provider: "openai", model: "gpt-5.4-mini" });
    expect(error.message.startsWith("429 Rate limit reached")).toBe(true);
    expect(new FailingProvider(error).isRateLimitError(error)).toBe(true);
  });

  it("annotates once, however many layers rethrow", () => {
    const error = httpError(401, "Incorrect API key");
    annotateProviderError(error, { provider: "openai", model: "gpt-5.4-mini" });
    const once = error.message;
    annotateProviderError(error, { provider: "openai", model: "gpt-5.4-mini" });
    expect(error.message).toBe(once);
  });

  it("explains an unreachable endpoint", () => {
    const error = new Error("fetch failed");
    annotateProviderError(error, { provider: "ollama", model: "qwen-3.5:4b" });
    expect(error.message).toContain("Could not reach ollama/qwen-3.5:4b");
  });

  it("leaves aborts and unclassified errors alone", () => {
    const abort = new Error("403 blocked");
    abort.name = "AbortError";
    annotateProviderError(abort, { provider: "gemini" });
    expect(abort.message).toBe("403 blocked");

    const plain = new Error("model returned no items");
    annotateProviderError(plain, { provider: "gemini" });
    expect(plain.message).toBe("model returned no items");
  });

  it("omits the model when it is the unknown placeholder", () => {
    const error = httpError(500, "internal error");
    annotateProviderError(error, { provider: "fal_ai", model: "unknown" });
    expect(error.message).not.toContain("unknown");
  });
});

describe("BaseProvider traced wrappers", () => {
  it("annotates streaming failures", async () => {
    const provider = new FailingProvider(
      httpError(403, "Your request was blocked.")
    );
    await expect(async () => {
      for await (const item of provider.generateMessagesTraced({
        messages: [{ role: "user", content: "hi" }],
        model: "gemini-3-pro"
      })) {
        expect(item).toBeDefined();
      }
    }).rejects.toThrow(/gemini\/gemini-3-pro/);
  });

  it("annotates non-streaming failures", async () => {
    const provider = new FailingProvider(
      httpError(403, "Your request was blocked.")
    );
    await expect(
      provider.generateMessageTraced({
        messages: [{ role: "user", content: "hi" }],
        model: "gemini-3-pro"
      })
    ).rejects.toThrow(/refused the request \(403\)/);
  });
});
