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

export class ElevenLabsSpeechToText extends FalNode {
  static readonly nodeType = "fal.speech_to_text.ElevenLabsSpeechToText";
  static readonly title = "Eleven Labs Speech To Text";
  static readonly description = `ElevenLabs Speech to Text transcribes audio to text with high accuracy.
audio, transcription, stt, elevenlabs, speech-to-text`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "text": "str", "language_probability": "float", "language_code": "str", "words": "list[TranscriptionWord]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/elevenlabs/speech-to-text",
    unitPrice: 0.03,
    billingUnit: "minutes",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Language code of the audio" })
  declare language_code: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to transcribe" })
  declare audio: any;

  @prop({ type: "bool", default: true, description: "Whether to annotate who is speaking" })
  declare diarize: any;

  @prop({ type: "bool", default: true, description: "Tag audio events like laughter, applause, etc." })
  declare tag_audio_events: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const languageCode = String(this.language_code ?? "");
    const diarize = Boolean(this.diarize ?? true);
    const tagAudioEvents = Boolean(this.tag_audio_events ?? true);

    const args: Record<string, unknown> = {
      "language_code": languageCode,
      "diarize": diarize,
      "tag_audio_events": tagAudioEvents,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/elevenlabs/speech-to-text", args);
    return {
      "text": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["text"]),
      "language_probability": coerceFalOutputForPropType("float", (res as Record<string, unknown>)["language_probability"]),
      "language_code": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["language_code"]),
      "words": coerceFalOutputForPropType("list[TranscriptionWord]", (res as Record<string, unknown>)["words"]),
    };
  }
}

export class ElevenLabsScribeV2 extends FalNode {
  static readonly nodeType = "fal.speech_to_text.ElevenLabsScribeV2";
  static readonly title = "Eleven Labs Scribe V2";
  static readonly description = `ElevenLabs Scribe V2 provides blazingly fast speech-to-text transcription.
audio, transcription, stt, fast, elevenlabs, speech-to-text`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "text": "str", "language_probability": "float", "language_code": "str", "words": "list[TranscriptionWord]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/elevenlabs/speech-to-text/scribe-v2",
    unitPrice: 0.008,
    billingUnit: "minutes",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Language code of the audio" })
  declare language_code: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to transcribe" })
  declare audio: any;

  @prop({ type: "bool", default: true, description: "Whether to annotate who is speaking" })
  declare diarize: any;

  @prop({ type: "list[str]", default: [], description: "Words or sentences to bias the model towards transcribing. Up to 100 keyterms, max 50 characters each. Adds 30% premium over base transcription price." })
  declare keyterms: any;

  @prop({ type: "bool", default: true, description: "Tag audio events like laughter, applause, etc." })
  declare tag_audio_events: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const languageCode = String(this.language_code ?? "");
    const diarize = Boolean(this.diarize ?? true);
    const keyterms = String(this.keyterms ?? []);
    const tagAudioEvents = Boolean(this.tag_audio_events ?? true);

    const args: Record<string, unknown> = {
      "language_code": languageCode,
      "diarize": diarize,
      "keyterms": keyterms,
      "tag_audio_events": tagAudioEvents,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/elevenlabs/speech-to-text/scribe-v2", args);
    return {
      "text": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["text"]),
      "language_probability": coerceFalOutputForPropType("float", (res as Record<string, unknown>)["language_probability"]),
      "language_code": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["language_code"]),
      "words": coerceFalOutputForPropType("list[TranscriptionWord]", (res as Record<string, unknown>)["words"]),
    };
  }
}

export class SmartTurn extends FalNode {
  static readonly nodeType = "fal.speech_to_text.SmartTurn";
  static readonly title = "Smart Turn";
  static readonly description = `Pipecat's Smart Turn model provides native audio turn detection for conversations.
audio, turn-detection, conversation, pipecat, speech-analysis`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prediction": "int", "probability": "float", "metrics": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/smart-turn",
    unitPrice: 0.00125,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "audio", default: "", description: "The URL of the audio file to be processed." })
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

    const res = await falSubmit(apiKey, "fal-ai/smart-turn", args);
    return {
      "prediction": coerceFalOutputForPropType("int", (res as Record<string, unknown>)["prediction"]),
      "probability": coerceFalOutputForPropType("float", (res as Record<string, unknown>)["probability"]),
      "metrics": coerceFalOutputForPropType("dict[str, any]", (res as Record<string, unknown>)["metrics"]),
    };
  }
}

export class SpeechToText extends FalNode {
  static readonly nodeType = "fal.speech_to_text.SpeechToText";
  static readonly title = "Speech To Text";
  static readonly description = `General-purpose speech-to-text model for accurate audio transcription.
audio, transcription, stt, speech-to-text`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "partial": "bool", "output": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = null;

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
    return {
      "partial": coerceFalOutputForPropType("bool", (res as Record<string, unknown>)["partial"]),
      "output": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["output"]),
    };
  }
}

