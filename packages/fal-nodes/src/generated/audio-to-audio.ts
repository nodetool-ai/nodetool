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

export class ElevenlabsVoiceChanger extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.ElevenlabsVoiceChanger";
  static readonly title = "Elevenlabs Voice Changer";
  static readonly description = `ElevenLabs Voice Changer transforms voice characteristics in audio with AI-powered voice conversion.
audio, voice-change, elevenlabs, transformation, audio-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];

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

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const voice = String(inputs.voice ?? this.voice ?? "Rachel");
    const removeBackgroundNoise = Boolean(inputs.remove_background_noise ?? this.remove_background_noise ?? false);
    const seed = Number(inputs.seed ?? this.seed ?? -1);
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "mp3_44100_128");

    const args: Record<string, unknown> = {
      "voice": voice,
      "remove_background_noise": removeBackgroundNoise,
      "seed": seed,
      "output_format": outputFormat,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/elevenlabs/voice-changer", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class NovaSr extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.NovaSr";
  static readonly title = "Nova Sr";
  static readonly description = `Nova SR enhances audio quality through super-resolution processing for clearer and richer sound.
audio, enhancement, super-resolution, quality, audio-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "str", default: "192k", description: "The bitrate of the output audio." })
  declare bitrate: any;

  @prop({ type: "audio", default: "", description: "The URL of the audio file to enhance." })
  declare audio: any;

  @prop({ type: "enum", default: "mp3", values: ["mp3", "aac", "m4a", "ogg", "opus", "flac", "wav"], description: "The format for the output audio." })
  declare audio_format: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const syncMode = Boolean(inputs.sync_mode ?? this.sync_mode ?? false);
    const bitrate = String(inputs.bitrate ?? this.bitrate ?? "192k");
    const audioFormat = String(inputs.audio_format ?? this.audio_format ?? "mp3");

    const args: Record<string, unknown> = {
      "sync_mode": syncMode,
      "bitrate": bitrate,
      "audio_format": audioFormat,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/nova-sr", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class Deepfilternet3 extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.Deepfilternet3";
  static readonly title = "Deepfilternet3";
  static readonly description = `DeepFilterNet3 removes noise and improves audio quality with advanced deep learning filtering.
audio, noise-reduction, filtering, cleaning, audio-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "str", default: "192k", description: "The bitrate of the output audio." })
  declare bitrate: any;

  @prop({ type: "audio", default: "", description: "The URL of the audio to enhance." })
  declare audio: any;

  @prop({ type: "enum", default: "mp3", values: ["mp3", "aac", "m4a", "ogg", "opus", "flac", "wav"], description: "The format for the output audio." })
  declare audio_format: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const syncMode = Boolean(inputs.sync_mode ?? this.sync_mode ?? false);
    const bitrate = String(inputs.bitrate ?? this.bitrate ?? "192k");
    const audioFormat = String(inputs.audio_format ?? this.audio_format ?? "mp3");

    const args: Record<string, unknown> = {
      "sync_mode": syncMode,
      "bitrate": bitrate,
      "audio_format": audioFormat,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/deepfilternet3", args);
    return { output: res };
  }
}

export class SamAudioSeparate extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.SamAudioSeparate";
  static readonly title = "Sam Audio Separate";
  static readonly description = `SAM Audio Separate isolates and extracts different audio sources from mixed recordings.
audio, separation, source-extraction, isolation, audio-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];

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

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const chunkOverlap = Number(inputs.chunk_overlap ?? this.chunk_overlap ?? 5);
    const acceleration = String(inputs.acceleration ?? this.acceleration ?? "balanced");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "wav");
    const maxChunkDuration = Number(inputs.max_chunk_duration ?? this.max_chunk_duration ?? 60);
    const predictSpans = Boolean(inputs.predict_spans ?? this.predict_spans ?? false);
    const rerankingCandidates = Number(inputs.reranking_candidates ?? this.reranking_candidates ?? 1);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "chunk_overlap": chunkOverlap,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "max_chunk_duration": maxChunkDuration,
      "predict_spans": predictSpans,
      "reranking_candidates": rerankingCandidates,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sam-audio/separate", args);
    return { output: res };
  }
}

