import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  getHfToken,
  hfPipelineJson,
  refToBase64,
  type MediaRef
} from "../huggingface-base.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const EMPTY_AUDIO = {
  type: "audio",
  uri: "",
  asset_id: null,
  data: null,
  metadata: null
};

// ---------------------------------------------------------------------------
// Automatic Speech Recognition (speech-to-text)
// ---------------------------------------------------------------------------
export class AutomaticSpeechRecognitionNode extends BaseNode {
  static readonly nodeType = "huggingface.AutomaticSpeechRecognition";
  static readonly title = "Automatic Speech Recognition";
  static readonly description =
    "Transcribe audio to text (speech-to-text) via Hugging Face Inference Providers.\n" +
    "audio, asr, speech-to-text, stt, transcription, whisper, huggingface\n\n" +
    "Use cases:\n" +
    "- Transcribe recordings and podcasts\n" +
    "- Generate subtitles\n" +
    "- Build voice interfaces";
  static readonly inputFields = ["audio"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly metadataOutputTypes = { output: "str", chunks: "list" };

  @prop({
    type: "str",
    default: "openai/whisper-large-v3",
    title: "Model",
    description: "Automatic-speech-recognition model repo id."
  })
  declare model: any;

  @prop({
    type: "audio",
    default: EMPTY_AUDIO,
    title: "Audio",
    description: "The audio to transcribe."
  })
  declare audio: any;

  @prop({
    type: "bool",
    default: false,
    title: "Return Timestamps",
    description: "Also return per-chunk timestamps."
  })
  declare return_timestamps: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const audio = this.audio as MediaRef | undefined;
    if (!audio || (!audio.uri && !audio.data)) {
      throw new Error("Input audio is required");
    }

    const base64 = await refToBase64(audio);
    const returnTimestamps = Boolean(this.return_timestamps ?? false);

    const result = await hfPipelineJson<{
      text?: string;
      chunks?: Array<{ text?: string; timestamp?: number[] }>;
    }>(token, String(this.model ?? "openai/whisper-large-v3"), {
      inputs: base64,
      ...(returnTimestamps
        ? { parameters: { return_timestamps: true } }
        : {})
    });

    return {
      output: String(result?.text ?? ""),
      chunks: result?.chunks ?? []
    };
  }
}

// ---------------------------------------------------------------------------
// Audio Classification
// ---------------------------------------------------------------------------
export class AudioClassificationNode extends BaseNode {
  static readonly nodeType = "huggingface.AudioClassification";
  static readonly title = "Audio Classification";
  static readonly description =
    "Assign a label / class to an audio clip.\n" +
    "audio, classification, sound, label, huggingface\n\n" +
    "Use cases:\n" +
    "- Detect spoken language\n" +
    "- Classify sounds or music genres\n" +
    "- Emotion / keyword spotting";
  static readonly inputFields = ["audio"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly metadataOutputTypes = { output: "str", scores: "list" };

  @prop({
    type: "str",
    default: "superb/hubert-base-superb-er",
    title: "Model",
    description: "Audio-classification model repo id."
  })
  declare model: any;

  @prop({
    type: "audio",
    default: EMPTY_AUDIO,
    title: "Audio",
    description: "The audio to classify."
  })
  declare audio: any;

  @prop({
    type: "int",
    default: 5,
    title: "Top K",
    description: "Return the top K most probable classes.",
    min: 1,
    max: 100
  })
  declare top_k: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const audio = this.audio as MediaRef | undefined;
    if (!audio || (!audio.uri && !audio.data)) {
      throw new Error("Input audio is required");
    }

    const base64 = await refToBase64(audio);
    const result = await hfPipelineJson<
      Array<{ label?: string; score?: number }>
    >(token, String(this.model ?? "superb/hubert-base-superb-er"), {
      inputs: base64,
      parameters: { top_k: Number(this.top_k ?? 5) }
    });

    const scores = Array.isArray(result) ? result : [];
    return { output: String(scores[0]?.label ?? ""), scores };
  }
}

export const HUGGINGFACE_AUDIO_NODES: readonly NodeClass[] = [
  AutomaticSpeechRecognitionNode,
  AudioClassificationNode
];
