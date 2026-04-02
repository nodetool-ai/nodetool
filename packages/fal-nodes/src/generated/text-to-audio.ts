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

export class ACEStepPromptToAudio extends FalNode {
  static readonly nodeType = "fal.text_to_audio.ACEStepPromptToAudio";
  static readonly title = "A C E Step Prompt To Audio";
  static readonly description = `ACE-Step generates music from text prompts with high-quality audio synthesis.
audio, generation, music, ace-step, text-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    tags: "str",
    lyrics: "str",
    seed: "int",
    audio: "audio"
  };

  @prop({
    type: "int",
    default: 27,
    description: "Number of steps to generate the audio."
  })
  declare number_of_steps: any;

  @prop({
    type: "float",
    default: 60,
    description: "The duration of the generated audio in seconds."
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Prompt to control the style of the generated audio. This will be used to generate tags and lyrics."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 3,
    description: "Minimum guidance scale for the generation after the decay."
  })
  declare minimum_guidance_scale: any;

  @prop({
    type: "float",
    default: 5,
    description: "Tag guidance scale for the generation."
  })
  declare tag_guidance_scale: any;

  @prop({
    type: "enum",
    default: "euler",
    values: ["euler", "heun"],
    description: "Scheduler to use for the generation process."
  })
  declare scheduler: any;

  @prop({
    type: "float",
    default: 15,
    description: "Guidance scale for the generation."
  })
  declare guidance_scale: any;

  @prop({
    type: "enum",
    default: "apg",
    values: ["cfg", "apg", "cfg_star"],
    description: "Type of CFG to use for the generation process."
  })
  declare guidance_type: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to generate an instrumental version of the audio."
  })
  declare instrumental: any;

  @prop({
    type: "float",
    default: 1.5,
    description: "Lyric guidance scale for the generation."
  })
  declare lyric_guidance_scale: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Guidance interval for the generation. 0.5 means only apply guidance in the middle steps (0.25 * infer_steps to 0.75 * infer_steps)"
  })
  declare guidance_interval: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Guidance interval decay for the generation. Guidance scale will decay from guidance_scale to min_guidance_scale in the interval. 0.0 means no decay."
  })
  declare guidance_interval_decay: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If not provided, a random seed will be used."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 10,
    description:
      "Granularity scale for the generation process. Higher values can reduce artifacts."
  })
  declare granularity_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const numberOfSteps = Number(this.number_of_steps ?? 27);
    const duration = Number(this.duration ?? 60);
    const prompt = String(this.prompt ?? "");
    const minimumGuidanceScale = Number(this.minimum_guidance_scale ?? 3);
    const tagGuidanceScale = Number(this.tag_guidance_scale ?? 5);
    const scheduler = String(this.scheduler ?? "euler");
    const guidanceScale = Number(this.guidance_scale ?? 15);
    const guidanceType = String(this.guidance_type ?? "apg");
    const instrumental = Boolean(this.instrumental ?? false);
    const lyricGuidanceScale = Number(this.lyric_guidance_scale ?? 1.5);
    const guidanceInterval = Number(this.guidance_interval ?? 0.5);
    const guidanceIntervalDecay = Number(this.guidance_interval_decay ?? 0);
    const seed = String(this.seed ?? "");
    const granularityScale = Number(this.granularity_scale ?? 10);

    const args: Record<string, unknown> = {
      number_of_steps: numberOfSteps,
      duration: duration,
      prompt: prompt,
      minimum_guidance_scale: minimumGuidanceScale,
      tag_guidance_scale: tagGuidanceScale,
      scheduler: scheduler,
      guidance_scale: guidanceScale,
      guidance_type: guidanceType,
      instrumental: instrumental,
      lyric_guidance_scale: lyricGuidanceScale,
      guidance_interval: guidanceInterval,
      guidance_interval_decay: guidanceIntervalDecay,
      seed: seed,
      granularity_scale: granularityScale
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ace-step/prompt-to-audio",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class ACEStep extends FalNode {
  static readonly nodeType = "fal.text_to_audio.ACEStep";
  static readonly title = "A C E Step";
  static readonly description = `ACE-Step generates music with lyrics from text using advanced audio synthesis.
audio, generation, music, lyrics, ace-step, text-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    tags: "str",
    lyrics: "str",
    seed: "int",
    audio: "audio"
  };

  @prop({
    type: "int",
    default: 27,
    description: "Number of steps to generate the audio."
  })
  declare number_of_steps: any;

  @prop({
    type: "float",
    default: 60,
    description: "The duration of the generated audio in seconds."
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Comma-separated list of genre tags to control the style of the generated audio."
  })
  declare tags: any;

  @prop({
    type: "float",
    default: 3,
    description: "Minimum guidance scale for the generation after the decay."
  })
  declare minimum_guidance_scale: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Lyrics to be sung in the audio. If not provided or if [inst] or [instrumental] is the content of this field, no lyrics will be sung. Use control structures like [verse], [chorus] and [bridge] to control the structure of the song."
  })
  declare lyrics: any;

  @prop({
    type: "float",
    default: 5,
    description: "Tag guidance scale for the generation."
  })
  declare tag_guidance_scale: any;

  @prop({
    type: "enum",
    default: "euler",
    values: ["euler", "heun"],
    description: "Scheduler to use for the generation process."
  })
  declare scheduler: any;

  @prop({
    type: "float",
    default: 15,
    description: "Guidance scale for the generation."
  })
  declare guidance_scale: any;

  @prop({
    type: "enum",
    default: "apg",
    values: ["cfg", "apg", "cfg_star"],
    description: "Type of CFG to use for the generation process."
  })
  declare guidance_type: any;

  @prop({
    type: "float",
    default: 1.5,
    description: "Lyric guidance scale for the generation."
  })
  declare lyric_guidance_scale: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Guidance interval for the generation. 0.5 means only apply guidance in the middle steps (0.25 * infer_steps to 0.75 * infer_steps)"
  })
  declare guidance_interval: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Guidance interval decay for the generation. Guidance scale will decay from guidance_scale to min_guidance_scale in the interval. 0.0 means no decay."
  })
  declare guidance_interval_decay: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If not provided, a random seed will be used."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 10,
    description:
      "Granularity scale for the generation process. Higher values can reduce artifacts."
  })
  declare granularity_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const numberOfSteps = Number(this.number_of_steps ?? 27);
    const duration = Number(this.duration ?? 60);
    const tags = String(this.tags ?? "");
    const minimumGuidanceScale = Number(this.minimum_guidance_scale ?? 3);
    const lyrics = String(this.lyrics ?? "");
    const tagGuidanceScale = Number(this.tag_guidance_scale ?? 5);
    const scheduler = String(this.scheduler ?? "euler");
    const guidanceScale = Number(this.guidance_scale ?? 15);
    const guidanceType = String(this.guidance_type ?? "apg");
    const lyricGuidanceScale = Number(this.lyric_guidance_scale ?? 1.5);
    const guidanceInterval = Number(this.guidance_interval ?? 0.5);
    const guidanceIntervalDecay = Number(this.guidance_interval_decay ?? 0);
    const seed = String(this.seed ?? "");
    const granularityScale = Number(this.granularity_scale ?? 10);

    const args: Record<string, unknown> = {
      number_of_steps: numberOfSteps,
      duration: duration,
      tags: tags,
      minimum_guidance_scale: minimumGuidanceScale,
      lyrics: lyrics,
      tag_guidance_scale: tagGuidanceScale,
      scheduler: scheduler,
      guidance_scale: guidanceScale,
      guidance_type: guidanceType,
      lyric_guidance_scale: lyricGuidanceScale,
      guidance_interval: guidanceInterval,
      guidance_interval_decay: guidanceIntervalDecay,
      seed: seed,
      granularity_scale: granularityScale
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ace-step", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class CSM1B extends FalNode {
  static readonly nodeType = "fal.text_to_audio.CSM1B";
  static readonly title = "C S M1 B";
  static readonly description = `CSM (Conversational Speech Model) generates natural conversational speech from text.
audio, speech, tts, conversational, text-to-speech`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "list[Turn]",
    default: [],
    description: "The text to generate an audio from."
  })
  declare scene: any;

  @prop({
    type: "list[Speaker]",
    default: [],
    description: "The context to generate an audio from."
  })
  declare context: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const scene = String(this.scene ?? []);
    const context = String(this.context ?? []);

    const args: Record<string, unknown> = {
      scene: scene,
      context: context
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/csm-1b", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class DiffRhythm extends FalNode {
  static readonly nodeType = "fal.text_to_audio.DiffRhythm";
  static readonly title = "Diff Rhythm";
  static readonly description = `DiffRhythm generates rhythmic music and beats using diffusion models.
audio, generation, rhythm, beats, music, text-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "The prompt to generate the song from. Must have two sections. Sections start with either [chorus] or a [verse]."
  })
  declare lyrics: any;

  @prop({
    type: "float",
    default: 4,
    description: "The CFG strength to use for the music generation."
  })
  declare cfg_strength: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "The URL of the reference audio to use for the music generation."
  })
  declare reference_audio: any;

  @prop({
    type: "enum",
    default: "95s",
    values: ["95s", "285s"],
    description: "The duration of the music to generate."
  })
  declare music_duration: any;

  @prop({
    type: "enum",
    default: "euler",
    values: ["euler", "midpoint", "rk4", "implicit_adams"],
    description: "The scheduler to use for the music generation."
  })
  declare scheduler: any;

  @prop({
    type: "int",
    default: 32,
    description:
      "The number of inference steps to use for the music generation."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "",
    description: "The style prompt to use for the music generation."
  })
  declare style_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const lyrics = String(this.lyrics ?? "");
    const cfgStrength = Number(this.cfg_strength ?? 4);
    const musicDuration = String(this.music_duration ?? "95s");
    const scheduler = String(this.scheduler ?? "euler");
    const numInferenceSteps = Number(this.num_inference_steps ?? 32);
    const stylePrompt = String(this.style_prompt ?? "");

    const args: Record<string, unknown> = {
      lyrics: lyrics,
      cfg_strength: cfgStrength,
      music_duration: musicDuration,
      scheduler: scheduler,
      num_inference_steps: numInferenceSteps,
      style_prompt: stylePrompt
    };

    const referenceAudioRef = this.reference_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceAudioRef)) {
      const referenceAudioUrl = await assetToFalUrl(apiKey, referenceAudioRef!);
      if (referenceAudioUrl) args["reference_audio_url"] = referenceAudioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/diffrhythm", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class ElevenLabsTTSMultilingualV2 extends FalNode {
  static readonly nodeType = "fal.text_to_audio.ElevenLabsTTSMultilingualV2";
  static readonly title = "Eleven Labs T T S Multilingual V2";
  static readonly description = `ElevenLabs Multilingual TTS v2 generates natural speech in multiple languages.
audio, tts, speech, multilingual, elevenlabs, text-to-speech`;
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
      "fal-ai/elevenlabs/tts/multilingual-v2",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class ElevenLabsTextToDialogueV3 extends FalNode {
  static readonly nodeType = "fal.text_to_audio.ElevenLabsTextToDialogueV3";
  static readonly title = "Eleven Labs Text To Dialogue V3";
  static readonly description = `ElevenLabs Text to Dialogue v3 generates conversational dialogue with multiple speakers.
audio, dialogue, conversation, elevenlabs, text-to-speech`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "Determines how stable the voice is and the randomness between each generation. Lower values introduce broader emotional range for the voice. Higher values can result in a monotonous voice with limited emotion. Must be one of 0.0, 0.5, 1.0, else it will be rounded to the nearest value."
  })
  declare stability: any;

  @prop({
    type: "list[DialogueBlock]",
    default: [],
    description:
      "A list of dialogue inputs, each containing text and a voice ID which will be converted into speech."
  })
  declare inputs: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Language code (ISO 639-1) used to enforce a language for the model. An error will be returned if language code is not supported by the model."
  })
  declare language_code: any;

  @prop({
    type: "str",
    default: "",
    description: "Random seed for reproducibility."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description:
      "This setting boosts the similarity to the original speaker. Using this setting requires a slightly higher computational load, which in turn increases latency."
  })
  declare use_speaker_boost: any;

  @prop({
    type: "list[PronunciationDictionaryLocator]",
    default: [],
    description:
      "A list of pronunciation dictionary locators (id, version_id) to be applied to the text. They will be applied in order. You may have up to 3 locators per request"
  })
  declare pronunciation_dictionary_locators: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const stability = String(this.stability ?? "");
    const field_inputs = String(this.inputs ?? []);
    const languageCode = String(this.language_code ?? "");
    const seed = String(this.seed ?? "");
    const useSpeakerBoost = String(this.use_speaker_boost ?? "");
    const pronunciationDictionaryLocators = String(
      this.pronunciation_dictionary_locators ?? []
    );

    const args: Record<string, unknown> = {
      stability: stability,
      inputs: field_inputs,
      language_code: languageCode,
      seed: seed,
      use_speaker_boost: useSpeakerBoost,
      pronunciation_dictionary_locators: pronunciationDictionaryLocators
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/elevenlabs/text-to-dialogue/eleven-v3",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class ElevenLabsSoundEffectsV2 extends FalNode {
  static readonly nodeType = "fal.text_to_audio.ElevenLabsSoundEffectsV2";
  static readonly title = "Eleven Labs Sound Effects V2";
  static readonly description = `ElevenLabs Sound Effects v2 generates custom sound effects from text descriptions.
audio, sound-effects, sfx, elevenlabs, text-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description: "The text describing the sound effect to generate"
  })
  declare text: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to create a sound effect that loops smoothly."
  })
  declare loop: any;

  @prop({
    type: "float",
    default: 0.3,
    description:
      "How closely to follow the prompt (0-1). Higher values mean less variation."
  })
  declare prompt_influence: any;

  @prop({
    type: "enum",
    default: "mp3_44100_128",
    values: [
      "mp3_22050_32",
      "mp3_44100_32",
      "mp3_44100_64",
      "mp3_44100_96",
      "mp3_44100_128",
      "mp3_44100_192",
      "pcm_8000",
      "pcm_16000",
      "pcm_22050",
      "pcm_24000",
      "pcm_44100",
      "pcm_48000",
      "ulaw_8000",
      "alaw_8000",
      "opus_48000_32",
      "opus_48000_64",
      "opus_48000_96",
      "opus_48000_128",
      "opus_48000_192"
    ],
    description:
      "Output format of the generated audio. Formatted as codec_sample_rate_bitrate."
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Duration in seconds (0.5-22). If None, optimal duration will be determined from prompt."
  })
  declare duration_seconds: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const loop = Boolean(this.loop ?? false);
    const promptInfluence = Number(this.prompt_influence ?? 0.3);
    const outputFormat = String(this.output_format ?? "mp3_44100_128");
    const durationSeconds = String(this.duration_seconds ?? "");

    const args: Record<string, unknown> = {
      text: text,
      loop: loop,
      prompt_influence: promptInfluence,
      output_format: outputFormat,
      duration_seconds: durationSeconds
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/elevenlabs/sound-effects/v2",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class ElevenLabsTTSV3 extends FalNode {
  static readonly nodeType = "fal.text_to_audio.ElevenLabsTTSV3";
  static readonly title = "Eleven Labs T T S V3";
  static readonly description = `ElevenLabs TTS v3 generates high-quality natural speech with advanced voice control.
audio, tts, speech, elevenlabs, text-to-speech`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio", timestamps: "str" };

  @prop({
    type: "str",
    default: "",
    description: "The text to convert to speech"
  })
  declare text: any;

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
      "Language code (ISO 639-1) used to enforce a language for the model."
  })
  declare language_code: any;

  @prop({ type: "float", default: 0.5, description: "Voice stability (0-1)" })
  declare stability: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "on", "off"],
    description:
      "This parameter controls text normalization with three modes: 'auto', 'on', and 'off'. When set to 'auto', the system will automatically decide whether to apply text normalization (e.g., spelling out numbers). With 'on', text normalization will always be applied, while with 'off', it will be skipped."
  })
  declare apply_text_normalization: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to return timestamps for each word in the generated speech"
  })
  declare timestamps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const voice = String(this.voice ?? "Rachel");
    const languageCode = String(this.language_code ?? "");
    const stability = Number(this.stability ?? 0.5);
    const applyTextNormalization = String(
      this.apply_text_normalization ?? "auto"
    );
    const timestamps = Boolean(this.timestamps ?? false);

    const args: Record<string, unknown> = {
      text: text,
      voice: voice,
      language_code: languageCode,
      stability: stability,
      apply_text_normalization: applyTextNormalization,
      timestamps: timestamps
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/elevenlabs/tts/eleven-v3",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class ElevenLabsMusic extends FalNode {
  static readonly nodeType = "fal.text_to_audio.ElevenLabsMusic";
  static readonly title = "Eleven Labs Music";
  static readonly description = `ElevenLabs Music generates custom music compositions from text descriptions.
audio, music, generation, elevenlabs, text-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt describing the music to generate"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "The composition plan for the music"
  })
  declare composition_plan: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The length of the song to generate in milliseconds. Used only in conjunction with prompt. Must be between 3000ms and 600000ms. Optional - if not provided, the model will choose a length based on the prompt."
  })
  declare music_length_ms: any;

  @prop({
    type: "enum",
    default: "mp3_44100_128",
    values: [
      "mp3_22050_32",
      "mp3_44100_32",
      "mp3_44100_64",
      "mp3_44100_96",
      "mp3_44100_128",
      "mp3_44100_192",
      "pcm_8000",
      "pcm_16000",
      "pcm_22050",
      "pcm_24000",
      "pcm_44100",
      "pcm_48000",
      "ulaw_8000",
      "alaw_8000",
      "opus_48000_32",
      "opus_48000_64",
      "opus_48000_96",
      "opus_48000_128",
      "opus_48000_192"
    ],
    description:
      "Output format of the generated audio. Formatted as codec_sample_rate_bitrate. So an mp3 with 22.05kHz sample rate at 32kbs is represented as mp3_22050_32. MP3 with 192kbps bitrate requires you to be subscribed to Creator tier or above. PCM with 44.1kHz sample rate requires you to be subscribed to Pro tier or above. Note that the μ-law format (sometimes written mu-law, often approximated as u-law) is commonly used for Twilio audio inputs."
  })
  declare output_format: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Controls how strictly section durations in the composition_plan are enforced. It will only have an effect if it is used with composition_plan. When set to true, the model will precisely respect each section's duration_ms from the plan. When set to false, the model may adjust individual section durations which will generally lead to better generation quality and improved latency, while always preserving the total song duration from the plan."
  })
  declare respect_sections_durations: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, guarantees that the generated song will be instrumental. If false, the song may or may not be instrumental depending on the prompt. Can only be used with prompt."
  })
  declare force_instrumental: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const compositionPlan = String(this.composition_plan ?? "");
    const musicLengthMs = String(this.music_length_ms ?? "");
    const outputFormat = String(this.output_format ?? "mp3_44100_128");
    const respectSectionsDurations = Boolean(
      this.respect_sections_durations ?? true
    );
    const forceInstrumental = Boolean(this.force_instrumental ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      composition_plan: compositionPlan,
      music_length_ms: musicLengthMs,
      output_format: outputFormat,
      respect_sections_durations: respectSectionsDurations,
      force_instrumental: forceInstrumental
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/elevenlabs/music", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class F5TTS extends FalNode {
  static readonly nodeType = "fal.text_to_audio.F5TTS";
  static readonly title = "F5 T T S";
  static readonly description = `F5 TTS generates natural speech with fast inference and high quality.
audio, tts, speech, fast, text-to-speech`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio_url: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "The reference text to be used for TTS. If not provided, an ASR (Automatic Speech Recognition) model will be used to generate the reference text."
  })
  declare ref_text: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to remove the silence from the audio file."
  })
  declare remove_silence: any;

  @prop({
    type: "str",
    default: "",
    description: "The text to be converted to speech."
  })
  declare gen_text: any;

  @prop({
    type: "enum",
    default: "",
    values: ["F5-TTS", "E2-TTS"],
    description: "The name of the model to be used for TTS."
  })
  declare model_type: any;

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the reference audio file."
  })
  declare ref_audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const refText = String(this.ref_text ?? "");
    const removeSilence = Boolean(this.remove_silence ?? true);
    const genText = String(this.gen_text ?? "");
    const modelType = String(this.model_type ?? "");

    const args: Record<string, unknown> = {
      ref_text: refText,
      remove_silence: removeSilence,
      gen_text: genText,
      model_type: modelType
    };

    const refAudioRef = this.ref_audio as Record<string, unknown> | undefined;
    if (isRefSet(refAudioRef)) {
      const refAudioUrl = await assetToFalUrl(apiKey, refAudioRef!);
      if (refAudioUrl) args["ref_audio_url"] = refAudioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/f5-tts", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class Kokoro extends FalNode {
  static readonly nodeType = "fal.text_to_audio.Kokoro";
  static readonly title = "Kokoro";
  static readonly description = `Kokoro generates expressive and emotional speech with advanced prosody control.
audio, tts, speech, expressive, emotional, text-to-speech`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "float",
    default: 1,
    description: "Speed of the generated audio. Default is 1.0."
  })
  declare speed: any;

  @prop({
    type: "enum",
    default: "af_heart",
    values: [
      "af_heart",
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
      "am_santa"
    ],
    description: "Voice ID for the desired voice."
  })
  declare voice: any;

  @prop({ type: "str", default: "" })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const speed = Number(this.speed ?? 1);
    const voice = String(this.voice ?? "af_heart");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      speed: speed,
      voice: voice,
      prompt: prompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/kokoro", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class StableAudio extends FalNode {
  static readonly nodeType = "fal.text_to_audio.StableAudio";
  static readonly title = "Stable Audio";
  static readonly description = `Stable Audio generates high-quality audio from text with consistent results.
audio, generation, stable, music, text-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio_file: "str" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate audio from"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 100,
    description: "The number of steps to denoise the audio for"
  })
  declare steps: any;

  @prop({
    type: "int",
    default: 30,
    description: "The duration of the audio clip to generate"
  })
  declare seconds_total: any;

  @prop({
    type: "int",
    default: 0,
    description: "The start point of the audio clip to generate"
  })
  declare seconds_start: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const steps = Number(this.steps ?? 100);
    const secondsTotal = Number(this.seconds_total ?? 30);
    const secondsStart = Number(this.seconds_start ?? 0);

    const args: Record<string, unknown> = {
      prompt: prompt,
      steps: steps,
      seconds_total: secondsTotal,
      seconds_start: secondsStart
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/stable-audio", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class XTTS extends FalNode {
  static readonly nodeType = "fal.text_to_audio.XTTS";
  static readonly title = "X T T S";
  static readonly description = `XTTS generates expressive speech with voice cloning capabilities.
audio, tts, speech, voice-cloning, expressive, text-to-speech`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio_file: "str" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt you would like to convert to speech."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "The repetition penalty to use for generation. Defaults to 5.0."
  })
  declare repetition_penalty: any;

  @prop({
    type: "enum",
    default: "English",
    values: [
      "English",
      "Spanish",
      "French",
      "German",
      "Italian",
      "Portuguese",
      "Polish",
      "Turkish",
      "Russian",
      "Dutch",
      "Czech",
      "Arabic",
      "Chinese",
      "Japanese",
      "Hungarian",
      "Korean",
      "Hindi"
    ],
    description: "The language to use for generation. Defaults to English."
  })
  declare language: any;

  @prop({
    type: "int",
    default: 30,
    description: "The length of the GPT conditioning. Defaults to 30."
  })
  declare gpt_cond_len: any;

  @prop({
    type: "int",
    default: 4,
    description: "The length of the GPT conditioning chunks. Defaults to 4."
  })
  declare gpt_cond_chunk_len: any;

  @prop({
    type: "audio",
    default: "",
    description: "URL of the voice file to match"
  })
  declare audio: any;

  @prop({
    type: "float",
    default: 0.75,
    description:
      "The temperature to use for generation. Higher is more creative. Defaults to 0.75."
  })
  declare temperature: any;

  @prop({
    type: "int",
    default: 24000,
    description: "The sample rate of the audio. Defaults to 24000."
  })
  declare sample_rate: any;

  @prop({
    type: "int",
    default: 60,
    description: "The maximum length of the reference. Defaults to 60."
  })
  declare max_ref_length: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const repetitionPenalty = Number(this.repetition_penalty ?? 5);
    const language = String(this.language ?? "English");
    const gptCondLen = Number(this.gpt_cond_len ?? 30);
    const gptCondChunkLen = Number(this.gpt_cond_chunk_len ?? 4);
    const temperature = Number(this.temperature ?? 0.75);
    const sampleRate = Number(this.sample_rate ?? 24000);
    const maxRefLength = Number(this.max_ref_length ?? 60);

    const args: Record<string, unknown> = {
      prompt: prompt,
      repetition_penalty: repetitionPenalty,
      language: language,
      gpt_cond_len: gptCondLen,
      gpt_cond_chunk_len: gptCondChunkLen,
      temperature: temperature,
      sample_rate: sampleRate,
      max_ref_length: maxRefLength
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/xtts", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class MinimaxMusicV2 extends FalNode {
  static readonly nodeType = "fal.text_to_audio.MinimaxMusicV2";
  static readonly title = "Minimax Music V2";
  static readonly description = `Minimax Music
audio, generation, text-to-audio, tts, professional`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "A description of the music, specifying style, mood, and scenario. 10-300 characters."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Lyrics of the song. Use n to separate lines. You may add structure tags like [Intro], [Verse], [Chorus], [Bridge], [Outro] to enhance the arrangement. 10-3000 characters."
  })
  declare lyrics_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Audio configuration settings"
  })
  declare audio_setting: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const lyricsPrompt = String(this.lyrics_prompt ?? "");
    const audioSetting = String(this.audio_setting ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      lyrics_prompt: lyricsPrompt,
      audio_setting: audioSetting
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/minimax-music/v2", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class BeatovenSoundEffectGeneration extends FalNode {
  static readonly nodeType = "fal.text_to_audio.BeatovenSoundEffectGeneration";
  static readonly title = "Beatoven Sound Effect Generation";
  static readonly description = `Sound Effect Generation
audio, generation, text-to-audio, tts`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    metadata: "dict[str, any]",
    audio: "audio"
  };

  @prop({
    type: "str",
    default: "",
    description: "Describe the sound effect you want to generate"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 5,
    description: "Length of the generated sound effect in seconds"
  })
  declare duration: any;

  @prop({
    type: "int",
    default: 40,
    description:
      "Refinement level - Higher values may improve quality but take longer"
  })
  declare refinement: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducible results - leave empty for random generation"
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Describe the types of sounds you don't want to generate in the output, avoid double-negatives, compare with positive prompts"
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 16,
    description:
      "Creativity level - higher values allow more creative interpretation of the prompt"
  })
  declare creativity: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = Number(this.duration ?? 5);
    const refinement = Number(this.refinement ?? 40);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");
    const creativity = Number(this.creativity ?? 16);

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      refinement: refinement,
      seed: seed,
      negative_prompt: negativePrompt,
      creativity: creativity
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "beatoven/sound-effect-generation",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class BeatovenMusicGeneration extends FalNode {
  static readonly nodeType = "fal.text_to_audio.BeatovenMusicGeneration";
  static readonly title = "Beatoven Music Generation";
  static readonly description = `Music Generation
audio, generation, text-to-audio, tts`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    metadata: "dict[str, any]",
    audio: "audio"
  };

  @prop({
    type: "str",
    default: "",
    description: "Describe the music you want to generate"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 90,
    description: "Length of the generated music in seconds"
  })
  declare duration: any;

  @prop({
    type: "int",
    default: 100,
    description:
      "Refinement level - higher values may improve quality but take longer"
  })
  declare refinement: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducible results - leave empty for random generation"
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Describe what you want to avoid in the music (instruments, styles, moods). Leave blank for none."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 16,
    description:
      "Creativity level - higher values allow more creative interpretation of the prompt"
  })
  declare creativity: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = Number(this.duration ?? 90);
    const refinement = Number(this.refinement ?? 100);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");
    const creativity = Number(this.creativity ?? 16);

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      refinement: refinement,
      seed: seed,
      negative_prompt: negativePrompt,
      creativity: creativity
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "beatoven/music-generation", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class MinimaxMusicV15 extends FalNode {
  static readonly nodeType = "fal.text_to_audio.MinimaxMusicV15";
  static readonly title = "Minimax Music V15";
  static readonly description = `MiniMax (Hailuo AI) Music v1.5
audio, generation, text-to-audio, tts, professional`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "Lyrics, supports [intro][verse][chorus][bridge][outro] sections. 10-600 characters."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Control music generation. 10-3000 characters."
  })
  declare lyrics_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Audio configuration settings"
  })
  declare audio_setting: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const lyricsPrompt = String(this.lyrics_prompt ?? "");
    const audioSetting = String(this.audio_setting ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      lyrics_prompt: lyricsPrompt,
      audio_setting: audioSetting
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/minimax-music/v1.5", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class StableAudio25TextToAudio extends FalNode {
  static readonly nodeType = "fal.text_to_audio.StableAudio25TextToAudio";
  static readonly title = "Stable Audio25 Text To Audio";
  static readonly description = `Stable Audio 2.5
audio, generation, text-to-audio, tts`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate audio from"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "int",
    default: 190,
    description: "The duration of the audio clip to generate"
  })
  declare seconds_total: any;

  @prop({ type: "str", default: "" })
  declare seed: any;

  @prop({
    type: "int",
    default: 8,
    description: "The number of steps to denoise the audio for"
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "How strictly the diffusion process adheres to the prompt text (higher values make your audio closer to your prompt)."
  })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const syncMode = Boolean(this.sync_mode ?? false);
    const secondsTotal = Number(this.seconds_total ?? 190);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 8);
    const guidanceScale = Number(this.guidance_scale ?? 1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      sync_mode: syncMode,
      seconds_total: secondsTotal,
      seed: seed,
      num_inference_steps: numInferenceSteps,
      guidance_scale: guidanceScale
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/stable-audio-25/text-to-audio",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class SonautoV2Inpaint extends FalNode {
  static readonly nodeType = "fal.text_to_audio.SonautoV2Inpaint";
  static readonly title = "Sonauto V2 Inpaint";
  static readonly description = `Sonauto V2
audio, generation, text-to-audio, tts`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", audio: "list[File]" };

  @prop({
    type: "str",
    default: "",
    description:
      "The lyrics sung in the generated song. An empty string will generate an instrumental track."
  })
  declare lyrics_prompt: any;

  @prop({
    type: "list[str]",
    default: [],
    description:
      "Tags/styles of the music to generate. You can view a list of all available tags at https://sonauto.ai/tag-explorer."
  })
  declare tags: any;

  @prop({
    type: "float",
    default: 2,
    description:
      "Controls how strongly your prompt influences the output. Greater values adhere more to the prompt but sound less natural. (This is CFG.)"
  })
  declare prompt_strength: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The bit rate to use for mp3 and m4a formats. Not available for other formats."
  })
  declare output_bit_rate: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "Generating 2 songs costs 1.5x the price of generating 1 song. Also, note that using the same seed may not result in identical songs if the number of songs generated is changed."
  })
  declare num_songs: any;

  @prop({
    type: "enum",
    default: "wav",
    values: ["flac", "mp3", "wav", "ogg", "m4a"]
  })
  declare output_format: any;

  @prop({
    type: "bool",
    default: false,
    description: "Crop to the selected region"
  })
  declare selection_crop: any;

  @prop({
    type: "list[InpaintSection]",
    default: [],
    description:
      "List of sections to inpaint. Currently, only one section is supported so the list length must be 1."
  })
  declare sections: any;

  @prop({
    type: "float",
    default: 0.7,
    description:
      "Greater means more natural vocals. Lower means sharper instrumentals. We recommend 0.7."
  })
  declare balance_strength: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "The URL of the audio file to alter. Must be a valid publicly accessible URL."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The seed to use for generation. Will pick a random seed if not provided. Repeating a request with identical parameters (must use lyrics and tags, not prompt) and the same seed will generate the same song."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const lyricsPrompt = String(this.lyrics_prompt ?? "");
    const tags = String(this.tags ?? []);
    const promptStrength = Number(this.prompt_strength ?? 2);
    const outputBitRate = String(this.output_bit_rate ?? "");
    const numSongs = Number(this.num_songs ?? 1);
    const outputFormat = String(this.output_format ?? "wav");
    const selectionCrop = Boolean(this.selection_crop ?? false);
    const sections = String(this.sections ?? []);
    const balanceStrength = Number(this.balance_strength ?? 0.7);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      lyrics_prompt: lyricsPrompt,
      tags: tags,
      prompt_strength: promptStrength,
      output_bit_rate: outputBitRate,
      num_songs: numSongs,
      output_format: outputFormat,
      selection_crop: selectionCrop,
      sections: sections,
      balance_strength: balanceStrength,
      seed: seed
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "sonauto/v2/inpaint", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class SonautoV2TextToMusic extends FalNode {
  static readonly nodeType = "fal.text_to_audio.SonautoV2TextToMusic";
  static readonly title = "Sonauto V2 Text To Music";
  static readonly description = `Create full songs in any style
audio, generation, text-to-audio, sound`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    tags: "str",
    seed: "int",
    lyrics: "str",
    audio: "list[File]"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "A description of the track you want to generate. This prompt will be used to automatically generate the tags and lyrics unless you manually set them. For example, if you set prompt and tags, then the prompt will be used to generate only the lyrics."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The lyrics sung in the generated song. An empty string will generate an instrumental track."
  })
  declare lyrics_prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Tags/styles of the music to generate. You can view a list of all available tags at https://sonauto.ai/tag-explorer."
  })
  declare tags: any;

  @prop({
    type: "float",
    default: 2,
    description:
      "Controls how strongly your prompt influences the output. Greater values adhere more to the prompt but sound less natural. (This is CFG.)"
  })
  declare prompt_strength: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The bit rate to use for mp3 and m4a formats. Not available for other formats."
  })
  declare output_bit_rate: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "Generating 2 songs costs 1.5x the price of generating 1 song. Also, note that using the same seed may not result in identical songs if the number of songs generated is changed."
  })
  declare num_songs: any;

  @prop({
    type: "enum",
    default: "wav",
    values: ["flac", "mp3", "wav", "ogg", "m4a"]
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "auto",
    description:
      'The beats per minute of the song. This can be set to an integer or the literal string "auto" to pick a suitable bpm based on the tags. Set bpm to null to not condition the model on bpm information.'
  })
  declare bpm: any;

  @prop({
    type: "float",
    default: 0.7,
    description:
      "Greater means more natural vocals. Lower means sharper instrumentals. We recommend 0.7."
  })
  declare balance_strength: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The seed to use for generation. Will pick a random seed if not provided. Repeating a request with identical parameters (must use lyrics and tags, not prompt) and the same seed will generate the same song."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const lyricsPrompt = String(this.lyrics_prompt ?? "");
    const tags = String(this.tags ?? "");
    const promptStrength = Number(this.prompt_strength ?? 2);
    const outputBitRate = String(this.output_bit_rate ?? "");
    const numSongs = Number(this.num_songs ?? 1);
    const outputFormat = String(this.output_format ?? "wav");
    const bpm = String(this.bpm ?? "auto");
    const balanceStrength = Number(this.balance_strength ?? 0.7);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      lyrics_prompt: lyricsPrompt,
      tags: tags,
      prompt_strength: promptStrength,
      output_bit_rate: outputBitRate,
      num_songs: numSongs,
      output_format: outputFormat,
      bpm: bpm,
      balance_strength: balanceStrength,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "sonauto/v2/text-to-music", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class Lyria2 extends FalNode {
  static readonly nodeType = "fal.text_to_audio.Lyria2";
  static readonly title = "Lyria2";
  static readonly description = `Lyria 2 is Google's latest music generation model, you can generate any type of music with this model.
audio, generation, text-to-audio, sound`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt describing the music you want to generate"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "A seed for deterministic generation. If provided, the model will attempt to produce the same audio given the same prompt and other parameters."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "low quality",
    description: "A description of what to exclude from the generated audio"
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "low quality");

    const args: Record<string, unknown> = {
      prompt: prompt,
      seed: seed,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/lyria2", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class CassetteaiSoundEffectsGenerator extends FalNode {
  static readonly nodeType =
    "fal.text_to_audio.CassetteaiSoundEffectsGenerator";
  static readonly title = "Cassetteai Sound Effects Generator";
  static readonly description = `Create stunningly realistic sound effects in seconds - CassetteAI's Sound Effects Model generates high-quality SFX up to 30 seconds long in just 1 second of processing time
audio, generation, text-to-audio, sound`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio_file: "str" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate SFX."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 0,
    description: "The duration of the generated SFX in seconds."
  })
  declare duration: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = Number(this.duration ?? 0);

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "cassetteai/sound-effects-generator",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class CassetteaiMusicGenerator extends FalNode {
  static readonly nodeType = "fal.text_to_audio.CassetteaiMusicGenerator";
  static readonly title = "Cassetteai Music Generator";
  static readonly description = `CassetteAI's model generates a 30-second sample in under 2 seconds and a full 3-minute track in under 10 seconds. At 44.1 kHz stereo audio, expect a level of professional consistency with no breaks, no squeaks, and no random interruptions in your creations.
audio, generation, text-to-audio, sound`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio_file: "str" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate music from."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 0,
    description: "The duration of the generated music in seconds."
  })
  declare duration: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = Number(this.duration ?? 0);

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "cassetteai/music-generator", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class KokoroHindi extends FalNode {
  static readonly nodeType = "fal.text_to_audio.KokoroHindi";
  static readonly title = "Kokoro Hindi";
  static readonly description = `A fast and expressive Hindi text-to-speech model with clear pronunciation and accurate intonation.
audio, generation, text-to-audio, sound`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "float",
    default: 1,
    description: "Speed of the generated audio. Default is 1.0."
  })
  declare speed: any;

  @prop({
    type: "enum",
    default: "",
    values: ["hf_alpha", "hf_beta", "hm_omega", "hm_psi"],
    description: "Voice ID for the desired voice."
  })
  declare voice: any;

  @prop({ type: "str", default: "" })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const speed = Number(this.speed ?? 1);
    const voice = String(this.voice ?? "");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      speed: speed,
      voice: voice,
      prompt: prompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/kokoro/hindi", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class KokoroBritishEnglish extends FalNode {
  static readonly nodeType = "fal.text_to_audio.KokoroBritishEnglish";
  static readonly title = "Kokoro British English";
  static readonly description = `A high-quality British English text-to-speech model offering natural and expressive voice synthesis.
audio, generation, text-to-audio, sound`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "float",
    default: 1,
    description: "Speed of the generated audio. Default is 1.0."
  })
  declare speed: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "bf_alice",
      "bf_emma",
      "bf_isabella",
      "bf_lily",
      "bm_daniel",
      "bm_fable",
      "bm_george",
      "bm_lewis"
    ],
    description: "Voice ID for the desired voice."
  })
  declare voice: any;

  @prop({ type: "str", default: "" })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const speed = Number(this.speed ?? 1);
    const voice = String(this.voice ?? "");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      speed: speed,
      voice: voice,
      prompt: prompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/kokoro/british-english", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class KokoroAmericanEnglish extends FalNode {
  static readonly nodeType = "fal.text_to_audio.KokoroAmericanEnglish";
  static readonly title = "Kokoro American English";
  static readonly description = `Kokoro is a lightweight text-to-speech model that delivers comparable quality to larger models while being significantly faster and more cost-efficient.
audio, generation, text-to-audio, sound`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "float",
    default: 1,
    description: "Speed of the generated audio. Default is 1.0."
  })
  declare speed: any;

  @prop({
    type: "enum",
    default: "af_heart",
    values: [
      "af_heart",
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
      "am_santa"
    ],
    description: "Voice ID for the desired voice."
  })
  declare voice: any;

  @prop({ type: "str", default: "" })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const speed = Number(this.speed ?? 1);
    const voice = String(this.voice ?? "af_heart");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      speed: speed,
      voice: voice,
      prompt: prompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/kokoro/american-english", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class Zonos extends FalNode {
  static readonly nodeType = "fal.text_to_audio.Zonos";
  static readonly title = "Zonos";
  static readonly description = `Clone voice of any person and speak anything in their voice using zonos' voice cloning.
audio, generation, text-to-audio, sound`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description: "The content generated using cloned voice."
  })
  declare prompt: any;

  @prop({ type: "audio", default: "", description: "The reference audio." })
  declare reference_audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt
    };

    const referenceAudioRef = this.reference_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceAudioRef)) {
      const referenceAudioUrl = await assetToFalUrl(apiKey, referenceAudioRef!);
      if (referenceAudioUrl) args["reference_audio_url"] = referenceAudioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/zonos", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class KokoroItalian extends FalNode {
  static readonly nodeType = "fal.text_to_audio.KokoroItalian";
  static readonly title = "Kokoro Italian";
  static readonly description = `A high-quality Italian text-to-speech model delivering smooth and expressive speech synthesis.
audio, generation, text-to-audio, sound`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "float",
    default: 1,
    description: "Speed of the generated audio. Default is 1.0."
  })
  declare speed: any;

  @prop({
    type: "enum",
    default: "",
    values: ["if_sara", "im_nicola"],
    description: "Voice ID for the desired voice."
  })
  declare voice: any;

  @prop({ type: "str", default: "" })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const speed = Number(this.speed ?? 1);
    const voice = String(this.voice ?? "");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      speed: speed,
      voice: voice,
      prompt: prompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/kokoro/italian", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class KokoroBrazilianPortuguese extends FalNode {
  static readonly nodeType = "fal.text_to_audio.KokoroBrazilianPortuguese";
  static readonly title = "Kokoro Brazilian Portuguese";
  static readonly description = `A natural and expressive Brazilian Portuguese text-to-speech model optimized for clarity and fluency.
audio, generation, text-to-audio, sound`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "float",
    default: 1,
    description: "Speed of the generated audio. Default is 1.0."
  })
  declare speed: any;

  @prop({
    type: "enum",
    default: "",
    values: ["pf_dora", "pm_alex", "pm_santa"],
    description: "Voice ID for the desired voice."
  })
  declare voice: any;

  @prop({ type: "str", default: "" })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const speed = Number(this.speed ?? 1);
    const voice = String(this.voice ?? "");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      speed: speed,
      voice: voice,
      prompt: prompt
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kokoro/brazilian-portuguese",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class KokoroFrench extends FalNode {
  static readonly nodeType = "fal.text_to_audio.KokoroFrench";
  static readonly title = "Kokoro French";
  static readonly description = `An expressive and natural French text-to-speech model for both European and Canadian French.
audio, generation, text-to-audio, sound`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "float",
    default: 1,
    description: "Speed of the generated audio. Default is 1.0."
  })
  declare speed: any;

  @prop({
    type: "str",
    default: "",
    description: "Voice ID for the desired voice."
  })
  declare voice: any;

  @prop({ type: "str", default: "" })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const speed = Number(this.speed ?? 1);
    const voice = String(this.voice ?? "");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      speed: speed,
      voice: voice,
      prompt: prompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/kokoro/french", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class KokoroJapanese extends FalNode {
  static readonly nodeType = "fal.text_to_audio.KokoroJapanese";
  static readonly title = "Kokoro Japanese";
  static readonly description = `A fast and natural-sounding Japanese text-to-speech model optimized for smooth pronunciation.
audio, generation, text-to-audio, sound`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "float",
    default: 1,
    description: "Speed of the generated audio. Default is 1.0."
  })
  declare speed: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "jf_alpha",
      "jf_gongitsune",
      "jf_nezumi",
      "jf_tebukuro",
      "jm_kumo"
    ],
    description: "Voice ID for the desired voice."
  })
  declare voice: any;

  @prop({ type: "str", default: "" })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const speed = Number(this.speed ?? 1);
    const voice = String(this.voice ?? "");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      speed: speed,
      voice: voice,
      prompt: prompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/kokoro/japanese", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class KokoroMandarinChinese extends FalNode {
  static readonly nodeType = "fal.text_to_audio.KokoroMandarinChinese";
  static readonly title = "Kokoro Mandarin Chinese";
  static readonly description = `A highly efficient Mandarin Chinese text-to-speech model that captures natural tones and prosody.
audio, generation, text-to-audio, sound`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "float",
    default: 1,
    description: "Speed of the generated audio. Default is 1.0."
  })
  declare speed: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "zf_xiaobei",
      "zf_xiaoni",
      "zf_xiaoxiao",
      "zf_xiaoyi",
      "zm_yunjian",
      "zm_yunxi",
      "zm_yunxia",
      "zm_yunyang"
    ],
    description: "Voice ID for the desired voice."
  })
  declare voice: any;

  @prop({ type: "str", default: "" })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const speed = Number(this.speed ?? 1);
    const voice = String(this.voice ?? "");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      speed: speed,
      voice: voice,
      prompt: prompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/kokoro/mandarin-chinese", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class KokoroSpanish extends FalNode {
  static readonly nodeType = "fal.text_to_audio.KokoroSpanish";
  static readonly title = "Kokoro Spanish";
  static readonly description = `A natural-sounding Spanish text-to-speech model optimized for Latin American and European Spanish.
audio, generation, text-to-audio, sound`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "float",
    default: 1,
    description: "Speed of the generated audio. Default is 1.0."
  })
  declare speed: any;

  @prop({
    type: "enum",
    default: "",
    values: ["ef_dora", "em_alex", "em_santa"],
    description: "Voice ID for the desired voice."
  })
  declare voice: any;

  @prop({ type: "str", default: "" })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const speed = Number(this.speed ?? 1);
    const voice = String(this.voice ?? "");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      speed: speed,
      voice: voice,
      prompt: prompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/kokoro/spanish", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class Yue extends FalNode {
  static readonly nodeType = "fal.text_to_audio.Yue";
  static readonly title = "Yue";
  static readonly description = `YuE is a groundbreaking series of open-source foundation models designed for music generation, specifically for transforming lyrics into full songs.
audio, generation, text-to-audio, sound`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "The prompt to generate an image from. Must have two sections. Sections start with either [chorus] or a [verse]."
  })
  declare lyrics: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The genres (separated by a space ' ') to guide the music generation."
  })
  declare genres: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const lyrics = String(this.lyrics ?? "");
    const genres = String(this.genres ?? "");

    const args: Record<string, unknown> = {
      lyrics: lyrics,
      genres: genres
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/yue", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class MmaudioV2TextToAudio extends FalNode {
  static readonly nodeType = "fal.text_to_audio.MmaudioV2TextToAudio";
  static readonly title = "Mmaudio V2 Text To Audio";
  static readonly description = `MMAudio generates synchronized audio given text inputs. It can generate sounds described by a prompt.
audio, generation, text-to-audio, sound`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the audio for."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 25,
    description: "The number of steps to generate the audio for."
  })
  declare num_steps: any;

  @prop({
    type: "float",
    default: 8,
    description: "The duration of the audio to generate."
  })
  declare duration: any;

  @prop({
    type: "float",
    default: 4.5,
    description: "The strength of Classifier Free Guidance."
  })
  declare cfg_strength: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator"
  })
  declare seed: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to mask away the clip."
  })
  declare mask_away_clip: any;

  @prop({
    type: "str",
    default: "",
    description: "The negative prompt to generate the audio for."
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numSteps = Number(this.num_steps ?? 25);
    const duration = Number(this.duration ?? 8);
    const cfgStrength = Number(this.cfg_strength ?? 4.5);
    const seed = String(this.seed ?? "");
    const maskAwayClip = Boolean(this.mask_away_clip ?? false);
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_steps: numSteps,
      duration: duration,
      cfg_strength: cfgStrength,
      seed: seed,
      mask_away_clip: maskAwayClip,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/mmaudio-v2/text-to-audio",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class MinimaxMusic extends FalNode {
  static readonly nodeType = "fal.text_to_audio.MinimaxMusic";
  static readonly title = "Minimax Music";
  static readonly description = `Generate music from text prompts using the MiniMax model, which leverages advanced AI techniques to create high-quality, diverse musical compositions.
audio, generation, text-to-audio, sound`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "Lyrics with optional formatting. You can use a newline to separate each line of lyrics. You can use two newlines to add a pause between lines. You can use double hash marks (##) at the beginning and end of the lyrics to add accompaniment. Maximum 600 characters."
  })
  declare prompt: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "Reference song, should contain music and vocals. Must be a .wav or .mp3 file longer than 15 seconds."
  })
  declare reference_audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt
    };

    const referenceAudioRef = this.reference_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceAudioRef)) {
      const referenceAudioUrl = await assetToFalUrl(apiKey, referenceAudioRef!);
      if (referenceAudioUrl) args["reference_audio_url"] = referenceAudioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/minimax-music", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export const FAL_TEXT_TO_AUDIO_NODES: readonly NodeClass[] = [
  ACEStepPromptToAudio,
  ACEStep,
  CSM1B,
  DiffRhythm,
  ElevenLabsTTSMultilingualV2,
  ElevenLabsTextToDialogueV3,
  ElevenLabsSoundEffectsV2,
  ElevenLabsTTSV3,
  ElevenLabsMusic,
  F5TTS,
  Kokoro,
  StableAudio,
  XTTS,
  MinimaxMusicV2,
  BeatovenSoundEffectGeneration,
  BeatovenMusicGeneration,
  MinimaxMusicV15,
  StableAudio25TextToAudio,
  SonautoV2Inpaint,
  SonautoV2TextToMusic,
  Lyria2,
  CassetteaiSoundEffectsGenerator,
  CassetteaiMusicGenerator,
  KokoroHindi,
  KokoroBritishEnglish,
  KokoroAmericanEnglish,
  Zonos,
  KokoroItalian,
  KokoroBrazilianPortuguese,
  KokoroFrench,
  KokoroJapanese,
  KokoroMandarinChinese,
  KokoroSpanish,
  Yue,
  MmaudioV2TextToAudio,
  MinimaxMusic
] as const;
