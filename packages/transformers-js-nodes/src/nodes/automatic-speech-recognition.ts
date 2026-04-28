import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  DEVICE_VALUES,
  DTYPE_VALUES,
  asString,
  extractRepoId,
  getPipeline,
  tjsModelDefault,
  loadAudioSamples,
  normalizeOption
} from "../transformers-base.js";
import { defaultRepoFor } from "../recommended-models.js";

const TJS_TYPE = "tjs.automatic_speech_recognition";

type AsrResult = {
  text?: string;
  chunks?: Array<{ text?: string; timestamp?: [number, number] }>;
};

const WHISPER_SAMPLING_RATE = 16000;

export class AutomaticSpeechRecognitionNode extends BaseNode {
  static readonly nodeType = "transformers.AutomaticSpeechRecognition";
  static readonly title = "Automatic Speech Recognition";
  static readonly description =
    "Transcribe audio into text using a Transformers.js automatic-speech-recognition pipeline (e.g. Whisper).\n" +
    "audio, asr, transcription, whisper, transformers, huggingface\n\n" +
    "Use cases:\n" +
    "- Generate transcripts for meetings or podcasts\n" +
    "- Subtitle videos\n" +
    "- Build offline voice assistants";
  static readonly metadataOutputTypes = {
    text: "str",
    chunks: "list"
  };

  @prop({
    type: "audio",
    default: { type: "audio" },
    title: "Audio",
    description: "Audio clip to transcribe."
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
    type: "str",
    default: "",
    title: "Language",
    description:
      "Optional language hint for multilingual models (e.g. 'english')."
  })
  declare language: any;

  @prop({
    type: "enum",
    default: "transcribe",
    title: "Task",
    description: "Whether to transcribe in source language or translate to English.",
    values: ["transcribe", "translate"]
  })
  declare task: any;

  @prop({
    type: "bool",
    default: false,
    title: "Return Timestamps",
    description: "Return per-chunk timestamps alongside the transcript."
  })
  declare return_timestamps: any;

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
    const samples = await loadAudioSamples(
      this.audio,
      WHISPER_SAMPLING_RATE,
      context
    );

    const repoId = extractRepoId(this.model);
    const pipeline = (await getPipeline({
      task: "automatic-speech-recognition",
      model: repoId || undefined,
      dtype: normalizeOption(this.dtype),
      device: normalizeOption(this.device)
    })) as (
      input: Float32Array,
      opts?: Record<string, unknown>
    ) => Promise<AsrResult>;

    const opts: Record<string, unknown> = {
      return_timestamps: Boolean(this.return_timestamps)
    };
    if (!isEnglishOnlyWhisper(repoId)) {
      const language = asString(this.language);
      if (language) opts.language = language;
      // `transcribe` is the model default — passing it explicitly is
      // redundant, and the only meaningful alternative is `translate`.
      const task = asString(this.task, "transcribe");
      if (task && task !== "transcribe") opts.task = task;
    }

    const raw = await pipeline(samples, opts);
    return {
      text: raw?.text ?? "",
      chunks: raw?.chunks ?? []
    };
  }
}

/**
 * English-only Whisper checkpoints (`*.en`) reject `task` and `language`
 * generation params and surface a confusing "If the model is intended to
 * be multilingual, pass is_multilingual=true" error when either is set.
 * The repo-id suffix is the canonical signal — every English-only Whisper
 * variant in the official repos uses the `.en` suffix.
 */
function isEnglishOnlyWhisper(repoId: string): boolean {
  if (!repoId) return false;
  const name = repoId.split("/").pop() ?? "";
  return /\.en$/i.test(name);
}

export const AUTOMATIC_SPEECH_RECOGNITION_NODES: readonly NodeClass[] = [
  AutomaticSpeechRecognitionNode
];
