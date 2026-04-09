import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getApiKey,
  kieExecuteTask,
  kieExecuteSunoTask,
  uploadAudioInput,
  isRefSet
} from "./kie-base.js";

// ── Suno-backed nodes ────────────────────────────────────────────────────────

export class GenerateMusicNode extends BaseNode {
  static readonly nodeType = "kie.audio.GenerateMusic";
  static readonly title = "Generate Music";
  static readonly description =
    "Generate music using Suno AI via Kie.ai.\n\n    kie, suno, music, audio, ai, generation, vocals, instrumental\n\n    Creates full tracks with vocals and instrumentals using Suno models.\n    Supports custom mode for strict lyric control and non-custom mode for easy prompts.\n\n    Use cases:\n    - Generate background music for projects\n    - Create AI-composed songs with vocals\n    - Produce instrumentals for content\n    - Generate music in various genres and styles";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
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
    title: "Model",
    description: "Suno model version to use.",
    values: ["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5"]
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
    title: "Vocal Gender",
    description: "Vocal gender preference (custom mode only).",
    values: ["", "m", "f"]
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
    const customMode = Boolean(this.custom_mode ?? false);
    const prompt = String(this.prompt ?? "");
    const model = String(this.model ?? "V4_5PLUS");
    const instrumental = Boolean(this.instrumental ?? false);

    const payload: Record<string, unknown> = {
      customMode,
      instrumental,
      callBackUrl: "https://example.com/callback",
      model,
      prompt
    };

    if (customMode) {
      const style = String(this.style ?? "");
      const title = String(this.title ?? "");
      if (!style) throw new Error("style is required in custom mode");
      if (!title) throw new Error("title is required in custom mode");
      if (!instrumental && !prompt)
        throw new Error("prompt required in custom mode with vocals");
      payload.style = style;
      payload.title = title;
      const neg = String(this.negative_tags ?? "");
      if (neg) payload.negativeTags = neg;
      const vg = String(this.vocal_gender ?? "");
      if (vg) payload.vocalGender = vg;
      const sw = Number(this.style_weight ?? 0);
      if (sw) payload.styleWeight = sw;
      const wc = Number(this.weirdness_constraint ?? 0);
      if (wc) payload.weirdnessConstraint = wc;
      const aw = Number(this.audio_weight ?? 0);
      if (aw) payload.audioWeight = aw;
      const pid = String(this.persona_id ?? "");
      if (pid) payload.personaId = pid;
    } else {
      if (!prompt) throw new Error("prompt is required");
    }

    const result = await kieExecuteSunoTask(apiKey, payload, 4000, 120);
    return { output: { type: "audio", data: result.data } };
  }
}

export class ExtendMusicNode extends BaseNode {
  static readonly nodeType = "kie.audio.ExtendMusic";
  static readonly title = "Extend Music";
  static readonly description =
    "Extend music using Suno AI via Kie.ai.\n\n    kie, suno, music, audio, ai, extension, continuation, remix\n\n    Extends an existing track by continuing from a specified time point.\n    Can reuse original parameters or override them with custom settings.";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
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
    title: "Model",
    description: "Suno model version to use (must match source audio).",
    values: ["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5"]
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
    title: "Vocal Gender",
    description: "Vocal gender preference.",
    values: ["", "m", "f"]
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
    const audioId = String(this.audio_id ?? "");
    if (!audioId) throw new Error("audio_id is required");

    const prompt = String(this.prompt ?? "");
    const style = String(this.style ?? "");
    const continueAt = Number(this.continue_at ?? 0);
    const model = String(this.model ?? "V4_5PLUS");
    const instrumental = Boolean((this as any).instrumental ?? false);

    const payload: Record<string, unknown> = {
      customMode: true,
      prompt,
      style,
      instrumental,
      model,
      continue_at: continueAt,
      audio_id: audioId,
      continue: true,
      callBackUrl: "https://example.com/callback"
    };

