/**
 * Every non-chat provider call reports an `llm_call`, so the trace panel shows
 * image, video and audio calls next to chat — on success and on failure.
 */
import { describe, it, expect } from "vitest";
import { BaseProvider } from "../../src/providers/base-provider.js";
import type { ImageBytes } from "../../src/providers/types.js";

class MediaProvider extends BaseProvider {
  constructor(private readonly fail: boolean) {
    super("test");
  }
  async generateMessage(): Promise<never> {
    throw new Error("unused");
  }
  async *generateMessages(): AsyncGenerator<never> {
    throw new Error("unused");
  }
  async textToImage(_params: {
    model: { id: string };
    prompt: string;
  }): Promise<ImageBytes> {
    if (this.fail) throw new Error("boom");
    return new Uint8Array([1]) as unknown as ImageBytes;
  }
}

const collect = (provider: BaseProvider) => {
  const calls: Record<string, unknown>[] = [];
  provider.setMessageEmitter((msg) => {
    const m = msg as Record<string, unknown>;
    if (m.type === "llm_call") calls.push(m);
  });
  return calls;
};

const params = { model: { id: "img-1" }, prompt: "a fox" };

describe("modality llm_call", () => {
  it("reports a successful image call", async () => {
    const provider = new MediaProvider(false);
    const calls = collect(provider);
    await provider.textToImage(params);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      provider: "test",
      model: "img-1",
      operation: "textToImage",
      messages: [{ role: "user", content: "a fox" }],
      error: null
    });
  });

  it("reports a failed image call with its error", async () => {
    const provider = new MediaProvider(true);
    const calls = collect(provider);
    await expect(provider.textToImage(params)).rejects.toThrow("boom");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      operation: "textToImage",
      error: "Error: boom"
    });
  });
});