export class SamAudioSpanSeparate extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.SamAudioSpanSeparate";
  static readonly title = "Sam Audio Span Separate";
  static readonly description = `SAM Audio Span Separate isolates audio sources across time spans with precise temporal control.
audio, separation, temporal, span, audio-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];

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

  @prop({ type: "float", default: 60, description: "Maximum audio duration (in seconds) to process in a single pass. Longer audio will be chunked with overlap and blended." })
  declare max_chunk_duration: any;

  @prop({ type: "bool", default: false, description: "Trim output audio to only include the specified span time range. If False, returns the full audio length with the target sound isolated throughout." })
  declare trim_to_span: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to process." })
  declare audio: any;

  @prop({ type: "int", default: 1, description: "Number of candidates to generate and rank. Higher improves quality but increases latency and cost. Requires text prompt; ignored for span-only separation." })
  declare reranking_candidates: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const chunkOverlap = Number(inputs.chunk_overlap ?? this.chunk_overlap ?? 5);
    const spans = String(inputs.spans ?? this.spans ?? []);
    const acceleration = String(inputs.acceleration ?? this.acceleration ?? "balanced");
    const useSoundActivityRanking = Boolean(inputs.use_sound_activity_ranking ?? this.use_sound_activity_ranking ?? false);
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "wav");
    const maxChunkDuration = Number(inputs.max_chunk_duration ?? this.max_chunk_duration ?? 60);
    const trimToSpan = Boolean(inputs.trim_to_span ?? this.trim_to_span ?? false);
    const rerankingCandidates = Number(inputs.reranking_candidates ?? this.reranking_candidates ?? 1);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "chunk_overlap": chunkOverlap,
      "spans": spans,
      "acceleration": acceleration,
      "use_sound_activity_ranking": useSoundActivityRanking,
      "output_format": outputFormat,
      "max_chunk_duration": maxChunkDuration,
      "trim_to_span": trimToSpan,
      "reranking_candidates": rerankingCandidates,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sam-audio/span-separate", args);
    return { output: res };
  }
}

export class Demucs extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.Demucs";
  static readonly title = "Demucs";
  static readonly description = `Demucs separates music into vocals, drums, bass, and other instruments with high quality.
audio, music-separation, stems, demucs, audio-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];

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

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const segmentLength = String(inputs.segment_length ?? this.segment_length ?? "");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "mp3");
    const stems = String(inputs.stems ?? this.stems ?? "");
    const overlap = Number(inputs.overlap ?? this.overlap ?? 0.25);
    const model = String(inputs.model ?? this.model ?? "htdemucs_6s");
    const shifts = Number(inputs.shifts ?? this.shifts ?? 1);

    const args: Record<string, unknown> = {
      "segment_length": segmentLength,
      "output_format": outputFormat,
      "stems": stems,
      "overlap": overlap,
      "model": model,
      "shifts": shifts,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/demucs", args);
    return { output: res };
  }
}

