import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getFalApiKey,
  falSubmit,
  removeNulls,
  isRefSet,
  assetToFalUrl,
  imageToDataUrl,
  coerceFalOutputForPropType,
} from "../fal-base.js";
import type { FalUnitPricing } from "../fal-base.js";

// Re-export alias
const FalNode = BaseNode;

export class NemotronAsr extends FalNode {
  static readonly nodeType = "fal.audio_to_text.NemotronAsr";
  static readonly title = "Nemotron Asr";
  static readonly description = `Use the fast speed and pin point accuracy of nemotron to transcribe your texts.
speech, recognition, transcription, audio-analysis`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "partial": "bool", "output": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = null;

  @prop({ type: "enum", default: "none", values: ["none", "low", "medium", "high"], description: "Controls the speed/accuracy trade-off. 'none' = best accuracy (1.12s chunks, ~7.16% WER), 'low' = balanced (0.56s chunks, ~7.22% WER), 'medium' = faster (0.16s chunks, ~7.84% WER), 'high' = fastest (0.08s chunks, ~8.53% WER)." })
  declare acceleration: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file." })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const acceleration = String(this.acceleration ?? "none");

    const args: Record<string, unknown> = {
      "acceleration": acceleration,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/nemotron/asr", args);
    return {
      "partial": coerceFalOutputForPropType("bool", (res as Record<string, unknown>)["partial"]),
      "output": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["output"]),
    };
  }
}

export class NemotronAsrStream extends FalNode {
  static readonly nodeType = "fal.audio_to_text.NemotronAsrStream";
  static readonly title = "Nemotron Asr Stream";
  static readonly description = `Use the fast speed and pin point accuracy of nemotron to transcribe your texts.
speech, recognition, transcription, audio-analysis`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "partial": "bool", "output": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/nemotron/asr/stream",
    unitPrice: 0.0008,
    billingUnit: "input seconds",
    currency: "USD",
  };

  @prop({ type: "enum", default: "none", values: ["none", "low", "medium", "high"], description: "Controls the speed/accuracy trade-off. 'none' = best accuracy (1.12s chunks, ~7.16% WER), 'low' = balanced (0.56s chunks, ~7.22% WER), 'medium' = faster (0.16s chunks, ~7.84% WER), 'high' = fastest (0.08s chunks, ~8.53% WER)." })
  declare acceleration: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file." })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const acceleration = String(this.acceleration ?? "none");

    const args: Record<string, unknown> = {
      "acceleration": acceleration,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/nemotron/asr", args);
    return {
      "partial": coerceFalOutputForPropType("bool", (res as Record<string, unknown>)["partial"]),
      "output": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["output"]),
    };
  }
}

export class SileroVad extends FalNode {
  static readonly nodeType = "fal.audio_to_text.SileroVad";
  static readonly title = "Silero Vad";
  static readonly description = `Detect speech presence and timestamps with accuracy and speed using the ultra-lightweight Silero VAD model
speech, recognition, transcription, audio-analysis`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "has_speech": "bool", "timestamps": "list[SpeechTimestamp]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/silero-vad",
    unitPrice: 0.00001,
    billingUnit: "seconds",
    currency: "USD",
  };

  @prop({ type: "audio", default: "", description: "The URL of the audio to get speech timestamps from." })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/silero-vad", args);
    return {
      "has_speech": coerceFalOutputForPropType("bool", (res as Record<string, unknown>)["has_speech"]),
      "timestamps": coerceFalOutputForPropType("list[SpeechTimestamp]", (res as Record<string, unknown>)["timestamps"]),
    };
  }
}

export const FAL_AUDIO_TO_TEXT_NODES: readonly NodeClass[] = [
  NemotronAsr,
  NemotronAsrStream,
  SileroVad,
] as const;