import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getFalApiKey,
  falSubmit,
  removeNulls,
  isRefSet,
  assetToFalUrl,
} from "../fal-base.js";

// Re-export alias
const FalNode = BaseNode;

export class ElevenLabsSpeechToText extends FalNode {
  static readonly nodeType = "fal.speech_to_text.ElevenLabsSpeechToText";
  static readonly title = "Eleven Labs Speech To Text";
  static readonly description = `ElevenLabs Speech to Text transcribes audio to text with high accuracy.
audio, transcription, stt, elevenlabs, speech-to-text`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "str", default: "", description: "Language code of the audio" })
  declare language_code: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to transcribe" })
  declare audio: any;

  @prop({ type: "bool", default: true, description: "Whether to annotate who is speaking" })
  declare diarize: any;

  @prop({ type: "bool", default: true, description: "Tag audio events like laughter, applause, etc." })
  declare tag_audio_events: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const languageCode = String(inputs.language_code ?? this.language_code ?? "");
    const diarize = Boolean(inputs.diarize ?? this.diarize ?? true);
    const tagAudioEvents = Boolean(inputs.tag_audio_events ?? this.tag_audio_events ?? true);

    const args: Record<string, unknown> = {
      "language_code": languageCode,
      "diarize": diarize,
      "tag_audio_events": tagAudioEvents,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/elevenlabs/speech-to-text", args);
    return { output: res };
  }
}

export class ElevenLabsScribeV2 extends FalNode {
  static readonly nodeType = "fal.speech_to_text.ElevenLabsScribeV2";
  static readonly title = "Eleven Labs Scribe V2";
  static readonly description = `ElevenLabs Scribe V2 provides blazingly fast speech-to-text transcription.
audio, transcription, stt, fast, elevenlabs, speech-to-text`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "list[str]", default: [], description: "Words or sentences to bias the model towards transcribing. Up to 100 keyterms, max 50 characters each. Adds 30% premium over base transcription price." })
  declare keyterms: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to transcribe" })
  declare audio: any;

  @prop({ type: "bool", default: true, description: "Whether to annotate who is speaking" })
  declare diarize: any;

  @prop({ type: "str", default: "", description: "Language code of the audio" })
  declare language_code: any;

  @prop({ type: "bool", default: true, description: "Tag audio events like laughter, applause, etc." })
  declare tag_audio_events: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const keyterms = String(inputs.keyterms ?? this.keyterms ?? []);
    const diarize = Boolean(inputs.diarize ?? this.diarize ?? true);
    const languageCode = String(inputs.language_code ?? this.language_code ?? "");
    const tagAudioEvents = Boolean(inputs.tag_audio_events ?? this.tag_audio_events ?? true);

    const args: Record<string, unknown> = {
      "keyterms": keyterms,
      "diarize": diarize,
      "language_code": languageCode,
      "tag_audio_events": tagAudioEvents,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/elevenlabs/speech-to-text/scribe-v2", args);
    return { output: res };
  }
}

export class SmartTurn extends FalNode {
  static readonly nodeType = "fal.speech_to_text.SmartTurn";
  static readonly title = "Smart Turn";
  static readonly description = `Pipecat's Smart Turn model provides native audio turn detection for conversations.
audio, turn-detection, conversation, pipecat, speech-analysis`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "audio", default: "", description: "The URL of the audio file to be processed." })
  declare audio: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const args: Record<string, unknown> = {
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/smart-turn", args);
    return { output: res };
  }
}

export class SpeechToText extends FalNode {
  static readonly nodeType = "fal.speech_to_text.SpeechToText";
  static readonly title = "Speech To Text";
  static readonly description = `General-purpose speech-to-text model for accurate audio transcription.
audio, transcription, stt, speech-to-text`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "audio", default: "", description: "Local filesystem path (or remote URL) to a long audio file" })
  declare audio: any;

  @prop({ type: "bool", default: true, description: "Whether to use Canary's built-in punctuation & capitalization" })
  declare use_pnc: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const usePnc = Boolean(inputs.use_pnc ?? this.use_pnc ?? true);

    const args: Record<string, unknown> = {
      "use_pnc": usePnc,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/speech-to-text", args);
    return { output: res };
  }
}

export class SpeechToTextStream extends FalNode {
  static readonly nodeType = "fal.speech_to_text.SpeechToTextStream";
  static readonly title = "Speech To Text Stream";
  static readonly description = `Streaming speech-to-text for real-time audio transcription.
audio, transcription, stt, streaming, real-time, speech-to-text`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "audio", default: "", description: "Local filesystem path (or remote URL) to a long audio file" })
  declare audio: any;

  @prop({ type: "bool", default: true, description: "Whether to use Canary's built-in punctuation & capitalization" })
  declare use_pnc: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const usePnc = Boolean(inputs.use_pnc ?? this.use_pnc ?? true);

    const args: Record<string, unknown> = {
      "use_pnc": usePnc,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/speech-to-text/stream", args);
    return { output: res };
  }
}

export class SpeechToTextTurbo extends FalNode {
  static readonly nodeType = "fal.speech_to_text.SpeechToTextTurbo";
  static readonly title = "Speech To Text Turbo";
  static readonly description = `High-speed speech-to-text model optimized for fast transcription.
audio, transcription, stt, turbo, fast, speech-to-text`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "audio", default: "", description: "Local filesystem path (or remote URL) to a long audio file" })
  declare audio: any;

  @prop({ type: "bool", default: true, description: "Whether to use Canary's built-in punctuation & capitalization" })
  declare use_pnc: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const usePnc = Boolean(inputs.use_pnc ?? this.use_pnc ?? true);

    const args: Record<string, unknown> = {
      "use_pnc": usePnc,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/speech-to-text/turbo", args);
    return { output: res };
  }
}