export class StableAudio25AudioToAudio extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.StableAudio25AudioToAudio";
  static readonly title = "Stable Audio25 Audio To Audio";
  static readonly description = `Stable Audio 2.5 transforms and modifies audio with AI-powered processing and effects.
audio, transformation, stable-audio, 2.5, audio-to-audio`;
  static readonly requiredSettings = ["FAL_API_KEY"];

  @prop({ type: "str", default: "", description: "The prompt to guide the audio generation" })
  declare prompt: any;

  @prop({ type: "float", default: 0.8, description: "Sometimes referred to as denoising, this parameter controls how much influence the 'audio_url' parameter has on the generated audio. A value of 0 would yield audio that is identical to the input. A value of 1 would be as if you passed in no audio at all." })
  declare strength: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "int", default: 1, description: "How strictly the diffusion process adheres to the prompt text (higher values make your audio closer to your prompt). " })
  declare guidance_scale: any;

  @prop({ type: "str", default: "" })
  declare seed: any;

  @prop({ type: "audio", default: "", description: "The audio clip to transform" })
  declare audio: any;

  @prop({ type: "int", default: 8, description: "The number of steps to denoise the audio for" })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "The duration of the audio clip to generate. If not provided, it will be set to the duration of the input audio." })
  declare total_seconds: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const strength = Number(inputs.strength ?? this.strength ?? 0.8);
    const syncMode = Boolean(inputs.sync_mode ?? this.sync_mode ?? false);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 1);
    const seed = String(inputs.seed ?? this.seed ?? "");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 8);
    const totalSeconds = String(inputs.total_seconds ?? this.total_seconds ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "strength": strength,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "total_seconds": totalSeconds,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/stable-audio-25/audio-to-audio", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class FfmpegApiMergeAudios extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.FfmpegApiMergeAudios";
  static readonly title = "Ffmpeg Api Merge Audios";
  static readonly description = `FFmpeg API Merge Audios combines multiple audio files into a single output.
audio, processing, audio-to-audio, merging, ffmpeg`;
  static readonly requiredSettings = ["FAL_API_KEY"];

  @prop({ type: "list[audio]", default: [], description: "List of audio URLs to merge in order. The 0th stream of the audio will be considered as the merge candidate." })
  declare audio_urls: any;

  @prop({ type: "str", default: "", description: "Output format of the combined audio. If not used, will be determined automatically using FFMPEG. Formatted as codec_sample_rate_bitrate." })
  declare output_format: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "");

    const args: Record<string, unknown> = {
      "output_format": outputFormat,
    };

    const audioUrlsList = inputs.audio_urls as Record<string, unknown>[] | undefined;
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

  @prop({ type: "video", default: "", description: "URL of the voice audio file. Supports .mp3/.wav audio or .mp4/.mov video. Duration must be 5-30 seconds with clean, single-voice audio." })
  declare voice_url: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const args: Record<string, unknown> = {
    };

    const voiceUrlRef = inputs.voice_url as Record<string, unknown> | undefined;
    if (isRefSet(voiceUrlRef)) {
      const voiceUrlUrl = await assetToFalUrl(apiKey, voiceUrlRef!);
      if (voiceUrlUrl) args["voice_url"] = voiceUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/kling-video/create-voice", args);
    return { output: res };
  }
}

export class AudioUnderstanding extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.AudioUnderstanding";
  static readonly title = "Audio Understanding";
  static readonly description = `A audio understanding model to analyze audio content and answer questions about what's happening in the audio based on user prompts.
audio, processing, audio-to-audio, transformation`;
  static readonly requiredSettings = ["FAL_API_KEY"];

  @prop({ type: "str", default: "", description: "The question or prompt about the audio content." })
  declare prompt: any;

  @prop({ type: "bool", default: false, description: "Whether to request a more detailed analysis of the audio" })
  declare detailed_analysis: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to analyze" })
  declare audio: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const detailedAnalysis = Boolean(inputs.detailed_analysis ?? this.detailed_analysis ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "detailed_analysis": detailedAnalysis,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/audio-understanding", args);
    return { output: res };
  }
}

