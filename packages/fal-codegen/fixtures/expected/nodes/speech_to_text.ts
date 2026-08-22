import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  getFalApiKey,
  falSubmit,
  removeNulls,
  isRefSet,
  assetToFalUrl,
  imageToDataUrl,
} from "../fal-base.js";

// Re-export alias
const FalNode = BaseNode;

export class SpeechToText extends FalNode {
  static readonly nodeType = "fal.speech_to_text.SpeechToText";
  static readonly title = "Speech To Text";
  static readonly description = `General-purpose speech-to-text model for accurate audio transcription.
audio, transcription, stt, speech-to-text`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "output": "str", "partial": "bool" };

  @prop({ type: "audio", default: "", description: "Local filesystem path (or remote URL) to a long audio file" })
  declare audio: any;

  @prop({ type: "bool", default: true, description: "Whether to use Canary's built-in punctuation & capitalization" })
  declare use_pnc: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const usePnc = Boolean(this.use_pnc ?? true);

    const args: Record<string, unknown> = {
      "use_pnc": usePnc,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/speech-to-text", args);
    return res as Record<string, unknown>;
  }
}

export const FAL_SPEECH_TO_TEXT_NODES: readonly NodeClass[] = [
  SpeechToText,
] as const;
