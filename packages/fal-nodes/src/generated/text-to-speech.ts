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

export class Qwen3TtsTextToSpeech17B extends FalNode {
  static readonly nodeType = "fal.text_to_speech.Qwen3TtsTextToSpeech17B";
  static readonly title = "Qwen3 Tts Text To Speech17 B";
  static readonly description = `Qwen-3 TTS 1.7B generates natural-sounding speech from text using the large 1.7-billion parameter model.
audio, tts, qwen, 1.7b, text-to-speech, speech-synthesis`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "Optional prompt to guide the style of the generated speech. This prompt will be ignored if a speaker embedding is provided."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "URL to a speaker embedding file in safetensors format, from 'fal-ai/qwen-3-tts/clone-voice' endpoint. If provided, the TTS model will use the cloned voice for synthesis instead of the predefined voices."
  })
  declare speaker_voice_embedding_file_url: any;

  @prop({ type: "str", default: 1, description: "Top-p sampling parameter." })
  declare top_p: any;

  @prop({
    type: "str",
    default: 1.05,
    description: "Penalty to reduce repeated tokens/codes."
  })
  declare repetition_penalty: any;

  @prop({ type: "str", default: 50, description: "Top-k sampling parameter." })
  declare top_k: any;

  @prop({
    type: "str",
    default: 0.9,
    description: "Temperature for sub-talker sampling."
  })
  declare subtalker_temperature: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The voice to be used for speech synthesis, will be ignored if a speaker embedding is provided. Check out the **[documentation](https://github.com/QwenLM/Qwen3-TTS/tree/main?tab=readme-ov-file#custom-voice-generate)** for each voice's details and which language they primarily support."
  })
  declare voice: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional reference text that was used when creating the speaker embedding. Providing this can improve synthesis quality when using a cloned voice."
  })
  declare reference_text: any;

  @prop({
    type: "str",
    default: 0.9,
    description: "Sampling temperature; higher => more random."
  })
  declare temperature: any;

  @prop({
    type: "str",
    default: "",
    description: "The text to be converted to speech."
  })
  declare text: any;

  @prop({
    type: "str",
    default: 50,
    description: "Top-k for sub-talker sampling."
  })
  declare subtalker_top_k: any;

  @prop({
    type: "enum",
    default: "Auto",
    values: [
      "Auto",
      "English",
      "Chinese",
      "Spanish",
      "French",
      "German",
      "Italian",
      "Japanese",
      "Korean",
      "Portuguese",
      "Russian"
    ],
    description: "The language of the voice."
  })
  declare language: any;

  @prop({
    type: "str",
    default: 200,
    description: "Maximum number of new codec tokens to generate."
  })
  declare max_new_tokens: any;

  @prop({
    type: "str",
    default: true,
    description: "Sampling switch for the sub-talker."
  })
  declare subtalker_dosample: any;

  @prop({
    type: "str",
    default: 1,
    description: "Top-p for sub-talker sampling."
  })
  declare subtalker_top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const speakerVoiceEmbeddingFileUrl = String(
      this.speaker_voice_embedding_file_url ?? ""
    );
    const topP = String(this.top_p ?? 1);
    const repetitionPenalty = String(this.repetition_penalty ?? 1.05);
    const topK = String(this.top_k ?? 50);
    const subtalkerTemperature = String(this.subtalker_temperature ?? 0.9);
    const voice = String(this.voice ?? "");
    const referenceText = String(this.reference_text ?? "");
    const temperature = String(this.temperature ?? 0.9);
    const text = String(this.text ?? "");
    const subtalkerTopK = String(this.subtalker_top_k ?? 50);
    const language = String(this.language ?? "Auto");
    const maxNewTokens = String(this.max_new_tokens ?? 200);
    const subtalkerDosample = String(this.subtalker_dosample ?? true);
    const subtalkerTopP = String(this.subtalker_top_p ?? 1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      speaker_voice_embedding_file_url: speakerVoiceEmbeddingFileUrl,
      top_p: topP,
      repetition_penalty: repetitionPenalty,
      top_k: topK,
      subtalker_temperature: subtalkerTemperature,
      voice: voice,
      reference_text: referenceText,
      temperature: temperature,
      text: text,
      subtalker_top_k: subtalkerTopK,
      language: language,
      max_new_tokens: maxNewTokens,
      subtalker_dosample: subtalkerDosample,
      subtalker_top_p: subtalkerTopP
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/qwen-3-tts/text-to-speech/1.7b",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class Qwen3TtsTextToSpeech06B extends FalNode {
  static readonly nodeType = "fal.text_to_speech.Qwen3TtsTextToSpeech06B";
  static readonly title = "Qwen3 Tts Text To Speech06 B";
  static readonly description = `Qwen-3 TTS 0.6B generates speech from text efficiently using the compact 600-million parameter model.
audio, tts, qwen, 0.6b, efficient, text-to-speech`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "Optional prompt to guide the style of the generated speech. This prompt will be ignored if a speaker embedding is provided."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "URL to a speaker embedding file in safetensors format, from 'fal-ai/qwen-3-tts/clone-voice/0.6b' endpoint. If provided, the TTS model will use the cloned voice for synthesis instead of the predefined voices."
  })
  declare speaker_voice_embedding_file_url: any;

  @prop({ type: "str", default: 1, description: "Top-p sampling parameter." })
  declare top_p: any;

  @prop({
    type: "str",
    default: 1.05,
    description: "Penalty to reduce repeated tokens/codes."
  })
  declare repetition_penalty: any;

  @prop({ type: "str", default: 50, description: "Top-k sampling parameter." })
  declare top_k: any;

  @prop({
    type: "str",
    default: 0.9,
    description: "Temperature for sub-talker sampling."
  })
  declare subtalker_temperature: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The voice to be used for speech synthesis, will be ignored if a speaker embedding is provided. Check out the **[documentation](https://github.com/QwenLM/Qwen3-TTS/tree/main?tab=readme-ov-file#custom-voice-generate)** for each voice's details and which language they primarily support."
  })
  declare voice: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional reference text that was used when creating the speaker embedding. Providing this can improve synthesis quality when using a cloned voice."
  })
  declare reference_text: any;

  @prop({
    type: "str",
    default: 0.9,
    description: "Sampling temperature; higher => more random."
  })
  declare temperature: any;

  @prop({
    type: "str",
    default: "",
    description: "The text to be converted to speech."
  })
  declare text: any;

  @prop({
    type: "str",
    default: 50,
    description: "Top-k for sub-talker sampling."
  })
  declare subtalker_top_k: any;

  @prop({
    type: "enum",
    default: "Auto",
    values: [
      "Auto",
      "English",
      "Chinese",
      "Spanish",
      "French",
      "German",
      "Italian",
      "Japanese",
      "Korean",
      "Portuguese",
      "Russian"
    ],
    description: "The language of the voice."
  })
  declare language: any;

  @prop({
    type: "str",
    default: 200,
    description: "Maximum number of new codec tokens to generate."
  })
  declare max_new_tokens: any;

  @prop({
    type: "str",
    default: true,
    description: "Sampling switch for the sub-talker."
  })
  declare subtalker_dosample: any;

  @prop({
    type: "str",
    default: 1,
    description: "Top-p for sub-talker sampling."
  })
  declare subtalker_top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const speakerVoiceEmbeddingFileUrl = String(
      this.speaker_voice_embedding_file_url ?? ""
    );
    const topP = String(this.top_p ?? 1);
    const repetitionPenalty = String(this.repetition_penalty ?? 1.05);
    const topK = String(this.top_k ?? 50);
    const subtalkerTemperature = String(this.subtalker_temperature ?? 0.9);
    const voice = String(this.voice ?? "");
    const referenceText = String(this.reference_text ?? "");
    const temperature = String(this.temperature ?? 0.9);
    const text = String(this.text ?? "");
    const subtalkerTopK = String(this.subtalker_top_k ?? 50);
    const language = String(this.language ?? "Auto");
    const maxNewTokens = String(this.max_new_tokens ?? 200);
    const subtalkerDosample = String(this.subtalker_dosample ?? true);
    const subtalkerTopP = String(this.subtalker_top_p ?? 1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      speaker_voice_embedding_file_url: speakerVoiceEmbeddingFileUrl,
      top_p: topP,
      repetition_penalty: repetitionPenalty,
      top_k: topK,
      subtalker_temperature: subtalkerTemperature,
      voice: voice,
      reference_text: referenceText,
      temperature: temperature,
      text: text,
      subtalker_top_k: subtalkerTopK,
      language: language,
      max_new_tokens: maxNewTokens,
      subtalker_dosample: subtalkerDosample,
      subtalker_top_p: subtalkerTopP
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/qwen-3-tts/text-to-speech/0.6b",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class Qwen3TtsVoiceDesign17B extends FalNode {
  static readonly nodeType = "fal.text_to_speech.Qwen3TtsVoiceDesign17B";
  static readonly title = "Qwen3 Tts Voice Design17 B";
  static readonly description = `Qwen-3 TTS Voice Design 1.7B creates custom voice characteristics for personalized speech synthesis.
audio, tts, qwen, voice-design, custom, 1.7b`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description: "The text to be converted to speech."
  })
  declare text: any;

  @prop({
    type: "str",
    default: 50,
    description: "Top-k for sub-talker sampling."
  })
  declare subtalker_top_k: any;

  @prop({ type: "str", default: 1, description: "Top-p sampling parameter." })
  declare top_p: any;

  @prop({
    type: "str",
    default: 1.05,
    description: "Penalty to reduce repeated tokens/codes."
  })
  declare repetition_penalty: any;

  @prop({
    type: "str",
    default: 200,
    description: "Maximum number of new codec tokens to generate."
  })
  declare max_new_tokens: any;

  @prop({
    type: "enum",
    default: "Auto",
    values: [
      "Auto",
      "English",
      "Chinese",
      "Spanish",
      "French",
      "German",
      "Italian",
      "Japanese",
      "Korean",
      "Portuguese",
      "Russian"
    ],
    description: "The language of the voice to be designed."
  })
  declare language: any;

  @prop({
    type: "str",
    default: "",
    description: "Optional prompt to guide the style of the generated speech."
  })
  declare prompt: any;

  @prop({ type: "str", default: 50, description: "Top-k sampling parameter." })
  declare top_k: any;

  @prop({
    type: "str",
    default: true,
    description: "Sampling switch for the sub-talker."
  })
  declare subtalker_dosample: any;

  @prop({
    type: "str",
    default: 0.9,
    description: "Temperature for sub-talker sampling."
  })
  declare subtalker_temperature: any;

  @prop({
    type: "str",
    default: 1,
    description: "Top-p for sub-talker sampling."
  })
  declare subtalker_top_p: any;

  @prop({
    type: "str",
    default: 0.9,
    description: "Sampling temperature; higher => more random."
  })
  declare temperature: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const subtalkerTopK = String(this.subtalker_top_k ?? 50);
    const topP = String(this.top_p ?? 1);
    const repetitionPenalty = String(this.repetition_penalty ?? 1.05);
    const maxNewTokens = String(this.max_new_tokens ?? 200);
    const language = String(this.language ?? "Auto");
    const prompt = String(this.prompt ?? "");
    const topK = String(this.top_k ?? 50);
    const subtalkerDosample = String(this.subtalker_dosample ?? true);
    const subtalkerTemperature = String(this.subtalker_temperature ?? 0.9);
    const subtalkerTopP = String(this.subtalker_top_p ?? 1);
    const temperature = String(this.temperature ?? 0.9);

    const args: Record<string, unknown> = {
      text: text,
      subtalker_top_k: subtalkerTopK,
      top_p: topP,
      repetition_penalty: repetitionPenalty,
      max_new_tokens: maxNewTokens,
      language: language,
      prompt: prompt,
      top_k: topK,
      subtalker_dosample: subtalkerDosample,
      subtalker_temperature: subtalkerTemperature,
      subtalker_top_p: subtalkerTopP,
      temperature: temperature
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/qwen-3-tts/voice-design/1.7b",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class Vibevoice05B extends FalNode {
  static readonly nodeType = "fal.text_to_speech.Vibevoice05B";
  static readonly title = "Vibevoice05 B";
  static readonly description = `VibeVoice 0.5B generates expressive and emotive speech from text with natural vocal characteristics.
audio, tts, vibevoice, 0.5b, expressive, text-to-speech`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    rtf: "float",
    duration: "float",
    sample_rate: "int",
    generation_time: "float",
    audio: "audio"
  };

  @prop({
    type: "str",
    default: "",
    description: "The script to convert to speech."
  })
  declare script: any;

  @prop({
    type: "str",
    default: "",
    description: "Random seed for reproducible generation."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "",
    values: ["Frank", "Wayne", "Carter", "Emma", "Grace", "Mike"],
    description: "Voice to use for speaking."
  })
  declare speaker: any;

  @prop({
    type: "float",
    default: 1.3,
    description:
      "CFG (Classifier-Free Guidance) scale for generation. Higher values increase adherence to text."
  })
  declare cfg_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const script = String(this.script ?? "");
    const seed = String(this.seed ?? "");
    const speaker = String(this.speaker ?? "");
    const cfgScale = Number(this.cfg_scale ?? 1.3);

    const args: Record<string, unknown> = {
      script: script,
      seed: seed,
      speaker: speaker,
      cfg_scale: cfgScale
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/vibevoice/0.5b", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class Maya extends FalNode {
  static readonly nodeType = "fal.text_to_speech.Maya";
  static readonly title = "Maya";
  static readonly description = `Maya generates high-quality natural speech from text with advanced voice synthesis capabilities.
audio, tts, maya, high-quality, text-to-speech`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    duration: "float",
    rtf: "float",
    sample_rate: "str",
    generation_time: "float",
    audio: "audio"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "The text to synthesize into speech. You can embed emotion tags anywhere in the text using the format <emotion_name>. Available emotions: laugh, laugh_harder, sigh, chuckle, gasp, angry, excited, whisper, cry, scream, sing, snort, exhale, gulp, giggle, sarcastic, curious. Example: 'Hello world! <excited> This is amazing!' or 'I can't believe this <sigh> happened again.'"
  })
  declare text: any;

  @prop({
    type: "float",
    default: 1.1,
    description:
      "Penalty for repeating tokens. Higher values reduce repetition artifacts."
  })
  declare repetition_penalty: any;

  @prop({
    type: "float",
    default: 0.9,
    description:
      "Nucleus sampling parameter. Controls diversity of token selection."
  })
  declare top_p: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Description of the voice/character. Includes attributes like age, accent, pitch, timbre, pacing, tone, and intensity. See examples for format."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "wav",
    values: ["wav", "mp3"],
    description: "Output audio format for the generated speech"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 2000,
    description:
      "Maximum number of SNAC tokens to generate (7 tokens per frame). Controls maximum audio length."
  })
  declare max_tokens: any;

  @prop({
    type: "float",
    default: 0.4,
    description:
      "Sampling temperature. Lower values (0.2-0.5) produce more stable/consistent audio. Higher values add variation."
  })
  declare temperature: any;

  @prop({
    type: "enum",
    default: "48 kHz",
    values: ["48 kHz", "24 kHz"],
    description:
      "Output audio sample rate. 48 kHz provides higher quality audio, 24 kHz is faster."
  })
  declare sample_rate: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const repetitionPenalty = Number(this.repetition_penalty ?? 1.1);
    const topP = Number(this.top_p ?? 0.9);
    const prompt = String(this.prompt ?? "");
    const outputFormat = String(this.output_format ?? "wav");
    const maxTokens = Number(this.max_tokens ?? 2000);
    const temperature = Number(this.temperature ?? 0.4);
    const sampleRate = String(this.sample_rate ?? "48 kHz");

    const args: Record<string, unknown> = {
      text: text,
      repetition_penalty: repetitionPenalty,
      top_p: topP,
      prompt: prompt,
      output_format: outputFormat,
      max_tokens: maxTokens,
      temperature: temperature,
      sample_rate: sampleRate
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/maya", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class MinimaxSpeech26Hd extends FalNode {
  static readonly nodeType = "fal.text_to_speech.MinimaxSpeech26Hd";
  static readonly title = "Minimax Speech26 Hd";
  static readonly description = `Minimax Speech 2.6 HD generates high-definition speech from text with superior audio quality.
audio, tts, minimax, 2.6, hd, high-quality`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { duration_ms: "int", audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "Text to convert to speech. Paragraph breaks should be marked with newline characters. **NOTE**: You can customize speech pauses by adding markers in the form '<#x#>', where 'x' is the pause duration in seconds. Valid range: '[0.01, 99.99]', up to two decimal places. Pause markers must be placed between speakable text segments and cannot be used consecutively."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Enhance recognition of specified languages and dialects"
  })
  declare language_boost: any;

  @prop({
    type: "enum",
    default: "hex",
    values: ["url", "hex"],
    description: "Format of the output content (non-streaming only)"
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "Custom pronunciation dictionary for text replacement"
  })
  declare pronunciation_dict: any;

  @prop({
    type: "str",
    default: "",
    description: "Voice configuration settings"
  })
  declare voice_setting: any;

  @prop({
    type: "str",
    default: "",
    description: "Loudness normalization settings for the audio"
  })
  declare normalization_setting: any;

  @prop({
    type: "str",
    default: "",
    description: "Audio configuration settings"
  })
  declare audio_setting: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const languageBoost = String(this.language_boost ?? "");
    const outputFormat = String(this.output_format ?? "hex");
    const pronunciationDict = String(this.pronunciation_dict ?? "");
    const voiceSetting = String(this.voice_setting ?? "");
    const normalizationSetting = String(this.normalization_setting ?? "");
    const audioSetting = String(this.audio_setting ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      language_boost: languageBoost,
      output_format: outputFormat,
      pronunciation_dict: pronunciationDict,
      voice_setting: voiceSetting,
      normalization_setting: normalizationSetting,
      audio_setting: audioSetting
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/minimax/speech-2.6-hd", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class MinimaxSpeech26Turbo extends FalNode {
  static readonly nodeType = "fal.text_to_speech.MinimaxSpeech26Turbo";
  static readonly title = "Minimax Speech26 Turbo";
  static readonly description = `Minimax Speech 2.6 Turbo generates speech from text with optimized speed and good quality.
audio, tts, minimax, 2.6, turbo, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { duration_ms: "int", audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "Text to convert to speech. Paragraph breaks should be marked with newline characters. **NOTE**: You can customize speech pauses by adding markers in the form '<#x#>', where 'x' is the pause duration in seconds. Valid range: '[0.01, 99.99]', up to two decimal places. Pause markers must be placed between speakable text segments and cannot be used consecutively."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Enhance recognition of specified languages and dialects"
  })
  declare language_boost: any;

  @prop({
    type: "enum",
    default: "hex",
    values: ["url", "hex"],
    description: "Format of the output content (non-streaming only)"
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "Custom pronunciation dictionary for text replacement"
  })
  declare pronunciation_dict: any;

  @prop({
    type: "str",
    default: "",
    description: "Voice configuration settings"
  })
  declare voice_setting: any;

  @prop({
    type: "str",
    default: "",
    description: "Loudness normalization settings for the audio"
  })
  declare normalization_setting: any;

  @prop({
    type: "str",
    default: "",
    description: "Audio configuration settings"
  })
  declare audio_setting: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const languageBoost = String(this.language_boost ?? "");
    const outputFormat = String(this.output_format ?? "hex");
    const pronunciationDict = String(this.pronunciation_dict ?? "");
    const voiceSetting = String(this.voice_setting ?? "");
    const normalizationSetting = String(this.normalization_setting ?? "");
    const audioSetting = String(this.audio_setting ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      language_boost: languageBoost,
      output_format: outputFormat,
      pronunciation_dict: pronunciationDict,
      voice_setting: voiceSetting,
      normalization_setting: normalizationSetting,
      audio_setting: audioSetting
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/minimax/speech-2.6-turbo",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class MayaBatch extends FalNode {
  static readonly nodeType = "fal.text_to_speech.MayaBatch";
  static readonly title = "Maya Batch";
  static readonly description = `Maya Batch TTS generates high-quality speech in batch mode for efficient processing.
speech, synthesis, text-to-speech, tts, batch, maya`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    average_rtf: "float",
    durations: "list[float]",
    total_generation_time: "float",
    audios: "list[File]",
    sample_rate: "str"
  };

  @prop({
    type: "float",
    default: 1.1,
    description: "Repetition penalty for all generations."
  })
  declare repetition_penalty: any;

  @prop({
    type: "float",
    default: 0.9,
    description: "Nucleus sampling parameter for all generations."
  })
  declare top_p: any;

  @prop({
    type: "enum",
    default: "wav",
    values: ["wav", "mp3"],
    description: "Output audio format for all generated speech files"
  })
  declare output_format: any;

  @prop({
    type: "list[str]",
    default: [],
    description:
      "List of texts to synthesize into speech. You can embed emotion tags in each text using the format <emotion_name>."
  })
  declare texts: any;

  @prop({
    type: "list[str]",
    default: [],
    description:
      "List of voice descriptions for each text. Must match the length of texts list. Each describes the voice/character attributes."
  })
  declare prompts: any;

  @prop({
    type: "int",
    default: 2000,
    description: "Maximum SNAC tokens per generation."
  })
  declare max_tokens: any;

  @prop({
    type: "float",
    default: 0.4,
    description: "Sampling temperature for all generations."
  })
  declare temperature: any;

  @prop({
    type: "enum",
    default: "48 kHz",
    values: ["48 kHz", "24 kHz"],
    description:
      "Output audio sample rate for all generations. 48 kHz provides higher quality, 24 kHz is faster."
  })
  declare sample_rate: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const repetitionPenalty = Number(this.repetition_penalty ?? 1.1);
    const topP = Number(this.top_p ?? 0.9);
    const outputFormat = String(this.output_format ?? "wav");
    const texts = String(this.texts ?? []);
    const prompts = String(this.prompts ?? []);
    const maxTokens = Number(this.max_tokens ?? 2000);
    const temperature = Number(this.temperature ?? 0.4);
    const sampleRate = String(this.sample_rate ?? "48 kHz");

    const args: Record<string, unknown> = {
      repetition_penalty: repetitionPenalty,
      top_p: topP,
      output_format: outputFormat,
      texts: texts,
      prompts: prompts,
      max_tokens: maxTokens,
      temperature: temperature,
      sample_rate: sampleRate
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/maya/batch", args);
    return res as Record<string, unknown>;
  }
}

export class MayaStream extends FalNode {
  static readonly nodeType = "fal.text_to_speech.MayaStream";
  static readonly title = "Maya Stream";
  static readonly description = `Maya Stream TTS generates high-quality speech in streaming mode for real-time applications.
speech, synthesis, text-to-speech, tts, streaming, maya`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({
    type: "str",
    default: "",
    description:
      "The text to synthesize into speech. You can embed emotion tags anywhere in the text using the format <emotion_name>. Available emotions: laugh, laugh_harder, sigh, chuckle, gasp, angry, excited, whisper, cry, scream, sing, snort, exhale, gulp, giggle, sarcastic, curious. Example: 'Hello world! <excited> This is amazing!' or 'I can't believe this <sigh> happened again.'"
  })
  declare text: any;

  @prop({
    type: "float",
    default: 1.1,
    description:
      "Penalty for repeating tokens. Higher values reduce repetition artifacts."
  })
  declare repetition_penalty: any;

  @prop({
    type: "float",
    default: 0.9,
    description:
      "Nucleus sampling parameter. Controls diversity of token selection."
  })
  declare top_p: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Description of the voice/character. Includes attributes like age, accent, pitch, timbre, pacing, tone, and intensity. See examples for format."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "mp3",
    values: ["mp3", "wav", "pcm"],
    description:
      "Output audio format. 'mp3' for browser-playable audio, 'wav' for uncompressed audio, 'pcm' for raw PCM (lowest latency, requires client-side decoding)."
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 2000,
    description:
      "Maximum number of SNAC tokens to generate (7 tokens per frame). Controls maximum audio length."
  })
  declare max_tokens: any;

  @prop({
    type: "float",
    default: 0.4,
    description:
      "Sampling temperature. Lower values (0.2-0.5) produce more stable/consistent audio. Higher values add variation."
  })
  declare temperature: any;

  @prop({
    type: "enum",
    default: "24 kHz",
    values: ["48 kHz", "24 kHz"],
    description:
      "Output audio sample rate. 48 kHz uses upsampling for higher quality audio, 24 kHz is native SNAC output (faster, lower latency)."
  })
  declare sample_rate: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const repetitionPenalty = Number(this.repetition_penalty ?? 1.1);
    const topP = Number(this.top_p ?? 0.9);
    const prompt = String(this.prompt ?? "");
    const outputFormat = String(this.output_format ?? "mp3");
    const maxTokens = Number(this.max_tokens ?? 2000);
    const temperature = Number(this.temperature ?? 0.4);
    const sampleRate = String(this.sample_rate ?? "24 kHz");

    const args: Record<string, unknown> = {
      text: text,
      repetition_penalty: repetitionPenalty,
      top_p: topP,
      prompt: prompt,
      output_format: outputFormat,
      max_tokens: maxTokens,
      temperature: temperature,
      sample_rate: sampleRate
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/maya/stream", args);
    return { output: res };
  }
}

export class IndexTts2TextToSpeech extends FalNode {
  static readonly nodeType = "fal.text_to_speech.IndexTts2TextToSpeech";
  static readonly title = "Index Tts2 Text To Speech";
  static readonly description = `Index TTS 2 generates natural-sounding speech from text with advanced neural synthesis.
speech, synthesis, text-to-speech, tts, neural`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description: "The speech prompt to generate"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The strengths of individual emotions for fine-grained control. "
  })
  declare emotional_strengths: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The strength of the emotional style transfer. Higher values result in stronger emotional influence."
  })
  declare strength: any;

  @prop({
    type: "audio",
    default: "",
    description: "The emotional reference audio file to extract the style from."
  })
  declare emotional_audio: any;

  @prop({
    type: "audio",
    default: "",
    description: "The audio file to generate the speech from."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The emotional prompt to influence the emotional style. Must be used together with should_use_prompt_for_emotion."
  })
  declare emotion_prompt: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to use the 'prompt' to calculate emotional strengths, if enabled it will overwrite the 'emotional_strengths' values. If 'emotion_prompt' is provided, it will be used to instead of 'prompt' to extract the emotional style."
  })
  declare should_use_prompt_for_emotion: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const emotionalStrengths = String(this.emotional_strengths ?? "");
    const strength = Number(this.strength ?? 1);
    const emotionPrompt = String(this.emotion_prompt ?? "");
    const shouldUsePromptForEmotion = Boolean(
      this.should_use_prompt_for_emotion ?? false
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      emotional_strengths: emotionalStrengths,
      strength: strength,
      emotion_prompt: emotionPrompt,
      should_use_prompt_for_emotion: shouldUsePromptForEmotion
    };

    const emotionalAudioRef = this.emotional_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(emotionalAudioRef)) {
      const emotionalAudioUrl = await assetToFalUrl(apiKey, emotionalAudioRef!);
      if (emotionalAudioUrl) args["emotional_audio_url"] = emotionalAudioUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/index-tts-2/text-to-speech",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class KlingVideoV1Tts extends FalNode {
  static readonly nodeType = "fal.text_to_speech.KlingVideoV1Tts";
  static readonly title = "Kling Video V1 Tts";
  static readonly description = `Generate speech from text prompts and different voices using the Kling TTS model, which leverages advanced AI techniques to create high-quality text-to-speech.
speech, synthesis, text-to-speech, tts`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description: "The text to be converted to speech"
  })
  declare text: any;

  @prop({
    type: "enum",
    default: "genshin_vindi2",
    values: [
      "genshin_vindi2",
      "zhinen_xuesheng",
      "AOT",
      "ai_shatang",
      "genshin_klee2",
      "genshin_kirara",
      "ai_kaiya",
      "oversea_male1",
      "ai_chenjiahao_712",
      "girlfriend_4_speech02",
      "chat1_female_new-3",
      "chat_0407_5-1",
      "cartoon-boy-07",
      "uk_boy1",
      "cartoon-girl-01",
      "PeppaPig_platform",
      "ai_huangzhong_712",
      "ai_huangyaoshi_712",
      "ai_laoguowang_712",
      "chengshu_jiejie",
      "you_pingjing",
      "calm_story1",
      "uk_man2",
      "laopopo_speech02",
      "heainainai_speech02",
      "reader_en_m-v1",
      "commercial_lady_en_f-v1",
      "tiyuxi_xuedi",
      "tiexin_nanyou",
      "girlfriend_1_speech02",
      "girlfriend_2_speech02",
      "zhuxi_speech02",
      "uk_oldman3",
      "dongbeilaotie_speech02",
      "chongqingxiaohuo_speech02",
      "chuanmeizi_speech02",
      "chaoshandashu_speech02",
      "ai_taiwan_man2_speech02",
      "xianzhanggui_speech02",
      "tianjinjiejie_speech02",
      "diyinnansang_DB_CN_M_04-v2",
      "yizhipiannan-v1",
      "guanxiaofang-v2",
      "tianmeixuemei-v1",
      "daopianyansang-v1",
      "mengwa-v1"
    ],
    description: "The voice ID to use for speech synthesis"
  })
  declare voice_id: any;

  @prop({ type: "float", default: 1, description: "Rate of speech" })
  declare voice_speed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const voiceId = String(this.voice_id ?? "genshin_vindi2");
    const voiceSpeed = Number(this.voice_speed ?? 1);

    const args: Record<string, unknown> = {
      text: text,
      voice_id: voiceId,
      voice_speed: voiceSpeed
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/kling-video/v1/tts", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class ChatterboxTextToSpeechMultilingual extends FalNode {
  static readonly nodeType =
    "fal.text_to_speech.ChatterboxTextToSpeechMultilingual";
  static readonly title = "Chatterbox Text To Speech Multilingual";
  static readonly description = `Whether you're working on memes, videos, games, or AI agents, Chatterbox brings your content to life. Use the first tts from resemble ai.
speech, synthesis, text-to-speech, tts`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "The text to be converted to speech (maximum 300 characters). Supports 23 languages including English, French, German, Spanish, Italian, Portuguese, Hindi, Arabic, Chinese, Japanese, Korean, and more."
  })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    description:
      "If using a custom audio URL, specify the language of the audio here. Ignored if voice is not a custom url."
  })
  declare custom_audio_language: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Controls speech expressiveness and emotional intensity (0.25-2.0). 0.5 is neutral, higher values increase expressiveness. Extreme values may be unstable."
  })
  declare exaggeration: any;

  @prop({
    type: "str",
    default: "english",
    description:
      "Language code for synthesis. In case using custom please provide audio url and select custom_audio_language. "
  })
  declare voice: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Controls randomness and variation in generation (0.05-5.0). Higher values create more varied speech patterns."
  })
  declare temperature: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducible results. Set to 0 for random generation, or provide a specific number for consistent outputs."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Configuration/pace weight controlling generation guidance (0.0-1.0). Use 0.0 for language transfer to mitigate accent inheritance."
  })
  declare cfg_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const customAudioLanguage = String(this.custom_audio_language ?? "");
    const exaggeration = Number(this.exaggeration ?? 0.5);
    const voice = String(this.voice ?? "english");
    const temperature = Number(this.temperature ?? 0.8);
    const seed = String(this.seed ?? "");
    const cfgScale = Number(this.cfg_scale ?? 0.5);

    const args: Record<string, unknown> = {
      text: text,
      custom_audio_language: customAudioLanguage,
      exaggeration: exaggeration,
      voice: voice,
      temperature: temperature,
      seed: seed,
      cfg_scale: cfgScale
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/chatterbox/text-to-speech/multilingual",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class Vibevoice7b extends FalNode {
  static readonly nodeType = "fal.text_to_speech.Vibevoice7b";
  static readonly title = "Vibevoice7b";
  static readonly description = `Generate long, expressive multi-voice speech using Microsoft's powerful TTS
speech, synthesis, text-to-speech, tts`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    rtf: "float",
    duration: "float",
    sample_rate: "int",
    generation_time: "float",
    audio: "audio"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "The script to convert to speech. Can be formatted with 'Speaker X:' prefixes for multi-speaker dialogues."
  })
  declare script: any;

  @prop({
    type: "str",
    default: "",
    description: "Random seed for reproducible generation."
  })
  declare seed: any;

  @prop({
    type: "list[VibeVoiceSpeaker]",
    default: [],
    description:
      "List of speakers to use for the script. If not provided, will be inferred from the script or voice samples."
  })
  declare speakers: any;

  @prop({
    type: "float",
    default: 1.3,
    description:
      "CFG (Classifier-Free Guidance) scale for generation. Higher values increase adherence to text."
  })
  declare cfg_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const script = String(this.script ?? "");
    const seed = String(this.seed ?? "");
    const speakers = String(this.speakers ?? []);
    const cfgScale = Number(this.cfg_scale ?? 1.3);

    const args: Record<string, unknown> = {
      script: script,
      seed: seed,
      speakers: speakers,
      cfg_scale: cfgScale
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/vibevoice/7b", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class Vibevoice extends FalNode {
  static readonly nodeType = "fal.text_to_speech.Vibevoice";
  static readonly title = "Vibevoice";
  static readonly description = `Generate long, expressive multi-voice speech using Microsoft's powerful TTS
speech, synthesis, text-to-speech, tts`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    rtf: "float",
    duration: "float",
    sample_rate: "int",
    generation_time: "float",
    audio: "audio"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "The script to convert to speech. Can be formatted with 'Speaker X:' prefixes for multi-speaker dialogues."
  })
  declare script: any;

  @prop({
    type: "str",
    default: "",
    description: "Random seed for reproducible generation."
  })
  declare seed: any;

  @prop({
    type: "list[VibeVoiceSpeaker]",
    default: [],
    description:
      "List of speakers to use for the script. If not provided, will be inferred from the script or voice samples."
  })
  declare speakers: any;

  @prop({
    type: "float",
    default: 1.3,
    description:
      "CFG (Classifier-Free Guidance) scale for generation. Higher values increase adherence to text."
  })
  declare cfg_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const script = String(this.script ?? "");
    const seed = String(this.seed ?? "");
    const speakers = String(this.speakers ?? []);
    const cfgScale = Number(this.cfg_scale ?? 1.3);

    const args: Record<string, unknown> = {
      script: script,
      seed: seed,
      speakers: speakers,
      cfg_scale: cfgScale
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/vibevoice", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class MinimaxPreviewSpeech25Hd extends FalNode {
  static readonly nodeType = "fal.text_to_speech.MinimaxPreviewSpeech25Hd";
  static readonly title = "Minimax Preview Speech25 Hd";
  static readonly description = `Generate speech from text prompts and different voices using the MiniMax Speech-02 HD model, which leverages advanced AI techniques to create high-quality text-to-speech.
speech, synthesis, text-to-speech, tts`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { duration_ms: "int", audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "Text to convert to speech (max 5000 characters, minimum 1 non-whitespace character)"
  })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    description: "Voice configuration settings"
  })
  declare voice_setting: any;

  @prop({
    type: "str",
    default: "",
    description: "Enhance recognition of specified languages and dialects"
  })
  declare language_boost: any;

  @prop({
    type: "enum",
    default: "hex",
    values: ["url", "hex"],
    description: "Format of the output content (non-streaming only)"
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "Custom pronunciation dictionary for text replacement"
  })
  declare pronunciation_dict: any;

  @prop({
    type: "str",
    default: "",
    description: "Audio configuration settings"
  })
  declare audio_setting: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const voiceSetting = String(this.voice_setting ?? "");
    const languageBoost = String(this.language_boost ?? "");
    const outputFormat = String(this.output_format ?? "hex");
    const pronunciationDict = String(this.pronunciation_dict ?? "");
    const audioSetting = String(this.audio_setting ?? "");

    const args: Record<string, unknown> = {
      text: text,
      voice_setting: voiceSetting,
      language_boost: languageBoost,
      output_format: outputFormat,
      pronunciation_dict: pronunciationDict,
      audio_setting: audioSetting
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/minimax/preview/speech-2.5-hd",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class MinimaxPreviewSpeech25Turbo extends FalNode {
  static readonly nodeType = "fal.text_to_speech.MinimaxPreviewSpeech25Turbo";
  static readonly title = "Minimax Preview Speech25 Turbo";
  static readonly description = `Generate fast speech from text prompts and different voices using the MiniMax Speech-02 Turbo model, which leverages advanced AI techniques to create high-quality text-to-speech.
speech, synthesis, text-to-speech, tts, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { duration_ms: "int", audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "Text to convert to speech (max 5000 characters, minimum 1 non-whitespace character)"
  })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    description: "Voice configuration settings"
  })
  declare voice_setting: any;

  @prop({
    type: "str",
    default: "",
    description: "Enhance recognition of specified languages and dialects"
  })
  declare language_boost: any;

  @prop({
    type: "enum",
    default: "hex",
    values: ["url", "hex"],
    description: "Format of the output content (non-streaming only)"
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "Custom pronunciation dictionary for text replacement"
  })
  declare pronunciation_dict: any;

  @prop({
    type: "str",
    default: "",
    description: "Audio configuration settings"
  })
  declare audio_setting: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const voiceSetting = String(this.voice_setting ?? "");
    const languageBoost = String(this.language_boost ?? "");
    const outputFormat = String(this.output_format ?? "hex");
    const pronunciationDict = String(this.pronunciation_dict ?? "");
    const audioSetting = String(this.audio_setting ?? "");

    const args: Record<string, unknown> = {
      text: text,
      voice_setting: voiceSetting,
      language_boost: languageBoost,
      output_format: outputFormat,
      pronunciation_dict: pronunciationDict,
      audio_setting: audioSetting
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/minimax/preview/speech-2.5-turbo",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class MinimaxVoiceDesign extends FalNode {
  static readonly nodeType = "fal.text_to_speech.MinimaxVoiceDesign";
  static readonly title = "Minimax Voice Design";
  static readonly description = `Design a personalized voice from a text description, and generate speech from text prompts using the MiniMax model, which leverages advanced AI techniques to create high-quality text-to-speech.
speech, synthesis, text-to-speech, tts`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { custom_voice_id: "str", audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description: "Voice description prompt for generating a personalized voice"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Text for audio preview. Limited to 500 characters. A fee of $30 per 1M characters will be charged for the generation of the preview audio."
  })
  declare preview_text: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const previewText = String(this.preview_text ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      preview_text: previewText
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/minimax/voice-design", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class ResembleAiChatterboxhdTextToSpeech extends FalNode {
  static readonly nodeType =
    "fal.text_to_speech.ResembleAiChatterboxhdTextToSpeech";
  static readonly title = "Resemble Ai Chatterboxhd Text To Speech";
  static readonly description = `Generate expressive, natural speech with Resemble AI's Chatterbox. Features unique emotion control, instant voice cloning from short audio, and built-in watermarking.
speech, synthesis, text-to-speech, tts`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default:
      "My name is Maximus Decimus Meridius, commander of the Armies of the North, General of the Felix Legions and loyal servant to the true emperor, Marcus Aurelius. Father to a murdered son, husband to a murdered wife. And I will have my vengeance, in this life or the next.",
    description: "Text to synthesize into speech."
  })
  declare text: any;

  @prop({
    type: "float",
    default: 0.5,
    description: "Controls emotion exaggeration. Range typically 0.25 to 2.0."
  })
  declare exaggeration: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If True, the generated audio will be upscaled to 48kHz. The generation of the audio will take longer, but the quality will be higher. If False, the generated audio will be 24kHz. "
  })
  declare high_quality_audio: any;

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
      "The voice to use for the TTS request. If neither voice nor audio are provided, a random voice will be used."
  })
  declare voice: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "URL to the audio sample to use as a voice prompt for zero-shot TTS voice cloning. Providing a audio sample will override the voice setting. If neither voice nor audio_url are provided, a random voice will be used."
  })
  declare audio: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Controls the randomness of generation. Range typically 0.05 to 5."
  })
  declare temperature: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Useful to control the reproducibility of the generated audio. Assuming all other properties didn't change, a fixed seed should always generate the exact same audio file. Set to 0 for random seed."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Classifier-free guidance scale (CFG) controls the conditioning factor. Range typically 0.2 to 1.0. For expressive or dramatic speech, try lower cfg values (e.g. ~0.3) and increase exaggeration to around 0.7 or higher. If the reference speaker has a fast speaking style, lowering cfg to around 0.3 can improve pacing."
  })
  declare cfg: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(
      this.text ??
        "My name is Maximus Decimus Meridius, commander of the Armies of the North, General of the Felix Legions and loyal servant to the true emperor, Marcus Aurelius. Father to a murdered son, husband to a murdered wife. And I will have my vengeance, in this life or the next."
    );
    const exaggeration = Number(this.exaggeration ?? 0.5);
    const highQualityAudio = Boolean(this.high_quality_audio ?? false);
    const voice = String(this.voice ?? "");
    const temperature = Number(this.temperature ?? 0.8);
    const seed = Number(this.seed ?? 0);
    const cfg = Number(this.cfg ?? 0.5);

    const args: Record<string, unknown> = {
      text: text,
      exaggeration: exaggeration,
      high_quality_audio: highQualityAudio,
      voice: voice,
      temperature: temperature,
      seed: seed,
      cfg: cfg
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "resemble-ai/chatterboxhd/text-to-speech",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class ChatterboxTextToSpeech extends FalNode {
  static readonly nodeType = "fal.text_to_speech.ChatterboxTextToSpeech";
  static readonly title = "Chatterbox Text To Speech";
  static readonly description = `Whether you're working on memes, videos, games, or AI agents, Chatterbox brings your content to life. Use the first tts from resemble ai.
speech, synthesis, text-to-speech, tts`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "The text to be converted to speech. You can additionally add the following emotive tags: <laugh>, <chuckle>, <sigh>, <cough>, <sniffle>, <groan>, <yawn>, <gasp>"
  })
  declare text: any;

  @prop({
    type: "float",
    default: 0.25,
    description:
      "Exaggeration factor for the generated speech (0.0 = no exaggeration, 1.0 = maximum exaggeration)."
  })
  declare exaggeration: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "Optional URL to an audio file to use as a reference for the generated speech. If provided, the model will try to match the style and tone of the reference audio."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Useful to control the reproducibility of the generated audio. Assuming all other properties didn't change, a fixed seed should always generate the exact same audio file. Set to 0 for random seed.."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 0.7,
    description: "Temperature for generation (higher = more creative)."
  })
  declare temperature: any;

  @prop({ type: "float", default: 0.5 })
  declare cfg: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const exaggeration = Number(this.exaggeration ?? 0.25);
    const seed = String(this.seed ?? "");
    const temperature = Number(this.temperature ?? 0.7);
    const cfg = Number(this.cfg ?? 0.5);

    const args: Record<string, unknown> = {
      text: text,
      exaggeration: exaggeration,
      seed: seed,
      temperature: temperature,
      cfg: cfg
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/chatterbox/text-to-speech",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class MinimaxVoiceClone extends FalNode {
  static readonly nodeType = "fal.text_to_speech.MinimaxVoiceClone";
  static readonly title = "Minimax Voice Clone";
  static readonly description = `Clone a voice from a sample audio and generate speech from text prompts using the MiniMax model, which leverages advanced AI techniques to create high-quality text-to-speech.
speech, synthesis, text-to-speech, tts`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { custom_voice_id: "str", audio: "audio" };

  @prop({
    type: "enum",
    default: "speech-02-hd",
    values: [
      "speech-02-hd",
      "speech-02-turbo",
      "speech-01-hd",
      "speech-01-turbo"
    ],
    description:
      "TTS model to use for preview. Options: speech-02-hd, speech-02-turbo, speech-01-hd, speech-01-turbo"
  })
  declare model: any;

  @prop({
    type: "str",
    default:
      "Hello, this is a preview of your cloned voice! I hope you like it!",
    description:
      "Text to generate a TTS preview with the cloned voice (optional)"
  })
  declare text: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "\n            URL of the input audio file for voice cloning. Should be at least 10 seconds\n            long. To retain the voice permanently, use it with a TTS (text-to-speech)\n            endpoint at least once within 7 days. Otherwise, it will be\n            automatically deleted.\n        "
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    description: "Text validation accuracy threshold (0-1)"
  })
  declare accuracy: any;

  @prop({
    type: "bool",
    default: false,
    description: "Enable noise reduction for the cloned voice"
  })
  declare noise_reduction: any;

  @prop({
    type: "bool",
    default: false,
    description: "Enable volume normalization for the cloned voice"
  })
  declare need_volume_normalization: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const model = String(this.model ?? "speech-02-hd");
    const text = String(
      this.text ??
        "Hello, this is a preview of your cloned voice! I hope you like it!"
    );
    const accuracy = String(this.accuracy ?? "");
    const noiseReduction = Boolean(this.noise_reduction ?? false);
    const needVolumeNormalization = Boolean(
      this.need_volume_normalization ?? false
    );

    const args: Record<string, unknown> = {
      model: model,
      text: text,
      accuracy: accuracy,
      noise_reduction: noiseReduction,
      need_volume_normalization: needVolumeNormalization
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/minimax/voice-clone", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class MinimaxSpeech02Turbo extends FalNode {
  static readonly nodeType = "fal.text_to_speech.MinimaxSpeech02Turbo";
  static readonly title = "Minimax Speech02 Turbo";
  static readonly description = `Generate fast speech from text prompts and different voices using the MiniMax Speech-02 Turbo model, which leverages advanced AI techniques to create high-quality text-to-speech.
speech, synthesis, text-to-speech, tts, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { duration_ms: "int", audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "Text to convert to speech (max 5000 characters, minimum 1 non-whitespace character)"
  })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    description: "Voice configuration settings"
  })
  declare voice_setting: any;

  @prop({
    type: "str",
    default: "",
    description: "Enhance recognition of specified languages and dialects"
  })
  declare language_boost: any;

  @prop({
    type: "enum",
    default: "hex",
    values: ["url", "hex"],
    description: "Format of the output content (non-streaming only)"
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "Custom pronunciation dictionary for text replacement"
  })
  declare pronunciation_dict: any;

  @prop({
    type: "str",
    default: "",
    description: "Audio configuration settings"
  })
  declare audio_setting: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const voiceSetting = String(this.voice_setting ?? "");
    const languageBoost = String(this.language_boost ?? "");
    const outputFormat = String(this.output_format ?? "hex");
    const pronunciationDict = String(this.pronunciation_dict ?? "");
    const audioSetting = String(this.audio_setting ?? "");

    const args: Record<string, unknown> = {
      text: text,
      voice_setting: voiceSetting,
      language_boost: languageBoost,
      output_format: outputFormat,
      pronunciation_dict: pronunciationDict,
      audio_setting: audioSetting
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/minimax/speech-02-turbo", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class MinimaxSpeech02Hd extends FalNode {
  static readonly nodeType = "fal.text_to_speech.MinimaxSpeech02Hd";
  static readonly title = "Minimax Speech02 Hd";
  static readonly description = `Generate speech from text prompts and different voices using the MiniMax Speech-02 HD model, which leverages advanced AI techniques to create high-quality text-to-speech.
speech, synthesis, text-to-speech, tts`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { duration_ms: "int", audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "Text to convert to speech (max 5000 characters, minimum 1 non-whitespace character)"
  })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    description: "Voice configuration settings"
  })
  declare voice_setting: any;

  @prop({
    type: "str",
    default: "",
    description: "Enhance recognition of specified languages and dialects"
  })
  declare language_boost: any;

  @prop({
    type: "enum",
    default: "hex",
    values: ["url", "hex"],
    description: "Format of the output content (non-streaming only)"
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "Custom pronunciation dictionary for text replacement"
  })
  declare pronunciation_dict: any;

  @prop({
    type: "str",
    default: "",
    description: "Audio configuration settings"
  })
  declare audio_setting: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const voiceSetting = String(this.voice_setting ?? "");
    const languageBoost = String(this.language_boost ?? "");
    const outputFormat = String(this.output_format ?? "hex");
    const pronunciationDict = String(this.pronunciation_dict ?? "");
    const audioSetting = String(this.audio_setting ?? "");

    const args: Record<string, unknown> = {
      text: text,
      voice_setting: voiceSetting,
      language_boost: languageBoost,
      output_format: outputFormat,
      pronunciation_dict: pronunciationDict,
      audio_setting: audioSetting
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/minimax/speech-02-hd", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class DiaTts extends FalNode {
  static readonly nodeType = "fal.text_to_speech.DiaTts";
  static readonly title = "Dia Tts";
  static readonly description = `Dia directly generates realistic dialogue from transcripts. Audio conditioning enables emotion control. Produces natural nonverbals like laughter and throat clearing.
speech, synthesis, text-to-speech, tts`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description: "The text to be converted to speech."
  })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");

    const args: Record<string, unknown> = {
      text: text
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/dia-tts", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class OrpheusTts extends FalNode {
  static readonly nodeType = "fal.text_to_speech.OrpheusTts";
  static readonly title = "Orpheus Tts";
  static readonly description = `Orpheus TTS is a state-of-the-art, Llama-based Speech-LLM designed for high-quality, empathetic text-to-speech generation. This model has been finetuned to deliver human-level speech synthesis, achieving exceptional clarity, expressiveness, and real-time performances.
speech, synthesis, text-to-speech, tts`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "The text to be converted to speech. You can additionally add the following emotive tags: <laugh>, <chuckle>, <sigh>, <cough>, <sniffle>, <groan>, <yawn>, <gasp>"
  })
  declare text: any;

  @prop({
    type: "enum",
    default: "tara",
    values: ["tara", "leah", "jess", "leo", "dan", "mia", "zac", "zoe"],
    description: "Voice ID for the desired voice."
  })
  declare voice: any;

  @prop({
    type: "float",
    default: 1.2,
    description: "Repetition penalty (>= 1.1 required for stable generations)."
  })
  declare repetition_penalty: any;

  @prop({
    type: "float",
    default: 0.7,
    description: "Temperature for generation (higher = more creative)."
  })
  declare temperature: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const voice = String(this.voice ?? "tara");
    const repetitionPenalty = Number(this.repetition_penalty ?? 1.2);
    const temperature = Number(this.temperature ?? 0.7);

    const args: Record<string, unknown> = {
      text: text,
      voice: voice,
      repetition_penalty: repetitionPenalty,
      temperature: temperature
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/orpheus-tts", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class ElevenlabsTtsTurboV25 extends FalNode {
  static readonly nodeType = "fal.text_to_speech.ElevenlabsTtsTurboV25";
  static readonly title = "Elevenlabs Tts Turbo V25";
  static readonly description = `Generate high-speed text-to-speech audio using ElevenLabs TTS Turbo v2.5.
speech, synthesis, text-to-speech, tts, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio", timestamps: "str" };

  @prop({
    type: "float",
    default: 1,
    description:
      "Speech speed (0.7-1.2). Values below 1.0 slow down the speech, above 1.0 speed it up. Extreme values may affect quality."
  })
  declare speed: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The text that comes after the text of the current request. Can be used to improve the speech's continuity when concatenating together multiple generations or to influence the speech's continuity in the current generation."
  })
  declare next_text: any;

  @prop({
    type: "str",
    default: "",
    description: "The text to convert to speech"
  })
  declare text: any;

  @prop({ type: "float", default: 0, description: "Style exaggeration (0-1)" })
  declare style: any;

  @prop({ type: "float", default: 0.5, description: "Voice stability (0-1)" })
  declare stability: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to return timestamps for each word in the generated speech"
  })
  declare timestamps: any;

  @prop({ type: "float", default: 0.75, description: "Similarity boost (0-1)" })
  declare similarity_boost: any;

  @prop({
    type: "str",
    default: "Rachel",
    description: "The voice to use for speech generation"
  })
  declare voice: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Language code (ISO 639-1) used to enforce a language for the model. An error will be returned if language code is not supported by the model."
  })
  declare language_code: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "on", "off"],
    description:
      "This parameter controls text normalization with three modes: 'auto', 'on', and 'off'. When set to 'auto', the system will automatically decide whether to apply text normalization (e.g., spelling out numbers). With 'on', text normalization will always be applied, while with 'off', it will be skipped."
  })
  declare apply_text_normalization: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The text that came before the text of the current request. Can be used to improve the speech's continuity when concatenating together multiple generations or to influence the speech's continuity in the current generation."
  })
  declare previous_text: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const speed = Number(this.speed ?? 1);
    const nextText = String(this.next_text ?? "");
    const text = String(this.text ?? "");
    const style = Number(this.style ?? 0);
    const stability = Number(this.stability ?? 0.5);
    const timestamps = Boolean(this.timestamps ?? false);
    const similarityBoost = Number(this.similarity_boost ?? 0.75);
    const voice = String(this.voice ?? "Rachel");
    const languageCode = String(this.language_code ?? "");
    const applyTextNormalization = String(
      this.apply_text_normalization ?? "auto"
    );
    const previousText = String(this.previous_text ?? "");

    const args: Record<string, unknown> = {
      speed: speed,
      next_text: nextText,
      text: text,
      style: style,
      stability: stability,
      timestamps: timestamps,
      similarity_boost: similarityBoost,
      voice: voice,
      language_code: languageCode,
      apply_text_normalization: applyTextNormalization,
      previous_text: previousText
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/elevenlabs/tts/turbo-v2.5",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export const FAL_TEXT_TO_SPEECH_NODES: readonly NodeClass[] = [
  Qwen3TtsTextToSpeech17B,
  Qwen3TtsTextToSpeech06B,
  Qwen3TtsVoiceDesign17B,
  Vibevoice05B,
  Maya,
  MinimaxSpeech26Hd,
  MinimaxSpeech26Turbo,
  MayaBatch,
  MayaStream,
  IndexTts2TextToSpeech,
  KlingVideoV1Tts,
  ChatterboxTextToSpeechMultilingual,
  Vibevoice7b,
  Vibevoice,
  MinimaxPreviewSpeech25Hd,
  MinimaxPreviewSpeech25Turbo,
  MinimaxVoiceDesign,
  ResembleAiChatterboxhdTextToSpeech,
  ChatterboxTextToSpeech,
  MinimaxVoiceClone,
  MinimaxSpeech02Turbo,
  MinimaxSpeech02Hd,
  DiaTts,
  OrpheusTts,
  ElevenlabsTtsTurboV25
] as const;
