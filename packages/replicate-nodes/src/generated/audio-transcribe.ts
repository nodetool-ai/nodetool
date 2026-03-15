import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getReplicateApiKey,
  replicateSubmit,
  extractVersion,
  removeNulls,
  isRefSet,
  assetToUrl,
  outputToImageRef,
  outputToVideoRef,
  outputToAudioRef,
  outputToString,
} from "../replicate-base.js";

const ReplicateNode = BaseNode;

export class GPT4o_Transcribe extends ReplicateNode {
  static readonly nodeType = "replicate.audio_transcribe.GPT4o_Transcribe";
  static readonly title = "G P T4o_ Transcribe";
  static readonly description = `A speech-to-text model that uses GPT-4o to transcribe audio
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "An optional text to guide the model's style or continue a previous audio segment. The prompt should match the audio language." })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "The language of the input audio. Supplying the input language in ISO-639-1 (e.g. en) format will improve accuracy and latency." })
  declare language: any;

  @prop({ type: "str", default: "", description: "The audio file to transcribe. Supported formats: mp3, mp4, mpeg, mpga, m4a, ogg, wav, or webm" })
  declare audio_file: any;

  @prop({ type: "float", default: 0, description: "Sampling temperature between 0 and 1" })
  declare temperature: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const language = String(inputs.language ?? this.language ?? "");
    const audioFile = String(inputs.audio_file ?? this.audio_file ?? "");
    const temperature = Number(inputs.temperature ?? this.temperature ?? 0);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "language": language,
      "audio_file": audioFile,
      "temperature": temperature,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, extractVersion("openai/gpt-4o-transcribe").version, args);
    return { output: outputToString(res.output) };
  }
}

export class IncrediblyFastWhisper extends ReplicateNode {
  static readonly nodeType = "replicate.audio_transcribe.IncrediblyFastWhisper";
  static readonly title = "Incredibly Fast Whisper";
  static readonly description = `whisper-large-v3, incredibly fast, powered by Hugging Face Transformers! 🤗
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "enum", default: "transcribe", values: ["transcribe", "translate"], description: "Task to perform: transcribe or translate to another language." })
  declare task: any;

  @prop({ type: "audio", default: "", description: "Audio file" })
  declare audio: any;

  @prop({ type: "str", default: "", description: "Provide a hf.co/settings/token for Pyannote.audio to diarise the audio clips. You need to agree to the terms in 'https://huggingface.co/pyannote/speaker-diarization-3.1' and 'https://huggingface.co/pyannote/segmentation-3.0' first." })
  declare hf_token: any;

  @prop({ type: "enum", default: "None", values: ["None", "afrikaans", "albanian", "amharic", "arabic", "armenian", "assamese", "azerbaijani", "bashkir", "basque", "belarusian", "bengali", "bosnian", "breton", "bulgarian", "cantonese", "catalan", "chinese", "croatian", "czech", "danish", "dutch", "english", "estonian", "faroese", "finnish", "french", "galician", "georgian", "german", "greek", "gujarati", "haitian creole", "hausa", "hawaiian", "hebrew", "hindi", "hungarian", "icelandic", "indonesian", "italian", "japanese", "javanese", "kannada", "kazakh", "khmer", "korean", "lao", "latin", "latvian", "lingala", "lithuanian", "luxembourgish", "macedonian", "malagasy", "malay", "malayalam", "maltese", "maori", "marathi", "mongolian", "myanmar", "nepali", "norwegian", "nynorsk", "occitan", "pashto", "persian", "polish", "portuguese", "punjabi", "romanian", "russian", "sanskrit", "serbian", "shona", "sindhi", "sinhala", "slovak", "slovenian", "somali", "spanish", "sundanese", "swahili", "swedish", "tagalog", "tajik", "tamil", "tatar", "telugu", "thai", "tibetan", "turkish", "turkmen", "ukrainian", "urdu", "uzbek", "vietnamese", "welsh", "yiddish", "yoruba"], description: "Language spoken in the audio, specify 'None' to perform language detection." })
  declare language: any;

  @prop({ type: "enum", default: "chunk", values: ["chunk", "word"], description: "Whisper supports both chunked as well as word level timestamps." })
  declare timestamp: any;

  @prop({ type: "int", default: 24, description: "Number of parallel batches you want to compute. Reduce if you face OOMs." })
  declare batch_size: any;

  @prop({ type: "bool", default: false, description: "Use Pyannote.audio to diarise the audio clips. You will need to provide hf_token below too." })
  declare diarise_audio: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const task = String(inputs.task ?? this.task ?? "transcribe");
    const hfToken = String(inputs.hf_token ?? this.hf_token ?? "");
    const language = String(inputs.language ?? this.language ?? "None");
    const timestamp = String(inputs.timestamp ?? this.timestamp ?? "chunk");
    const batchSize = Number(inputs.batch_size ?? this.batch_size ?? 24);
    const diariseAudio = Boolean(inputs.diarise_audio ?? this.diarise_audio ?? false);

    const args: Record<string, unknown> = {
      "task": task,
      "hf_token": hfToken,
      "language": language,
      "timestamp": timestamp,
      "batch_size": batchSize,
      "diarise_audio": diariseAudio,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = assetToUrl(audioRef!);
      if (audioUrl) args["audio"] = audioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, extractVersion("vaibhavs10/incredibly-fast-whisper").version, args);
    return { output: outputToString(res.output) };
  }
}

export const REPLICATE_AUDIO_TRANSCRIBE_NODES: readonly NodeClass[] = [
  GPT4o_Transcribe,
  IncrediblyFastWhisper,
] as const;