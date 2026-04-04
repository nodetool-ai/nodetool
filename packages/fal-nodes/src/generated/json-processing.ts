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

export class FfmpegApiLoudnorm extends FalNode {
  static readonly nodeType = "fal.json_processing.FfmpegApiLoudnorm";
  static readonly title = "Ffmpeg Api Loudnorm";
  static readonly description = `Get EBU R128 loudness normalization from audio files using FFmpeg API.
json, processing, data, utility`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { summary: "str", audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "Measured loudness range of input file in LU. Required for linear mode."
  })
  declare measured_lra: any;

  @prop({
    type: "bool",
    default: false,
    description: "Return loudness measurement summary with the normalized audio"
  })
  declare print_summary: any;

  @prop({
    type: "float",
    default: 0,
    description: "Offset gain in dB applied before the true-peak limiter"
  })
  declare offset: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Measured integrated loudness of input file in LUFS. Required for linear mode."
  })
  declare measured_i: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Measured true peak of input file in dBTP. Required for linear mode."
  })
  declare measured_tp: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Use linear normalization mode (single-pass). If false, uses dynamic mode (two-pass for better quality)."
  })
  declare linear: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Treat mono input files as dual-mono for correct EBU R128 measurement on stereo systems"
  })
  declare dual_mono: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Measured threshold of input file in LUFS. Required for linear mode."
  })
  declare measured_thresh: any;

  @prop({
    type: "float",
    default: -0.1,
    description: "Maximum true peak in dBTP."
  })
  declare true_peak: any;

  @prop({
    type: "audio",
    default: "",
    description: "URL of the audio file to normalize"
  })
  declare audio: any;

  @prop({
    type: "float",
    default: -18,
    description: "Integrated loudness target in LUFS."
  })
  declare integrated_loudness: any;

  @prop({
    type: "float",
    default: 7,
    description: "Loudness range target in LU"
  })
  declare loudness_range: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const measuredLra = String(this.measured_lra ?? "");
    const printSummary = Boolean(this.print_summary ?? false);
    const offset = Number(this.offset ?? 0);
    const measuredI = String(this.measured_i ?? "");
    const measuredTp = String(this.measured_tp ?? "");
    const linear = Boolean(this.linear ?? false);
    const dualMono = Boolean(this.dual_mono ?? false);
    const measuredThresh = String(this.measured_thresh ?? "");
    const truePeak = Number(this.true_peak ?? -0.1);
    const integratedLoudness = Number(this.integrated_loudness ?? -18);
    const loudnessRange = Number(this.loudness_range ?? 7);

    const args: Record<string, unknown> = {
      measured_lra: measuredLra,
      print_summary: printSummary,
      offset: offset,
      measured_i: measuredI,
      measured_tp: measuredTp,
      linear: linear,
      dual_mono: dualMono,
      measured_thresh: measuredThresh,
      true_peak: truePeak,
      integrated_loudness: integratedLoudness,
      loudness_range: loudnessRange
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ffmpeg-api/loudnorm", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class FfmpegApiWaveform extends FalNode {
  static readonly nodeType = "fal.json_processing.FfmpegApiWaveform";
  static readonly title = "Ffmpeg Api Waveform";
  static readonly description = `Get waveform data from audio files using FFmpeg API.
json, processing, data, utility`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    waveform: "list[float]",
    duration: "float",
    points: "int",
    precision: "int"
  };

  @prop({
    type: "float",
    default: 4,
    description:
      "Controls how many points are sampled per second of audio. Lower values (e.g. 1-2) create a coarser waveform, higher values (e.g. 4-10) create a more detailed one."
  })
  declare points_per_second: any;

  @prop({
    type: "int",
    default: 3,
    description:
      "Size of the smoothing window. Higher values create a smoother waveform. Must be an odd number."
  })
  declare smoothing_window: any;

  @prop({
    type: "audio",
    default: "",
    description: "URL of the audio file to analyze"
  })
  declare media_url: any;

  @prop({
    type: "int",
    default: 2,
    description:
      "Number of decimal places for the waveform values. Higher values provide more precision but increase payload size."
  })
  declare precision: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const pointsPerSecond = Number(this.points_per_second ?? 4);
    const smoothingWindow = Number(this.smoothing_window ?? 3);
    const precision = Number(this.precision ?? 2);

    const args: Record<string, unknown> = {
      points_per_second: pointsPerSecond,
      smoothing_window: smoothingWindow,
      precision: precision
    };

    const mediaUrlRef = this.media_url as Record<string, unknown> | undefined;
    if (isRefSet(mediaUrlRef)) {
      const mediaUrlUrl = await assetToFalUrl(apiKey, mediaUrlRef!);
      if (mediaUrlUrl) args["media_url"] = mediaUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ffmpeg-api/waveform", args);
    return res as Record<string, unknown>;
  }
}

export class FfmpegApiMetadata extends FalNode {
  static readonly nodeType = "fal.json_processing.FfmpegApiMetadata";
  static readonly title = "Ffmpeg Api Metadata";
  static readonly description = `Get encoding metadata from video and audio files using FFmpeg API.
json, processing, data, utility`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { media: "str" };

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to extract the start and end frames for videos. Note that when true the request will be slower."
  })
  declare extract_frames: any;

  @prop({
    type: "video",
    default: "",
    description: "URL of the media file (video or audio) to analyze"
  })
  declare media_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const extractFrames = Boolean(this.extract_frames ?? false);

    const args: Record<string, unknown> = {
      extract_frames: extractFrames
    };

    const mediaUrlRef = this.media_url as Record<string, unknown> | undefined;
    if (isRefSet(mediaUrlRef)) {
      const mediaUrlUrl = await assetToFalUrl(apiKey, mediaUrlRef!);
      if (mediaUrlUrl) args["media_url"] = mediaUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ffmpeg-api/metadata", args);
    return res as Record<string, unknown>;
  }
}

export const FAL_JSON_PROCESSING_NODES: readonly NodeClass[] = [
  FfmpegApiLoudnorm,
  FfmpegApiWaveform,
  FfmpegApiMetadata
] as const;
