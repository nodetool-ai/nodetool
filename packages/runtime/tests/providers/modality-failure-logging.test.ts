/**
 * Integration tests: BaseProvider wraps every non-chat modality method a
 * concrete provider overrides (image/video/audio/3D/embedding) with the same
 * central failure logging chat gets, without callers doing anything special.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { BaseProvider } from "../../src/providers/base-provider.js";
import type {
  ImageModel,
  Message,
  ProviderStreamItem,
  StreamingAudioChunk,
  TextToImageParams
} from "../../src/providers/types.js";

const imageModel: ImageModel = {
  id: "img-model-1",
  name: "img-model-1",
  provider: "test"
};

/** Exercises a representative slice of the modality surface. */
class ModalityProvider extends BaseProvider {
  constructor() {
    super("test");
  }
  async generateMessage(): Promise<Message> {
    return { role: "assistant", content: "" } as Message;
  }
  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    yield* [];
  }

  override async textToImage(_params: TextToImageParams): Promise<Uint8Array> {
    this.recordRequestPayload({
      model: imageModel.id,
      prompt: "wire-prompt",
      api_key: "sk-should-be-redacted"
    });
    throw new Error("422 Unprocessable Entity");
  }

  // Not overridden: textToImages — the base default delegates to textToImage.

  override async generateEmbedding(_args: {
    text: string | string[];
    model: string;
  }): Promise<number[][]> {
    throw new Error("500 embedding boom");
  }

  override async *textToSpeech(_args: {
    text: string;
    model: string;
  }): AsyncGenerator<StreamingAudioChunk> {
    yield* [];
    throw new Error("503 tts boom");
  }
}

/** A provider that does NOT override a given modality keeps its base throw. */
class BareProvider extends BaseProvider {
  constructor() {
    super("test");
  }
  async generateMessage(): Promise<Message> {
    return { role: "assistant", content: "" } as Message;
  }
  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    yield* [];
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

describe("BaseProvider modality failure logging", () => {
  it("logs the recorded wire payload (secrets redacted) when textToImage fails", async () => {
    const out = captureStderr();
    const p = new ModalityProvider();
    await expect(
      p.textToImage({ model: imageModel, prompt: "hi" })
    ).rejects.toThrow("422");
    const log = out.lines();
    expect(log).toContain("Provider request failed");
    expect(log).toContain("wire-prompt");
    expect(log).toContain("[redacted]");
    expect(log).toContain("img-model-1");
  });

  it("logs only once when a batch helper delegates to its singular method", async () => {
    const out = captureStderr();
    const p = new ModalityProvider();
    await expect(
      p.textToImages({ model: imageModel, prompt: "hi" }, 1)
    ).rejects.toThrow("422");
    const occurrences = out.lines().split("Provider request failed").length - 1;
    expect(occurrences).toBe(1);
  });

  it("falls back to call args when a modality records no wire payload", async () => {
    const out = captureStderr();
    const p = new ModalityProvider();
    await expect(
      p.generateEmbedding({ text: "embed-this", model: "emb-1" })
    ).rejects.toThrow("500");
    const log = out.lines();
    expect(log).toContain("Provider request failed");
    expect(log).toContain("embed-this");
    expect(log).toContain("emb-1");
  });

  it("logs failures from async-generator modalities (textToSpeech)", async () => {
    const out = captureStderr();
    const p = new ModalityProvider();
    const gen = p.textToSpeech({ text: "speak-this", model: "tts-1" });
    await expect(
      (async () => {
        for await (const _ of gen) {
          // drain
        }
      })()
    ).rejects.toThrow("503");
    const log = out.lines();
    expect(log).toContain("Provider request failed");
    expect(log).toContain("speak-this");
    expect(log).toContain("tts-1");
  });

  it("keeps the base 'does not support' throw for unimplemented modalities", async () => {
    const out = captureStderr();
    const p = new BareProvider();
    await expect(
      p.textToImage({ model: imageModel, prompt: "hi" })
    ).rejects.toThrow("does not support textToImage");
    // An unsupported modality is a programming error, not a provider failure.
    expect(out.lines()).not.toContain("Provider request failed");
  });

  it("does not log when a modality call is aborted by the caller", async () => {
    const out = captureStderr();
    class AbortingModalityProvider extends ModalityProvider {
      override async textToImage(): Promise<Uint8Array> {
        throw Object.assign(new Error("The operation was aborted"), {
          name: "AbortError"
        });
      }
    }
    const p = new AbortingModalityProvider();
    await expect(
      p.textToImage({ model: imageModel, prompt: "hi" })
    ).rejects.toThrow();
    expect(out.lines()).not.toContain("Provider request failed");
  });
});
