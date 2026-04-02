import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getFalApiKey,
  falSubmit,
  removeNulls,
  isRefSet,
  assetToFalUrl,
  imageToDataUrl
} from "../fal-base.js";

// Re-export alias
const FalNode = BaseNode;

export class NemotronAsrStream extends FalNode {
  static readonly nodeType = "fal.audio_to_text.NemotronAsrStream";
  static readonly title = "Nemotron Asr Stream";
  static readonly description = `Use the fast speed and pin point accuracy of nemotron to transcribe your texts.
speech, recognition, transcription, audio-analysis`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({
    type: "enum",
    default: "none",
    values: ["none", "low", "medium", "high"],
    description:
      "Controls the speed/accuracy trade-off. 'none' = best accuracy (1.12s chunks, ~7.16% WER), 'low' = balanced (0.56s chunks, ~7.22% WER), 'medium' = faster (0.16s chunks, ~7.84% WER), 'high' = fastest (0.08s chunks, ~8.53% WER)."
  })
  declare acceleration: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file." })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const acceleration = String(this.acceleration ?? "none");

    const args: Record<string, unknown> = {
      acceleration: acceleration
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/nemotron/asr/stream", args);
    return { output: res };
  }
}

export class NemotronAsr extends FalNode {
  static readonly nodeType = "fal.audio_to_text.NemotronAsr";
  static readonly title = "Nemotron Asr";
  static readonly description = `Use the fast speed and pin point accuracy of nemotron to transcribe your texts.
speech, recognition, transcription, audio-analysis`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { partial: "bool", output: "str" };

  @prop({
    type: "enum",
    default: "none",
    values: ["none", "low", "medium", "high"],
    description:
      "Controls the speed/accuracy trade-off. 'none' = best accuracy (1.12s chunks, ~7.16% WER), 'low' = balanced (0.56s chunks, ~7.22% WER), 'medium' = faster (0.16s chunks, ~7.84% WER), 'high' = fastest (0.08s chunks, ~8.53% WER)."
  })
  declare acceleration: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file." })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const acceleration = String(this.acceleration ?? "none");

    const args: Record<string, unknown> = {
      acceleration: acceleration
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/nemotron/asr", args);
    return res as Record<string, unknown>;
  }
}

export class SileroVad extends FalNode {
  static readonly nodeType = "fal.audio_to_text.SileroVad";
  static readonly title = "Silero Vad";
  static readonly description = `Detect speech presence and timestamps with accuracy and speed using the ultra-lightweight Silero VAD model
speech, recognition, transcription, audio-analysis`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    has_speech: "bool",
    timestamps: "list[SpeechTimestamp]"
  };

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the audio to get speech timestamps from."
  })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/silero-vad", args);
    return res as Record<string, unknown>;
  }
}

export const FAL_AUDIO_TO_TEXT_NODES: readonly NodeClass[] = [
  NemotronAsrStream,
  NemotronAsr,
  SileroVad
] as const;
