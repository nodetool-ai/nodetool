import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  audioRefFromBytes,
  assertBaseResp,
  DEFAULT_VOICE,
  getMinimaxApiKey,
  MINIMAX_BASE_URL,
  MINIMAX_EMOTIONS,
  MINIMAX_LANGUAGE_BOOST,
  MINIMAX_TTS_MODELS,
  MINIMAX_VOICES,
  minimaxHeaders,
  resolveAudioPayload
} from "../minimax-base.js";

const TTS_FORMATS = ["mp3", "wav", "flac"];

export class MinimaxTextToSpeechNode extends BaseNode {
  static readonly nodeType = "minimax.TextToSpeech";
  static readonly body = "content_card";
  static readonly title = "MiniMax Text to Speech";
  static readonly description =
    "Generate natural-sounding speech with MiniMax T2A, including emotion and " +
    "fine voice control.\n" +
    "audio, tts, speech, synthesis, voice, emotion, minimax\n\n" +
    "Use cases:\n" +
    "- Create expressive voiceovers with emotion control\n" +
    "- Produce multilingual narration\n" +
    "- Generate character voices\n" +
    "- Build audiobooks and podcasts";
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly inlineFields: string[] = ["text"];
  static readonly inputFields: string[] = ["voice_id"];
  static readonly requiredSettings = ["MINIMAX_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: "Hello, how are you?",
    title: "Text",
    description: "The text to convert to speech (up to 10,000 characters)."
  })
  declare text: any;

  @prop({
    type: "str",
    default: DEFAULT_VOICE,
    title: "Voice ID",
    description:
      "MiniMax voice ID. Connect a MiniMax Voice node, pick from the list, or " +
      "provide a custom/cloned voice ID.",
    values: MINIMAX_VOICES
  })
  declare voice_id: any;

  @prop({
    type: "enum",
    default: "speech-2.6-hd",
    title: "Model",
    description: "The MiniMax speech model to use.",
    values: MINIMAX_TTS_MODELS
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Emotion",
    description:
      "Emotional tone of the speech. 'auto' lets the model decide from the text.",
    values: MINIMAX_EMOTIONS
  })
  declare emotion: any;

  @prop({
    type: "float",
    default: 1.0,
    title: "Speed",
    description: "Speech speed multiplier.",
    min: 0.5,
    max: 2.0
  })
  declare speed: any;

  @prop({
    type: "float",
    default: 1.0,
    title: "Volume",
    description: "Output volume.",
    min: 0.1,
    max: 10.0
  })
  declare volume: any;

  @prop({
    type: "int",
    default: 0,
    title: "Pitch",
    description: "Pitch shift in semitones.",
    min: -12,
    max: 12
  })
  declare pitch: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Language Boost",
    description:
      "Bias pronunciation toward a language. 'auto' autodetects from the text.",
    values: MINIMAX_LANGUAGE_BOOST
  })
  declare language_boost: any;

  @prop({
    type: "enum",
    default: "mp3",
    title: "Format",
    description: "Output audio format.",
    values: TTS_FORMATS
  })
  declare format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getMinimaxApiKey(this._secrets);

    const text = String(this.text ?? "");
    if (!text) throw new Error("Text is required");

    const voiceId = String(this.voice_id ?? DEFAULT_VOICE);
    if (!voiceId) throw new Error("voice_id is required");

    const model = String(this.model ?? "speech-2.6-hd");
    const emotion = String(this.emotion ?? "auto");
    const languageBoost = String(this.language_boost ?? "auto");
    const format = String(this.format ?? "mp3");

    const voiceSetting: Record<string, unknown> = {
      voice_id: voiceId,
      speed: Math.max(0.5, Math.min(2.0, Number(this.speed ?? 1.0))),
      vol: Math.max(0.1, Math.min(10.0, Number(this.volume ?? 1.0))),
      pitch: Math.max(-12, Math.min(12, Math.trunc(Number(this.pitch ?? 0))))
    };
    if (emotion && emotion !== "auto") {
      voiceSetting.emotion = emotion;
    }

    const body: Record<string, unknown> = {
      model,
      text,
      stream: false,
      voice_setting: voiceSetting,
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format,
        channel: 1
      }
    };
    if (languageBoost && languageBoost !== "auto") {
      body.language_boost = languageBoost;
    }

    const res = await fetch(`${MINIMAX_BASE_URL}/v1/t2a_v2`, {
      method: "POST",
      headers: minimaxHeaders(apiKey),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      throw new Error(`MiniMax t2a_v2 failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    assertBaseResp(data, "t2a_v2");

    const payload = data.data as Record<string, unknown> | undefined;
    const audio = payload?.audio as string | undefined;
    if (!audio) {
      throw new Error(
        `MiniMax t2a_v2 returned no audio data: ${JSON.stringify(data)}`
      );
    }

    const bytes = await resolveAudioPayload(audio);
    return { output: audioRefFromBytes(bytes, format) };
  }
}

export const TEXT_TO_SPEECH_NODES: readonly NodeClass[] = [
  MinimaxTextToSpeechNode
];
