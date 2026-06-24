import { describe, it, expect } from "vitest";
import { TextToSpeechNode } from "@nodetool-ai/audio-nodes";

function ttsModel(provider: string, id: string) {
  return {
    type: "tts_model",
    id,
    provider,
    name: id,
    voices: ["Aria"],
    selected_voice: "Aria"
  };
}

const audioData = (out: Record<string, unknown>): Buffer => {
  const audio = out.audio as { type: string; data: string };
  expect(audio.type).toBe("audio");
  return Buffer.from(audio.data, "base64");
};

describe("TextToSpeechNode", () => {
  it("emits an AudioRef from encoded bytes for file-returning providers", async () => {
    const mp3 = new Uint8Array([0xff, 0xfb, 0x10, 0x20]);
    let encodedReq: Record<string, unknown> | undefined;
    const ctx = {
      runProviderPrediction: async () => null,
      streamProviderPrediction: async function* () {},
      providerSupportsStreamingTTS: async () => false,
      textToSpeechEncoded: async (req: Record<string, unknown>) => {
        encodedReq = req;
        return { data: mp3, mimeType: "audio/mpeg" };
      }
    };
    const node = new TextToSpeechNode({
      text: "hi",
      model: ttsModel("fal_ai", "fal-ai/dia-tts"),
      speed: 1
    });
    const out = await node.process(ctx as never);
    expect(audioData(out)).toEqual(Buffer.from(mp3));
    expect(encodedReq?.provider).toBe("fal_ai");
    expect(encodedReq?.model).toBe("fal-ai/dia-tts");
  });

  it("wraps streamed PCM into a WAV for sample-streaming providers", async () => {
    const samples = new Int16Array([100, -100, 200, -200]);
    const ctx = {
      runProviderPrediction: async () => null,
      streamProviderPrediction: async function* () {
        yield { samples, sampleRate: 24000 };
      },
      providerSupportsStreamingTTS: async () => true,
      textToSpeechEncoded: async () => null
    };
    const node = new TextToSpeechNode({
      text: "hi",
      model: ttsModel("openai", "tts-1"),
      speed: 1
    });
    const out = await node.process(ctx as never);
    expect(audioData(out).subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("throws when no provider/model is configured", async () => {
    const node = new TextToSpeechNode({ text: "hi", model: {} as never });
    await expect(node.process({} as never)).rejects.toThrow(
      /requires a TTS provider/
    );
  });
});
