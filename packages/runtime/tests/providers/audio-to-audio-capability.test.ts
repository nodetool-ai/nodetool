import { describe, it, expect } from "vitest";
import {
  BaseProvider,
  type ProviderCapability
} from "../../src/providers/base-provider.js";
import type {
  AudioToAudioModel,
  AudioToAudioParams,
  EncodedAudioResult,
  Message,
  MessageContent
} from "../../src/providers/types.js";

class SilentProvider extends BaseProvider {
  constructor() {
    super("fake");
  }
  async generateMessage(): Promise<Message> {
    return { role: "assistant", content: "" };
  }
  async *generateMessages(): AsyncGenerator<MessageContent> {}
}

class TransformProvider extends SilentProvider {
  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["audio_to_audio"];
  }

  override async getAvailableAudioToAudioModels(): Promise<
    AudioToAudioModel[]
  > {
    return [
      {
        id: "voice-changer",
        name: "Voice Changer",
        provider: "fake",
        supportedTasks: ["audio_to_audio"]
      }
    ];
  }

  override async audioToAudio(
    audio: Uint8Array,
    _params: AudioToAudioParams
  ): Promise<EncodedAudioResult> {
    return { data: audio, mimeType: "audio/mpeg" };
  }
}

describe("audio_to_audio provider capability", () => {
  it("is advertised only by a provider that declares it", () => {
    expect(new SilentProvider().getCapabilities()).not.toContain(
      "audio_to_audio"
    );
    expect(new TransformProvider().getCapabilities()).toContain(
      "audio_to_audio"
    );
  });

  it("refuses the call on a provider that does not implement it", async () => {
    await expect(
      new SilentProvider().audioToAudio(new Uint8Array([1]), {
        model: { id: "x", name: "x", provider: "fake" }
      })
    ).rejects.toThrow(/does not support audioToAudio/);
  });
});
