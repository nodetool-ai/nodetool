import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getApiKey,
  kieExecuteTask,
  kieExecuteSunoTask,
  isRefSet,
  uploadAudioInput
} from "../kie-base.js";

export class GenerateMusicNode extends BaseNode {
  static readonly nodeType = "kie.audio.GenerateMusic";
  static readonly title = "Generate Music";
  static readonly description = `Generate music using Suno AI via Kie.ai.

    kie, suno, music, audio, ai, generation, vocals, instrumental

    Creates full tracks with vocals and instrumentals using Suno models.
    Supports custom mode for strict lyric control and non-custom mode for easy prompts.

    Use cases:
    - Generate background music for projects
    - Create AI-composed songs with vocals
    - Produce instrumentals for content
    - Generate music in various genres and styles`;
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "bool",
    default: false,
    title: "Custom Mode",
    description: "Enable custom mode for detailed control over style and title."
  })
  declare custom_mode: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description:
      "Music description or lyrics. In custom mode, this is used as lyrics when instrumental is false. In non-custom mode, this is the core idea."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Style",
    description: "Music style specification (required in custom mode)."
  })
  declare style: any;

  @prop({
    type: "str",
    default: "",
    title: "Title",
    description: "Track title (required in custom mode, max 80 characters)."
  })
  declare title: any;

  @prop({
    type: "bool",
    default: false,
    title: "Instrumental",
    description: "Generate instrumental-only (no vocals)."
  })
  declare instrumental: any;

  @prop({
    type: "enum",
    default: "V4_5PLUS",
    values: ["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5"],
    title: "Model",
    description: "Suno model version to use."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Tags",
    description: "Music styles or traits to exclude from the generated audio."
  })
  declare negative_tags: any;

  @prop({
    type: "enum",
    default: "",
    values: ["", "m", "f"],
    title: "Vocal Gender",
    description: "Vocal gender preference (custom mode only)."
  })
  declare vocal_gender: any;

  @prop({
    type: "float",
    default: 0,
    title: "Style Weight",
    description: "Strength of adherence to style (0-1)."
  })
  declare style_weight: any;

  @prop({
    type: "float",
    default: 0,
    title: "Weirdness Constraint",
    description: "Creative deviation control (0-1)."
  })
  declare weirdness_constraint: any;

  @prop({
    type: "float",
    default: 0,
    title: "Audio Weight",
    description: "Balance weight for audio features (0-1)."
  })
  declare audio_weight: any;

  @prop({
    type: "str",
    default: "",
    title: "Persona Id",
    description: "Persona ID to apply (custom mode only)."
  })
  declare persona_id: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("prompt is required");
    const params: Record<string, unknown> = {};
    params["customMode"] = Boolean(this.custom_mode ?? false);
    params["prompt"] = String(this.prompt ?? "");
    params["style"] = String(this.style ?? "");
    params["title"] = String(this.title ?? "");
    params["instrumental"] = Boolean(this.instrumental ?? false);
    params["model"] = String(this.model ?? "V4_5PLUS");
    if (this.negative_tags)
      params["negativeTags"] = String(this.negative_tags ?? "");
    if (this.vocal_gender)
      params["vocalGender"] = String(this.vocal_gender ?? "");
    if (this.style_weight)
      params["styleWeight"] = Number(this.style_weight ?? 0);
    if (this.weirdness_constraint)
      params["weirdnessConstraint"] = Number(this.weirdness_constraint ?? 0);
    if (this.audio_weight)
      params["audioWeight"] = Number(this.audio_weight ?? 0);
    if (this.persona_id) params["personaId"] = String(this.persona_id ?? "");

    const result = await kieExecuteSunoTask(apiKey, params, 4000, 120);
    return { output: { type: "audio", data: result.data } };
  }
}