    const result = await kieExecuteSunoTask(apiKey, payload, 4000, 120);
    return { output: { type: "audio", data: result.data } };
  }
}

export class CoverAudioNode extends BaseNode {
  static readonly nodeType = "kie.audio.CoverAudio";
  static readonly title = "Cover Audio";
  static readonly description =
    "Cover an uploaded audio track using Suno AI via Kie.ai.\n\n    kie, suno, music, audio, ai, cover, upload, style transfer\n\n    Uploads a source track and generates a covered version in a new style while\n    retaining the original melody.";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
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
    title: "Model",
    description: "Suno model version to use.",
    values: ["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5"]
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
    title: "Vocal Gender",
    description: "Vocal gender preference (custom mode only).",
    values: ["", "m", "f"]
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
    const audio = this.audio;
    if (!isRefSet(audio)) throw new Error("audio is required");

    const audioUrl = await uploadAudioInput(apiKey, audio);
    const prompt = String(this.prompt ?? "");
    const style = String(this.style ?? "");
    const model = String(this.model ?? "V4_5PLUS");
    const instrumental = Boolean(this.instrumental ?? false);
    const vocalGender = String(this.vocal_gender ?? "");

    const payload: Record<string, unknown> = {
      customMode: true,
      prompt,
      style,
      instrumental,
      model,
      audio_url: audioUrl,
      cover: true,
      callBackUrl: "https://example.com/callback"
    };

    if (vocalGender) payload.vocalGender = vocalGender;

    const result = await kieExecuteSunoTask(apiKey, payload, 4000, 120);
    return { output: { type: "audio", data: result.data } };
  }
}

export class AddInstrumentalNode extends BaseNode {
  static readonly nodeType = "kie.audio.AddInstrumental";
  static readonly title = "Add Instrumental";
  static readonly description =
    "Add instrumental accompaniment to uploaded audio via Suno AI.\n\n    kie, suno, music, audio, ai, instrumental, accompaniment, upload\n\n    Uploads a source track (e.g., vocals/stems) and generates a backing track.";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
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
    title: "Model",
    description: "Suno model version to use.",
    values: ["V4_5PLUS", "V5"]
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "",
    title: "Vocal Gender",
    description: "Vocal gender preference.",
    values: ["", "m", "f"]
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
    const audio = this.audio;
    if (!isRefSet(audio)) throw new Error("audio is required");

    const audioUrl = await uploadAudioInput(apiKey, audio);
    const tags = String(this.tags ?? "");
    const titleVal = String(this.title ?? "");
    const model = String(this.model ?? "V4_5PLUS");

    const payload: Record<string, unknown> = {
      customMode: true,
      prompt: tags,
      style: titleVal,
      instrumental: true,
      model,
      audio_url: audioUrl,
      add_instrumental: true,
      callBackUrl: "https://example.com/callback"
    };

    const result = await kieExecuteSunoTask(apiKey, payload, 4000, 120);
    return { output: { type: "audio", data: result.data } };
  }
}

export class AddVocalsNode extends BaseNode {
  static readonly nodeType = "kie.audio.AddVocals";
  static readonly title = "Add Vocals";
  static readonly description =
    "Add AI vocals to uploaded audio via Suno AI.\n\n    kie, suno, music, audio, ai, vocals, singing, upload\n\n    Uploads an instrumental track and generates vocal layers on top.";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
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
    title: "Model",
    description: "Suno model version to use.",
    values: ["V4_5PLUS", "V5"]
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "",
    title: "Vocal Gender",
    description: "Vocal gender preference.",
    values: ["", "m", "f"]
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
    const audio = this.audio;
    if (!isRefSet(audio)) throw new Error("audio is required");

    const audioUrl = await uploadAudioInput(apiKey, audio);
    const prompt = String(this.prompt ?? "");
    const style = String(this.style ?? "");
    const model = String(this.model ?? "V4_5PLUS");
    const vocalGender = String(this.vocal_gender ?? "");

