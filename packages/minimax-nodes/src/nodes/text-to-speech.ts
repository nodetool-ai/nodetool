import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  audioRefFromBytes,
  callMinimax,
  DEFAULT_VOICE,
  MINIMAX_EMOTIONS,
  MINIMAX_LANGUAGE_BOOST,
  MINIMAX_TTS_MODELS,
  MINIMAX_VOICES,
  resolveAudioPayload
} from "../minimax-base.js";

const TTS_FORMATS = ["mp3", "wav", "flac"];

/**
 * `/v1/t2a_v2` request. `emotion` and `language_boost` are omitted entirely
 * when the node's "auto" sentinel is selected.
 */
interface MinimaxVoiceSetting {
  voice_id: string;
  speed: number;
  vol: number;
  pitch: number;
  emotion?: string;
}

interface MinimaxTtsRequest {
  model: string;
  text: string;
  stream: boolean;
  voice_setting: MinimaxVoiceSetting;
  audio_setting: {
    sample_rate: number;
    bitrate: number;
    format: string;
    channel: number;
  };
  language_boost?: string;
}

/** Output handles MinimaxTextToSpeechNode.process() emits. */
type MinimaxTextToSpeechNodeOutputs = {
  output: { type: string; data: string; content_type: string };
};

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
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["text", "voice_id"];
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

  async process(
    context?: ProcessingContext
  ): Promise<MinimaxTextToSpeechNodeOutputs> {
    const text = String(this.text ?? "");
    if (!text) throw new Error("Text is required");

    const voiceId = String(this.voice_id ?? DEFAULT_VOICE);
    if (!voiceId) throw new Error("voice_id is required");

    const model = String(this.model ?? "speech-2.6-hd");
    const emotion = String(this.emotion ?? "auto");
    const languageBoost = String(this.language_boost ?? "auto");
    const format = String(this.format ?? "mp3");

    const voiceSetting: MinimaxVoiceSetting = {
      voice_id: voiceId,
      speed: Math.max(0.5, Math.min(2.0, Number(this.speed ?? 1.0))),
      vol: Math.max(0.1, Math.min(10.0, Number(this.volume ?? 1.0))),
      pitch: Math.max(-12, Math.min(12, Math.trunc(Number(this.pitch ?? 0))))
    };
    if (emotion && emotion !== "auto") {
      voiceSetting.emotion = emotion;
    }

    const body: MinimaxTtsRequest = {
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

    if (!context) {
      throw new Error("MiniMax Text to Speech requires a processing context");
    }
    // `/v1/t2a_v2` replies with hex-encoded audio, or a download URL.
    const reply = await callMinimax(context, {
      route: "tts",
      capability: "text_to_speech",
      model,
      input: { ...body },
      nodeId: this.__node_id || undefined
    });
    if (!reply.audio) {
      throw new Error(
        `MiniMax t2a_v2 returned no audio data: ${reply.describe()}`
      );
    }

    const bytes = await resolveAudioPayload(context, reply.audio);
    return { output: audioRefFromBytes(bytes, format) };
  }
}

export const TEXT_TO_SPEECH_NODES: readonly NodeClass[] = [
  MinimaxTextToSpeechNode
];
