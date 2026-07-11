import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import { getElevenLabsApiKey, VOICE_ID_MAP } from "../elevenlabs-base.js";

export class TextToSpeechNode extends BaseNode {
  static readonly nodeType = "elevenlabs.TextToSpeech";
  static readonly body = "content_card";
  static readonly title = "Text to Speech";
  static readonly description =
    "Generate natural-sounding speech using ElevenLabs text-to-speech.\n" +
    "audio, tts, speech, synthesis, voice, elevenlabs\n\n" +
    "Use cases:\n" +
    "- Create professional voiceovers\n" +
    "- Generate character voices\n" +
    "- Produce multilingual content\n" +
    "- Create audiobooks";
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly inlineFields: string[] = ["text"];
  static readonly inputFields: string[] = ["voice_id"];
  static readonly requiredSettings = ["ELEVENLABS_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: VOICE_ID_MAP.Aria,
    title: "Voice ID",
    description:
      "ElevenLabs voice ID to use for generation. Connect a Standard Voice node or provide a custom voice ID."
  })
  declare voice_id: any;

  @prop({
    type: "str",
    default: "Hello, how are you?",
    title: "Text",
    description: "The text to convert to speech."
  })
  declare text: any;

  @prop({
    type: "enum",
    default: "eleven_monolingual_v1",
    title: "Model",
    description: "The TTS model to use.",
    values: [
      "eleven_v3",
      "eleven_multilingual_v2",
      "eleven_turbo_v2_5",
      "eleven_flash_v2_5",
      "eleven_turbo_v2",
      "eleven_flash_v2",
      "eleven_multilingual_sts_v2",
      "eleven_english_sts_v2",
      "eleven_monolingual_v1",
      "eleven_multilingual_v1"
    ]
  })
  declare model_id: any;

  @prop({
    type: "enum",
    default: "none",
    title: "Language",
    description: "Language code to enforce (works with Turbo v2.5+).",
    values: [
      "none",
      "en",
      "ja",
      "zh",
      "de",
      "hi",
      "fr",
      "ko",
      "pt",
      "it",
      "es",
      "ru",
      "id",
      "nl",
      "tr",
      "fil",
      "pl",
      "sv",
      "bg",
      "ro",
      "ar",
      "cs",
      "el",
      "fi",
      "hr",
      "ms",
      "sk",
      "da",
      "ta",
      "uk",
      "vi",
      "no",
      "hu"
    ]
  })
  declare language_code: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Stability",
    description: "Voice stability (0-1). Higher = more consistent.",
    min: 0.0,
    max: 1.0
  })
  declare stability: any;

  @prop({
    type: "float",
    default: 0.75,
    title: "Similarity Boost",
    description: "Similarity to original voice (0-1).",
    min: 0.0,
    max: 1.0
  })
  declare similarity_boost: any;

  @prop({
    type: "float",
    default: 0.0,
    title: "Style",
    description: "Speaking style emphasis (0-1).",
    min: 0.0,
    max: 1.0
  })
  declare style: any;

  @prop({
    type: "bool",
    default: false,
    title: "Speaker Boost",
    description: "Use speaker boost for clearer output."
  })
  declare use_speaker_boost: any;

  @prop({
    type: "int",
    default: -1,
    title: "Seed",
    description: "Seed for deterministic generation (-1 = random).",
    min: -1,
    max: 4294967295
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 2,
    title: "Optimize Streaming Latency",
    description:
      "Latency optimization level (0-4). Higher values trade quality for speed.",
    min: 0,
    max: 4
  })
  declare optimize_streaming_latency: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Text Normalization",
    description: "Controls text normalization behavior.",
    values: ["auto", "on", "off"]
  })
  declare text_normalization: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getElevenLabsApiKey(this._secrets);

    const voiceId = String(this.voice_id ?? VOICE_ID_MAP.Aria);
    if (!voiceId) throw new Error("voice_id is required");

    const text = String(this.text ?? "");
    if (!text) throw new Error("Text is required");

    const modelId = String(this.model_id ?? "eleven_monolingual_v1");
    const languageCode = String(this.language_code ?? "none");
    const stability = Number(this.stability ?? 0.5);
    const similarityBoost = Number(this.similarity_boost ?? 0.75);
    const styleVal = Number(this.style ?? 0.0);
    const useSpeakerBoost = Boolean(this.use_speaker_boost ?? false);
    const seed = Number(this.seed ?? -1);
    const optimizeStreamingLatency = Number(
      this.optimize_streaming_latency ?? 2
    );
    const textNormalization = String(this.text_normalization ?? "auto");

    const payload: Record<string, unknown> = {
      text,
      model_id: modelId,
      optimize_streaming_latency: optimizeStreamingLatency
    };

    if (languageCode !== "none") {
      payload.language_code = languageCode;
    }
    if (seed !== -1) {
      payload.seed = seed;
    }
    if (textNormalization) {
      payload.text_normalization = textNormalization;
    }

    // Only send voice_settings when values differ from defaults
    const voiceSettings: Record<string, unknown> = {};
    if (stability !== 0.5) {
      voiceSettings.stability = stability;
    }
    if (similarityBoost !== 0.75) {
      voiceSettings.similarity_boost = similarityBoost;
    }
    if (styleVal !== 0.0) {
      voiceSettings.style = styleVal;
    }
    if (useSpeakerBoost) {
      voiceSettings.use_speaker_boost = useSpeakerBoost;
    }
    if (Object.keys(voiceSettings).length > 0) {
      payload.voice_settings = voiceSettings;
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${errorText}`);
    }

    const audioData = await response.arrayBuffer();
    const base64 = Buffer.from(audioData).toString("base64");

    return {
      output: {
        type: "audio",
        data: `data:audio/mpeg;base64,${base64}`
      }
    };
  }
}

export const TEXT_TO_SPEECH_NODES: readonly NodeClass[] = [TextToSpeechNode];
