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

export class AceStepAudioInpaint extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.AceStepAudioInpaint";
  static readonly title = "Ace Step Audio Inpaint";
  static readonly description = `Modify a portion of provided audio with lyrics and/or style using ACE-Step
audio, processing, audio-to-audio, transformation`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "tags": "str", "lyrics": "str", "seed": "int", "audio": "audio" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/ace-step/audio-inpaint",
    unitPrice: 0.0002,
    billingUnit: "seconds",
    currency: "USD",
  };

  @prop({ type: "int", default: 27, description: "Number of steps to generate the audio." })
  declare number_of_steps: any;

  @prop({ type: "float", default: 0, description: "start time in seconds for the inpainting process." })
  declare start_time: any;

  @prop({ type: "str", default: "", description: "Comma-separated list of genre tags to control the style of the generated audio." })
  declare tags: any;

  @prop({ type: "float", default: 3, description: "Minimum guidance scale for the generation after the decay." })
  declare minimum_guidance_scale: any;

  @prop({ type: "str", default: "", description: "Lyrics to be sung in the audio. If not provided or if [inst] or [instrumental] is the content of this field, no lyrics will be sung. Use control structures like [verse], [chorus] and [bridge] to control the structure of the song." })
  declare lyrics: any;

  @prop({ type: "enum", default: "start", values: ["start", "end"], description: "Whether the end time is relative to the start or end of the audio." })
  declare end_time_relative_to: any;

  @prop({ type: "float", default: 5, description: "Tag guidance scale for the generation." })
  declare tag_guidance_scale: any;

  @prop({ type: "enum", default: "euler", values: ["euler", "heun"], description: "Scheduler to use for the generation process." })
  declare scheduler: any;

  @prop({ type: "float", default: 30, description: "end time in seconds for the inpainting process." })
  declare end_time: any;

  @prop({ type: "enum", default: "apg", values: ["cfg", "apg", "cfg_star"], description: "Type of CFG to use for the generation process." })
  declare guidance_type: any;

  @prop({ type: "float", default: 15, description: "Guidance scale for the generation." })
  declare guidance_scale: any;

  @prop({ type: "float", default: 1.5, description: "Lyric guidance scale for the generation." })
  declare lyric_guidance_scale: any;

  @prop({ type: "float", default: 0.5, description: "Guidance interval for the generation. 0.5 means only apply guidance in the middle steps (0.25 * infer_steps to 0.75 * infer_steps)" })
  declare guidance_interval: any;

  @prop({ type: "float", default: 0.5, description: "Variance for the inpainting process. Higher values can lead to more diverse results." })
  declare variance: any;

  @prop({ type: "float", default: 0, description: "Guidance interval decay for the generation. Guidance scale will decay from guidance_scale to min_guidance_scale in the interval. 0.0 means no decay." })
  declare guidance_interval_decay: any;

  @prop({ type: "enum", default: "start", values: ["start", "end"], description: "Whether the start time is relative to the start or end of the audio." })
  declare start_time_relative_to: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to be inpainted." })
  declare audio: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility. If not provided, a random seed will be used." })
  declare seed: any;

  @prop({ type: "int", default: 10, description: "Granularity scale for the generation process. Higher values can reduce artifacts." })
  declare granularity_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const numberOfSteps = Number(this.number_of_steps ?? 27);
    const startTime = Number(this.start_time ?? 0);
    const tags = String(this.tags ?? "");
    const minimumGuidanceScale = Number(this.minimum_guidance_scale ?? 3);
    const lyrics = String(this.lyrics ?? "");
    const endTimeRelativeTo = String(this.end_time_relative_to ?? "start");
    const tagGuidanceScale = Number(this.tag_guidance_scale ?? 5);
    const scheduler = String(this.scheduler ?? "euler");
    const endTime = Number(this.end_time ?? 30);
    const guidanceType = String(this.guidance_type ?? "apg");
    const guidanceScale = Number(this.guidance_scale ?? 15);
    const lyricGuidanceScale = Number(this.lyric_guidance_scale ?? 1.5);
    const guidanceInterval = Number(this.guidance_interval ?? 0.5);
    const variance = Number(this.variance ?? 0.5);
    const guidanceIntervalDecay = Number(this.guidance_interval_decay ?? 0);
    const startTimeRelativeTo = String(this.start_time_relative_to ?? "start");
    const seed = String(this.seed ?? "");
    const granularityScale = Number(this.granularity_scale ?? 10);

    const args: Record<string, unknown> = {
      "number_of_steps": numberOfSteps,
      "start_time": startTime,
      "tags": tags,
      "minimum_guidance_scale": minimumGuidanceScale,
      "lyrics": lyrics,
      "end_time_relative_to": endTimeRelativeTo,
      "tag_guidance_scale": tagGuidanceScale,
      "scheduler": scheduler,
      "end_time": endTime,
      "guidance_type": guidanceType,
      "guidance_scale": guidanceScale,
      "lyric_guidance_scale": lyricGuidanceScale,
      "guidance_interval": guidanceInterval,
      "variance": variance,
      "guidance_interval_decay": guidanceIntervalDecay,
      "start_time_relative_to": startTimeRelativeTo,
      "seed": seed,
      "granularity_scale": granularityScale,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ace-step/audio-inpaint", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class AceStepAudioOutpaint extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.AceStepAudioOutpaint";
  static readonly title = "Ace Step Audio Outpaint";
  static readonly description = `Extend the beginning or end of provided audio with lyrics and/or style using ACE-Step
audio, processing, audio-to-audio, transformation`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "tags": "str", "lyrics": "str", "seed": "int", "audio": "audio" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/ace-step/audio-outpaint",
    unitPrice: 0.0002,
    billingUnit: "seconds",
    currency: "USD",
  };

  @prop({ type: "int", default: 27, description: "Number of steps to generate the audio." })
  declare number_of_steps: any;

  @prop({ type: "str", default: "", description: "Comma-separated list of genre tags to control the style of the generated audio." })
  declare tags: any;

  @prop({ type: "float", default: 3, description: "Minimum guidance scale for the generation after the decay." })
  declare minimum_guidance_scale: any;

  @prop({ type: "float", default: 30, description: "Duration in seconds to extend the audio from the end." })
  declare extend_after_duration: any;

  @prop({ type: "str", default: "", description: "Lyrics to be sung in the audio. If not provided or if [inst] or [instrumental] is the content of this field, no lyrics will be sung. Use control structures like [verse], [chorus] and [bridge] to control the structure of the song." })
  declare lyrics: any;

  @prop({ type: "float", default: 5, description: "Tag guidance scale for the generation." })
  declare tag_guidance_scale: any;

  @prop({ type: "enum", default: "euler", values: ["euler", "heun"], description: "Scheduler to use for the generation process." })
  declare scheduler: any;

  @prop({ type: "float", default: 15, description: "Guidance scale for the generation." })
  declare guidance_scale: any;

  @prop({ type: "enum", default: "apg", values: ["cfg", "apg", "cfg_star"], description: "Type of CFG to use for the generation process." })
  declare guidance_type: any;

  @prop({ type: "float", default: 0, description: "Duration in seconds to extend the audio from the start." })
  declare extend_before_duration: any;

  @prop({ type: "float", default: 1.5, description: "Lyric guidance scale for the generation." })
  declare lyric_guidance_scale: any;

  @prop({ type: "float", default: 0.5, description: "Guidance interval for the generation. 0.5 means only apply guidance in the middle steps (0.25 * infer_steps to 0.75 * infer_steps)" })
  declare guidance_interval: any;

  @prop({ type: "float", default: 0, description: "Guidance interval decay for the generation. Guidance scale will decay from guidance_scale to min_guidance_scale in the interval. 0.0 means no decay." })
  declare guidance_interval_decay: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to be outpainted." })
  declare audio: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility. If not provided, a random seed will be used." })
  declare seed: any;

  @prop({ type: "int", default: 10, description: "Granularity scale for the generation process. Higher values can reduce artifacts." })
  declare granularity_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const numberOfSteps = Number(this.number_of_steps ?? 27);
    const tags = String(this.tags ?? "");
    const minimumGuidanceScale = Number(this.minimum_guidance_scale ?? 3);
    const extendAfterDuration = Number(this.extend_after_duration ?? 30);
    const lyrics = String(this.lyrics ?? "");
    const tagGuidanceScale = Number(this.tag_guidance_scale ?? 5);
    const scheduler = String(this.scheduler ?? "euler");
    const guidanceScale = Number(this.guidance_scale ?? 15);
    const guidanceType = String(this.guidance_type ?? "apg");
    const extendBeforeDuration = Number(this.extend_before_duration ?? 0);
    const lyricGuidanceScale = Number(this.lyric_guidance_scale ?? 1.5);
    const guidanceInterval = Number(this.guidance_interval ?? 0.5);
    const guidanceIntervalDecay = Number(this.guidance_interval_decay ?? 0);
    const seed = String(this.seed ?? "");
    const granularityScale = Number(this.granularity_scale ?? 10);

    const args: Record<string, unknown> = {
      "number_of_steps": numberOfSteps,
      "tags": tags,
      "minimum_guidance_scale": minimumGuidanceScale,
      "extend_after_duration": extendAfterDuration,
      "lyrics": lyrics,
      "tag_guidance_scale": tagGuidanceScale,
      "scheduler": scheduler,
      "guidance_scale": guidanceScale,
      "guidance_type": guidanceType,
      "extend_before_duration": extendBeforeDuration,
      "lyric_guidance_scale": lyricGuidanceScale,
      "guidance_interval": guidanceInterval,
      "guidance_interval_decay": guidanceIntervalDecay,
      "seed": seed,
      "granularity_scale": granularityScale,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ace-step/audio-outpaint", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class AceStepAudioToAudio extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.AceStepAudioToAudio";
  static readonly title = "Ace Step Audio To Audio";
  static readonly description = `Generate music from a lyrics and example audio using ACE-Step
audio, processing, audio-to-audio, transformation`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "tags": "str", "lyrics": "str", "seed": "int", "audio": "audio" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/ace-step/audio-to-audio",
    unitPrice: 0.0002,
    billingUnit: "seconds",
    currency: "USD",
  };

  @prop({ type: "int", default: 27, description: "Number of steps to generate the audio." })
  declare number_of_steps: any;

  @prop({ type: "str", default: "", description: "Comma-separated list of genre tags to control the style of the generated audio." })
  declare tags: any;

  @prop({ type: "float", default: 3, description: "Minimum guidance scale for the generation after the decay." })
  declare minimum_guidance_scale: any;

  @prop({ type: "str", default: "", description: "Lyrics to be sung in the audio. If not provided or if [inst] or [instrumental] is the content of this field, no lyrics will be sung. Use control structures like [verse], [chorus] and [bridge] to control the structure of the song." })
  declare lyrics: any;

  @prop({ type: "float", default: 5, description: "Tag guidance scale for the generation." })
  declare tag_guidance_scale: any;

  @prop({ type: "str", default: "", description: "Original lyrics of the audio file." })
  declare original_lyrics: any;

  @prop({ type: "enum", default: "euler", values: ["euler", "heun"], description: "Scheduler to use for the generation process." })
  declare scheduler: any;

  @prop({ type: "float", default: 15, description: "Guidance scale for the generation." })
  declare guidance_scale: any;

  @prop({ type: "enum", default: "apg", values: ["cfg", "apg", "cfg_star"], description: "Type of CFG to use for the generation process." })
  declare guidance_type: any;

  @prop({ type: "float", default: 1.5, description: "Lyric guidance scale for the generation." })
  declare lyric_guidance_scale: any;

  @prop({ type: "float", default: 0.5, description: "Guidance interval for the generation. 0.5 means only apply guidance in the middle steps (0.25 * infer_steps to 0.75 * infer_steps)" })
  declare guidance_interval: any;

  @prop({ type: "enum", default: "remix", values: ["lyrics", "remix"], description: "Whether to edit the lyrics only or remix the audio." })
  declare edit_mode: any;

  @prop({ type: "float", default: 0, description: "Guidance interval decay for the generation. Guidance scale will decay from guidance_scale to min_guidance_scale in the interval. 0.0 means no decay." })
  declare guidance_interval_decay: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to be outpainted." })
  declare audio: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility. If not provided, a random seed will be used." })
  declare seed: any;

  @prop({ type: "int", default: 10, description: "Granularity scale for the generation process. Higher values can reduce artifacts." })
  declare granularity_scale: any;

  @prop({ type: "str", default: "", description: "Original tags of the audio file." })
  declare original_tags: any;

  @prop({ type: "str", default: "", description: "Original seed of the audio file." })
  declare original_seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const numberOfSteps = Number(this.number_of_steps ?? 27);
    const tags = String(this.tags ?? "");
    const minimumGuidanceScale = Number(this.minimum_guidance_scale ?? 3);
    const lyrics = String(this.lyrics ?? "");
    const tagGuidanceScale = Number(this.tag_guidance_scale ?? 5);
    const originalLyrics = String(this.original_lyrics ?? "");
    const scheduler = String(this.scheduler ?? "euler");
    const guidanceScale = Number(this.guidance_scale ?? 15);
    const guidanceType = String(this.guidance_type ?? "apg");
    const lyricGuidanceScale = Number(this.lyric_guidance_scale ?? 1.5);
    const guidanceInterval = Number(this.guidance_interval ?? 0.5);
    const editMode = String(this.edit_mode ?? "remix");
    const guidanceIntervalDecay = Number(this.guidance_interval_decay ?? 0);
    const seed = String(this.seed ?? "");
    const granularityScale = Number(this.granularity_scale ?? 10);
    const originalTags = String(this.original_tags ?? "");
    const originalSeed = String(this.original_seed ?? "");

    const args: Record<string, unknown> = {
      "number_of_steps": numberOfSteps,
      "tags": tags,
      "minimum_guidance_scale": minimumGuidanceScale,
      "lyrics": lyrics,
      "tag_guidance_scale": tagGuidanceScale,
      "original_lyrics": originalLyrics,
      "scheduler": scheduler,
      "guidance_scale": guidanceScale,
      "guidance_type": guidanceType,
      "lyric_guidance_scale": lyricGuidanceScale,
      "guidance_interval": guidanceInterval,
      "edit_mode": editMode,
      "guidance_interval_decay": guidanceIntervalDecay,
      "seed": seed,
      "granularity_scale": granularityScale,
      "original_tags": originalTags,
      "original_seed": originalSeed,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ace-step/audio-to-audio", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class AudioUnderstanding extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.AudioUnderstanding";
  static readonly title = "Audio Understanding";
  static readonly description = `A audio understanding model to analyze audio content and answer questions about what's happening in the audio based on user prompts.
audio, processing, audio-to-audio, transformation`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/audio-understanding",
    unitPrice: 0.01,
    billingUnit: "5 seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The question or prompt about the audio content." })
  declare prompt: any;

  @prop({ type: "bool", default: false, description: "Whether to request a more detailed analysis of the audio" })
  declare detailed_analysis: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to analyze" })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const detailedAnalysis = Boolean(this.detailed_analysis ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "detailed_analysis": detailedAnalysis,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/audio-understanding", args);
    return { output: (res as any).output ?? "" };
  }
}

