import { describe, expect, it, vi } from "vitest";

const asrPipelineFn = vi.fn();

vi.mock("@nodetool/transformers-js-nodes", () => ({
  decodeWav: () => ({
    samples: new Float32Array([0, 0.1, -0.1, 0]),
    sampleRate: 8000,
    numChannels: 1
  }),
  getPipeline: vi.fn(async () => asrPipelineFn),
  resampleLinear: (s: Float32Array, from: number, to: number) =>
    from === to ? s : new Float32Array([...s, ...s])
}));

import { automaticSpeechRecognition } from "../src/asr.js";

describe("automaticSpeechRecognition", () => {
  it("decodes, resamples to 16kHz, and returns plain text", async () => {
    asrPipelineFn.mockResolvedValue({ text: "hello world" });

    const result = await automaticSpeechRecognition({
      audio: new Uint8Array([1, 2, 3]),
      model: "onnx-community/whisper-large-v3-turbo"
    });

    expect(result).toEqual({ text: "hello world" });
    const samples = asrPipelineFn.mock.calls[0][0] as Float32Array;
    // Stub resample doubles the length when from != to.
    expect(samples.length).toBe(8);
  });

  it("returns word-level chunks when word_timestamps is set", async () => {
    asrPipelineFn.mockResolvedValue({
      text: "hi there",
      chunks: [
        { timestamp: [0, 0.5], text: "hi" },
        { timestamp: [0.5, 1.0], text: "there" }
      ]
    });

    const result = await automaticSpeechRecognition({
      audio: new Uint8Array([1, 2, 3]),
      model: "onnx-community/whisper-base",
      word_timestamps: true
    });

    expect(result.text).toBe("hi there");
    expect(result.chunks).toHaveLength(2);
    const opts = asrPipelineFn.mock.calls.at(-1)?.[1];
    expect(opts.return_timestamps).toBe("word");
  });
});
