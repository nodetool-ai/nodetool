import { describe, expect, it, vi } from "vitest";

const ttsPipelineFn = vi.fn();

vi.mock("@nodetool-ai/transformers-js-nodes", () => ({
  encodeWav: (samples: Float32Array, rate: number) => {
    const buf = Buffer.alloc(44 + samples.length * 2);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(36 + samples.length * 2, 4);
    buf.write("WAVE", 8);
    return buf;
  },
  getKokoro: vi.fn(async () => ({
    generate: async () => ({
      audio: new Float32Array([0.1, 0.2, 0.3]),
      sampling_rate: 24000
    })
  })),
  getPipeline: vi.fn(async () => ttsPipelineFn),
  isKokoroRepo: (id: string) => /kokoro/i.test(id),
  isSpeechT5Repo: (id: string) => /speecht5/i.test(id)
}));

import { textToSpeechEncoded } from "../src/tts.js";

describe("textToSpeechEncoded", () => {
  it("Kokoro path uses voice and returns WAV", async () => {
    const result = await textToSpeechEncoded({
      text: "hello",
      model: "onnx-community/Kokoro-82M-v1.0-ONNX",
      voice: "af_bella"
    });
    expect(result.mimeType).toBe("audio/wav");
    expect(result.data.slice(0, 4)).toEqual(new Uint8Array([0x52, 0x49, 0x46, 0x46]));
  });

  it("non-SpeechT5 pipeline path does not pass speaker_embeddings", async () => {
    ttsPipelineFn.mockResolvedValue({
      audio: new Float32Array([0.05]),
      sampling_rate: 16000
    });
    await textToSpeechEncoded({
      text: "hi",
      model: "Xenova/mms-tts-eng"
    });
    expect(ttsPipelineFn).toHaveBeenCalledTimes(1);
    const opts = ttsPipelineFn.mock.calls[0][1];
    expect(opts).not.toHaveProperty("speaker_embeddings");
  });

  it("SpeechT5 path passes a speaker_embeddings URL", async () => {
    ttsPipelineFn.mockResolvedValue({
      audio: new Float32Array([0.05]),
      sampling_rate: 16000
    });
    await textToSpeechEncoded({
      text: "hi",
      model: "Xenova/speecht5_tts"
    });
    const opts = ttsPipelineFn.mock.calls.at(-1)?.[1];
    expect(opts).toHaveProperty("speaker_embeddings");
  });
});
