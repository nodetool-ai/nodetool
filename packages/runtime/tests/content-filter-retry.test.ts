/**
 * `runProviderPrediction` retries a content-filter refusal.
 *
 * Veo filtered one shot of a five-shot trailer on an ordinary cinematic prompt
 * and passed the same prompt on retry, and the blocked take was not charged —
 * so the first answer to a refusal is to ask again, before it ever reaches the
 * node that asked.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { ProcessingContext } from "../src/context.js";
import { BaseProvider } from "../src/providers/base-provider.js";
import { ContentFilterRefusal } from "../src/providers/content-filter.js";
import type { Message, ProviderStreamItem } from "../src/providers/types.js";
import type { LogUpdate } from "@nodetool-ai/protocol";

/** Fails `failures` times with `error`, then returns one byte. */
class FlakyImageProvider extends BaseProvider {
  attempts = 0;
  constructor(
    private readonly failures: number,
    private readonly error: Error
  ) {
    super("flaky");
  }

  override async textToImage(): Promise<Uint8Array> {
    this.attempts += 1;
    if (this.attempts <= this.failures) throw this.error;
    return new Uint8Array([7]);
  }

  async generateMessage(): Promise<Message> {
    throw new Error("not used");
  }

  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    throw new Error("not used");
  }
}

function predict(ctx: ProcessingContext): Promise<unknown> {
  return ctx.runProviderPrediction({
    provider: "flaky",
    capability: "text_to_image",
    model: "veo-3.1-generate-preview",
    nodeId: "animate",
    params: { prompt: "a lighthouse in a storm" }
  });
}

const REFUSAL = new ContentFilterRefusal(
  "videos were filtered out because they violated Vertex AI's usage guidelines"
);

afterEach(() => {
  vi.useRealTimers();
});

describe("ProcessingContext – content-filter retry", () => {
  it("retries a refusal and returns the take that gets through", async () => {
    vi.useFakeTimers();
    const provider = new FlakyImageProvider(1, REFUSAL);
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.registerProvider("flaky", provider);

    const pending = predict(ctx);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(await pending).toEqual(new Uint8Array([7]));
    expect(provider.attempts).toBe(2);

    const log = ctx
      .getMessages()
      .find((m): m is LogUpdate => m.type === "log_update");
    expect(log?.severity).toBe("warning");
    expect(log?.content).toContain("content-filtered");
    // The prediction the node sees succeeded — no failure was reported for it.
    const statuses = ctx
      .getMessages()
      .filter((m) => m.type === "prediction")
      .map((m) => (m as { status: string }).status);
    expect(statuses).toEqual(["running", "completed"]);
  });

  it("gives up after a bounded number of attempts, refusal intact", async () => {
    vi.useFakeTimers();
    const provider = new FlakyImageProvider(Infinity, REFUSAL);
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.registerProvider("flaky", provider);

    const pending = predict(ctx).catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(await pending).toBe(REFUSAL);
    expect(provider.attempts).toBe(3);
  });

  it("does not retry an ordinary provider failure", async () => {
    const provider = new FlakyImageProvider(
      1,
      new Error("401 Incorrect API key provided")
    );
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.registerProvider("flaky", provider);

    await expect(predict(ctx)).rejects.toThrow("401");
    expect(provider.attempts).toBe(1);
  });
});