export class SpeechToText extends FalNode {
  static readonly nodeType = "fal.speech_to_text.SpeechToText";
  static readonly title = "Speech To Text";
  static readonly description = `General-purpose speech-to-text model for accurate audio transcription.
audio, transcription, stt, speech-to-text`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "partial": "bool", "output": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/speech-to-text/stream",
    unitPrice: 0.0008,
    billingUnit: "seconds",
    currency: "USD",
  };

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
    return {
      "partial": coerceFalOutputForPropType("bool", (res as Record<string, unknown>)["partial"]),
      "output": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["output"]),
    };
  }
}

export class SpeechToTextTurbo extends FalNode {
  static readonly nodeType = "fal.speech_to_text.SpeechToTextTurbo";
  static readonly title = "Speech To Text Turbo";
  static readonly description = `High-speed speech-to-text model optimized for fast transcription.
audio, transcription, stt, turbo, fast, speech-to-text`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "partial": "bool", "output": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = null;

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

    const res = await falSubmit(apiKey, "fal-ai/speech-to-text/turbo", args);
    return {
      "partial": coerceFalOutputForPropType("bool", (res as Record<string, unknown>)["partial"]),
      "output": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["output"]),
    };
  }
}

export class SpeechToTextTurbo extends FalNode {
  static readonly nodeType = "fal.speech_to_text.SpeechToTextTurbo";
  static readonly title = "Speech To Text Turbo";
  static readonly description = `High-speed speech-to-text model optimized for fast transcription.
audio, transcription, stt, turbo, fast, speech-to-text`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "partial": "bool", "output": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/speech-to-text/turbo/stream",
    unitPrice: 0.0008,
    billingUnit: "seconds",
    currency: "USD",
  };

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

    const res = await falSubmit(apiKey, "fal-ai/speech-to-text/turbo", args);
    return {
      "partial": coerceFalOutputForPropType("bool", (res as Record<string, unknown>)["partial"]),
      "output": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["output"]),
    };
  }
}

export class Whisper extends FalNode {
  static readonly nodeType = "fal.speech_to_text.Whisper";
  static readonly title = "Whisper";
  static readonly description = `OpenAI's Whisper model for robust multilingual speech recognition.
audio, transcription, stt, whisper, multilingual, speech-to-text`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "text": "str", "inferred_languages": "list[str]", "chunks": "str", "diarization_segments": "list[DiarizationSegment]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/whisper",
    unitPrice: 0.000278,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "\n        Language of the audio file. If set to null, the language will be\n        automatically detected. Defaults to null.\n\n        If translate is selected as the task, the audio will be translated to\n        English, regardless of the language selected.\n        " })
  declare language: any;

  @prop({ type: "int", default: 64 })
  declare batch_size: any;

  @prop({ type: "str", default: "", description: "Prompt to use for generation. Defaults to an empty string." })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "\n            Number of speakers in the audio file. Defaults to null.\n            If not provided, the number of speakers will be automatically\n            detected.\n        " })
  declare num_speakers: any;

  @prop({ type: "enum", default: "transcribe", values: ["transcribe", "translate"], description: "Task to perform on the audio file. Either transcribe or translate." })
  declare task: any;

  @prop({ type: "enum", default: "segment", values: ["none", "segment", "word"], description: "Level of the chunks to return. Either none, segment or word. 'none' would imply that all of the audio will be transcribed without the timestamp tokens, we suggest to switch to 'none' if you are not satisfied with the transcription quality, since it will usually improve the quality of the results. Switching to 'none' will also provide minor speed ups in the transcription due to less amount of generated tokens. Notice that setting to none will produce **a single chunk with the whole transcription**." })
  declare chunk_level: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to transcribe. Supported formats: mp3, mp4, mpeg, mpga, m4a, wav or webm." })
  declare audio: any;

  @prop({ type: "bool", default: false, description: "Whether to diarize the audio file. Defaults to false. Setting to true will add costs proportional to diarization inference time." })
  declare diarize: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const language = String(this.language ?? "");
    const batchSize = Number(this.batch_size ?? 64);
    const prompt = String(this.prompt ?? "");
    const numSpeakers = String(this.num_speakers ?? "");
    const task = String(this.task ?? "transcribe");
    const chunkLevel = String(this.chunk_level ?? "segment");
    const diarize = Boolean(this.diarize ?? false);

    const args: Record<string, unknown> = {
      "language": language,
      "batch_size": batchSize,
      "prompt": prompt,
      "num_speakers": numSpeakers,
      "task": task,
      "chunk_level": chunkLevel,
      "diarize": diarize,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/whisper", args);
    return {
      "text": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["text"]),
      "inferred_languages": coerceFalOutputForPropType("list[str]", (res as Record<string, unknown>)["inferred_languages"]),
      "chunks": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["chunks"]),
      "diarization_segments": coerceFalOutputForPropType("list[DiarizationSegment]", (res as Record<string, unknown>)["diarization_segments"]),
    };
  }
}

export const FAL_SPEECH_TO_TEXT_NODES: readonly NodeClass[] = [
  ElevenLabsSpeechToText,
  ElevenLabsScribeV2,
  SmartTurn,
  SpeechToText,
  SpeechToText,
  SpeechToTextTurbo,
  SpeechToTextTurbo,
  Whisper,
] as const;