export class ExtendMusicNode extends BaseNode {
  static readonly nodeType = "kie.audio.ExtendMusic";
  static readonly title = "Extend Music";
  static readonly description = `Extend music using Suno AI via Kie.ai.

    kie, suno, music, audio, ai, extension, continuation, remix

    Extends an existing track by continuing from a specified time point.
    Can reuse original parameters or override them with custom settings.`;
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "bool",
    default: false,
    title: "Default Param Flag",
    description:
      "If true, use custom parameters (prompt/style/title/continue_at). If false, inherit parameters from the source audio."
  })
  declare default_param_flag: any;

  @prop({
    type: "str",
    default: "",
    title: "Audio Id",
    description: "Audio ID to extend."
  })
  declare audio_id: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Description of the desired extension content."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Style",
    description: "Music style for the extension (required for custom params)."
  })
  declare style: any;

  @prop({
    type: "str",
    default: "",
    title: "Title",
    description: "Title for the extended track (required for custom params)."
  })
  declare title: any;

  @prop({
    type: "float",
    default: 0,
    title: "Continue At",
    description:
      "Time in seconds to start extending from (required for custom params).",
    min: 0
  })
  declare continue_at: any;

  @prop({
    type: "enum",
    default: "V4_5PLUS",
    values: ["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5"],
    title: "Model",
    description: "Suno model version to use (must match source audio)."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Tags",
    description: "Music styles or traits to exclude from the extension."
  })
  declare negative_tags: any;

  @prop({
    type: "enum",
    default: "",
    values: ["", "m", "f"],
    title: "Vocal Gender",
    description: "Vocal gender preference."
  })
  declare vocal_gender: any;

  @prop({
    type: "float",
    default: 0,
    title: "Style Weight",
    description: "Strength of adherence to style (0-1)."
  })
  declare style_weight: any;

  @prop({
    type: "float",
    default: 0,
    title: "Weirdness Constraint",
    description: "Creative deviation control (0-1)."
  })
  declare weirdness_constraint: any;

  @prop({
    type: "float",
    default: 0,
    title: "Audio Weight",
    description: "Balance weight for audio features (0-1)."
  })
  declare audio_weight: any;

  @prop({
    type: "str",
    default: "",
    title: "Persona Id",
    description: "Persona ID to apply (custom params only)."
  })
  declare persona_id: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.audio_id ?? "").trim())
      throw new Error("audio_id is required");
    const params: Record<string, unknown> = {};
    params["default_param_flag"] = Boolean(this.default_param_flag ?? false);
    params["audio_id"] = String(this.audio_id ?? "");
    params["prompt"] = String(this.prompt ?? "");
    params["style"] = String(this.style ?? "");
    params["title"] = String(this.title ?? "");
    params["continue_at"] = Number(this.continue_at ?? 0);
    params["model"] = String(this.model ?? "V4_5PLUS");
    params["negative_tags"] = String(this.negative_tags ?? "");
    params["vocal_gender"] = String(this.vocal_gender ?? "");
    params["style_weight"] = Number(this.style_weight ?? 0);
    params["weirdness_constraint"] = Number(this.weirdness_constraint ?? 0);
    params["audio_weight"] = Number(this.audio_weight ?? 0);
    params["persona_id"] = String(this.persona_id ?? "");

    const result = await kieExecuteSunoTask(apiKey, params, 4000, 120);
    return { output: { type: "audio", data: result.data } };
  }
}