export class Deepfilternet3 extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.Deepfilternet3";
  static readonly title = "Deepfilternet3";
  static readonly description = `DeepFilterNet3 removes noise and improves audio quality with advanced deep learning filtering.
audio, noise-reduction, filtering, cleaning, audio-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "timings": "str", "audio_file": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/deepfilternet3",
    unitPrice: 0.001,
    billingUnit: "seconds",
    currency: "USD",
  };

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "str", default: "192k", description: "The bitrate of the output audio." })
  declare bitrate: any;

  @prop({ type: "audio", default: "", description: "The URL of the audio to enhance." })
  declare audio: any;

  @prop({ type: "enum", default: "mp3", values: ["mp3", "aac", "m4a", "ogg", "opus", "flac", "wav"], description: "The format for the output audio." })
  declare audio_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const syncMode = Boolean(this.sync_mode ?? false);
    const bitrate = String(this.bitrate ?? "192k");
    const audioFormat = String(this.audio_format ?? "mp3");

    const args: Record<string, unknown> = {
      "sync_mode": syncMode,
      "bitrate": bitrate,
      "audio_format": audioFormat,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/deepfilternet3", args);
    return {
      "timings": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["timings"]),
      "audio_file": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["audio_file"]),
    };
  }
}

export class Demucs extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.Demucs";
  static readonly title = "Demucs";
  static readonly description = `Demucs separates music into vocals, drums, bass, and other instruments with high quality.
