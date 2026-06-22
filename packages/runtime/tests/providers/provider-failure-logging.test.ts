/**
 * Integration tests: when a provider call fails, BaseProvider's traced
 * wrappers centrally log precisely what was sent to the provider.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { BaseProvider } from "../../src/providers/base-provider.js";
import type {
  Message,
  ProviderStreamItem
} from "../../src/providers/types.js";

/** Provider that records a wire payload then fails. */
class RecordingFailingProvider extends BaseProvider {
  constructor() {
    super("test");
  }
  async generateMessage(): Promise<Message> {
    this.recordRequestPayload({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      api_key: "sk-should-be-redacted"
    });
    throw new Error("422 Unprocessable Entity");
  }
  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    this.recordRequestPayload({
      model: "m",
      stream: true,
      messages: [{ role: "user", content: "stream-hi" }]
    });
    throw new Error("422 Unprocessable Entity");
  }
}

/** Provider that fails without recording a wire payload. */
class UninstrumentedFailingProvider extends BaseProvider {
  constructor() {
    super("test");
  }
  async generateMessage(): Promise<Message> {
    throw new Error("500 boom");
  }
  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    throw new Error("500 boom");
  }
}

/** Provider whose call is aborted by the caller. */
class AbortingProvider extends BaseProvider {
  constructor() {
    super("test");
  }
  async generateMessage(): Promise<Message> {
    this.recordRequestPayload({ model: "m" });
    throw Object.assign(new Error("The operation was aborted"), {
      name: "AbortError"
    });
  }
  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    throw Object.assign(new Error("The operation was aborted"), {
      name: "AbortError"
    });
  }
}

function captureStderr(): { lines: () => string } {
  const chunks: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  return { lines: () => chunks.join("") };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BaseProvider failure logging – non-streaming", () => {
  it("logs the recorded wire payload (with secrets redacted) when generateMessage fails", async () => {
    const out = captureStderr();
    const p = new RecordingFailingProvider();
    await expect(
      p.generateMessageTraced({ messages: [], model: "m" })
    ).rejects.toThrow("422");
    const log = out.lines();
    expect(log).toContain("Provider request failed");
    expect(log).toContain("Unprocessable");
    expect(log).toContain("[redacted]");
    expect(log).toContain("\"messages\"");
  });

  it("falls back to NodeTool args when no wire payload was recorded", async () => {
    const out = captureStderr();
    const p = new UninstrumentedFailingProvider();
    await expect(
      p.generateMessageTraced({
        messages: [{ role: "user", content: "hello-fallback" }],
        model: "m"
      })
    ).rejects.toThrow("500");
    const log = out.lines();
    expect(log).toContain("Provider request failed");
    expect(log).toContain("hello-fallback");
  });

  it("does not log a failure when the request is aborted", async () => {
    const out = captureStderr();
    const p = new AbortingProvider();
    await expect(
      p.generateMessageTraced({ messages: [], model: "m" })
    ).rejects.toThrow();
    expect(out.lines()).not.toContain("Provider request failed");
  });
});

describe("BaseProvider failure logging – streaming", () => {
  it("logs the recorded wire payload when generateMessages fails", async () => {
    const out = captureStderr();
    const p = new RecordingFailingProvider();
    const gen = p.generateMessagesTraced({ messages: [], model: "m" });
    await expect(gen.next()).rejects.toThrow("422");
    const log = out.lines();
    expect(log).toContain("Provider request failed");
    expect(log).toContain("stream-hi");
  });
});
