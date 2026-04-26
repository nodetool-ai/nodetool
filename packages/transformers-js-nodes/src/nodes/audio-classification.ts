import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import {
  DEVICE_VALUES,
  DTYPE_VALUES,
  asNumber,
  asString,
  ensureArray,
  extractRepoId,
  getPipeline,
  tjsModelDefault,
  loadAudioSamples,
  normalizeOption
} from "../transformers-base.js";
import { defaultRepoFor } from "../recommended-models.js";

const TJS_TYPE = "tjs.audio_classification";

type AudioClassificationResult = { label: string; score: number };

const DEFAULT_SAMPLING_RATE = 16000;

export class AudioClassificationNode extends BaseNode {
  static readonly nodeType = "transformers.AudioClassification";
  static readonly title = "Audio Classification";
  static readonly description =
    "Classify an audio clip using a Transformers.js audio-classification pipeline.\n" +
    "audio, classification, transformers, huggingface\n\n" +
    "Use cases:\n" +
    "- Detect spoken language\n" +
    "- Identify speakers or emotions\n" +
    "- Tag environmental sounds";
  static readonly metadataOutputTypes = {
    label: "str",
    score: "float",
    results: "list"
  };

  @prop({
    type: "audio",
    default: { type: "audio" },
    title: "Audio",
    description: "Audio clip to classify."
  })
  declare audio: any;

  @prop({
    type: TJS_TYPE,
    default: tjsModelDefault(TJS_TYPE, defaultRepoFor(TJS_TYPE)),
    title: "Model",
    description: "Transformers.js model (ONNX-compatible)."
  })
  declare model: any;

  @prop({
    type: "int",
    default: 5,
    title: "Top K",
    description: "Number of top labels to return.",
    min: 1,
    max: 100
  })
  declare top_k: any;

  @prop({
    type: "int",
    default: DEFAULT_SAMPLING_RATE,
    title: "Sampling Rate",
    description: "Sampling rate (Hz) used when decoding the audio.",
    min: 8000,
    max: 48000
  })
  declare sampling_rate: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Quantization",
    description: "Model dtype / quantization level.",
    values: DTYPE_VALUES
  })
  declare dtype: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Device",
    description: "Inference device.",
    values: DEVICE_VALUES
  })
  declare device: any;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const samplingRate = asNumber(this.sampling_rate, DEFAULT_SAMPLING_RATE);
    const samples = await loadAudioSamples(this.audio, samplingRate, context);

    const pipeline = (await getPipeline({
      task: "audio-classification",
      model: extractRepoId(this.model) || undefined,
      dtype: normalizeOption(this.dtype),
      device: normalizeOption(this.device)
    })) as (
      input: Float32Array,
      opts?: Record<string, unknown>
    ) => Promise<AudioClassificationResult | AudioClassificationResult[]>;

    const raw = await pipeline(samples, { top_k: asNumber(this.top_k, 5) });
    const results = ensureArray<AudioClassificationResult>(raw);
    const top = results[0] ?? { label: "", score: 0 };

    return {
      label: top.label,
      score: top.score,
      results
    };
  }
}

export const AUDIO_CLASSIFICATION_NODES: readonly NodeClass[] = [
  AudioClassificationNode
];