export class SpeechToTextTurboStream extends FalNode {
  static readonly nodeType = "fal.speech_to_text.SpeechToTextTurboStream";
  static readonly title = "Speech To Text Turbo Stream";
  static readonly description = `High-speed streaming speech-to-text for real-time fast transcription.
audio, transcription, stt, turbo, streaming, fast, speech-to-text`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "audio", default: "", description: "Local filesystem path (or remote URL) to a long audio file" })
  declare audio: any;

  @prop({ type: "bool", default: true, description: "Whether to use Canary's built-in punctuation & capitalization" })
  declare use_pnc: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const usePnc = Boolean(inputs.use_pnc ?? this.use_pnc ?? true);

    const args: Record<string, unknown> = {
      "use_pnc": usePnc,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/speech-to-text/turbo/stream", args);
    return { output: res };
  }
}

export class Whisper extends FalNode {
  static readonly nodeType = "fal.speech_to_text.Whisper";
  static readonly title = "Whisper";
  static readonly description = `OpenAI's Whisper model for robust multilingual speech recognition.
audio, transcription, stt, whisper, multilingual, speech-to-text`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "str", default: "", description: "Prompt to use for generation. Defaults to an empty string." })
  declare prompt: any;

  @prop({ type: "int", default: 64 })
  declare batch_size: any;

  @prop({ type: "str", default: "3", description: "Version of the model to use. All of the models are the Whisper large variant." })
  declare version: any;

  @prop({ type: "str", default: "", description: "\n        Language of the audio file. If set to null, the language will be\n        automatically detected. Defaults to null.\n\n        If translate is selected as the task, the audio will be translated to\n        English, regardless of the language selected.\n        " })
  declare language: any;

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

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const batchSize = Number(inputs.batch_size ?? this.batch_size ?? 64);
    const version = String(inputs.version ?? this.version ?? "3");
    const language = String(inputs.language ?? this.language ?? "");
    const numSpeakers = String(inputs.num_speakers ?? this.num_speakers ?? "");
    const task = String(inputs.task ?? this.task ?? "transcribe");
    const chunkLevel = String(inputs.chunk_level ?? this.chunk_level ?? "segment");
    const diarize = Boolean(inputs.diarize ?? this.diarize ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "batch_size": batchSize,
      "version": version,
      "language": language,
      "num_speakers": numSpeakers,
      "task": task,
      "chunk_level": chunkLevel,
      "diarize": diarize,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/whisper", args);
    return { output: res };
  }
}

export class Wizper extends FalNode {
  static readonly nodeType = "fal.speech_to_text.Wizper";
  static readonly title = "Wizper";
  static readonly description = `Wizper provides fast and accurate speech-to-text transcription.
audio, transcription, stt, wizper, fast, speech-to-text`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "str", default: "en", description: "\n        Language of the audio file.\n        If translate is selected as the task, the audio will be translated to\n        English, regardless of the language selected. If 'None' is passed,\n        the language will be automatically detected. This will also increase\n        the inference time.\n        " })
  declare language: any;

  @prop({ type: "str", default: "3", description: "Version of the model to use. All of the models are the Whisper large variant." })
  declare version: any;

  @prop({ type: "int", default: 29, description: "Maximum speech segment duration in seconds before splitting." })
  declare max_segment_len: any;

  @prop({ type: "enum", default: "transcribe", values: ["transcribe", "translate"], description: "Task to perform on the audio file. Either transcribe or translate." })
  declare task: any;

  @prop({ type: "str", default: "segment", description: "Level of the chunks to return." })
  declare chunk_level: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to transcribe. Supported formats: mp3, mp4, mpeg, mpga, m4a, wav or webm." })
  declare audio: any;

  @prop({ type: "bool", default: true, description: "Whether to merge consecutive chunks. When enabled, chunks are merged if their combined duration does not exceed max_segment_len." })
  declare merge_chunks: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const language = String(inputs.language ?? this.language ?? "en");
    const version = String(inputs.version ?? this.version ?? "3");
    const maxSegmentLen = Number(inputs.max_segment_len ?? this.max_segment_len ?? 29);
    const task = String(inputs.task ?? this.task ?? "transcribe");
    const chunkLevel = String(inputs.chunk_level ?? this.chunk_level ?? "segment");
    const mergeChunks = Boolean(inputs.merge_chunks ?? this.merge_chunks ?? true);

    const args: Record<string, unknown> = {
      "language": language,
      "version": version,
      "max_segment_len": maxSegmentLen,
      "task": task,
      "chunk_level": chunkLevel,
      "merge_chunks": mergeChunks,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wizper", args);
    return { output: res };
  }
}

export const FAL_SPEECH_TO_TEXT_NODES: readonly NodeClass[] = [
  ElevenLabsSpeechToText,
  ElevenLabsScribeV2,
  SmartTurn,
  SpeechToText,
  SpeechToTextStream,
  SpeechToTextTurbo,
  SpeechToTextTurboStream,
  Whisper,
  Wizper,
] as const;