export class StableAudio25Inpaint extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.StableAudio25Inpaint";
  static readonly title = "Stable Audio25 Inpaint";
  static readonly description = `Generate high quality music and sound effects using Stable Audio 2.5 from StabilityAI
audio, processing, audio-to-audio, transformation`;
  static readonly requiredSettings = ["FAL_API_KEY"];

  @prop({ type: "str", default: "", description: "The prompt to guide the audio generation" })
  declare prompt: any;

  @prop({ type: "int", default: 8, description: "The number of steps to denoise the audio for" })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 190, description: "The end point of the audio mask" })
  declare mask_end: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "str", default: 190, description: "The duration of the audio clip to generate. If not provided, it will be set to the duration of the input audio." })
  declare seconds_total: any;

  @prop({ type: "str", default: "" })
  declare seed: any;

  @prop({ type: "int", default: 1, description: "How strictly the diffusion process adheres to the prompt text (higher values make your audio closer to your prompt). " })
  declare guidance_scale: any;

  @prop({ type: "audio", default: "", description: "The audio clip to inpaint" })
  declare audio: any;

  @prop({ type: "int", default: 30, description: "The start point of the audio mask" })
  declare mask_start: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 8);
    const maskEnd = Number(inputs.mask_end ?? this.mask_end ?? 190);
    const syncMode = Boolean(inputs.sync_mode ?? this.sync_mode ?? false);
    const secondsTotal = String(inputs.seconds_total ?? this.seconds_total ?? 190);
    const seed = String(inputs.seed ?? this.seed ?? "");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 1);
    const maskStart = Number(inputs.mask_start ?? this.mask_start ?? 30);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_inference_steps": numInferenceSteps,
      "mask_end": maskEnd,
      "sync_mode": syncMode,
      "seconds_total": secondsTotal,
      "seed": seed,
      "guidance_scale": guidanceScale,
      "mask_start": maskStart,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/stable-audio-25/inpaint", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class SonautoV2Extend extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.SonautoV2Extend";
  static readonly title = "Sonauto V2 Extend";
  static readonly description = `Extend an existing song
audio, processing, audio-to-audio, transformation`;
  static readonly requiredSettings = ["FAL_API_KEY"];

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

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const lyricsPrompt = String(inputs.lyrics_prompt ?? this.lyrics_prompt ?? "");
    const tags = String(inputs.tags ?? this.tags ?? "");
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 1.8);
    const outputBitRate = String(inputs.output_bit_rate ?? this.output_bit_rate ?? "");
    const numSongs = Number(inputs.num_songs ?? this.num_songs ?? 1);
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "wav");
    const side = String(inputs.side ?? this.side ?? "");
    const balanceStrength = Number(inputs.balance_strength ?? this.balance_strength ?? 0.7);
    const cropDuration = Number(inputs.crop_duration ?? this.crop_duration ?? 0);
    const seed = String(inputs.seed ?? this.seed ?? "");
    const extendDuration = String(inputs.extend_duration ?? this.extend_duration ?? "");

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

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "sonauto/v2/extend", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class AceStepAudioOutpaint extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.AceStepAudioOutpaint";
  static readonly title = "Ace Step Audio Outpaint";
  static readonly description = `Extend the beginning or end of provided audio with lyrics and/or style using ACE-Step
audio, processing, audio-to-audio, transformation`;
  static readonly requiredSettings = ["FAL_API_KEY"];

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

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const numberOfSteps = Number(inputs.number_of_steps ?? this.number_of_steps ?? 27);
    const tags = String(inputs.tags ?? this.tags ?? "");
    const minimumGuidanceScale = Number(inputs.minimum_guidance_scale ?? this.minimum_guidance_scale ?? 3);
    const extendAfterDuration = Number(inputs.extend_after_duration ?? this.extend_after_duration ?? 30);
    const lyrics = String(inputs.lyrics ?? this.lyrics ?? "");
    const tagGuidanceScale = Number(inputs.tag_guidance_scale ?? this.tag_guidance_scale ?? 5);
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "euler");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 15);
    const guidanceType = String(inputs.guidance_type ?? this.guidance_type ?? "apg");
    const extendBeforeDuration = Number(inputs.extend_before_duration ?? this.extend_before_duration ?? 0);
    const lyricGuidanceScale = Number(inputs.lyric_guidance_scale ?? this.lyric_guidance_scale ?? 1.5);
    const guidanceInterval = Number(inputs.guidance_interval ?? this.guidance_interval ?? 0.5);
    const guidanceIntervalDecay = Number(inputs.guidance_interval_decay ?? this.guidance_interval_decay ?? 0);
    const seed = String(inputs.seed ?? this.seed ?? "");
    const granularityScale = Number(inputs.granularity_scale ?? this.granularity_scale ?? 10);

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

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ace-step/audio-outpaint", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class AceStepAudioInpaint extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.AceStepAudioInpaint";
  static readonly title = "Ace Step Audio Inpaint";
  static readonly description = `Modify a portion of provided audio with lyrics and/or style using ACE-Step
audio, processing, audio-to-audio, transformation`;
  static readonly requiredSettings = ["FAL_API_KEY"];

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

  @prop({ type: "float", default: 15, description: "Guidance scale for the generation." })
  declare guidance_scale: any;

  @prop({ type: "enum", default: "apg", values: ["cfg", "apg", "cfg_star"], description: "Type of CFG to use for the generation process." })
  declare guidance_type: any;

  @prop({ type: "float", default: 30, description: "end time in seconds for the inpainting process." })
  declare end_time: any;

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

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const numberOfSteps = Number(inputs.number_of_steps ?? this.number_of_steps ?? 27);
    const startTime = Number(inputs.start_time ?? this.start_time ?? 0);
    const tags = String(inputs.tags ?? this.tags ?? "");
    const minimumGuidanceScale = Number(inputs.minimum_guidance_scale ?? this.minimum_guidance_scale ?? 3);
    const lyrics = String(inputs.lyrics ?? this.lyrics ?? "");
    const endTimeRelativeTo = String(inputs.end_time_relative_to ?? this.end_time_relative_to ?? "start");
    const tagGuidanceScale = Number(inputs.tag_guidance_scale ?? this.tag_guidance_scale ?? 5);
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "euler");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 15);
    const guidanceType = String(inputs.guidance_type ?? this.guidance_type ?? "apg");
    const endTime = Number(inputs.end_time ?? this.end_time ?? 30);
    const lyricGuidanceScale = Number(inputs.lyric_guidance_scale ?? this.lyric_guidance_scale ?? 1.5);
    const guidanceInterval = Number(inputs.guidance_interval ?? this.guidance_interval ?? 0.5);
    const variance = Number(inputs.variance ?? this.variance ?? 0.5);
    const guidanceIntervalDecay = Number(inputs.guidance_interval_decay ?? this.guidance_interval_decay ?? 0);
    const startTimeRelativeTo = String(inputs.start_time_relative_to ?? this.start_time_relative_to ?? "start");
    const seed = String(inputs.seed ?? this.seed ?? "");
    const granularityScale = Number(inputs.granularity_scale ?? this.granularity_scale ?? 10);

    const args: Record<string, unknown> = {
      "number_of_steps": numberOfSteps,
      "start_time": startTime,
      "tags": tags,
      "minimum_guidance_scale": minimumGuidanceScale,
      "lyrics": lyrics,
      "end_time_relative_to": endTimeRelativeTo,
      "tag_guidance_scale": tagGuidanceScale,
      "scheduler": scheduler,
      "guidance_scale": guidanceScale,
      "guidance_type": guidanceType,
      "end_time": endTime,
      "lyric_guidance_scale": lyricGuidanceScale,
      "guidance_interval": guidanceInterval,
      "variance": variance,
      "guidance_interval_decay": guidanceIntervalDecay,
      "start_time_relative_to": startTimeRelativeTo,
      "seed": seed,
      "granularity_scale": granularityScale,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ace-step/audio-inpaint", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class AceStepAudioToAudio extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.AceStepAudioToAudio";
  static readonly title = "Ace Step Audio To Audio";
  static readonly description = `Generate music from a lyrics and example audio using ACE-Step
audio, processing, audio-to-audio, transformation`;
  static readonly requiredSettings = ["FAL_API_KEY"];

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

  @prop({ type: "enum", default: "remix", values: ["lyrics", "remix"], description: "Whether to edit the lyrics only or remix the audio." })
  declare edit_mode: any;

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

  @prop({ type: "str", default: "", description: "Original tags of the audio file." })
  declare original_tags: any;

  @prop({ type: "str", default: "", description: "Original seed of the audio file." })
  declare original_seed: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const numberOfSteps = Number(inputs.number_of_steps ?? this.number_of_steps ?? 27);
    const tags = String(inputs.tags ?? this.tags ?? "");
    const minimumGuidanceScale = Number(inputs.minimum_guidance_scale ?? this.minimum_guidance_scale ?? 3);
    const lyrics = String(inputs.lyrics ?? this.lyrics ?? "");
    const tagGuidanceScale = Number(inputs.tag_guidance_scale ?? this.tag_guidance_scale ?? 5);
    const originalLyrics = String(inputs.original_lyrics ?? this.original_lyrics ?? "");
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "euler");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 15);
    const guidanceType = String(inputs.guidance_type ?? this.guidance_type ?? "apg");
    const lyricGuidanceScale = Number(inputs.lyric_guidance_scale ?? this.lyric_guidance_scale ?? 1.5);
    const editMode = String(inputs.edit_mode ?? this.edit_mode ?? "remix");
    const guidanceInterval = Number(inputs.guidance_interval ?? this.guidance_interval ?? 0.5);
    const guidanceIntervalDecay = Number(inputs.guidance_interval_decay ?? this.guidance_interval_decay ?? 0);
    const seed = String(inputs.seed ?? this.seed ?? "");
    const granularityScale = Number(inputs.granularity_scale ?? this.granularity_scale ?? 10);
    const originalTags = String(inputs.original_tags ?? this.original_tags ?? "");
    const originalSeed = String(inputs.original_seed ?? this.original_seed ?? "");

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
      "edit_mode": editMode,
      "guidance_interval": guidanceInterval,
      "guidance_interval_decay": guidanceIntervalDecay,
      "seed": seed,
      "granularity_scale": granularityScale,
      "original_tags": originalTags,
      "original_seed": originalSeed,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ace-step/audio-to-audio", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class DiaTtsVoiceClone extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.DiaTtsVoiceClone";
  static readonly title = "Dia Tts Voice Clone";
  static readonly description = `Clone dialog voices from a sample audio and generate dialogs from text prompts using the Dia TTS which leverages advanced AI techniques to create high-quality text-to-speech.
audio, processing, audio-to-audio, transformation`;
  static readonly requiredSettings = ["FAL_API_KEY"];

  @prop({ type: "str", default: "", description: "The text to be converted to speech." })
  declare text: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const text = String(inputs.text ?? this.text ?? "");

    const args: Record<string, unknown> = {
      "text": text,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/dia-tts/voice-clone", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class ElevenlabsAudioIsolation extends FalNode {
  static readonly nodeType = "fal.audio_to_audio.ElevenlabsAudioIsolation";
  static readonly title = "Elevenlabs Audio Isolation";
  static readonly description = `Isolate audio tracks using ElevenLabs advanced audio isolation technology.
audio, processing, audio-to-audio, transformation`;
  static readonly requiredSettings = ["FAL_API_KEY"];

  @prop({ type: "video", default: "", description: "Video file to use for audio isolation. Either 'audio_url' or 'video_url' must be provided." })
  declare video: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to isolate voice from" })
  declare audio: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const args: Record<string, unknown> = {
    };

    const videoRef = inputs.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/elevenlabs/audio-isolation", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export const FAL_AUDIO_TO_AUDIO_NODES: readonly NodeClass[] = [
  ElevenlabsVoiceChanger,
  NovaSr,
  Deepfilternet3,
  SamAudioSeparate,
  SamAudioSpanSeparate,
  Demucs,
  StableAudio25AudioToAudio,
  FfmpegApiMergeAudios,
  KlingVideoCreateVoice,
  AudioUnderstanding,
  StableAudio25Inpaint,
  SonautoV2Extend,
  AceStepAudioOutpaint,
  AceStepAudioInpaint,
  AceStepAudioToAudio,
  DiaTtsVoiceClone,
  ElevenlabsAudioIsolation,
] as const;