    const payload: Record<string, unknown> = {
      customMode: true,
      prompt,
      style,
      instrumental: false,
      model,
      audio_url: audioUrl,
      add_vocals: true,
      callBackUrl: "https://example.com/callback"
    };

    if (vocalGender) payload.vocalGender = vocalGender;

    const result = await kieExecuteSunoTask(apiKey, payload, 4000, 120);
    return { output: { type: "audio", data: result.data } };
  }
}

export class ReplaceMusicSectionNode extends BaseNode {
  static readonly nodeType = "kie.audio.ReplaceMusicSection";
  static readonly title = "Replace Music Section";
  static readonly description =
    "Replace a section of a generated Suno track.\n\n    kie, suno, music, replace, edit, infill\n\n    Regenerates a time range and blends it into the original track.";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
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
    const taskId = String(this.task_id ?? "");
    const audioId = String(this.audio_id ?? "");
    if (!taskId) throw new Error("task_id is required");
    if (!audioId) throw new Error("audio_id is required");

    const prompt = String(this.prompt ?? "");
    const tags = String(this.tags ?? "");
    const titleVal = String(this.title ?? "");
    const startTime = Number(this.infill_start_s ?? 0);
    const endTime = Number(this.infill_end_s ?? 30);

    const payload: Record<string, unknown> = {
      customMode: true,
      prompt,
      style: tags,
      title: titleVal,
      task_id: taskId,
      audio_id: audioId,
      replace_section: true,
      start_time: startTime,
      end_time: endTime,
      callBackUrl: "https://example.com/callback"
    };

    const result = await kieExecuteSunoTask(apiKey, payload, 4000, 120);
    return { output: { type: "audio", data: result.data } };
  }
}

// ── ElevenLabs-backed nodes ──────────────────────────────────────────────────

export class ElevenLabsTextToSpeechNode extends BaseNode {
  static readonly nodeType = "kie.audio.ElevenLabsTextToSpeech";
  static readonly title = "ElevenLabs Text To Speech";
  static readonly description =
    "Generate speech using ElevenLabs AI via Kie.ai.\n\n    kie, elevenlabs, tts, text-to-speech, voice, audio, ai, speech synthesis\n\n    Creates natural-sounding speech from text using ElevenLabs' voice models.\n    Supports multiple voices, stability controls, and multilingual output.\n\n    Use cases:\n    - Generate voiceovers for videos and podcasts\n    - Create audiobooks and narrated content\n    - Produce natural-sounding speech for applications\n    - Generate speech in multiple languages and voices";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
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
    title: "Model",
    description: "ElevenLabs model version to use.",
    values: ["text-to-speech-turbo-2-5", "text-to-speech-multilingual-v2"]
  })
  declare model: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const text = String(this.text ?? "");
    const voiceId = String(this.voice ?? "");
    const modelId = String(this.model ?? "eleven_multilingual_v2");

    if (!text) throw new Error("text is required");
    if (!voiceId) throw new Error("voice_id is required");

    const result = await kieExecuteTask(apiKey, "elevenlabs/text-to-speech", {
      text,
      voice_id: voiceId,
      model_id: modelId
    });

    return { output: { type: "audio", data: result.data } };
  }
}

export class ElevenLabsAudioIsolationNode extends BaseNode {
  static readonly nodeType = "kie.audio.ElevenLabsAudioIsolation";
  static readonly title = "ElevenLabs Audio Isolation";
  static readonly description =
    "Isolate speech from audio using ElevenLabs AI via Kie.ai.\n\n    kie, elevenlabs, audio-isolation, speech, noise-removal, ai\n\n    ElevenLabs Audio Isolation uses AI to remove background noise, music,\n    and interference while preserving clear, natural speech.\n\n    Use cases:\n    - Clean up podcast and interview recordings\n    - Remove background noise from audio\n    - Isolate speech for professional recordings\n    - Prepare audio for transcription or production";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
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
    const audio = this.audio;
    if (!isRefSet(audio)) throw new Error("audio is required");