export class CoverAudioNode extends BaseNode {
  static readonly nodeType = "kie.audio.CoverAudio";
  static readonly title = "Cover Audio";
  static readonly description = `Cover an uploaded audio track using Suno AI via Kie.ai.

    kie, suno, music, audio, ai, cover, upload, style transfer

    Uploads a source track and generates a covered version in a new style while
    retaining the original melody.`;
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "bool",
    default: false,
    title: "Custom Mode",
    description: "Enable custom mode for detailed control over style and title."
  })
  declare custom_mode: any;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "Source audio to upload for covering."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description:
      "Music description or lyrics. In custom mode, this is used as lyrics when instrumental is false. In non-custom mode, this is the core idea."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Style",
    description: "Music style specification (required in custom mode)."
  })
  declare style: any;

  @prop({
    type: "str",
    default: "",
    title: "Title",
    description: "Track title (required in custom mode)."
  })
  declare title: any;

  @prop({
    type: "bool",
    default: false,
    title: "Instrumental",
    description: "Generate instrumental-only (no vocals)."
  })
  declare instrumental: any;

  @prop({
    type: "enum",
    default: "V4_5PLUS",
    values: ["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5"],
    title: "Model",
    description: "Suno model version to use."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Tags",
    description: "Music styles or traits to exclude from the generated audio."
  })
  declare negative_tags: any;

  @prop({
    type: "enum",
    default: "",
    values: ["", "m", "f"],
    title: "Vocal Gender",
    description: "Vocal gender preference (custom mode only)."
  })
  declare vocal_gender: any;

  @prop({
    type: "float",
    default: 0,
    title: "Style Weight",
    description: "Strength of adherence to style (0-1)."
  })
  declare style_weight: any;

  @prop({
    type: "float",
    default: 0,
    title: "Weirdness Constraint",
    description: "Creative deviation control (0-1)."
  })
  declare weirdness_constraint: any;

  @prop({
    type: "float",
    default: 0,
    title: "Audio Weight",
    description: "Balance weight for audio features (0-1)."
  })
  declare audio_weight: any;

  @prop({
    type: "str",
    default: "",
    title: "Persona Id",
    description: "Persona ID to apply (custom mode only)."
  })
  declare persona_id: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.audio ?? "").trim()) throw new Error("audio is required");
    let audioUrl = "";
    if (isRefSet(this.audio))
      audioUrl = await uploadAudioInput(apiKey, this.audio);
    const params: Record<string, unknown> = {};
    params["custom_mode"] = Boolean(this.custom_mode ?? false);
    params["prompt"] = String(this.prompt ?? "");
    params["style"] = String(this.style ?? "");
    params["title"] = String(this.title ?? "");
    params["instrumental"] = Boolean(this.instrumental ?? false);
    params["model"] = String(this.model ?? "V4_5PLUS");
    params["negative_tags"] = String(this.negative_tags ?? "");
    if (this.vocal_gender)
      params["vocalGender"] = String(this.vocal_gender ?? "");
    params["style_weight"] = Number(this.style_weight ?? 0);
    params["weirdness_constraint"] = Number(this.weirdness_constraint ?? 0);
    params["audio_weight"] = Number(this.audio_weight ?? 0);
    params["persona_id"] = String(this.persona_id ?? "");
    if (audioUrl) params["audio_url"] = audioUrl;

    const result = await kieExecuteSunoTask(apiKey, params, 4000, 120);
    return { output: { type: "audio", data: result.data } };
  }
}

export class AddInstrumentalNode extends BaseNode {
  static readonly nodeType = "kie.audio.AddInstrumental";
  static readonly title = "Add Instrumental";
  static readonly description = `Add instrumental accompaniment to uploaded audio via Suno AI.

    kie, suno, music, audio, ai, instrumental, accompaniment, upload

    Uploads a source track (e.g., vocals/stems) and generates a backing track.`;
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "Source audio to upload for instrumental generation."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    title: "Title",
    description: "Title of the generated music."
  })
  declare title: any;

  @prop({
    type: "str",
    default: "",
    title: "Tags",
    description: "Music styles or tags to include in the generated music."
  })
  declare tags: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Tags",
    description: "Music styles or characteristics to exclude."
  })
  declare negative_tags: any;

  @prop({
    type: "enum",
    default: "V4_5PLUS",
    values: ["V4_5PLUS", "V5"],
    title: "Model",
    description: "Suno model version to use."
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "",
    values: ["", "m", "f"],
    title: "Vocal Gender",
    description: "Vocal gender preference."
  })
  declare vocal_gender: any;

  @prop({
    type: "float",
    default: 0,
    title: "Style Weight",
    description: "Strength of adherence to style (0-1)."
  })
  declare style_weight: any;

  @prop({
    type: "float",
    default: 0,
    title: "Weirdness Constraint",
    description: "Creative deviation control (0-1)."
  })
  declare weirdness_constraint: any;

  @prop({
    type: "float",
    default: 0,
    title: "Audio Weight",
    description: "Balance weight for audio features (0-1)."
  })
  declare audio_weight: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.audio ?? "").trim()) throw new Error("audio is required");
    let audioUrl = "";
    if (isRefSet(this.audio))
      audioUrl = await uploadAudioInput(apiKey, this.audio);
    const params: Record<string, unknown> = {};
    params["style"] = String(this.title ?? "");
    params["prompt"] = String(this.tags ?? "");
    params["negative_tags"] = String(this.negative_tags ?? "");
    params["model"] = String(this.model ?? "V4_5PLUS");
    params["vocal_gender"] = String(this.vocal_gender ?? "");
    params["style_weight"] = Number(this.style_weight ?? 0);
    params["weirdness_constraint"] = Number(this.weirdness_constraint ?? 0);
    params["audio_weight"] = Number(this.audio_weight ?? 0);
    if (audioUrl) params["audio_url"] = audioUrl;

    const result = await kieExecuteSunoTask(apiKey, params, 4000, 120);
    return { output: { type: "audio", data: result.data } };
  }
}