audio, music-separation, stems, demucs, audio-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "vocals": "str", "guitar": "str", "bass": "str", "piano": "str", "other": "str", "drums": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/demucs",
    unitPrice: 0.0007,
    billingUnit: "seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Length in seconds of each segment for processing. Smaller values use less memory but may reduce quality. Default is model-specific." })
  declare segment_length: any;

  @prop({ type: "enum", default: "mp3", values: ["wav", "mp3"], description: "Output audio format for the separated stems" })
  declare output_format: any;

  @prop({ type: "str", default: "", description: "Specific stems to extract. If None, extracts all available stems. Available stems depend on model: vocals, drums, bass, other, guitar, piano (for 6s model)" })
  declare stems: any;

  @prop({ type: "float", default: 0.25, description: "Overlap between segments (0.0 to 1.0). Higher values may improve quality but increase processing time." })
  declare overlap: any;

  @prop({ type: "enum", default: "htdemucs_6s", values: ["htdemucs", "htdemucs_ft", "htdemucs_6s", "hdemucs_mmi", "mdx", "mdx_extra", "mdx_q", "mdx_extra_q"], description: "Demucs model to use for separation" })
  declare model: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to separate into stems" })
  declare audio: any;

  @prop({ type: "int", default: 1, description: "Number of random shifts for equivariant stabilization. Higher values improve quality but increase processing time." })
  declare shifts: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const segmentLength = String(this.segment_length ?? "");
    const outputFormat = String(this.output_format ?? "mp3");
    const stems = String(this.stems ?? "");
    const overlap = Number(this.overlap ?? 0.25);
    const model = String(this.model ?? "htdemucs_6s");
    const shifts = Number(this.shifts ?? 1);

    const args: Record<string, unknown> = {
      "segment_length": segmentLength,
      "output_format": outputFormat,
      "stems": stems,
      "overlap": overlap,
      "model": model,
      "shifts": shifts,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/demucs", args);
    return {
      "vocals": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["vocals"]),
      "guitar": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["guitar"]),
      "bass": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["bass"]),
      "piano": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["piano"]),
      "other": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["other"]),
      "drums": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["drums"]),
    };
  }
}

