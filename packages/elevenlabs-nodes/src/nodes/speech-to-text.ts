import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import { getElevenLabsApiKey } from "../elevenlabs-base.js";

export class SpeechToTextNode extends BaseNode {
  static readonly nodeType = "elevenlabs.SpeechToText";
  static readonly title = "Speech to Text";
  static readonly description =
    "Transcribe audio or video files using ElevenLabs speech-to-text API.\n" +
    "audio, transcription, speech-to-text, stt, elevenlabs\n\n" +
    "Use cases:\n" +
    "- Transcribe audio files\n" +
    "- Extract text from video\n" +
    "- Speaker diarization\n" +
    "- Multi-language transcription\n" +
    "- Subtitle generation";
  static readonly metadataOutputTypes = {
    text: "str",
    language_code: "str",
    language_probability: "float",
    words: "list",
    transcription_id: "str"
  };
  static readonly requiredSettings = ["ELEVENLABS_API_KEY"];

  @prop({
    type: "audio",
    default: { type: "audio" },
    title: "Audio",
    description: "The audio or video file to transcribe."
  })
  declare audio: any;

  @prop({
    type: "enum",
    default: "scribe_v2",
    title: "Model",
    description: "The transcription model to use.",
    values: ["scribe_v1", "scribe_v2"]
  })
  declare model_id: any;

  @prop({
    type: "str",
    default: "",
    title: "Language Code",
    description:
      "ISO-639-1 or ISO-639-3 language code (e.g. 'en', 'es'). Leave empty for auto-detection."
  })
  declare language_code: any;

  @prop({
    type: "bool",
    default: true,
    title: "Tag Audio Events",
    description: "Tag audio events like (laughter), (footsteps), etc."
  })
  declare tag_audio_events: any;

  @prop({
    type: "int",
    default: 0,
    title: "Num Speakers",
    description: "Maximum number of speakers (0 = auto-detect, max 32).",
    min: 0,
    max: 32
  })
  declare num_speakers: any;

  @prop({
    type: "enum",
    default: "word",
    title: "Timestamps",
    description: "Granularity of timestamps: none, word, or character.",
    values: ["none", "word", "character"]
  })
  declare timestamps_granularity: any;

  @prop({
    type: "bool",
    default: false,
    title: "Diarize",
    description: "Annotate which speaker is talking."
  })
  declare diarize: any;

  @prop({
    type: "enum",
    default: "other",
    title: "File Format",
    description:
      "Audio format: pcm_s16le_16 for lower latency or other for all formats.",
    values: ["pcm_s16le_16", "other"]
  })
  declare file_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getElevenLabsApiKey(this._secrets);

    const audio = this.audio as Record<string, unknown> | undefined;
    if (!audio?.uri && !audio?.data) {
      throw new Error("Audio input is required");
    }

    const modelId = String(this.model_id ?? this.model_id ?? "scribe_v2");
    const languageCode = String(this.language_code ?? this.language_code ?? "");
    const tagAudioEvents = Boolean(
      this.tag_audio_events ?? this.tag_audio_events ?? true
    );
    const numSpeakers = Number(this.num_speakers ?? this.num_speakers ?? 0);
    const timestampsGranularity = String(
      this.timestamps_granularity ?? this.timestamps_granularity ?? "word"
    );
    const diarize = Boolean(this.diarize ?? this.diarize ?? false);
    const fileFormat = String(this.file_format ?? this.file_format ?? "other");

    // Get audio bytes from data URI or fetch from URI
    let audioBytes: Buffer;
    if (audio.data && typeof audio.data === "string") {
      const match = (audio.data as string).match(/^data:[^;]+;base64,(.+)$/);
      if (match) {
        audioBytes = Buffer.from(match[1], "base64");
      } else {
        throw new Error("Invalid audio data URI");
      }
    } else if (audio.uri && typeof audio.uri === "string") {
      const resp = await fetch(audio.uri as string);
      if (!resp.ok)
        throw new Error(`Failed to fetch audio: ${resp.statusText}`);
      audioBytes = Buffer.from(await resp.arrayBuffer());
    } else {
      throw new Error("Audio must have a data URI or uri field");
    }

    // Build multipart form data matching the Python implementation
    const formData = new FormData();
    formData.append("model_id", modelId);
    formData.append(
      "file",
      new Blob([new Uint8Array(audioBytes)], { type: "audio/wav" }),
      "audio.wav"
    );

    if (languageCode) {
      formData.append("language_code", languageCode);
    }

    formData.append("tag_audio_events", String(tagAudioEvents).toLowerCase());

    if (numSpeakers > 0) {
      formData.append("num_speakers", String(numSpeakers));
    }

    formData.append("timestamps_granularity", timestampsGranularity);
    formData.append("diarize", String(diarize).toLowerCase());
    formData.append("file_format", fileFormat);

    const response = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: formData
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${errorText}`);
    }

    const result = (await response.json()) as Record<string, unknown>;

    return {
      text: String(result.text ?? ""),
      language_code: String(result.language_code ?? ""),
      language_probability: Number(result.language_probability ?? 0),
      words: (result.words as unknown[]) ?? [],
      transcription_id: result.transcription_id ?? null
    };
  }
}

export const SPEECH_TO_TEXT_NODES: readonly NodeClass[] = [SpeechToTextNode];
