import { describe, expect, it, vi } from "vitest";

const asrPipelineFn = vi.fn();

const decodeMock = vi.fn(
  async () => new Float32Array([0, 0.1, -0.1, 0, 0, 0.1, -0.1, 0])
);

vi.mock("@nodetool-ai/transformers-js-nodes", () => ({
  // Stub the combined decode+resample helper: yields 8 mono samples at 16kHz.
  decodeAudioBytesToSamples: (...args: unknown[]) => decodeMock(...(args as [])),
  getPipeline: vi.fn(async () => asrPipelineFn)
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
    // Stub decoder yields 8 mono samples.
    expect(samples.length).toBe(8);
  });

  it("threads temperature into the pipeline options", async () => {
    asrPipelineFn.mockResolvedValue({ text: "ok" });
    await automaticSpeechRecognition({
      audio: new Uint8Array([1, 2, 3]),
      model: "onnx-community/whisper-base",
      temperature: 0.4
    });
    const opts = asrPipelineFn.mock.calls.at(-1)?.[1];
    expect(opts.temperature).toBe(0.4);
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

  it("chunks audio longer than Whisper's 30 s window", async () => {
    asrPipelineFn.mockResolvedValue({ text: "short" });
    await automaticSpeechRecognition({
      audio: new Uint8Array([1, 2, 3]),
      model: "onnx-community/whisper-base"
    });
    expect(asrPipelineFn.mock.calls.at(-1)?.[1]).not.toHaveProperty("chunk_length_s");

    decodeMock.mockResolvedValueOnce(new Float32Array(31 * 16000));
    asrPipelineFn.mockResolvedValue({ text: "long" });
    await automaticSpeechRecognition({
      audio: new Uint8Array([1, 2, 3]),
      model: "onnx-community/whisper-base"
    });
    const opts = asrPipelineFn.mock.calls.at(-1)?.[1];
    expect(opts.chunk_length_s).toBe(30);
    expect(opts.stride_length_s).toBeGreaterThan(0);
  });
});