export class AddVocalsNode extends BaseNode {
  static readonly nodeType = "kie.audio.AddVocals";
  static readonly title = "Add Vocals";
  static readonly description = `Add AI vocals to uploaded audio via Suno AI.

    kie, suno, music, audio, ai, vocals, singing, upload

    Uploads an instrumental track and generates vocal layers on top.`;
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "Source audio to upload for vocal generation."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt describing lyric content and singing style."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Title",
    description: "Title of the generated music."
  })
  declare title: any;

  @prop({
    type: "str",
    default: "",
    title: "Style",
    description: "Music style for vocal generation."
  })
  declare style: any;

  @prop({
    type: "str",
    default: "",
    title: "Tags",
    description: "Optional music tags to include in the generation."
  })
  declare tags: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Tags",
    description: "Excluded music styles or elements."
  })
  declare negative_tags: any;

  @prop({
    type: "enum",
    default: "V4_5PLUS",
    values: ["V4_5PLUS", "V5"],
    title: "Model",
    description: "Suno model version to use."
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "",
    values: ["", "m", "f"],
    title: "Vocal Gender",
    description: "Vocal gender preference."
  })
  declare vocal_gender: any;

  @prop({
    type: "float",
    default: 0,
    title: "Style Weight",
    description: "Strength of adherence to style (0-1)."
  })
  declare style_weight: any;

  @prop({
    type: "float",
    default: 0,
    title: "Weirdness Constraint",
    description: "Creative deviation control (0-1)."
  })
  declare weirdness_constraint: any;

  @prop({
    type: "float",
    default: 0,
    title: "Audio Weight",
    description: "Balance weight for audio features (0-1)."
  })
  declare audio_weight: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.audio ?? "").trim()) throw new Error("audio is required");
    let audioUrl = "";
    if (isRefSet(this.audio))
      audioUrl = await uploadAudioInput(apiKey, this.audio);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["title"] = String(this.title ?? "");
    params["style"] = String(this.style ?? "");
    params["tags"] = String(this.tags ?? "");
    params["negative_tags"] = String(this.negative_tags ?? "");
    params["model"] = String(this.model ?? "V4_5PLUS");
    if (this.vocal_gender)
      params["vocalGender"] = String(this.vocal_gender ?? "");
    params["style_weight"] = Number(this.style_weight ?? 0);
    params["weirdness_constraint"] = Number(this.weirdness_constraint ?? 0);
    params["audio_weight"] = Number(this.audio_weight ?? 0);
    if (audioUrl) params["audio_url"] = audioUrl;

    const result = await kieExecuteSunoTask(apiKey, params, 4000, 120);
    return { output: { type: "audio", data: result.data } };
  }
}