    const audioUrl = await uploadAudioInput(apiKey, audio);

    const result = await kieExecuteTask(apiKey, "elevenlabs/audio-isolation", {
      audio_url: audioUrl
    });

    return { output: { type: "audio", data: result.data } };
  }
}

export class ElevenLabsSoundEffectNode extends BaseNode {
  static readonly nodeType = "kie.audio.ElevenLabsSoundEffect";
  static readonly title = "ElevenLabs Sound Effect";
  static readonly description =
    "Generate sound effects using ElevenLabs AI via Kie.ai.\n\n    kie, elevenlabs, sound-effect, sfx, audio, ai\n\n    ElevenLabs Sound Effect V2 generates audio from text descriptions,\n    supporting clips up to 20+ seconds with seamless looping and 48kHz audio.\n\n    Use cases:\n    - Generate custom sound effects for videos\n    - Create ambient sounds for games and applications\n    - Produce foley effects from text descriptions\n    - Generate audio elements for creative projects";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
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
    const text = String(this.text ?? "");
    const durationSeconds = Number(this.duration_seconds ?? 0);
    const promptInfluence = Number(this.prompt_influence ?? 0.3);

    if (!text) throw new Error("text is required");

    const taskInput: Record<string, unknown> = {
      text,
      prompt_influence: promptInfluence
    };
    if (durationSeconds > 0) taskInput.duration_seconds = durationSeconds;

    const result = await kieExecuteTask(
      apiKey,
      "elevenlabs/sound-effect",
      taskInput
    );

    return { output: { type: "audio", data: result.data } };
  }
}

export class ElevenLabsSpeechToTextNode extends BaseNode {
  static readonly nodeType = "kie.audio.ElevenLabsSpeechToText";
  static readonly title = "ElevenLabs Speech To Text";
  static readonly description =
    "Transcribe speech to text using ElevenLabs AI via Kie.ai.\n\n    kie, elevenlabs, speech-to-text, transcription, stt, ai\n\n    ElevenLabs Speech to Text (Scribe v1) delivers state-of-the-art transcription\n    with multilingual support, speaker diarization, and audio-event tagging.\n\n    Use cases:\n    - Transcribe podcasts and interviews\n    - Create subtitles for videos\n    - Convert audio recordings to text\n    - Generate meeting transcripts with speaker labels";
  static readonly metadataOutputTypes = {
    output: "text"
  };
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
    const audio = this.audio;
    if (!isRefSet(audio)) throw new Error("audio is required");

    const audioUrl = await uploadAudioInput(apiKey, audio);
    const languageCode = String(this.language_code ?? "en");

    const result = await kieExecuteTask(apiKey, "elevenlabs/speech-to-text", {
      audio_url: audioUrl,
      language_code: languageCode
    });

    return { output: result.data };
  }
}

export class ElevenLabsV3DialogueNode extends BaseNode {
  static readonly nodeType = "kie.audio.ElevenLabsV3Dialogue";
  static readonly title = "ElevenLabs V3 Dialogue";
  static readonly description =
    "Generate expressive dialogue using ElevenLabs V3 via Kie.ai.\n\n    kie, elevenlabs, v3, dialogue, tts, text-to-speech, multi-speaker, ai\n\n    ElevenLabs Eleven V3 enables expressive multilingual Text to Dialogue\n    with audio tag control, multi-speaker support, and natural delivery.\n\n    Use cases:\n    - Generate dialogue for storytelling applications\n    - Create multi-speaker audio content\n    - Produce expressive voiceovers with audio tags\n    - Generate natural conversation audio";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
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
    const script = String(this.text ?? "");
    const voiceAssignments = (this.voice ?? {}) as Record<string, string>;

    if (!script) throw new Error("script is required");

    const result = await kieExecuteTask(apiKey, "elevenlabs/v3-dialogue", {
      script,
      voice_assignments: voiceAssignments
    });

    return { output: { type: "audio", data: result.data } };
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

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
];
