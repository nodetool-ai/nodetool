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

export class ResembleAiChatterboxhdSpeechToSpeech extends FalNode {
  static readonly nodeType =
    "fal.speech_to_speech.ResembleAiChatterboxhdSpeechToSpeech";
  static readonly title = "Resemble Ai Chatterboxhd Speech To Speech";
  static readonly description = `Transform voices using Resemble AI's Chatterbox. Convert audio to new voices or your own samples, with expressive results and built-in perceptual watermarking.
speech, voice, transformation, cloning`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "bool",
    default: false,
    description:
      "If True, the generated audio will be upscaled to 48kHz. The generation of the audio will take longer, but the quality will be higher. If False, the generated audio will be 24kHz. "
  })
  declare high_quality_audio: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "URL to the audio file which represents the voice of the output audio. If provided, this will override the target_voice setting. If neither target_voice nor target_voice_audio_url are provided, the default target voice will be used."
  })
  declare target_voice_audio: any;

  @prop({
    type: "audio",
    default: "",
    description: "URL to the source audio file to be voice-converted."
  })
  declare source_audio: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "Aurora",
      "Blade",
      "Britney",
      "Carl",
      "Cliff",
      "Richard",
      "Rico",
      "Siobhan",
      "Vicky"
    ],
    description:
      "The voice to use for the speech-to-speech request. If neither target_voice nor target_voice_audio_url are provided, a random target voice will be used."
  })
  declare target_voice: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const highQualityAudio = Boolean(this.high_quality_audio ?? false);
    const targetVoice = String(this.target_voice ?? "");

    const args: Record<string, unknown> = {
      high_quality_audio: highQualityAudio,
      target_voice: targetVoice
    };

    const targetVoiceAudioRef = this.target_voice_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(targetVoiceAudioRef)) {
      const targetVoiceAudioUrl = await assetToFalUrl(
        apiKey,
        targetVoiceAudioRef!
      );
      if (targetVoiceAudioUrl)
        args["target_voice_audio_url"] = targetVoiceAudioUrl;
    }

    const sourceAudioRef = this.source_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(sourceAudioRef)) {
      const sourceAudioUrl = await assetToFalUrl(apiKey, sourceAudioRef!);
      if (sourceAudioUrl) args["source_audio_url"] = sourceAudioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "resemble-ai/chatterboxhd/speech-to-speech",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class ChatterboxSpeechToSpeech extends FalNode {
  static readonly nodeType = "fal.speech_to_speech.ChatterboxSpeechToSpeech";
  static readonly title = "Chatterbox Speech To Speech";
  static readonly description = `Whether you're working on memes, videos, games, or AI agents, Chatterbox brings your content to life. Use the first tts from resemble ai.
speech, voice, transformation, cloning`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({ type: "audio", default: "" })
  declare source_audio: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "Optional URL to an audio file to use as a reference for the generated speech. If provided, the model will try to match the style and tone of the reference audio."
  })
  declare target_voice_audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const sourceAudioRef = this.source_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(sourceAudioRef)) {
      const sourceAudioUrl = await assetToFalUrl(apiKey, sourceAudioRef!);
      if (sourceAudioUrl) args["source_audio_url"] = sourceAudioUrl;
    }

    const targetVoiceAudioRef = this.target_voice_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(targetVoiceAudioRef)) {
      const targetVoiceAudioUrl = await assetToFalUrl(
        apiKey,
        targetVoiceAudioRef!
      );
      if (targetVoiceAudioUrl)
        args["target_voice_audio_url"] = targetVoiceAudioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/chatterbox/speech-to-speech",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export const FAL_SPEECH_TO_SPEECH_NODES: readonly NodeClass[] = [
  ResembleAiChatterboxhdSpeechToSpeech,
  ChatterboxSpeechToSpeech
] as const;