export class DiaTtsVoiceClone extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.DiaTtsVoiceClone";
  static readonly title = "Dia Tts Voice Clone";
  static readonly description = `Clone dialog voices from a sample audio and generate dialogs from text prompts using the Dia TTS which leverages advanced AI techniques to create high-quality text-to-speech.
audio, processing, audio-to-audio, transformation`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "audio": "audio" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/dia-tts/voice-clone",
    unitPrice: 0.04,
    billingUnit: "1000 characters",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text to be converted to speech." })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");

    const args: Record<string, unknown> = {
      "text": text,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/dia-tts/voice-clone", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class ElevenlabsVoiceChanger extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.ElevenlabsVoiceChanger";
  static readonly title = "Elevenlabs Voice Changer";
  static readonly description = `ElevenLabs Voice Changer transforms voice characteristics in audio with AI-powered voice conversion.
audio, voice-change, elevenlabs, transformation, audio-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "seed": "int", "audio": "audio" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/elevenlabs/voice-changer",
    unitPrice: 0.3,
    billingUnit: "minutes",
    currency: "USD",
  };

  @prop({ type: "str", default: "Rachel", description: "The voice to use for speech generation" })
  declare voice: any;

  @prop({ type: "bool", default: false, description: "If set, will remove the background noise from your audio input using our audio isolation model." })
  declare remove_background_noise: any;

  @prop({ type: "int", default: -1, description: "Random seed for reproducibility." })
  declare seed: any;

  @prop({ type: "enum", default: "mp3_44100_128", values: ["mp3_22050_32", "mp3_44100_32", "mp3_44100_64", "mp3_44100_96", "mp3_44100_128", "mp3_44100_192", "pcm_8000", "pcm_16000", "pcm_22050", "pcm_24000", "pcm_44100", "pcm_48000", "ulaw_8000", "alaw_8000", "opus_48000_32", "opus_48000_64", "opus_48000_96", "opus_48000_128", "opus_48000_192"], description: "Output format of the generated audio. Formatted as codec_sample_rate_bitrate." })
  declare output_format: any;

  @prop({ type: "audio", default: "", description: "The input audio file" })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const voice = String(this.voice ?? "Rachel");
    const removeBackgroundNoise = Boolean(this.remove_background_noise ?? false);
    const seed = Number(this.seed ?? -1);
    const outputFormat = String(this.output_format ?? "mp3_44100_128");

    const args: Record<string, unknown> = {
      "voice": voice,
      "remove_background_noise": removeBackgroundNoise,
      "seed": seed,
      "output_format": outputFormat,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/elevenlabs/voice-changer", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class FfmpegApiMergeAudios extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.FfmpegApiMergeAudios";
  static readonly title = "Ffmpeg Api Merge Audios";
  static readonly description = `FFmpeg API Merge Audios combines multiple audio files into a single output.
audio, processing, audio-to-audio, merging, ffmpeg`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "audio": "audio" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/ffmpeg-api/merge-audios",
    unitPrice: 0.00017,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "list[audio]", default: [], description: "List of audio URLs to merge in order. The 0th stream of the audio will be considered as the merge candidate." })
  declare audio_urls: any;

  @prop({ type: "str", default: "", description: "Output format of the combined audio. If not used, will be determined automatically using FFMPEG. Formatted as codec_sample_rate_bitrate." })
  declare output_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const outputFormat = String(this.output_format ?? "");

    const args: Record<string, unknown> = {
      "output_format": outputFormat,
    };

    const audioUrlsList = this.audio_urls as Record<string, unknown>[] | undefined;
    if (audioUrlsList?.length) {
      const audioUrlsUrls: string[] = [];
      for (const ref of audioUrlsList) {
        if (isRefSet(ref)) { const u = await assetToFalUrl(apiKey, ref); if (u) audioUrlsUrls.push(u); }
      }
      if (audioUrlsUrls.length) args["audio_urls"] = audioUrlsUrls;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ffmpeg-api/merge-audios", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class KlingVideoCreateVoice extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.KlingVideoCreateVoice";
  static readonly title = "Kling Video Create Voice";
  static readonly description = `Create Voices to be used with Kling 2.6 Voice Control
audio, processing, audio-to-audio, transformation`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/kling-video/create-voice",
    unitPrice: 0.007,
    billingUnit: "generations",
    currency: "USD",
  };

  @prop({ type: "video", default: "", description: "URL of the voice audio file. Supports .mp3/.wav audio or .mp4/.mov video. Duration must be 5-30 seconds with clean, single-voice audio." })
  declare voice_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {
    };

    const voiceUrlRef = this.voice_url as Record<string, unknown> | undefined;
    if (isRefSet(voiceUrlRef)) {
      const voiceUrlUrl = await assetToFalUrl(apiKey, voiceUrlRef!);
      if (voiceUrlUrl) args["voice_url"] = voiceUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/kling-video/create-voice", args);
    return { output: (res as any).output ?? "" };
  }
}

export class LavaSr extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.LavaSr";
  static readonly title = "Lava Sr";
  static readonly description = `Enhance muffled 16 kHz speech audio into crystal-clear 48 kHz, with denoising for particularly bad inputs.
lava-sr, audo-upscaler`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "timings": "str", "audio": "audio" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/lava-sr",
    unitPrice: 0.00015,
    billingUnit: "seconds",
    currency: "USD",
  };

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "str", default: "192k", description: "The bitrate of the output audio." })
  declare bitrate: any;

  @prop({ type: "audio", default: "", description: "The URL of the audio file to enhance." })
  declare audio: any;

  @prop({ type: "bool", default: false, description: "If 'True', applies UL-UNAS noise filtering before bandwidth extension." })
  declare denoise: any;

  @prop({ type: "enum", default: "mp3", values: ["mp3", "aac", "m4a", "ogg", "opus", "flac", "wav"], description: "The format for the output audio." })
  declare audio_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const syncMode = Boolean(this.sync_mode ?? false);
    const bitrate = String(this.bitrate ?? "192k");
    const denoise = Boolean(this.denoise ?? false);
    const audioFormat = String(this.audio_format ?? "mp3");

    const args: Record<string, unknown> = {
      "sync_mode": syncMode,
      "bitrate": bitrate,
      "denoise": denoise,
      "audio_format": audioFormat,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/lava-sr", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class NovaSr extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.NovaSr";
  static readonly title = "Nova Sr";
  static readonly description = `Nova SR enhances audio quality through super-resolution processing for clearer and richer sound.
audio, enhancement, super-resolution, quality, audio-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "timings": "str", "audio": "audio" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/nova-sr",
    unitPrice: 0.0001,
    billingUnit: "seconds",
    currency: "USD",
  };

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "str", default: "192k", description: "The bitrate of the output audio." })
  declare bitrate: any;

  @prop({ type: "audio", default: "", description: "The URL of the audio file to enhance." })
  declare audio: any;

  @prop({ type: "enum", default: "mp3", values: ["mp3", "aac", "m4a", "ogg", "opus", "flac", "wav"], description: "The format for the output audio." })
  declare audio_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const syncMode = Boolean(this.sync_mode ?? false);
    const bitrate = String(this.bitrate ?? "192k");
    const audioFormat = String(this.audio_format ?? "mp3");

    const args: Record<string, unknown> = {
      "sync_mode": syncMode,
      "bitrate": bitrate,
      "audio_format": audioFormat,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/nova-sr", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class Personaplex extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.Personaplex";
  static readonly title = "Personaplex";
  static readonly description = `PersonaPlex is a real-time, full-duplex speech-to-speech conversational model that enables persona control through text-based role prompts and audio-based voice conditioning.
audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "text": "str", "duration": "float", "seed": "int", "audio": "audio" };
  static readonly falUnitPricing: FalUnitPricing | null = null;

  @prop({ type: "str", default: "You are a wise and friendly teacher. Answer questions or provide advice in a clear and engaging way.", description: "Text prompt describing the AI persona and conversation context." })
  declare prompt: any;

  @prop({ type: "int", default: 25, description: "Top-K sampling for text tokens." })
  declare top_k_text: any;

  @prop({ type: "enum", default: "NATF2", values: ["NATF0", "NATF1", "NATF2", "NATF3", "NATM0", "NATM1", "NATM2", "NATM3", "VARF0", "VARF1", "VARF2", "VARF3", "VARF4", "VARM0", "VARM1", "VARM2", "VARM3", "VARM4"], description: "Voice ID for the AI response. NAT = natural, VAR = variety. F = female, M = male. Ignored when voice_audio_url is provided." })
  declare voice: any;

  @prop({ type: "float", default: 0.7, description: "Text sampling temperature. Higher values produce more diverse outputs." })
  declare temperature_text: any;

  @prop({ type: "audio", default: "", description: "URL to the input audio file (user's speech)." })
  declare audio: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility." })
  declare seed: any;

  @prop({ type: "audio", default: "", description: "URL to a voice sample audio for on-the-fly voice cloning. When provided, the AI responds in the cloned voice instead of the preset 'voice'. 10+ seconds of clear speech recommended. Billed at 2x rate." })
  declare voice_audio: any;

  @prop({ type: "int", default: 250, description: "Top-K sampling for audio tokens." })
  declare top_k_audio: any;

  @prop({ type: "float", default: 0.8, description: "Audio sampling temperature. Higher values produce more diverse outputs." })
  declare temperature_audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "You are a wise and friendly teacher. Answer questions or provide advice in a clear and engaging way.");
    const topKText = Number(this.top_k_text ?? 25);
    const voice = String(this.voice ?? "NATF2");
    const temperatureText = Number(this.temperature_text ?? 0.7);
    const seed = String(this.seed ?? "");
    const topKAudio = Number(this.top_k_audio ?? 250);
    const temperatureAudio = Number(this.temperature_audio ?? 0.8);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "top_k_text": topKText,
      "voice": voice,
      "temperature_text": temperatureText,
      "seed": seed,
      "top_k_audio": topKAudio,
      "temperature_audio": temperatureAudio,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }

    const voiceAudioRef = this.voice_audio as Record<string, unknown> | undefined;
    if (isRefSet(voiceAudioRef)) {
      const voiceAudioUrl = await assetToFalUrl(apiKey, voiceAudioRef!);
      if (voiceAudioUrl) args["voice_audio_url"] = voiceAudioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/personaplex", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class Personaplex_realtime extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.Personaplex_realtime";
  static readonly title = "Personaplex_realtime";
  static readonly description = `PersonaPlex is a real-time, full-duplex speech-to-speech conversational model that enables persona control through text-based role prompts and audio-based voice conditioning.
audio-to-audio, realtime, conversational`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "text": "str", "duration": "float", "seed": "int", "audio": "audio" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/personaplex/realtime",
    unitPrice: 0.001,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "str", default: "You are a wise and friendly teacher. Answer questions or provide advice in a clear and engaging way.", description: "Text prompt describing the AI persona and conversation context." })
  declare prompt: any;

  @prop({ type: "int", default: 25, description: "Top-K sampling for text tokens." })
  declare top_k_text: any;

  @prop({ type: "enum", default: "NATF2", values: ["NATF0", "NATF1", "NATF2", "NATF3", "NATM0", "NATM1", "NATM2", "NATM3", "VARF0", "VARF1", "VARF2", "VARF3", "VARF4", "VARM0", "VARM1", "VARM2", "VARM3", "VARM4"], description: "Voice ID for the AI response. NAT = natural, VAR = variety. F = female, M = male. Ignored when voice_audio_url is provided." })
  declare voice: any;

  @prop({ type: "float", default: 0.7, description: "Text sampling temperature. Higher values produce more diverse outputs." })
  declare temperature_text: any;

  @prop({ type: "audio", default: "", description: "URL to the input audio file (user's speech)." })
  declare audio: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility." })
  declare seed: any;

  @prop({ type: "audio", default: "", description: "URL to a voice sample audio for on-the-fly voice cloning. When provided, the AI responds in the cloned voice instead of the preset 'voice'. 10+ seconds of clear speech recommended. Billed at 2x rate." })
  declare voice_audio: any;

  @prop({ type: "int", default: 250, description: "Top-K sampling for audio tokens." })
  declare top_k_audio: any;

  @prop({ type: "float", default: 0.8, description: "Audio sampling temperature. Higher values produce more diverse outputs." })
  declare temperature_audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "You are a wise and friendly teacher. Answer questions or provide advice in a clear and engaging way.");
    const topKText = Number(this.top_k_text ?? 25);
    const voice = String(this.voice ?? "NATF2");
    const temperatureText = Number(this.temperature_text ?? 0.7);
    const seed = String(this.seed ?? "");
    const topKAudio = Number(this.top_k_audio ?? 250);
    const temperatureAudio = Number(this.temperature_audio ?? 0.8);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "top_k_text": topKText,
      "voice": voice,
      "temperature_text": temperatureText,
      "seed": seed,
      "top_k_audio": topKAudio,
      "temperature_audio": temperatureAudio,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }

    const voiceAudioRef = this.voice_audio as Record<string, unknown> | undefined;
    if (isRefSet(voiceAudioRef)) {
      const voiceAudioUrl = await assetToFalUrl(apiKey, voiceAudioRef!);
      if (voiceAudioUrl) args["voice_audio_url"] = voiceAudioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/personaplex", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class Qwen3TtsCloneVoice06b extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.Qwen3TtsCloneVoice06b";
  static readonly title = "Qwen3 Tts Clone Voice06b";
  static readonly description = `Clone your voices using Qwen3-TTS Clone-Voice model with zero shot cloning capabilities and use it on text-to-speech models to create speeches of yours!
clone-voice, voice-clone`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "speaker_embedding": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/qwen-3-tts/clone-voice/0.6b",
    unitPrice: 0.0007,
    billingUnit: "minutes",
    currency: "USD",
  };

  @prop({ type: "audio", default: "", description: "URL to the reference audio file used for voice cloning." })
  declare audio: any;

  @prop({ type: "str", default: "", description: "Optional reference text that was used when creating the speaker embedding. Providing this can improve synthesis quality when using a cloned voice." })
  declare reference_text: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const referenceText = String(this.reference_text ?? "");

    const args: Record<string, unknown> = {
      "reference_text": referenceText,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/qwen-3-tts/clone-voice/0.6b", args);
    return {
      "speaker_embedding": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["speaker_embedding"]),
    };
  }
}

export class Qwen3TtsCloneVoice17b extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.Qwen3TtsCloneVoice17b";
  static readonly title = "Qwen3 Tts Clone Voice17b";
  static readonly description = `Clone your voices using Qwen3-TTS Clone-Voice model with zero shot cloning capabilities and use it on text-to-speech models to create speeches of yours!
clone-voice, voice-clone`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "speaker_embedding": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/qwen-3-tts/clone-voice/1.7b",
    unitPrice: 0.0008,
    billingUnit: "minutes",
    currency: "USD",
  };

  @prop({ type: "audio", default: "", description: "URL to the reference audio file used for voice cloning." })
  declare audio: any;

  @prop({ type: "str", default: "", description: "Optional reference text that was used when creating the speaker embedding. Providing this can improve synthesis quality when using a cloned voice." })
  declare reference_text: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const referenceText = String(this.reference_text ?? "");

    const args: Record<string, unknown> = {
      "reference_text": referenceText,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/qwen-3-tts/clone-voice/1.7b", args);
    return {
      "speaker_embedding": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["speaker_embedding"]),
    };
  }
}

export class SamAudioSeparate extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.SamAudioSeparate";
  static readonly title = "Sam Audio Separate";
  static readonly description = `SAM Audio Separate isolates and extracts different audio sources from mixed recordings.
audio, separation, source-extraction, isolation, audio-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "target": "str", "duration": "float", "sample_rate": "int", "residual": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/sam-audio/separate",
    unitPrice: 0.05,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Text prompt describing the sound to isolate." })
  declare prompt: any;

  @prop({ type: "float", default: 5, description: "Overlap duration (in seconds) between chunks for crossfade blending." })
  declare chunk_overlap: any;

  @prop({ type: "enum", default: "balanced", values: ["fast", "balanced", "quality"], description: "The acceleration level to use." })
  declare acceleration: any;

  @prop({ type: "enum", default: "wav", values: ["wav", "mp3"], description: "Output audio format." })
  declare output_format: any;

  @prop({ type: "float", default: 60, description: "Maximum audio duration (in seconds) to process in a single pass. Longer audio will be chunked with overlap and blended." })
  declare max_chunk_duration: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to process (WAV, MP3, FLAC supported)" })
  declare audio: any;

  @prop({ type: "bool", default: false, description: "Automatically predict temporal spans where the target sound occurs." })
  declare predict_spans: any;

  @prop({ type: "int", default: 1, description: "Number of candidates to generate and rank. Higher improves quality but increases latency and cost." })
  declare reranking_candidates: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const chunkOverlap = Number(this.chunk_overlap ?? 5);
    const acceleration = String(this.acceleration ?? "balanced");
    const outputFormat = String(this.output_format ?? "wav");
    const maxChunkDuration = Number(this.max_chunk_duration ?? 60);
    const predictSpans = Boolean(this.predict_spans ?? false);
    const rerankingCandidates = Number(this.reranking_candidates ?? 1);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "chunk_overlap": chunkOverlap,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "max_chunk_duration": maxChunkDuration,
      "predict_spans": predictSpans,
      "reranking_candidates": rerankingCandidates,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sam-audio/separate", args);
    return {
      "target": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["target"]),
      "duration": coerceFalOutputForPropType("float", (res as Record<string, unknown>)["duration"]),
      "sample_rate": coerceFalOutputForPropType("int", (res as Record<string, unknown>)["sample_rate"]),
      "residual": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["residual"]),
    };
  }
}

