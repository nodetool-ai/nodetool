import { describe, it, expect } from "vitest";
import { TextToSpeechNode } from "@nodetool-ai/audio-nodes";

function ttsModel(provider: string, id: string, capabilities: string[] = []) {
  return {
    type: "tts_model",
    id,
    provider,
    name: id,
    voices: ["Aria"],
    selected_voice: "Aria",
    capabilities
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

  it("forwards supported voice-cloning inputs", async () => {
    let encodedReq: Record<string, unknown> | undefined;
    const ctx = {
      runProviderPrediction: async () => null,
      streamProviderPrediction: async function* () {},
      providerSupportsStreamingTTS: async () => false,
      textToSpeechEncoded: async (req: Record<string, unknown>) => {
        encodedReq = req;
        return { data: new Uint8Array([1, 2, 3]), mimeType: "audio/wav" };
      }
    };
    const node = new TextToSpeechNode({
      text: "clone this",
      model: ttsModel("huggingface", "clone/model", [
        "voice_cloning",
        "reference_transcript",
        "language_selection",
        "instruction_control"
      ]),
      speed: 1,
      reference_audio: {
        type: "audio",
        uri: "",
        data: Buffer.from("reference").toString("base64")
      },
      reference_text: "reference words",
      language: "en",
      instructions: "warm and calm"
    });

    await node.process(ctx as never);
    const params = encodedReq?.params as Record<string, unknown>;
    expect(params.reference_audio).toEqual(
      new Uint8Array(Buffer.from("reference"))
    );
    expect(params.reference_text).toBe("reference words");
    expect(params.language).toBe("en");
    expect(params.instructions).toBe("warm and calm");
  });

  it("omits values not supported by the selected model", async () => {
    let encodedReq: Record<string, unknown> | undefined;
    const ctx = {
      runProviderPrediction: async () => null,
      streamProviderPrediction: async function* () {},
      providerSupportsStreamingTTS: async () => false,
      textToSpeechEncoded: async (req: Record<string, unknown>) => {
        encodedReq = req;
        return { data: new Uint8Array([1]), mimeType: "audio/wav" };
      }
    };
    const node = new TextToSpeechNode({
      text: "legacy",
      model: ttsModel("openai", "tts-1"),
      reference_text: "must not leak",
      language: "xx",
      instructions: "must not leak"
    });

    await node.process(ctx as never);
    const params = encodedReq?.params as Record<string, unknown>;
    expect(params).not.toHaveProperty("reference_audio");
    expect(params).not.toHaveProperty("reference_text");
    expect(params).not.toHaveProperty("language");
    expect(params).not.toHaveProperty("instructions");
  });

  it("validates required cloning inputs before calling the provider", async () => {
    let providerCalled = false;
    const ctx = {
      runProviderPrediction: async () => null,
      streamProviderPrediction: async function* () {},
      providerSupportsStreamingTTS: async () => {
        providerCalled = true;
        return false;
      },
      textToSpeechEncoded: async () => null
    };
    const model = {
      ...ttsModel("huggingface", "SWivid/F5-TTS", [
        "voice_cloning",
        "reference_transcript"
      ]),
      requires_reference_text: true
    };
    const node = new TextToSpeechNode({ text: "clone", model });

    await expect(node.process(ctx as never)).rejects.toThrow(
      /requires reference audio/
    );
    expect(providerCalled).toBe(false);
  });

  it("throws when no provider/model is configured", async () => {
    const node = new TextToSpeechNode({ text: "hi", model: {} as never });
    await expect(node.process({} as never)).rejects.toThrow(
      /requires a TTS provider/
    );
  });
});
