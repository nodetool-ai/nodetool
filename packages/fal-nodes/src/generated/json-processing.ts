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

export class FfmpegApiLoudnorm extends FalNode {
  static readonly nodeType = "fal.json_processing.FfmpegApiLoudnorm";
  static readonly title = "Ffmpeg Api Loudnorm";
  static readonly description = `Get EBU R128 loudness normalization from audio files using FFmpeg API.
json, processing, data, utility`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "summary": "str", "audio": "audio" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/ffmpeg-api/loudnorm",
    unitPrice: 0.00017,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Measured loudness range of input file in LU. Required for linear mode." })
  declare measured_lra: any;

  @prop({ type: "bool", default: false, description: "Return loudness measurement summary with the normalized audio" })
  declare print_summary: any;

  @prop({ type: "float", default: 0, description: "Offset gain in dB applied before the true-peak limiter" })
  declare offset: any;

  @prop({ type: "str", default: "", description: "Measured integrated loudness of input file in LUFS. Required for linear mode." })
  declare measured_i: any;

  @prop({ type: "str", default: "", description: "Measured true peak of input file in dBTP. Required for linear mode." })
  declare measured_tp: any;

  @prop({ type: "bool", default: false, description: "Use linear normalization mode (single-pass). If false, uses dynamic mode (two-pass for better quality)." })
  declare linear: any;

  @prop({ type: "bool", default: false, description: "Treat mono input files as dual-mono for correct EBU R128 measurement on stereo systems" })
  declare dual_mono: any;

  @prop({ type: "str", default: "", description: "Measured threshold of input file in LUFS. Required for linear mode." })
  declare measured_thresh: any;

  @prop({ type: "float", default: -0.1, description: "Maximum true peak in dBTP." })
  declare true_peak: any;

  @prop({ type: "audio", default: "", description: "URL of the audio file to normalize" })
  declare audio: any;

  @prop({ type: "float", default: -18, description: "Integrated loudness target in LUFS." })
  declare integrated_loudness: any;

  @prop({ type: "float", default: 7, description: "Loudness range target in LU" })
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
      "measured_lra": measuredLra,
      "print_summary": printSummary,
      "offset": offset,
      "measured_i": measuredI,
      "measured_tp": measuredTp,
      "linear": linear,
      "dual_mono": dualMono,
      "measured_thresh": measuredThresh,
      "true_peak": truePeak,
      "integrated_loudness": integratedLoudness,
      "loudness_range": loudnessRange,
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

export class Omnilottie extends FalNode {
  static readonly nodeType = "fal.json_processing.Omnilottie";
  static readonly title = "Omnilottie";
  static readonly description = `Convert your assets into lottie using Omnilottie.
lottie`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "lottie_file": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/omnilottie",
    unitPrice: 0.05,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Text description of the Lottie animation to generate." })
  declare prompt: any;

  @prop({ type: "float", default: 0.25, description: "Nucleus sampling probability threshold." })
  declare top_p: any;

  @prop({ type: "int", default: 4096, description: "Maximum number of Lottie tokens to generate." })
  declare max_tokens: any;

  @prop({ type: "float", default: 0.9, description: "Sampling temperature for generation." })
  declare temperature: any;

  @prop({ type: "int", default: 5, description: "Top-k sampling parameter." })
  declare top_k: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const topP = Number(this.top_p ?? 0.25);
    const maxTokens = Number(this.max_tokens ?? 4096);
    const temperature = Number(this.temperature ?? 0.9);
    const topK = Number(this.top_k ?? 5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "top_p": topP,
      "max_tokens": maxTokens,
      "temperature": temperature,
      "top_k": topK,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/omnilottie", args);
    return {
      "lottie_file": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["lottie_file"]),
    };
  }
}

export class OmnilottieImageToLottie extends FalNode {
  static readonly nodeType = "fal.json_processing.OmnilottieImageToLottie";
  static readonly title = "Omnilottie Image To Lottie";
  static readonly description = `Convert your assets into lottie using Omnilottie.
lotties`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "lottie_file": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/omnilottie/image-to-lottie",
    unitPrice: 0.1,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Text description guiding the animation of the image." })
  declare prompt: any;

  @prop({ type: "image", default: "", description: "URL of the reference image to animate." })
  declare image: any;

  @prop({ type: "float", default: 0.25, description: "Nucleus sampling probability threshold." })
  declare top_p: any;

  @prop({ type: "int", default: 4096, description: "Maximum number of Lottie tokens to generate." })
  declare max_tokens: any;

  @prop({ type: "float", default: 0.9, description: "Sampling temperature for generation." })
  declare temperature: any;

  @prop({ type: "int", default: 5, description: "Top-k sampling parameter." })
  declare top_k: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const topP = Number(this.top_p ?? 0.25);
    const maxTokens = Number(this.max_tokens ?? 4096);
    const temperature = Number(this.temperature ?? 0.9);
    const topK = Number(this.top_k ?? 5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "top_p": topP,
      "max_tokens": maxTokens,
      "temperature": temperature,
      "top_k": topK,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/omnilottie/image-to-lottie", args);
    return {
      "lottie_file": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["lottie_file"]),
    };
  }
}

export class OmnilottieVideoToLottie extends FalNode {
  static readonly nodeType = "fal.json_processing.OmnilottieVideoToLottie";
  static readonly title = "Omnilottie Video To Lottie";
  static readonly description = `Convert your assets into lottie using Omnilottie.
lottie`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "lottie_file": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/omnilottie/video-to-lottie",
    unitPrice: 0.05,
    billingUnit: "videos",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Optional text description guiding the conversion." })
  declare prompt: any;

  @prop({ type: "video", default: "", description: "URL of the video to convert into a Lottie animation." })
  declare video: any;

  @prop({ type: "float", default: 0.25, description: "Nucleus sampling probability threshold." })
  declare top_p: any;

  @prop({ type: "int", default: 4096, description: "Maximum number of Lottie tokens to generate." })
  declare max_tokens: any;

  @prop({ type: "float", default: 0.9, description: "Sampling temperature for generation." })
  declare temperature: any;

  @prop({ type: "int", default: 5, description: "Top-k sampling parameter." })
  declare top_k: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const topP = Number(this.top_p ?? 0.25);
    const maxTokens = Number(this.max_tokens ?? 4096);
    const temperature = Number(this.temperature ?? 0.9);
    const topK = Number(this.top_k ?? 5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "top_p": topP,
      "max_tokens": maxTokens,
      "temperature": temperature,
      "top_k": topK,
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/omnilottie/video-to-lottie", args);
    return {
      "lottie_file": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["lottie_file"]),
    };
  }
}

export const FAL_JSON_PROCESSING_NODES: readonly NodeClass[] = [
  FfmpegApiLoudnorm,
  Omnilottie,
  OmnilottieImageToLottie,
  OmnilottieVideoToLottie,
] as const;