export class SamAudioSpanSeparate extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.SamAudioSpanSeparate";
  static readonly title = "Sam Audio Span Separate";
  static readonly description = `SAM Audio Span Separate isolates audio sources across time spans with precise temporal control.
audio, separation, temporal, span, audio-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "target": "str", "duration": "float", "sample_rate": "int", "residual": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/sam-audio/span-separate",
    unitPrice: 0.05,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Text prompt describing the sound to isolate. Optional but recommended - helps the model identify what type of sound to extract from the span." })
  declare prompt: any;

  @prop({ type: "float", default: 5, description: "Overlap duration (in seconds) between chunks for crossfade blending." })
  declare chunk_overlap: any;

  @prop({ type: "list[AudioTimeSpan]", default: [], description: "Time spans where the target sound occurs which should be isolated." })
  declare spans: any;

  @prop({ type: "enum", default: "balanced", values: ["fast", "balanced", "quality"], description: "The acceleration level to use." })
  declare acceleration: any;

  @prop({ type: "bool", default: false, description: "Use sound activity detection to rank reranking candidates based on how well each candidate's non-silent regions match the provided spans. Enables effective reranking even without a text prompt (span-only separation). Requires reranking_candidates > 1." })
  declare use_sound_activity_ranking: any;

  @prop({ type: "enum", default: "wav", values: ["wav", "mp3"], description: "Output audio format." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "Trim output audio to only include the specified span time range. If False, returns the full audio length with the target sound isolated throughout." })
  declare trim_to_span: any;

  @prop({ type: "float", default: 60, description: "Maximum audio duration (in seconds) to process in a single pass. Longer audio will be chunked with overlap and blended." })
  declare max_chunk_duration: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to process." })
  declare audio: any;

  @prop({ type: "int", default: 1, description: "Number of candidates to generate and rank. Higher improves quality but increases latency and cost. Requires text prompt; ignored for span-only separation." })
  declare reranking_candidates: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const chunkOverlap = Number(this.chunk_overlap ?? 5);
    const spans = String(this.spans ?? []);
    const acceleration = String(this.acceleration ?? "balanced");
    const useSoundActivityRanking = Boolean(this.use_sound_activity_ranking ?? false);
    const outputFormat = String(this.output_format ?? "wav");
    const trimToSpan = Boolean(this.trim_to_span ?? false);
    const maxChunkDuration = Number(this.max_chunk_duration ?? 60);
    const rerankingCandidates = Number(this.reranking_candidates ?? 1);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "chunk_overlap": chunkOverlap,
      "spans": spans,
      "acceleration": acceleration,
      "use_sound_activity_ranking": useSoundActivityRanking,
      "output_format": outputFormat,
      "trim_to_span": trimToSpan,
      "max_chunk_duration": maxChunkDuration,
      "reranking_candidates": rerankingCandidates,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sam-audio/span-separate", args);
    return {
      "target": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["target"]),
      "duration": coerceFalOutputForPropType("float", (res as Record<string, unknown>)["duration"]),
      "sample_rate": coerceFalOutputForPropType("int", (res as Record<string, unknown>)["sample_rate"]),
      "residual": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["residual"]),
    };
  }
}

export class StableAudio25AudioToAudio extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.StableAudio25AudioToAudio";
  static readonly title = "Stable Audio25 Audio To Audio";
  static readonly description = `Stable Audio 2.5 transforms and modifies audio with AI-powered processing and effects.
