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

export class ElevenLabs_Flash_V2_5 extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.ElevenLabs_Flash_V2_5";
  static readonly title = "Eleven Labs_ Flash_ V2_5";
  static readonly description = `ElevenLabs's fastest speech synthesis model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "str",
    default: "en",
    description: "Language code (e.g., 'en', 'es', 'fr')"
  })
  declare language_code: any;

  @prop({ type: "str", default: "", description: "Next text for context" })
  declare next_text: any;

  @prop({ type: "str", default: "", description: "Previous text for context" })
  declare previous_text: any;

  @prop({
    type: "str",
    default: "",
    description: "The text to convert to speech"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.75,
    description: "Similarity boost setting (0.0 to 1.0)"
  })
  declare similarity_boost: any;

  @prop({
    type: "float",
    default: 1,
    description: "Speed of speech (0.25 to 4.0)"
  })
  declare speed: any;

  @prop({
    type: "float",
    default: 0.5,
    description: "Stability setting for voice generation (0.0 to 1.0)"
  })
  declare stability: any;

  @prop({
    type: "float",
    default: 0,
    description: "Style exaggeration (0.0 to 1.0)"
  })
  declare style: any;

  @prop({
    type: "enum",
    default: "Rachel",
    values: [
      "Rachel",
      "Drew",
      "Clyde",
      "Paul",
      "Aria",
      "Domi",
      "Dave",
      "Roger",
      "Fin",
      "Sarah",
      "James",
      "Jane",
      "Juniper",
      "Arabella",
      "Hope",
      "Bradford",
      "Reginald",
      "Gaming",
      "Austin",
      "Kuon",
      "Blondie",
      "Priyanka",
      "Alexandra",
      "Monika",
      "Mark",
      "Grimblewood"
    ],
    description: "Voice choice for speech generation"
  })
  declare voice: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const languageCode = String(this.language_code ?? "en");
    const nextText = String(this.next_text ?? "");
    const previousText = String(this.previous_text ?? "");
    const prompt = String(this.prompt ?? "");
    const similarityBoost = Number(this.similarity_boost ?? 0.75);
    const speed = Number(this.speed ?? 1);
    const stability = Number(this.stability ?? 0.5);
    const style = Number(this.style ?? 0);
    const voice = String(this.voice ?? "Rachel");

    const args: Record<string, unknown> = {
      language_code: languageCode,
      next_text: nextText,
      previous_text: previousText,
      prompt: prompt,
      similarity_boost: similarityBoost,
      speed: speed,
      stability: stability,
      style: style,
      voice: voice
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "elevenlabs/flash-v2.5:c9f3ebca6f2a684a2a3487271f640c389597d45c6c474db6b03fb9da0a26a47d",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class ElevenLabs_Turbo_V2_5 extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.ElevenLabs_Turbo_V2_5";
  static readonly title = "Eleven Labs_ Turbo_ V2_5";
  static readonly description = `High quality, low latency text to speech in 32 languages
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "str",
    default: "en",
    description: "Language code (e.g., 'en', 'es', 'fr')"
  })
  declare language_code: any;

  @prop({ type: "str", default: "", description: "Next text for context" })
  declare next_text: any;

  @prop({ type: "str", default: "", description: "Previous text for context" })
  declare previous_text: any;

  @prop({
    type: "str",
    default: "",
    description: "The text to convert to speech"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.75,
    description: "Similarity boost setting (0.0 to 1.0)"
  })
  declare similarity_boost: any;

  @prop({
    type: "float",
    default: 1,
    description: "Speed of speech (0.25 to 4.0)"
  })
  declare speed: any;

  @prop({
    type: "float",
    default: 0.5,
    description: "Stability setting for voice generation (0.0 to 1.0)"
  })
  declare stability: any;

  @prop({
    type: "float",
    default: 0,
    description: "Style exaggeration (0.0 to 1.0)"
  })
  declare style: any;

  @prop({
    type: "enum",
    default: "Rachel",
    values: [
      "Rachel",
      "Drew",
      "Clyde",
      "Paul",
      "Aria",
      "Domi",
      "Dave",
      "Roger",
      "Fin",
      "Sarah",
      "James",
      "Jane",
      "Juniper",
      "Arabella",
      "Hope",
      "Bradford",
      "Reginald",
      "Gaming",
      "Austin",
      "Kuon",
      "Blondie",
      "Priyanka",
      "Alexandra",
      "Monika",
      "Mark",
      "Grimblewood"
    ],
    description: "Voice choice for speech generation"
  })
  declare voice: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const languageCode = String(this.language_code ?? "en");
    const nextText = String(this.next_text ?? "");
    const previousText = String(this.previous_text ?? "");
    const prompt = String(this.prompt ?? "");
    const similarityBoost = Number(this.similarity_boost ?? 0.75);
    const speed = Number(this.speed ?? 1);
    const stability = Number(this.stability ?? 0.5);
    const style = Number(this.style ?? 0);
    const voice = String(this.voice ?? "Rachel");

    const args: Record<string, unknown> = {
      language_code: languageCode,
      next_text: nextText,
      previous_text: previousText,
      prompt: prompt,
      similarity_boost: similarityBoost,
      speed: speed,
      stability: stability,
      style: style,
      voice: voice
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "elevenlabs/turbo-v2.5:bdab64445fa0fb0ade1c2ae20d00f3024104afe3ff8b4572fc487de30fb24bf0",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class ElevenLabs_V2_Multilingual extends ReplicateNode {
  static readonly nodeType =
    "replicate.audio.speech.ElevenLabs_V2_Multilingual";
  static readonly title = "Eleven Labs_ V2_ Multilingual";
  static readonly description = `Generate multilingual text-to-speech audio in over 30 languages
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "str",
    default: "en",
    description: "Language code (e.g., 'en', 'es', 'fr')"
  })
  declare language_code: any;

  @prop({ type: "str", default: "", description: "Next text for context" })
  declare next_text: any;

  @prop({ type: "str", default: "", description: "Previous text for context" })
  declare previous_text: any;

  @prop({
    type: "str",
    default: "",
    description: "The text to convert to speech"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.75,
    description: "Similarity boost setting (0.0 to 1.0)"
  })
  declare similarity_boost: any;

  @prop({
    type: "float",
    default: 1,
    description: "Speed of speech (0.25 to 4.0)"
  })
  declare speed: any;

  @prop({
    type: "float",
    default: 0.5,
    description: "Stability setting for voice generation (0.0 to 1.0)"
  })
  declare stability: any;

  @prop({
    type: "float",
    default: 0,
    description: "Style exaggeration (0.0 to 1.0)"
  })
  declare style: any;

  @prop({
    type: "enum",
    default: "Rachel",
    values: [
      "Rachel",
      "Drew",
      "Clyde",
      "Paul",
      "Aria",
      "Domi",
      "Dave",
      "Roger",
      "Fin",
      "Sarah",
      "James",
      "Jane",
      "Juniper",
      "Arabella",
      "Hope",
      "Bradford",
      "Reginald",
      "Gaming",
      "Austin",
      "Kuon",
      "Blondie",
      "Priyanka",
      "Alexandra",
      "Monika",
      "Mark",
      "Grimblewood"
    ],
    description: "Voice choice for speech generation"
  })
  declare voice: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const languageCode = String(this.language_code ?? "en");
    const nextText = String(this.next_text ?? "");
    const previousText = String(this.previous_text ?? "");
    const prompt = String(this.prompt ?? "");
    const similarityBoost = Number(this.similarity_boost ?? 0.75);
    const speed = Number(this.speed ?? 1);
    const stability = Number(this.stability ?? 0.5);
    const style = Number(this.style ?? 0);
    const voice = String(this.voice ?? "Rachel");

    const args: Record<string, unknown> = {
      language_code: languageCode,
      next_text: nextText,
      previous_text: previousText,
      prompt: prompt,
      similarity_boost: similarityBoost,
      speed: speed,
      stability: stability,
      style: style,
      voice: voice
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "elevenlabs/v2-multilingual:cc1c55e63c927e79a35f5807accbf172051f2b21effe1db532cf8c907cc68d57",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class ElevenLabs_V3 extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.ElevenLabs_V3";
  static readonly title = "Eleven Labs_ V3";
  static readonly description = `The most expressive Text to Speech model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "str",
    default: "en",
    description: "Language code (e.g., 'en', 'es', 'fr')"
  })
  declare language_code: any;

  @prop({ type: "str", default: "", description: "Next text for context" })
  declare next_text: any;

  @prop({ type: "str", default: "", description: "Previous text for context" })
  declare previous_text: any;

  @prop({
    type: "str",
    default: "",
    description: "The text to convert to speech"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.75,
    description: "Similarity boost setting (0.0 to 1.0)"
  })
  declare similarity_boost: any;

  @prop({
    type: "float",
    default: 1,
    description: "Speed of speech (0.25 to 4.0)"
  })
  declare speed: any;

  @prop({
    type: "float",
    default: 0.5,
    description: "Stability setting for voice generation (0.0 to 1.0)"
  })
  declare stability: any;

  @prop({
    type: "float",
    default: 0,
    description: "Style exaggeration (0.0 to 1.0)"
  })
  declare style: any;

  @prop({
    type: "enum",
    default: "Rachel",
    values: [
      "Rachel",
      "Drew",
      "Clyde",
      "Paul",
      "Aria",
      "Domi",
      "Dave",
      "Roger",
      "Fin",
      "Sarah",
      "James",
      "Jane",
      "Juniper",
      "Arabella",
      "Hope",
      "Bradford",
      "Reginald",
      "Gaming",
      "Austin",
      "Kuon",
      "Blondie",
      "Priyanka",
      "Alexandra",
      "Monika",
      "Mark",
      "Grimblewood"
    ],
    description: "Voice choice for speech generation"
  })
  declare voice: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const languageCode = String(this.language_code ?? "en");
    const nextText = String(this.next_text ?? "");
    const previousText = String(this.previous_text ?? "");
    const prompt = String(this.prompt ?? "");
    const similarityBoost = Number(this.similarity_boost ?? 0.75);
    const speed = Number(this.speed ?? 1);
    const stability = Number(this.stability ?? 0.5);
    const style = Number(this.style ?? 0);
    const voice = String(this.voice ?? "Rachel");

    const args: Record<string, unknown> = {
      language_code: languageCode,
      next_text: nextText,
      previous_text: previousText,
      prompt: prompt,
      similarity_boost: similarityBoost,
      speed: speed,
      stability: stability,
      style: style,
      voice: voice
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "elevenlabs/v3:7611845fe3de62dc322513b8bdc81b785cb730417a015093f6356f2a89fa3e73",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class ElevenLabs_Music extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.ElevenLabs_Music";
  static readonly title = "Eleven Labs_ Music";
  static readonly description = `Compose a song from a prompt or a composition plan
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "bool",
    default: true,
    description: "If true, removes vocal elements from the generated music"
  })
  declare force_instrumental: any;

  @prop({
    type: "int",
    default: 10000,
    description:
      "Target duration of the music in milliseconds (optional, defaults to ~10 seconds)"
  })
  declare music_length_ms: any;

  @prop({
    type: "enum",
    default: "mp3_standard",
    values: [
      "mp3_standard",
      "mp3_high_quality",
      "wav_16khz",
      "wav_22khz",
      "wav_24khz",
      "wav_cd_quality"
    ],
    description:
      "Audio output format: mp3_standard (128kbps MP3, balanced quality/size), mp3_high_quality (192kbps MP3, higher quality), wav_16khz (16kHz WAV, good for voice), wav_22khz (22kHz WAV), wav_24khz (24kHz WAV), wav_cd_quality (44.1kHz WAV, uncompressed CD quality)"
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "Description of the music you want to generate"
  })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const forceInstrumental = Boolean(this.force_instrumental ?? true);
    const musicLengthMs = Number(this.music_length_ms ?? 10000);
    const outputFormat = String(this.output_format ?? "mp3_standard");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      force_instrumental: forceInstrumental,
      music_length_ms: musicLengthMs,
      output_format: outputFormat,
      prompt: prompt
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "elevenlabs/music:66fa53d463ca3a0fd826c06b5b44804b32f74185c0c905162bb052c3a60a39fa",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Inworld_TTS_Max extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Inworld_TTS_Max";
  static readonly title = "Inworld_ T T S_ Max";
  static readonly description = `Highest-quality text-to-speech with <200ms latency, emotion control, and 15-language support
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "enum",
    default: "mp3",
    values: ["mp3", "wav", "ogg_opus", "flac"],
    description: "Output audio format."
  })
  declare audio_format: any;

  @prop({
    type: "enum",
    default: 48000,
    values: ["8000", "16000", "22050", "24000", "32000", "44100", "48000"],
    description: "Audio sample rate in Hz."
  })
  declare sample_rate: any;

  @prop({
    type: "float",
    default: 0,
    description: "Speaking speed multiplier. Set to 0 for normal speed (1.0)."
  })
  declare speaking_rate: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Controls randomness when generating audio. Higher values produce more expressive results, lower values are more deterministic."
  })
  declare temperature: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The text to convert to speech. Maximum 2,000 characters. Supports SSML break tags for pauses (e.g. '<break time=\"1s\" />'), emotion markups (e.g. '[happy]', '[sad]'), and non-verbal vocalizations (e.g. '[laugh]', '[sigh]')."
  })
  declare text: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "on", "off"],
    description:
      "Controls whether numbers, dates, and abbreviations are expanded before synthesis. 'auto' lets the model decide, 'on' always normalizes, 'off' reads text as-is."
  })
  declare text_normalization: any;

  @prop({
    type: "str",
    default: "Ashley",
    description:
      "The voice to use. Use a preset voice name (e.g. 'Ashley', 'Dennis', 'Alex') or a custom cloned voice ID."
  })
  declare voice_id: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const audioFormat = String(this.audio_format ?? "mp3");
    const sampleRate = String(this.sample_rate ?? 48000);
    const speakingRate = Number(this.speaking_rate ?? 0);
    const temperature = Number(this.temperature ?? 1);
    const text = String(this.text ?? "");
    const textNormalization = String(this.text_normalization ?? "auto");
    const voiceId = String(this.voice_id ?? "Ashley");

    const args: Record<string, unknown> = {
      audio_format: audioFormat,
      sample_rate: sampleRate,
      speaking_rate: speakingRate,
      temperature: temperature,
      text: text,
      text_normalization: textNormalization,
      voice_id: voiceId
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "inworld/tts-1.5-max:cd3daef10bdf2569116cfc09be2a8d3c686622ad9c45bd7e072eea8232c1075a",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Inworld_TTS_Mini extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Inworld_TTS_Mini";
  static readonly title = "Inworld_ T T S_ Mini";
  static readonly description = `Ultra-fast, cost-efficient text-to-speech with ~120ms latency and 15-language support
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "enum",
    default: "mp3",
    values: ["mp3", "wav", "ogg_opus", "flac"],
    description: "Output audio format."
  })
  declare audio_format: any;

  @prop({
    type: "enum",
    default: 48000,
    values: ["8000", "16000", "22050", "24000", "32000", "44100", "48000"],
    description: "Audio sample rate in Hz."
  })
  declare sample_rate: any;

  @prop({
    type: "float",
    default: 0,
    description: "Speaking speed multiplier. Set to 0 for normal speed (1.0)."
  })
  declare speaking_rate: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Controls randomness when generating audio. Higher values produce more expressive results, lower values are more deterministic."
  })
  declare temperature: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The text to convert to speech. Maximum 2,000 characters. Supports SSML break tags for pauses (e.g. '<break time=\"1s\" />'), emotion markups (e.g. '[happy]', '[sad]'), and non-verbal vocalizations (e.g. '[laugh]', '[sigh]')."
  })
  declare text: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "on", "off"],
    description:
      "Controls whether numbers, dates, and abbreviations are expanded before synthesis. 'auto' lets the model decide, 'on' always normalizes, 'off' reads text as-is."
  })
  declare text_normalization: any;

  @prop({
    type: "str",
    default: "Ashley",
    description:
      "The voice to use. Use a preset voice name (e.g. 'Ashley', 'Dennis', 'Alex') or a custom cloned voice ID."
  })
  declare voice_id: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const audioFormat = String(this.audio_format ?? "mp3");
    const sampleRate = String(this.sample_rate ?? 48000);
    const speakingRate = Number(this.speaking_rate ?? 0);
    const temperature = Number(this.temperature ?? 1);
    const text = String(this.text ?? "");
    const textNormalization = String(this.text_normalization ?? "auto");
    const voiceId = String(this.voice_id ?? "Ashley");

    const args: Record<string, unknown> = {
      audio_format: audioFormat,
      sample_rate: sampleRate,
      speaking_rate: speakingRate,
      temperature: temperature,
      text: text,
      text_normalization: textNormalization,
      voice_id: voiceId
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "inworld/tts-1.5-mini:69d70021ccd22bb05789f356e0a60992124384ab9692640e25dc74fe6718c104",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Kokoro_82M extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Kokoro_82M";
  static readonly title = "Kokoro_82 M";
  static readonly description = `Kokoro v1.0 - text-to-speech (82M params, based on StyleTTS2)
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "float",
    default: 1,
    description:
      "Speech speed multiplier (0.5 = half speed, 2.0 = double speed)"
  })
  declare speed: any;

  @prop({
    type: "str",
    default: "",
    description: "Text input (long text is automatically split)"
  })
  declare text: any;

  @prop({
    type: "enum",
    default: "af_bella",
    values: [
      "af_alloy",
      "af_aoede",
      "af_bella",
      "af_jessica",
      "af_kore",
      "af_nicole",
      "af_nova",
      "af_river",
      "af_sarah",
      "af_sky",
      "am_adam",
      "am_echo",
      "am_eric",
      "am_fenrir",
      "am_liam",
      "am_michael",
      "am_onyx",
      "am_puck",
      "bf_alice",
      "bf_emma",
      "bf_isabella",
      "bf_lily",
      "bm_daniel",
      "bm_fable",
      "bm_george",
      "bm_lewis",
      "ff_siwis",
      "hf_alpha",
      "hf_beta",
      "hm_omega",
      "hm_psi",
      "if_sara",
      "im_nicola",
      "jf_alpha",
      "jf_gongitsune",
      "jf_nezumi",
      "jf_tebukuro",
      "jm_kumo",
      "zf_xiaobei",
      "zf_xiaoni",
      "zf_xiaoxiao",
      "zf_xiaoyi",
      "zm_yunjian",
      "zm_yunxi",
      "zm_yunxia",
      "zm_yunyang"
    ],
    description: "Voice to use for synthesis"
  })
  declare voice: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const speed = Number(this.speed ?? 1);
    const text = String(this.text ?? "");
    const voice = String(this.voice ?? "af_bella");

    const args: Record<string, unknown> = {
      speed: speed,
      text: text,
      voice: voice
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "jaaari/kokoro-82m:f559560eb822dc509045f3921a1921234918b91739db4bf3daab2169b71c7a13",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class XTTS_V2 extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.XTTS_V2";
  static readonly title = "X T T S_ V2";
  static readonly description = `Coqui XTTS-v2: Multilingual Text To Speech Voice Cloning
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to apply denoising to the speaker audio (microphone recordings)"
  })
  declare cleanup_voice: any;

  @prop({
    type: "enum",
    default: "en",
    values: [
      "en",
      "es",
      "fr",
      "de",
      "it",
      "pt",
      "pl",
      "tr",
      "ru",
      "nl",
      "cs",
      "ar",
      "zh",
      "hu",
      "ko",
      "hi"
    ],
    description: "Output language for the synthesised speech"
  })
  declare language: any;

  @prop({
    type: "image",
    default: "",
    description: "Original speaker audio (wav, mp3, m4a, ogg, or flv)"
  })
  declare speaker: any;

  @prop({
    type: "str",
    default:
      "Hi there, I'm your new voice clone. Try your best to upload quality audio",
    description: "Text to synthesize"
  })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const cleanupVoice = Boolean(this.cleanup_voice ?? false);
    const language = String(this.language ?? "en");
    const text = String(
      this.text ??
        "Hi there, I'm your new voice clone. Try your best to upload quality audio"
    );

    const args: Record<string, unknown> = {
      cleanup_voice: cleanupVoice,
      language: language,
      text: text
    };

    const speakerRef = this.speaker as Record<string, unknown> | undefined;
    if (isRefSet(speakerRef)) {
      const speakerUrl = await assetToUrl(speakerRef!, apiKey);
      if (speakerUrl) args["speaker"] = speakerUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Orpheus_3B extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Orpheus_3B";
  static readonly title = "Orpheus_3 B";
  static readonly description = `Orpheus 3B - high quality, emotive Text to Speech
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "int",
    default: 1200,
    description: "Maximum number of tokens to generate"
  })
  declare max_new_tokens: any;

  @prop({ type: "float", default: 1.1, description: "Repetition penalty" })
  declare repetition_penalty: any;

  @prop({
    type: "float",
    default: 0.6,
    description: "Temperature for generation"
  })
  declare temperature: any;

  @prop({ type: "str", default: "", description: "Text to convert to speech" })
  declare text: any;

  @prop({
    type: "float",
    default: 0.95,
    description: "Top P for nucleus sampling"
  })
  declare top_p: any;

  @prop({
    type: "enum",
    default: "tara",
    values: ["tara", "dan", "josh", "emma"],
    description: "Voice to use"
  })
  declare voice: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxNewTokens = Number(this.max_new_tokens ?? 1200);
    const repetitionPenalty = Number(this.repetition_penalty ?? 1.1);
    const temperature = Number(this.temperature ?? 0.6);
    const text = String(this.text ?? "");
    const topP = Number(this.top_p ?? 0.95);
    const voice = String(this.voice ?? "tara");

    const args: Record<string, unknown> = {
      max_new_tokens: maxNewTokens,
      repetition_penalty: repetitionPenalty,
      temperature: temperature,
      text: text,
      top_p: topP,
      voice: voice
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class CSM_1B extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.CSM_1B";
  static readonly title = "C S M_1 B";
  static readonly description = `CSM (Conversational Speech Model) is a speech generation model from Sesame that generates RVQ audio codes from text and audio inputs
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "int",
    default: 10000,
    description: "Maximum audio length in milliseconds"
  })
  declare max_audio_length_ms: any;

  @prop({
    type: "enum",
    default: 0,
    values: ["0", "1"],
    description: "Speaker ID (0 or 1)"
  })
  declare speaker: any;

  @prop({
    type: "str",
    default: "Hello from Sesame.",
    description: "Text to convert to speech"
  })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxAudioLengthMs = Number(this.max_audio_length_ms ?? 10000);
    const speaker = String(this.speaker ?? 0);
    const text = String(this.text ?? "Hello from Sesame.");

    const args: Record<string, unknown> = {
      max_audio_length_ms: maxAudioLengthMs,
      speaker: speaker,
      text: text
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/csm-1b:3e59b10a9894c54ae5f2fc0347e3a2f5c82f0574407e53a7d9f76ec7c502ad03",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Parler_TTS extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Parler_TTS";
  static readonly title = "Parler_ T T S";
  static readonly description = `lightweight text-to-speech (TTS) model, trained on 10.5K hours of audio data
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "str",
    default:
      "A female speaker with a slightly low-pitched voice delivers her words quite expressively, in a very confined sounding environment with clear audio quality. She speaks very fast.",
    description: "Provide description of the output audio"
  })
  declare description: any;

  @prop({
    type: "str",
    default: "Hey, how are you doing today?",
    description: "Text for audio generation"
  })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const description = String(
      this.description ??
        "A female speaker with a slightly low-pitched voice delivers her words quite expressively, in a very confined sounding environment with clear audio quality. She speaks very fast."
    );
    const prompt = String(this.prompt ?? "Hey, how are you doing today?");

    const args: Record<string, unknown> = {
      description: description,
      prompt: prompt
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "cjwbw/parler-tts:bf38249a8cc143b97b5108570d1c81b8321881dd91fe7837877e7dfa3a0fad27",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class VoiceCraft extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.VoiceCraft";
  static readonly title = "Voice Craft";
  static readonly description = `Zero-Shot Speech Editing and Text-to-Speech in the Wild
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "float",
    default: 3.01,
    description:
      "Only used for for zero-shot text-to-speech task. The first seconds of the original audio that are used for zero-shot text-to-speech. 3 sec of reference is generally enough for high quality voice cloning, but longer is generally better, try e.g. 3~6 sec"
  })
  declare cut_off_sec: any;

  @prop({
    type: "enum",
    default: 1,
    values: ["0", "1"],
    description: "Set to 0 to use less VRAM, but with slower inference"
  })
  declare kvcache: any;

  @prop({
    type: "float",
    default: 0.08,
    description: "Margin to the left of the editing segment"
  })
  declare left_margin: any;

  @prop({ type: "audio", default: "", description: "Original audio file" })
  declare orig_audio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optionally provide the transcript of the input audio. Leave it blank to use the WhisperX model below to generate the transcript. Inaccurate transcription may lead to error TTS or speech editing"
  })
  declare orig_transcript: any;

  @prop({
    type: "float",
    default: 0.08,
    description: "Margin to the right of the editing segment"
  })
  declare right_margin: any;

  @prop({
    type: "int",
    default: 4,
    description:
      "Default value for TTS is 4, and 1 for speech editing. The higher the number, the faster the output will be. Under the hood, the model will generate this many samples and choose the shortest one"
  })
  declare sample_batch_size: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 3,
    description:
      "Default value for TTS is 3, and -1 for speech editing. -1 means do not adjust prob of silence tokens. if there are long silence or unnaturally stretched words, increase sample_batch_size to 2, 3 or even 4"
  })
  declare stop_repetition: any;

  @prop({
    type: "str",
    default: "",
    description: "Transcript of the target audio file"
  })
  declare target_transcript: any;

  @prop({
    type: "enum",
    default: "zero-shot text-to-speech",
    values: [
      "speech_editing-substitution",
      "speech_editing-insertion",
      "speech_editing-deletion",
      "zero-shot text-to-speech"
    ],
    description: "Choose a task"
  })
  declare task: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic. Do not recommend to change"
  })
  declare temperature: any;

  @prop({
    type: "float",
    default: 0.9,
    description: "Default value for TTS is 0.9, and 0.8 for speech editing"
  })
  declare top_p: any;

  @prop({
    type: "enum",
    default: "giga330M_TTSEnhanced.pth",
    values: ["giga830M.pth", "giga330M.pth", "giga330M_TTSEnhanced.pth"],
    description: "Choose a model"
  })
  declare voicecraft_model: any;

  @prop({
    type: "enum",
    default: "base.en",
    values: ["base.en", "small.en", "medium.en"],
    description:
      "If orig_transcript is not provided above, choose a WhisperX model for generating the transcript. Inaccurate transcription may lead to error TTS or speech editing. You can modify the generated transcript and provide it directly to orig_transcript above"
  })
  declare whisperx_model: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const cutOffSec = Number(this.cut_off_sec ?? 3.01);
    const kvcache = String(this.kvcache ?? 1);
    const leftMargin = Number(this.left_margin ?? 0.08);
    const origTranscript = String(this.orig_transcript ?? "");
    const rightMargin = Number(this.right_margin ?? 0.08);
    const sampleBatchSize = Number(this.sample_batch_size ?? 4);
    const seed = Number(this.seed ?? -1);
    const stopRepetition = Number(this.stop_repetition ?? 3);
    const targetTranscript = String(this.target_transcript ?? "");
    const task = String(this.task ?? "zero-shot text-to-speech");
    const temperature = Number(this.temperature ?? 1);
    const topP = Number(this.top_p ?? 0.9);
    const voicecraftModel = String(
      this.voicecraft_model ?? "giga330M_TTSEnhanced.pth"
    );
    const whisperxModel = String(this.whisperx_model ?? "base.en");

    const args: Record<string, unknown> = {
      cut_off_sec: cutOffSec,
      kvcache: kvcache,
      left_margin: leftMargin,
      orig_transcript: origTranscript,
      right_margin: rightMargin,
      sample_batch_size: sampleBatchSize,
      seed: seed,
      stop_repetition: stopRepetition,
      target_transcript: targetTranscript,
      task: task,
      temperature: temperature,
      top_p: topP,
      voicecraft_model: voicecraftModel,
      whisperx_model: whisperxModel
    };

    const origAudioRef = this.orig_audio as Record<string, unknown> | undefined;
    if (isRefSet(origAudioRef)) {
      const origAudioUrl = await assetToUrl(origAudioRef!, apiKey);
      if (origAudioUrl) args["orig_audio"] = origAudioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "cjwbw/voicecraft:db97f6312d4c4d20e500e47fd95d8f14b00d8d28e046834faffb7999d83b6b30",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class OpenVoice extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.OpenVoice";
  static readonly title = "Open Voice";
  static readonly description = `Updated to OpenVoice v2: Versatile Instant Voice Cloning
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({ type: "audio", default: "", description: "Input reference audio" })
  declare audio: any;

  @prop({
    type: "enum",
    default: "EN_NEWEST",
    values: ["EN_NEWEST", "EN", "ES", "FR", "ZH", "JP", "KR"],
    description: "The language of the audio to be generated"
  })
  declare language: any;

  @prop({
    type: "float",
    default: 1,
    description: "Set speed scale of the output audio"
  })
  declare speed: any;

  @prop({
    type: "str",
    default: "Did you ever hear a folk tale about a giant turtle?",
    description: "Input text"
  })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const language = String(this.language ?? "EN_NEWEST");
    const speed = Number(this.speed ?? 1);
    const text = String(
      this.text ?? "Did you ever hear a folk tale about a giant turtle?"
    );

    const args: Record<string, unknown> = {
      language: language,
      speed: speed,
      text: text
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "chenxwh/openvoice:d548923c9d7fc9330a3b7c7f9e2f91b2ee90c83311a351dfcd32af353799223d",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class F5_TTS extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.F5_TTS";
  static readonly title = "F5_ T T S";
  static readonly description = `F5-TTS, the new state-of-the-art in open source voice cloning
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "str",
    default: "",
    description: "Custom split words, comma separated"
  })
  declare custom_split_words: any;

  @prop({ type: "str", default: "", description: "Text to Generate" })
  declare gen_text: any;

  @prop({
    type: "audio",
    default: "",
    description: "Reference audio for voice cloning"
  })
  declare ref_audio: any;

  @prop({ type: "str", default: "", description: "Reference Text" })
  declare ref_text: any;

  @prop({
    type: "bool",
    default: true,
    description: "Automatically remove silences?"
  })
  declare remove_silence: any;

  @prop({
    type: "float",
    default: 1,
    description: "Speed of the generated audio"
  })
  declare speed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const customSplitWords = String(this.custom_split_words ?? "");
    const genText = String(this.gen_text ?? "");
    const refText = String(this.ref_text ?? "");
    const removeSilence = Boolean(this.remove_silence ?? true);
    const speed = Number(this.speed ?? 1);

    const args: Record<string, unknown> = {
      custom_split_words: customSplitWords,
      gen_text: genText,
      ref_text: refText,
      remove_silence: removeSilence,
      speed: speed
    };

    const refAudioRef = this.ref_audio as Record<string, unknown> | undefined;
    if (isRefSet(refAudioRef)) {
      const refAudioUrl = await assetToUrl(refAudioRef!, apiKey);
      if (refAudioUrl) args["ref_audio"] = refAudioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "x-lance/f5-tts:87faf6dd7a692dd82043f662e76369cab126a2cf1937e25a9d41e0b834fd230e",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Spanish_F5_TTS extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Spanish_F5_TTS";
  static readonly title = "Spanish_ F5_ T T S";
  static readonly description = `A F5-TTS fine-tuned for Spanish
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "str",
    default: "",
    description: "Custom split words, comma separated"
  })
  declare custom_split_words: any;

  @prop({ type: "str", default: "", description: "Text to Generate" })
  declare gen_text: any;

  @prop({
    type: "audio",
    default: "",
    description: "Reference audio for voice cloning"
  })
  declare ref_audio: any;

  @prop({ type: "str", default: "", description: "Reference Text" })
  declare ref_text: any;

  @prop({
    type: "bool",
    default: true,
    description: "Automatically remove silences?"
  })
  declare remove_silence: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const customSplitWords = String(this.custom_split_words ?? "");
    const genText = String(this.gen_text ?? "");
    const refText = String(this.ref_text ?? "");
    const removeSilence = Boolean(this.remove_silence ?? true);

    const args: Record<string, unknown> = {
      custom_split_words: customSplitWords,
      gen_text: genText,
      ref_text: refText,
      remove_silence: removeSilence
    };

    const refAudioRef = this.ref_audio as Record<string, unknown> | undefined;
    if (isRefSet(refAudioRef)) {
      const refAudioUrl = await assetToUrl(refAudioRef!, apiKey);
      if (refAudioUrl) args["ref_audio"] = refAudioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "fermatresearch/spanish-f5-tts:f26405b801a0b0945679fb3adf9bbca7ab8559c7fd9cf7cd2a68067c3aab83f7",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Qwen3_TTS extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Qwen3_TTS";
  static readonly title = "Qwen3_ T T S";
  static readonly description = `A unified Text-to-Speech demo featuring three powerful modes: Voice, Clone and Design
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "enum",
    default: "auto",
    values: [
      "auto",
      "Chinese",
      "English",
      "Japanese",
      "Korean",
      "French",
      "German",
      "Spanish",
      "Portuguese",
      "Russian"
    ],
    description: "Language of the text (use 'auto' for automatic detection)"
  })
  declare language: any;

  @prop({
    type: "enum",
    default: "custom_voice",
    values: ["custom_voice", "voice_clone", "voice_design"],
    description:
      "TTS mode: 'custom_voice' uses preset speakers, 'voice_clone' clones from reference audio, 'voice_design' creates voice from description"
  })
  declare mode: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "Reference audio file for voice cloning (only for 'voice_clone' mode)"
  })
  declare reference_audio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Transcript of the reference audio (recommended for 'voice_clone' mode)"
  })
  declare reference_text: any;

  @prop({
    type: "enum",
    default: "Serena",
    values: [
      "Aiden",
      "Dylan",
      "Eric",
      "Ono_anna",
      "Ryan",
      "Serena",
      "Sohee",
      "Uncle_fu",
      "Vivian"
    ],
    description: "Preset speaker voice (only for 'custom_voice' mode)"
  })
  declare speaker: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional style/emotion instruction (e.g., 'speak slowly and calmly', 'excited tone')"
  })
  declare style_instruction: any;

  @prop({
    type: "str",
    default: "",
    description: "Text to synthesize into speech"
  })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Natural language description of desired voice (only for 'voice_design' mode). Example: 'A warm, friendly female voice with a slight British accent'"
  })
  declare voice_description: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const language = String(this.language ?? "auto");
    const mode = String(this.mode ?? "custom_voice");
    const referenceText = String(this.reference_text ?? "");
    const speaker = String(this.speaker ?? "Serena");
    const styleInstruction = String(this.style_instruction ?? "");
    const text = String(this.text ?? "");
    const voiceDescription = String(this.voice_description ?? "");

    const args: Record<string, unknown> = {
      language: language,
      mode: mode,
      reference_text: referenceText,
      speaker: speaker,
      style_instruction: styleInstruction,
      text: text,
      voice_description: voiceDescription
    };

    const referenceAudioRef = this.reference_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceAudioRef)) {
      const referenceAudioUrl = await assetToUrl(referenceAudioRef!, apiKey);
      if (referenceAudioUrl) args["reference_audio"] = referenceAudioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "qwen/qwen3-tts:501be1210291d541fb5656bbe4808e6290470741029a34004f19e20f6d2365e8",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Chatterbox extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Chatterbox";
  static readonly title = "Chatterbox";
  static readonly description = `Generate expressive, natural speech. Features unique emotion control, instant voice cloning from short audio, and built-in watermarking.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "audio",
    default: "",
    description: "Path to the reference audio file (Optional)"
  })
  declare audio_prompt: any;

  @prop({ type: "float", default: 0.5, description: "CFG/Pace weight" })
  declare cfg_weight: any;

  @prop({
    type: "float",
    default: 0.5,
    description: "Exaggeration (Neutral = 0.5, extreme values can be unstable)"
  })
  declare exaggeration: any;

  @prop({ type: "str", default: "", description: "Text to synthesize" })
  declare prompt: any;

  @prop({ type: "int", default: 0, description: "Seed (0 for random)" })
  declare seed: any;

  @prop({ type: "float", default: 0.8, description: "Temperature" })
  declare temperature: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const cfgWeight = Number(this.cfg_weight ?? 0.5);
    const exaggeration = Number(this.exaggeration ?? 0.5);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? 0);
    const temperature = Number(this.temperature ?? 0.8);

    const args: Record<string, unknown> = {
      cfg_weight: cfgWeight,
      exaggeration: exaggeration,
      prompt: prompt,
      seed: seed,
      temperature: temperature
    };

    const audioPromptRef = this.audio_prompt as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(audioPromptRef)) {
      const audioPromptUrl = await assetToUrl(audioPromptRef!, apiKey);
      if (audioPromptUrl) args["audio_prompt"] = audioPromptUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "resemble-ai/chatterbox:1b8422bc49635c20d0a84e387ed20879c0dd09254ecdb4e75dc4bec10ff94e97",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Chatterbox_Multilingual extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Chatterbox_Multilingual";
  static readonly title = "Chatterbox_ Multilingual";
  static readonly description = `Generate expressive, natural speech in 23 languages. Features instant voice cloning from short audio, emotion control, and seamless cross-language voice transfer.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "float",
    default: 0.5,
    description:
      "CFG/Pace weight controlling generation guidance (0.2-1.0). Use 0.5 for balanced results, 0 for language transfer"
  })
  declare cfg_weight: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Controls speech expressiveness (0.25-2.0, neutral=0.5, extreme values may be unstable)"
  })
  declare exaggeration: any;

  @prop({
    type: "enum",
    default: "en",
    values: [
      "ar",
      "da",
      "de",
      "el",
      "en",
      "es",
      "fi",
      "fr",
      "he",
      "hi",
      "it",
      "ja",
      "ko",
      "ms",
      "nl",
      "no",
      "pl",
      "pt",
      "ru",
      "sv",
      "sw",
      "tr",
      "zh"
    ],
    description: "Language for synthesis"
  })
  declare language: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "Reference audio file for voice cloning (optional). If not provided, uses default voice for the selected language."
  })
  declare reference_audio: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Random seed for reproducible results (0 for random generation)"
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Controls randomness in generation (0.05-5.0, higher=more varied)"
  })
  declare temperature: any;

  @prop({
    type: "str",
    default: "",
    description: "Text to synthesize into speech (maximum 300 characters)"
  })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const cfgWeight = Number(this.cfg_weight ?? 0.5);
    const exaggeration = Number(this.exaggeration ?? 0.5);
    const language = String(this.language ?? "en");
    const seed = Number(this.seed ?? 0);
    const temperature = Number(this.temperature ?? 0.8);
    const text = String(this.text ?? "");

    const args: Record<string, unknown> = {
      cfg_weight: cfgWeight,
      exaggeration: exaggeration,
      language: language,
      seed: seed,
      temperature: temperature,
      text: text
    };

    const referenceAudioRef = this.reference_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceAudioRef)) {
      const referenceAudioUrl = await assetToUrl(referenceAudioRef!, apiKey);
      if (referenceAudioUrl) args["reference_audio"] = referenceAudioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "resemble-ai/chatterbox-multilingual:9cfba4c265e685f840612be835424f8c33bdee685d7466ece7684b0d9d4c0b1c",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Chatterbox_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Chatterbox_Pro";
  static readonly title = "Chatterbox_ Pro";
  static readonly description = `Generate expressive, natural speech with Resemble AI's Chatterbox.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "The uuid of the voice to use (this overrides the voice selection)"
  })
  declare custom_voice: any;

  @prop({
    type: "float",
    default: 0.5,
    description: "Exaggeration (Neutral = 0.5, extreme values can be unstable)"
  })
  declare exaggeration: any;

  @prop({
    type: "enum",
    default: "medium",
    values: ["x-low", "low", "medium", "high", "x-high"],
    description: "Pitch"
  })
  declare pitch: any;

  @prop({ type: "str", default: "", description: "Text to synthesize" })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({ type: "float", default: 0.8, description: "Temperature" })
  declare temperature: any;

  @prop({
    type: "enum",
    default: "Luna",
    values: [
      "Luna",
      "Ember",
      "Hem",
      "Aurora",
      "Cliff",
      "Josh",
      "William (Whispering)",
      "Orion",
      "Ken"
    ],
    description: "Choose a predefined voice"
  })
  declare voice: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const customVoice = String(this.custom_voice ?? "");
    const exaggeration = Number(this.exaggeration ?? 0.5);
    const pitch = String(this.pitch ?? "medium");
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const temperature = Number(this.temperature ?? 0.8);
    const voice = String(this.voice ?? "Luna");

    const args: Record<string, unknown> = {
      custom_voice: customVoice,
      exaggeration: exaggeration,
      pitch: pitch,
      prompt: prompt,
      seed: seed,
      temperature: temperature,
      voice: voice
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "resemble-ai/chatterbox-pro:301e12652e84fbba1524e5f2758a9a92c6bd205792304f53c057b7f9ab091342",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Chatterbox_Turbo extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Chatterbox_Turbo";
  static readonly title = "Chatterbox_ Turbo";
  static readonly description = `The fastest open source TTS model without sacrificing quality.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "audio",
    default: "",
    description:
      "Reference audio file for voice cloning (optional). Must be longer than 5 seconds. If provided, overrides the voice selection."
  })
  declare reference_audio: any;

  @prop({
    type: "float",
    default: 1.2,
    description: "Penalizes token repetition. Higher values reduce repetition."
  })
  declare repetition_penalty: any;

  @prop({
    type: "int",
    default: -1,
    description:
      "Random seed for reproducible results. Leave blank for random generation."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Controls randomness in generation. Higher values produce more varied speech."
  })
  declare temperature: any;

  @prop({
    type: "str",
    default: "",
    description:
      'Text to synthesize into speech (maximum 500 characters).\n\nSupported paralinguistic tags you can include in your text:\n[clear throat], [sigh], [sush], [cough], [groan], [sniff], [gasp], [chuckle], [laugh]\n\nExample: "Oh, that\'s hilarious! [chuckle] Let me tell you more."'
  })
  declare text: any;

  @prop({
    type: "int",
    default: 1000,
    description:
      "Top-k sampling. Limits vocabulary to top k tokens at each step."
  })
  declare top_k: any;

  @prop({
    type: "float",
    default: 0.95,
    description:
      "Nucleus sampling threshold. Lower values make output more focused."
  })
  declare top_p: any;

  @prop({
    type: "enum",
    default: "Andy",
    values: [
      "Aaron",
      "Abigail",
      "Anaya",
      "Andy",
      "Archer",
      "Brian",
      "Chloe",
      "Dylan",
      "Emmanuel",
      "Ethan",
      "Evelyn",
      "Gavin",
      "Gordon",
      "Ivan",
      "Laura",
      "Lucy",
      "Madison",
      "Marisol",
      "Meera",
      "Walter"
    ],
    description:
      "Pre-made voice to use for synthesis. Ignored if reference_audio is provided."
  })
  declare voice: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const repetitionPenalty = Number(this.repetition_penalty ?? 1.2);
    const seed = Number(this.seed ?? -1);
    const temperature = Number(this.temperature ?? 0.8);
    const text = String(this.text ?? "");
    const topK = Number(this.top_k ?? 1000);
    const topP = Number(this.top_p ?? 0.95);
    const voice = String(this.voice ?? "Andy");

    const args: Record<string, unknown> = {
      repetition_penalty: repetitionPenalty,
      seed: seed,
      temperature: temperature,
      text: text,
      top_k: topK,
      top_p: topP,
      voice: voice
    };

    const referenceAudioRef = this.reference_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceAudioRef)) {
      const referenceAudioUrl = await assetToUrl(referenceAudioRef!, apiKey);
      if (referenceAudioUrl) args["reference_audio"] = referenceAudioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "resemble-ai/chatterbox-turbo:95c87b883ff3e842a1643044dff67f9d204f70a80228f24ff64bffe4a4b917d4",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Speech_02_HD extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Speech_02_HD";
  static readonly title = "Speech_02_ H D";
  static readonly description = `Text-to-Audio (T2A) that offers voice synthesis, emotional expression, and multilingual capabilities. Optimized for high-fidelity applications like voiceovers and audiobooks.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "enum",
    default: "mp3",
    values: ["mp3", "wav", "flac", "pcm"],
    description:
      "File format for the generated audio. Choose mp3 for general use, wav/flac for lossless, or pcm for raw bytes."
  })
  declare audio_format: any;

  @prop({
    type: "enum",
    default: 128000,
    values: ["32000", "64000", "128000", "256000"],
    description:
      "MP3 bitrate in bits per second. Only used when audio_format is mp3."
  })
  declare bitrate: any;

  @prop({
    type: "enum",
    default: "mono",
    values: ["mono", "stereo"],
    description: "mono for 1 channel (default), stereo for 2 channels."
  })
  declare channel: any;

  @prop({
    type: "enum",
    default: "auto",
    values: [
      "auto",
      "happy",
      "sad",
      "angry",
      "fearful",
      "disgusted",
      "surprised",
      "calm",
      "fluent",
      "neutral"
    ],
    description:
      "Desired delivery style. Use auto to let MiniMax choose, or pick a specific emotion."
  })
  declare emotion: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Improve number/date reading for English text (adds a small amount of latency)."
  })
  declare english_normalization: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Automatic",
      "Chinese",
      "Chinese,Yue",
      "Cantonese",
      "English",
      "Arabic",
      "Russian",
      "Spanish",
      "French",
      "Portuguese",
      "German",
      "Turkish",
      "Dutch",
      "Ukrainian",
      "Vietnamese",
      "Indonesian",
      "Japanese",
      "Italian",
      "Korean",
      "Thai",
      "Polish",
      "Romanian",
      "Greek",
      "Czech",
      "Finnish",
      "Hindi",
      "Bulgarian",
      "Danish",
      "Hebrew",
      "Malay",
      "Persian",
      "Slovak",
      "Swedish",
      "Croatian",
      "Filipino",
      "Hungarian",
      "Norwegian",
      "Slovenian",
      "Catalan",
      "Nynorsk",
      "Tamil",
      "Afrikaans"
    ],
    description:
      "Optional language hint. Choose Automatic to let MiniMax detect the language, or pick a specific locale."
  })
  declare language_boost: any;

  @prop({
    type: "int",
    default: 0,
    description: "Semitone offset applied to the voice (−12 to +12)."
  })
  declare pitch: any;

  @prop({
    type: "enum",
    default: 32000,
    values: ["8000", "16000", "22050", "24000", "32000", "44100"],
    description: "Audio sample rate in Hz."
  })
  declare sample_rate: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Speech speed multiplier (0.5–2.0). Lower is slower, higher is faster."
  })
  declare speed: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Return MiniMax subtitle metadata with sentence timestamps (non-streaming only)."
  })
  declare subtitle_enable: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Text to narrate (max 10,000 characters). Use markers like <#0.5#> to insert pauses in seconds."
  })
  declare text: any;

  @prop({
    type: "str",
    default: "Wise_Woman",
    description:
      "Voice to synthesize. Pick any MiniMax system voice or a voice_id returned by https://replicate.com/minimax/voice-cloning."
  })
  declare voice_id: any;

  @prop({
    type: "float",
    default: 1,
    description: "Relative loudness. 1.0 is default MiniMax gain. Range 0–10."
  })
  declare volume: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const audioFormat = String(this.audio_format ?? "mp3");
    const bitrate = String(this.bitrate ?? 128000);
    const channel = String(this.channel ?? "mono");
    const emotion = String(this.emotion ?? "auto");
    const englishNormalization = Boolean(this.english_normalization ?? false);
    const languageBoost = String(this.language_boost ?? "None");
    const pitch = Number(this.pitch ?? 0);
    const sampleRate = String(this.sample_rate ?? 32000);
    const speed = Number(this.speed ?? 1);
    const subtitleEnable = Boolean(this.subtitle_enable ?? false);
    const text = String(this.text ?? "");
    const voiceId = String(this.voice_id ?? "Wise_Woman");
    const volume = Number(this.volume ?? 1);

    const args: Record<string, unknown> = {
      audio_format: audioFormat,
      bitrate: bitrate,
      channel: channel,
      emotion: emotion,
      english_normalization: englishNormalization,
      language_boost: languageBoost,
      pitch: pitch,
      sample_rate: sampleRate,
      speed: speed,
      subtitle_enable: subtitleEnable,
      text: text,
      voice_id: voiceId,
      volume: volume
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "minimax/speech-02-hd:fdd081f807e655246ef42adbcb3ee9334e7fdc710428684771f90d69992cabb3",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Speech_02_Turbo extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Speech_02_Turbo";
  static readonly title = "Speech_02_ Turbo";
  static readonly description = `Text-to-Audio (T2A) that offers voice synthesis, emotional expression, and multilingual capabilities. Designed for real-time applications with low latency
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "enum",
    default: "mp3",
    values: ["mp3", "wav", "flac", "pcm"],
    description:
      "File format for the generated audio. Choose mp3 for general use, wav/flac for lossless, or pcm for raw bytes."
  })
  declare audio_format: any;

  @prop({
    type: "enum",
    default: 128000,
    values: ["32000", "64000", "128000", "256000"],
    description:
      "MP3 bitrate in bits per second. Only used when audio_format is mp3."
  })
  declare bitrate: any;

  @prop({
    type: "enum",
    default: "mono",
    values: ["mono", "stereo"],
    description: "mono for 1 channel (default), stereo for 2 channels."
  })
  declare channel: any;

  @prop({
    type: "enum",
    default: "auto",
    values: [
      "auto",
      "happy",
      "sad",
      "angry",
      "fearful",
      "disgusted",
      "surprised",
      "calm",
      "fluent",
      "neutral"
    ],
    description:
      "Desired delivery style. Use auto to let MiniMax choose, or pick a specific emotion."
  })
  declare emotion: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Improve number/date reading for English text (adds a small amount of latency)."
  })
  declare english_normalization: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Automatic",
      "Chinese",
      "Chinese,Yue",
      "Cantonese",
      "English",
      "Arabic",
      "Russian",
      "Spanish",
      "French",
      "Portuguese",
      "German",
      "Turkish",
      "Dutch",
      "Ukrainian",
      "Vietnamese",
      "Indonesian",
      "Japanese",
      "Italian",
      "Korean",
      "Thai",
      "Polish",
      "Romanian",
      "Greek",
      "Czech",
      "Finnish",
      "Hindi",
      "Bulgarian",
      "Danish",
      "Hebrew",
      "Malay",
      "Persian",
      "Slovak",
      "Swedish",
      "Croatian",
      "Filipino",
      "Hungarian",
      "Norwegian",
      "Slovenian",
      "Catalan",
      "Nynorsk",
      "Tamil",
      "Afrikaans"
    ],
    description:
      "Optional language hint. Choose Automatic to let MiniMax detect the language, or pick a specific locale."
  })
  declare language_boost: any;

  @prop({
    type: "int",
    default: 0,
    description: "Semitone offset applied to the voice (−12 to +12)."
  })
  declare pitch: any;

  @prop({
    type: "enum",
    default: 32000,
    values: ["8000", "16000", "22050", "24000", "32000", "44100"],
    description: "Audio sample rate in Hz."
  })
  declare sample_rate: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Speech speed multiplier (0.5–2.0). Lower is slower, higher is faster."
  })
  declare speed: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Return MiniMax subtitle metadata with sentence timestamps (non-streaming only)."
  })
  declare subtitle_enable: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Text to narrate (max 10,000 characters). Use markers like <#0.5#> to insert pauses in seconds."
  })
  declare text: any;

  @prop({
    type: "str",
    default: "Wise_Woman",
    description:
      "Voice to synthesize. Pick any MiniMax system voice or a voice_id returned by https://replicate.com/minimax/voice-cloning."
  })
  declare voice_id: any;

  @prop({
    type: "float",
    default: 1,
    description: "Relative loudness. 1.0 is default MiniMax gain. Range 0–10."
  })
  declare volume: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const audioFormat = String(this.audio_format ?? "mp3");
    const bitrate = String(this.bitrate ?? 128000);
    const channel = String(this.channel ?? "mono");
    const emotion = String(this.emotion ?? "auto");
    const englishNormalization = Boolean(this.english_normalization ?? false);
    const languageBoost = String(this.language_boost ?? "None");
    const pitch = Number(this.pitch ?? 0);
    const sampleRate = String(this.sample_rate ?? 32000);
    const speed = Number(this.speed ?? 1);
    const subtitleEnable = Boolean(this.subtitle_enable ?? false);
    const text = String(this.text ?? "");
    const voiceId = String(this.voice_id ?? "Wise_Woman");
    const volume = Number(this.volume ?? 1);

    const args: Record<string, unknown> = {
      audio_format: audioFormat,
      bitrate: bitrate,
      channel: channel,
      emotion: emotion,
      english_normalization: englishNormalization,
      language_boost: languageBoost,
      pitch: pitch,
      sample_rate: sampleRate,
      speed: speed,
      subtitle_enable: subtitleEnable,
      text: text,
      voice_id: voiceId,
      volume: volume
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "minimax/speech-02-turbo:e2e8812b45eefa93b20990418480fe628ddce470f9b72909a175d65e288ff3d5",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Speech_2_6_HD extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Speech_2_6_HD";
  static readonly title = "Speech_2_6_ H D";
  static readonly description = `MiniMax Speech 2.6 HD delivers studio-quality multilingual text-to-audio on Replicate with nuanced prosody, subtitle export, and premium voices
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "enum",
    default: "mp3",
    values: ["mp3", "wav", "flac", "pcm"],
    description:
      "File format for the generated audio. Choose mp3 for general use, wav/flac for lossless, or pcm for raw bytes."
  })
  declare audio_format: any;

  @prop({
    type: "enum",
    default: 128000,
    values: ["32000", "64000", "128000", "256000"],
    description:
      "MP3 bitrate in bits per second. Only used when audio_format is mp3."
  })
  declare bitrate: any;

  @prop({
    type: "enum",
    default: "mono",
    values: ["mono", "stereo"],
    description: "mono for 1 channel (default), stereo for 2 channels."
  })
  declare channel: any;

  @prop({
    type: "enum",
    default: "auto",
    values: [
      "auto",
      "happy",
      "sad",
      "angry",
      "fearful",
      "disgusted",
      "surprised",
      "calm",
      "fluent",
      "neutral"
    ],
    description:
      "Desired delivery style. Use auto to let MiniMax choose, or pick a specific emotion."
  })
  declare emotion: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Improve number/date reading for English text (adds a small amount of latency)."
  })
  declare english_normalization: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Automatic",
      "Chinese",
      "Chinese,Yue",
      "Cantonese",
      "English",
      "Arabic",
      "Russian",
      "Spanish",
      "French",
      "Portuguese",
      "German",
      "Turkish",
      "Dutch",
      "Ukrainian",
      "Vietnamese",
      "Indonesian",
      "Japanese",
      "Italian",
      "Korean",
      "Thai",
      "Polish",
      "Romanian",
      "Greek",
      "Czech",
      "Finnish",
      "Hindi",
      "Bulgarian",
      "Danish",
      "Hebrew",
      "Malay",
      "Persian",
      "Slovak",
      "Swedish",
      "Croatian",
      "Filipino",
      "Hungarian",
      "Norwegian",
      "Slovenian",
      "Catalan",
      "Nynorsk",
      "Tamil",
      "Afrikaans"
    ],
    description:
      "Optional language hint. Choose Automatic to let MiniMax detect the language, or pick a specific locale."
  })
  declare language_boost: any;

  @prop({
    type: "int",
    default: 0,
    description: "Semitone offset applied to the voice (−12 to +12)."
  })
  declare pitch: any;

  @prop({
    type: "enum",
    default: 32000,
    values: ["8000", "16000", "22050", "24000", "32000", "44100"],
    description: "Audio sample rate in Hz."
  })
  declare sample_rate: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Speech speed multiplier (0.5–2.0). Lower is slower, higher is faster."
  })
  declare speed: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Return MiniMax subtitle metadata with sentence timestamps (non-streaming only)."
  })
  declare subtitle_enable: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Text to narrate (max 10,000 characters). Use markers like <#0.5#> to insert pauses in seconds."
  })
  declare text: any;

  @prop({
    type: "str",
    default: "Wise_Woman",
    description:
      "Voice to synthesize. Pick any MiniMax system voice or a voice_id returned by https://replicate.com/minimax/voice-cloning."
  })
  declare voice_id: any;

  @prop({
    type: "float",
    default: 1,
    description: "Relative loudness. 1.0 is default MiniMax gain. Range 0–10."
  })
  declare volume: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const audioFormat = String(this.audio_format ?? "mp3");
    const bitrate = String(this.bitrate ?? 128000);
    const channel = String(this.channel ?? "mono");
    const emotion = String(this.emotion ?? "auto");
    const englishNormalization = Boolean(this.english_normalization ?? false);
    const languageBoost = String(this.language_boost ?? "None");
    const pitch = Number(this.pitch ?? 0);
    const sampleRate = String(this.sample_rate ?? 32000);
    const speed = Number(this.speed ?? 1);
    const subtitleEnable = Boolean(this.subtitle_enable ?? false);
    const text = String(this.text ?? "");
    const voiceId = String(this.voice_id ?? "Wise_Woman");
    const volume = Number(this.volume ?? 1);

    const args: Record<string, unknown> = {
      audio_format: audioFormat,
      bitrate: bitrate,
      channel: channel,
      emotion: emotion,
      english_normalization: englishNormalization,
      language_boost: languageBoost,
      pitch: pitch,
      sample_rate: sampleRate,
      speed: speed,
      subtitle_enable: subtitleEnable,
      text: text,
      voice_id: voiceId,
      volume: volume
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "minimax/speech-2.6-hd:6968911f19d698a4d18654b5d58b0103ee9a8ba469addf8358c3fd38b1544c1c",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Speech_2_6_Turbo extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Speech_2_6_Turbo";
  static readonly title = "Speech_2_6_ Turbo";
  static readonly description = `Low‑latency MiniMax Speech 2.6 Turbo brings multilingual, emotional text-to-speech to Replicate with 300+ voices and real-time friendly pricing
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "enum",
    default: "mp3",
    values: ["mp3", "wav", "flac", "pcm"],
    description:
      "File format for the generated audio. Choose mp3 for general use, wav/flac for lossless, or pcm for raw bytes."
  })
  declare audio_format: any;

  @prop({
    type: "enum",
    default: 128000,
    values: ["32000", "64000", "128000", "256000"],
    description:
      "MP3 bitrate in bits per second. Only used when audio_format is mp3."
  })
  declare bitrate: any;

  @prop({
    type: "enum",
    default: "mono",
    values: ["mono", "stereo"],
    description: "mono for 1 channel (default), stereo for 2 channels."
  })
  declare channel: any;

  @prop({
    type: "enum",
    default: "auto",
    values: [
      "auto",
      "happy",
      "sad",
      "angry",
      "fearful",
      "disgusted",
      "surprised",
      "calm",
      "fluent",
      "neutral"
    ],
    description:
      "Desired delivery style. Use auto to let MiniMax choose, or pick a specific emotion."
  })
  declare emotion: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Improve number/date reading for English text (adds a small amount of latency)."
  })
  declare english_normalization: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Automatic",
      "Chinese",
      "Chinese,Yue",
      "Cantonese",
      "English",
      "Arabic",
      "Russian",
      "Spanish",
      "French",
      "Portuguese",
      "German",
      "Turkish",
      "Dutch",
      "Ukrainian",
      "Vietnamese",
      "Indonesian",
      "Japanese",
      "Italian",
      "Korean",
      "Thai",
      "Polish",
      "Romanian",
      "Greek",
      "Czech",
      "Finnish",
      "Hindi",
      "Bulgarian",
      "Danish",
      "Hebrew",
      "Malay",
      "Persian",
      "Slovak",
      "Swedish",
      "Croatian",
      "Filipino",
      "Hungarian",
      "Norwegian",
      "Slovenian",
      "Catalan",
      "Nynorsk",
      "Tamil",
      "Afrikaans"
    ],
    description:
      "Optional language hint. Choose Automatic to let MiniMax detect the language, or pick a specific locale."
  })
  declare language_boost: any;

  @prop({
    type: "int",
    default: 0,
    description: "Semitone offset applied to the voice (−12 to +12)."
  })
  declare pitch: any;

  @prop({
    type: "enum",
    default: 32000,
    values: ["8000", "16000", "22050", "24000", "32000", "44100"],
    description: "Audio sample rate in Hz."
  })
  declare sample_rate: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Speech speed multiplier (0.5–2.0). Lower is slower, higher is faster."
  })
  declare speed: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Return MiniMax subtitle metadata with sentence timestamps (non-streaming only)."
  })
  declare subtitle_enable: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Text to narrate (max 10,000 characters). Use markers like <#0.5#> to insert pauses in seconds."
  })
  declare text: any;

  @prop({
    type: "str",
    default: "Wise_Woman",
    description:
      "Voice to synthesize. Pick any MiniMax system voice or a voice_id returned by https://replicate.com/minimax/voice-cloning."
  })
  declare voice_id: any;

  @prop({
    type: "float",
    default: 1,
    description: "Relative loudness. 1.0 is default MiniMax gain. Range 0–10."
  })
  declare volume: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const audioFormat = String(this.audio_format ?? "mp3");
    const bitrate = String(this.bitrate ?? 128000);
    const channel = String(this.channel ?? "mono");
    const emotion = String(this.emotion ?? "auto");
    const englishNormalization = Boolean(this.english_normalization ?? false);
    const languageBoost = String(this.language_boost ?? "None");
    const pitch = Number(this.pitch ?? 0);
    const sampleRate = String(this.sample_rate ?? 32000);
    const speed = Number(this.speed ?? 1);
    const subtitleEnable = Boolean(this.subtitle_enable ?? false);
    const text = String(this.text ?? "");
    const voiceId = String(this.voice_id ?? "Wise_Woman");
    const volume = Number(this.volume ?? 1);

    const args: Record<string, unknown> = {
      audio_format: audioFormat,
      bitrate: bitrate,
      channel: channel,
      emotion: emotion,
      english_normalization: englishNormalization,
      language_boost: languageBoost,
      pitch: pitch,
      sample_rate: sampleRate,
      speed: speed,
      subtitle_enable: subtitleEnable,
      text: text,
      voice_id: voiceId,
      volume: volume
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "minimax/speech-2.6-turbo:24c0b2d2819faa5ce6eff09fc136c625e6e8c90e6f8a1cca75845f26fe9e1c4e",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Speech_2_8_Turbo extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Speech_2_8_Turbo";
  static readonly title = "Speech_2_8_ Turbo";
  static readonly description = `Minimax Speech 2.8 Turbo: Turn text into natural, expressive speech with voice cloning, emotion control, and support for 40+ languages
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "enum",
    default: "mp3",
    values: ["mp3", "wav", "flac", "pcm"],
    description:
      "File format for the generated audio. Choose mp3 for general use, wav/flac for lossless, or pcm for raw bytes."
  })
  declare audio_format: any;

  @prop({
    type: "enum",
    default: 128000,
    values: ["32000", "64000", "128000", "256000"],
    description:
      "MP3 bitrate in bits per second. Only used when audio_format is mp3."
  })
  declare bitrate: any;

  @prop({
    type: "enum",
    default: "mono",
    values: ["mono", "stereo"],
    description: "mono for 1 channel (default), stereo for 2 channels."
  })
  declare channel: any;

  @prop({
    type: "enum",
    default: "auto",
    values: [
      "auto",
      "happy",
      "sad",
      "angry",
      "fearful",
      "disgusted",
      "surprised",
      "calm",
      "fluent",
      "neutral"
    ],
    description:
      "Desired delivery style. Use auto to let MiniMax choose, or pick a specific emotion."
  })
  declare emotion: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Improve number/date reading for English text (adds a small amount of latency)."
  })
  declare english_normalization: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Automatic",
      "Chinese",
      "Chinese,Yue",
      "Cantonese",
      "English",
      "Arabic",
      "Russian",
      "Spanish",
      "French",
      "Portuguese",
      "German",
      "Turkish",
      "Dutch",
      "Ukrainian",
      "Vietnamese",
      "Indonesian",
      "Japanese",
      "Italian",
      "Korean",
      "Thai",
      "Polish",
      "Romanian",
      "Greek",
      "Czech",
      "Finnish",
      "Hindi",
      "Bulgarian",
      "Danish",
      "Hebrew",
      "Malay",
      "Persian",
      "Slovak",
      "Swedish",
      "Croatian",
      "Filipino",
      "Hungarian",
      "Norwegian",
      "Slovenian",
      "Catalan",
      "Nynorsk",
      "Tamil",
      "Afrikaans"
    ],
    description:
      "Optional language hint. Choose Automatic to let MiniMax detect the language, or pick a specific locale."
  })
  declare language_boost: any;

  @prop({
    type: "int",
    default: 0,
    description: "Semitone offset applied to the voice (−12 to +12)."
  })
  declare pitch: any;

  @prop({
    type: "enum",
    default: 32000,
    values: ["8000", "16000", "22050", "24000", "32000", "44100"],
    description: "Audio sample rate in Hz."
  })
  declare sample_rate: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Speech speed multiplier (0.5–2.0). Lower is slower, higher is faster."
  })
  declare speed: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Return MiniMax subtitle metadata with sentence timestamps (non-streaming only)."
  })
  declare subtitle_enable: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Text to narrate (max 10,000 characters). Use markers like <#0.5#> to insert pauses in seconds."
  })
  declare text: any;

  @prop({
    type: "str",
    default: "Wise_Woman",
    description:
      "Voice to synthesize. Pick any MiniMax system voice or a voice_id returned by https://replicate.com/minimax/voice-cloning."
  })
  declare voice_id: any;

  @prop({
    type: "float",
    default: 1,
    description: "Relative loudness. 1.0 is default MiniMax gain. Range 0–10."
  })
  declare volume: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const audioFormat = String(this.audio_format ?? "mp3");
    const bitrate = String(this.bitrate ?? 128000);
    const channel = String(this.channel ?? "mono");
    const emotion = String(this.emotion ?? "auto");
    const englishNormalization = Boolean(this.english_normalization ?? false);
    const languageBoost = String(this.language_boost ?? "None");
    const pitch = Number(this.pitch ?? 0);
    const sampleRate = String(this.sample_rate ?? 32000);
    const speed = Number(this.speed ?? 1);
    const subtitleEnable = Boolean(this.subtitle_enable ?? false);
    const text = String(this.text ?? "");
    const voiceId = String(this.voice_id ?? "Wise_Woman");
    const volume = Number(this.volume ?? 1);

    const args: Record<string, unknown> = {
      audio_format: audioFormat,
      bitrate: bitrate,
      channel: channel,
      emotion: emotion,
      english_normalization: englishNormalization,
      language_boost: languageBoost,
      pitch: pitch,
      sample_rate: sampleRate,
      speed: speed,
      subtitle_enable: subtitleEnable,
      text: text,
      voice_id: voiceId,
      volume: volume
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "minimax/speech-2.8-turbo:fb87e0f2c69157fc47cf9c6ba00aa7548b98e970cd3401abeeea0204bcf2cfb6",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Voice_Cloning extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Voice_Cloning";
  static readonly title = "Voice_ Cloning";
  static readonly description = `Clone voices to use with Minimax's speech-02-hd and speech-02-turbo
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "float",
    default: 0.7,
    description: "Text validation accuracy threshold (0-1)"
  })
  declare accuracy: any;

  @prop({
    type: "enum",
    default: "speech-02-turbo",
    values: [
      "speech-2.6-turbo",
      "speech-2.6-hd",
      "speech-02-turbo",
      "speech-02-hd"
    ],
    description: "The text-to-speech model to train"
  })
  declare model: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Enable noise reduction. Use this if the voice file has background noise."
  })
  declare need_noise_reduction: any;

  @prop({
    type: "bool",
    default: false,
    description: "Enable volume normalization"
  })
  declare need_volume_normalization: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Voice file to clone. Must be MP3, M4A, or WAV format, 10s to 5min duration, and less than 20MB."
  })
  declare voice_file: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const accuracy = Number(this.accuracy ?? 0.7);
    const model = String(this.model ?? "speech-02-turbo");
    const needNoiseReduction = Boolean(this.need_noise_reduction ?? false);
    const needVolumeNormalization = Boolean(
      this.need_volume_normalization ?? false
    );

    const args: Record<string, unknown> = {
      accuracy: accuracy,
      model: model,
      need_noise_reduction: needNoiseReduction,
      need_volume_normalization: needVolumeNormalization
    };

    const voiceFileRef = this.voice_file as Record<string, unknown> | undefined;
    if (isRefSet(voiceFileRef)) {
      const voiceFileUrl = await assetToUrl(voiceFileRef!, apiKey);
      if (voiceFileUrl) args["voice_file"] = voiceFileUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "minimax/voice-cloning:fff8a670880f066d3742838515a88f7f0a3ae40a4f2e06dae0f7f70ba63582d7",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Music_1_5 extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Music_1_5";
  static readonly title = "Music_1_5";
  static readonly description = `Music-1.5: Full-length songs (up to 4 mins) with natural vocals & rich instrumentation
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "enum",
    default: "mp3",
    values: ["mp3", "wav", "pcm"],
    description: "Audio format"
  })
  declare audio_format: any;

  @prop({
    type: "enum",
    default: 256000,
    values: ["32000", "64000", "128000", "256000"],
    description: "Bitrate for the generated music"
  })
  declare bitrate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Lyrics. Use \n to separate lines. Supports [intro][verse][chorus][bridge][outro]. Valid input: 10-600 characters."
  })
  declare lyrics: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Control music generation with a text prompt. Valid input: 10-300 characters."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: 44100,
    values: ["16000", "24000", "32000", "44100"],
    description: "Sample rate for the generated music"
  })
  declare sample_rate: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const audioFormat = String(this.audio_format ?? "mp3");
    const bitrate = String(this.bitrate ?? 256000);
    const lyrics = String(this.lyrics ?? "");
    const prompt = String(this.prompt ?? "");
    const sampleRate = String(this.sample_rate ?? 44100);

    const args: Record<string, unknown> = {
      audio_format: audioFormat,
      bitrate: bitrate,
      lyrics: lyrics,
      prompt: prompt,
      sample_rate: sampleRate
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "minimax/music-1.5:70c8395540eae909be2c09a0b4897d22ee2455a5e5c9826b71161743b5cc45f1",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Stable_Audio_2_5 extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Stable_Audio_2_5";
  static readonly title = "Stable_ Audio_2_5";
  static readonly description = `Generate high-quality music and sound from text prompts
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "float",
    default: 1,
    description:
      "Classifier-free guidance scale (higher = more prompt adherence)"
  })
  declare cfg_scale: any;

  @prop({
    type: "int",
    default: 190,
    description: "Duration of generated audio in seconds"
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt describing the desired audio"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description:
      "Random seed for reproducible results. Leave blank for random seed."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 8,
    description:
      "Number of diffusion steps (higher = better quality but slower)"
  })
  declare steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const cfgScale = Number(this.cfg_scale ?? 1);
    const duration = Number(this.duration ?? 190);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const steps = Number(this.steps ?? 8);

    const args: Record<string, unknown> = {
      cfg_scale: cfgScale,
      duration: duration,
      prompt: prompt,
      seed: seed,
      steps: steps
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "stability-ai/stable-audio-2.5:a61ac8edbb27cd2eda1b2eff2bbc03dcff1131f5560836ff77a052df05b77491",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class AceStep extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.AceStep";
  static readonly title = "Ace Step";
  static readonly description = `A Step Towards Music Generation Foundation Model text2music
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "float",
    default: 60,
    description:
      "Duration of the generated audio in seconds. -1 means a random duration between 30 and 240 seconds."
  })
  declare duration: any;

  @prop({
    type: "float",
    default: 10,
    description: "Omega scale for APG guidance, or similar for other CFG types."
  })
  declare granularity_scale: any;

  @prop({ type: "float", default: 0.5, description: "Guidance interval." })
  declare guidance_interval: any;

  @prop({ type: "float", default: 0, description: "Guidance interval decay." })
  declare guidance_interval_decay: any;

  @prop({ type: "float", default: 15, description: "Overall guidance scale." })
  declare guidance_scale: any;

  @prop({
    type: "enum",
    default: "apg",
    values: ["apg", "cfg", "cfg_star"],
    description: "Guidance type for CFG."
  })
  declare guidance_type: any;

  @prop({
    type: "float",
    default: 0,
    description: "Guidance scale for lyrics."
  })
  declare lyric_guidance_scale: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Lyrics for the music. Use [verse], [chorus], and [bridge] to separate different parts of the lyrics. Use [instrumental] or [inst] to generate instrumental music"
  })
  declare lyrics: any;

  @prop({ type: "float", default: 3, description: "Minimum guidance scale." })
  declare min_guidance_scale: any;

  @prop({ type: "int", default: 60, description: "Number of inference steps." })
  declare number_of_steps: any;

  @prop({
    type: "enum",
    default: "euler",
    values: ["euler", "heun"],
    description: "Scheduler type."
  })
  declare scheduler: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set to -1 to randomize."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 0,
    description: "Guidance scale for tags (text prompt)."
  })
  declare tag_guidance_scale: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Text prompts to guide music generation, e.g., 'epic,cinematic'"
  })
  declare tags: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const duration = Number(this.duration ?? 60);
    const granularityScale = Number(this.granularity_scale ?? 10);
    const guidanceInterval = Number(this.guidance_interval ?? 0.5);
    const guidanceIntervalDecay = Number(this.guidance_interval_decay ?? 0);
    const guidanceScale = Number(this.guidance_scale ?? 15);
    const guidanceType = String(this.guidance_type ?? "apg");
    const lyricGuidanceScale = Number(this.lyric_guidance_scale ?? 0);
    const lyrics = String(this.lyrics ?? "");
    const minGuidanceScale = Number(this.min_guidance_scale ?? 3);
    const numberOfSteps = Number(this.number_of_steps ?? 60);
    const scheduler = String(this.scheduler ?? "euler");
    const seed = Number(this.seed ?? -1);
    const tagGuidanceScale = Number(this.tag_guidance_scale ?? 0);
    const tags = String(this.tags ?? "");

    const args: Record<string, unknown> = {
      duration: duration,
      granularity_scale: granularityScale,
      guidance_interval: guidanceInterval,
      guidance_interval_decay: guidanceIntervalDecay,
      guidance_scale: guidanceScale,
      guidance_type: guidanceType,
      lyric_guidance_scale: lyricGuidanceScale,
      lyrics: lyrics,
      min_guidance_scale: minGuidanceScale,
      number_of_steps: numberOfSteps,
      scheduler: scheduler,
      seed: seed,
      tag_guidance_scale: tagGuidanceScale,
      tags: tags
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/ace-step:280fc4f9ee507577f880a167f639c02622421d8fecf492454320311217b688f1",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class MAGNeT extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.MAGNeT";
  static readonly title = "M A G Ne T";
  static readonly description = `MAGNeT: Masked Audio Generation using a Single Non-Autoregressive Transformer
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "int",
    default: 20,
    description: "Number of decoding steps for stage 1"
  })
  declare decoding_steps_stage_1: any;

  @prop({
    type: "int",
    default: 10,
    description: "Number of decoding steps for stage 2"
  })
  declare decoding_steps_stage_2: any;

  @prop({
    type: "int",
    default: 10,
    description: "Number of decoding steps for stage 3"
  })
  declare decoding_steps_stage_3: any;

  @prop({
    type: "int",
    default: 10,
    description: "Number of decoding steps for stage 4"
  })
  declare decoding_steps_stage_4: any;

  @prop({ type: "float", default: 10, description: "Max CFG coefficient" })
  declare max_cfg: any;

  @prop({ type: "float", default: 1, description: "Min CFG coefficient" })
  declare min_cfg: any;

  @prop({
    type: "enum",
    default: "facebook/magnet-small-10secs",
    values: [
      "facebook/magnet-small-10secs",
      "facebook/magnet-medium-10secs",
      "facebook/magnet-small-30secs",
      "facebook/magnet-medium-30secs",
      "facebook/audio-magnet-small",
      "facebook/audio-magnet-medium"
    ],
    description: "Model to use"
  })
  declare model: any;

  @prop({
    type: "str",
    default:
      "80s electronic track with melodic synthesizers, catchy beat and groovy bass",
    description: "Input Text"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "prod-stride1",
    values: ["max-nonoverlap", "prod-stride1"],
    description: "An enumeration."
  })
  declare span_score: any;

  @prop({ type: "float", default: 3, description: "Temperature for sampling" })
  declare temperature: any;

  @prop({ type: "float", default: 0.9, description: "Top p for sampling" })
  declare top_p: any;

  @prop({
    type: "int",
    default: 3,
    description: "Number of variations to generate"
  })
  declare variations: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const decodingStepsStage_1 = Number(this.decoding_steps_stage_1 ?? 20);
    const decodingStepsStage_2 = Number(this.decoding_steps_stage_2 ?? 10);
    const decodingStepsStage_3 = Number(this.decoding_steps_stage_3 ?? 10);
    const decodingStepsStage_4 = Number(this.decoding_steps_stage_4 ?? 10);
    const maxCfg = Number(this.max_cfg ?? 10);
    const minCfg = Number(this.min_cfg ?? 1);
    const model = String(this.model ?? "facebook/magnet-small-10secs");
    const prompt = String(
      this.prompt ??
        "80s electronic track with melodic synthesizers, catchy beat and groovy bass"
    );
    const spanScore = String(this.span_score ?? "prod-stride1");
    const temperature = Number(this.temperature ?? 3);
    const topP = Number(this.top_p ?? 0.9);
    const variations = Number(this.variations ?? 3);

    const args: Record<string, unknown> = {
      decoding_steps_stage_1: decodingStepsStage_1,
      decoding_steps_stage_2: decodingStepsStage_2,
      decoding_steps_stage_3: decodingStepsStage_3,
      decoding_steps_stage_4: decodingStepsStage_4,
      max_cfg: maxCfg,
      min_cfg: minCfg,
      model: model,
      prompt: prompt,
      span_score: spanScore,
      temperature: temperature,
      top_p: topP,
      variations: variations
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/magnet:e8e2ecd4a1dabb58924aa8300b668290cafae166dd36baf65dad9875877de50e",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class MusicGen_Chord extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.MusicGen_Chord";
  static readonly title = "Music Gen_ Chord";
  static readonly description = `Generate music restricted to chord sequences and tempo
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "audio",
    default: "",
    description:
      "An audio file that will condition the chord progression. You must choose only one among 'audio_chords' or 'text_chords' above."
  })
  declare audio_chords: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "End time of the audio file to use for chord conditioning. If None, will default to the end of the audio clip."
  })
  declare audio_end: any;

  @prop({
    type: "int",
    default: 0,
    description: "Start time of the audio file to use for chord conditioning."
  })
  declare audio_start: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "BPM condition for the generated output. 'text_chords' will be processed based on this value. This will be appended at the end of 'prompt'."
  })
  declare bpm: any;

  @prop({
    type: "float",
    default: 1,
    description: "Coefficient value multiplied to multi-hot chord chroma."
  })
  declare chroma_coefficient: any;

  @prop({
    type: "int",
    default: 3,
    description:
      "Increases the influence of inputs on the output. Higher values produce lower-varience outputs that adhere more closely to inputs."
  })
  declare classifier_free_guidance: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', generated music will continue from 'audio_chords'. If chord conditioning, this is only possible when the chord condition is given with 'text_chords'. If 'False', generated music will mimic 'audio_chords''s chord."
  })
  declare continuation: any;

  @prop({
    type: "int",
    default: 8,
    description: "Duration of the generated audio in seconds."
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the EnCodec tokens will be decoded with MultiBand Diffusion."
  })
  declare multi_band_diffusion: any;

  @prop({
    type: "enum",
    default: "loudness",
    values: ["loudness", "clip", "peak", "rms"],
    description: "Strategy for normalizing audio."
  })
  declare normalization_strategy: any;

  @prop({
    type: "enum",
    default: "wav",
    values: ["wav", "mp3"],
    description: "Output format for generated audio."
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "A description of the music you want to generate."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description:
      "Seed for random number generator. If 'None' or '-1', a random seed will be used."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Controls the 'conservativeness' of the sampling process. Higher temperature means more diversity."
  })
  declare temperature: any;

  @prop({
    type: "str",
    default: "",
    description:
      "A text based chord progression condition. Single uppercase alphabet character(eg. 'C') is considered as a major chord. Chord attributes like('maj', 'min', 'dim', 'aug', 'min6', 'maj6', 'min7', 'minmaj7', 'maj7', '7', 'dim7', 'hdim7', 'sus2' and 'sus4') can be added to the root alphabet character after ':'.(eg. 'A:min7') Each chord token splitted by 'SPACE' is allocated to a single bar. If more than one chord must be allocated to a single bar, cluster the chords adding with ',' without any 'SPACE'.(eg. 'C,C:7 G, E:min A:min') You must choose either only one of 'audio_chords' below or 'text_chords'."
  })
  declare text_chords: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Time signature value for the generate output. 'text_chords' will be processed based on this value. This will be appended at the end of 'prompt'."
  })
  declare time_sig: any;

  @prop({
    type: "int",
    default: 250,
    description: "Reduces sampling to the k most likely tokens."
  })
  declare top_k: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Reduces sampling to tokens with cumulative probability of p. When set to  '0' (default), top_k sampling is used."
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const audioEnd = Number(this.audio_end ?? 0);
    const audioStart = Number(this.audio_start ?? 0);
    const bpm = Number(this.bpm ?? 0);
    const chromaCoefficient = Number(this.chroma_coefficient ?? 1);
    const classifierFreeGuidance = Number(this.classifier_free_guidance ?? 3);
    const continuation = Boolean(this.continuation ?? false);
    const duration = Number(this.duration ?? 8);
    const multiBandDiffusion = Boolean(this.multi_band_diffusion ?? false);
    const normalizationStrategy = String(
      this.normalization_strategy ?? "loudness"
    );
    const outputFormat = String(this.output_format ?? "wav");
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const temperature = Number(this.temperature ?? 1);
    const textChords = String(this.text_chords ?? "");
    const timeSig = String(this.time_sig ?? "");
    const topK = Number(this.top_k ?? 250);
    const topP = Number(this.top_p ?? 0);

    const args: Record<string, unknown> = {
      audio_end: audioEnd,
      audio_start: audioStart,
      bpm: bpm,
      chroma_coefficient: chromaCoefficient,
      classifier_free_guidance: classifierFreeGuidance,
      continuation: continuation,
      duration: duration,
      multi_band_diffusion: multiBandDiffusion,
      normalization_strategy: normalizationStrategy,
      output_format: outputFormat,
      prompt: prompt,
      seed: seed,
      temperature: temperature,
      text_chords: textChords,
      time_sig: timeSig,
      top_k: topK,
      top_p: topP
    };

    const audioChordsRef = this.audio_chords as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(audioChordsRef)) {
      const audioChordsUrl = await assetToUrl(audioChordsRef!, apiKey);
      if (audioChordsUrl) args["audio_chords"] = audioChordsUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "sakemin/musicgen-chord:c940ab4308578237484f90f010b2b3871bf64008e95f26f4d567529ad019a3d6",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class MusicGen_Remixer extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.MusicGen_Remixer";
  static readonly title = "Music Gen_ Remixer";
  static readonly description = `Remix the music into another styles with MusicGen Chord
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "float",
    default: 0,
    description:
      "When beat syncing, if the gap between generated downbeat timing and input audio downbeat timing is larger than 'beat_sync_threshold', consider the beats are not corresponding. If 'None' or '-1', '1.1/(bpm/60)' will be used as the value. 0.75 is a good value to set."
  })
  declare beat_sync_threshold: any;

  @prop({
    type: "float",
    default: 1,
    description: "Coefficient value multiplied to multi-hot chord chroma."
  })
  declare chroma_coefficient: any;

  @prop({
    type: "int",
    default: 3,
    description:
      "Increases the influence of inputs on the output. Higher values produce lower-varience outputs that adhere more closely to inputs."
  })
  declare classifier_free_guidance: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "If 'True', more chords like 7th, diminished and etc are used. If 'False' only 12 major and 12 minor chords are used."
  })
  declare large_chord_voca: any;

  @prop({
    type: "enum",
    default: "stereo-chord",
    values: ["stereo-chord", "stereo-chord-large", "chord", "chord-large"],
    description:
      "Model type. Computations take longer when using 'large' or 'stereo' models."
  })
  declare model_version: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the EnCodec tokens will be decoded with MultiBand Diffusion. Not compatible with 'stereo' models."
  })
  declare multi_band_diffusion: any;

  @prop({
    type: "audio",
    default: "",
    description: "An audio file input for the remix."
  })
  declare music_input: any;

  @prop({
    type: "enum",
    default: "loudness",
    values: ["loudness", "clip", "peak", "rms"],
    description: "Strategy for normalizing audio."
  })
  declare normalization_strategy: any;

  @prop({
    type: "enum",
    default: "wav",
    values: ["wav", "mp3"],
    description: "Output format for generated audio."
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "A description of the music you want to generate."
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "If 'True', the instrumental audio will also be returned."
  })
  declare return_instrumental: any;

  @prop({
    type: "int",
    default: -1,
    description:
      "Seed for random number generator. If 'None' or '-1', a random seed will be used."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Controls the 'conservativeness' of the sampling process. Higher temperature means more diversity."
  })
  declare temperature: any;

  @prop({
    type: "int",
    default: 250,
    description: "Reduces sampling to the k most likely tokens."
  })
  declare top_k: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Reduces sampling to tokens with cumulative probability of p. When set to  '0' (default), top_k sampling is used."
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const beatSyncThreshold = Number(this.beat_sync_threshold ?? 0);
    const chromaCoefficient = Number(this.chroma_coefficient ?? 1);
    const classifierFreeGuidance = Number(this.classifier_free_guidance ?? 3);
    const largeChordVoca = Boolean(this.large_chord_voca ?? true);
    const modelVersion = String(this.model_version ?? "stereo-chord");
    const multiBandDiffusion = Boolean(this.multi_band_diffusion ?? false);
    const normalizationStrategy = String(
      this.normalization_strategy ?? "loudness"
    );
    const outputFormat = String(this.output_format ?? "wav");
    const prompt = String(this.prompt ?? "");
    const returnInstrumental = Boolean(this.return_instrumental ?? false);
    const seed = Number(this.seed ?? -1);
    const temperature = Number(this.temperature ?? 1);
    const topK = Number(this.top_k ?? 250);
    const topP = Number(this.top_p ?? 0);

    const args: Record<string, unknown> = {
      beat_sync_threshold: beatSyncThreshold,
      chroma_coefficient: chromaCoefficient,
      classifier_free_guidance: classifierFreeGuidance,
      large_chord_voca: largeChordVoca,
      model_version: modelVersion,
      multi_band_diffusion: multiBandDiffusion,
      normalization_strategy: normalizationStrategy,
      output_format: outputFormat,
      prompt: prompt,
      return_instrumental: returnInstrumental,
      seed: seed,
      temperature: temperature,
      top_k: topK,
      top_p: topP
    };

    const musicInputRef = this.music_input as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(musicInputRef)) {
      const musicInputUrl = await assetToUrl(musicInputRef!, apiKey);
      if (musicInputUrl) args["music_input"] = musicInputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "sakemin/musicgen-remixer:0b769f28e399c7c30e4f2360691b9b11c294183e9ab2fd9f3398127b556c86d7",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class MusicGen_Stereo_Chord extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.MusicGen_Stereo_Chord";
  static readonly title = "Music Gen_ Stereo_ Chord";
  static readonly description = `Generate music in stereo, restricted to chord sequences and tempo
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "audio",
    default: "",
    description:
      "An audio file that will condition the chord progression. You must choose only one among 'audio_chords' or 'text_chords' above."
  })
  declare audio_chords: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "End time of the audio file to use for chord conditioning. If None, will default to the end of the audio clip."
  })
  declare audio_end: any;

  @prop({
    type: "int",
    default: 0,
    description: "Start time of the audio file to use for chord conditioning."
  })
  declare audio_start: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "BPM condition for the generated output. 'text_chords' will be processed based on this value. This will be appended at the end of 'prompt'."
  })
  declare bpm: any;

  @prop({
    type: "float",
    default: 1,
    description: "Coefficient value multiplied to multi-hot chord chroma."
  })
  declare chroma_coefficient: any;

  @prop({
    type: "int",
    default: 3,
    description:
      "Increases the influence of inputs on the output. Higher values produce lower-varience outputs that adhere more closely to inputs."
  })
  declare classifier_free_guidance: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', generated music will continue from 'audio_chords'. If chord conditioning, this is only possible when the chord condition is given with 'text_chords'. If 'False', generated music will mimic 'audio_chords''s chord."
  })
  declare continuation: any;

  @prop({
    type: "int",
    default: 8,
    description: "Duration of the generated audio in seconds."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "stereo-chord-large",
    values: ["chord", "chord-large", "stereo-chord", "stereo-chord-large"],
    description:
      "Model type. Select 'fine-tuned' if you trained the model into your own repository."
  })
  declare model_version: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the EnCodec tokens will be decoded with MultiBand Diffusion. Not compatible with stereo models."
  })
  declare multi_band_diffusion: any;

  @prop({
    type: "enum",
    default: "loudness",
    values: ["loudness", "clip", "peak", "rms"],
    description: "Strategy for normalizing audio."
  })
  declare normalization_strategy: any;

  @prop({
    type: "enum",
    default: "wav",
    values: ["wav", "mp3"],
    description: "Output format for generated audio."
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "A description of the music you want to generate."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description:
      "Seed for random number generator. If 'None' or '-1', a random seed will be used."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Controls the 'conservativeness' of the sampling process. Higher temperature means more diversity."
  })
  declare temperature: any;

  @prop({
    type: "str",
    default: "",
    description:
      "A text based chord progression condition. Single uppercase alphabet character(eg. 'C') is considered as a major chord. Chord attributes like('maj', 'min', 'dim', 'aug', 'min6', 'maj6', 'min7', 'minmaj7', 'maj7', '7', 'dim7', 'hdim7', 'sus2' and 'sus4') can be added to the root alphabet character after ':'.(eg. 'A:min7') Each chord token splitted by 'SPACE' is allocated to a single bar. If more than one chord must be allocated to a single bar, cluster the chords adding with ',' without any 'SPACE'.(eg. 'C,C:7 G, E:min A:min') You must choose either only one of 'audio_chords' below or 'text_chords'."
  })
  declare text_chords: any;

  @prop({
    type: "str",
    default: "4/4",
    description:
      "Time signature value for the generate output. 'text_chords' will be processed based on this value. This will be appended at the end of 'prompt'."
  })
  declare time_sig: any;

  @prop({
    type: "int",
    default: 250,
    description: "Reduces sampling to the k most likely tokens."
  })
  declare top_k: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Reduces sampling to tokens with cumulative probability of p. When set to  '0' (default), top_k sampling is used."
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const audioEnd = Number(this.audio_end ?? 0);
    const audioStart = Number(this.audio_start ?? 0);
    const bpm = Number(this.bpm ?? 0);
    const chromaCoefficient = Number(this.chroma_coefficient ?? 1);
    const classifierFreeGuidance = Number(this.classifier_free_guidance ?? 3);
    const continuation = Boolean(this.continuation ?? false);
    const duration = Number(this.duration ?? 8);
    const modelVersion = String(this.model_version ?? "stereo-chord-large");
    const multiBandDiffusion = Boolean(this.multi_band_diffusion ?? false);
    const normalizationStrategy = String(
      this.normalization_strategy ?? "loudness"
    );
    const outputFormat = String(this.output_format ?? "wav");
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const temperature = Number(this.temperature ?? 1);
    const textChords = String(this.text_chords ?? "");
    const timeSig = String(this.time_sig ?? "4/4");
    const topK = Number(this.top_k ?? 250);
    const topP = Number(this.top_p ?? 0);

    const args: Record<string, unknown> = {
      audio_end: audioEnd,
      audio_start: audioStart,
      bpm: bpm,
      chroma_coefficient: chromaCoefficient,
      classifier_free_guidance: classifierFreeGuidance,
      continuation: continuation,
      duration: duration,
      model_version: modelVersion,
      multi_band_diffusion: multiBandDiffusion,
      normalization_strategy: normalizationStrategy,
      output_format: outputFormat,
      prompt: prompt,
      seed: seed,
      temperature: temperature,
      text_chords: textChords,
      time_sig: timeSig,
      top_k: topK,
      top_p: topP
    };

    const audioChordsRef = this.audio_chords as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(audioChordsRef)) {
      const audioChordsUrl = await assetToUrl(audioChordsRef!, apiKey);
      if (audioChordsUrl) args["audio_chords"] = audioChordsUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "sakemin/musicgen-stereo-chord:fbdc5ef7200220ed300015d9b4fd3f8e620f84547e970b23aa2be7f2ff366a5b",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class MusicGen_Looper extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.MusicGen_Looper";
  static readonly title = "Music Gen_ Looper";
  static readonly description = `Generate fixed-bpm loops from text prompts
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "float",
    default: 140,
    description: "Tempo in beats per minute"
  })
  declare bpm: any;

  @prop({
    type: "int",
    default: 3,
    description:
      "Increases the influence of inputs on the output. Higher values produce lower-varience outputs that adhere more closely to inputs."
  })
  declare classifier_free_guidance: any;

  @prop({
    type: "int",
    default: 8,
    description: "Maximum duration of the generated loop in seconds."
  })
  declare max_duration: any;

  @prop({
    type: "enum",
    default: "medium",
    values: ["medium", "large"],
    description: "Model to use for generation. ."
  })
  declare model_version: any;

  @prop({
    type: "enum",
    default: "wav",
    values: ["wav", "mp3"],
    description: "Output format for generated audio."
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "A description of the music you want to generate."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description:
      "Seed for random number generator. If None or -1, a random seed will be used."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Controls the 'conservativeness' of the sampling process. Higher temperature means more diversity."
  })
  declare temperature: any;

  @prop({
    type: "int",
    default: 250,
    description: "Reduces sampling to the k most likely tokens."
  })
  declare top_k: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Reduces sampling to tokens with cumulative probability of p. When set to  '0' (default), top_k sampling is used."
  })
  declare top_p: any;

  @prop({
    type: "int",
    default: 4,
    description: "Number of variations to generate"
  })
  declare variations: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const bpm = Number(this.bpm ?? 140);
    const classifierFreeGuidance = Number(this.classifier_free_guidance ?? 3);
    const maxDuration = Number(this.max_duration ?? 8);
    const modelVersion = String(this.model_version ?? "medium");
    const outputFormat = String(this.output_format ?? "wav");
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const temperature = Number(this.temperature ?? 1);
    const topK = Number(this.top_k ?? 250);
    const topP = Number(this.top_p ?? 0);
    const variations = Number(this.variations ?? 4);

    const args: Record<string, unknown> = {
      bpm: bpm,
      classifier_free_guidance: classifierFreeGuidance,
      max_duration: maxDuration,
      model_version: modelVersion,
      output_format: outputFormat,
      prompt: prompt,
      seed: seed,
      temperature: temperature,
      top_k: topK,
      top_p: topP,
      variations: variations
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "andreasjansson/musicgen-looper:f8140d0457c2b39ad8728a80736fea9a67a0ec0cd37b35f40b68cce507db2366",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Flux_Music extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Flux_Music";
  static readonly title = "Flux_ Music";
  static readonly description = `🎼FluxMusic Text-to-Music Generation with Rectified Flow Transformer🎶
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "float",
    default: 7,
    description: "Classifier-free guidance scale"
  })
  declare guidance_scale: any;

  @prop({
    type: "enum",
    default: "base",
    values: ["small", "base", "large", "giant"],
    description: "Select the model version to use"
  })
  declare model_version: any;

  @prop({
    type: "str",
    default: "low quality, gentle",
    description: "Text prompt for negative guidance (unconditioned prompt)"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default:
      "The song is an epic blend of space-rock, rock, and post-rock genres.",
    description: "Text prompt for music generation"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to save the spectrogram image"
  })
  declare save_spectrogram: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({ type: "int", default: 50, description: "Number of sampling steps" })
  declare steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const guidanceScale = Number(this.guidance_scale ?? 7);
    const modelVersion = String(this.model_version ?? "base");
    const negativePrompt = String(
      this.negative_prompt ?? "low quality, gentle"
    );
    const prompt = String(
      this.prompt ??
        "The song is an epic blend of space-rock, rock, and post-rock genres."
    );
    const saveSpectrogram = Boolean(this.save_spectrogram ?? false);
    const seed = Number(this.seed ?? -1);
    const steps = Number(this.steps ?? 50);

    const args: Record<string, unknown> = {
      guidance_scale: guidanceScale,
      model_version: modelVersion,
      negative_prompt: negativePrompt,
      prompt: prompt,
      save_spectrogram: saveSpectrogram,
      seed: seed,
      steps: steps
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "zsxkib/flux-music:eebfed4a1749bb1172f005f71fac5a1e0377502ec149c9d02b56ac1de3aa9f07",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Dia extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.Dia";
  static readonly title = "Dia";
  static readonly description = `Dia 1.6B by Nari Labs, Generates realistic dialogue audio from text, including non-verbal cues and voice cloning
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "audio",
    default: "",
    description:
      "Optional audio file (.wav/.mp3/.flac) for voice cloning. The model will attempt to mimic this voice style."
  })
  declare audio_prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional transcript of the audio prompt. If provided, this will be prepended to the main text input."
  })
  declare audio_prompt_text: any;

  @prop({
    type: "int",
    default: 45,
    description:
      "Technical parameter for filtering audio generation tokens. Higher values allow more diverse sounds; lower values create more consistent audio."
  })
  declare cfg_filter_top_k: any;

  @prop({
    type: "float",
    default: 3,
    description:
      "Controls how closely the audio follows your text. Higher values (3-5) follow text more strictly; lower values may sound more natural but deviate more."
  })
  declare cfg_scale: any;

  @prop({
    type: "int",
    default: 10,
    description:
      "Maximum duration in seconds for the input voice cloning audio prompt. Only used when an audio prompt is provided. Longer voice samples will be truncated to this length."
  })
  declare max_audio_prompt_seconds: any;

  @prop({
    type: "int",
    default: 3072,
    description:
      "Controls the length of generated audio. Higher values create longer audio. (86 tokens ≈ 1 second of audio)."
  })
  declare max_new_tokens: any;

  @prop({
    type: "int",
    default: -1,
    description:
      "Random seed for reproducible results. Use the same seed value to get the same output for identical inputs. Leave blank for random results each time."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Adjusts playback speed of the generated audio. Values below 1.0 slow down the audio; 1.0 is original speed."
  })
  declare speed_factor: any;

  @prop({
    type: "float",
    default: 1.8,
    description:
      "Controls randomness in generation. Higher values (1.3-2.0) increase variety; lower values make output more consistent. Set to 0 for deterministic (greedy) generation."
  })
  declare temperature: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Input text for dialogue generation. Use [S1], [S2] to indicate different speakers and (description) in parentheses for non-verbal cues e.g., (laughs), (whispers)."
  })
  declare text: any;

  @prop({
    type: "float",
    default: 0.95,
    description:
      "Controls diversity of word choice. Higher values include more unusual options. Most users shouldn't need to adjust this parameter."
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const audioPromptText = String(this.audio_prompt_text ?? "");
    const cfgFilterTopK = Number(this.cfg_filter_top_k ?? 45);
    const cfgScale = Number(this.cfg_scale ?? 3);
    const maxAudioPromptSeconds = Number(this.max_audio_prompt_seconds ?? 10);
    const maxNewTokens = Number(this.max_new_tokens ?? 3072);
    const seed = Number(this.seed ?? -1);
    const speedFactor = Number(this.speed_factor ?? 1);
    const temperature = Number(this.temperature ?? 1.8);
    const text = String(this.text ?? "");
    const topP = Number(this.top_p ?? 0.95);

    const args: Record<string, unknown> = {
      audio_prompt_text: audioPromptText,
      cfg_filter_top_k: cfgFilterTopK,
      cfg_scale: cfgScale,
      max_audio_prompt_seconds: maxAudioPromptSeconds,
      max_new_tokens: maxNewTokens,
      seed: seed,
      speed_factor: speedFactor,
      temperature: temperature,
      text: text,
      top_p: topP
    };

    const audioPromptRef = this.audio_prompt as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(audioPromptRef)) {
      const audioPromptUrl = await assetToUrl(audioPromptRef!, apiKey);
      if (audioPromptUrl) args["audio_prompt"] = audioPromptUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "zsxkib/dia:2119e338ca5c0dacd3def83158d6c80d431f2ac1024146d8cca9220b74385599",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class ThinkSound extends ReplicateNode {
  static readonly nodeType = "replicate.audio.speech.ThinkSound";
  static readonly title = "Think Sound";
  static readonly description = `Generate contextual audio from video using step-by-step reasoning🎶
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "str",
    default: "",
    description: "Caption/title describing the video content (optional)"
  })
  declare caption: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "Classifier-free guidance scale. Higher values follow conditioning more closely but may reduce creativity"
  })
  declare cfg_scale: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Chain-of-Thought description providing detailed reasoning about the desired audio (optional)"
  })
  declare cot: any;

  @prop({
    type: "int",
    default: 24,
    description:
      "Number of diffusion denoising steps. More steps = higher quality but slower generation"
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: -1,
    description:
      "Random seed for reproducible outputs. Leave empty for random seed"
  })
  declare seed: any;

  @prop({
    type: "video",
    default: "",
    description: "Input video file (supports various formats)"
  })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const caption = String(this.caption ?? "");
    const cfgScale = Number(this.cfg_scale ?? 5);
    const cot = String(this.cot ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 24);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      caption: caption,
      cfg_scale: cfgScale,
      cot: cot,
      num_inference_steps: numInferenceSteps,
      seed: seed
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToUrl(videoRef!, apiKey);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "zsxkib/thinksound:40d08f9f569e91a5d72f6795ebed75178c185b0434699a98c07fc5f566efb2d4",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export const REPLICATE_AUDIO_SPEECH_NODES: readonly NodeClass[] = [
  ElevenLabs_Flash_V2_5,
  ElevenLabs_Turbo_V2_5,
  ElevenLabs_V2_Multilingual,
  ElevenLabs_V3,
  ElevenLabs_Music,
  Inworld_TTS_Max,
  Inworld_TTS_Mini,
  Kokoro_82M,
  XTTS_V2,
  Orpheus_3B,
  CSM_1B,
  Parler_TTS,
  VoiceCraft,
  OpenVoice,
  F5_TTS,
  Spanish_F5_TTS,
  Qwen3_TTS,
  Chatterbox,
  Chatterbox_Multilingual,
  Chatterbox_Pro,
  Chatterbox_Turbo,
  Speech_02_HD,
  Speech_02_Turbo,
  Speech_2_6_HD,
  Speech_2_6_Turbo,
  Speech_2_8_Turbo,
  Voice_Cloning,
  Music_1_5,
  Stable_Audio_2_5,
  AceStep,
  MAGNeT,
  MusicGen_Chord,
  MusicGen_Remixer,
  MusicGen_Stereo_Chord,
  MusicGen_Looper,
  Flux_Music,
  Dia,
  ThinkSound
] as const;
