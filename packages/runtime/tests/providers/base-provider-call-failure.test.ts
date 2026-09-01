/**
 * BaseProvider emits one `provider_call_failed` per failed call, from every
 * failure path it wraps — chat and the media modalities alike. That message is
 * what the bug reporter attaches, so a surface never has to re-derive the
 * provider, model and status from the error prose.
 */
import { describe, it, expect } from "vitest";
import { BaseProvider } from "../../src/providers/base-provider.js";
import type {
  ImageBytes,
  Message,
  ProviderStreamItem,
  ProviderTool
} from "../../src/providers/types.js";

function rateLimited(): Error {
  return Object.assign(new Error("429 Too Many Requests"), {
    status: 429,
    request_id: "req_zz"
  });
}

class FailingProvider extends BaseProvider {
  constructor() {
    super("test");
  }

  async generateMessage(_args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
  }): Promise<Message> {
    throw rateLimited();
  }

  async *generateMessages(_args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
  }): AsyncGenerator<ProviderStreamItem> {
    throw rateLimited();
    yield { type: "chunk", content: "", done: true };
  }

  async textToImage(_params: {
    model: { id: string };
    prompt: string;
  }): Promise<ImageBytes> {
    throw rateLimited();
  }
}

function collect(provider: BaseProvider): Record<string, unknown>[] {
  const messages: Record<string, unknown>[] = [];
  provider.setMessageEmitter((msg) =>
    messages.push(msg as Record<string, unknown>)
  );
  return messages;
}

const chatArgs = {
  messages: [{ role: "user", content: "hi" }] as Message[],
  model: "test-model"
};

describe("BaseProvider provider_call_failed", () => {
  it("reports a failed non-streaming chat call", async () => {
    const provider = new FailingProvider();
    const messages = collect(provider);

    await expect(provider.generateMessageTraced(chatArgs)).rejects.toThrow();

    const failure = messages.find(
      (msg) => msg.type === "provider_call_failed"
    );
    expect(failure).toMatchObject({
      provider: "test",
      model: "test-model",
      operation: "generateMessage",
      kind: "rate_limit",
      status: 429,
      request_id: "req_zz"
    });
  });

  it("reports a failed streaming chat call", async () => {
    const provider = new FailingProvider();
    const messages = collect(provider);

    await expect(async () => {
      for await (const _item of provider.generateMessagesTraced(chatArgs)) {
        // drain
      }
    }).rejects.toThrow();

    expect(
      messages.find((msg) => msg.type === "provider_call_failed")
    ).toMatchObject({ operation: "generateMessages", status: 429 });
  });

  it("reports a failed media call, naming the modality", async () => {
    const provider = new FailingProvider();
    const messages = collect(provider);

    await expect(
      provider.textToImage({ model: { id: "flux" }, prompt: "a red fox" })
    ).rejects.toThrow();

    expect(
      messages.find((msg) => msg.type === "provider_call_failed")
    ).toMatchObject({
      operation: "textToImage",
      model: "flux",
      kind: "rate_limit"
    });
  });

  it("reports nothing when the caller cancelled", async () => {
    class AbortingProvider extends FailingProvider {
      async textToImage(): Promise<ImageBytes> {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      }
    }
    const provider = new AbortingProvider();
    const messages = collect(provider);

    await expect(
      provider.textToImage({ model: { id: "flux" }, prompt: "x" })
    ).rejects.toThrow();

    expect(messages.some((msg) => msg.type === "provider_call_failed")).toBe(
      false
    );
  });
});