audio, transformation, stable-audio, 2.5, audio-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "seed": "int", "audio": "audio" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/stable-audio-25/audio-to-audio",
    unitPrice: 0.2,
    billingUnit: "audios",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to guide the audio generation" })
  declare prompt: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 0.8, description: "Sometimes referred to as denoising, this parameter controls how much influence the 'audio_url' parameter has on the generated audio. A value of 0 would yield audio that is identical to the input. A value of 1 would be as if you passed in no audio at all." })
  declare strength: any;

  @prop({ type: "float", default: 1, description: "How strictly the diffusion process adheres to the prompt text (higher values make your audio closer to your prompt). " })
  declare guidance_scale: any;

  @prop({ type: "int", default: 8, description: "The number of steps to denoise the audio for" })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "" })
  declare seed: any;

  @prop({ type: "audio", default: "", description: "The audio clip to transform" })
  declare audio: any;

  @prop({ type: "str", default: "", description: "The duration of the audio clip to generate. If not provided, it will be set to the duration of the input audio." })
  declare total_seconds: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const syncMode = Boolean(this.sync_mode ?? false);
    const strength = Number(this.strength ?? 0.8);
    const guidanceScale = Number(this.guidance_scale ?? 1);
    const numInferenceSteps = Number(this.num_inference_steps ?? 8);
    const seed = String(this.seed ?? "");
    const totalSeconds = String(this.total_seconds ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "sync_mode": syncMode,
      "strength": strength,
      "guidance_scale": guidanceScale,
      "num_inference_steps": numInferenceSteps,
      "seed": seed,
      "total_seconds": totalSeconds,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/stable-audio-25/audio-to-audio", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class StableAudio25Inpaint extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.StableAudio25Inpaint";
  static readonly title = "Stable Audio25 Inpaint";
  static readonly description = `Generate high quality music and sound effects using Stable Audio 2.5 from StabilityAI
audio, processing, audio-to-audio, transformation`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "seed": "int", "audio": "audio" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/stable-audio-25/inpaint",
    unitPrice: 0.2,
    billingUnit: "audios",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to guide the audio generation" })
  declare prompt: any;

  @prop({ type: "audio", default: "", description: "The audio clip to inpaint" })
  declare audio: any;

  @prop({ type: "int", default: 190, description: "The end point of the audio mask" })
  declare mask_end: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 1, description: "How strictly the diffusion process adheres to the prompt text (higher values make your audio closer to your prompt). " })
  declare guidance_scale: any;

  @prop({ type: "int", default: 8, description: "The number of steps to denoise the audio for" })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "" })
  declare seed: any;

  @prop({ type: "str", default: 190, description: "The duration of the audio clip to generate. If not provided, it will be set to the duration of the input audio." })
  declare seconds_total: any;

  @prop({ type: "int", default: 30, description: "The start point of the audio mask" })
  declare mask_start: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const maskEnd = Number(this.mask_end ?? 190);
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 1);
    const numInferenceSteps = Number(this.num_inference_steps ?? 8);
    const seed = String(this.seed ?? "");
    const secondsTotal = String(this.seconds_total ?? 190);
    const maskStart = Number(this.mask_start ?? 30);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "mask_end": maskEnd,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "num_inference_steps": numInferenceSteps,
      "seed": seed,
      "seconds_total": secondsTotal,
      "mask_start": maskStart,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/stable-audio-25/inpaint", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class Tada1bTextToSpeech extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.Tada1bTextToSpeech";
  static readonly title = "Tada1b Text To Speech";
  static readonly description = `A unified speech-language model that synchronizes speech and text into a single, cohesive stream via 1:1 alignment. Lighter 1B variant
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "audio": "audio" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/tada/1b/text-to-speech",
    unitPrice: 0.05,
    billingUnit: "1000 characters",
    currency: "USD",
  };

  @prop({ type: "enum", default: "en", values: ["en", "ar", "ch", "de", "es", "fr", "it", "ja", "pl", "pt"], description: "Language for text alignment. Use the appropriate code for non-English synthesis." })
  declare language: any;

  @prop({ type: "float", default: 1.1, description: "Penalty applied to repeated tokens during generation." })
  declare repetition_penalty: any;

  @prop({ type: "int", default: 0, description: "Number of extra autoregressive steps for speech continuation beyond the input text. Useful for generating trailing prosody or silence." })
  declare num_extra_steps: any;

  @prop({ type: "float", default: 0.9, description: "Top-p (nucleus) sampling parameter for text generation." })
  declare top_p: any;

  @prop({ type: "str", default: "", description: "The text to synthesize into speech using the reference speaker's voice." })
  declare prompt: any;

  @prop({ type: "float", default: 1, description: "Factor to speed up or slow down the generated speech. Values > 1.0 speed up, < 1.0 slow down." })
  declare speed_up_factor: any;

  @prop({ type: "enum", default: "wav", values: ["wav", "mp3"], description: "The format of the output audio file." })
  declare output_format: any;

  @prop({ type: "float", default: 1.6, description: "Classifier-free guidance scale for acoustic feature generation." })
  declare acoustic_cfg_scale: any;

  @prop({ type: "float", default: 0.9, description: "Temperature for noise in the flow matching diffusion process." })
  declare noise_temperature: any;

  @prop({ type: "audio", default: "", description: "URL of the reference audio file for voice cloning. The model will replicate this speaker's voice characteristics." })
  declare audio: any;

  @prop({ type: "float", default: 0.6, description: "Sampling temperature for text token generation. Higher values produce more varied output." })
  declare temperature: any;

  @prop({ type: "int", default: 20, description: "Number of ODE solver steps for flow matching acoustic generation. More steps improve quality at the cost of speed." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "Transcript of the reference audio. For non-English audio, providing a transcript is required since the built-in ASR is English-only." })
  declare transcript: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const language = String(this.language ?? "en");
    const repetitionPenalty = Number(this.repetition_penalty ?? 1.1);
    const numExtraSteps = Number(this.num_extra_steps ?? 0);
    const topP = Number(this.top_p ?? 0.9);
    const prompt = String(this.prompt ?? "");
    const speedUpFactor = Number(this.speed_up_factor ?? 1);
    const outputFormat = String(this.output_format ?? "wav");
    const acousticCfgScale = Number(this.acoustic_cfg_scale ?? 1.6);
    const noiseTemperature = Number(this.noise_temperature ?? 0.9);
    const temperature = Number(this.temperature ?? 0.6);
    const numInferenceSteps = Number(this.num_inference_steps ?? 20);
    const transcript = String(this.transcript ?? "");

    const args: Record<string, unknown> = {
      "language": language,
      "repetition_penalty": repetitionPenalty,
      "num_extra_steps": numExtraSteps,
      "top_p": topP,
      "prompt": prompt,
      "speed_up_factor": speedUpFactor,
      "output_format": outputFormat,
      "acoustic_cfg_scale": acousticCfgScale,
      "noise_temperature": noiseTemperature,
      "temperature": temperature,
      "num_inference_steps": numInferenceSteps,
      "transcript": transcript,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/tada/1b/text-to-speech", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class Tada3bTextToSpeech extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.Tada3bTextToSpeech";
  static readonly title = "Tada3b Text To Speech";
  static readonly description = `A unified speech-language model that synchronizes speech and text into a single, cohesive stream via 1:1 alignment.
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "audio": "audio" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/tada/3b/text-to-speech",
    unitPrice: 0.08,
    billingUnit: "1000 characters",
    currency: "USD",
  };

  @prop({ type: "enum", default: "en", values: ["en", "ar", "ch", "de", "es", "fr", "it", "ja", "pl", "pt"], description: "Language for text alignment. Use the appropriate code for non-English synthesis." })
  declare language: any;

  @prop({ type: "float", default: 1.1, description: "Penalty applied to repeated tokens during generation." })
  declare repetition_penalty: any;

  @prop({ type: "int", default: 0, description: "Number of extra autoregressive steps for speech continuation beyond the input text. Useful for generating trailing prosody or silence." })
  declare num_extra_steps: any;

  @prop({ type: "float", default: 0.9, description: "Top-p (nucleus) sampling parameter for text generation." })
  declare top_p: any;

  @prop({ type: "str", default: "", description: "The text to synthesize into speech using the reference speaker's voice." })
  declare prompt: any;

  @prop({ type: "float", default: 1, description: "Factor to speed up or slow down the generated speech. Values > 1.0 speed up, < 1.0 slow down." })
  declare speed_up_factor: any;

  @prop({ type: "enum", default: "wav", values: ["wav", "mp3"], description: "The format of the output audio file." })
  declare output_format: any;

  @prop({ type: "float", default: 1.6, description: "Classifier-free guidance scale for acoustic feature generation." })
  declare acoustic_cfg_scale: any;

  @prop({ type: "float", default: 0.9, description: "Temperature for noise in the flow matching diffusion process." })
  declare noise_temperature: any;

  @prop({ type: "audio", default: "", description: "URL of the reference audio file for voice cloning. The model will replicate this speaker's voice characteristics." })
  declare audio: any;

  @prop({ type: "float", default: 0.6, description: "Sampling temperature for text token generation. Higher values produce more varied output." })
  declare temperature: any;

  @prop({ type: "int", default: 20, description: "Number of ODE solver steps for flow matching acoustic generation. More steps improve quality at the cost of speed." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "Transcript of the reference audio. For non-English audio, providing a transcript is required since the built-in ASR is English-only." })
  declare transcript: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const language = String(this.language ?? "en");
    const repetitionPenalty = Number(this.repetition_penalty ?? 1.1);
    const numExtraSteps = Number(this.num_extra_steps ?? 0);
    const topP = Number(this.top_p ?? 0.9);
    const prompt = String(this.prompt ?? "");
    const speedUpFactor = Number(this.speed_up_factor ?? 1);
    const outputFormat = String(this.output_format ?? "wav");
    const acousticCfgScale = Number(this.acoustic_cfg_scale ?? 1.6);
    const noiseTemperature = Number(this.noise_temperature ?? 0.9);
    const temperature = Number(this.temperature ?? 0.6);
    const numInferenceSteps = Number(this.num_inference_steps ?? 20);
    const transcript = String(this.transcript ?? "");

    const args: Record<string, unknown> = {
      "language": language,
      "repetition_penalty": repetitionPenalty,
      "num_extra_steps": numExtraSteps,
      "top_p": topP,
      "prompt": prompt,
      "speed_up_factor": speedUpFactor,
      "output_format": outputFormat,
      "acoustic_cfg_scale": acousticCfgScale,
      "noise_temperature": noiseTemperature,
      "temperature": temperature,
      "num_inference_steps": numInferenceSteps,
      "transcript": transcript,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/tada/3b/text-to-speech", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class WorkflowUtilitiesAudioCompressor extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.WorkflowUtilitiesAudioCompressor";
  static readonly title = "Workflow Utilities Audio Compressor";
  static readonly description = `FFMPEG Utility for Audio Compression
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "audio": "audio" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/workflow-utilities/audio-compressor",
    unitPrice: 0.001,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "float", default: -18, description: "Threshold level in dB above which compression is applied (-60 to 0)" })
  declare threshold: any;

  @prop({ type: "float", default: 3, description: "Compression ratio (1 = no compression, higher = more compression)" })
  declare ratio: any;

  @prop({ type: "float", default: 8, description: "Makeup gain in dB to compensate for volume reduction" })
  declare makeup: any;

  @prop({ type: "float", default: 5, description: "Attack time in milliseconds (how fast compression starts)" })
  declare attack: any;

  @prop({ type: "float", default: 50, description: "Release time in milliseconds (how fast compression stops)" })
  declare release: any;

  @prop({ type: "float", default: 2.83, description: "Knee width in dB for soft knee compression (0 = hard knee)" })
  declare knee: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to compress" })
  declare audio: any;

  @prop({ type: "enum", default: "192k", values: ["128k", "192k", "256k", "320k"], description: "Output audio bitrate" })
  declare output_bitrate: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const threshold = Number(this.threshold ?? -18);
    const ratio = Number(this.ratio ?? 3);
    const makeup = Number(this.makeup ?? 8);
    const attack = Number(this.attack ?? 5);
    const release = Number(this.release ?? 50);
    const knee = Number(this.knee ?? 2.83);
    const outputBitrate = String(this.output_bitrate ?? "192k");

    const args: Record<string, unknown> = {
      "threshold": threshold,
      "ratio": ratio,
      "makeup": makeup,
      "attack": attack,
      "release": release,
      "knee": knee,
      "output_bitrate": outputBitrate,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/workflow-utilities/audio-compressor", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class WorkflowUtilitiesImpulseResponse extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.WorkflowUtilitiesImpulseResponse";
  static readonly title = "Workflow Utilities Impulse Response";
  static readonly description = `FFMPEG Utility for Impulse Response
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "audio": "audio" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/workflow-utilities/impulse-response",
    unitPrice: 0.001,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "URL of the impulse response WAV file (reverb/effect profile)" })
  declare impulse_response_url: any;

  @prop({ type: "float", default: -1.5, description: "Maximum true peak in dBTP (typically -2 to -1)" })
  declare loudness_tp: any;

  @prop({ type: "float", default: 8, description: "Loudness Range target in LU (typically 5-15)" })
  declare loudness_lra: any;

  @prop({ type: "float", default: 0.7, description: "Level of the original (dry) signal in the mix (0.0-1.0)" })
  declare dry_level: any;

  @prop({ type: "float", default: -18, description: "Target integrated loudness in LUFS (typically -24 to -14)" })
  declare loudness_i: any;

  @prop({ type: "audio", default: "", description: "URL of the main audio file to process" })
  declare audio: any;

  @prop({ type: "float", default: 0.3, description: "Level of the processed (wet) signal in the mix (0.0-1.0)" })
  declare wet_level: any;

  @prop({ type: "enum", default: "192k", values: ["128k", "192k", "256k", "320k"], description: "Output audio bitrate" })
  declare output_bitrate: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const impulseResponseUrl = String(this.impulse_response_url ?? "");
    const loudnessTp = Number(this.loudness_tp ?? -1.5);
    const loudnessLra = Number(this.loudness_lra ?? 8);
    const dryLevel = Number(this.dry_level ?? 0.7);
    const loudnessI = Number(this.loudness_i ?? -18);
    const wetLevel = Number(this.wet_level ?? 0.3);
    const outputBitrate = String(this.output_bitrate ?? "192k");

    const args: Record<string, unknown> = {
      "impulse_response_url": impulseResponseUrl,
      "loudness_tp": loudnessTp,
      "loudness_lra": loudnessLra,
      "dry_level": dryLevel,
      "loudness_i": loudnessI,
      "wet_level": wetLevel,
      "output_bitrate": outputBitrate,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/workflow-utilities/impulse-response", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class SonautoV2Extend extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.SonautoV2Extend";
  static readonly title = "Sonauto V2 Extend";
  static readonly description = `Extend an existing song
audio, processing, audio-to-audio, transformation`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "tags": "str", "seed": "int", "extend_duration": "float", "audio": "audio", "lyrics": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "sonauto/v2/extend",
    unitPrice: 0.00125,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "A description of the track you want to generate. This prompt will be used to automatically generate the tags and lyrics unless you manually set them. For example, if you set prompt and tags, then the prompt will be used to generate only the lyrics." })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "The lyrics sung in the generated song. An empty string will generate an instrumental track." })
  declare lyrics_prompt: any;

  @prop({ type: "str", default: "", description: "Tags/styles of the music to generate. You can view a list of all available tags at https://sonauto.ai/tag-explorer." })
  declare tags: any;

  @prop({ type: "float", default: 1.8, description: "Controls how strongly your prompt influences the output. Greater values adhere more to the prompt but sound less natural. (This is CFG.)" })
  declare prompt_strength: any;

  @prop({ type: "str", default: "", description: "The bit rate to use for mp3 and m4a formats. Not available for other formats." })
  declare output_bit_rate: any;

  @prop({ type: "int", default: 1, description: "Generating 2 songs costs 1.5x the price of generating 1 song. Also, note that using the same seed may not result in identical songs if the number of songs generated is changed." })
  declare num_songs: any;

  @prop({ type: "enum", default: "wav", values: ["flac", "mp3", "wav", "ogg", "m4a"] })
  declare output_format: any;

  @prop({ type: "enum", default: "", values: ["left", "right"], description: "Add more to the beginning (left) or end (right) of the song" })
  declare side: any;

  @prop({ type: "float", default: 0.7, description: "Greater means more natural vocals. Lower means sharper instrumentals. We recommend 0.7." })
  declare balance_strength: any;

  @prop({ type: "float", default: 0, description: "Duration in seconds to crop from the selected side before extending from that side." })
  declare crop_duration: any;

  @prop({ type: "audio", default: "", description: "The URL of the audio file to alter. Must be a valid publicly accessible URL." })
  declare audio: any;

  @prop({ type: "str", default: "", description: "The seed to use for generation. Will pick a random seed if not provided. Repeating a request with identical parameters (must use lyrics and tags, not prompt) and the same seed will generate the same song." })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Duration in seconds to extend the song. If not provided, will attempt to automatically determine." })
  declare extend_duration: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const lyricsPrompt = String(this.lyrics_prompt ?? "");
    const tags = String(this.tags ?? "");
    const promptStrength = Number(this.prompt_strength ?? 1.8);
    const outputBitRate = String(this.output_bit_rate ?? "");
    const numSongs = Number(this.num_songs ?? 1);
    const outputFormat = String(this.output_format ?? "wav");
    const side = String(this.side ?? "");
    const balanceStrength = Number(this.balance_strength ?? 0.7);
    const cropDuration = Number(this.crop_duration ?? 0);
    const seed = String(this.seed ?? "");
    const extendDuration = String(this.extend_duration ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "lyrics_prompt": lyricsPrompt,
      "tags": tags,
      "prompt_strength": promptStrength,
      "output_bit_rate": outputBitRate,
      "num_songs": numSongs,
      "output_format": outputFormat,
      "side": side,
      "balance_strength": balanceStrength,
      "crop_duration": cropDuration,
      "seed": seed,
      "extend_duration": extendDuration,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "Sonauto/v2/extend", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export const FAL_AUDIO_TO_AUDIO_NODES: readonly NodeClass[] = [
  AceStepAudioInpaint,
  AceStepAudioOutpaint,
  AceStepAudioToAudio,
  AudioUnderstanding,
  Deepfilternet3,
  Demucs,
  DiaTtsVoiceClone,
  ElevenlabsVoiceChanger,
  FfmpegApiMergeAudios,
  KlingVideoCreateVoice,
  LavaSr,
  NovaSr,
  Personaplex,
  Personaplex_realtime,
  Qwen3TtsCloneVoice06b,
  Qwen3TtsCloneVoice17b,
  SamAudioSeparate,
  SamAudioSpanSeparate,
  StableAudio25AudioToAudio,
  StableAudio25Inpaint,
  Tada1bTextToSpeech,
  Tada3bTextToSpeech,
  WorkflowUtilitiesAudioCompressor,
  WorkflowUtilitiesImpulseResponse,
  SonautoV2Extend,
] as const;