export class ReplaceMusicSectionNode extends BaseNode {
  static readonly nodeType = "kie.audio.ReplaceMusicSection";
  static readonly title = "Replace Music Section";
  static readonly description = `Replace a section of a generated Suno track.

    kie, suno, music, replace, edit, infill

    Regenerates a time range and blends it into the original track.`;
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Task Id",
    description: "Original music task ID."
  })
  declare task_id: any;

  @prop({
    type: "str",
    default: "",
    title: "Audio Id",
    description: "Audio ID to replace."
  })
  declare audio_id: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt describing the replacement segment content."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Tags",
    description: "Music style tags."
  })
  declare tags: any;

  @prop({
    type: "str",
    default: "",
    title: "Title",
    description: "Music title."
  })
  declare title: any;

  @prop({
    type: "float",
    default: 0,
    title: "Infill Start S",
    description: "Start time point for replacement (seconds).",
    min: 0
  })
  declare infill_start_s: any;

  @prop({
    type: "float",
    default: 0,
    title: "Infill End S",
    description: "End time point for replacement (seconds).",
    min: 0
  })
  declare infill_end_s: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Tags",
    description: "Excluded music styles for the replacement segment."
  })
  declare negative_tags: any;

  @prop({
    type: "str",
    default: "",
    title: "Full Lyrics",
    description: "Full lyrics after modification."
  })
  declare full_lyrics: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.task_id ?? "").trim())
      throw new Error("task_id is required");
    if (!String(this.audio_id ?? "").trim())
      throw new Error("audio_id is required");
    const params: Record<string, unknown> = {};
    params["task_id"] = String(this.task_id ?? "");
    params["audio_id"] = String(this.audio_id ?? "");
    params["prompt"] = String(this.prompt ?? "");
    params["style"] = String(this.tags ?? "");
    params["title"] = String(this.title ?? "");
    params["start_time"] = Number(this.infill_start_s ?? 0);
    params["end_time"] = Number(this.infill_end_s ?? 0);
    params["negative_tags"] = String(this.negative_tags ?? "");
    params["full_lyrics"] = String(this.full_lyrics ?? "");

    const result = await kieExecuteSunoTask(apiKey, params, 4000, 120);
    return { output: { type: "audio", data: result.data } };
  }
}

export class ElevenLabsTextToSpeechNode extends BaseNode {
  static readonly nodeType = "kie.audio.ElevenLabsTextToSpeech";
  static readonly title = "ElevenLabs Text To Speech";
  static readonly description = `Generate speech using ElevenLabs AI via Kie.ai.

    kie, elevenlabs, tts, text-to-speech, voice, audio, ai, speech synthesis

    Creates natural-sounding speech from text using ElevenLabs' voice models.
    Supports multiple voices, stability controls, and multilingual output.

    Use cases:
    - Generate voiceovers for videos and podcasts
    - Create audiobooks and narrated content
    - Produce natural-sounding speech for applications
    - Generate speech in multiple languages and voices`;
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to convert to speech."
  })
  declare text: any;

  @prop({
    type: "str",
    default: "Rachel",
    title: "Voice",
    description:
      "The voice ID to use for synthesis. Common voices: Rachel, Adam, Bella, Antoni."
  })
  declare voice: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Stability",
    description:
      "Stability of the voice output. Lower values are more expressive, higher values are more consistent.",
    min: 0,
    max: 1
  })
  declare stability: any;

  @prop({
    type: "float",
    default: 0.75,
    title: "Similarity Boost",
    description:
      "How closely to clone the voice characteristics. Higher values match the voice more closely.",
    min: 0,
    max: 1
  })
  declare similarity_boost: any;

  @prop({
    type: "float",
    default: 0,
    title: "Style",
    description: "Style parameter for voice expression. Range 0.0 to 1.0.",
    min: 0,
    max: 1
  })
  declare style: any;

  @prop({
    type: "float",
    default: 1,
    title: "Speed",
    description: "Speed of the speech. Range 0.5 to 1.5.",
    min: 0.5,
    max: 1.5
  })
  declare speed: any;

  @prop({
    type: "str",
    default: "",
    title: "Language Code",
    description:
      "Language code for multilingual TTS (e.g., 'en', 'es', 'fr', 'de'). Leave empty for auto-detection."
  })
  declare language_code: any;

  @prop({
    type: "enum",
    default: "text-to-speech-turbo-2-5",
    values: ["text-to-speech-turbo-2-5", "text-to-speech-multilingual-v2"],
    title: "Model",
    description: "ElevenLabs model version to use."
  })
  declare model: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.text ?? "").trim()) throw new Error("text is required");
    if (!String(this.voice ?? "").trim())
      throw new Error("voice_id is required");
    const params: Record<string, unknown> = {};
    params["text"] = String(this.text ?? "");
    params["voice_id"] = String(this.voice ?? "Rachel");
    params["stability"] = Number(this.stability ?? 0.5);
    params["similarity_boost"] = Number(this.similarity_boost ?? 0.75);
    params["style"] = Number(this.style ?? 0);
    params["speed"] = Number(this.speed ?? 1);
    params["language_code"] = String(this.language_code ?? "");
    params["model_id"] = String(this.model ?? "text-to-speech-turbo-2-5");

    const result = await kieExecuteTask(
      apiKey,
      "elevenlabs/text-to-speech",
      params,
      4000,
      120
    );
    return { output: { type: "audio", data: result.data } };
  }
}

