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

export class SamAudioVisualSeparate extends FalNode {
  static readonly nodeType = "fal.video_to_audio.SamAudioVisualSeparate";
  static readonly title = "Sam Audio Visual Separate";
  static readonly description = `Audio separation with SAM Audio. Isolate any sound using natural language—professional-grade audio editing made simple for creators, researchers, and accessibility applications.
audio, extraction, video-to-audio, processing`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    target: "str",
    duration: "float",
    sample_rate: "int",
    residual: "str"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "Text prompt to assist with separation. Use natural language to describe the target sound."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "URL of the video file to process (MP4, MOV, etc.)"
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "quality"],
    description: "The acceleration level to use."
  })
  declare acceleration: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "Overlap duration (in seconds) between chunks for crossfade blending."
  })
  declare chunk_overlap: any;

  @prop({
    type: "enum",
    default: "wav",
    values: ["wav", "mp3"],
    description: "Output audio format."
  })
  declare output_format: any;

  @prop({
    type: "float",
    default: 60,
    description:
      "Maximum audio duration (in seconds) to process in a single pass. Longer audio will be chunked with overlap and blended."
  })
  declare max_chunk_duration: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL of the mask video (binary mask indicating target object). Black=target, White=background."
  })
  declare mask_video: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "Number of candidates to generate and rank. Higher improves quality but increases latency and cost."
  })
  declare reranking_candidates: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const acceleration = String(this.acceleration ?? "balanced");
    const chunkOverlap = Number(this.chunk_overlap ?? 5);
    const outputFormat = String(this.output_format ?? "wav");
    const maxChunkDuration = Number(this.max_chunk_duration ?? 60);
    const rerankingCandidates = Number(this.reranking_candidates ?? 1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      acceleration: acceleration,
      chunk_overlap: chunkOverlap,
      output_format: outputFormat,
      max_chunk_duration: maxChunkDuration,
      reranking_candidates: rerankingCandidates
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const maskVideoRef = this.mask_video as Record<string, unknown> | undefined;
    if (isRefSet(maskVideoRef)) {
      const maskVideoUrl = await assetToFalUrl(apiKey, maskVideoRef!);
      if (maskVideoUrl) args["mask_video_url"] = maskVideoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/sam-audio/visual-separate",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class MireloAiSfxV15VideoToAudio extends FalNode {
  static readonly nodeType = "fal.video_to_audio.MireloAiSfxV15VideoToAudio";
  static readonly title = "Mirelo Ai Sfx V15 Video To Audio";
  static readonly description = `Generate synced sounds for any video, and return the new sound track (like MMAudio)
audio, extraction, video-to-audio, processing`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "list[Audio]" };

  @prop({
    type: "str",
    default: 2,
    description: "The number of samples to generate from the model"
  })
  declare num_samples: any;

  @prop({
    type: "str",
    default: 10,
    description: "The duration of the generated audio in seconds"
  })
  declare duration: any;

  @prop({
    type: "str",
    default: 0,
    description:
      "The start offset in seconds to start the audio generation from"
  })
  declare start_offset: any;

  @prop({
    type: "video",
    default: "",
    description:
      "A video url that can accessed from the API to process and add sound effects"
  })
  declare video: any;

  @prop({
    type: "str",
    default: 8069,
    description:
      "The seed to use for the generation. If not provided, a random seed will be used"
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "Additional description to guide the model"
  })
  declare text_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const numSamples = String(this.num_samples ?? 2);
    const duration = String(this.duration ?? 10);
    const startOffset = String(this.start_offset ?? 0);
    const seed = String(this.seed ?? 8069);
    const textPrompt = String(this.text_prompt ?? "");

    const args: Record<string, unknown> = {
      num_samples: numSamples,
      duration: duration,
      start_offset: startOffset,
      seed: seed,
      text_prompt: textPrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "mirelo-ai/sfx-v1.5/video-to-audio",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class KlingVideoVideoToAudio extends FalNode {
  static readonly nodeType = "fal.video_to_audio.KlingVideoVideoToAudio";
  static readonly title = "Kling Video Video To Audio";
  static readonly description = `Generate audio from input videos using Kling
audio, extraction, video-to-audio, processing`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video", audio: "audio" };

  @prop({
    type: "video",
    default: "",
    description:
      "The video URL to extract audio from. Only .mp4/.mov formats are supported. File size does not exceed 100MB. Video duration between 3.0s and 20.0s."
  })
  declare video: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Enable ASMR mode. This mode enhances detailed sound effects and is suitable for highly immersive content scenarios."
  })
  declare asmr_mode: any;

  @prop({
    type: "str",
    default: "intense car race",
    description: "Background music prompt. Cannot exceed 200 characters."
  })
  declare background_music_prompt: any;

  @prop({
    type: "str",
    default: "Car tires screech as they accelerate in a drag race",
    description: "Sound effect prompt. Cannot exceed 200 characters."
  })
  declare sound_effect_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const asmrMode = Boolean(this.asmr_mode ?? false);
    const backgroundMusicPrompt = String(
      this.background_music_prompt ?? "intense car race"
    );
    const soundEffectPrompt = String(
      this.sound_effect_prompt ??
        "Car tires screech as they accelerate in a drag race"
    );

    const args: Record<string, unknown> = {
      asmr_mode: asmrMode,
      background_music_prompt: backgroundMusicPrompt,
      sound_effect_prompt: soundEffectPrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/video-to-audio",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MireloAiSfxV1VideoToAudio extends FalNode {
  static readonly nodeType = "fal.video_to_audio.MireloAiSfxV1VideoToAudio";
  static readonly title = "Mirelo Ai Sfx V1 Video To Audio";
  static readonly description = `Generate synced sounds for any video, and return the new sound track (like MMAudio)
audio, extraction, video-to-audio, processing`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { audio: "list[Audio]" };

  @prop({
    type: "str",
    default: 2,
    description: "The number of samples to generate from the model"
  })
  declare num_samples: any;

  @prop({
    type: "video",
    default: "",
    description:
      "A video url that can accessed from the API to process and add sound effects"
  })
  declare video: any;

  @prop({
    type: "str",
    default: 10,
    description: "The duration of the generated audio in seconds"
  })
  declare duration: any;

  @prop({
    type: "str",
    default: 2105,
    description:
      "The seed to use for the generation. If not provided, a random seed will be used"
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "Additional description to guide the model"
  })
  declare text_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const numSamples = String(this.num_samples ?? 2);
    const duration = String(this.duration ?? 10);
    const seed = String(this.seed ?? 2105);
    const textPrompt = String(this.text_prompt ?? "");

    const args: Record<string, unknown> = {
      num_samples: numSamples,
      duration: duration,
      seed: seed,
      text_prompt: textPrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "mirelo-ai/sfx-v1/video-to-audio",
      args
    );
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export const FAL_VIDEO_TO_AUDIO_NODES: readonly NodeClass[] = [
  SamAudioVisualSeparate,
  MireloAiSfxV15VideoToAudio,
  KlingVideoVideoToAudio,
  MireloAiSfxV1VideoToAudio
] as const;
