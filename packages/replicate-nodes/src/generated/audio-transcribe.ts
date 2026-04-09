import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getReplicateApiKey,
  replicateSubmit,
  removeNulls,
  isRefSet,
  assetToUrl,
  outputToImageRef,
  outputToVideoRef,
  outputToAudioRef,
  outputToString
} from "../replicate-base.js";

const ReplicateNode = BaseNode;

export class IncrediblyFastWhisper extends ReplicateNode {
  static readonly nodeType = "replicate.audio.transcribe.IncrediblyFastWhisper";
  static readonly title = "Incredibly Fast Whisper";
  static readonly description = `whisper-large-v3, incredibly fast, powered by Hugging Face Transformers! 🤗
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "audio", default: "", description: "Audio file" })
  declare audio: any;

  @prop({
    type: "int",
    default: 24,
    description:
      "Number of parallel batches you want to compute. Reduce if you face OOMs."
  })
  declare batch_size: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Use Pyannote.audio to diarise the audio clips. You will need to provide hf_token below too."
  })
  declare diarise_audio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Provide a hf.co/settings/token for Pyannote.audio to diarise the audio clips. You need to agree to the terms in 'https://huggingface.co/pyannote/speaker-diarization-3.1' and 'https://huggingface.co/pyannote/segmentation-3.0' first."
  })
  declare hf_token: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "afrikaans",
      "albanian",
      "amharic",
      "arabic",
      "armenian",
      "assamese",
      "azerbaijani",
      "bashkir",
      "basque",
      "belarusian",
      "bengali",
      "bosnian",
      "breton",
      "bulgarian",
      "cantonese",
      "catalan",
      "chinese",
      "croatian",
      "czech",
      "danish",
      "dutch",
      "english",
      "estonian",
      "faroese",
      "finnish",
      "french",
      "galician",
      "georgian",
      "german",
      "greek",
      "gujarati",
      "haitian creole",
      "hausa",
      "hawaiian",
      "hebrew",
      "hindi",
      "hungarian",
      "icelandic",
      "indonesian",
      "italian",
      "japanese",
      "javanese",
      "kannada",
      "kazakh",
      "khmer",
      "korean",
      "lao",
      "latin",
      "latvian",
      "lingala",
      "lithuanian",
      "luxembourgish",
      "macedonian",
      "malagasy",
      "malay",
      "malayalam",
      "maltese",
      "maori",
      "marathi",
      "mongolian",
      "myanmar",
      "nepali",
      "norwegian",
      "nynorsk",
      "occitan",
      "pashto",
      "persian",
      "polish",
      "portuguese",
      "punjabi",
      "romanian",
      "russian",
      "sanskrit",
      "serbian",
      "shona",
      "sindhi",
      "sinhala",
      "slovak",
      "slovenian",
      "somali",
      "spanish",
      "sundanese",
      "swahili",
      "swedish",
      "tagalog",
      "tajik",
      "tamil",
      "tatar",
      "telugu",
      "thai",
      "tibetan",
      "turkish",
      "turkmen",
      "ukrainian",
      "urdu",
      "uzbek",
      "vietnamese",
      "welsh",
      "yiddish",
      "yoruba"
    ],
    description:
      "Language spoken in the audio, specify 'None' to perform language detection."
  })
  declare language: any;

  @prop({
    type: "enum",
    default: "transcribe",
    values: ["transcribe", "translate"],
    description: "Task to perform: transcribe or translate to another language."
  })
  declare task: any;

  @prop({
    type: "enum",
    default: "chunk",
    values: ["chunk", "word"],
    description:
      "Whisper supports both chunked as well as word level timestamps."
  })
  declare timestamp: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const batchSize = Number(this.batch_size ?? 24);
    const diariseAudio = Boolean(this.diarise_audio ?? false);
    const hfToken = String(this.hf_token ?? "");
    const language = String(this.language ?? "None");
    const task = String(this.task ?? "transcribe");
    const timestamp = String(this.timestamp ?? "chunk");

    const args: Record<string, unknown> = {
      batch_size: batchSize,
      diarise_audio: diariseAudio,
      hf_token: hfToken,
      language: language,
      task: task,
      timestamp: timestamp
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "vaibhavs10/incredibly-fast-whisper:3ab86df6c8f54c11309d4d1f930ac292bad43ace52d10c80d87eb258b3c9f79c",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class GPT4o_Transcribe extends ReplicateNode {
  static readonly nodeType = "replicate.audio.transcribe.GPT4o_Transcribe";
  static readonly title = "G P T4o_ Transcribe";
  static readonly description = `A speech-to-text model that uses GPT-4o to transcribe audio
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "audio",
    default: "",
    description:
      "The audio file to transcribe. Supported formats: mp3, mp4, mpeg, mpga, m4a, ogg, wav, or webm"
  })
  declare audio_file: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The language of the input audio. Supplying the input language in ISO-639-1 (e.g. en) format will improve accuracy and latency."
  })
  declare language: any;

  @prop({
    type: "str",
    default: "",
    description:
      "An optional text to guide the model's style or continue a previous audio segment. The prompt should match the audio language."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0,
    description: "Sampling temperature between 0 and 1"
  })
  declare temperature: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const language = String(this.language ?? "");
    const prompt = String(this.prompt ?? "");
    const temperature = Number(this.temperature ?? 0);

    const args: Record<string, unknown> = {
      language: language,
      prompt: prompt,
      temperature: temperature
    };

    const audioFileRef = this.audio_file as Record<string, unknown> | undefined;
    if (isRefSet(audioFileRef)) {
      const audioFileUrl = await assetToUrl(audioFileRef!, apiKey);
      if (audioFileUrl) args["audio_file"] = audioFileUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/gpt-4o-transcribe:cc7638666fc85e9defb010d99e304c0c0e94dcdbd3d31385f28f2730b4cdcc6d",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Whisper extends ReplicateNode {
  static readonly nodeType = "replicate.audio.transcribe.Whisper";
  static readonly title = "Whisper";
  static readonly description = `Convert speech in audio to text
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "audio", default: "", description: "Audio file" })
  declare audio: any;

  @prop({
    type: "float",
    default: 2.4,
    description:
      "if the gzip compression ratio is higher than this value, treat the decoding as failed"
  })
  declare compression_ratio_threshold: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "if True, provide the previous output of the model as a prompt for the next window; disabling may make the text inconsistent across windows, but the model becomes less prone to getting stuck in a failure loop"
  })
  declare condition_on_previous_text: any;

  @prop({
    type: "str",
    default: "",
    description: "optional text to provide as a prompt for the first window."
  })
  declare initial_prompt: any;

  @prop({
    type: "enum",
    default: "auto",
    values: [
      "auto",
      "af",
      "am",
      "ar",
      "as",
      "az",
      "ba",
      "be",
      "bg",
      "bn",
      "bo",
      "br",
      "bs",
      "ca",
      "cs",
      "cy",
      "da",
      "de",
      "el",
      "en",
      "es",
      "et",
      "eu",
      "fa",
      "fi",
      "fo",
      "fr",
      "gl",
      "gu",
      "ha",
      "haw",
      "he",
      "hi",
      "hr",
      "ht",
      "hu",
      "hy",
      "id",
      "is",
      "it",
      "ja",
      "jw",
      "ka",
      "kk",
      "km",
      "kn",
      "ko",
      "la",
      "lb",
      "ln",
      "lo",
      "lt",
      "lv",
      "mg",
      "mi",
      "mk",
      "ml",
      "mn",
      "mr",
      "ms",
      "mt",
      "my",
      "ne",
      "nl",
      "nn",
      "no",
      "oc",
      "pa",
      "pl",
      "ps",
      "pt",
      "ro",
      "ru",
      "sa",
      "sd",
      "si",
      "sk",
      "sl",
      "sn",
      "so",
      "sq",
      "sr",
      "su",
      "sv",
      "sw",
      "ta",
      "te",
      "tg",
      "th",
      "tk",
      "tl",
      "tr",
      "tt",
      "uk",
      "ur",
      "uz",
      "vi",
      "yi",
      "yo",
      "yue",
      "zh",
      "Afrikaans",
      "Albanian",
      "Amharic",
      "Arabic",
      "Armenian",
      "Assamese",
      "Azerbaijani",
      "Bashkir",
      "Basque",
      "Belarusian",
      "Bengali",
      "Bosnian",
      "Breton",
      "Bulgarian",
      "Burmese",
      "Cantonese",
      "Castilian",
      "Catalan",
      "Chinese",
      "Croatian",
      "Czech",
      "Danish",
      "Dutch",
      "English",
      "Estonian",
      "Faroese",
      "Finnish",
      "Flemish",
      "French",
      "Galician",
      "Georgian",
      "German",
      "Greek",
      "Gujarati",
      "Haitian",
      "Haitian Creole",
      "Hausa",
      "Hawaiian",
      "Hebrew",
      "Hindi",
      "Hungarian",
      "Icelandic",
      "Indonesian",
      "Italian",
      "Japanese",
      "Javanese",
      "Kannada",
      "Kazakh",
      "Khmer",
      "Korean",
      "Lao",
      "Latin",
      "Latvian",
      "Letzeburgesch",
      "Lingala",
      "Lithuanian",
      "Luxembourgish",
      "Macedonian",
      "Malagasy",
      "Malay",
      "Malayalam",
      "Maltese",
      "Mandarin",
      "Maori",
      "Marathi",
      "Moldavian",
      "Moldovan",
      "Mongolian",
      "Myanmar",
      "Nepali",
      "Norwegian",
      "Nynorsk",
      "Occitan",
      "Panjabi",
      "Pashto",
      "Persian",
      "Polish",
      "Portuguese",
      "Punjabi",
      "Pushto",
      "Romanian",
      "Russian",
      "Sanskrit",
      "Serbian",
      "Shona",
      "Sindhi",
      "Sinhala",
      "Sinhalese",
      "Slovak",
      "Slovenian",
      "Somali",
      "Spanish",
      "Sundanese",
      "Swahili",
      "Swedish",
      "Tagalog",
      "Tajik",
      "Tamil",
      "Tatar",
      "Telugu",
      "Thai",
      "Tibetan",
      "Turkish",
      "Turkmen",
      "Ukrainian",
      "Urdu",
      "Uzbek",
      "Valencian",
      "Vietnamese",
      "Welsh",
      "Yiddish",
      "Yoruba"
    ],
    description:
      "Language spoken in the audio, specify 'auto' for automatic language detection"
  })
  declare language: any;

  @prop({
    type: "float",
    default: -1,
    description:
      "if the average log probability is lower than this value, treat the decoding as failed"
  })
  declare logprob_threshold: any;

  @prop({
    type: "float",
    default: 0.6,
    description:
      "if the probability of the <|nospeech|> token is higher than this value AND the decoding has failed due to 'logprob_threshold', consider the segment as silence"
  })
  declare no_speech_threshold: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "optional patience value to use in beam decoding, as in https://arxiv.org/abs/2204.05424, the default (1.0) is equivalent to conventional beam search"
  })
  declare patience: any;

  @prop({
    type: "str",
    default: "-1",
    description:
      "comma-separated list of token ids to suppress during sampling; '-1' will suppress most special characters except common punctuations"
  })
  declare suppress_tokens: any;

  @prop({
    type: "float",
    default: 0,
    description: "temperature to use for sampling"
  })
  declare temperature: any;

  @prop({
    type: "float",
    default: 0.2,
    description:
      "temperature to increase when falling back when the decoding fails to meet either of the thresholds below"
  })
  declare temperature_increment_on_fallback: any;

  @prop({
    type: "enum",
    default: "plain text",
    values: ["plain text", "srt", "vtt"],
    description: "Choose the format for the transcription"
  })
  declare transcription: any;

  @prop({
    type: "bool",
    default: false,
    description: "Translate the text to English when set to True"
  })
  declare translate: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const compressionRatioThreshold = Number(
      this.compression_ratio_threshold ?? 2.4
    );
    const conditionOnPreviousText = Boolean(
      this.condition_on_previous_text ?? true
    );
    const initialPrompt = String(this.initial_prompt ?? "");
    const language = String(this.language ?? "auto");
    const logprobThreshold = Number(this.logprob_threshold ?? -1);
    const noSpeechThreshold = Number(this.no_speech_threshold ?? 0.6);
    const patience = Number(this.patience ?? 0);
    const suppressTokens = String(this.suppress_tokens ?? "-1");
    const temperature = Number(this.temperature ?? 0);
    const temperatureIncrementOnFallback = Number(
      this.temperature_increment_on_fallback ?? 0.2
    );
    const transcription = String(this.transcription ?? "plain text");
    const translate = Boolean(this.translate ?? false);

    const args: Record<string, unknown> = {
      compression_ratio_threshold: compressionRatioThreshold,
      condition_on_previous_text: conditionOnPreviousText,
      initial_prompt: initialPrompt,
      language: language,
      logprob_threshold: logprobThreshold,
      no_speech_threshold: noSpeechThreshold,
      patience: patience,
      suppress_tokens: suppressTokens,
      temperature: temperature,
      temperature_increment_on_fallback: temperatureIncrementOnFallback,
      transcription: transcription,
      translate: translate
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class GPT4o_Mini_Transcribe extends ReplicateNode {
  static readonly nodeType = "replicate.audio.transcribe.GPT4o_Mini_Transcribe";
  static readonly title = "G P T4o_ Mini_ Transcribe";
  static readonly description = `A speech-to-text model that uses GPT-4o mini to transcribe audio
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "audio",
    default: "",
    description:
      "The audio file to transcribe. Supported formats: mp3, mp4, mpeg, mpga, m4a, ogg, wav, or webm"
  })
  declare audio_file: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The language of the input audio. Supplying the input language in ISO-639-1 (e.g. en) format will improve accuracy and latency."
  })
  declare language: any;

  @prop({
    type: "str",
    default: "",
    description:
      "An optional text to guide the model's style or continue a previous audio segment. The prompt should match the audio language."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0,
    description: "Sampling temperature between 0 and 1"
  })
  declare temperature: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const language = String(this.language ?? "");
    const prompt = String(this.prompt ?? "");
    const temperature = Number(this.temperature ?? 0);

    const args: Record<string, unknown> = {
      language: language,
      prompt: prompt,
      temperature: temperature
    };

    const audioFileRef = this.audio_file as Record<string, unknown> | undefined;
    if (isRefSet(audioFileRef)) {
      const audioFileUrl = await assetToUrl(audioFileRef!, apiKey);
      if (audioFileUrl) args["audio_file"] = audioFileUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/gpt-4o-mini-transcribe:684265b6c4d23a4f5b3536a76e0b9e022ce5084f6da95fd7d0b5ebbc573a8261",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class WhisperX extends ReplicateNode {
  static readonly nodeType = "replicate.audio.transcribe.WhisperX";
  static readonly title = "Whisper X";
  static readonly description = `Accelerated transcription of audio using WhisperX
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "bool",
    default: false,
    description:
      "Use if you need word-level timing and not just batched transcription. Only works for English atm"
  })
  declare align_output: any;

  @prop({ type: "audio", default: "", description: "Audio file" })
  declare audio: any;

  @prop({
    type: "int",
    default: 32,
    description: "Parallelization of input audio transcription"
  })
  declare batch_size: any;

  @prop({
    type: "bool",
    default: false,
    description: "Print out memory usage information."
  })
  declare debug: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Set if you only want to return text; otherwise, segment metadata will be returned as well."
  })
  declare only_text: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const alignOutput = Boolean(this.align_output ?? false);
    const batchSize = Number(this.batch_size ?? 32);
    const debug = Boolean(this.debug ?? false);
    const onlyText = Boolean(this.only_text ?? false);

    const args: Record<string, unknown> = {
      align_output: alignOutput,
      batch_size: batchSize,
      debug: debug,
      only_text: onlyText
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "daanelson/whisperx:9aa6ecadd30610b81119fc1b6807302fd18ca6cbb39b3216f430dcf23618cedd",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Whisper_Diarization extends ReplicateNode {
  static readonly nodeType = "replicate.audio.transcribe.Whisper_Diarization";
  static readonly title = "Whisper_ Diarization";
  static readonly description = `⚡️ Blazing fast audio transcription with speaker diarization | Whisper Large V3 Turbo | word & sentence level timestamps | prompt
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "image", default: "", description: "Or an audio file" })
  declare file: any;

  @prop({
    type: "str",
    default: "",
    description: "Either provide: Base64 encoded audio file,"
  })
  declare file_string: any;

  @prop({
    type: "str",
    default: "",
    description: "Or provide: A direct audio file URL"
  })
  declare file_url: any;

  @prop({
    type: "bool",
    default: true,
    description: "Group segments of same speaker shorter apart than 2 seconds"
  })
  declare group_segments: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Language of the spoken words as a language code like 'en'. Leave empty to auto detect language."
  })
  declare language: any;

  @prop({
    type: "int",
    default: 0,
    description: "Number of speakers, leave empty to autodetect."
  })
  declare num_speakers: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Vocabulary: provide names, acronyms and loanwords in a list. Use punctuation for best accuracy."
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Translate the speech into English."
  })
  declare translate: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const fileString = String(this.file_string ?? "");
    const fileUrl = String(this.file_url ?? "");
    const groupSegments = Boolean(this.group_segments ?? true);
    const language = String(this.language ?? "");
    const numSpeakers = Number(this.num_speakers ?? 0);
    const prompt = String(this.prompt ?? "");
    const translate = Boolean(this.translate ?? false);

    const args: Record<string, unknown> = {
      file_string: fileString,
      file_url: fileUrl,
      group_segments: groupSegments,
      language: language,
      num_speakers: numSpeakers,
      prompt: prompt,
      translate: translate
    };

    const fileRef = this.file as Record<string, unknown> | undefined;
    if (isRefSet(fileRef)) {
      const fileUrl = await assetToUrl(fileRef!, apiKey);
      if (fileUrl) args["file"] = fileUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "thomasmol/whisper-diarization:1495a9cddc83b2203b0d8d3516e38b80fd1572ebc4bc5700ac1da56a9b3ed886",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Parakeet_RNNT extends ReplicateNode {
  static readonly nodeType = "replicate.audio.transcribe.Parakeet_RNNT";
  static readonly title = "Parakeet_ R N N T";
  static readonly description = `🗣️ Nvidia + Suno.ai's speech-to-text conversion with high accuracy and efficiency 📝
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "audio",
    default: "",
    description: "Input audio file to be transcribed by the ASR model"
  })
  declare audio_file: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const audioFileRef = this.audio_file as Record<string, unknown> | undefined;
    if (isRefSet(audioFileRef)) {
      const audioFileUrl = await assetToUrl(audioFileRef!, apiKey);
      if (audioFileUrl) args["audio_file"] = audioFileUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "nvidia/parakeet-rnnt-1.1b:73ddbebaef172a47c8dfdd79381f110bfdc7691bcc7a4edde82f0a39e380ce50",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Speaker_Diarization extends ReplicateNode {
  static readonly nodeType = "replicate.audio.transcribe.Speaker_Diarization";
  static readonly title = "Speaker_ Diarization";
  static readonly description = `Segments an audio recording based on who is speaking (on A100)
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "audio", default: "", description: "Audio file" })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/speaker-diarization:718182bfdc7c91943c69ed0ac18ebe99a76fdde67ccd01fced347d8c3b8c15a6",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Meronym_Speaker_Diarization extends ReplicateNode {
  static readonly nodeType =
    "replicate.audio.transcribe.Meronym_Speaker_Diarization";
  static readonly title = "Meronym_ Speaker_ Diarization";
  static readonly description = `Segments an audio recording based on who is speaking
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "audio", default: "", description: "Audio file" })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "meronym/speaker-diarization:64b78c82f74d78164b49178443c819445f5dca2c51c8ec374783d49382342119",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Speaker_Transcription extends ReplicateNode {
  static readonly nodeType = "replicate.audio.transcribe.Speaker_Transcription";
  static readonly title = "Speaker_ Transcription";
  static readonly description = `Whisper transcription plus speaker diarization
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "audio", default: "", description: "Audio file" })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional text to provide as a prompt for each Whisper model call."
  })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "meronym/speaker-transcription:9950ee297f0fdad8736adf74ada54f63cc5b5bdfd5b2187366910ed5baf1a7a1",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Speaker_Diarization_3 extends ReplicateNode {
  static readonly nodeType = "replicate.audio.transcribe.Speaker_Diarization_3";
  static readonly title = "Speaker_ Diarization_3";
  static readonly description = `Segments an audio recording based on who is speaking
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "audio", default: "", description: "Audio file or url" })
  declare audio: any;

  @prop({
    type: "int",
    default: 0,
    description: "Maximum number of speakers to diarize. Default: None"
  })
  declare max_speakers: any;

  @prop({
    type: "int",
    default: 0,
    description: "Minimum number of speakers to diarize. Default: None"
  })
  declare min_speakers: any;

  @prop({
    type: "int",
    default: 0,
    description: "Number of speakers to diarize. Default: infer"
  })
  declare num_speakers: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxSpeakers = Number(this.max_speakers ?? 0);
    const minSpeakers = Number(this.min_speakers ?? 0);
    const numSpeakers = Number(this.num_speakers ?? 0);

    const args: Record<string, unknown> = {
      max_speakers: maxSpeakers,
      min_speakers: minSpeakers,
      num_speakers: numSpeakers
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "collectiveai-team/speaker-diarization-3:6e29843b8c1b751ec384ad96d3566af2392046465152fef3cc22ad701090b64c",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export const REPLICATE_AUDIO_TRANSCRIBE_NODES: readonly NodeClass[] = [
  IncrediblyFastWhisper,
  GPT4o_Transcribe,
  Whisper,
  GPT4o_Mini_Transcribe,
  WhisperX,
  Whisper_Diarization,
  Parakeet_RNNT,
  Speaker_Diarization,
  Meronym_Speaker_Diarization,
  Speaker_Transcription,
  Speaker_Diarization_3
] as const;