export class ElevenLabsAudioIsolationNode extends BaseNode {
  static readonly nodeType = "kie.audio.ElevenLabsAudioIsolation";
  static readonly title = "ElevenLabs Audio Isolation";
  static readonly description = `Isolate speech from audio using ElevenLabs AI via Kie.ai.

    kie, elevenlabs, audio-isolation, speech, noise-removal, ai

    ElevenLabs Audio Isolation uses AI to remove background noise, music,
    and interference while preserving clear, natural speech.

    Use cases:
    - Clean up podcast and interview recordings
    - Remove background noise from audio
    - Isolate speech for professional recordings
    - Prepare audio for transcription or production`;
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "Audio file to process for speech isolation."
  })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.audio ?? "").trim()) throw new Error("audio is required");
    let audioUrl = "";
    if (isRefSet(this.audio))
      audioUrl = await uploadAudioInput(apiKey, this.audio);
    const params: Record<string, unknown> = {};
    if (audioUrl) params["audio_url"] = audioUrl;

    const result = await kieExecuteTask(
      apiKey,
      "elevenlabs/audio-isolation",
      params,
      4000,
      120
    );
    return { output: { type: "audio", data: result.data } };
  }
}

export class ElevenLabsSoundEffectNode extends BaseNode {
  static readonly nodeType = "kie.audio.ElevenLabsSoundEffect";
  static readonly title = "ElevenLabs Sound Effect";
  static readonly description = `Generate sound effects using ElevenLabs AI via Kie.ai.

    kie, elevenlabs, sound-effect, sfx, audio, ai

    ElevenLabs Sound Effect V2 generates audio from text descriptions,
    supporting clips up to 20+ seconds with seamless looping and 48kHz audio.

    Use cases:
    - Generate custom sound effects for videos
    - Create ambient sounds for games and applications
    - Produce foley effects from text descriptions
    - Generate audio elements for creative projects`;
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "Text description of the sound effect to generate."
  })
  declare text: any;

  @prop({
    type: "float",
    default: 5,
    title: "Duration Seconds",
    description: "Duration of the sound effect in seconds (up to 22 seconds).",
    min: 0.5,
    max: 22
  })
  declare duration_seconds: any;

  @prop({
    type: "float",
    default: 0.3,
    title: "Prompt Influence",
    description: "How strongly the prompt influences generation (0-1).",
    min: 0,
    max: 1
  })
  declare prompt_influence: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.text ?? "").trim()) throw new Error("text is required");
    const params: Record<string, unknown> = {};
    params["text"] = String(this.text ?? "");
    if (this.duration_seconds)
      params["duration_seconds"] = Number(this.duration_seconds ?? 5);
    params["prompt_influence"] = Number(this.prompt_influence ?? 0.3);

    const result = await kieExecuteTask(
      apiKey,
      "elevenlabs/sound-effect",
      params,
      4000,
      120
    );
    return { output: { type: "audio", data: result.data } };
  }
}

