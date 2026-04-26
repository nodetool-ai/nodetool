import { afterEach, describe, expect, it, vi } from "vitest";
import { TextClassificationNode } from "../src/nodes/text-classification.js";
import { QuestionAnsweringNode } from "../src/nodes/question-answering.js";
import { TranslationNode } from "../src/nodes/translation.js";
import { ZeroShotClassificationNode } from "../src/nodes/zero-shot-classification.js";
import { FeatureExtractionNode } from "../src/nodes/feature-extraction.js";
import { AutomaticSpeechRecognitionNode } from "../src/nodes/automatic-speech-recognition.js";
import { __setTransformersModuleForTesting } from "../src/transformers-base.js";

type PipelineFactory = (...args: unknown[]) => unknown;

function stubPipeline(impl: PipelineFactory): ReturnType<typeof vi.fn> {
  const pipelineFn = vi.fn(impl);
  const factory = vi.fn(async () => pipelineFn);
  __setTransformersModuleForTesting({
    pipeline: factory as unknown as (
      task: string,
      model?: string,
      options?: Record<string, unknown>
    ) => Promise<unknown>
  });
  return pipelineFn;
}

describe("Transformers.js pipeline nodes", () => {
  afterEach(() => {
    __setTransformersModuleForTesting(null);
  });

  it("returns the top label for text classification", async () => {
    stubPipeline(async () => [
      { label: "POSITIVE", score: 0.97 },
      { label: "NEGATIVE", score: 0.03 }
    ]);
    const node = new TextClassificationNode({ text: "I love this" });
    const result = await node.process();
    expect(result.label).toBe("POSITIVE");
    expect(result.score).toBeCloseTo(0.97);
    expect(Array.isArray(result.results)).toBe(true);
  });

  it("rejects empty text in text classification", async () => {
    stubPipeline(async () => []);
    const node = new TextClassificationNode({ text: "" });
    await expect(node.process()).rejects.toThrow("Text is required");
  });

  it("returns answer span for question answering", async () => {
    stubPipeline(async () => ({
      answer: "Paris",
      score: 0.99,
      start: 0,
      end: 5
    }));
    const node = new QuestionAnsweringNode({
      question: "Capital of France?",
      context: "Paris is the capital of France."
    });
    const result = await node.process();
    expect(result.answer).toBe("Paris");
    expect(result.score).toBeCloseTo(0.99);
  });

  it("forwards src_lang and tgt_lang to translation pipeline", async () => {
    const pipelineFn = stubPipeline(async () => ({
      translation_text: "Bonjour"
    }));
    const node = new TranslationNode({
      text: "Hello",
      src_lang: "eng_Latn",
      tgt_lang: "fra_Latn"
    });
    const result = await node.process();
    expect(result.translation).toBe("Bonjour");
    const [, opts] = pipelineFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(opts.src_lang).toBe("eng_Latn");
    expect(opts.tgt_lang).toBe("fra_Latn");
  });

  it("parses comma-separated candidate labels for zero-shot", async () => {
    const pipelineFn = stubPipeline(async () => ({
      sequence: "x",
      labels: ["urgent", "phone"],
      scores: [0.8, 0.2]
    }));
    const node = new ZeroShotClassificationNode({
      text: "broken iphone",
      candidate_labels: "urgent, phone"
    });
    const result = await node.process();
    expect(result.label).toBe("urgent");
    expect(result.labels).toEqual(["urgent", "phone"]);
    const [, labels] = pipelineFn.mock.calls[0] as [string, string[]];
    expect(labels).toEqual(["urgent", "phone"]);
  });

  it("flattens pooled 2-D feature-extraction tensor into a vector", async () => {
    stubPipeline(async () => ({
      data: new Float32Array([0.1, 0.2, 0.3]),
      dims: [1, 3],
      tolist: () => [[0.1, 0.2, 0.3]]
    }));
    const node = new FeatureExtractionNode({ text: "hi" });
    const result = await node.process();
    expect(result.embedding).toHaveLength(3);
    expect(result.dim).toBe(3);
    const embedding = result.embedding as number[];
    expect(embedding[0]).toBeCloseTo(0.1);
  });

  // ── Whisper task/language gating ──────────────────────────────────────

  /**
   * Build a tiny mono 16k WAV so the audio-decode fast path lands on a
   * Float32Array without invoking ffmpeg.
   */
  function tinyWavRef() {
    const samples = new Float32Array(160); // 10 ms at 16k
    const dataSize = samples.length * 2;
    const buf = Buffer.alloc(44 + dataSize);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write("WAVE", 8);
    buf.write("fmt ", 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(16000, 24);
    buf.writeUInt32LE(32000, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write("data", 36);
    buf.writeUInt32LE(dataSize, 40);
    return { data: Buffer.from(buf).toString("base64") };
  }

  it("ASR omits task and language for English-only Whisper models", async () => {
    const pipelineFn = stubPipeline(async () => ({ text: "ok" }));
    const node = new AutomaticSpeechRecognitionNode({
      audio: tinyWavRef(),
      model: { type: "tjs.automatic_speech_recognition", repo_id: "Xenova/whisper-tiny.en" },
      language: "english", // user picked one — must still be dropped
      task: "translate" // user picked one — must still be dropped
    });
    await node.process();
    const [, opts] = pipelineFn.mock.calls[0] as [
      Float32Array,
      Record<string, unknown>
    ];
    expect(opts).not.toHaveProperty("language");
    expect(opts).not.toHaveProperty("task");
  });

  it("ASR forwards language for multilingual Whisper models when set", async () => {
    const pipelineFn = stubPipeline(async () => ({ text: "ok" }));
    const node = new AutomaticSpeechRecognitionNode({
      audio: tinyWavRef(),
      model: { type: "tjs.automatic_speech_recognition", repo_id: "Xenova/whisper-tiny" },
      language: "english"
    });
    await node.process();
    const [, opts] = pipelineFn.mock.calls[0] as [
      Float32Array,
      Record<string, unknown>
    ];
    expect(opts.language).toBe("english");
  });

  it("ASR forwards task=translate for multilingual models but skips redundant transcribe default", async () => {
    const pipelineFn = stubPipeline(async () => ({ text: "ok" }));

    // task="transcribe" is the model default — should NOT be sent.
    const transcribeNode = new AutomaticSpeechRecognitionNode({
      audio: tinyWavRef(),
      model: { type: "tjs.automatic_speech_recognition", repo_id: "Xenova/whisper-base" }
    });
    await transcribeNode.process();
    const [, transcribeOpts] = pipelineFn.mock.calls[0] as [
      Float32Array,
      Record<string, unknown>
    ];
    expect(transcribeOpts).not.toHaveProperty("task");

    // task="translate" is meaningful — should be forwarded.
    const translateNode = new AutomaticSpeechRecognitionNode({
      audio: tinyWavRef(),
      model: { type: "tjs.automatic_speech_recognition", repo_id: "Xenova/whisper-base" },
      task: "translate"
    });
    await translateNode.process();
    const [, translateOpts] = pipelineFn.mock.calls[1] as [
      Float32Array,
      Record<string, unknown>
    ];
    expect(translateOpts.task).toBe("translate");
  });

  it("mean-pools a 3-D feature-extraction tensor across the sequence axis", async () => {
    // Shape [batch=1, seq=2, dim=3] → mean of the two token vectors per dim.
    stubPipeline(async () => ({
      tolist: () => [
        [
          [0.0, 1.0, 2.0],
          [2.0, 3.0, 4.0]
        ]
      ]
    }));
    const node = new FeatureExtractionNode({
      text: "hi",
      pooling: "none"
    });
    const result = await node.process();
    expect(result.dim).toBe(3);
    const embedding = result.embedding as number[];
    expect(embedding[0]).toBeCloseTo(1.0);
    expect(embedding[1]).toBeCloseTo(2.0);
    expect(embedding[2]).toBeCloseTo(3.0);
  });
});