export class ElevenLabsSpeechToTextNode extends BaseNode {
  static readonly nodeType = "kie.audio.ElevenLabsSpeechToText";
  static readonly title = "ElevenLabs Speech To Text";
  static readonly description = `Transcribe speech to text using ElevenLabs AI via Kie.ai.

    kie, elevenlabs, speech-to-text, transcription, stt, ai

    ElevenLabs Speech to Text (Scribe v1) delivers state-of-the-art transcription
    with multilingual support, speaker diarization, and audio-event tagging.

    Use cases:
    - Transcribe podcasts and interviews
    - Create subtitles for videos
    - Convert audio recordings to text
    - Generate meeting transcripts with speaker labels`;
  static readonly metadataOutputTypes = { output: "text" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "Audio file to transcribe."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    title: "Language Code",
    description:
      "Language code (e.g., 'en', 'es', 'fr'). Leave empty for auto-detection."
  })
  declare language_code: any;

  @prop({
    type: "bool",
    default: false,
    title: "Diarization",
    description: "Enable speaker diarization to identify different speakers."
  })
  declare diarization: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.audio ?? "").trim()) throw new Error("audio is required");
    let audioUrl = "";
    if (isRefSet(this.audio))
      audioUrl = await uploadAudioInput(apiKey, this.audio);
    const params: Record<string, unknown> = {};
    params["language_code"] = String(this.language_code ?? "");
    params["diarization"] = Boolean(this.diarization ?? false);
    if (audioUrl) params["audio_url"] = audioUrl;

    const result = await kieExecuteTask(
      apiKey,
      "elevenlabs/speech-to-text",
      params,
      4000,
      120
    );
    return { output: { type: "text", data: result.data } };
  }
}

export class ElevenLabsV3DialogueNode extends BaseNode {
  static readonly nodeType = "kie.audio.ElevenLabsV3Dialogue";
  static readonly title = "ElevenLabs V3 Dialogue";
  static readonly description = `Generate expressive dialogue using ElevenLabs V3 via Kie.ai.

    kie, elevenlabs, v3, dialogue, tts, text-to-speech, multi-speaker, ai

    ElevenLabs Eleven V3 enables expressive multilingual Text to Dialogue
    with audio tag control, multi-speaker support, and natural delivery.

    Use cases:
    - Generate dialogue for storytelling applications
    - Create multi-speaker audio content
    - Produce expressive voiceovers with audio tags
    - Generate natural conversation audio`;
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description:
      "The dialogue text to convert to speech. Supports audio tags for control."
  })
  declare text: any;

  @prop({
    type: "str",
    default: "Rachel",
    title: "Voice",
    description: "Primary voice ID to use for synthesis."
  })
  declare voice: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Stability",
    description: "Stability of the voice output (0-1).",
    min: 0,
    max: 1
  })
  declare stability: any;

  @prop({
    type: "float",
    default: 0.75,
    title: "Similarity Boost",
    description: "Voice clone similarity (0-1).",
    min: 0,
    max: 1
  })
  declare similarity_boost: any;

  @prop({
    type: "float",
    default: 0,
    title: "Style",
    description: "Style expression parameter (0-1).",
    min: 0,
    max: 1
  })
  declare style: any;

  @prop({
    type: "float",
    default: 1,
    title: "Speed",
    description: "Speech speed (0.5-1.5).",
    min: 0.5,
    max: 1.5
  })
  declare speed: any;

  @prop({
    type: "str",
    default: "",
    title: "Language Code",
    description:
      "Language code for multilingual output. Leave empty for auto-detection."
  })
  declare language_code: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.text ?? "").trim()) throw new Error("script is required");
    const params: Record<string, unknown> = {};
    params["script"] = String(this.text ?? "");
    params["voice_assignments"] = String(this.voice ?? "Rachel");
    params["stability"] = Number(this.stability ?? 0.5);
    params["similarity_boost"] = Number(this.similarity_boost ?? 0.75);
    params["style"] = Number(this.style ?? 0);
    params["speed"] = Number(this.speed ?? 1);
    params["language_code"] = String(this.language_code ?? "");

    const result = await kieExecuteTask(
      apiKey,
      "elevenlabs/v3-dialogue",
      params,
      4000,
      120
    );
    return { output: { type: "audio", data: result.data } };
  }
}

export const KIE_AUDIO_NODES: readonly NodeClass[] = [
  GenerateMusicNode,
  ExtendMusicNode,
  CoverAudioNode,
  AddInstrumentalNode,
  AddVocalsNode,
  ReplaceMusicSectionNode,
  ElevenLabsTextToSpeechNode,
  ElevenLabsAudioIsolationNode,
  ElevenLabsSoundEffectNode,
  ElevenLabsSpeechToTextNode,
  ElevenLabsV3DialogueNode
] as const;
