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

export class AMTInterpolation extends FalNode {
  static readonly nodeType = "fal.video_to_video.AMTInterpolation";
  static readonly title = "A M T Interpolation";
  static readonly description = `AMT (Any-to-Many Temporal) Interpolation creates smooth transitions between video frames.
video, interpolation, frame-generation, amt, video-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "video",
    default: "",
    description: "URL of the video to be processed"
  })
  declare video: any;

  @prop({
    type: "int",
    default: 2,
    description: "Number of recursive interpolation passes"
  })
  declare recursive_interpolation_passes: any;

  @prop({ type: "int", default: 24, description: "Output frames per second" })
  declare output_fps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const recursiveInterpolationPasses = Number(
      this.recursive_interpolation_passes ?? 2
    );
    const outputFps = Number(this.output_fps ?? 24);

    const args: Record<string, unknown> = {
      recursive_interpolation_passes: recursiveInterpolationPasses,
      output_fps: outputFps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/amt-interpolation", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class AnimateDiffVideoToVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.AnimateDiffVideoToVideo";
  static readonly title = "Animate Diff Video To Video";
  static readonly description = `AnimateDiff re-animates videos with new styles and effects using diffusion models.
video, style-transfer, animatediff, re-animation, video-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "The prompt to use for generating the image. Be as descriptive as possible for best results."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 3,
    description: "The first N number of seconds of video to animate."
  })
  declare first_n_seconds: any;

  @prop({ type: "video", default: "", description: "URL of the video." })
  declare video: any;

  @prop({
    type: "int",
    default: 8,
    description: "Number of frames per second to extract from the video."
  })
  declare fps: any;

  @prop({
    type: "float",
    default: 0.7,
    description: "The strength of the input video in the final output."
  })
  declare strength: any;

  @prop({
    type: "float",
    default: 7.5,
    description:
      "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        "
  })
  declare guidance_scale: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of Stable Diffusion\n            will output the same image every time.\n        "
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 25,
    description: "The number of inference steps to perform."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "(bad quality, worst quality:1.2), ugly faces, bad anime",
    description:
      "\n            The negative prompt to use. Use it to address details that you don't want\n            in the image. This could be colors, objects, scenery and even the small details\n            (e.g. moustache, blurry, low resolution).\n        "
  })
  declare negative_prompt: any;

  @prop({
    type: "list[str]",
    default: [],
    description: "The motions to apply to the video."
  })
  declare motions: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const firstNSeconds = Number(this.first_n_seconds ?? 3);
    const fps = Number(this.fps ?? 8);
    const strength = Number(this.strength ?? 0.7);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 25);
    const negativePrompt = String(
      this.negative_prompt ??
        "(bad quality, worst quality:1.2), ugly faces, bad anime"
    );
    const motions = String(this.motions ?? []);

    const args: Record<string, unknown> = {
      prompt: prompt,
      first_n_seconds: firstNSeconds,
      fps: fps,
      strength: strength,
      guidance_scale: guidanceScale,
      seed: seed,
      num_inference_steps: numInferenceSteps,
      negative_prompt: negativePrompt,
      motions: motions
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/fast-animatediff/video-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class AnimateDiffTurboVideoToVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.AnimateDiffTurboVideoToVideo";
  static readonly title = "Animate Diff Turbo Video To Video";
  static readonly description = `AnimateDiff Turbo re-animates videos quickly with reduced generation time.
video, style-transfer, animatediff, turbo, fast, video-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "The prompt to use for generating the image. Be as descriptive as possible for best results."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 3,
    description: "The first N number of seconds of video to animate."
  })
  declare first_n_seconds: any;

  @prop({ type: "video", default: "", description: "URL of the video." })
  declare video: any;

  @prop({
    type: "int",
    default: 8,
    description: "Number of frames per second to extract from the video."
  })
  declare fps: any;

  @prop({
    type: "float",
    default: 0.7,
    description: "The strength of the input video in the final output."
  })
  declare strength: any;

  @prop({
    type: "float",
    default: 2,
    description:
      "The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt when looking for a related image to show you."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 12,
    description:
      "The number of inference steps to perform. 4-12 is recommended for turbo mode."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of Stable Diffusion\n            will output the same image every time.\n        "
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "(bad quality, worst quality:1.2), ugly faces, bad anime",
    description:
      "\n            The negative prompt to use. Use it to address details that you don't want\n            in the image. This could be colors, objects, scenery and even the small details\n            (e.g. moustache, blurry, low resolution).\n        "
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const firstNSeconds = Number(this.first_n_seconds ?? 3);
    const fps = Number(this.fps ?? 8);
    const strength = Number(this.strength ?? 0.7);
    const guidanceScale = Number(this.guidance_scale ?? 2);
    const numInferenceSteps = Number(this.num_inference_steps ?? 12);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(
      this.negative_prompt ??
        "(bad quality, worst quality:1.2), ugly faces, bad anime"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      first_n_seconds: firstNSeconds,
      fps: fps,
      strength: strength,
      guidance_scale: guidanceScale,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/fast-animatediff/turbo/video-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class AutoCaption extends FalNode {
  static readonly nodeType = "fal.video_to_video.AutoCaption";
  static readonly title = "Auto Caption";
  static readonly description = `Auto Caption automatically generates and adds captions to videos with speech recognition.
video, captions, subtitles, speech-to-text, video-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video_url: "video" };

  @prop({
    type: "str",
    default: "Standard",
    description:
      "Font for generated captions. Choose one in 'Arial','Standard','Garamond', 'Times New Roman','Georgia', or pass a url to a .ttf file"
  })
  declare txt_font: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the .mp4 video with audio. Only videos of size <400MB are allowed."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "center",
    description:
      "Top-to-bottom alignment of the text. Can be a string ('top', 'center', 'bottom') or a float (0.0-1.0)"
  })
  declare top_align: any;

  @prop({
    type: "str",
    default: "white",
    description:
      "Colour of the text. Can be a RGB tuple, a color name, or an hexadecimal notation."
  })
  declare txt_color: any;

  @prop({
    type: "int",
    default: 1,
    description: "Width of the text strokes in pixels"
  })
  declare stroke_width: any;

  @prop({
    type: "float",
    default: 1.5,
    description:
      "Number of seconds the captions should stay on screen. A higher number will also result in more text being displayed at once."
  })
  declare refresh_interval: any;

  @prop({
    type: "int",
    default: 24,
    description: "Size of text in generated captions."
  })
  declare font_size: any;

  @prop({
    type: "str",
    default: "center",
    description:
      "Left-to-right alignment of the text. Can be a string ('left', 'center', 'right') or a float (0.0-1.0)"
  })
  declare left_align: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const txtFont = String(this.txt_font ?? "Standard");
    const topAlign = String(this.top_align ?? "center");
    const txtColor = String(this.txt_color ?? "white");
    const strokeWidth = Number(this.stroke_width ?? 1);
    const refreshInterval = Number(this.refresh_interval ?? 1.5);
    const fontSize = Number(this.font_size ?? 24);
    const leftAlign = String(this.left_align ?? "center");

    const args: Record<string, unknown> = {
      txt_font: txtFont,
      top_align: topAlign,
      txt_color: txtColor,
      stroke_width: strokeWidth,
      refresh_interval: refreshInterval,
      font_size: fontSize,
      left_align: leftAlign
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/auto-caption", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class BenV2Video extends FalNode {
  static readonly nodeType = "fal.video_to_video.BenV2Video";
  static readonly title = "Ben V2 Video";
  static readonly description = `Ben v2 Video enhances and processes video content with advanced AI techniques.
video, enhancement, processing, ben, video-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "video",
    default: "",
    description: "URL of video to be used for background removal."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description: "Random seed for reproducible generation."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional RGB values (0-255) for the background color. If not provided, the background will be transparent. For ex: [0, 0, 0]"
  })
  declare background_color: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const seed = String(this.seed ?? "");
    const backgroundColor = String(this.background_color ?? "");

    const args: Record<string, unknown> = {
      seed: seed,
      background_color: backgroundColor
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ben/v2/video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class BiRefNetV2Video extends FalNode {
  static readonly nodeType = "fal.video_to_video.BiRefNetV2Video";
  static readonly title = "Bi Ref Net V2 Video";
  static readonly description = `BiRefNet v2 Video performs background removal from videos with high accuracy.
video, background-removal, segmentation, birefnet, video-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { mask_video: "str", video: "video" };

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "video",
    default: "",
    description: "URL of the video to remove background from"
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

  @prop({
    type: "enum",
    default: "1024x1024",
    values: ["1024x1024", "2048x2048", "2304x2304"],
    description:
      "The resolution to operate on. The higher the resolution, the more accurate the output will be for high res input images. The '2304x2304' option is only available for the 'General Use (Dynamic)' model."
  })
  declare operating_resolution: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "enum",
    default: "General Use (Light)",
    values: [
      "General Use (Light)",
      "General Use (Light 2K)",
      "General Use (Heavy)",
      "Matting",
      "Portrait",
      "General Use (Dynamic)"
    ],
    description:
      "\n            Model to use for background removal.\n            The 'General Use (Light)' model is the original model used in the BiRefNet repository.\n            The 'General Use (Light 2K)' model is the original model used in the BiRefNet repository but trained with 2K images.\n            The 'General Use (Heavy)' model is a slower but more accurate model.\n            The 'Matting' model is a model trained specifically for matting images.\n            The 'Portrait' model is a model trained specifically for portrait images.\n            The 'General Use (Dynamic)' model supports dynamic resolutions from 256x256 to 2304x2304.\n            The 'General Use (Light)' model is recommended for most use cases.\n\n            The corresponding models are as follows:\n            - 'General Use (Light)': BiRefNet\n            - 'General Use (Light 2K)': BiRefNet_lite-2K\n            - 'General Use (Heavy)': BiRefNet_lite\n            - 'Matting': BiRefNet-matting\n            - 'Portrait': BiRefNet-portrait\n            - 'General Use (Dynamic)': BiRefNet_dynamic\n        "
  })
  declare model: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to output the mask used to remove the background"
  })
  declare output_mask: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to refine the foreground using the estimated mask"
  })
  declare refine_foreground: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const operatingResolution = String(
      this.operating_resolution ?? "1024x1024"
    );
    const videoQuality = String(this.video_quality ?? "high");
    const model = String(this.model ?? "General Use (Light)");
    const syncMode = Boolean(this.sync_mode ?? false);
    const outputMask = Boolean(this.output_mask ?? false);
    const refineForeground = Boolean(this.refine_foreground ?? true);

    const args: Record<string, unknown> = {
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      operating_resolution: operatingResolution,
      video_quality: videoQuality,
      model: model,
      sync_mode: syncMode,
      output_mask: outputMask,
      refine_foreground: refineForeground
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/birefnet/v2/video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class BriaVideoEraserMask extends FalNode {
  static readonly nodeType = "fal.video_to_video.BriaVideoEraserMask";
  static readonly title = "Bria Video Eraser Mask";
  static readonly description = `Bria Video Eraser removes objects from videos using mask-based selection.
video, object-removal, eraser, inpainting, bria, video-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({
    type: "bool",
    default: true,
    description: "If true, audio will be preserved in the output video."
  })
  declare preserve_audio: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Input video to erase object from. duration must be less than 5s."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "mp4_h264",
    values: [
      "mp4_h265",
      "mp4_h264",
      "webm_vp9",
      "gif",
      "mov_h264",
      "mov_h265",
      "mov_proresks",
      "mkv_h264",
      "mkv_h265",
      "mkv_vp9",
      "mkv_mpeg4"
    ],
    description:
      "Output container and codec. Options: mp4_h265, mp4_h264, webm_vp9, gif, mov_h264, mov_h265, mov_proresks, mkv_h264, mkv_h265, mkv_vp9, mkv_mpeg4."
  })
  declare output_container_and_codec: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Input video to mask erase object from. duration must be less than 5s."
  })
  declare mask_video: any;

  @prop({
    type: "bool",
    default: true,
    description: "auto trim the video, to working duration ( 5s )"
  })
  declare auto_trim: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const preserveAudio = Boolean(this.preserve_audio ?? true);
    const outputContainerAndCodec = String(
      this.output_container_and_codec ?? "mp4_h264"
    );
    const autoTrim = Boolean(this.auto_trim ?? true);

    const args: Record<string, unknown> = {
      preserve_audio: preserveAudio,
      output_container_and_codec: outputContainerAndCodec,
      auto_trim: autoTrim
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
      "bria/bria_video_eraser/erase/mask",
      args
    );
    return { output: res };
  }
}

export class BriaVideoEraserKeypoints extends FalNode {
  static readonly nodeType = "fal.video_to_video.BriaVideoEraserKeypoints";
  static readonly title = "Bria Video Eraser Keypoints";
  static readonly description = `Bria Video Eraser removes objects from videos using keypoint-based selection.
video, object-removal, eraser, keypoints, bria, video-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({
    type: "bool",
    default: true,
    description: "If true, audio will be preserved in the output video."
  })
  declare preserve_audio: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Input video to erase object from. duration must be less than 5s."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "mp4_h264",
    values: [
      "mp4_h265",
      "mp4_h264",
      "webm_vp9",
      "gif",
      "mov_h264",
      "mov_h265",
      "mov_proresks",
      "mkv_h264",
      "mkv_h265",
      "mkv_vp9",
      "mkv_mpeg4"
    ],
    description:
      "Output container and codec. Options: mp4_h265, mp4_h264, webm_vp9, gif, mov_h264, mov_h265, mov_proresks, mkv_h264, mkv_h265, mkv_vp9, mkv_mpeg4."
  })
  declare output_container_and_codec: any;

  @prop({
    type: "list[str]",
    default: [],
    description:
      "Input keypoints [x,y] to erase or keep from the video. Format like so: {'x':100, 'y':100, 'type':'positive/negative'}"
  })
  declare keypoints: any;

  @prop({
    type: "bool",
    default: true,
    description: "auto trim the video, to working duration ( 5s )"
  })
  declare auto_trim: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const preserveAudio = Boolean(this.preserve_audio ?? true);
    const outputContainerAndCodec = String(
      this.output_container_and_codec ?? "mp4_h264"
    );
    const keypoints = String(this.keypoints ?? []);
    const autoTrim = Boolean(this.auto_trim ?? true);

    const args: Record<string, unknown> = {
      preserve_audio: preserveAudio,
      output_container_and_codec: outputContainerAndCodec,
      keypoints: keypoints,
      auto_trim: autoTrim
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "bria/bria_video_eraser/erase/keypoints",
      args
    );
    return { output: res };
  }
}

export class BriaVideoEraserPrompt extends FalNode {
  static readonly nodeType = "fal.video_to_video.BriaVideoEraserPrompt";
  static readonly title = "Bria Video Eraser Prompt";
  static readonly description = `Bria Video Eraser removes objects from videos using text prompt descriptions.
video, object-removal, eraser, prompt, bria, video-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({
    type: "str",
    default: "",
    description: "Input prompt to detect object to erase"
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Input video to erase object from. duration must be less than 5s."
  })
  declare video: any;

  @prop({
    type: "bool",
    default: true,
    description: "If true, audio will be preserved in the output video."
  })
  declare preserve_audio: any;

  @prop({
    type: "enum",
    default: "mp4_h264",
    values: [
      "mp4_h265",
      "mp4_h264",
      "webm_vp9",
      "gif",
      "mov_h264",
      "mov_h265",
      "mov_proresks",
      "mkv_h264",
      "mkv_h265",
      "mkv_vp9",
      "mkv_mpeg4"
    ],
    description:
      "Output container and codec. Options: mp4_h265, mp4_h264, webm_vp9, gif, mov_h264, mov_h265, mov_proresks, mkv_h264, mkv_h265, mkv_vp9, mkv_mpeg4."
  })
  declare output_container_and_codec: any;

  @prop({
    type: "bool",
    default: true,
    description: "auto trim the video, to working duration ( 5s )"
  })
  declare auto_trim: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const preserveAudio = Boolean(this.preserve_audio ?? true);
    const outputContainerAndCodec = String(
      this.output_container_and_codec ?? "mp4_h264"
    );
    const autoTrim = Boolean(this.auto_trim ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      preserve_audio: preserveAudio,
      output_container_and_codec: outputContainerAndCodec,
      auto_trim: autoTrim
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "bria/bria_video_eraser/erase/prompt",
      args
    );
    return { output: res };
  }
}

export class CogVideoX5BVideoToVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.CogVideoX5BVideoToVideo";
  static readonly title = "Cog Video X5 B Video To Video";
  static readonly description = `CogVideoX-5B transforms existing videos with new styles and effects.
video, transformation, cogvideo, style-transfer, video-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    seed: "int",
    timings: "dict[str, any]",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "The video to generate the video from."
  })
  declare video: any;

  @prop({
    type: "bool",
    default: true,
    description: "Use RIFE for video interpolation"
  })
  declare use_rife: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "The strength to use for Video to Video.  1.0 completely remakes the video while 0.0 preserves the original."
  })
  declare strength: any;

  @prop({
    type: "str",
    default: "",
    description: "The size of the generated video."
  })
  declare video_size: any;

  @prop({
    type: "list[LoraWeight]",
    default: [],
    description:
      "\n            The LoRAs to use for the image generation. We currently support one lora.\n        "
  })
  declare loras: any;

  @prop({
    type: "float",
    default: 7,
    description:
      "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related video to show you.\n        "
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 50,
    description: "The number of inference steps to perform."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 16,
    description: "The target FPS of the video"
  })
  declare export_fps: any;

  @prop({
    type: "str",
    default: "",
    description: "The negative prompt to generate video from"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of the model\n            will output the same video every time.\n        "
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const useRife = Boolean(this.use_rife ?? true);
    const strength = Number(this.strength ?? 0.8);
    const videoSize = String(this.video_size ?? "");
    const loras = String(this.loras ?? []);
    const guidanceScale = Number(this.guidance_scale ?? 7);
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const exportFps = Number(this.export_fps ?? 16);
    const negativePrompt = String(this.negative_prompt ?? "");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      use_rife: useRife,
      strength: strength,
      video_size: videoSize,
      loras: loras,
      guidance_scale: guidanceScale,
      num_inference_steps: numInferenceSteps,
      export_fps: exportFps,
      negative_prompt: negativePrompt,
      seed: seed
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/cogvideox-5b/video-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class HunyuanVideoToVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.HunyuanVideoToVideo";
  static readonly title = "Hunyuan Video To Video";
  static readonly description = `Hunyuan Video transforms existing videos with advanced AI-powered effects.
video, transformation, hunyuan, video-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({ type: "video", default: "", description: "URL of the video input." })
  declare video: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16"],
    description: "The aspect ratio of the video to generate."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "580p", "720p"],
    description: "The resolution of the video to generate."
  })
  declare resolution: any;

  @prop({
    type: "float",
    default: 0.85,
    description: "Strength for Video-to-Video"
  })
  declare strength: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed to use for generating the video."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: 129,
    values: ["129", "85"],
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "By default, generations are done with 35 steps. Pro mode does 55 steps which results in higher quality videos but will take more time and cost 2x more billing units."
  })
  declare pro_mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "720p");
    const strength = Number(this.strength ?? 0.85);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const seed = String(this.seed ?? "");
    const numFrames = String(this.num_frames ?? 129);
    const proMode = Boolean(this.pro_mode ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      strength: strength,
      enable_safety_checker: enableSafetyChecker,
      seed: seed,
      num_frames: numFrames,
      pro_mode: proMode
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/hunyuan-video/video-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class VideoUpscaler extends FalNode {
  static readonly nodeType = "fal.video_to_video.VideoUpscaler";
  static readonly title = "Video Upscaler";
  static readonly description = `Video Upscaler enhances video resolution and quality using AI.
video, upscaling, enhancement, resolution, video-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to upscale"
  })
  declare video: any;

  @prop({ type: "float", default: 2, description: "The scale factor" })
  declare scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const scale = Number(this.scale ?? 2);

    const args: Record<string, unknown> = {
      scale: scale
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/video-upscaler", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class CCSR extends FalNode {
  static readonly nodeType = "fal.video_to_video.CCSR";
  static readonly title = "C C S R";
  static readonly description = `CCSR (Controllable Color Style Restoration) restores and enhances video colors.
video, color-restoration, enhancement, ccsr, video-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { image: "image", seed: "int" };

  @prop({
    type: "enum",
    default: "adain",
    values: ["none", "wavelet", "adain"],
    description: "Type of color correction for samples."
  })
  declare color_fix_type: any;

  @prop({ type: "int", default: 1024, description: "Size of patch." })
  declare tile_diffusion_size: any;

  @prop({ type: "int", default: 226, description: "Size of VAE patch." })
  declare tile_vae_decoder_size: any;

  @prop({ type: "int", default: 1024, description: "Size of latent image" })
  declare tile_vae_encoder_size: any;

  @prop({
    type: "float",
    default: 0.3333,
    description: "The starting point of uniform sampling strategy."
  })
  declare t_min: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL or data URI of the image to upscale."
  })
  declare image: any;

  @prop({ type: "int", default: 512, description: "Stride of sliding patch." })
  declare tile_diffusion_stride: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If specified, a patch-based sampling strategy will be used for VAE decoding."
  })
  declare tile_vae: any;

  @prop({
    type: "float",
    default: 2,
    description:
      "The scale of the output image. The higher the scale, the bigger the output image will be."
  })
  declare scale: any;

  @prop({
    type: "int",
    default: -1,
    description:
      "Seed for reproducibility. Different seeds will make slightly different results."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 0.6667,
    description: "The ending point of uniform sampling strategy."
  })
  declare t_max: any;

  @prop({
    type: "int",
    default: 50,
    description:
      "The number of steps to run the model for. The higher the number the better the quality and longer it will take to generate."
  })
  declare steps: any;

  @prop({
    type: "enum",
    default: "none",
    values: ["none", "mix", "gaussian"],
    description:
      "If specified, a patch-based sampling strategy will be used for sampling."
  })
  declare tile_diffusion: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const colorFixType = String(this.color_fix_type ?? "adain");
    const tileDiffusionSize = Number(this.tile_diffusion_size ?? 1024);
    const tileVaeDecoderSize = Number(this.tile_vae_decoder_size ?? 226);
    const tileVaeEncoderSize = Number(this.tile_vae_encoder_size ?? 1024);
    const tMin = Number(this.t_min ?? 0.3333);
    const tileDiffusionStride = Number(this.tile_diffusion_stride ?? 512);
    const tileVae = Boolean(this.tile_vae ?? false);
    const scale = Number(this.scale ?? 2);
    const seed = Number(this.seed ?? -1);
    const tMax = Number(this.t_max ?? 0.6667);
    const steps = Number(this.steps ?? 50);
    const tileDiffusion = String(this.tile_diffusion ?? "none");

    const args: Record<string, unknown> = {
      color_fix_type: colorFixType,
      tile_diffusion_size: tileDiffusionSize,
      tile_vae_decoder_size: tileVaeDecoderSize,
      tile_vae_encoder_size: tileVaeEncoderSize,
      t_min: tMin,
      tile_diffusion_stride: tileDiffusionStride,
      tile_vae: tileVae,
      scale: scale,
      seed: seed,
      t_max: tMax,
      steps: steps,
      tile_diffusion: tileDiffusion
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ccsr", args);
    return res as Record<string, unknown>;
  }
}

export class Ltx219BDistilledVideoToVideoLora extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.Ltx219BDistilledVideoToVideoLora";
  static readonly title = "Ltx219 B Distilled Video To Video Lora";
  static readonly description = `LTX-2 19B Distilled
video, editing, video-to-video, vid2vid, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to use multi-scale generation. If True, the model will generate the video at a smaller scale first, then use the smaller video to guide the generation of a video at or above your requested size. This results in better coherence and details."
  })
  declare use_multiscale: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to generate the video from."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the IC-LoRA to use. This allows you to control the strength of the IC-LoRA."
  })
  declare ic_lora_scale: any;

  @prop({
    type: "list[LoRAInput]",
    default: [],
    description: "The LoRAs to use for the generation."
  })
  declare loras: any;

  @prop({
    type: "str",
    default: "auto",
    description: "The size of the generated video."
  })
  declare video_size: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as the end of the video."
  })
  declare end_image: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Video conditioning strength. Lower values represent more freedom given to the model to change the video content."
  })
  declare video_strength: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An optional URL of an image to use as the first frame of the video."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When enabled, the number of frames will be calculated based on the video duration and FPS. When disabled, use the specified num_frames."
  })
  declare match_video_length: any;

  @prop({
    type: "enum",
    default: "none",
    values: ["none", "regular", "high", "full"],
    description: "The acceleration level to use."
  })
  declare acceleration: any;

  @prop({
    type: "float",
    default: 25,
    description: "The frames per second of the generated video."
  })
  declare fps: any;

  @prop({
    type: "enum",
    default: "none",
    values: [
      "dolly_in",
      "dolly_out",
      "dolly_left",
      "dolly_right",
      "jib_up",
      "jib_down",
      "static",
      "none"
    ],
    description:
      "The camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "float",
    default: 1,
    description: "The strength of the image to use for the video generation."
  })
  declare image_strength: any;

  @prop({
    type: "str",
    default:
      "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts.",
    description: "The negative prompt to generate the video from."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "none",
    values: ["depth", "canny", "pose", "none"],
    description:
      "The preprocessor to use for the video. When a preprocessor is used and 'ic_lora_type' is set to 'match_preprocessor', the IC-LoRA will be loaded based on the preprocessor type."
  })
  declare preprocessor: any;

  @prop({
    type: "enum",
    default: "match_preprocessor",
    values: [
      "match_preprocessor",
      "canny",
      "depth",
      "pose",
      "detailer",
      "none"
    ],
    description:
      "The type of IC-LoRA to load. In-Context LoRA weights are used to condition the video based on edge, depth, or pose videos. Only change this from 'match_preprocessor' if your videos are already preprocessed (or you are using the detailer.)"
  })
  declare ic_lora: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "An optional URL of an audio to use as the audio for the video. If not provided, any audio present in the input video will be used."
  })
  declare audio: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When true, match the output FPS to the input video's FPS instead of using the default target FPS."
  })
  declare match_input_fps: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The strength of the end image to use for the video generation."
  })
  declare end_image_strength: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Audio conditioning strength. Lower values represent more freedom given to the model to change the audio content."
  })
  declare audio_strength: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const useMultiscale = Boolean(this.use_multiscale ?? true);
    const prompt = String(this.prompt ?? "");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const icLoraScale = Number(this.ic_lora_scale ?? 1);
    const loras = String(this.loras ?? []);
    const videoSize = String(this.video_size ?? "auto");
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const numFrames = Number(this.num_frames ?? 121);
    const videoStrength = Number(this.video_strength ?? 1);
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
    const matchVideoLength = Boolean(this.match_video_length ?? true);
    const acceleration = String(this.acceleration ?? "none");
    const fps = Number(this.fps ?? 25);
    const cameraLora = String(this.camera_lora ?? "none");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const imageStrength = Number(this.image_strength ?? 1);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const preprocessor = String(this.preprocessor ?? "none");
    const icLora = String(this.ic_lora ?? "match_preprocessor");
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const matchInputFps = Boolean(this.match_input_fps ?? true);
    const endImageStrength = Number(this.end_image_strength ?? 1);
    const audioStrength = Number(this.audio_strength ?? 1);

    const args: Record<string, unknown> = {
      use_multiscale: useMultiscale,
      prompt: prompt,
      generate_audio: generateAudio,
      ic_lora_scale: icLoraScale,
      loras: loras,
      video_size: videoSize,
      camera_lora_scale: cameraLoraScale,
      num_frames: numFrames,
      video_strength: videoStrength,
      video_output_type: videoOutputType,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      match_video_length: matchVideoLength,
      acceleration: acceleration,
      fps: fps,
      camera_lora: cameraLora,
      enable_safety_checker: enableSafetyChecker,
      image_strength: imageStrength,
      negative_prompt: negativePrompt,
      preprocessor: preprocessor,
      ic_lora: icLora,
      video_write_mode: videoWriteMode,
      match_input_fps: matchInputFps,
      end_image_strength: endImageStrength,
      audio_strength: audioStrength
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/distilled/video-to-video/lora",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BDistilledVideoToVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.Ltx219BDistilledVideoToVideo";
  static readonly title = "Ltx219 B Distilled Video To Video";
  static readonly description = `LTX-2 19B Distilled
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to use multi-scale generation. If True, the model will generate the video at a smaller scale first, then use the smaller video to guide the generation of a video at or above your requested size. This results in better coherence and details."
  })
  declare use_multiscale: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to generate the video from."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the IC-LoRA to use. This allows you to control the strength of the IC-LoRA."
  })
  declare ic_lora_scale: any;

  @prop({
    type: "str",
    default: "auto",
    description: "The size of the generated video."
  })
  declare video_size: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as the end of the video."
  })
  declare end_image: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Video conditioning strength. Lower values represent more freedom given to the model to change the video content."
  })
  declare video_strength: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An optional URL of an image to use as the first frame of the video."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When enabled, the number of frames will be calculated based on the video duration and FPS. When disabled, use the specified num_frames."
  })
  declare match_video_length: any;

  @prop({
    type: "enum",
    default: "none",
    values: ["none", "regular", "high", "full"],
    description: "The acceleration level to use."
  })
  declare acceleration: any;

  @prop({
    type: "float",
    default: 25,
    description: "The frames per second of the generated video."
  })
  declare fps: any;

  @prop({
    type: "enum",
    default: "none",
    values: [
      "dolly_in",
      "dolly_out",
      "dolly_left",
      "dolly_right",
      "jib_up",
      "jib_down",
      "static",
      "none"
    ],
    description:
      "The camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "float",
    default: 1,
    description: "The strength of the image to use for the video generation."
  })
  declare image_strength: any;

  @prop({
    type: "str",
    default:
      "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts.",
    description: "The negative prompt to generate the video from."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "none",
    values: ["depth", "canny", "pose", "none"],
    description:
      "The preprocessor to use for the video. When a preprocessor is used and 'ic_lora_type' is set to 'match_preprocessor', the IC-LoRA will be loaded based on the preprocessor type."
  })
  declare preprocessor: any;

  @prop({
    type: "enum",
    default: "match_preprocessor",
    values: [
      "match_preprocessor",
      "canny",
      "depth",
      "pose",
      "detailer",
      "none"
    ],
    description:
      "The type of IC-LoRA to load. In-Context LoRA weights are used to condition the video based on edge, depth, or pose videos. Only change this from 'match_preprocessor' if your videos are already preprocessed (or you are using the detailer.)"
  })
  declare ic_lora: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "An optional URL of an audio to use as the audio for the video. If not provided, any audio present in the input video will be used."
  })
  declare audio: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When true, match the output FPS to the input video's FPS instead of using the default target FPS."
  })
  declare match_input_fps: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The strength of the end image to use for the video generation."
  })
  declare end_image_strength: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Audio conditioning strength. Lower values represent more freedom given to the model to change the audio content."
  })
  declare audio_strength: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const useMultiscale = Boolean(this.use_multiscale ?? true);
    const prompt = String(this.prompt ?? "");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const icLoraScale = Number(this.ic_lora_scale ?? 1);
    const videoSize = String(this.video_size ?? "auto");
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const numFrames = Number(this.num_frames ?? 121);
    const videoStrength = Number(this.video_strength ?? 1);
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
    const matchVideoLength = Boolean(this.match_video_length ?? true);
    const acceleration = String(this.acceleration ?? "none");
    const fps = Number(this.fps ?? 25);
    const cameraLora = String(this.camera_lora ?? "none");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const imageStrength = Number(this.image_strength ?? 1);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const preprocessor = String(this.preprocessor ?? "none");
    const icLora = String(this.ic_lora ?? "match_preprocessor");
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const matchInputFps = Boolean(this.match_input_fps ?? true);
    const endImageStrength = Number(this.end_image_strength ?? 1);
    const audioStrength = Number(this.audio_strength ?? 1);

    const args: Record<string, unknown> = {
      use_multiscale: useMultiscale,
      prompt: prompt,
      generate_audio: generateAudio,
      ic_lora_scale: icLoraScale,
      video_size: videoSize,
      camera_lora_scale: cameraLoraScale,
      num_frames: numFrames,
      video_strength: videoStrength,
      video_output_type: videoOutputType,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      match_video_length: matchVideoLength,
      acceleration: acceleration,
      fps: fps,
      camera_lora: cameraLora,
      enable_safety_checker: enableSafetyChecker,
      image_strength: imageStrength,
      negative_prompt: negativePrompt,
      preprocessor: preprocessor,
      ic_lora: icLora,
      video_write_mode: videoWriteMode,
      match_input_fps: matchInputFps,
      end_image_strength: endImageStrength,
      audio_strength: audioStrength
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/distilled/video-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BVideoToVideoLora extends FalNode {
  static readonly nodeType = "fal.video_to_video.Ltx219BVideoToVideoLora";
  static readonly title = "Ltx219 B Video To Video Lora";
  static readonly description = `LTX-2 19B
video, editing, video-to-video, vid2vid, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to use multi-scale generation. If True, the model will generate the video at a smaller scale first, then use the smaller video to guide the generation of a video at or above your requested size. This results in better coherence and details."
  })
  declare use_multiscale: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to generate the video from."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the IC-LoRA to use. This allows you to control the strength of the IC-LoRA."
  })
  declare ic_lora_scale: any;

  @prop({
    type: "list[LoRAInput]",
    default: [],
    description: "The LoRAs to use for the generation."
  })
  declare loras: any;

  @prop({
    type: "str",
    default: "auto",
    description: "The size of the generated video."
  })
  declare video_size: any;

  @prop({
    type: "float",
    default: 3,
    description: "The guidance scale to use."
  })
  declare guidance_scale: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as the end of the video."
  })
  declare end_image: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Video conditioning strength. Lower values represent more freedom given to the model to change the video content."
  })
  declare video_strength: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An optional URL of an image to use as the first frame of the video."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When enabled, the number of frames will be calculated based on the video duration and FPS. When disabled, use the specified num_frames."
  })
  declare match_video_length: any;

  @prop({
    type: "enum",
    default: "regular",
    values: ["none", "regular", "high", "full"],
    description: "The acceleration level to use."
  })
  declare acceleration: any;

  @prop({
    type: "float",
    default: 25,
    description: "The frames per second of the generated video."
  })
  declare fps: any;

  @prop({
    type: "enum",
    default: "none",
    values: [
      "dolly_in",
      "dolly_out",
      "dolly_left",
      "dolly_right",
      "jib_up",
      "jib_down",
      "static",
      "none"
    ],
    description:
      "The camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "float",
    default: 1,
    description: "The strength of the image to use for the video generation."
  })
  declare image_strength: any;

  @prop({
    type: "str",
    default:
      "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts.",
    description: "The negative prompt to generate the video from."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "none",
    values: ["depth", "canny", "pose", "none"],
    description:
      "The preprocessor to use for the video. When a preprocessor is used and 'ic_lora_type' is set to 'match_preprocessor', the IC-LoRA will be loaded based on the preprocessor type."
  })
  declare preprocessor: any;

  @prop({
    type: "enum",
    default: "match_preprocessor",
    values: [
      "match_preprocessor",
      "canny",
      "depth",
      "pose",
      "detailer",
      "none"
    ],
    description:
      "The type of IC-LoRA to load. In-Context LoRA weights are used to condition the video based on edge, depth, or pose videos. Only change this from 'match_preprocessor' if your videos are already preprocessed (or you are using the detailer.)"
  })
  declare ic_lora: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "An optional URL of an audio to use as the audio for the video. If not provided, any audio present in the input video will be used."
  })
  declare audio: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When true, match the output FPS to the input video's FPS instead of using the default target FPS."
  })
  declare match_input_fps: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The strength of the end image to use for the video generation."
  })
  declare end_image_strength: any;

  @prop({
    type: "int",
    default: 40,
    description: "The number of inference steps to use."
  })
  declare num_inference_steps: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Audio conditioning strength. Lower values represent more freedom given to the model to change the audio content."
  })
  declare audio_strength: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const useMultiscale = Boolean(this.use_multiscale ?? true);
    const prompt = String(this.prompt ?? "");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const icLoraScale = Number(this.ic_lora_scale ?? 1);
    const loras = String(this.loras ?? []);
    const videoSize = String(this.video_size ?? "auto");
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const numFrames = Number(this.num_frames ?? 121);
    const videoStrength = Number(this.video_strength ?? 1);
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
    const matchVideoLength = Boolean(this.match_video_length ?? true);
    const acceleration = String(this.acceleration ?? "regular");
    const fps = Number(this.fps ?? 25);
    const cameraLora = String(this.camera_lora ?? "none");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const imageStrength = Number(this.image_strength ?? 1);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const preprocessor = String(this.preprocessor ?? "none");
    const icLora = String(this.ic_lora ?? "match_preprocessor");
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const matchInputFps = Boolean(this.match_input_fps ?? true);
    const endImageStrength = Number(this.end_image_strength ?? 1);
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const audioStrength = Number(this.audio_strength ?? 1);

    const args: Record<string, unknown> = {
      use_multiscale: useMultiscale,
      prompt: prompt,
      generate_audio: generateAudio,
      ic_lora_scale: icLoraScale,
      loras: loras,
      video_size: videoSize,
      guidance_scale: guidanceScale,
      camera_lora_scale: cameraLoraScale,
      num_frames: numFrames,
      video_strength: videoStrength,
      video_output_type: videoOutputType,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      match_video_length: matchVideoLength,
      acceleration: acceleration,
      fps: fps,
      camera_lora: cameraLora,
      enable_safety_checker: enableSafetyChecker,
      image_strength: imageStrength,
      negative_prompt: negativePrompt,
      preprocessor: preprocessor,
      ic_lora: icLora,
      video_write_mode: videoWriteMode,
      match_input_fps: matchInputFps,
      end_image_strength: endImageStrength,
      num_inference_steps: numInferenceSteps,
      audio_strength: audioStrength
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/video-to-video/lora",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BVideoToVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.Ltx219BVideoToVideo";
  static readonly title = "Ltx219 B Video To Video";
  static readonly description = `LTX-2 19B
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to use multi-scale generation. If True, the model will generate the video at a smaller scale first, then use the smaller video to guide the generation of a video at or above your requested size. This results in better coherence and details."
  })
  declare use_multiscale: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to generate the video from."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the IC-LoRA to use. This allows you to control the strength of the IC-LoRA."
  })
  declare ic_lora_scale: any;

  @prop({
    type: "str",
    default: "auto",
    description: "The size of the generated video."
  })
  declare video_size: any;

  @prop({
    type: "float",
    default: 3,
    description: "The guidance scale to use."
  })
  declare guidance_scale: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as the end of the video."
  })
  declare end_image: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Video conditioning strength. Lower values represent more freedom given to the model to change the video content."
  })
  declare video_strength: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An optional URL of an image to use as the first frame of the video."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When enabled, the number of frames will be calculated based on the video duration and FPS. When disabled, use the specified num_frames."
  })
  declare match_video_length: any;

  @prop({
    type: "enum",
    default: "regular",
    values: ["none", "regular", "high", "full"],
    description: "The acceleration level to use."
  })
  declare acceleration: any;

  @prop({
    type: "float",
    default: 25,
    description: "The frames per second of the generated video."
  })
  declare fps: any;

  @prop({
    type: "enum",
    default: "none",
    values: [
      "dolly_in",
      "dolly_out",
      "dolly_left",
      "dolly_right",
      "jib_up",
      "jib_down",
      "static",
      "none"
    ],
    description:
      "The camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "float",
    default: 1,
    description: "The strength of the image to use for the video generation."
  })
  declare image_strength: any;

  @prop({
    type: "str",
    default:
      "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts.",
    description: "The negative prompt to generate the video from."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "none",
    values: ["depth", "canny", "pose", "none"],
    description:
      "The preprocessor to use for the video. When a preprocessor is used and 'ic_lora_type' is set to 'match_preprocessor', the IC-LoRA will be loaded based on the preprocessor type."
  })
  declare preprocessor: any;

  @prop({
    type: "enum",
    default: "match_preprocessor",
    values: [
      "match_preprocessor",
      "canny",
      "depth",
      "pose",
      "detailer",
      "none"
    ],
    description:
      "The type of IC-LoRA to load. In-Context LoRA weights are used to condition the video based on edge, depth, or pose videos. Only change this from 'match_preprocessor' if your videos are already preprocessed (or you are using the detailer.)"
  })
  declare ic_lora: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "An optional URL of an audio to use as the audio for the video. If not provided, any audio present in the input video will be used."
  })
  declare audio: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When true, match the output FPS to the input video's FPS instead of using the default target FPS."
  })
  declare match_input_fps: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The strength of the end image to use for the video generation."
  })
  declare end_image_strength: any;

  @prop({
    type: "int",
    default: 40,
    description: "The number of inference steps to use."
  })
  declare num_inference_steps: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Audio conditioning strength. Lower values represent more freedom given to the model to change the audio content."
  })
  declare audio_strength: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const useMultiscale = Boolean(this.use_multiscale ?? true);
    const prompt = String(this.prompt ?? "");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const icLoraScale = Number(this.ic_lora_scale ?? 1);
    const videoSize = String(this.video_size ?? "auto");
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const numFrames = Number(this.num_frames ?? 121);
    const videoStrength = Number(this.video_strength ?? 1);
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
    const matchVideoLength = Boolean(this.match_video_length ?? true);
    const acceleration = String(this.acceleration ?? "regular");
    const fps = Number(this.fps ?? 25);
    const cameraLora = String(this.camera_lora ?? "none");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const imageStrength = Number(this.image_strength ?? 1);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const preprocessor = String(this.preprocessor ?? "none");
    const icLora = String(this.ic_lora ?? "match_preprocessor");
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const matchInputFps = Boolean(this.match_input_fps ?? true);
    const endImageStrength = Number(this.end_image_strength ?? 1);
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const audioStrength = Number(this.audio_strength ?? 1);

    const args: Record<string, unknown> = {
      use_multiscale: useMultiscale,
      prompt: prompt,
      generate_audio: generateAudio,
      ic_lora_scale: icLoraScale,
      video_size: videoSize,
      guidance_scale: guidanceScale,
      camera_lora_scale: cameraLoraScale,
      num_frames: numFrames,
      video_strength: videoStrength,
      video_output_type: videoOutputType,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      match_video_length: matchVideoLength,
      acceleration: acceleration,
      fps: fps,
      camera_lora: cameraLora,
      enable_safety_checker: enableSafetyChecker,
      image_strength: imageStrength,
      negative_prompt: negativePrompt,
      preprocessor: preprocessor,
      ic_lora: icLora,
      video_write_mode: videoWriteMode,
      match_input_fps: matchInputFps,
      end_image_strength: endImageStrength,
      num_inference_steps: numInferenceSteps,
      audio_strength: audioStrength
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/video-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BDistilledExtendVideoLora extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.Ltx219BDistilledExtendVideoLora";
  static readonly title = "Ltx219 B Distilled Extend Video Lora";
  static readonly description = `LTX-2 19B Distilled
video, editing, video-to-video, vid2vid, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to use multi-scale generation. If True, the model will generate the video at a smaller scale first, then use the smaller video to guide the generation of a video at or above your requested size. This results in better coherence and details."
  })
  declare use_multiscale: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to extend."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "none",
    values: ["none", "regular", "high", "full"],
    description: "The acceleration level to use."
  })
  declare acceleration: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 25,
    description: "The frames per second of the generated video."
  })
  declare fps: any;

  @prop({
    type: "list[LoRAInput]",
    default: [],
    description: "The LoRAs to use for the generation."
  })
  declare loras: any;

  @prop({
    type: "enum",
    default: "none",
    values: [
      "dolly_in",
      "dolly_out",
      "dolly_left",
      "dolly_right",
      "jib_up",
      "jib_down",
      "static",
      "none"
    ],
    description:
      "The camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora: any;

  @prop({
    type: "str",
    default: "auto",
    description: "The size of the generated video."
  })
  declare video_size: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as the end of the extended video."
  })
  declare end_image: any;

  @prop({
    type: "str",
    default:
      "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts.",
    description: "The negative prompt to generate the video from."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "forward",
    values: ["forward", "backward"],
    description:
      "Direction to extend the video. 'forward' extends from the end of the video, 'backward' extends from the beginning."
  })
  declare extend_direction: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Video conditioning strength. Lower values represent more freedom given to the model to change the video content."
  })
  declare video_strength: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

  @prop({
    type: "int",
    default: 25,
    description: "The number of frames to use as context for the extension."
  })
  declare num_context_frames: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The strength of the end image to use for the video generation."
  })
  declare end_image_strength: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When true, match the output FPS to the input video's FPS instead of using the default target FPS."
  })
  declare match_input_fps: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Audio conditioning strength. Lower values represent more freedom given to the model to change the audio content."
  })
  declare audio_strength: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const useMultiscale = Boolean(this.use_multiscale ?? true);
    const acceleration = String(this.acceleration ?? "none");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const prompt = String(this.prompt ?? "");
    const fps = Number(this.fps ?? 25);
    const loras = String(this.loras ?? []);
    const cameraLora = String(this.camera_lora ?? "none");
    const videoSize = String(this.video_size ?? "auto");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 121);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const extendDirection = String(this.extend_direction ?? "forward");
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const videoStrength = Number(this.video_strength ?? 1);
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const numContextFrames = Number(this.num_context_frames ?? 25);
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
    const endImageStrength = Number(this.end_image_strength ?? 1);
    const matchInputFps = Boolean(this.match_input_fps ?? true);
    const audioStrength = Number(this.audio_strength ?? 1);

    const args: Record<string, unknown> = {
      use_multiscale: useMultiscale,
      acceleration: acceleration,
      generate_audio: generateAudio,
      prompt: prompt,
      fps: fps,
      loras: loras,
      camera_lora: cameraLora,
      video_size: videoSize,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      negative_prompt: negativePrompt,
      extend_direction: extendDirection,
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      video_strength: videoStrength,
      camera_lora_scale: cameraLoraScale,
      num_context_frames: numContextFrames,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      end_image_strength: endImageStrength,
      match_input_fps: matchInputFps,
      audio_strength: audioStrength
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/distilled/extend-video/lora",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BDistilledExtendVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.Ltx219BDistilledExtendVideo";
  static readonly title = "Ltx219 B Distilled Extend Video";
  static readonly description = `LTX-2 19B Distilled
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to use multi-scale generation. If True, the model will generate the video at a smaller scale first, then use the smaller video to guide the generation of a video at or above your requested size. This results in better coherence and details."
  })
  declare use_multiscale: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to extend."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "none",
    values: ["none", "regular", "high", "full"],
    description: "The acceleration level to use."
  })
  declare acceleration: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 25,
    description: "The frames per second of the generated video."
  })
  declare fps: any;

  @prop({
    type: "enum",
    default: "none",
    values: [
      "dolly_in",
      "dolly_out",
      "dolly_left",
      "dolly_right",
      "jib_up",
      "jib_down",
      "static",
      "none"
    ],
    description:
      "The camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora: any;

  @prop({
    type: "str",
    default: "auto",
    description: "The size of the generated video."
  })
  declare video_size: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as the end of the extended video."
  })
  declare end_image: any;

  @prop({
    type: "str",
    default:
      "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts.",
    description: "The negative prompt to generate the video from."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "forward",
    values: ["forward", "backward"],
    description:
      "Direction to extend the video. 'forward' extends from the end of the video, 'backward' extends from the beginning."
  })
  declare extend_direction: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Video conditioning strength. Lower values represent more freedom given to the model to change the video content."
  })
  declare video_strength: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

  @prop({
    type: "int",
    default: 25,
    description: "The number of frames to use as context for the extension."
  })
  declare num_context_frames: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The strength of the end image to use for the video generation."
  })
  declare end_image_strength: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When true, match the output FPS to the input video's FPS instead of using the default target FPS."
  })
  declare match_input_fps: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Audio conditioning strength. Lower values represent more freedom given to the model to change the audio content."
  })
  declare audio_strength: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const useMultiscale = Boolean(this.use_multiscale ?? true);
    const acceleration = String(this.acceleration ?? "none");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const prompt = String(this.prompt ?? "");
    const fps = Number(this.fps ?? 25);
    const cameraLora = String(this.camera_lora ?? "none");
    const videoSize = String(this.video_size ?? "auto");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 121);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const extendDirection = String(this.extend_direction ?? "forward");
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const videoStrength = Number(this.video_strength ?? 1);
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const numContextFrames = Number(this.num_context_frames ?? 25);
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
    const endImageStrength = Number(this.end_image_strength ?? 1);
    const matchInputFps = Boolean(this.match_input_fps ?? true);
    const audioStrength = Number(this.audio_strength ?? 1);

    const args: Record<string, unknown> = {
      use_multiscale: useMultiscale,
      acceleration: acceleration,
      generate_audio: generateAudio,
      prompt: prompt,
      fps: fps,
      camera_lora: cameraLora,
      video_size: videoSize,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      negative_prompt: negativePrompt,
      extend_direction: extendDirection,
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      video_strength: videoStrength,
      camera_lora_scale: cameraLoraScale,
      num_context_frames: numContextFrames,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      end_image_strength: endImageStrength,
      match_input_fps: matchInputFps,
      audio_strength: audioStrength
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/distilled/extend-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BExtendVideoLora extends FalNode {
  static readonly nodeType = "fal.video_to_video.Ltx219BExtendVideoLora";
  static readonly title = "Ltx219 B Extend Video Lora";
  static readonly description = `LTX-2 19B
video, editing, video-to-video, vid2vid, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to use multi-scale generation. If True, the model will generate the video at a smaller scale first, then use the smaller video to guide the generation of a video at or above your requested size. This results in better coherence and details."
  })
  declare use_multiscale: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to extend."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "list[LoRAInput]",
    default: [],
    description: "The LoRAs to use for the generation."
  })
  declare loras: any;

  @prop({
    type: "str",
    default: "auto",
    description: "The size of the generated video."
  })
  declare video_size: any;

  @prop({
    type: "float",
    default: 3,
    description: "The guidance scale to use."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as the end of the extended video."
  })
  declare end_image: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Video conditioning strength. Lower values represent more freedom given to the model to change the video content."
  })
  declare video_strength: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "regular",
    values: ["none", "regular", "high", "full"],
    description: "The acceleration level to use."
  })
  declare acceleration: any;

  @prop({
    type: "float",
    default: 25,
    description: "The frames per second of the generated video."
  })
  declare fps: any;

  @prop({
    type: "enum",
    default: "none",
    values: [
      "dolly_in",
      "dolly_out",
      "dolly_left",
      "dolly_right",
      "jib_up",
      "jib_down",
      "static",
      "none"
    ],
    description:
      "The camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "enum",
    default: "forward",
    values: ["forward", "backward"],
    description:
      "Direction to extend the video. 'forward' extends from the end of the video, 'backward' extends from the beginning."
  })
  declare extend_direction: any;

  @prop({
    type: "str",
    default:
      "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts.",
    description: "The negative prompt to generate the video from."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "int",
    default: 25,
    description: "The number of frames to use as context for the extension."
  })
  declare num_context_frames: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Audio conditioning strength. Lower values represent more freedom given to the model to change the audio content."
  })
  declare audio_strength: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The strength of the end image to use for the video generation."
  })
  declare end_image_strength: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When true, match the output FPS to the input video's FPS instead of using the default target FPS."
  })
  declare match_input_fps: any;

  @prop({
    type: "int",
    default: 40,
    description: "The number of inference steps to use."
  })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const useMultiscale = Boolean(this.use_multiscale ?? true);
    const prompt = String(this.prompt ?? "");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const loras = String(this.loras ?? []);
    const videoSize = String(this.video_size ?? "auto");
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const numFrames = Number(this.num_frames ?? 121);
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const videoStrength = Number(this.video_strength ?? 1);
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
    const acceleration = String(this.acceleration ?? "regular");
    const fps = Number(this.fps ?? 25);
    const cameraLora = String(this.camera_lora ?? "none");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const extendDirection = String(this.extend_direction ?? "forward");
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const numContextFrames = Number(this.num_context_frames ?? 25);
    const audioStrength = Number(this.audio_strength ?? 1);
    const endImageStrength = Number(this.end_image_strength ?? 1);
    const matchInputFps = Boolean(this.match_input_fps ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);

    const args: Record<string, unknown> = {
      use_multiscale: useMultiscale,
      prompt: prompt,
      generate_audio: generateAudio,
      loras: loras,
      video_size: videoSize,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      camera_lora_scale: cameraLoraScale,
      video_strength: videoStrength,
      video_output_type: videoOutputType,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      acceleration: acceleration,
      fps: fps,
      camera_lora: cameraLora,
      enable_safety_checker: enableSafetyChecker,
      extend_direction: extendDirection,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      num_context_frames: numContextFrames,
      audio_strength: audioStrength,
      end_image_strength: endImageStrength,
      match_input_fps: matchInputFps,
      num_inference_steps: numInferenceSteps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/extend-video/lora",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BExtendVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.Ltx219BExtendVideo";
  static readonly title = "Ltx219 B Extend Video";
  static readonly description = `LTX-2 19B
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to use multi-scale generation. If True, the model will generate the video at a smaller scale first, then use the smaller video to guide the generation of a video at or above your requested size. This results in better coherence and details."
  })
  declare use_multiscale: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to extend."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "regular",
    values: ["none", "regular", "high", "full"],
    description: "The acceleration level to use."
  })
  declare acceleration: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Audio conditioning strength. Lower values represent more freedom given to the model to change the audio content."
  })
  declare audio_strength: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 25,
    description: "The frames per second of the generated video."
  })
  declare fps: any;

  @prop({
    type: "enum",
    default: "none",
    values: [
      "dolly_in",
      "dolly_out",
      "dolly_left",
      "dolly_right",
      "jib_up",
      "jib_down",
      "static",
      "none"
    ],
    description:
      "The camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora: any;

  @prop({
    type: "str",
    default: "auto",
    description: "The size of the generated video."
  })
  declare video_size: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as the end of the extended video."
  })
  declare end_image: any;

  @prop({
    type: "str",
    default:
      "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts.",
    description: "The negative prompt to generate the video from."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 3,
    description: "The guidance scale to use."
  })
  declare guidance_scale: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Video conditioning strength. Lower values represent more freedom given to the model to change the video content."
  })
  declare video_strength: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

  @prop({
    type: "enum",
    default: "forward",
    values: ["forward", "backward"],
    description:
      "Direction to extend the video. 'forward' extends from the end of the video, 'backward' extends from the beginning."
  })
  declare extend_direction: any;

  @prop({
    type: "int",
    default: 25,
    description: "The number of frames to use as context for the extension."
  })
  declare num_context_frames: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The strength of the end image to use for the video generation."
  })
  declare end_image_strength: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When true, match the output FPS to the input video's FPS instead of using the default target FPS."
  })
  declare match_input_fps: any;

  @prop({
    type: "int",
    default: 40,
    description: "The number of inference steps to use."
  })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const useMultiscale = Boolean(this.use_multiscale ?? true);
    const acceleration = String(this.acceleration ?? "regular");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const audioStrength = Number(this.audio_strength ?? 1);
    const prompt = String(this.prompt ?? "");
    const fps = Number(this.fps ?? 25);
    const cameraLora = String(this.camera_lora ?? "none");
    const videoSize = String(this.video_size ?? "auto");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 121);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const videoStrength = Number(this.video_strength ?? 1);
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const extendDirection = String(this.extend_direction ?? "forward");
    const numContextFrames = Number(this.num_context_frames ?? 25);
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
    const endImageStrength = Number(this.end_image_strength ?? 1);
    const matchInputFps = Boolean(this.match_input_fps ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);

    const args: Record<string, unknown> = {
      use_multiscale: useMultiscale,
      acceleration: acceleration,
      generate_audio: generateAudio,
      audio_strength: audioStrength,
      prompt: prompt,
      fps: fps,
      camera_lora: cameraLora,
      video_size: videoSize,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      negative_prompt: negativePrompt,
      guidance_scale: guidanceScale,
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      video_strength: videoStrength,
      camera_lora_scale: cameraLoraScale,
      extend_direction: extendDirection,
      num_context_frames: numContextFrames,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      end_image_strength: endImageStrength,
      match_input_fps: matchInputFps,
      num_inference_steps: numInferenceSteps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ltx-2-19b/extend-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class BriaVideoEraseKeypoints extends FalNode {
  static readonly nodeType = "fal.video_to_video.BriaVideoEraseKeypoints";
  static readonly title = "Bria Video Erase Keypoints";
  static readonly description = `Video
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({
    type: "bool",
    default: true,
    description: "If true, audio will be preserved in the output video."
  })
  declare preserve_audio: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Input video to erase object from. duration must be less than 5s."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "mp4_h264",
    values: [
      "mp4_h265",
      "mp4_h264",
      "webm_vp9",
      "gif",
      "mov_h264",
      "mov_h265",
      "mov_proresks",
      "mkv_h264",
      "mkv_h265",
      "mkv_vp9",
      "mkv_mpeg4"
    ],
    description:
      "Output container and codec. Options: mp4_h265, mp4_h264, webm_vp9, gif, mov_h264, mov_h265, mov_proresks, mkv_h264, mkv_h265, mkv_vp9, mkv_mpeg4."
  })
  declare output_container_and_codec: any;

  @prop({
    type: "list[str]",
    default: [],
    description:
      "Input keypoints [x,y] to erase or keep from the video. Format like so: {'x':100, 'y':100, 'type':'positive/negative'}"
  })
  declare keypoints: any;

  @prop({
    type: "bool",
    default: true,
    description: "auto trim the video, to working duration ( 5s )"
  })
  declare auto_trim: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const preserveAudio = Boolean(this.preserve_audio ?? true);
    const outputContainerAndCodec = String(
      this.output_container_and_codec ?? "mp4_h264"
    );
    const keypoints = String(this.keypoints ?? []);
    const autoTrim = Boolean(this.auto_trim ?? true);

    const args: Record<string, unknown> = {
      preserve_audio: preserveAudio,
      output_container_and_codec: outputContainerAndCodec,
      keypoints: keypoints,
      auto_trim: autoTrim
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "bria/video/erase/keypoints", args);
    return { output: res };
  }
}

export class BriaVideoErasePrompt extends FalNode {
  static readonly nodeType = "fal.video_to_video.BriaVideoErasePrompt";
  static readonly title = "Bria Video Erase Prompt";
  static readonly description = `Video
video, editing, video-to-video, vid2vid, professional`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({
    type: "str",
    default: "",
    description: "Input prompt to detect object to erase"
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Input video to erase object from. duration must be less than 5s."
  })
  declare video: any;

  @prop({
    type: "bool",
    default: true,
    description: "If true, audio will be preserved in the output video."
  })
  declare preserve_audio: any;

  @prop({
    type: "enum",
    default: "mp4_h264",
    values: [
      "mp4_h265",
      "mp4_h264",
      "webm_vp9",
      "gif",
      "mov_h264",
      "mov_h265",
      "mov_proresks",
      "mkv_h264",
      "mkv_h265",
      "mkv_vp9",
      "mkv_mpeg4"
    ],
    description:
      "Output container and codec. Options: mp4_h265, mp4_h264, webm_vp9, gif, mov_h264, mov_h265, mov_proresks, mkv_h264, mkv_h265, mkv_vp9, mkv_mpeg4."
  })
  declare output_container_and_codec: any;

  @prop({
    type: "bool",
    default: true,
    description: "auto trim the video, to working duration ( 5s )"
  })
  declare auto_trim: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const preserveAudio = Boolean(this.preserve_audio ?? true);
    const outputContainerAndCodec = String(
      this.output_container_and_codec ?? "mp4_h264"
    );
    const autoTrim = Boolean(this.auto_trim ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      preserve_audio: preserveAudio,
      output_container_and_codec: outputContainerAndCodec,
      auto_trim: autoTrim
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "bria/video/erase/prompt", args);
    return { output: res };
  }
}

export class BriaVideoEraseMask extends FalNode {
  static readonly nodeType = "fal.video_to_video.BriaVideoEraseMask";
  static readonly title = "Bria Video Erase Mask";
  static readonly description = `Video
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({
    type: "bool",
    default: true,
    description: "If true, audio will be preserved in the output video."
  })
  declare preserve_audio: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Input video to erase object from. duration must be less than 5s."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "mp4_h264",
    values: [
      "mp4_h265",
      "mp4_h264",
      "webm_vp9",
      "gif",
      "mov_h264",
      "mov_h265",
      "mov_proresks",
      "mkv_h264",
      "mkv_h265",
      "mkv_vp9",
      "mkv_mpeg4"
    ],
    description:
      "Output container and codec. Options: mp4_h265, mp4_h264, webm_vp9, gif, mov_h264, mov_h265, mov_proresks, mkv_h264, mkv_h265, mkv_vp9, mkv_mpeg4."
  })
  declare output_container_and_codec: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Input video to mask erase object from. duration must be less than 5s."
  })
  declare mask_video: any;

  @prop({
    type: "bool",
    default: true,
    description: "auto trim the video, to working duration ( 5s )"
  })
  declare auto_trim: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const preserveAudio = Boolean(this.preserve_audio ?? true);
    const outputContainerAndCodec = String(
      this.output_container_and_codec ?? "mp4_h264"
    );
    const autoTrim = Boolean(this.auto_trim ?? true);

    const args: Record<string, unknown> = {
      preserve_audio: preserveAudio,
      output_container_and_codec: outputContainerAndCodec,
      auto_trim: autoTrim
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

    const res = await falSubmit(apiKey, "bria/video/erase/mask", args);
    return { output: res };
  }
}

export class LightxRelight extends FalNode {
  static readonly nodeType = "fal.video_to_video.LightxRelight";
  static readonly title = "Lightx Relight";
  static readonly description = `Lightx
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    viz_video: "str",
    seed: "int",
    input_video: "str",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "Optional text prompt. If omitted, Light-X will auto-caption the video."
  })
  declare prompt: any;

  @prop({ type: "video", default: "", description: "URL of the input video." })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Relighting parameters (required for relight_condition_type='ic'). Not used for 'bg' (which expects a background image URL instead)."
  })
  declare relight_parameters: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Frame index to use as referencen to relight the video with reference."
  })
  declare ref_id: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of conditioning image. Required for relight_condition_type='ref'/'hdr'. Also required for relight_condition_type='bg' (background image)."
  })
  declare relit_cond_img_url: any;

  @prop({
    type: "enum",
    default: "ic",
    values: ["ic", "ref", "hdr", "bg"],
    description: "Relight condition type."
  })
  declare relit_cond_type: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const relightParameters = String(this.relight_parameters ?? "");
    const refId = Number(this.ref_id ?? 0);
    const relitCondType = String(this.relit_cond_type ?? "ic");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      relight_parameters: relightParameters,
      ref_id: refId,
      relit_cond_type: relitCondType,
      seed: seed
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const relitCondImgUrlRef = this.relit_cond_img_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(relitCondImgUrlRef)) {
      const relitCondImgUrlUrl =
        (await imageToDataUrl(relitCondImgUrlRef!)) ??
        (await assetToFalUrl(apiKey, relitCondImgUrlRef!));
      if (relitCondImgUrlUrl) args["relit_cond_img_url"] = relitCondImgUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/lightx/relight", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LightxRecamera extends FalNode {
  static readonly nodeType = "fal.video_to_video.LightxRecamera";
  static readonly title = "Lightx Recamera";
  static readonly description = `Lightx
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    viz_video: "str",
    seed: "int",
    input_video: "str",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "Optional text prompt. If omitted, Light-X will auto-caption the video."
  })
  declare prompt: any;

  @prop({ type: "video", default: "", description: "URL of the input video." })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description: "Camera trajectory parameters (required for recamera mode)."
  })
  declare trajectory: any;

  @prop({
    type: "enum",
    default: "traj",
    values: ["traj", "target"],
    description: "Camera control mode."
  })
  declare camera: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Target camera pose [theta, phi, radius, x, y] (required when camera='target')."
  })
  declare target_pose: any;

  @prop({
    type: "enum",
    default: "gradual",
    values: ["gradual", "bullet", "direct", "dolly-zoom"],
    description: "Camera motion mode."
  })
  declare mode: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const trajectory = String(this.trajectory ?? "");
    const camera = String(this.camera ?? "traj");
    const targetPose = String(this.target_pose ?? "");
    const mode = String(this.mode ?? "gradual");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      trajectory: trajectory,
      camera: camera,
      target_pose: targetPose,
      mode: mode,
      seed: seed
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/lightx/recamera", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV26StandardMotionControl extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.KlingVideoV26StandardMotionControl";
  static readonly title = "Kling Video V26 Standard Motion Control";
  static readonly description = `Kling Video v2.6 Motion Control [Standard]
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Reference video URL. The character actions in the generated video will be consistent with this reference video. Should contain a realistic style character with entire body or upper body visible, including head, without obstruction. Duration limit depends on character_orientation: 10s max for 'image', 30s max for 'video'."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "",
    values: ["image", "video"],
    description:
      "Controls whether the output character's orientation matches the reference image or video. 'video': orientation matches reference video - better for complex motions (max 30s). 'image': orientation matches reference image - better for following camera movements (max 10s)."
  })
  declare character_orientation: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to keep the original sound from the reference video."
  })
  declare keep_original_sound: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Reference image URL. The characters, backgrounds, and other elements in the generated video are based on this reference image. Characters should have clear body proportions, avoid occlusion, and occupy more than 5% of the image area."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const characterOrientation = String(this.character_orientation ?? "");
    const keepOriginalSound = Boolean(this.keep_original_sound ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      character_orientation: characterOrientation,
      keep_original_sound: keepOriginalSound
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/v2.6/standard/motion-control",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV26ProMotionControl extends FalNode {
  static readonly nodeType = "fal.video_to_video.KlingVideoV26ProMotionControl";
  static readonly title = "Kling Video V26 Pro Motion Control";
  static readonly description = `Kling Video v2.6 Motion Control [Pro]
video, editing, video-to-video, vid2vid, professional`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Reference video URL. The character actions in the generated video will be consistent with this reference video. Should contain a realistic style character with entire body or upper body visible, including head, without obstruction. Duration limit depends on character_orientation: 10s max for 'image', 30s max for 'video'."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "",
    values: ["image", "video"],
    description:
      "Controls whether the output character's orientation matches the reference image or video. 'video': orientation matches reference video - better for complex motions (max 30s). 'image': orientation matches reference image - better for following camera movements (max 10s)."
  })
  declare character_orientation: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to keep the original sound from the reference video."
  })
  declare keep_original_sound: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Reference image URL. The characters, backgrounds, and other elements in the generated video are based on this reference image. Characters should have clear body proportions, avoid occlusion, and occupy more than 5% of the image area."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const characterOrientation = String(this.character_orientation ?? "");
    const keepOriginalSound = Boolean(this.keep_original_sound ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      character_orientation: characterOrientation,
      keep_original_sound: keepOriginalSound
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/v2.6/pro/motion-control",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class DecartLucyRestyle extends FalNode {
  static readonly nodeType = "fal.video_to_video.DecartLucyRestyle";
  static readonly title = "Decart Lucy Restyle";
  static readonly description = `Lucy Restyle
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "bool",
    default: false,
    description:
      "\n            If set to true, the function will wait for the video to be generated\n            and uploaded before returning the response. This will increase the\n            latency of the function but it allows you to get the video directly\n            in the response without going through the CDN.\n        "
  })
  declare sync_mode: any;

  @prop({ type: "video", default: "", description: "URL of the video to edit" })
  declare video: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p"],
    description: "Resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description: "Text description of the desired video content"
  })
  declare prompt: any;

  @prop({ type: "int", default: -1, description: "Seed for video generation" })
  declare seed: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enhance the prompt for better results."
  })
  declare enhance_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const syncMode = Boolean(this.sync_mode ?? false);
    const resolution = String(this.resolution ?? "720p");
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const enhancePrompt = Boolean(this.enhance_prompt ?? true);

    const args: Record<string, unknown> = {
      sync_mode: syncMode,
      resolution: resolution,
      prompt: prompt,
      seed: seed,
      enhance_prompt: enhancePrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "decart/lucy-restyle", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Scail extends FalNode {
  static readonly nodeType = "fal.video_to_video.Scail";
  static readonly title = "Scail";
  static readonly description = `Scail
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "512p",
    description:
      "Output resolution. Outputs 896x512 (landscape) or 512x896 (portrait) based on the input image aspect ratio."
  })
  declare resolution: any;

  @prop({
    type: "video",
    default: "",
    description:
      "The URL of the video to use as a reference for the video generation."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 28,
    description:
      "The number of inference steps to use for the video generation."
  })
  declare num_inference_steps: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Enable multi-character mode. Use when driving video has multiple people."
  })
  declare multi_character: any;

  @prop({
    type: "image",
    default: "",
    description:
      "The URL of the image to use as a reference for the video generation."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "512p");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const multiCharacter = Boolean(this.multi_character ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      num_inference_steps: numInferenceSteps,
      multi_character: multiCharacter
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/scail", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ClarityaiCrystalVideoUpscaler extends FalNode {
  static readonly nodeType = "fal.video_to_video.ClarityaiCrystalVideoUpscaler";
  static readonly title = "Clarityai Crystal Video Upscaler";
  static readonly description = `Crystal Upscaler [Video]
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "video", default: "", description: "URL to the input video." })
  declare video: any;

  @prop({
    type: "float",
    default: 2,
    description:
      "Scale factor. The scale factor must be chosen such that the upscaled video does not exceed 5K resolution."
  })
  declare scale_factor: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const scaleFactor = Number(this.scale_factor ?? 2);

    const args: Record<string, unknown> = {
      scale_factor: scaleFactor
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "clarityai/crystal-video-upscaler",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV26ReferenceToVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.WanV26ReferenceToVideo";
  static readonly title = "Wan V26 Reference To Video";
  static readonly description = `Wan v2.6 Reference to Video
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    actual_prompt: "str",
    seed: "int",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "Use @Video1, @Video2, @Video3 to reference subjects from your videos. Works for people, animals, or objects. For multi-shot prompts: '[0-3s] Shot 1. [3-6s] Shot 2.' Max 800 characters."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    description:
      "Duration of the generated video in seconds. R2V supports only 5 or 10 seconds (no 15s)."
  })
  declare duration: any;

  @prop({
    type: "list[video]",
    default: [],
    description:
      "Reference videos for subject consistency (1-3 videos). Videos' FPS must be at least 16 FPS.Reference in prompt as @Video1, @Video2, @Video3. Works for people, animals, or objects."
  })
  declare video_urls: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["720p", "1080p"],
    description:
      "Video resolution tier. R2V only supports 720p and 1080p (no 480p)."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: true,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When true (default), enables intelligent multi-shot segmentation for coherent narrative videos with multiple shots. When false, generates single continuous shot. Only active when enable_prompt_expansion is True."
  })
  declare multi_shots: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Negative prompt to describe content to avoid. Max 500 characters."
  })
  declare negative_prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable prompt rewriting using LLM."
  })
  declare enable_prompt_expansion: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "5");
    const resolution = String(this.resolution ?? "1080p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const multiShots = Boolean(this.multi_shots ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      enable_safety_checker: enableSafetyChecker,
      seed: seed,
      multi_shots: multiShots,
      negative_prompt: negativePrompt,
      enable_prompt_expansion: enablePromptExpansion
    };

    const videoUrlsList = this.video_urls as
      | Record<string, unknown>[]
      | undefined;
    if (videoUrlsList?.length) {
      const videoUrlsUrls: string[] = [];
      for (const ref of videoUrlsList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) videoUrlsUrls.push(u);
        }
      }
      if (videoUrlsUrls.length) args["video_urls"] = videoUrlsUrls;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "wan/v2.6/reference-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Veo31FastExtendVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.Veo31FastExtendVideo";
  static readonly title = "Veo31 Fast Extend Video";
  static readonly description = `Veo 3.1 Fast
video, editing, video-to-video, vid2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt describing how the video should be extended"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "7s",
    description: "The duration of the generated video."
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to automatically attempt to fix prompts that fail content policy or other validation checks by rewriting them."
  })
  declare auto_fix: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL of the video to extend. The video should be 720p or 1080p resolution in 16:9 or 9:16 aspect ratio."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "720p",
    description: "The resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "9:16"],
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "4",
    values: ["1", "2", "3", "4", "5", "6"],
    description:
      "The safety tolerance level for content moderation. 1 is the most strict (blocks most content), 6 is the least strict."
  })
  declare safety_tolerance: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "A negative prompt to guide the video generation."
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "7s");
    const autoFix = Boolean(this.auto_fix ?? false);
    const generateAudio = Boolean(this.generate_audio ?? true);
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const safetyTolerance = String(this.safety_tolerance ?? "4");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      auto_fix: autoFix,
      generate_audio: generateAudio,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      safety_tolerance: safetyTolerance,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/veo3.1/fast/extend-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Veo31ExtendVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.Veo31ExtendVideo";
  static readonly title = "Veo31 Extend Video";
  static readonly description = `Veo 3.1
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt describing how the video should be extended"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "7s",
    description: "The duration of the generated video."
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to automatically attempt to fix prompts that fail content policy or other validation checks by rewriting them."
  })
  declare auto_fix: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL of the video to extend. The video should be 720p or 1080p resolution in 16:9 or 9:16 aspect ratio."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "720p",
    description: "The resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "9:16"],
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "4",
    values: ["1", "2", "3", "4", "5", "6"],
    description:
      "The safety tolerance level for content moderation. 1 is the most strict (blocks most content), 6 is the least strict."
  })
  declare safety_tolerance: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "A negative prompt to guide the video generation."
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "7s");
    const autoFix = Boolean(this.auto_fix ?? false);
    const generateAudio = Boolean(this.generate_audio ?? true);
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const safetyTolerance = String(this.safety_tolerance ?? "4");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      auto_fix: autoFix,
      generate_audio: generateAudio,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      safety_tolerance: safetyTolerance,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/veo3.1/extend-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO1StandardVideoToVideoReference extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.KlingVideoO1StandardVideoToVideoReference";
  static readonly title = "Kling Video O1 Standard Video To Video Reference";
  static readonly description = `Kling O1 Reference Video to Video [Standard]
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Use @Element1, @Element2 to reference elements and @Image1, @Image2 to reference images in order."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "9:16", "1:1"],
    description:
      "The aspect ratio of the generated video frame. If 'auto', the aspect ratio will be determined automatically based on the input video, and the closest aspect ratio to the input video will be used."
  })
  declare aspect_ratio: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Reference video URL. Only .mp4/.mov formats supported, 3-10 seconds duration, 720-2160px resolution, max 200MB.\n\nMax file size: 200.0MB, Min width: 720px, Min height: 720px, Max width: 2160px, Max height: 2160px, Min duration: 3.0s, Max duration: 10.05s, Min FPS: 24.0, Max FPS: 60.0, Timeout: 30.0s"
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["3", "4", "5", "6", "7", "8", "9", "10"],
    description: "Video duration in seconds."
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to keep the original audio from the video."
  })
  declare keep_audio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Elements (characters/objects) to include. Reference in prompt as @Element1, @Element2, etc. Maximum 4 total (elements + reference images) when using video."
  })
  declare elements: any;

  @prop({
    type: "list[image]",
    default: "",
    description:
      "Reference images for style/appearance. Reference in prompt as @Image1, @Image2, etc. Maximum 4 total (elements + reference images) when using video."
  })
  declare images: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const duration = String(this.duration ?? "5");
    const keepAudio = Boolean(this.keep_audio ?? false);
    const elements = String(this.elements ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      duration: duration,
      keep_audio: keepAudio,
      elements: elements
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imagesList = this.images as Record<string, unknown>[] | undefined;
    if (imagesList?.length) {
      const imagesUrls: string[] = [];
      for (const ref of imagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) imagesUrls.push(u);
        }
      }
      if (imagesUrls.length) args["image_urls"] = imagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/o1/standard/video-to-video/reference",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO1StandardVideoToVideoEdit extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.KlingVideoO1StandardVideoToVideoEdit";
  static readonly title = "Kling Video O1 Standard Video To Video Edit";
  static readonly description = `Kling O1 Edit Video [Standard]
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Use @Element1, @Element2 to reference elements and @Image1, @Image2 to reference images in order."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Reference video URL. Only .mp4/.mov formats supported, 3-10 seconds duration, 720-2160px resolution, max 200MB.\n\nMax file size: 200.0MB, Min width: 720px, Min height: 720px, Max width: 2160px, Max height: 2160px, Min duration: 3.0s, Max duration: 10.05s, Min FPS: 24.0, Max FPS: 60.0, Timeout: 30.0s"
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Elements (characters/objects) to include. Reference in prompt as @Element1, @Element2, etc. Maximum 4 total (elements + reference images) when using video."
  })
  declare elements: any;

  @prop({
    type: "list[image]",
    default: "",
    description:
      "Reference images for style/appearance. Reference in prompt as @Image1, @Image2, etc. Maximum 4 total (elements + reference images) when using video."
  })
  declare images: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to keep the original audio from the video."
  })
  declare keep_audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const elements = String(this.elements ?? "");
    const keepAudio = Boolean(this.keep_audio ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      elements: elements,
      keep_audio: keepAudio
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imagesList = this.images as Record<string, unknown>[] | undefined;
    if (imagesList?.length) {
      const imagesUrls: string[] = [];
      for (const ref of imagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) imagesUrls.push(u);
        }
      }
      if (imagesUrls.length) args["image_urls"] = imagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/o1/standard/video-to-video/edit",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO3StandardVideoToVideoReference extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.KlingVideoO3StandardVideoToVideoReference";
  static readonly title = "Kling Video O3 Standard Video To Video Reference";
  static readonly description = `Kling O3 Reference Video to Video [Standard]
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation. Reference video as @Video1."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Video duration in seconds (3-15s for reference video)."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "9:16", "1:1"],
    description: "Aspect ratio."
  })
  declare aspect_ratio: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Reference video URL. Only .mp4/.mov formats, 3-10s duration, 720-2160px resolution, max 200MB."
  })
  declare video: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to keep the original audio from the reference video. "
  })
  declare keep_audio: any;

  @prop({
    type: "str",
    default: "customize",
    description: "The type of multi-shot video generation."
  })
  declare shot_type: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Elements (characters/objects) to include. Reference in prompt as @Element1, @Element2."
  })
  declare elements: any;

  @prop({
    type: "list[image]",
    default: "",
    description:
      "Reference images for style/appearance. Reference in prompt as @Image1, @Image2, etc. Maximum 4 total (elements + reference images) when using video."
  })
  declare images: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const keepAudio = Boolean(this.keep_audio ?? true);
    const shotType = String(this.shot_type ?? "customize");
    const elements = String(this.elements ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      aspect_ratio: aspectRatio,
      keep_audio: keepAudio,
      shot_type: shotType,
      elements: elements
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imagesList = this.images as Record<string, unknown>[] | undefined;
    if (imagesList?.length) {
      const imagesUrls: string[] = [];
      for (const ref of imagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) imagesUrls.push(u);
        }
      }
      if (imagesUrls.length) args["image_urls"] = imagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/o3/standard/video-to-video/reference",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO3StandardVideoToVideoEdit extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.KlingVideoO3StandardVideoToVideoEdit";
  static readonly title = "Kling Video O3 Standard Video To Video Edit";
  static readonly description = `Kling O3 Edit Video [Standard]
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation. Reference video as @Video1."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Reference video URL. Only .mp4/.mov formats, 3-10s duration, 720-2160px resolution, max 200MB."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Elements (characters/objects) to include. Reference in prompt as @Element1, @Element2."
  })
  declare elements: any;

  @prop({
    type: "list[image]",
    default: "",
    description:
      "Reference images for style/appearance. Reference in prompt as @Image1, @Image2, etc. Maximum 4 total (elements + reference images) when using video."
  })
  declare images: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to keep the original audio from the reference video. "
  })
  declare keep_audio: any;

  @prop({
    type: "str",
    default: "customize",
    description: "The type of multi-shot video generation."
  })
  declare shot_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const elements = String(this.elements ?? "");
    const keepAudio = Boolean(this.keep_audio ?? true);
    const shotType = String(this.shot_type ?? "customize");

    const args: Record<string, unknown> = {
      prompt: prompt,
      elements: elements,
      keep_audio: keepAudio,
      shot_type: shotType
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imagesList = this.images as Record<string, unknown>[] | undefined;
    if (imagesList?.length) {
      const imagesUrls: string[] = [];
      for (const ref of imagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) imagesUrls.push(u);
        }
      }
      if (imagesUrls.length) args["image_urls"] = imagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/o3/standard/video-to-video/edit",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO3ProVideoToVideoReference extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.KlingVideoO3ProVideoToVideoReference";
  static readonly title = "Kling Video O3 Pro Video To Video Reference";
  static readonly description = `Kling O3 Reference Video to Video [Pro]
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation. Reference video as @Video1."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Video duration in seconds (3-15s for reference video)."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "9:16", "1:1"],
    description: "Aspect ratio."
  })
  declare aspect_ratio: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Reference video URL. Only .mp4/.mov formats, 3-10s duration, 720-2160px resolution, max 200MB."
  })
  declare video: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to keep the original audio from the reference video. "
  })
  declare keep_audio: any;

  @prop({
    type: "str",
    default: "customize",
    description: "The type of multi-shot video generation."
  })
  declare shot_type: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Elements (characters/objects) to include. Reference in prompt as @Element1, @Element2."
  })
  declare elements: any;

  @prop({
    type: "list[image]",
    default: "",
    description:
      "Reference images for style/appearance. Reference in prompt as @Image1, @Image2, etc. Maximum 4 total (elements + reference images) when using video."
  })
  declare images: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const keepAudio = Boolean(this.keep_audio ?? true);
    const shotType = String(this.shot_type ?? "customize");
    const elements = String(this.elements ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      aspect_ratio: aspectRatio,
      keep_audio: keepAudio,
      shot_type: shotType,
      elements: elements
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imagesList = this.images as Record<string, unknown>[] | undefined;
    if (imagesList?.length) {
      const imagesUrls: string[] = [];
      for (const ref of imagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) imagesUrls.push(u);
        }
      }
      if (imagesUrls.length) args["image_urls"] = imagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/o3/pro/video-to-video/reference",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO3ProVideoToVideoEdit extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.KlingVideoO3ProVideoToVideoEdit";
  static readonly title = "Kling Video O3 Pro Video To Video Edit";
  static readonly description = `Kling O3 Edit Video [Pro]
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation. Reference video as @Video1."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Reference video URL. Only .mp4/.mov formats, 3-10s duration, 720-2160px resolution, max 200MB."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Elements (characters/objects) to include. Reference in prompt as @Element1, @Element2."
  })
  declare elements: any;

  @prop({
    type: "list[image]",
    default: "",
    description:
      "Reference images for style/appearance. Reference in prompt as @Image1, @Image2, etc. Maximum 4 total (elements + reference images) when using video."
  })
  declare images: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to keep the original audio from the reference video. "
  })
  declare keep_audio: any;

  @prop({
    type: "str",
    default: "customize",
    description: "The type of multi-shot video generation."
  })
  declare shot_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const elements = String(this.elements ?? "");
    const keepAudio = Boolean(this.keep_audio ?? true);
    const shotType = String(this.shot_type ?? "customize");

    const args: Record<string, unknown> = {
      prompt: prompt,
      elements: elements,
      keep_audio: keepAudio,
      shot_type: shotType
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imagesList = this.images as Record<string, unknown>[] | undefined;
    if (imagesList?.length) {
      const imagesUrls: string[] = [];
      for (const ref of imagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) imagesUrls.push(u);
        }
      }
      if (imagesUrls.length) args["image_urls"] = imagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/o3/pro/video-to-video/edit",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class SteadyDancer extends FalNode {
  static readonly nodeType = "fal.video_to_video.SteadyDancer";
  static readonly title = "Steady Dancer";
  static readonly description = `Steady Dancer
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    seed: "int",
    num_frames: "int",
    video: "video"
  };

  @prop({
    type: "str",
    default: "A person dancing with smooth and natural movements.",
    description: "Text prompt describing the desired animation."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL of the driving pose video. The motion from this video will be transferred to the reference image."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "aggressive",
    values: ["light", "moderate", "aggressive"],
    description: "Acceleration levels."
  })
  declare acceleration: any;

  @prop({
    type: "float",
    default: 1,
    description: "Pose guidance scale for pose control strength."
  })
  declare pose_guidance_scale: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "float",
    default: 0.4,
    description:
      "End ratio for pose guidance. Controls when pose guidance ends."
  })
  declare pose_guidance_end: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Frames per second of the generated video. Must be between 5 to 24. If not specified, uses the FPS from the input video."
  })
  declare frames_per_second: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Number of frames to generate. If not specified, uses the frame count from the input video (capped at 241). Will be adjusted to nearest valid value (must satisfy 4k+1 pattern)."
  })
  declare num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, applies quality enhancement for faster generation with improved quality. When enabled, parameters are automatically optimized (num_inference_steps=6, guidance_scale=1.0) and uses the LightX2V distillation LoRA."
  })
  declare use_turbo: any;

  @prop({
    type: "str",
    default:
      "blurred, distorted face, bad anatomy, extra limbs, poorly drawn hands, poorly drawn feet, disfigured, out of frame, duplicate, watermark, signature, text",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 1,
    description: "Classifier-free guidance scale for prompt adherence."
  })
  declare guidance_scale: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "9:16", "1:1"],
    description:
      "Aspect ratio of the generated video. If 'auto', will be determined from the reference image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "float",
    default: 0.1,
    description:
      "Start ratio for pose guidance. Controls when pose guidance begins."
  })
  declare pose_guidance_start: any;

  @prop({
    type: "enum",
    default: "576p",
    values: ["480p", "576p", "720p"],
    description:
      "Resolution of the generated video. 576p is default, 720p for higher quality. 480p is lower quality."
  })
  declare resolution: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the reference image to animate. This is the person/character whose appearance will be preserved."
  })
  declare image: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "If enabled, copies audio from the input driving video to the output video."
  })
  declare preserve_audio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 6,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(
      this.prompt ?? "A person dancing with smooth and natural movements."
    );
    const acceleration = String(this.acceleration ?? "aggressive");
    const poseGuidanceScale = Number(this.pose_guidance_scale ?? 1);
    const shift = Number(this.shift ?? 5);
    const poseGuidanceEnd = Number(this.pose_guidance_end ?? 0.4);
    const framesPerSecond = String(this.frames_per_second ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const numFrames = String(this.num_frames ?? "");
    const useTurbo = Boolean(this.use_turbo ?? false);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurred, distorted face, bad anatomy, extra limbs, poorly drawn hands, poorly drawn feet, disfigured, out of frame, duplicate, watermark, signature, text"
    );
    const guidanceScale = Number(this.guidance_scale ?? 1);
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const poseGuidanceStart = Number(this.pose_guidance_start ?? 0.1);
    const resolution = String(this.resolution ?? "576p");
    const preserveAudio = Boolean(this.preserve_audio ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 6);

    const args: Record<string, unknown> = {
      prompt: prompt,
      acceleration: acceleration,
      pose_guidance_scale: poseGuidanceScale,
      shift: shift,
      pose_guidance_end: poseGuidanceEnd,
      frames_per_second: framesPerSecond,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      use_turbo: useTurbo,
      negative_prompt: negativePrompt,
      guidance_scale: guidanceScale,
      aspect_ratio: aspectRatio,
      pose_guidance_start: poseGuidanceStart,
      resolution: resolution,
      preserve_audio: preserveAudio,
      seed: seed,
      num_inference_steps: numInferenceSteps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/steady-dancer", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class OneToAllAnimation13B extends FalNode {
  static readonly nodeType = "fal.video_to_video.OneToAllAnimation13B";
  static readonly title = "One To All Animation13 B";
  static readonly description = `One To All Animation
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "The URL of the video to use as a reference for the video generation."
  })
  declare video: any;

  @prop({
    type: "float",
    default: 2,
    description: "The image guidance scale to use for the video generation."
  })
  declare image_guidance_scale: any;

  @prop({
    type: "float",
    default: 1.5,
    description: "The pose guidance scale to use for the video generation."
  })
  declare pose_guidance_scale: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p", "580p", "720p"],
    description: "The resolution of the video to generate."
  })
  declare resolution: any;

  @prop({
    type: "image",
    default: "",
    description:
      "The URL of the image to use as a reference for the video generation."
  })
  declare image: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "The number of inference steps to use for the video generation."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "",
    description: "The negative prompt to generate the video from."
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageGuidanceScale = Number(this.image_guidance_scale ?? 2);
    const poseGuidanceScale = Number(this.pose_guidance_scale ?? 1.5);
    const resolution = String(this.resolution ?? "480p");
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      image_guidance_scale: imageGuidanceScale,
      pose_guidance_scale: poseGuidanceScale,
      resolution: resolution,
      num_inference_steps: numInferenceSteps,
      negative_prompt: negativePrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/one-to-all-animation/1.3b",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class OneToAllAnimation14B extends FalNode {
  static readonly nodeType = "fal.video_to_video.OneToAllAnimation14B";
  static readonly title = "One To All Animation14 B";
  static readonly description = `One To All Animation
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "The URL of the video to use as a reference for the video generation."
  })
  declare video: any;

  @prop({
    type: "float",
    default: 2,
    description: "The image guidance scale to use for the video generation."
  })
  declare image_guidance_scale: any;

  @prop({
    type: "float",
    default: 1.5,
    description: "The pose guidance scale to use for the video generation."
  })
  declare pose_guidance_scale: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p", "580p", "720p"],
    description: "The resolution of the video to generate."
  })
  declare resolution: any;

  @prop({
    type: "image",
    default: "",
    description:
      "The URL of the image to use as a reference for the video generation."
  })
  declare image: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "The number of inference steps to use for the video generation."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "",
    description: "The negative prompt to generate the video from."
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageGuidanceScale = Number(this.image_guidance_scale ?? 2);
    const poseGuidanceScale = Number(this.pose_guidance_scale ?? 1.5);
    const resolution = String(this.resolution ?? "480p");
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      image_guidance_scale: imageGuidanceScale,
      pose_guidance_scale: poseGuidanceScale,
      resolution: resolution,
      num_inference_steps: numInferenceSteps,
      negative_prompt: negativePrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/one-to-all-animation/14b",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanVisionEnhancer extends FalNode {
  static readonly nodeType = "fal.video_to_video.WanVisionEnhancer";
  static readonly title = "Wan Vision Enhancer";
  static readonly description = `Wan Vision Enhancer
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    timings: "dict[str, any]",
    seed: "int",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "Optional prompt to prepend to the VLM-generated description. Leave empty to use only the auto-generated description from the video."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "The URL of the video to enhance with Wan Video. Maximum 200MB file size. Videos longer than 500 frames will have only the first 500 frames processed (~8-21 seconds depending on fps)."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If not provided, a random seed will be used."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    description:
      "Target output resolution for the enhanced video. 720p (native, fast) or 1080p (upscaled, slower). Processing is always done at 720p, then upscaled if 1080p selected."
  })
  declare target_resolution: any;

  @prop({
    type: "str",
    default:
      "oversaturated, overexposed, static, blurry details, subtitles, stylized, artwork, painting, still frame, overall gray, worst quality, low quality, JPEG artifacts, ugly, mutated, extra fingers, poorly drawn hands, poorly drawn face, deformed, disfigured, malformed limbs, fused fingers, static motion, cluttered background, three legs, crowded background, walking backwards",
    description: "Negative prompt to avoid unwanted features."
  })
  declare negative_prompt: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "Controls how much the model enhances/changes the video. 0 = Minimal change (preserves original), 1 = Subtle enhancement (default), 2 = Medium enhancement, 3 = Strong enhancement, 4 = Maximum enhancement."
  })
  declare creativity: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const seed = String(this.seed ?? "");
    const targetResolution = String(this.target_resolution ?? "720p");
    const negativePrompt = String(
      this.negative_prompt ??
        "oversaturated, overexposed, static, blurry details, subtitles, stylized, artwork, painting, still frame, overall gray, worst quality, low quality, JPEG artifacts, ugly, mutated, extra fingers, poorly drawn hands, poorly drawn face, deformed, disfigured, malformed limbs, fused fingers, static motion, cluttered background, three legs, crowded background, walking backwards"
    );
    const creativity = Number(this.creativity ?? 1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      seed: seed,
      target_resolution: targetResolution,
      negative_prompt: negativePrompt,
      creativity: creativity
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-vision-enhancer", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class SyncLipsyncReact1 extends FalNode {
  static readonly nodeType = "fal.video_to_video.SyncLipsyncReact1";
  static readonly title = "Sync Lipsync React1";
  static readonly description = `Sync React-1
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "enum",
    default: "",
    values: ["happy", "angry", "sad", "neutral", "disgusted", "surprised"],
    description:
      "Emotion prompt for the generation. Currently supports single-word emotions only."
  })
  declare emotion: any;

  @prop({
    type: "video",
    default: "",
    description: "URL to the input video. Must be **15 seconds or shorter**."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "bounce",
    values: ["cut_off", "loop", "bounce", "silence", "remap"],
    description: "Lipsync mode when audio and video durations are out of sync."
  })
  declare lipsync_mode: any;

  @prop({
    type: "audio",
    default: "",
    description: "URL to the input audio. Must be **15 seconds or shorter**."
  })
  declare audio: any;

  @prop({
    type: "float",
    default: 0.5,
    description: "Controls the expresiveness of the lipsync."
  })
  declare temperature: any;

  @prop({
    type: "enum",
    default: "face",
    values: ["lips", "face", "head"],
    description:
      "Controls the edit region and movement scope for the model. Available options:\n- 'lips': Only lipsync using react-1 (minimal facial changes).\n- 'face': Lipsync + facial expressions without head movements.\n- 'head': Lipsync + facial expressions + natural talking head movements."
  })
  declare model_mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const emotion = String(this.emotion ?? "");
    const lipsyncMode = String(this.lipsync_mode ?? "bounce");
    const temperature = Number(this.temperature ?? 0.5);
    const modelMode = String(this.model_mode ?? "face");

    const args: Record<string, unknown> = {
      emotion: emotion,
      lipsync_mode: lipsyncMode,
      temperature: temperature,
      model_mode: modelMode
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sync-lipsync/react-1", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class VeedVideoBackgroundRemovalFast extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.VeedVideoBackgroundRemovalFast";
  static readonly title = "Veed Video Background Removal Fast";
  static readonly description = `Video Background Removal
video, editing, video-to-video, vid2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "list[File]" };

  @prop({ type: "video", default: "" })
  declare video: any;

  @prop({
    type: "bool",
    default: true,
    description: "Set to False if the subject is not a person."
  })
  declare subject_is_person: any;

  @prop({
    type: "enum",
    default: "vp9",
    values: ["vp9", "h264"],
    description:
      "Single VP9 video with alpha channel or two videos (rgb and alpha) in H264 format. H264 is recommended for better RGB quality."
  })
  declare output_codec: any;

  @prop({
    type: "bool",
    default: true,
    description: "Improves the quality of the extracted object's edges."
  })
  declare refine_foreground_edges: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const subjectIsPerson = Boolean(this.subject_is_person ?? true);
    const outputCodec = String(this.output_codec ?? "vp9");
    const refineForegroundEdges = Boolean(this.refine_foreground_edges ?? true);

    const args: Record<string, unknown> = {
      subject_is_person: subjectIsPerson,
      output_codec: outputCodec,
      refine_foreground_edges: refineForegroundEdges
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "veed/video-background-removal/fast",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO1VideoToVideoEdit extends FalNode {
  static readonly nodeType = "fal.video_to_video.KlingVideoO1VideoToVideoEdit";
  static readonly title = "Kling Video O1 Video To Video Edit";
  static readonly description = `Kling O1 Edit Video [Pro]
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Use @Element1, @Element2 to reference elements and @Image1, @Image2 to reference images in order."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Reference video URL. Only .mp4/.mov formats supported, 3-10 seconds duration, 720-2160px resolution, max 200MB.\n\nMax file size: 200.0MB, Min width: 720px, Min height: 720px, Max width: 2160px, Max height: 2160px, Min duration: 3.0s, Max duration: 10.05s, Min FPS: 24.0, Max FPS: 60.0, Timeout: 30.0s"
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Elements (characters/objects) to include. Reference in prompt as @Element1, @Element2, etc. Maximum 4 total (elements + reference images) when using video."
  })
  declare elements: any;

  @prop({
    type: "list[image]",
    default: "",
    description:
      "Reference images for style/appearance. Reference in prompt as @Image1, @Image2, etc. Maximum 4 total (elements + reference images) when using video."
  })
  declare images: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to keep the original audio from the video."
  })
  declare keep_audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const elements = String(this.elements ?? "");
    const keepAudio = Boolean(this.keep_audio ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      elements: elements,
      keep_audio: keepAudio
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imagesList = this.images as Record<string, unknown>[] | undefined;
    if (imagesList?.length) {
      const imagesUrls: string[] = [];
      for (const ref of imagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) imagesUrls.push(u);
        }
      }
      if (imagesUrls.length) args["image_urls"] = imagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/o1/video-to-video/edit",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO1VideoToVideoReference extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.KlingVideoO1VideoToVideoReference";
  static readonly title = "Kling Video O1 Video To Video Reference";
  static readonly description = `Kling O1 Reference Video to Video [Pro]
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Use @Element1, @Element2 to reference elements and @Image1, @Image2 to reference images in order."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "9:16", "1:1"],
    description:
      "The aspect ratio of the generated video frame. If 'auto', the aspect ratio will be determined automatically based on the input video, and the closest aspect ratio to the input video will be used."
  })
  declare aspect_ratio: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Reference video URL. Only .mp4/.mov formats supported, 3-10 seconds duration, 720-2160px resolution, max 200MB.\n\nMax file size: 200.0MB, Min width: 720px, Min height: 720px, Max width: 2160px, Max height: 2160px, Min duration: 3.0s, Max duration: 10.05s, Min FPS: 24.0, Max FPS: 60.0, Timeout: 30.0s"
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["3", "4", "5", "6", "7", "8", "9", "10"],
    description: "Video duration in seconds."
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to keep the original audio from the video."
  })
  declare keep_audio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Elements (characters/objects) to include. Reference in prompt as @Element1, @Element2, etc. Maximum 4 total (elements + reference images) when using video."
  })
  declare elements: any;

  @prop({
    type: "list[image]",
    default: "",
    description:
      "Reference images for style/appearance. Reference in prompt as @Image1, @Image2, etc. Maximum 4 total (elements + reference images) when using video."
  })
  declare images: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const duration = String(this.duration ?? "5");
    const keepAudio = Boolean(this.keep_audio ?? false);
    const elements = String(this.elements ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      duration: duration,
      keep_audio: keepAudio,
      elements: elements
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imagesList = this.images as Record<string, unknown>[] | undefined;
    if (imagesList?.length) {
      const imagesUrls: string[] = [];
      for (const ref of imagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) imagesUrls.push(u);
        }
      }
      if (imagesUrls.length) args["image_urls"] = imagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/o1/video-to-video/reference",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class VeedVideoBackgroundRemoval extends FalNode {
  static readonly nodeType = "fal.video_to_video.VeedVideoBackgroundRemoval";
  static readonly title = "Veed Video Background Removal";
  static readonly description = `Video Background Removal
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "list[File]" };

  @prop({ type: "video", default: "" })
  declare video: any;

  @prop({
    type: "bool",
    default: true,
    description: "Set to False if the subject is not a person."
  })
  declare subject_is_person: any;

  @prop({
    type: "enum",
    default: "vp9",
    values: ["vp9", "h264"],
    description:
      "Single VP9 video with alpha channel or two videos (rgb and alpha) in H264 format. H264 is recommended for better RGB quality."
  })
  declare output_codec: any;

  @prop({
    type: "bool",
    default: true,
    description: "Improves the quality of the extracted object's edges."
  })
  declare refine_foreground_edges: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const subjectIsPerson = Boolean(this.subject_is_person ?? true);
    const outputCodec = String(this.output_codec ?? "vp9");
    const refineForegroundEdges = Boolean(this.refine_foreground_edges ?? true);

    const args: Record<string, unknown> = {
      subject_is_person: subjectIsPerson,
      output_codec: outputCodec,
      refine_foreground_edges: refineForegroundEdges
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "veed/video-background-removal", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class VeedVideoBackgroundRemovalGreenScreen extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.VeedVideoBackgroundRemovalGreenScreen";
  static readonly title = "Veed Video Background Removal Green Screen";
  static readonly description = `Video Background Removal
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "list[File]" };

  @prop({ type: "video", default: "" })
  declare video: any;

  @prop({
    type: "enum",
    default: "vp9",
    values: ["vp9", "h264"],
    description:
      "Single VP9 video with alpha channel or two videos (rgb and alpha) in H264 format. H264 is recommended for better RGB quality."
  })
  declare output_codec: any;

  @prop({
    type: "str",
    default: 0.8,
    description:
      "Increase the value if green spots remain in the video, decrease if color changes are noticed on the extracted subject."
  })
  declare spill_suppression_strength: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const outputCodec = String(this.output_codec ?? "vp9");
    const spillSuppressionStrength = String(
      this.spill_suppression_strength ?? 0.8
    );

    const args: Record<string, unknown> = {
      output_codec: outputCodec,
      spill_suppression_strength: spillSuppressionStrength
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "veed/video-background-removal/green-screen",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx2RetakeVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.Ltx2RetakeVideo";
  static readonly title = "Ltx2 Retake Video";
  static readonly description = `LTX Video 2.0 Retake
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to retake the video with"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0,
    description: "The start time of the video to retake in seconds"
  })
  declare start_time: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to retake"
  })
  declare video: any;

  @prop({
    type: "float",
    default: 5,
    description: "The duration of the video to retake in seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "replace_audio_and_video",
    values: ["replace_audio", "replace_video", "replace_audio_and_video"],
    description: "The retake mode to use for the retake"
  })
  declare retake_mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const startTime = Number(this.start_time ?? 0);
    const duration = Number(this.duration ?? 5);
    const retakeMode = String(this.retake_mode ?? "replace_audio_and_video");

    const args: Record<string, unknown> = {
      prompt: prompt,
      start_time: startTime,
      duration: duration,
      retake_mode: retakeMode
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ltx-2/retake-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class DecartLucyEditFast extends FalNode {
  static readonly nodeType = "fal.video_to_video.DecartLucyEditFast";
  static readonly title = "Decart Lucy Edit Fast";
  static readonly description = `Lucy Edit [Fast]
video, editing, video-to-video, vid2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "bool",
    default: false,
    description:
      "\n            If set to true, the function will wait for the video to be generated\n            and uploaded before returning the response. This will increase the\n            latency of the function but it allows you to get the video directly\n            in the response without going through the CDN.\n        "
  })
  declare sync_mode: any;

  @prop({ type: "video", default: "", description: "URL of the video to edit" })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description: "Text description of the desired video content"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enhance the prompt for better results."
  })
  declare enhance_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const syncMode = Boolean(this.sync_mode ?? false);
    const prompt = String(this.prompt ?? "");
    const enhancePrompt = Boolean(this.enhance_prompt ?? true);

    const args: Record<string, unknown> = {
      sync_mode: syncMode,
      prompt: prompt,
      enhance_prompt: enhancePrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "decart/lucy-edit/fast", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Sam3VideoRle extends FalNode {
  static readonly nodeType = "fal.video_to_video.Sam3VideoRle";
  static readonly title = "Sam3 Video Rle";
  static readonly description = `Sam 3
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    boundingbox_frames_zip: "str",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "Text prompt for segmentation. Use commas to track multiple objects (e.g., 'person, cloth')."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to be segmented."
  })
  declare video: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Detection confidence threshold (0.0-1.0). Lower = more detections but less precise. Defaults: 0.5 for existing, 0.7 for new objects. Try 0.2-0.3 if text prompts fail."
  })
  declare detection_threshold: any;

  @prop({
    type: "list[BoxPrompt]",
    default: [],
    description: "List of box prompts with optional frame_index."
  })
  declare box_prompts: any;

  @prop({
    type: "list[PointPrompt]",
    default: [],
    description: "List of point prompts with frame indices."
  })
  declare point_prompts: any;

  @prop({
    type: "bool",
    default: false,
    description: "Return per-frame bounding box overlays as a zip archive."
  })
  declare boundingbox_zip: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Frame index used for initial interaction when mask_url is provided."
  })
  declare frame_index: any;

  @prop({
    type: "str",
    default: "",
    description: "The URL of the mask to be applied initially."
  })
  declare mask_url: any;

  @prop({
    type: "bool",
    default: false,
    description: "Apply the mask on the video."
  })
  declare apply_mask: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const detectionThreshold = Number(this.detection_threshold ?? 0.5);
    const boxPrompts = String(this.box_prompts ?? []);
    const pointPrompts = String(this.point_prompts ?? []);
    const boundingboxZip = Boolean(this.boundingbox_zip ?? false);
    const frameIndex = Number(this.frame_index ?? 0);
    const maskUrl = String(this.mask_url ?? "");
    const applyMask = Boolean(this.apply_mask ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      detection_threshold: detectionThreshold,
      box_prompts: boxPrompts,
      point_prompts: pointPrompts,
      boundingbox_zip: boundingboxZip,
      frame_index: frameIndex,
      mask_url: maskUrl,
      apply_mask: applyMask
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sam-3/video-rle", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Sam3Video extends FalNode {
  static readonly nodeType = "fal.video_to_video.Sam3Video";
  static readonly title = "Sam3 Video";
  static readonly description = `Sam 3
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    boundingbox_frames_zip: "str",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "Text prompt for segmentation. Use commas to track multiple objects (e.g., 'person, cloth')."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Detection confidence threshold (0.0-1.0). Lower = more detections but less precise. "
  })
  declare detection_threshold: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to be segmented."
  })
  declare video: any;

  @prop({
    type: "list[BoxPromptBase]",
    default: [],
    description: "List of box prompt coordinates (x_min, y_min, x_max, y_max)."
  })
  declare box_prompts: any;

  @prop({
    type: "list[PointPromptBase]",
    default: [],
    description: "List of point prompts"
  })
  declare point_prompts: any;

  @prop({
    type: "bool",
    default: true,
    description: "Apply the mask on the video."
  })
  declare apply_mask: any;

  @prop({
    type: "str",
    default: "",
    description:
      "[DEPRECATED] Use 'prompt' instead. Kept for backward compatibility."
  })
  declare text_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const detectionThreshold = Number(this.detection_threshold ?? 0.5);
    const boxPrompts = String(this.box_prompts ?? []);
    const pointPrompts = String(this.point_prompts ?? []);
    const applyMask = Boolean(this.apply_mask ?? true);
    const textPrompt = String(this.text_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      video_output_type: videoOutputType,
      detection_threshold: detectionThreshold,
      box_prompts: boxPrompts,
      point_prompts: pointPrompts,
      apply_mask: applyMask,
      text_prompt: textPrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sam-3/video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Editto extends FalNode {
  static readonly nodeType = "fal.video_to_video.Editto";
  static readonly title = "Editto";
  static readonly description = `Editto
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    frames_zip: "str",
    seed: "int",
    video: "video"
  };

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "video",
    default: "",
    description: "URL to the source video file. Required for inpainting."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "regular",
    description:
      "Acceleration to use for inference. Options are 'none' or 'regular'. Accelerated inference will very slightly affect output, but will be significantly faster."
  })
  declare acceleration: any;

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Temporal downsample factor for the video. This is an integer value that determines how many frames to skip in the video. A value of 0 means no downsampling. For each downsample factor, one upsample factor will automatically be applied."
  })
  declare temporal_downsample_factor: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Number of frames to interpolate between the original frames. A value of 0 means no interpolation."
  })
  declare num_interpolated_frames: any;

  @prop({
    type: "str",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 5 to 30. Ignored if match_input_frames_per_second is true."
  })
  declare frames_per_second: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the number of frames in the generated video will match the number of frames in the input video. If false, the number of frames will be determined by the num_frames parameter."
  })
  declare match_input_num_frames: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "Guidance scale for classifier-free guidance. Higher values encourage the model to generate images closely related to the text prompt."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Number of frames to generate. Must be between 81 to 241 (inclusive)."
  })
  declare num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default:
      "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "unipc",
    values: ["unipc", "dpm++", "euler"],
    description: "Sampler to use for video generation."
  })
  declare sampler: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "240p", "360p", "480p", "580p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, also return a ZIP file containing all generated frames."
  })
  declare return_frames_zip: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "1:1", "9:16"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the frames per second of the generated video will match the input video. If false, the frames per second will be determined by the frames_per_second parameter."
  })
  declare match_input_frames_per_second: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the model will automatically temporally downsample the video to an appropriate frame length for the model, then will interpolate it back to the original frame length."
  })
  declare enable_auto_downsample: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const shift = Number(this.shift ?? 5);
    const acceleration = String(this.acceleration ?? "regular");
    const prompt = String(this.prompt ?? "");
    const temporalDownsampleFactor = Number(
      this.temporal_downsample_factor ?? 0
    );
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 0);
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const matchInputNumFrames = Boolean(this.match_input_num_frames ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const numFrames = Number(this.num_frames ?? 81);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(
      this.negative_prompt ??
        "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const sampler = String(this.sampler ?? "unipc");
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const resolution = String(this.resolution ?? "auto");
    const returnFramesZip = Boolean(this.return_frames_zip ?? false);
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const syncMode = Boolean(this.sync_mode ?? false);
    const matchInputFramesPerSecond = Boolean(
      this.match_input_frames_per_second ?? false
    );
    const videoQuality = String(this.video_quality ?? "high");
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const enableAutoDownsample = Boolean(this.enable_auto_downsample ?? false);

    const args: Record<string, unknown> = {
      shift: shift,
      acceleration: acceleration,
      prompt: prompt,
      temporal_downsample_factor: temporalDownsampleFactor,
      num_interpolated_frames: numInterpolatedFrames,
      frames_per_second: framesPerSecond,
      match_input_num_frames: matchInputNumFrames,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      sampler: sampler,
      video_write_mode: videoWriteMode,
      resolution: resolution,
      return_frames_zip: returnFramesZip,
      aspect_ratio: aspectRatio,
      sync_mode: syncMode,
      match_input_frames_per_second: matchInputFramesPerSecond,
      video_quality: videoQuality,
      seed: seed,
      num_inference_steps: numInferenceSteps,
      enable_auto_downsample: enableAutoDownsample
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/editto", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class FlashvsrUpscaleVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.FlashvsrUpscaleVideo";
  static readonly title = "Flashvsr Upscale Video";
  static readonly description = `Flashvsr
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "video",
    default: "",
    description: "The input video to be upscaled"
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "regular",
    values: ["regular", "high", "full"],
    description:
      "Acceleration mode for VAE decoding. Options: regular (best quality), high (balanced), full (fastest). More accerleation means longer duration videos can be processed too."
  })
  declare acceleration: any;

  @prop({
    type: "int",
    default: 70,
    description:
      "Quality level for tile blending (0-100). Controls overlap between tiles to prevent grid artifacts. Higher values provide better quality with more overlap. Recommended: 70-85 for high-res videos, 50-70 for faster processing."
  })
  declare quality: any;

  @prop({
    type: "bool",
    default: true,
    description: "Color correction enabled."
  })
  declare color_fix: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the output video."
  })
  declare output_write_mode: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The format of the output video."
  })
  declare output_format: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned inline and not stored in history."
  })
  declare sync_mode: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Copy the original audio tracks into the upscaled video using FFmpeg when possible."
  })
  declare preserve_audio: any;

  @prop({
    type: "float",
    default: 2,
    description: "Upscaling factor to be used."
  })
  declare upscale_factor: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the output video."
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "",
    description: "The random seed used for the generation process."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const acceleration = String(this.acceleration ?? "regular");
    const quality = Number(this.quality ?? 70);
    const colorFix = Boolean(this.color_fix ?? true);
    const outputWriteMode = String(this.output_write_mode ?? "balanced");
    const outputFormat = String(this.output_format ?? "X264 (.mp4)");
    const syncMode = Boolean(this.sync_mode ?? false);
    const preserveAudio = Boolean(this.preserve_audio ?? false);
    const upscaleFactor = Number(this.upscale_factor ?? 2);
    const outputQuality = String(this.output_quality ?? "high");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      acceleration: acceleration,
      quality: quality,
      color_fix: colorFix,
      output_write_mode: outputWriteMode,
      output_format: outputFormat,
      sync_mode: syncMode,
      preserve_audio: preserveAudio,
      upscale_factor: upscaleFactor,
      output_quality: outputQuality,
      seed: seed
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flashvsr/upscale/video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WorkflowUtilitiesAutoSubtitle extends FalNode {
  static readonly nodeType = "fal.video_to_video.WorkflowUtilitiesAutoSubtitle";
  static readonly title = "Workflow Utilities Auto Subtitle";
  static readonly description = `Workflow Utilities
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    transcription: "str",
    subtitle_count: "int",
    transcription_metadata: "str",
    words: "str",
    video: "video"
  };

  @prop({
    type: "video",
    default: "",
    description: "URL of the video file to add automatic subtitles to"
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "bold",
    values: ["normal", "bold", "black"],
    description: "Font weight (TikTok style typically uses bold or black)"
  })
  declare font_weight: any;

  @prop({
    type: "int",
    default: 3,
    description: "Text stroke/outline width in pixels (0 for no stroke)"
  })
  declare stroke_width: any;

  @prop({
    type: "enum",
    default: "white",
    values: [
      "white",
      "black",
      "red",
      "green",
      "blue",
      "yellow",
      "orange",
      "purple",
      "pink",
      "brown",
      "gray",
      "cyan",
      "magenta"
    ],
    description: "Subtitle text color for non-active words"
  })
  declare font_color: any;

  @prop({
    type: "int",
    default: 100,
    description: "Font size for subtitles (TikTok style uses larger text)"
  })
  declare font_size: any;

  @prop({
    type: "int",
    default: 75,
    description:
      "Vertical offset in pixels (positive = move down, negative = move up)"
  })
  declare y_offset: any;

  @prop({
    type: "str",
    default: "en",
    description:
      "Language code for transcription (e.g., 'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ja', 'zh', 'ko') or 3-letter ISO code (e.g., 'eng', 'spa', 'fra')"
  })
  declare language: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Background opacity (0.0 = fully transparent, 1.0 = fully opaque)"
  })
  declare background_opacity: any;

  @prop({
    type: "enum",
    default: "black",
    values: [
      "black",
      "white",
      "red",
      "green",
      "blue",
      "yellow",
      "orange",
      "purple",
      "pink",
      "brown",
      "gray",
      "cyan",
      "magenta"
    ],
    description: "Text stroke/outline color"
  })
  declare stroke_color: any;

  @prop({
    type: "enum",
    default: "purple",
    values: [
      "white",
      "black",
      "red",
      "green",
      "blue",
      "yellow",
      "orange",
      "purple",
      "pink",
      "brown",
      "gray",
      "cyan",
      "magenta"
    ],
    description:
      "Color for the currently speaking word (karaoke-style highlight)"
  })
  declare highlight_color: any;

  @prop({
    type: "str",
    default: "Montserrat",
    description:
      "Any Google Font name from fonts.google.com (e.g., 'Montserrat', 'Poppins', 'BBH Sans Hegarty')"
  })
  declare font_name: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Enable animation effects for subtitles (bounce style entrance)"
  })
  declare enable_animation: any;

  @prop({
    type: "enum",
    default: "bottom",
    values: ["top", "center", "bottom"],
    description: "Vertical position of subtitles"
  })
  declare position: any;

  @prop({
    type: "int",
    default: 3,
    description:
      "Maximum number of words per subtitle segment. Use 1 for single-word display, 2-3 for short phrases, or 8-12 for full sentences."
  })
  declare words_per_subtitle: any;

  @prop({
    type: "enum",
    default: "none",
    values: [
      "black",
      "white",
      "red",
      "green",
      "blue",
      "yellow",
      "orange",
      "purple",
      "pink",
      "brown",
      "gray",
      "cyan",
      "magenta",
      "none",
      "transparent"
    ],
    description:
      "Background color behind text ('none' or 'transparent' for no background)"
  })
  declare background_color: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const fontWeight = String(this.font_weight ?? "bold");
    const strokeWidth = Number(this.stroke_width ?? 3);
    const fontColor = String(this.font_color ?? "white");
    const fontSize = Number(this.font_size ?? 100);
    const yOffset = Number(this.y_offset ?? 75);
    const language = String(this.language ?? "en");
    const backgroundOpacity = Number(this.background_opacity ?? 0);
    const strokeColor = String(this.stroke_color ?? "black");
    const highlightColor = String(this.highlight_color ?? "purple");
    const fontName = String(this.font_name ?? "Montserrat");
    const enableAnimation = Boolean(this.enable_animation ?? true);
    const position = String(this.position ?? "bottom");
    const wordsPerSubtitle = Number(this.words_per_subtitle ?? 3);
    const backgroundColor = String(this.background_color ?? "none");

    const args: Record<string, unknown> = {
      font_weight: fontWeight,
      stroke_width: strokeWidth,
      font_color: fontColor,
      font_size: fontSize,
      y_offset: yOffset,
      language: language,
      background_opacity: backgroundOpacity,
      stroke_color: strokeColor,
      highlight_color: highlightColor,
      font_name: fontName,
      enable_animation: enableAnimation,
      position: position,
      words_per_subtitle: wordsPerSubtitle,
      background_color: backgroundColor
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/workflow-utilities/auto-subtitle",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class BytedanceUpscalerUpscaleVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.BytedanceUpscalerUpscaleVideo";
  static readonly title = "Bytedance Upscaler Upscale Video";
  static readonly description = `Bytedance Upscaler
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { duration: "float", video: "video" };

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to upscale."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "30fps",
    values: ["30fps", "60fps"],
    description: "The target FPS of the video to upscale."
  })
  declare target_fps: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["1080p", "2k", "4k"],
    description: "The target resolution of the video to upscale."
  })
  declare target_resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const targetFps = String(this.target_fps ?? "30fps");
    const targetResolution = String(this.target_resolution ?? "1080p");

    const args: Record<string, unknown> = {
      target_fps: targetFps,
      target_resolution: targetResolution
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/bytedance-upscaler/upscale/video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class VideoAsPrompt extends FalNode {
  static readonly nodeType = "fal.video_to_video.VideoAsPrompt";
  static readonly title = "Video As Prompt";
  static readonly description = `Video As Prompt
video, editing, video-to-video, vid2vid, professional`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate an image from."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p", "580p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "video",
    default: "",
    description: "reference video to generate effect video from."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "9:16",
    values: ["16:9", "9:16"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "int",
    default: 16,
    description:
      "Frames per second for the output video. Only applicable if output_type is 'video'."
  })
  declare fps: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image to generate the effect video for."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "A brief description of the input video content."
  })
  declare video_description: any;

  @prop({
    type: "int",
    default: 49,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducible generation. If set none, a random seed will be used."
  })
  declare seed: any;

  @prop({
    type: "bool",
    default: true,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "float",
    default: 5,
    description: "Guidance scale for generation."
  })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "480p");
    const aspectRatio = String(this.aspect_ratio ?? "9:16");
    const fps = Number(this.fps ?? 16);
    const videoDescription = String(this.video_description ?? "");
    const numFrames = Number(this.num_frames ?? 49);
    const seed = String(this.seed ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const guidanceScale = Number(this.guidance_scale ?? 5);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      fps: fps,
      video_description: videoDescription,
      num_frames: numFrames,
      seed: seed,
      enable_safety_checker: enableSafetyChecker,
      guidance_scale: guidanceScale
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/video-as-prompt", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ViduQ2VideoExtensionPro extends FalNode {
  static readonly nodeType = "fal.video_to_video.ViduQ2VideoExtensionPro";
  static readonly title = "Vidu Q2 Video Extension Pro";
  static readonly description = `Vidu
video, editing, video-to-video, vid2vid, professional`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "text prompt to guide the video extension"
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "URL of the video to extend"
  })
  declare video: any;

  @prop({
    type: "enum",
    default: 4,
    values: [2, 3, 4, 5, 6, 7],
    description: "Duration of the extension in seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    description: "Output video resolution"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? 4);
    const resolution = String(this.resolution ?? "720p");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      resolution: resolution,
      seed: seed
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/vidu/q2/video-extension/pro",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MireloAiSfxV15VideoToVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.MireloAiSfxV15VideoToVideo";
  static readonly title = "Mirelo Ai Sfx V15 Video To Video";
  static readonly description = `Mirelo SFX V1.5
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "list[Video]" };

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
      "mirelo-ai/sfx-v1.5/video-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KreaWan14BVideoToVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.KreaWan14BVideoToVideo";
  static readonly title = "Krea Wan14 B Video To Video";
  static readonly description = `Krea Wan 14B
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Prompt for the video-to-video generation."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL of the input video. Currently, only outputs of 16:9 aspect ratio and 480p resolution are supported. Video duration should be less than 1000 frames at 16fps, and output frames will be 6 plus a multiple of 12, for example 18, 30, 42, etc."
  })
  declare video: any;

  @prop({
    type: "float",
    default: 0.85,
    description:
      "Denoising strength for the video-to-video generation. 0.0 preserves the original, 1.0 completely remakes the video."
  })
  declare strength: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description: "Seed for the video-to-video generation."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const strength = Number(this.strength ?? 0.85);
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      strength: strength,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/krea-wan-14b/video-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Sora2VideoToVideoRemix extends FalNode {
  static readonly nodeType = "fal.video_to_video.Sora2VideoToVideoRemix";
  static readonly title = "Sora2 Video To Video Remix";
  static readonly description = `Sora 2
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    thumbnail: "str",
    video_id: "str",
    spritesheet: "str",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description: "Updated text prompt that directs the remix generation"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The video_id from a previous Sora 2 generation. Note: You can only remix videos that were generated by Sora (via text-to-video or image-to-video endpoints), not arbitrary uploaded videos."
  })
  declare video_id: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to delete the video after generation for privacy reasons. If True, the video cannot be used for remixing and will be permanently deleted."
  })
  declare delete_video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const videoId = String(this.video_id ?? "");
    const deleteVideo = Boolean(this.delete_video ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      video_id: videoId,
      delete_video: deleteVideo
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/sora-2/video-to-video/remix",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanVaceAppsLongReframe extends FalNode {
  static readonly nodeType = "fal.video_to_video.WanVaceAppsLongReframe";
  static readonly title = "Wan Vace Apps Long Reframe";
  static readonly description = `Wan 2.1 VACE Long Reframe
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the source video file. This video will be used as a reference for the reframe task."
  })
  declare video: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Zoom factor for the video. When this value is greater than 0, the video will be zoomed in by this factor (in relation to the canvas size,) cutting off the edges of the video. A value of 0 means no zoom."
  })
  declare zoom_factor: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to paste back the reframed scene to the original video."
  })
  declare paste_back: any;

  @prop({
    type: "str",
    default: "regular",
    description:
      "Acceleration to use for inference. Options are 'none' or 'regular'. Accelerated inference will very slightly affect output, but will be significantly faster."
  })
  declare acceleration: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The text prompt to guide video generation. Optional for reframing."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 30,
    description:
      "Threshold for scene detection sensitivity (0-100). Lower values detect more scenes."
  })
  declare scene_threshold: any;

  @prop({
    type: "enum",
    default: "content_aware",
    values: ["content_aware", "white", "black"],
    description:
      "The transparency mode to apply to the first and last frames. This controls how the transparent areas of the first and last frames are filled."
  })
  declare transparency_mode: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "Guidance scale for classifier-free guidance. Higher values encourage the model to generate images closely related to the text prompt."
  })
  declare guidance_scale: any;

  @prop({
    type: "float",
    default: 6,
    description: "Minimum FPS for auto downsample."
  })
  declare auto_downsample_min_fps: any;

  @prop({
    type: "str",
    default:
      "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "unipc",
    values: ["unipc", "dpm++", "euler"],
    description: "Sampler to use for video generation."
  })
  declare sampler: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "1:1", "9:16"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, also return a ZIP file containing all generated frames."
  })
  declare return_frames_zip: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to trim borders from the video."
  })
  declare trim_borders: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "240p", "360p", "480p", "580p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "film",
    values: ["rife", "film"],
    description:
      "The model to use for frame interpolation. Options are 'rife' or 'film'."
  })
  declare interpolator_model: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable auto downsample."
  })
  declare enable_auto_downsample: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const shift = Number(this.shift ?? 5);
    const zoomFactor = Number(this.zoom_factor ?? 0);
    const pasteBack = Boolean(this.paste_back ?? true);
    const acceleration = String(this.acceleration ?? "regular");
    const prompt = String(this.prompt ?? "");
    const sceneThreshold = Number(this.scene_threshold ?? 30);
    const transparencyMode = String(this.transparency_mode ?? "content_aware");
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const autoDownsampleMinFps = Number(this.auto_downsample_min_fps ?? 6);
    const negativePrompt = String(
      this.negative_prompt ??
        "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const sampler = String(this.sampler ?? "unipc");
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const returnFramesZip = Boolean(this.return_frames_zip ?? false);
    const trimBorders = Boolean(this.trim_borders ?? true);
    const resolution = String(this.resolution ?? "auto");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const seed = String(this.seed ?? "");
    const interpolatorModel = String(this.interpolator_model ?? "film");
    const enableAutoDownsample = Boolean(this.enable_auto_downsample ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);

    const args: Record<string, unknown> = {
      shift: shift,
      zoom_factor: zoomFactor,
      paste_back: pasteBack,
      acceleration: acceleration,
      prompt: prompt,
      scene_threshold: sceneThreshold,
      transparency_mode: transparencyMode,
      guidance_scale: guidanceScale,
      auto_downsample_min_fps: autoDownsampleMinFps,
      negative_prompt: negativePrompt,
      sampler: sampler,
      video_write_mode: videoWriteMode,
      aspect_ratio: aspectRatio,
      return_frames_zip: returnFramesZip,
      trim_borders: trimBorders,
      resolution: resolution,
      enable_safety_checker: enableSafetyChecker,
      video_quality: videoQuality,
      sync_mode: syncMode,
      seed: seed,
      interpolator_model: interpolatorModel,
      enable_auto_downsample: enableAutoDownsample,
      num_inference_steps: numInferenceSteps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan-vace-apps/long-reframe",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class InfinitalkVideoToVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.InfinitalkVideoToVideo";
  static readonly title = "Infinitalk Video To Video";
  static readonly description = `Infinitalk
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({ type: "video", default: "", description: "URL of the input video." })
  declare video: any;

  @prop({
    type: "enum",
    default: "regular",
    values: ["none", "regular", "high"],
    description: "The acceleration level to use for generation."
  })
  declare acceleration: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p", "720p"],
    description:
      "Resolution of the video to generate. Must be either 480p or 720p."
  })
  declare resolution: any;

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the audio file."
  })
  declare audio: any;

  @prop({
    type: "int",
    default: 145,
    description:
      "Number of frames to generate. Must be between 81 to 129 (inclusive). If the number of frames is greater than 81, the video will be generated with 1.25x more billing units."
  })
  declare num_frames: any;

  @prop({
    type: "int",
    default: 42,
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const acceleration = String(this.acceleration ?? "regular");
    const resolution = String(this.resolution ?? "480p");
    const numFrames = Number(this.num_frames ?? 145);
    const seed = Number(this.seed ?? 42);

    const args: Record<string, unknown> = {
      prompt: prompt,
      acceleration: acceleration,
      resolution: resolution,
      num_frames: numFrames,
      seed: seed
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/infinitalk/video-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class SeedvrUpscaleVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.SeedvrUpscaleVideo";
  static readonly title = "Seedvr Upscale Video";
  static readonly description = `SeedVR2
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "video",
    default: "",
    description: "The input video to be processed"
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "factor",
    values: ["target", "factor"],
    description:
      "The mode to use for the upscale. If 'target', the upscale factor will be calculated based on the target resolution. If 'factor', the upscale factor will be used directly."
  })
  declare upscale_mode: any;

  @prop({
    type: "float",
    default: 0.1,
    description: "The noise scale to use for the generation process."
  })
  declare noise_scale: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The format of the output video."
  })
  declare output_format: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["720p", "1080p", "1440p", "2160p"],
    description:
      "The target resolution to upscale to when 'upscale_mode' is 'target'."
  })
  declare target_resolution: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the output video."
  })
  declare output_write_mode: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the output video."
  })
  declare output_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "float",
    default: 2,
    description:
      "Upscaling factor to be used. Will multiply the dimensions with this factor when 'upscale_mode' is 'factor'."
  })
  declare upscale_factor: any;

  @prop({
    type: "str",
    default: "",
    description: "The random seed used for the generation process."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const upscaleMode = String(this.upscale_mode ?? "factor");
    const noiseScale = Number(this.noise_scale ?? 0.1);
    const outputFormat = String(this.output_format ?? "X264 (.mp4)");
    const targetResolution = String(this.target_resolution ?? "1080p");
    const outputWriteMode = String(this.output_write_mode ?? "balanced");
    const outputQuality = String(this.output_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const upscaleFactor = Number(this.upscale_factor ?? 2);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      upscale_mode: upscaleMode,
      noise_scale: noiseScale,
      output_format: outputFormat,
      target_resolution: targetResolution,
      output_write_mode: outputWriteMode,
      output_quality: outputQuality,
      sync_mode: syncMode,
      upscale_factor: upscaleFactor,
      seed: seed
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/seedvr/upscale/video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanVaceAppsVideoEdit extends FalNode {
  static readonly nodeType = "fal.video_to_video.WanVaceAppsVideoEdit";
  static readonly title = "Wan Vace Apps Video Edit";
  static readonly description = `Wan VACE Video Edit
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { frames_zip: "str", video: "video" };

  @prop({ type: "str", default: "", description: "Prompt to edit the video." })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "240p", "360p", "480p", "580p", "720p"],
    description: "Resolution of the edited video."
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "regular",
    description:
      "Acceleration to use for inference. Options are 'none' or 'regular'. Accelerated inference will very slightly affect output, but will be significantly faster."
  })
  declare acceleration: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to include a ZIP archive containing all generated frames."
  })
  declare return_frames_zip: any;

  @prop({ type: "video", default: "", description: "URL of the input video." })
  declare video: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "9:16", "1:1"],
    description: "Aspect ratio of the edited video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "general", "human"],
    description:
      "The type of video you're editing. Use 'general' for most videos, and 'human' for videos emphasizing human subjects and motions. The default value 'auto' means the model will guess based on the first frame of the video."
  })
  declare video_type: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "URLs of the input images to use as a reference for the generation."
  })
  declare images: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to enable automatic downsampling. If your video has a high frame rate or is long, enabling longer sequences to be generated. The video will be interpolated back to the original frame rate after generation."
  })
  declare enable_auto_downsample: any;

  @prop({
    type: "float",
    default: 15,
    description: "The minimum frames per second to downsample the video to."
  })
  declare auto_downsample_min_fps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "auto");
    const acceleration = String(this.acceleration ?? "regular");
    const returnFramesZip = Boolean(this.return_frames_zip ?? false);
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const videoType = String(this.video_type ?? "auto");
    const enableAutoDownsample = Boolean(this.enable_auto_downsample ?? true);
    const autoDownsampleMinFps = Number(this.auto_downsample_min_fps ?? 15);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      acceleration: acceleration,
      return_frames_zip: returnFramesZip,
      aspect_ratio: aspectRatio,
      enable_safety_checker: enableSafetyChecker,
      video_type: videoType,
      enable_auto_downsample: enableAutoDownsample,
      auto_downsample_min_fps: autoDownsampleMinFps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imagesList = this.images as Record<string, unknown>[] | undefined;
    if (imagesList?.length) {
      const imagesUrls: string[] = [];
      for (const ref of imagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) imagesUrls.push(u);
        }
      }
      if (imagesUrls.length) args["image_urls"] = imagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan-vace-apps/video-edit",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV2214bAnimateReplace extends FalNode {
  static readonly nodeType = "fal.video_to_video.WanV2214bAnimateReplace";
  static readonly title = "Wan V2214b Animate Replace";
  static readonly description = `Wan-Animate Replace is a model that can integrate animated characters into reference videos, replacing the original character while preserving the scene's lighting and color tone for seamless environmental integration.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    frames_zip: "str",
    seed: "int",
    video: "video"
  };

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description:
      "The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p", "580p", "720p"],
    description: "Resolution of the generated video (480p, 580p, or 720p)."
  })
  declare resolution: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift value for the video. Must be between 1.0 and 10.0."
  })
  declare shift: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, also return a ZIP archive containing per-frame images generated on GPU (lossless)."
  })
  declare return_frames_zip: any;

  @prop({ type: "video", default: "", description: "URL of the input video." })
  declare video: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If set to true, output video will be checked for safety after generation."
  })
  declare enable_output_safety_checker: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description:
      "The quality of the output video. Higher quality means better visual quality but larger file size."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If set to true, input data will be checked for safety before processing."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: 20,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, applies quality enhancement for faster generation with improved quality. When enabled, parameters are automatically optimized for best results."
  })
  declare use_turbo: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality."
  })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const resolution = String(this.resolution ?? "480p");
    const shift = Number(this.shift ?? 5);
    const returnFramesZip = Boolean(this.return_frames_zip ?? false);
    const enableOutputSafetyChecker = Boolean(
      this.enable_output_safety_checker ?? false
    );
    const videoQuality = String(this.video_quality ?? "high");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const numInferenceSteps = Number(this.num_inference_steps ?? 20);
    const useTurbo = Boolean(this.use_turbo ?? false);
    const seed = String(this.seed ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 1);

    const args: Record<string, unknown> = {
      video_write_mode: videoWriteMode,
      resolution: resolution,
      shift: shift,
      return_frames_zip: returnFramesZip,
      enable_output_safety_checker: enableOutputSafetyChecker,
      video_quality: videoQuality,
      enable_safety_checker: enableSafetyChecker,
      num_inference_steps: numInferenceSteps,
      use_turbo: useTurbo,
      seed: seed,
      guidance_scale: guidanceScale
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan/v2.2-14b/animate/replace",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV2214bAnimateMove extends FalNode {
  static readonly nodeType = "fal.video_to_video.WanV2214bAnimateMove";
  static readonly title = "Wan V2214b Animate Move";
  static readonly description = `Wan-Animate is a video model that generates high-fidelity character videos by replicating the expressions and movements of characters from reference videos.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    frames_zip: "str",
    seed: "int",
    video: "video"
  };

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description:
      "The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p", "580p", "720p"],
    description: "Resolution of the generated video (480p, 580p, or 720p)."
  })
  declare resolution: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift value for the video. Must be between 1.0 and 10.0."
  })
  declare shift: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, also return a ZIP archive containing per-frame images generated on GPU (lossless)."
  })
  declare return_frames_zip: any;

  @prop({ type: "video", default: "", description: "URL of the input video." })
  declare video: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If set to true, output video will be checked for safety after generation."
  })
  declare enable_output_safety_checker: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description:
      "The quality of the output video. Higher quality means better visual quality but larger file size."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If set to true, input data will be checked for safety before processing."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: 20,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, applies quality enhancement for faster generation with improved quality. When enabled, parameters are automatically optimized for best results."
  })
  declare use_turbo: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality."
  })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const resolution = String(this.resolution ?? "480p");
    const shift = Number(this.shift ?? 5);
    const returnFramesZip = Boolean(this.return_frames_zip ?? false);
    const enableOutputSafetyChecker = Boolean(
      this.enable_output_safety_checker ?? false
    );
    const videoQuality = String(this.video_quality ?? "high");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const numInferenceSteps = Number(this.num_inference_steps ?? 20);
    const useTurbo = Boolean(this.use_turbo ?? false);
    const seed = String(this.seed ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 1);

    const args: Record<string, unknown> = {
      video_write_mode: videoWriteMode,
      resolution: resolution,
      shift: shift,
      return_frames_zip: returnFramesZip,
      enable_output_safety_checker: enableOutputSafetyChecker,
      video_quality: videoQuality,
      enable_safety_checker: enableSafetyChecker,
      num_inference_steps: numInferenceSteps,
      use_turbo: useTurbo,
      seed: seed,
      guidance_scale: guidanceScale
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan/v2.2-14b/animate/move",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class DecartLucyEditPro extends FalNode {
  static readonly nodeType = "fal.video_to_video.DecartLucyEditPro";
  static readonly title = "Decart Lucy Edit Pro";
  static readonly description = `Edit outfits, objects, faces, or restyle your video - all with maximum detail retention.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "bool",
    default: true,
    description:
      "\n            If set to true, the function will wait for the video to be generated\n            and uploaded before returning the response. This will increase the\n            latency of the function but it allows you to get the video directly\n            in the response without going through the CDN.\n        "
  })
  declare sync_mode: any;

  @prop({ type: "video", default: "", description: "URL of the video to edit" })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description: "Text description of the desired video content"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p"],
    description: "Resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enhance the prompt for better results."
  })
  declare enhance_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const syncMode = Boolean(this.sync_mode ?? true);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const enhancePrompt = Boolean(this.enhance_prompt ?? true);

    const args: Record<string, unknown> = {
      sync_mode: syncMode,
      prompt: prompt,
      resolution: resolution,
      enhance_prompt: enhancePrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "decart/lucy-edit/pro", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class DecartLucyEditDev extends FalNode {
  static readonly nodeType = "fal.video_to_video.DecartLucyEditDev";
  static readonly title = "Decart Lucy Edit Dev";
  static readonly description = `Edit outfits, objects, faces, or restyle your video - all with maximum detail retention.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "bool",
    default: true,
    description:
      "\n            If set to true, the function will wait for the video to be generated\n            and uploaded before returning the response. This will increase the\n            latency of the function but it allows you to get the video directly\n            in the response without going through the CDN.\n        "
  })
  declare sync_mode: any;

  @prop({ type: "video", default: "", description: "URL of the video to edit" })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description: "Text description of the desired video content"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enhance the prompt for better results."
  })
  declare enhance_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const syncMode = Boolean(this.sync_mode ?? true);
    const prompt = String(this.prompt ?? "");
    const enhancePrompt = Boolean(this.enhance_prompt ?? true);

    const args: Record<string, unknown> = {
      sync_mode: syncMode,
      prompt: prompt,
      enhance_prompt: enhancePrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "decart/lucy-edit/dev", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Wan22VaceFunA14bReframe extends FalNode {
  static readonly nodeType = "fal.video_to_video.Wan22VaceFunA14bReframe";
  static readonly title = "Wan22 Vace Fun A14b Reframe";
  static readonly description = `VACE Fun for Wan 2.2 A14B from Alibaba-PAI
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    frames_zip: "str",
    seed: "int",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "The text prompt to guide video generation. Optional for reframing."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the source video file. This video will be used as a reference for the reframe task."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Number of frames to interpolate between the original frames. A value of 0 means no interpolation."
  })
  declare num_interpolated_frames: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Temporal downsample factor for the video. This is an integer value that determines how many frames to skip in the video. A value of 0 means no downsampling. For each downsample factor, one upsample factor will automatically be applied."
  })
  declare temporal_downsample_factor: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the first frame of the video. If provided, the model will use this frame as a reference."
  })
  declare first_frame_url: any;

  @prop({
    type: "enum",
    default: "content_aware",
    values: ["content_aware", "white", "black"],
    description:
      "The transparency mode to apply to the first and last frames. This controls how the transparent areas of the first and last frames are filled."
  })
  declare transparency_mode: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Number of frames to generate. Must be between 81 to 241 (inclusive)."
  })
  declare num_frames: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to trim borders from the video."
  })
  declare trim_borders: any;

  @prop({
    type: "float",
    default: 15,
    description:
      "The minimum frames per second to downsample the video to. This is used to help determine the auto downsample factor to try and find the lowest detail-preserving downsample factor. The default value is appropriate for most videos, if you are using a video with very fast motion, you may need to increase this value. If your video has a very low amount of motion, you could decrease this value to allow for higher downsampling and thus longer sequences."
  })
  declare auto_downsample_min_fps: any;

  @prop({
    type: "enum",
    default: "unipc",
    values: ["unipc", "dpm++", "euler"],
    description: "Sampler to use for video generation."
  })
  declare sampler: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "Guidance scale for classifier-free guidance. Higher values encourage the model to generate images closely related to the text prompt."
  })
  declare guidance_scale: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "film",
    values: ["rife", "film"],
    description:
      "The model to use for frame interpolation. Options are 'rife' or 'film'."
  })
  declare interpolator_model: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the model will automatically temporally downsample the video to an appropriate frame length for the model, then will interpolate it back to the original frame length."
  })
  declare enable_auto_downsample: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "str",
    default: "regular",
    description:
      "Acceleration to use for inference. Options are 'none' or 'regular'. Accelerated inference will very slightly affect output, but will be significantly faster."
  })
  declare acceleration: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Zoom factor for the video. When this value is greater than 0, the video will be zoomed in by this factor (in relation to the canvas size,) cutting off the edges of the video. A value of 0 means no zoom."
  })
  declare zoom_factor: any;

  @prop({
    type: "str",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 5 to 30. Ignored if match_input_frames_per_second is true."
  })
  declare frames_per_second: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "If true, the number of frames in the generated video will match the number of frames in the input video. If false, the number of frames will be determined by the num_frames parameter."
  })
  declare match_input_num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default:
      "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, also return a ZIP file containing all generated frames."
  })
  declare return_frames_zip: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "1:1", "9:16"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "240p", "360p", "480p", "580p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "If true, the frames per second of the generated video will match the input video. If false, the frames per second will be determined by the frames_per_second parameter."
  })
  declare match_input_frames_per_second: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the last frame of the video. If provided, the model will use this frame as a reference."
  })
  declare last_frame_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 0);
    const temporalDownsampleFactor = Number(
      this.temporal_downsample_factor ?? 0
    );
    const transparencyMode = String(this.transparency_mode ?? "content_aware");
    const numFrames = Number(this.num_frames ?? 81);
    const trimBorders = Boolean(this.trim_borders ?? true);
    const autoDownsampleMinFps = Number(this.auto_downsample_min_fps ?? 15);
    const sampler = String(this.sampler ?? "unipc");
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const syncMode = Boolean(this.sync_mode ?? false);
    const videoQuality = String(this.video_quality ?? "high");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const seed = String(this.seed ?? "");
    const interpolatorModel = String(this.interpolator_model ?? "film");
    const enableAutoDownsample = Boolean(this.enable_auto_downsample ?? false);
    const shift = Number(this.shift ?? 5);
    const acceleration = String(this.acceleration ?? "regular");
    const zoomFactor = Number(this.zoom_factor ?? 0);
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const matchInputNumFrames = Boolean(this.match_input_num_frames ?? true);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(
      this.negative_prompt ??
        "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const returnFramesZip = Boolean(this.return_frames_zip ?? false);
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "auto");
    const matchInputFramesPerSecond = Boolean(
      this.match_input_frames_per_second ?? true
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_interpolated_frames: numInterpolatedFrames,
      temporal_downsample_factor: temporalDownsampleFactor,
      transparency_mode: transparencyMode,
      num_frames: numFrames,
      trim_borders: trimBorders,
      auto_downsample_min_fps: autoDownsampleMinFps,
      sampler: sampler,
      guidance_scale: guidanceScale,
      sync_mode: syncMode,
      video_quality: videoQuality,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      interpolator_model: interpolatorModel,
      enable_auto_downsample: enableAutoDownsample,
      shift: shift,
      acceleration: acceleration,
      zoom_factor: zoomFactor,
      frames_per_second: framesPerSecond,
      match_input_num_frames: matchInputNumFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      return_frames_zip: returnFramesZip,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      match_input_frames_per_second: matchInputFramesPerSecond,
      num_inference_steps: numInferenceSteps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const firstFrameUrlRef = this.first_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameUrlRef)) {
      const firstFrameUrlUrl = await assetToFalUrl(apiKey, firstFrameUrlRef!);
      if (firstFrameUrlUrl) args["first_frame_url"] = firstFrameUrlUrl;
    }

    const lastFrameUrlRef = this.last_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameUrlRef)) {
      const lastFrameUrlUrl = await assetToFalUrl(apiKey, lastFrameUrlRef!);
      if (lastFrameUrlUrl) args["last_frame_url"] = lastFrameUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan-22-vace-fun-a14b/reframe",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Wan22VaceFunA14bOutpainting extends FalNode {
  static readonly nodeType = "fal.video_to_video.Wan22VaceFunA14bOutpainting";
  static readonly title = "Wan22 Vace Fun A14b Outpainting";
  static readonly description = `VACE Fun for Wan 2.2 A14B from Alibaba-PAI
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    frames_zip: "str",
    seed: "int",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "URL to the source video file. Required for outpainting."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Number of frames to interpolate between the original frames. A value of 0 means no interpolation."
  })
  declare num_interpolated_frames: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Temporal downsample factor for the video. This is an integer value that determines how many frames to skip in the video. A value of 0 means no downsampling. For each downsample factor, one upsample factor will automatically be applied."
  })
  declare temporal_downsample_factor: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the first frame of the video. If provided, the model will use this frame as a reference."
  })
  declare first_frame_url: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "URLs to source reference image. If provided, the model will use this image as reference."
  })
  declare ref_images: any;

  @prop({
    type: "float",
    default: 0.25,
    description:
      "Amount of expansion. This is a float value between 0 and 1, where 0.25 adds 25% to the original video size on the specified sides."
  })
  declare expand_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to expand the video to the bottom."
  })
  declare expand_bottom: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Number of frames to generate. Must be between 81 to 241 (inclusive)."
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 15,
    description:
      "The minimum frames per second to downsample the video to. This is used to help determine the auto downsample factor to try and find the lowest detail-preserving downsample factor. The default value is appropriate for most videos, if you are using a video with very fast motion, you may need to increase this value. If your video has a very low amount of motion, you could decrease this value to allow for higher downsampling and thus longer sequences."
  })
  declare auto_downsample_min_fps: any;

  @prop({
    type: "enum",
    default: "content_aware",
    values: ["content_aware", "white", "black"],
    description:
      "The transparency mode to apply to the first and last frames. This controls how the transparent areas of the first and last frames are filled."
  })
  declare transparency_mode: any;

  @prop({
    type: "enum",
    default: "unipc",
    values: ["unipc", "dpm++", "euler"],
    description: "Sampler to use for video generation."
  })
  declare sampler: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "Guidance scale for classifier-free guidance. Higher values encourage the model to generate images closely related to the text prompt."
  })
  declare guidance_scale: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "film",
    values: ["rife", "film"],
    description:
      "The model to use for frame interpolation. Options are 'rife' or 'film'."
  })
  declare interpolator_model: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the model will automatically temporally downsample the video to an appropriate frame length for the model, then will interpolate it back to the original frame length."
  })
  declare enable_auto_downsample: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to expand the video to the top."
  })
  declare expand_top: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to expand the video to the left."
  })
  declare expand_left: any;

  @prop({
    type: "str",
    default: "regular",
    description:
      "Acceleration to use for inference. Options are 'none' or 'regular'. Accelerated inference will very slightly affect output, but will be significantly faster."
  })
  declare acceleration: any;

  @prop({
    type: "str",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 5 to 30. Ignored if match_input_frames_per_second is true."
  })
  declare frames_per_second: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the number of frames in the generated video will match the number of frames in the input video. If false, the number of frames will be determined by the num_frames parameter."
  })
  declare match_input_num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default:
      "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, also return a ZIP file containing all generated frames."
  })
  declare return_frames_zip: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "1:1", "9:16"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to expand the video to the right."
  })
  declare expand_right: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "240p", "360p", "480p", "580p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the frames per second of the generated video will match the input video. If false, the frames per second will be determined by the frames_per_second parameter."
  })
  declare match_input_frames_per_second: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the last frame of the video. If provided, the model will use this frame as a reference."
  })
  declare last_frame_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 0);
    const temporalDownsampleFactor = Number(
      this.temporal_downsample_factor ?? 0
    );
    const expandRatio = Number(this.expand_ratio ?? 0.25);
    const expandBottom = Boolean(this.expand_bottom ?? false);
    const numFrames = Number(this.num_frames ?? 81);
    const autoDownsampleMinFps = Number(this.auto_downsample_min_fps ?? 15);
    const transparencyMode = String(this.transparency_mode ?? "content_aware");
    const sampler = String(this.sampler ?? "unipc");
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const syncMode = Boolean(this.sync_mode ?? false);
    const videoQuality = String(this.video_quality ?? "high");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const seed = String(this.seed ?? "");
    const interpolatorModel = String(this.interpolator_model ?? "film");
    const enableAutoDownsample = Boolean(this.enable_auto_downsample ?? false);
    const expandTop = Boolean(this.expand_top ?? false);
    const shift = Number(this.shift ?? 5);
    const expandLeft = Boolean(this.expand_left ?? false);
    const acceleration = String(this.acceleration ?? "regular");
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const matchInputNumFrames = Boolean(this.match_input_num_frames ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(
      this.negative_prompt ??
        "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const returnFramesZip = Boolean(this.return_frames_zip ?? false);
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const expandRight = Boolean(this.expand_right ?? false);
    const resolution = String(this.resolution ?? "auto");
    const matchInputFramesPerSecond = Boolean(
      this.match_input_frames_per_second ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_interpolated_frames: numInterpolatedFrames,
      temporal_downsample_factor: temporalDownsampleFactor,
      expand_ratio: expandRatio,
      expand_bottom: expandBottom,
      num_frames: numFrames,
      auto_downsample_min_fps: autoDownsampleMinFps,
      transparency_mode: transparencyMode,
      sampler: sampler,
      guidance_scale: guidanceScale,
      sync_mode: syncMode,
      video_quality: videoQuality,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      interpolator_model: interpolatorModel,
      enable_auto_downsample: enableAutoDownsample,
      expand_top: expandTop,
      shift: shift,
      expand_left: expandLeft,
      acceleration: acceleration,
      frames_per_second: framesPerSecond,
      match_input_num_frames: matchInputNumFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      return_frames_zip: returnFramesZip,
      aspect_ratio: aspectRatio,
      expand_right: expandRight,
      resolution: resolution,
      match_input_frames_per_second: matchInputFramesPerSecond,
      num_inference_steps: numInferenceSteps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const firstFrameUrlRef = this.first_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameUrlRef)) {
      const firstFrameUrlUrl = await assetToFalUrl(apiKey, firstFrameUrlRef!);
      if (firstFrameUrlUrl) args["first_frame_url"] = firstFrameUrlUrl;
    }

    const refImagesList = this.ref_images as
      | Record<string, unknown>[]
      | undefined;
    if (refImagesList?.length) {
      const refImagesUrls: string[] = [];
      for (const ref of refImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) refImagesUrls.push(u);
        }
      }
      if (refImagesUrls.length) args["ref_image_urls"] = refImagesUrls;
    }

    const lastFrameUrlRef = this.last_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameUrlRef)) {
      const lastFrameUrlUrl = await assetToFalUrl(apiKey, lastFrameUrlRef!);
      if (lastFrameUrlUrl) args["last_frame_url"] = lastFrameUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan-22-vace-fun-a14b/outpainting",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Wan22VaceFunA14bInpainting extends FalNode {
  static readonly nodeType = "fal.video_to_video.Wan22VaceFunA14bInpainting";
  static readonly title = "Wan22 Vace Fun A14b Inpainting";
  static readonly description = `VACE Fun for Wan 2.2 A14B from Alibaba-PAI
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    frames_zip: "str",
    seed: "int",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "URL to the source video file. Required for inpainting."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Number of frames to interpolate between the original frames. A value of 0 means no interpolation."
  })
  declare num_interpolated_frames: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Temporal downsample factor for the video. This is an integer value that determines how many frames to skip in the video. A value of 0 means no downsampling. For each downsample factor, one upsample factor will automatically be applied."
  })
  declare temporal_downsample_factor: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the first frame of the video. If provided, the model will use this frame as a reference."
  })
  declare first_frame_url: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "Urls to source reference image. If provided, the model will use this image as reference."
  })
  declare ref_images: any;

  @prop({
    type: "enum",
    default: "content_aware",
    values: ["content_aware", "white", "black"],
    description:
      "The transparency mode to apply to the first and last frames. This controls how the transparent areas of the first and last frames are filled."
  })
  declare transparency_mode: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Number of frames to generate. Must be between 81 to 241 (inclusive)."
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 15,
    description:
      "The minimum frames per second to downsample the video to. This is used to help determine the auto downsample factor to try and find the lowest detail-preserving downsample factor. The default value is appropriate for most videos, if you are using a video with very fast motion, you may need to increase this value. If your video has a very low amount of motion, you could decrease this value to allow for higher downsampling and thus longer sequences."
  })
  declare auto_downsample_min_fps: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "Guidance scale for classifier-free guidance. Higher values encourage the model to generate images closely related to the text prompt."
  })
  declare guidance_scale: any;

  @prop({
    type: "enum",
    default: "unipc",
    values: ["unipc", "dpm++", "euler"],
    description: "Sampler to use for video generation."
  })
  declare sampler: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "film",
    values: ["rife", "film"],
    description:
      "The model to use for frame interpolation. Options are 'rife' or 'film'."
  })
  declare interpolator_model: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to preprocess the input video."
  })
  declare preprocess: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the model will automatically temporally downsample the video to an appropriate frame length for the model, then will interpolate it back to the original frame length."
  })
  declare enable_auto_downsample: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "video",
    default: "",
    description: "URL to the source mask file. Required for inpainting."
  })
  declare mask_video: any;

  @prop({
    type: "str",
    default: "regular",
    description:
      "Acceleration to use for inference. Options are 'none' or 'regular'. Accelerated inference will very slightly affect output, but will be significantly faster."
  })
  declare acceleration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL to the guiding mask file. If provided, the model will use this mask as a reference to create masked video using salient mask tracking. Will be ignored if mask_video_url is provided."
  })
  declare mask_image: any;

  @prop({
    type: "str",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 5 to 30. Ignored if match_input_frames_per_second is true."
  })
  declare frames_per_second: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the number of frames in the generated video will match the number of frames in the input video. If false, the number of frames will be determined by the num_frames parameter."
  })
  declare match_input_num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default:
      "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, also return a ZIP file containing all generated frames."
  })
  declare return_frames_zip: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "1:1", "9:16"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "240p", "360p", "480p", "580p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the frames per second of the generated video will match the input video. If false, the frames per second will be determined by the frames_per_second parameter."
  })
  declare match_input_frames_per_second: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the last frame of the video. If provided, the model will use this frame as a reference."
  })
  declare last_frame_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 0);
    const temporalDownsampleFactor = Number(
      this.temporal_downsample_factor ?? 0
    );
    const transparencyMode = String(this.transparency_mode ?? "content_aware");
    const numFrames = Number(this.num_frames ?? 81);
    const autoDownsampleMinFps = Number(this.auto_downsample_min_fps ?? 15);
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const sampler = String(this.sampler ?? "unipc");
    const syncMode = Boolean(this.sync_mode ?? false);
    const videoQuality = String(this.video_quality ?? "high");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const seed = String(this.seed ?? "");
    const interpolatorModel = String(this.interpolator_model ?? "film");
    const preprocess = Boolean(this.preprocess ?? false);
    const enableAutoDownsample = Boolean(this.enable_auto_downsample ?? false);
    const shift = Number(this.shift ?? 5);
    const acceleration = String(this.acceleration ?? "regular");
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const matchInputNumFrames = Boolean(this.match_input_num_frames ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(
      this.negative_prompt ??
        "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const returnFramesZip = Boolean(this.return_frames_zip ?? false);
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "auto");
    const matchInputFramesPerSecond = Boolean(
      this.match_input_frames_per_second ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_interpolated_frames: numInterpolatedFrames,
      temporal_downsample_factor: temporalDownsampleFactor,
      transparency_mode: transparencyMode,
      num_frames: numFrames,
      auto_downsample_min_fps: autoDownsampleMinFps,
      guidance_scale: guidanceScale,
      sampler: sampler,
      sync_mode: syncMode,
      video_quality: videoQuality,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      interpolator_model: interpolatorModel,
      preprocess: preprocess,
      enable_auto_downsample: enableAutoDownsample,
      shift: shift,
      acceleration: acceleration,
      frames_per_second: framesPerSecond,
      match_input_num_frames: matchInputNumFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      return_frames_zip: returnFramesZip,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      match_input_frames_per_second: matchInputFramesPerSecond,
      num_inference_steps: numInferenceSteps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const firstFrameUrlRef = this.first_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameUrlRef)) {
      const firstFrameUrlUrl = await assetToFalUrl(apiKey, firstFrameUrlRef!);
      if (firstFrameUrlUrl) args["first_frame_url"] = firstFrameUrlUrl;
    }

    const refImagesList = this.ref_images as
      | Record<string, unknown>[]
      | undefined;
    if (refImagesList?.length) {
      const refImagesUrls: string[] = [];
      for (const ref of refImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) refImagesUrls.push(u);
        }
      }
      if (refImagesUrls.length) args["ref_image_urls"] = refImagesUrls;
    }

    const maskVideoRef = this.mask_video as Record<string, unknown> | undefined;
    if (isRefSet(maskVideoRef)) {
      const maskVideoUrl = await assetToFalUrl(apiKey, maskVideoRef!);
      if (maskVideoUrl) args["mask_video_url"] = maskVideoUrl;
    }

    const maskImageRef = this.mask_image as Record<string, unknown> | undefined;
    if (isRefSet(maskImageRef)) {
      const maskImageUrl =
        (await imageToDataUrl(maskImageRef!)) ??
        (await assetToFalUrl(apiKey, maskImageRef!));
      if (maskImageUrl) args["mask_image_url"] = maskImageUrl;
    }

    const lastFrameUrlRef = this.last_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameUrlRef)) {
      const lastFrameUrlUrl = await assetToFalUrl(apiKey, lastFrameUrlRef!);
      if (lastFrameUrlUrl) args["last_frame_url"] = lastFrameUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan-22-vace-fun-a14b/inpainting",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Wan22VaceFunA14bDepth extends FalNode {
  static readonly nodeType = "fal.video_to_video.Wan22VaceFunA14bDepth";
  static readonly title = "Wan22 Vace Fun A14b Depth";
  static readonly description = `VACE Fun for Wan 2.2 A14B from Alibaba-PAI
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    frames_zip: "str",
    seed: "int",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "URL to the source video file. Required for depth task."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Number of frames to interpolate between the original frames. A value of 0 means no interpolation."
  })
  declare num_interpolated_frames: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Temporal downsample factor for the video. This is an integer value that determines how many frames to skip in the video. A value of 0 means no downsampling. For each downsample factor, one upsample factor will automatically be applied."
  })
  declare temporal_downsample_factor: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the first frame of the video. If provided, the model will use this frame as a reference."
  })
  declare first_frame_url: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "URLs to source reference image. If provided, the model will use this image as reference."
  })
  declare ref_images: any;

  @prop({
    type: "enum",
    default: "content_aware",
    values: ["content_aware", "white", "black"],
    description:
      "The transparency mode to apply to the first and last frames. This controls how the transparent areas of the first and last frames are filled."
  })
  declare transparency_mode: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Number of frames to generate. Must be between 81 to 241 (inclusive)."
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 15,
    description:
      "The minimum frames per second to downsample the video to. This is used to help determine the auto downsample factor to try and find the lowest detail-preserving downsample factor. The default value is appropriate for most videos, if you are using a video with very fast motion, you may need to increase this value. If your video has a very low amount of motion, you could decrease this value to allow for higher downsampling and thus longer sequences."
  })
  declare auto_downsample_min_fps: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "Guidance scale for classifier-free guidance. Higher values encourage the model to generate images closely related to the text prompt."
  })
  declare guidance_scale: any;

  @prop({
    type: "enum",
    default: "unipc",
    values: ["unipc", "dpm++", "euler"],
    description: "Sampler to use for video generation."
  })
  declare sampler: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "film",
    values: ["rife", "film"],
    description:
      "The model to use for frame interpolation. Options are 'rife' or 'film'."
  })
  declare interpolator_model: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to preprocess the input video."
  })
  declare preprocess: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the model will automatically temporally downsample the video to an appropriate frame length for the model, then will interpolate it back to the original frame length."
  })
  declare enable_auto_downsample: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "str",
    default: "regular",
    description:
      "Acceleration to use for inference. Options are 'none' or 'regular'. Accelerated inference will very slightly affect output, but will be significantly faster."
  })
  declare acceleration: any;

  @prop({
    type: "str",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 5 to 30. Ignored if match_input_frames_per_second is true."
  })
  declare frames_per_second: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the number of frames in the generated video will match the number of frames in the input video. If false, the number of frames will be determined by the num_frames parameter."
  })
  declare match_input_num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default:
      "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, also return a ZIP file containing all generated frames."
  })
  declare return_frames_zip: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "1:1", "9:16"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "240p", "360p", "480p", "580p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the frames per second of the generated video will match the input video. If false, the frames per second will be determined by the frames_per_second parameter."
  })
  declare match_input_frames_per_second: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the last frame of the video. If provided, the model will use this frame as a reference."
  })
  declare last_frame_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 0);
    const temporalDownsampleFactor = Number(
      this.temporal_downsample_factor ?? 0
    );
    const transparencyMode = String(this.transparency_mode ?? "content_aware");
    const numFrames = Number(this.num_frames ?? 81);
    const autoDownsampleMinFps = Number(this.auto_downsample_min_fps ?? 15);
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const sampler = String(this.sampler ?? "unipc");
    const syncMode = Boolean(this.sync_mode ?? false);
    const videoQuality = String(this.video_quality ?? "high");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const seed = String(this.seed ?? "");
    const interpolatorModel = String(this.interpolator_model ?? "film");
    const preprocess = Boolean(this.preprocess ?? false);
    const enableAutoDownsample = Boolean(this.enable_auto_downsample ?? false);
    const shift = Number(this.shift ?? 5);
    const acceleration = String(this.acceleration ?? "regular");
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const matchInputNumFrames = Boolean(this.match_input_num_frames ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(
      this.negative_prompt ??
        "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const returnFramesZip = Boolean(this.return_frames_zip ?? false);
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "auto");
    const matchInputFramesPerSecond = Boolean(
      this.match_input_frames_per_second ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_interpolated_frames: numInterpolatedFrames,
      temporal_downsample_factor: temporalDownsampleFactor,
      transparency_mode: transparencyMode,
      num_frames: numFrames,
      auto_downsample_min_fps: autoDownsampleMinFps,
      guidance_scale: guidanceScale,
      sampler: sampler,
      sync_mode: syncMode,
      video_quality: videoQuality,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      interpolator_model: interpolatorModel,
      preprocess: preprocess,
      enable_auto_downsample: enableAutoDownsample,
      shift: shift,
      acceleration: acceleration,
      frames_per_second: framesPerSecond,
      match_input_num_frames: matchInputNumFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      return_frames_zip: returnFramesZip,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      match_input_frames_per_second: matchInputFramesPerSecond,
      num_inference_steps: numInferenceSteps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const firstFrameUrlRef = this.first_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameUrlRef)) {
      const firstFrameUrlUrl = await assetToFalUrl(apiKey, firstFrameUrlRef!);
      if (firstFrameUrlUrl) args["first_frame_url"] = firstFrameUrlUrl;
    }

    const refImagesList = this.ref_images as
      | Record<string, unknown>[]
      | undefined;
    if (refImagesList?.length) {
      const refImagesUrls: string[] = [];
      for (const ref of refImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) refImagesUrls.push(u);
        }
      }
      if (refImagesUrls.length) args["ref_image_urls"] = refImagesUrls;
    }

    const lastFrameUrlRef = this.last_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameUrlRef)) {
      const lastFrameUrlUrl = await assetToFalUrl(apiKey, lastFrameUrlRef!);
      if (lastFrameUrlUrl) args["last_frame_url"] = lastFrameUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan-22-vace-fun-a14b/depth",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Wan22VaceFunA14bPose extends FalNode {
  static readonly nodeType = "fal.video_to_video.Wan22VaceFunA14bPose";
  static readonly title = "Wan22 Vace Fun A14b Pose";
  static readonly description = `VACE Fun for Wan 2.2 A14B from Alibaba-PAI
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    frames_zip: "str",
    seed: "int",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "The text prompt to guide video generation. For pose task, the prompt should describe the desired pose and action of the subject in the video."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "URL to the source video file. Required for pose task."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Number of frames to interpolate between the original frames. A value of 0 means no interpolation."
  })
  declare num_interpolated_frames: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Temporal downsample factor for the video. This is an integer value that determines how many frames to skip in the video. A value of 0 means no downsampling. For each downsample factor, one upsample factor will automatically be applied."
  })
  declare temporal_downsample_factor: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the first frame of the video. If provided, the model will use this frame as a reference."
  })
  declare first_frame_url: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "URLs to source reference image. If provided, the model will use this image as reference."
  })
  declare ref_images: any;

  @prop({
    type: "enum",
    default: "content_aware",
    values: ["content_aware", "white", "black"],
    description:
      "The transparency mode to apply to the first and last frames. This controls how the transparent areas of the first and last frames are filled."
  })
  declare transparency_mode: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Number of frames to generate. Must be between 81 to 241 (inclusive)."
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 15,
    description:
      "The minimum frames per second to downsample the video to. This is used to help determine the auto downsample factor to try and find the lowest detail-preserving downsample factor. The default value is appropriate for most videos, if you are using a video with very fast motion, you may need to increase this value. If your video has a very low amount of motion, you could decrease this value to allow for higher downsampling and thus longer sequences."
  })
  declare auto_downsample_min_fps: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "Guidance scale for classifier-free guidance. Higher values encourage the model to generate images closely related to the text prompt."
  })
  declare guidance_scale: any;

  @prop({
    type: "enum",
    default: "unipc",
    values: ["unipc", "dpm++", "euler"],
    description: "Sampler to use for video generation."
  })
  declare sampler: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "film",
    values: ["rife", "film"],
    description:
      "The model to use for frame interpolation. Options are 'rife' or 'film'."
  })
  declare interpolator_model: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to preprocess the input video."
  })
  declare preprocess: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the model will automatically temporally downsample the video to an appropriate frame length for the model, then will interpolate it back to the original frame length."
  })
  declare enable_auto_downsample: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "str",
    default: "regular",
    description:
      "Acceleration to use for inference. Options are 'none' or 'regular'. Accelerated inference will very slightly affect output, but will be significantly faster."
  })
  declare acceleration: any;

  @prop({
    type: "str",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 5 to 30. Ignored if match_input_frames_per_second is true."
  })
  declare frames_per_second: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the number of frames in the generated video will match the number of frames in the input video. If false, the number of frames will be determined by the num_frames parameter."
  })
  declare match_input_num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default:
      "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, also return a ZIP file containing all generated frames."
  })
  declare return_frames_zip: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "1:1", "9:16"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "240p", "360p", "480p", "580p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the frames per second of the generated video will match the input video. If false, the frames per second will be determined by the frames_per_second parameter."
  })
  declare match_input_frames_per_second: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the last frame of the video. If provided, the model will use this frame as a reference."
  })
  declare last_frame_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 0);
    const temporalDownsampleFactor = Number(
      this.temporal_downsample_factor ?? 0
    );
    const transparencyMode = String(this.transparency_mode ?? "content_aware");
    const numFrames = Number(this.num_frames ?? 81);
    const autoDownsampleMinFps = Number(this.auto_downsample_min_fps ?? 15);
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const sampler = String(this.sampler ?? "unipc");
    const syncMode = Boolean(this.sync_mode ?? false);
    const videoQuality = String(this.video_quality ?? "high");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const seed = String(this.seed ?? "");
    const interpolatorModel = String(this.interpolator_model ?? "film");
    const preprocess = Boolean(this.preprocess ?? false);
    const enableAutoDownsample = Boolean(this.enable_auto_downsample ?? false);
    const shift = Number(this.shift ?? 5);
    const acceleration = String(this.acceleration ?? "regular");
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const matchInputNumFrames = Boolean(this.match_input_num_frames ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(
      this.negative_prompt ??
        "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const returnFramesZip = Boolean(this.return_frames_zip ?? false);
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "auto");
    const matchInputFramesPerSecond = Boolean(
      this.match_input_frames_per_second ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_interpolated_frames: numInterpolatedFrames,
      temporal_downsample_factor: temporalDownsampleFactor,
      transparency_mode: transparencyMode,
      num_frames: numFrames,
      auto_downsample_min_fps: autoDownsampleMinFps,
      guidance_scale: guidanceScale,
      sampler: sampler,
      sync_mode: syncMode,
      video_quality: videoQuality,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      interpolator_model: interpolatorModel,
      preprocess: preprocess,
      enable_auto_downsample: enableAutoDownsample,
      shift: shift,
      acceleration: acceleration,
      frames_per_second: framesPerSecond,
      match_input_num_frames: matchInputNumFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      return_frames_zip: returnFramesZip,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      match_input_frames_per_second: matchInputFramesPerSecond,
      num_inference_steps: numInferenceSteps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const firstFrameUrlRef = this.first_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameUrlRef)) {
      const firstFrameUrlUrl = await assetToFalUrl(apiKey, firstFrameUrlRef!);
      if (firstFrameUrlUrl) args["first_frame_url"] = firstFrameUrlUrl;
    }

    const refImagesList = this.ref_images as
      | Record<string, unknown>[]
      | undefined;
    if (refImagesList?.length) {
      const refImagesUrls: string[] = [];
      for (const ref of refImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) refImagesUrls.push(u);
        }
      }
      if (refImagesUrls.length) args["ref_image_urls"] = refImagesUrls;
    }

    const lastFrameUrlRef = this.last_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameUrlRef)) {
      const lastFrameUrlUrl = await assetToFalUrl(apiKey, lastFrameUrlRef!);
      if (lastFrameUrlUrl) args["last_frame_url"] = lastFrameUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan-22-vace-fun-a14b/pose",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class HunyuanVideoFoley extends FalNode {
  static readonly nodeType = "fal.video_to_video.HunyuanVideoFoley";
  static readonly title = "Hunyuan Video Foley";
  static readonly description = `Use the capabilities of the hunyuan foley model to bring life to your videos by adding sound effect to them.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to generate audio for."
  })
  declare video: any;

  @prop({
    type: "float",
    default: 4.5,
    description: "Guidance scale for audio generation."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 50,
    description: "Number of inference steps for generation."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "",
    description: "Random seed for reproducible generation."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "noisy, harsh",
    description: "Negative prompt to avoid certain audio characteristics."
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text description of the desired audio (optional)."
  })
  declare text_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const guidanceScale = Number(this.guidance_scale ?? 4.5);
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "noisy, harsh");
    const textPrompt = String(this.text_prompt ?? "");

    const args: Record<string, unknown> = {
      guidance_scale: guidanceScale,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      negative_prompt: negativePrompt,
      text_prompt: textPrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan-video-foley", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class SyncLipsyncV2Pro extends FalNode {
  static readonly nodeType = "fal.video_to_video.SyncLipsyncV2Pro";
  static readonly title = "Sync Lipsync V2 Pro";
  static readonly description = `Generate high-quality realistic lipsync animations from audio while preserving unique details like natural teeth and unique facial features using the state-of-the-art Sync Lipsync 2 Pro model.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "enum",
    default: "cut_off",
    values: ["cut_off", "loop", "bounce", "silence", "remap"],
    description: "Lipsync mode when audio and video durations are out of sync."
  })
  declare sync_mode: any;

  @prop({ type: "video", default: "", description: "URL of the input video" })
  declare video: any;

  @prop({ type: "audio", default: "", description: "URL of the input audio" })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const syncMode = String(this.sync_mode ?? "cut_off");

    const args: Record<string, unknown> = {
      sync_mode: syncMode
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sync-lipsync/v2/pro", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanFunControl extends FalNode {
  static readonly nodeType = "fal.video_to_video.WanFunControl";
  static readonly title = "Wan Fun Control";
  static readonly description = `Generate pose or depth controlled video using Alibaba-PAI's Wan 2.2 Fun
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "float",
    default: 5,
    description: "The shift for the scheduler."
  })
  declare shift: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video."
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to preprocess the video. If True, the video will be preprocessed to depth or pose."
  })
  declare preprocess_video: any;

  @prop({
    type: "image",
    default: "",
    description:
      "The URL of the reference image to use as a reference for the video generation."
  })
  declare reference_image: any;

  @prop({
    type: "int",
    default: 16,
    description: "The fps to generate. Only used when match_input_fps is False."
  })
  declare fps: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to match the number of frames in the input video."
  })
  declare match_input_num_frames: any;

  @prop({ type: "float", default: 6, description: "The guidance scale." })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "The number of frames to generate. Only used when match_input_num_frames is False."
  })
  declare num_frames: any;

  @prop({
    type: "video",
    default: "",
    description:
      "The URL of the control video to use as a reference for the video generation."
  })
  declare control_video: any;

  @prop({
    type: "str",
    default: "",
    description: "The negative prompt to generate the video."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "depth",
    values: ["depth", "pose"],
    description:
      "The type of preprocess to apply to the video. Only used when preprocess_video is True."
  })
  declare preprocess_type: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 27,
    description: "The number of inference steps."
  })
  declare num_inference_steps: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to match the fps in the input video."
  })
  declare match_input_fps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const shift = Number(this.shift ?? 5);
    const prompt = String(this.prompt ?? "");
    const preprocessVideo = Boolean(this.preprocess_video ?? false);
    const fps = Number(this.fps ?? 16);
    const matchInputNumFrames = Boolean(this.match_input_num_frames ?? true);
    const guidanceScale = Number(this.guidance_scale ?? 6);
    const numFrames = Number(this.num_frames ?? 81);
    const negativePrompt = String(this.negative_prompt ?? "");
    const preprocessType = String(this.preprocess_type ?? "depth");
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 27);
    const matchInputFps = Boolean(this.match_input_fps ?? true);

    const args: Record<string, unknown> = {
      shift: shift,
      prompt: prompt,
      preprocess_video: preprocessVideo,
      fps: fps,
      match_input_num_frames: matchInputNumFrames,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      negative_prompt: negativePrompt,
      preprocess_type: preprocessType,
      seed: seed,
      num_inference_steps: numInferenceSteps,
      match_input_fps: matchInputFps
    };

    const referenceImageRef = this.reference_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceImageRef)) {
      const referenceImageUrl =
        (await imageToDataUrl(referenceImageRef!)) ??
        (await assetToFalUrl(apiKey, referenceImageRef!));
      if (referenceImageUrl) args["reference_image_url"] = referenceImageUrl;
    }

    const controlVideoRef = this.control_video as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(controlVideoRef)) {
      const controlVideoUrl = await assetToFalUrl(apiKey, controlVideoRef!);
      if (controlVideoUrl) args["control_video_url"] = controlVideoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-fun-control", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class BriaVideoIncreaseResolution extends FalNode {
  static readonly nodeType = "fal.video_to_video.BriaVideoIncreaseResolution";
  static readonly title = "Bria Video Increase Resolution";
  static readonly description = `Upscale videos up to 8K output resolution. Trained on fully licensed and commercially safe data.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "video",
    default: "",
    description:
      "Input video to increase resolution. Size should be less than 7680,4320 and duration less than 30s."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "webm_vp9",
    values: [
      "mp4_h265",
      "mp4_h264",
      "webm_vp9",
      "mov_h265",
      "mov_proresks",
      "mkv_h265",
      "mkv_h264",
      "mkv_vp9",
      "gif"
    ],
    description:
      "Output container and codec. Options: mp4_h265, mp4_h264, webm_vp9, mov_h265, mov_proresks, mkv_h265, mkv_h264, mkv_vp9, gif."
  })
  declare output_container_and_codec: any;

  @prop({
    type: "enum",
    default: "2",
    values: ["2", "4"],
    description: "desired_increase factor. Options: 2x, 4x."
  })
  declare desired_increase: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const outputContainerAndCodec = String(
      this.output_container_and_codec ?? "webm_vp9"
    );
    const desiredIncrease = String(this.desired_increase ?? "2");

    const args: Record<string, unknown> = {
      output_container_and_codec: outputContainerAndCodec,
      desired_increase: desiredIncrease
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "bria/video/increase-resolution", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Infinitalk extends FalNode {
  static readonly nodeType = "fal.video_to_video.Infinitalk";
  static readonly title = "Infinitalk";
  static readonly description = `Infinitalk model generates a talking avatar video from an image and audio file. The avatar lip-syncs to the provided audio with natural facial expressions.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p", "720p"],
    description:
      "Resolution of the video to generate. Must be either 480p or 720p."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "regular",
    values: ["none", "regular", "high"],
    description: "The acceleration level to use for generation."
  })
  declare acceleration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped."
  })
  declare image: any;

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the audio file."
  })
  declare audio: any;

  @prop({
    type: "int",
    default: 145,
    description: "Number of frames to generate. Must be between 41 to 721."
  })
  declare num_frames: any;

  @prop({
    type: "int",
    default: 42,
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "480p");
    const acceleration = String(this.acceleration ?? "regular");
    const numFrames = Number(this.num_frames ?? 145);
    const seed = Number(this.seed ?? 42);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      acceleration: acceleration,
      num_frames: numFrames,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/infinitalk", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MireloAiSfxV1VideoToVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.MireloAiSfxV1VideoToVideo";
  static readonly title = "Mirelo Ai Sfx V1 Video To Video";
  static readonly description = `Generate synced sounds for any video, and return it with its new sound track (like MMAudio) 
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "list[Video]" };

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
      "mirelo-ai/sfx-v1/video-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MoonvalleyMareyPoseTransfer extends FalNode {
  static readonly nodeType = "fal.video_to_video.MoonvalleyMareyPoseTransfer";
  static readonly title = "Moonvalley Marey Pose Transfer";
  static readonly description = `Ideal for matching human movement. Your input video determines human poses, gestures, and body movements that will appear in the generated video.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate a video from"
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to use as the control video."
  })
  declare video: any;

  @prop({
    type: "str",
    default: -1,
    description:
      "Seed for random number generation. Use -1 for random seed each run."
  })
  declare seed: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional reference image URL to use for pose control or as a starting frame"
  })
  declare reference_image: any;

  @prop({
    type: "str",
    default:
      "<synthetic> <scene cut> low-poly, flat shader, bad rigging, stiff animation, uncanny eyes, low-quality textures, looping glitch, cheap effect, overbloom, bloom spam, default lighting, game asset, stiff face, ugly specular, AI artifacts",
    description:
      "Negative prompt used to guide the model away from undesirable features."
  })
  declare negative_prompt: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional first frame image URL to use as the first frame of the generated video"
  })
  declare first_frame_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const seed = String(this.seed ?? -1);
    const negativePrompt = String(
      this.negative_prompt ??
        "<synthetic> <scene cut> low-poly, flat shader, bad rigging, stiff animation, uncanny eyes, low-quality textures, looping glitch, cheap effect, overbloom, bloom spam, default lighting, game asset, stiff face, ugly specular, AI artifacts"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const referenceImageRef = this.reference_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceImageRef)) {
      const referenceImageUrl =
        (await imageToDataUrl(referenceImageRef!)) ??
        (await assetToFalUrl(apiKey, referenceImageRef!));
      if (referenceImageUrl) args["reference_image_url"] = referenceImageUrl;
    }

    const firstFrameImageRef = this.first_frame_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameImageRef)) {
      const firstFrameImageUrl =
        (await imageToDataUrl(firstFrameImageRef!)) ??
        (await assetToFalUrl(apiKey, firstFrameImageRef!));
      if (firstFrameImageUrl)
        args["first_frame_image_url"] = firstFrameImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "moonvalley/marey/pose-transfer", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MoonvalleyMareyMotionTransfer extends FalNode {
  static readonly nodeType = "fal.video_to_video.MoonvalleyMareyMotionTransfer";
  static readonly title = "Moonvalley Marey Motion Transfer";
  static readonly description = `Pull motion from a reference video and apply it to new subjects or scenes.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate a video from"
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to use as the control video."
  })
  declare video: any;

  @prop({
    type: "str",
    default: -1,
    description:
      "Seed for random number generation. Use -1 for random seed each run."
  })
  declare seed: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional reference image URL to use for pose control or as a starting frame"
  })
  declare reference_image: any;

  @prop({
    type: "str",
    default:
      "<synthetic> <scene cut> low-poly, flat shader, bad rigging, stiff animation, uncanny eyes, low-quality textures, looping glitch, cheap effect, overbloom, bloom spam, default lighting, game asset, stiff face, ugly specular, AI artifacts",
    description:
      "Negative prompt used to guide the model away from undesirable features."
  })
  declare negative_prompt: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional first frame image URL to use as the first frame of the generated video"
  })
  declare first_frame_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const seed = String(this.seed ?? -1);
    const negativePrompt = String(
      this.negative_prompt ??
        "<synthetic> <scene cut> low-poly, flat shader, bad rigging, stiff animation, uncanny eyes, low-quality textures, looping glitch, cheap effect, overbloom, bloom spam, default lighting, game asset, stiff face, ugly specular, AI artifacts"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const referenceImageRef = this.reference_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceImageRef)) {
      const referenceImageUrl =
        (await imageToDataUrl(referenceImageRef!)) ??
        (await assetToFalUrl(apiKey, referenceImageRef!));
      if (referenceImageUrl) args["reference_image_url"] = referenceImageUrl;
    }

    const firstFrameImageRef = this.first_frame_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameImageRef)) {
      const firstFrameImageUrl =
        (await imageToDataUrl(firstFrameImageRef!)) ??
        (await assetToFalUrl(apiKey, firstFrameImageRef!));
      if (firstFrameImageUrl)
        args["first_frame_image_url"] = firstFrameImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "moonvalley/marey/motion-transfer",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class FfmpegApiMergeVideos extends FalNode {
  static readonly nodeType = "fal.video_to_video.FfmpegApiMergeVideos";
  static readonly title = "Ffmpeg Api Merge Videos";
  static readonly description = `Use ffmpeg capabilities to merge 2 or more videos.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { metadata: "dict[str, any]", video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Resolution of the final video. Width and height must be between 512 and 2048."
  })
  declare resolution: any;

  @prop({
    type: "list[video]",
    default: [],
    description: "List of video URLs to merge in order"
  })
  declare video_urls: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Target FPS for the output video. If not provided, uses the lowest FPS from input videos."
  })
  declare target_fps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const resolution = String(this.resolution ?? "");
    const targetFps = String(this.target_fps ?? "");

    const args: Record<string, unknown> = {
      resolution: resolution,
      target_fps: targetFps
    };

    const videoUrlsList = this.video_urls as
      | Record<string, unknown>[]
      | undefined;
    if (videoUrlsList?.length) {
      const videoUrlsUrls: string[] = [];
      for (const ref of videoUrlsList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) videoUrlsUrls.push(u);
        }
      }
      if (videoUrlsUrls.length) args["video_urls"] = videoUrlsUrls;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ffmpeg-api/merge-videos", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV22A14bVideoToVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.WanV22A14bVideoToVideo";
  static readonly title = "Wan V22 A14b Video To Video";
  static readonly description = `Wan-2.2 video-to-video is a video model that generates high-quality videos with high visual quality and motion diversity from text prompts and source videos.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({ type: "video", default: "", description: "URL of the input video." })
  declare video: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "Number of frames to interpolate between each pair of generated frames. Must be between 0 and 4."
  })
  declare num_interpolated_frames: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift value for the video. Must be between 1.0 and 10.0."
  })
  declare shift: any;

  @prop({
    type: "enum",
    default: "regular",
    values: ["none", "regular"],
    description:
      "Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'regular'."
  })
  declare acceleration: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the video will be resampled to the passed frames per second. If false, the video will not be resampled."
  })
  declare resample_fps: any;

  @prop({
    type: "str",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 4 to 60. When using interpolation and 'adjust_fps_for_interpolation' is set to true (default true,) the final FPS will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If 'adjust_fps_for_interpolation' is set to false, this value will be used as-is."
  })
  declare frames_per_second: any;

  @prop({
    type: "float",
    default: 3.5,
    description:
      "Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Number of frames to generate. Must be between 17 to 161 (inclusive)."
  })
  declare num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If set to true, input data will be checked for safety before processing."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description:
      "The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "9:16", "1:1"],
    description:
      "Aspect ratio of the generated video. If 'auto', the aspect ratio will be determined automatically based on the input video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "580p", "720p"],
    description: "Resolution of the generated video (480p, 580p, or 720p)."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If set to true, output video will be checked for safety after generation."
  })
  declare enable_output_safety_checker: any;

  @prop({
    type: "float",
    default: 4,
    description:
      "Guidance scale for the second stage of the model. This is used to control the adherence to the prompt in the second stage of the model."
  })
  declare guidance_scale_2: any;

  @prop({
    type: "float",
    default: 0.9,
    description:
      "Strength of the video transformation. A value of 1.0 means the output will be completely based on the prompt, while a value of 0.0 means the output will be identical to the input video."
  })
  declare strength: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description:
      "The quality of the output video. Higher quality means better visual quality but larger file size."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "int",
    default: 27,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "enum",
    default: "film",
    values: ["none", "film", "rife"],
    description:
      "The model to use for frame interpolation. If None, no interpolation is applied."
  })
  declare interpolator_model: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "If true, the number of frames per second will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If false, the passed frames per second will be used as-is."
  })
  declare adjust_fps_for_interpolation: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 1);
    const shift = Number(this.shift ?? 5);
    const acceleration = String(this.acceleration ?? "regular");
    const resampleFps = Boolean(this.resample_fps ?? false);
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const numFrames = Number(this.num_frames ?? 81);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(this.negative_prompt ?? "");
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "720p");
    const enableOutputSafetyChecker = Boolean(
      this.enable_output_safety_checker ?? false
    );
    const guidanceScale_2 = Number(this.guidance_scale_2 ?? 4);
    const strength = Number(this.strength ?? 0.9);
    const videoQuality = String(this.video_quality ?? "high");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 27);
    const interpolatorModel = String(this.interpolator_model ?? "film");
    const adjustFpsForInterpolation = Boolean(
      this.adjust_fps_for_interpolation ?? true
    );
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_interpolated_frames: numInterpolatedFrames,
      shift: shift,
      acceleration: acceleration,
      resample_fps: resampleFps,
      frames_per_second: framesPerSecond,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      enable_output_safety_checker: enableOutputSafetyChecker,
      guidance_scale_2: guidanceScale_2,
      strength: strength,
      video_quality: videoQuality,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps,
      interpolator_model: interpolatorModel,
      adjust_fps_for_interpolation: adjustFpsForInterpolation,
      seed: seed
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan/v2.2-a14b/video-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltxv13b098DistilledExtend extends FalNode {
  static readonly nodeType = "fal.video_to_video.Ltxv13b098DistilledExtend";
  static readonly title = "Ltxv13b098 Distilled Extend";
  static readonly description = `Extend videos using LTX Video-0.9.8 13B Distilled and custom LoRA
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt to guide generation"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 8,
    description: "Number of inference steps during the first pass."
  })
  declare first_pass_num_inference_steps: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to reverse the video."
  })
  declare reverse_video: any;

  @prop({
    type: "int",
    default: 24,
    description: "The frame rate of the video."
  })
  declare frame_rate: any;

  @prop({
    type: "int",
    default: 5,
    description:
      "The number of inference steps to skip in the initial steps of the second pass. By skipping some steps at the beginning, the second pass can focus on smaller details instead of larger changes."
  })
  declare second_pass_skip_initial_steps: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "The factor for adaptive instance normalization (AdaIN) applied to generated video chunks after the first. This can help deal with a gradual increase in saturation/contrast in the generated video by normalizing the color distribution across the video. A high value will ensure the color distribution is more consistent across the video, while a low value will allow for more variation in color distribution."
  })
  declare temporal_adain_factor: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to expand the prompt using a language model."
  })
  declare expand_prompt: any;

  @prop({
    type: "list[LoRAWeight]",
    default: [],
    description: "LoRA weights to use for generation"
  })
  declare loras: any;

  @prop({
    type: "int",
    default: 8,
    description: "Number of inference steps during the second pass."
  })
  declare second_pass_num_inference_steps: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames in the video."
  })
  declare num_frames: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default: "worst quality, inconsistent motion, blurry, jittery, distorted",
    description: "Negative prompt for generation"
  })
  declare negative_prompt: any;

  @prop({ type: "video", default: "", description: "Video to be extended." })
  declare video: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to use a detail pass. If True, the model will perform a second pass to refine the video and enhance details. This incurs a 2.0x cost multiplier on the base price."
  })
  declare enable_detail_pass: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["9:16", "1:1", "16:9", "auto"],
    description: "The aspect ratio of the video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "The compression ratio for tone mapping. This is used to compress the dynamic range of the video to improve visual quality. A value of 0.0 means no compression, while a value of 1.0 means maximum compression."
  })
  declare tone_map_compression_ratio: any;

  @prop({
    type: "int",
    default: 29,
    description:
      "The constant rate factor (CRF) to compress input media with. Compressed input media more closely matches the model's training data, which can improve motion quality."
  })
  declare constant_rate_factor: any;

  @prop({ type: "str", default: "", description: "Random seed for generation" })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const firstPassNumInferenceSteps = Number(
      this.first_pass_num_inference_steps ?? 8
    );
    const reverseVideo = Boolean(this.reverse_video ?? false);
    const frameRate = Number(this.frame_rate ?? 24);
    const secondPassSkipInitialSteps = Number(
      this.second_pass_skip_initial_steps ?? 5
    );
    const temporalAdainFactor = Number(this.temporal_adain_factor ?? 0.5);
    const expandPrompt = Boolean(this.expand_prompt ?? false);
    const loras = String(this.loras ?? []);
    const secondPassNumInferenceSteps = Number(
      this.second_pass_num_inference_steps ?? 8
    );
    const numFrames = Number(this.num_frames ?? 121);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const negativePrompt = String(
      this.negative_prompt ??
        "worst quality, inconsistent motion, blurry, jittery, distorted"
    );
    const enableDetailPass = Boolean(this.enable_detail_pass ?? false);
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const toneMapCompressionRatio = Number(
      this.tone_map_compression_ratio ?? 0
    );
    const constantRateFactor = Number(this.constant_rate_factor ?? 29);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      first_pass_num_inference_steps: firstPassNumInferenceSteps,
      reverse_video: reverseVideo,
      frame_rate: frameRate,
      second_pass_skip_initial_steps: secondPassSkipInitialSteps,
      temporal_adain_factor: temporalAdainFactor,
      expand_prompt: expandPrompt,
      loras: loras,
      second_pass_num_inference_steps: secondPassNumInferenceSteps,
      num_frames: numFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      enable_detail_pass: enableDetailPass,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      tone_map_compression_ratio: toneMapCompressionRatio,
      constant_rate_factor: constantRateFactor,
      seed: seed
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) {
        args["video"] = {
          video_url: videoUrl,
          start_frame_num: Number((this as any).start_frame_num ?? 0),
          reverse_video: Boolean((this as any).reverse_video ?? false),
          limit_num_frames: Boolean((this as any).limit_num_frames ?? false),
          resample_fps: Boolean((this as any).resample_fps ?? false),
          strength: Number((this as any).strength ?? 0),
          target_fps: Number((this as any).target_fps ?? 0),
          max_num_frames: Number((this as any).max_num_frames ?? 0)
        };
      }
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltxv-13b-098-distilled/extend",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class RifeVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.RifeVideo";
  static readonly title = "Rife Video";
  static readonly description = `Interpolate videos with RIFE - Real-Time Intermediate Flow Estimation
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to use for interpolation."
  })
  declare video: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If True, the input video will be split into scenes before interpolation. This removes smear frames between scenes, but can result in false positives if the scene detection is not accurate. If False, the entire video will be treated as a single scene."
  })
  declare use_scene_detection: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "If True, the function will use the calculated FPS of the input video multiplied by the number of frames to determine the output FPS. If False, the passed FPS will be used."
  })
  declare use_calculated_fps: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "The number of frames to generate between the input video frames."
  })
  declare num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If True, the final frame will be looped back to the first frame to create a seamless loop. If False, the final frame will not loop back."
  })
  declare loop: any;

  @prop({
    type: "int",
    default: 8,
    description:
      "Frames per second for the output video. Only applicable if use_calculated_fps is False."
  })
  declare fps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const useSceneDetection = Boolean(this.use_scene_detection ?? false);
    const useCalculatedFps = Boolean(this.use_calculated_fps ?? true);
    const numFrames = Number(this.num_frames ?? 1);
    const loop = Boolean(this.loop ?? false);
    const fps = Number(this.fps ?? 8);

    const args: Record<string, unknown> = {
      use_scene_detection: useSceneDetection,
      use_calculated_fps: useCalculatedFps,
      num_frames: numFrames,
      loop: loop,
      fps: fps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/rife/video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class FilmVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.FilmVideo";
  static readonly title = "Film Video";
  static readonly description = `Interpolate videos with FILM - Frame Interpolation for Large Motion
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description:
      "The write mode of the output video. Only applicable if output_type is 'video'."
  })
  declare video_write_mode: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to use for interpolation."
  })
  declare video: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If True, the final frame will be looped back to the first frame to create a seamless loop. If False, the final frame will not loop back."
  })
  declare loop: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "If True, the function will use the calculated FPS of the input video multiplied by the number of frames to determine the output FPS. If False, the passed FPS will be used."
  })
  declare use_calculated_fps: any;

  @prop({
    type: "int",
    default: 8,
    description:
      "Frames per second for the output video. Only applicable if use_calculated_fps is False."
  })
  declare fps: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description:
      "The quality of the output video. Only applicable if output_type is 'video'."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If True, the input video will be split into scenes before interpolation. This removes smear frames between scenes, but can result in false positives if the scene detection is not accurate. If False, the entire video will be treated as a single scene."
  })
  declare use_scene_detection: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "The number of frames to generate between the input video frames."
  })
  declare num_frames: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const loop = Boolean(this.loop ?? false);
    const useCalculatedFps = Boolean(this.use_calculated_fps ?? true);
    const fps = Number(this.fps ?? 8);
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const useSceneDetection = Boolean(this.use_scene_detection ?? false);
    const numFrames = Number(this.num_frames ?? 1);

    const args: Record<string, unknown> = {
      video_write_mode: videoWriteMode,
      loop: loop,
      use_calculated_fps: useCalculatedFps,
      fps: fps,
      video_quality: videoQuality,
      sync_mode: syncMode,
      use_scene_detection: useSceneDetection,
      num_frames: numFrames
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/film/video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LumaDreamMachineRay2FlashModify extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.LumaDreamMachineRay2FlashModify";
  static readonly title = "Luma Dream Machine Ray2 Flash Modify";
  static readonly description = `Ray2 Flash Modify is a video generative model capable of restyling or retexturing the entire shot, from turning live-action into CG or stylized animation, to changing wardrobe, props, or the overall aesthetic and swap environments or time periods, giving you control over background, location, or even weather.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Instruction for modifying the video"
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "URL of the input video to modify"
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "flex_1",
    values: [
      "adhere_1",
      "adhere_2",
      "adhere_3",
      "flex_1",
      "flex_2",
      "flex_3",
      "reimagine_1",
      "reimagine_2",
      "reimagine_3"
    ],
    description:
      "Amount of modification to apply to the video, adhere_1 is the least amount of modification, reimagine_3 is the most"
  })
  declare mode: any;

  @prop({
    type: "image",
    default: "",
    description: "Optional URL of the first frame image for modification"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const mode = String(this.mode ?? "flex_1");

    const args: Record<string, unknown> = {
      prompt: prompt,
      mode: mode
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/luma-dream-machine/ray-2-flash/modify",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltxv13b098DistilledMulticonditioning extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.Ltxv13b098DistilledMulticonditioning";
  static readonly title = "Ltxv13b098 Distilled Multiconditioning";
  static readonly description = `Generate long videos from prompts, images, and videos using LTX Video-0.9.8 13B Distilled and custom LoRA
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt to guide generation"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 8,
    description: "Number of inference steps during the first pass."
  })
  declare first_pass_num_inference_steps: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to reverse the video."
  })
  declare reverse_video: any;

  @prop({
    type: "int",
    default: 24,
    description: "The frame rate of the video."
  })
  declare frame_rate: any;

  @prop({
    type: "int",
    default: 5,
    description:
      "The number of inference steps to skip in the initial steps of the second pass. By skipping some steps at the beginning, the second pass can focus on smaller details instead of larger changes."
  })
  declare second_pass_skip_initial_steps: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "The factor for adaptive instance normalization (AdaIN) applied to generated video chunks after the first. This can help deal with a gradual increase in saturation/contrast in the generated video by normalizing the color distribution across the video. A high value will ensure the color distribution is more consistent across the video, while a low value will allow for more variation in color distribution."
  })
  declare temporal_adain_factor: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to expand the prompt using a language model."
  })
  declare expand_prompt: any;

  @prop({
    type: "list[LoRAWeight]",
    default: [],
    description: "LoRA weights to use for generation"
  })
  declare loras: any;

  @prop({
    type: "list[ImageConditioningInput]",
    default: [],
    description: "URL of images to use as conditioning"
  })
  declare images: any;

  @prop({
    type: "int",
    default: 8,
    description: "Number of inference steps during the second pass."
  })
  declare second_pass_num_inference_steps: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames in the video."
  })
  declare num_frames: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default: "worst quality, inconsistent motion, blurry, jittery, distorted",
    description: "Negative prompt for generation"
  })
  declare negative_prompt: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to use a detail pass. If True, the model will perform a second pass to refine the video and enhance details. This incurs a 2.0x cost multiplier on the base price."
  })
  declare enable_detail_pass: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["9:16", "1:1", "16:9", "auto"],
    description: "The aspect ratio of the video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "The compression ratio for tone mapping. This is used to compress the dynamic range of the video to improve visual quality. A value of 0.0 means no compression, while a value of 1.0 means maximum compression."
  })
  declare tone_map_compression_ratio: any;

  @prop({
    type: "list[VideoConditioningInput]",
    default: [],
    description: "Videos to use as conditioning"
  })
  declare videos: any;

  @prop({
    type: "int",
    default: 29,
    description:
      "The constant rate factor (CRF) to compress input media with. Compressed input media more closely matches the model's training data, which can improve motion quality."
  })
  declare constant_rate_factor: any;

  @prop({ type: "str", default: "", description: "Random seed for generation" })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const firstPassNumInferenceSteps = Number(
      this.first_pass_num_inference_steps ?? 8
    );
    const reverseVideo = Boolean(this.reverse_video ?? false);
    const frameRate = Number(this.frame_rate ?? 24);
    const secondPassSkipInitialSteps = Number(
      this.second_pass_skip_initial_steps ?? 5
    );
    const temporalAdainFactor = Number(this.temporal_adain_factor ?? 0.5);
    const expandPrompt = Boolean(this.expand_prompt ?? false);
    const loras = String(this.loras ?? []);
    const images = String(this.images ?? []);
    const secondPassNumInferenceSteps = Number(
      this.second_pass_num_inference_steps ?? 8
    );
    const numFrames = Number(this.num_frames ?? 121);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const negativePrompt = String(
      this.negative_prompt ??
        "worst quality, inconsistent motion, blurry, jittery, distorted"
    );
    const enableDetailPass = Boolean(this.enable_detail_pass ?? false);
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const toneMapCompressionRatio = Number(
      this.tone_map_compression_ratio ?? 0
    );
    const videos = String(this.videos ?? []);
    const constantRateFactor = Number(this.constant_rate_factor ?? 29);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      first_pass_num_inference_steps: firstPassNumInferenceSteps,
      reverse_video: reverseVideo,
      frame_rate: frameRate,
      second_pass_skip_initial_steps: secondPassSkipInitialSteps,
      temporal_adain_factor: temporalAdainFactor,
      expand_prompt: expandPrompt,
      loras: loras,
      images: images,
      second_pass_num_inference_steps: secondPassNumInferenceSteps,
      num_frames: numFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      enable_detail_pass: enableDetailPass,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      tone_map_compression_ratio: toneMapCompressionRatio,
      videos: videos,
      constant_rate_factor: constantRateFactor,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltxv-13b-098-distilled/multiconditioning",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseSoundEffects extends FalNode {
  static readonly nodeType = "fal.video_to_video.PixverseSoundEffects";
  static readonly title = "Pixverse Sound Effects";
  static readonly description = `Add immersive sound effects and background music to your videos using PixVerse sound effects  generation
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Description of the sound effect to generate. If empty, a random sound effect will be generated"
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "URL of the input video to add sound effects to"
  })
  declare video: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to keep the original audio from the video"
  })
  declare original_sound_switch: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const originalSoundSwitch = Boolean(this.original_sound_switch ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      original_sound_switch: originalSoundSwitch
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/pixverse/sound-effects", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ThinksoundAudio extends FalNode {
  static readonly nodeType = "fal.video_to_video.ThinksoundAudio";
  static readonly title = "Thinksound Audio";
  static readonly description = `Generate realistic audio from a video with an optional text prompt
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", audio: "audio" };

  @prop({
    type: "str",
    default: "",
    description:
      "A prompt to guide the audio generation. If not provided, it will be extracted from the video."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to generate the audio for."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 24,
    description: "The number of inference steps for audio generation."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator"
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 5,
    description: "The classifier-free guidance scale for audio generation."
  })
  declare cfg_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 24);
    const seed = String(this.seed ?? "");
    const cfgScale = Number(this.cfg_scale ?? 5);

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      cfg_scale: cfgScale
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/thinksound/audio", args);
    return { output: { type: "audio", uri: (res.audio as any).url } };
  }
}

export class Thinksound extends FalNode {
  static readonly nodeType = "fal.video_to_video.Thinksound";
  static readonly title = "Thinksound";
  static readonly description = `Generate realistic audio for a video with an optional text prompt and combine
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "A prompt to guide the audio generation. If not provided, it will be extracted from the video."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to generate the audio for."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 24,
    description: "The number of inference steps for audio generation."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator"
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 5,
    description: "The classifier-free guidance scale for audio generation."
  })
  declare cfg_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 24);
    const seed = String(this.seed ?? "");
    const cfgScale = Number(this.cfg_scale ?? 5);

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      cfg_scale: cfgScale
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/thinksound", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseExtendFast extends FalNode {
  static readonly nodeType = "fal.video_to_video.PixverseExtendFast";
  static readonly title = "Pixverse Extend Fast";
  static readonly description = `PixVerse Extend model is a video extending tool for your videos using with high-quality video extending techniques 
video, editing, video-to-video, vid2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Prompt describing how to extend the video"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p"],
    description:
      "The resolution of the generated video. Fast mode doesn't support 1080p"
  })
  declare resolution: any;

  @prop({
    type: "video",
    default: "",
    description: "URL of the input video to extend"
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description: "The style of the extended video"
  })
  declare style: any;

  @prop({
    type: "enum",
    default: "v4.5",
    values: ["v3.5", "v4", "v4.5", "v5", "v5.5", "v5.6"],
    description: "The model version to use for generation"
  })
  declare model: any;

  @prop({ type: "str", default: "", description: "Random seed for generation" })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to be used for the generation"
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const style = String(this.style ?? "");
    const model = String(this.model ?? "v4.5");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      style: style,
      model: model,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/pixverse/extend/fast", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseExtend extends FalNode {
  static readonly nodeType = "fal.video_to_video.PixverseExtend";
  static readonly title = "Pixverse Extend";
  static readonly description = `PixVerse Extend model is a video extending tool for your videos using with high-quality video extending techniques 
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Prompt describing how to extend the video"
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "URL of the input video to extend"
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8"],
    description:
      "The duration of the generated video in seconds. 1080p videos are limited to 5 seconds"
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "",
    description: "The style of the extended video"
  })
  declare style: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "v4.5",
    values: ["v3.5", "v4", "v4.5", "v5", "v5.5", "v5.6"],
    description: "The model version to use for generation"
  })
  declare model: any;

  @prop({ type: "str", default: "", description: "Random seed for generation" })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to be used for the generation"
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "5");
    const style = String(this.style ?? "");
    const resolution = String(this.resolution ?? "720p");
    const model = String(this.model ?? "v4.5");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      style: style,
      resolution: resolution,
      model: model,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/pixverse/extend", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseLipsync extends FalNode {
  static readonly nodeType = "fal.video_to_video.PixverseLipsync";
  static readonly title = "Pixverse Lipsync";
  static readonly description = `Generate realistic lipsync animations from audio using advanced algorithms for high-quality synchronization with PixVerse Lipsync model
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text content for TTS when audio_url is not provided"
  })
  declare text: any;

  @prop({ type: "video", default: "", description: "URL of the input video" })
  declare video: any;

  @prop({
    type: "audio",
    default: "",
    description: "URL of the input audio. If not provided, TTS will be used."
  })
  declare audio: any;

  @prop({
    type: "enum",
    default: "Auto",
    values: [
      "Emily",
      "James",
      "Isabella",
      "Liam",
      "Chloe",
      "Adrian",
      "Harper",
      "Ava",
      "Sophia",
      "Julia",
      "Mason",
      "Jack",
      "Oliver",
      "Ethan",
      "Auto"
    ],
    description: "Voice to use for TTS when audio_url is not provided"
  })
  declare voice_id: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const voiceId = String(this.voice_id ?? "Auto");

    const args: Record<string, unknown> = {
      text: text,
      voice_id: voiceId
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/pixverse/lipsync", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LumaDreamMachineRay2Modify extends FalNode {
  static readonly nodeType = "fal.video_to_video.LumaDreamMachineRay2Modify";
  static readonly title = "Luma Dream Machine Ray2 Modify";
  static readonly description = `Ray2 Modify is a video generative model capable of restyling or retexturing the entire shot, from turning live-action into CG or stylized animation, to changing wardrobe, props, or the overall aesthetic and swap environments or time periods, giving you control over background, location, or even weather.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Instruction for modifying the video"
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "URL of the input video to modify"
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "flex_1",
    values: [
      "adhere_1",
      "adhere_2",
      "adhere_3",
      "flex_1",
      "flex_2",
      "flex_3",
      "reimagine_1",
      "reimagine_2",
      "reimagine_3"
    ],
    description:
      "Amount of modification to apply to the video, adhere_1 is the least amount of modification, reimagine_3 is the most"
  })
  declare mode: any;

  @prop({
    type: "image",
    default: "",
    description: "Optional URL of the first frame image for modification"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const mode = String(this.mode ?? "flex_1");

    const args: Record<string, unknown> = {
      prompt: prompt,
      mode: mode
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/luma-dream-machine/ray-2/modify",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanVace14bReframe extends FalNode {
  static readonly nodeType = "fal.video_to_video.WanVace14bReframe";
  static readonly title = "Wan Vace14b Reframe";
  static readonly description = `VACE is a video generation model that uses a source image, mask, and video to create prompted videos with controllable sources.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    frames_zip: "str",
    seed: "int",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "The text prompt to guide video generation. Optional for reframing."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the source video file. This video will be used as a reference for the reframe task."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Number of frames to interpolate between the original frames. A value of 0 means no interpolation."
  })
  declare num_interpolated_frames: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Temporal downsample factor for the video. This is an integer value that determines how many frames to skip in the video. A value of 0 means no downsampling. For each downsample factor, one upsample factor will automatically be applied."
  })
  declare temporal_downsample_factor: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the first frame of the video. If provided, the model will use this frame as a reference."
  })
  declare first_frame_url: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "Guidance scale for classifier-free guidance. Higher values encourage the model to generate images closely related to the text prompt."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Number of frames to generate. Must be between 81 to 241 (inclusive)."
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 15,
    description:
      "The minimum frames per second to downsample the video to. This is used to help determine the auto downsample factor to try and find the lowest detail-preserving downsample factor. The default value is appropriate for most videos, if you are using a video with very fast motion, you may need to increase this value. If your video has a very low amount of motion, you could decrease this value to allow for higher downsampling and thus longer sequences."
  })
  declare auto_downsample_min_fps: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to trim borders from the video."
  })
  declare trim_borders: any;

  @prop({
    type: "enum",
    default: "unipc",
    values: ["unipc", "dpm++", "euler"],
    description: "Sampler to use for video generation."
  })
  declare sampler: any;

  @prop({
    type: "enum",
    default: "content_aware",
    values: ["content_aware", "white", "black"],
    description:
      "The transparency mode to apply to the first and last frames. This controls how the transparent areas of the first and last frames are filled."
  })
  declare transparency_mode: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "film",
    values: ["rife", "film"],
    description:
      "The model to use for frame interpolation. Options are 'rife' or 'film'."
  })
  declare interpolator_model: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the model will automatically temporally downsample the video to an appropriate frame length for the model, then will interpolate it back to the original frame length."
  })
  declare enable_auto_downsample: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "str",
    default: "regular",
    description:
      "Acceleration to use for inference. Options are 'none' or 'regular'. Accelerated inference will very slightly affect output, but will be significantly faster."
  })
  declare acceleration: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Zoom factor for the video. When this value is greater than 0, the video will be zoomed in by this factor (in relation to the canvas size,) cutting off the edges of the video. A value of 0 means no zoom."
  })
  declare zoom_factor: any;

  @prop({
    type: "str",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 5 to 30. Ignored if match_input_frames_per_second is true."
  })
  declare frames_per_second: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "If true, the number of frames in the generated video will match the number of frames in the input video. If false, the number of frames will be determined by the num_frames parameter."
  })
  declare match_input_num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default:
      "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "1:1", "9:16"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, also return a ZIP file containing all generated frames."
  })
  declare return_frames_zip: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "240p", "360p", "480p", "580p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "If true, the frames per second of the generated video will match the input video. If false, the frames per second will be determined by the frames_per_second parameter."
  })
  declare match_input_frames_per_second: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the last frame of the video. If provided, the model will use this frame as a reference."
  })
  declare last_frame_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 0);
    const temporalDownsampleFactor = Number(
      this.temporal_downsample_factor ?? 0
    );
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const numFrames = Number(this.num_frames ?? 81);
    const autoDownsampleMinFps = Number(this.auto_downsample_min_fps ?? 15);
    const trimBorders = Boolean(this.trim_borders ?? true);
    const sampler = String(this.sampler ?? "unipc");
    const transparencyMode = String(this.transparency_mode ?? "content_aware");
    const syncMode = Boolean(this.sync_mode ?? false);
    const videoQuality = String(this.video_quality ?? "high");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const seed = String(this.seed ?? "");
    const interpolatorModel = String(this.interpolator_model ?? "film");
    const enableAutoDownsample = Boolean(this.enable_auto_downsample ?? false);
    const shift = Number(this.shift ?? 5);
    const acceleration = String(this.acceleration ?? "regular");
    const zoomFactor = Number(this.zoom_factor ?? 0);
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const matchInputNumFrames = Boolean(this.match_input_num_frames ?? true);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(
      this.negative_prompt ??
        "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const returnFramesZip = Boolean(this.return_frames_zip ?? false);
    const resolution = String(this.resolution ?? "auto");
    const matchInputFramesPerSecond = Boolean(
      this.match_input_frames_per_second ?? true
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_interpolated_frames: numInterpolatedFrames,
      temporal_downsample_factor: temporalDownsampleFactor,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      auto_downsample_min_fps: autoDownsampleMinFps,
      trim_borders: trimBorders,
      sampler: sampler,
      transparency_mode: transparencyMode,
      sync_mode: syncMode,
      video_quality: videoQuality,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      interpolator_model: interpolatorModel,
      enable_auto_downsample: enableAutoDownsample,
      shift: shift,
      acceleration: acceleration,
      zoom_factor: zoomFactor,
      frames_per_second: framesPerSecond,
      match_input_num_frames: matchInputNumFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      aspect_ratio: aspectRatio,
      return_frames_zip: returnFramesZip,
      resolution: resolution,
      match_input_frames_per_second: matchInputFramesPerSecond,
      num_inference_steps: numInferenceSteps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const firstFrameUrlRef = this.first_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameUrlRef)) {
      const firstFrameUrlUrl = await assetToFalUrl(apiKey, firstFrameUrlRef!);
      if (firstFrameUrlUrl) args["first_frame_url"] = firstFrameUrlUrl;
    }

    const lastFrameUrlRef = this.last_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameUrlRef)) {
      const lastFrameUrlUrl = await assetToFalUrl(apiKey, lastFrameUrlRef!);
      if (lastFrameUrlUrl) args["last_frame_url"] = lastFrameUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-vace-14b/reframe", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanVace14bOutpainting extends FalNode {
  static readonly nodeType = "fal.video_to_video.WanVace14bOutpainting";
  static readonly title = "Wan Vace14b Outpainting";
  static readonly description = `VACE is a video generation model that uses a source image, mask, and video to create prompted videos with controllable sources.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    frames_zip: "str",
    seed: "int",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "URL to the source video file. Required for outpainting."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Number of frames to interpolate between the original frames. A value of 0 means no interpolation."
  })
  declare num_interpolated_frames: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Temporal downsample factor for the video. This is an integer value that determines how many frames to skip in the video. A value of 0 means no downsampling. For each downsample factor, one upsample factor will automatically be applied."
  })
  declare temporal_downsample_factor: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the first frame of the video. If provided, the model will use this frame as a reference."
  })
  declare first_frame_url: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "URLs to source reference image. If provided, the model will use this image as reference."
  })
  declare ref_images: any;

  @prop({
    type: "float",
    default: 0.25,
    description:
      "Amount of expansion. This is a float value between 0 and 1, where 0.25 adds 25% to the original video size on the specified sides."
  })
  declare expand_ratio: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "Guidance scale for classifier-free guidance. Higher values encourage the model to generate images closely related to the text prompt."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Number of frames to generate. Must be between 81 to 241 (inclusive)."
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 15,
    description:
      "The minimum frames per second to downsample the video to. This is used to help determine the auto downsample factor to try and find the lowest detail-preserving downsample factor. The default value is appropriate for most videos, if you are using a video with very fast motion, you may need to increase this value. If your video has a very low amount of motion, you could decrease this value to allow for higher downsampling and thus longer sequences."
  })
  declare auto_downsample_min_fps: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to expand the video to the bottom."
  })
  declare expand_bottom: any;

  @prop({
    type: "enum",
    default: "unipc",
    values: ["unipc", "dpm++", "euler"],
    description: "Sampler to use for video generation."
  })
  declare sampler: any;

  @prop({
    type: "enum",
    default: "content_aware",
    values: ["content_aware", "white", "black"],
    description:
      "The transparency mode to apply to the first and last frames. This controls how the transparent areas of the first and last frames are filled."
  })
  declare transparency_mode: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "film",
    values: ["rife", "film"],
    description:
      "The model to use for frame interpolation. Options are 'rife' or 'film'."
  })
  declare interpolator_model: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the model will automatically temporally downsample the video to an appropriate frame length for the model, then will interpolate it back to the original frame length."
  })
  declare enable_auto_downsample: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to expand the video to the top."
  })
  declare expand_top: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to expand the video to the left."
  })
  declare expand_left: any;

  @prop({
    type: "str",
    default: "regular",
    description:
      "Acceleration to use for inference. Options are 'none' or 'regular'. Accelerated inference will very slightly affect output, but will be significantly faster."
  })
  declare acceleration: any;

  @prop({
    type: "str",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 5 to 30. Ignored if match_input_frames_per_second is true."
  })
  declare frames_per_second: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the number of frames in the generated video will match the number of frames in the input video. If false, the number of frames will be determined by the num_frames parameter."
  })
  declare match_input_num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default:
      "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to expand the video to the right."
  })
  declare expand_right: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "240p", "360p", "480p", "580p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, also return a ZIP file containing all generated frames."
  })
  declare return_frames_zip: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "1:1", "9:16"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the frames per second of the generated video will match the input video. If false, the frames per second will be determined by the frames_per_second parameter."
  })
  declare match_input_frames_per_second: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the last frame of the video. If provided, the model will use this frame as a reference."
  })
  declare last_frame_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 0);
    const temporalDownsampleFactor = Number(
      this.temporal_downsample_factor ?? 0
    );
    const expandRatio = Number(this.expand_ratio ?? 0.25);
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const numFrames = Number(this.num_frames ?? 81);
    const autoDownsampleMinFps = Number(this.auto_downsample_min_fps ?? 15);
    const expandBottom = Boolean(this.expand_bottom ?? false);
    const sampler = String(this.sampler ?? "unipc");
    const transparencyMode = String(this.transparency_mode ?? "content_aware");
    const syncMode = Boolean(this.sync_mode ?? false);
    const videoQuality = String(this.video_quality ?? "high");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const seed = String(this.seed ?? "");
    const interpolatorModel = String(this.interpolator_model ?? "film");
    const enableAutoDownsample = Boolean(this.enable_auto_downsample ?? false);
    const expandTop = Boolean(this.expand_top ?? false);
    const shift = Number(this.shift ?? 5);
    const expandLeft = Boolean(this.expand_left ?? false);
    const acceleration = String(this.acceleration ?? "regular");
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const matchInputNumFrames = Boolean(this.match_input_num_frames ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(
      this.negative_prompt ??
        "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const expandRight = Boolean(this.expand_right ?? false);
    const resolution = String(this.resolution ?? "auto");
    const returnFramesZip = Boolean(this.return_frames_zip ?? false);
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const matchInputFramesPerSecond = Boolean(
      this.match_input_frames_per_second ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_interpolated_frames: numInterpolatedFrames,
      temporal_downsample_factor: temporalDownsampleFactor,
      expand_ratio: expandRatio,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      auto_downsample_min_fps: autoDownsampleMinFps,
      expand_bottom: expandBottom,
      sampler: sampler,
      transparency_mode: transparencyMode,
      sync_mode: syncMode,
      video_quality: videoQuality,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      interpolator_model: interpolatorModel,
      enable_auto_downsample: enableAutoDownsample,
      expand_top: expandTop,
      shift: shift,
      expand_left: expandLeft,
      acceleration: acceleration,
      frames_per_second: framesPerSecond,
      match_input_num_frames: matchInputNumFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      expand_right: expandRight,
      resolution: resolution,
      return_frames_zip: returnFramesZip,
      aspect_ratio: aspectRatio,
      match_input_frames_per_second: matchInputFramesPerSecond,
      num_inference_steps: numInferenceSteps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const firstFrameUrlRef = this.first_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameUrlRef)) {
      const firstFrameUrlUrl = await assetToFalUrl(apiKey, firstFrameUrlRef!);
      if (firstFrameUrlUrl) args["first_frame_url"] = firstFrameUrlUrl;
    }

    const refImagesList = this.ref_images as
      | Record<string, unknown>[]
      | undefined;
    if (refImagesList?.length) {
      const refImagesUrls: string[] = [];
      for (const ref of refImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) refImagesUrls.push(u);
        }
      }
      if (refImagesUrls.length) args["ref_image_urls"] = refImagesUrls;
    }

    const lastFrameUrlRef = this.last_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameUrlRef)) {
      const lastFrameUrlUrl = await assetToFalUrl(apiKey, lastFrameUrlRef!);
      if (lastFrameUrlUrl) args["last_frame_url"] = lastFrameUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan-vace-14b/outpainting",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanVace14bInpainting extends FalNode {
  static readonly nodeType = "fal.video_to_video.WanVace14bInpainting";
  static readonly title = "Wan Vace14b Inpainting";
  static readonly description = `VACE is a video generation model that uses a source image, mask, and video to create prompted videos with controllable sources.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    frames_zip: "str",
    seed: "int",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "URL to the source video file. Required for inpainting."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Number of frames to interpolate between the original frames. A value of 0 means no interpolation."
  })
  declare num_interpolated_frames: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Temporal downsample factor for the video. This is an integer value that determines how many frames to skip in the video. A value of 0 means no downsampling. For each downsample factor, one upsample factor will automatically be applied."
  })
  declare temporal_downsample_factor: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the first frame of the video. If provided, the model will use this frame as a reference."
  })
  declare first_frame_url: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "Urls to source reference image. If provided, the model will use this image as reference."
  })
  declare ref_images: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "Guidance scale for classifier-free guidance. Higher values encourage the model to generate images closely related to the text prompt."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Number of frames to generate. Must be between 81 to 241 (inclusive)."
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 15,
    description:
      "The minimum frames per second to downsample the video to. This is used to help determine the auto downsample factor to try and find the lowest detail-preserving downsample factor. The default value is appropriate for most videos, if you are using a video with very fast motion, you may need to increase this value. If your video has a very low amount of motion, you could decrease this value to allow for higher downsampling and thus longer sequences."
  })
  declare auto_downsample_min_fps: any;

  @prop({
    type: "enum",
    default: "content_aware",
    values: ["content_aware", "white", "black"],
    description:
      "The transparency mode to apply to the first and last frames. This controls how the transparent areas of the first and last frames are filled."
  })
  declare transparency_mode: any;

  @prop({
    type: "enum",
    default: "unipc",
    values: ["unipc", "dpm++", "euler"],
    description: "Sampler to use for video generation."
  })
  declare sampler: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "video",
    default: "",
    description: "URL to the source mask file. Required for inpainting."
  })
  declare mask_video: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "film",
    values: ["rife", "film"],
    description:
      "The model to use for frame interpolation. Options are 'rife' or 'film'."
  })
  declare interpolator_model: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to preprocess the input video."
  })
  declare preprocess: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the model will automatically temporally downsample the video to an appropriate frame length for the model, then will interpolate it back to the original frame length."
  })
  declare enable_auto_downsample: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "regular",
    description:
      "Acceleration to use for inference. Options are 'none' or 'regular'. Accelerated inference will very slightly affect output, but will be significantly faster."
  })
  declare acceleration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL to the guiding mask file. If provided, the model will use this mask as a reference to create masked video using salient mask tracking. Will be ignored if mask_video_url is provided."
  })
  declare mask_image: any;

  @prop({
    type: "str",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 5 to 30. Ignored if match_input_frames_per_second is true."
  })
  declare frames_per_second: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the number of frames in the generated video will match the number of frames in the input video. If false, the number of frames will be determined by the num_frames parameter."
  })
  declare match_input_num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default:
      "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "240p", "360p", "480p", "580p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "1:1", "9:16"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, also return a ZIP file containing all generated frames."
  })
  declare return_frames_zip: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the frames per second of the generated video will match the input video. If false, the frames per second will be determined by the frames_per_second parameter."
  })
  declare match_input_frames_per_second: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the last frame of the video. If provided, the model will use this frame as a reference."
  })
  declare last_frame_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 0);
    const temporalDownsampleFactor = Number(
      this.temporal_downsample_factor ?? 0
    );
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const numFrames = Number(this.num_frames ?? 81);
    const autoDownsampleMinFps = Number(this.auto_downsample_min_fps ?? 15);
    const transparencyMode = String(this.transparency_mode ?? "content_aware");
    const sampler = String(this.sampler ?? "unipc");
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const seed = String(this.seed ?? "");
    const interpolatorModel = String(this.interpolator_model ?? "film");
    const preprocess = Boolean(this.preprocess ?? false);
    const enableAutoDownsample = Boolean(this.enable_auto_downsample ?? false);
    const shift = Number(this.shift ?? 5);
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const acceleration = String(this.acceleration ?? "regular");
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const matchInputNumFrames = Boolean(this.match_input_num_frames ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(
      this.negative_prompt ??
        "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const resolution = String(this.resolution ?? "auto");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const returnFramesZip = Boolean(this.return_frames_zip ?? false);
    const matchInputFramesPerSecond = Boolean(
      this.match_input_frames_per_second ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_interpolated_frames: numInterpolatedFrames,
      temporal_downsample_factor: temporalDownsampleFactor,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      auto_downsample_min_fps: autoDownsampleMinFps,
      transparency_mode: transparencyMode,
      sampler: sampler,
      video_quality: videoQuality,
      sync_mode: syncMode,
      seed: seed,
      interpolator_model: interpolatorModel,
      preprocess: preprocess,
      enable_auto_downsample: enableAutoDownsample,
      shift: shift,
      enable_prompt_expansion: enablePromptExpansion,
      acceleration: acceleration,
      frames_per_second: framesPerSecond,
      match_input_num_frames: matchInputNumFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      return_frames_zip: returnFramesZip,
      match_input_frames_per_second: matchInputFramesPerSecond,
      num_inference_steps: numInferenceSteps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const firstFrameUrlRef = this.first_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameUrlRef)) {
      const firstFrameUrlUrl = await assetToFalUrl(apiKey, firstFrameUrlRef!);
      if (firstFrameUrlUrl) args["first_frame_url"] = firstFrameUrlUrl;
    }

    const refImagesList = this.ref_images as
      | Record<string, unknown>[]
      | undefined;
    if (refImagesList?.length) {
      const refImagesUrls: string[] = [];
      for (const ref of refImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) refImagesUrls.push(u);
        }
      }
      if (refImagesUrls.length) args["ref_image_urls"] = refImagesUrls;
    }

    const maskVideoRef = this.mask_video as Record<string, unknown> | undefined;
    if (isRefSet(maskVideoRef)) {
      const maskVideoUrl = await assetToFalUrl(apiKey, maskVideoRef!);
      if (maskVideoUrl) args["mask_video_url"] = maskVideoUrl;
    }

    const maskImageRef = this.mask_image as Record<string, unknown> | undefined;
    if (isRefSet(maskImageRef)) {
      const maskImageUrl =
        (await imageToDataUrl(maskImageRef!)) ??
        (await assetToFalUrl(apiKey, maskImageRef!));
      if (maskImageUrl) args["mask_image_url"] = maskImageUrl;
    }

    const lastFrameUrlRef = this.last_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameUrlRef)) {
      const lastFrameUrlUrl = await assetToFalUrl(apiKey, lastFrameUrlRef!);
      if (lastFrameUrlUrl) args["last_frame_url"] = lastFrameUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-vace-14b/inpainting", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanVace14bPose extends FalNode {
  static readonly nodeType = "fal.video_to_video.WanVace14bPose";
  static readonly title = "Wan Vace14b Pose";
  static readonly description = `VACE is a video generation model that uses a source image, mask, and video to create prompted videos with controllable sources.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    frames_zip: "str",
    seed: "int",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "The text prompt to guide video generation. For pose task, the prompt should describe the desired pose and action of the subject in the video."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "URL to the source video file. Required for pose task."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Number of frames to interpolate between the original frames. A value of 0 means no interpolation."
  })
  declare num_interpolated_frames: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Temporal downsample factor for the video. This is an integer value that determines how many frames to skip in the video. A value of 0 means no downsampling. For each downsample factor, one upsample factor will automatically be applied."
  })
  declare temporal_downsample_factor: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the first frame of the video. If provided, the model will use this frame as a reference."
  })
  declare first_frame_url: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "URLs to source reference image. If provided, the model will use this image as reference."
  })
  declare ref_images: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "Guidance scale for classifier-free guidance. Higher values encourage the model to generate images closely related to the text prompt."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Number of frames to generate. Must be between 81 to 241 (inclusive)."
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 15,
    description:
      "The minimum frames per second to downsample the video to. This is used to help determine the auto downsample factor to try and find the lowest detail-preserving downsample factor. The default value is appropriate for most videos, if you are using a video with very fast motion, you may need to increase this value. If your video has a very low amount of motion, you could decrease this value to allow for higher downsampling and thus longer sequences."
  })
  declare auto_downsample_min_fps: any;

  @prop({
    type: "enum",
    default: "content_aware",
    values: ["content_aware", "white", "black"],
    description:
      "The transparency mode to apply to the first and last frames. This controls how the transparent areas of the first and last frames are filled."
  })
  declare transparency_mode: any;

  @prop({
    type: "enum",
    default: "unipc",
    values: ["unipc", "dpm++", "euler"],
    description: "Sampler to use for video generation."
  })
  declare sampler: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "film",
    values: ["rife", "film"],
    description:
      "The model to use for frame interpolation. Options are 'rife' or 'film'."
  })
  declare interpolator_model: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to preprocess the input video."
  })
  declare preprocess: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the model will automatically temporally downsample the video to an appropriate frame length for the model, then will interpolate it back to the original frame length."
  })
  declare enable_auto_downsample: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "str",
    default: "regular",
    description:
      "Acceleration to use for inference. Options are 'none' or 'regular'. Accelerated inference will very slightly affect output, but will be significantly faster."
  })
  declare acceleration: any;

  @prop({
    type: "str",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 5 to 30. Ignored if match_input_frames_per_second is true."
  })
  declare frames_per_second: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the number of frames in the generated video will match the number of frames in the input video. If false, the number of frames will be determined by the num_frames parameter."
  })
  declare match_input_num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default:
      "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "240p", "360p", "480p", "580p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, also return a ZIP file containing all generated frames."
  })
  declare return_frames_zip: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "1:1", "9:16"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the frames per second of the generated video will match the input video. If false, the frames per second will be determined by the frames_per_second parameter."
  })
  declare match_input_frames_per_second: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the last frame of the video. If provided, the model will use this frame as a reference."
  })
  declare last_frame_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 0);
    const temporalDownsampleFactor = Number(
      this.temporal_downsample_factor ?? 0
    );
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const numFrames = Number(this.num_frames ?? 81);
    const autoDownsampleMinFps = Number(this.auto_downsample_min_fps ?? 15);
    const transparencyMode = String(this.transparency_mode ?? "content_aware");
    const sampler = String(this.sampler ?? "unipc");
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const seed = String(this.seed ?? "");
    const interpolatorModel = String(this.interpolator_model ?? "film");
    const preprocess = Boolean(this.preprocess ?? false);
    const enableAutoDownsample = Boolean(this.enable_auto_downsample ?? false);
    const shift = Number(this.shift ?? 5);
    const acceleration = String(this.acceleration ?? "regular");
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const matchInputNumFrames = Boolean(this.match_input_num_frames ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(
      this.negative_prompt ??
        "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const resolution = String(this.resolution ?? "auto");
    const returnFramesZip = Boolean(this.return_frames_zip ?? false);
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const matchInputFramesPerSecond = Boolean(
      this.match_input_frames_per_second ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_interpolated_frames: numInterpolatedFrames,
      temporal_downsample_factor: temporalDownsampleFactor,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      auto_downsample_min_fps: autoDownsampleMinFps,
      transparency_mode: transparencyMode,
      sampler: sampler,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      interpolator_model: interpolatorModel,
      preprocess: preprocess,
      enable_auto_downsample: enableAutoDownsample,
      shift: shift,
      acceleration: acceleration,
      frames_per_second: framesPerSecond,
      match_input_num_frames: matchInputNumFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      resolution: resolution,
      return_frames_zip: returnFramesZip,
      aspect_ratio: aspectRatio,
      match_input_frames_per_second: matchInputFramesPerSecond,
      num_inference_steps: numInferenceSteps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const firstFrameUrlRef = this.first_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameUrlRef)) {
      const firstFrameUrlUrl = await assetToFalUrl(apiKey, firstFrameUrlRef!);
      if (firstFrameUrlUrl) args["first_frame_url"] = firstFrameUrlUrl;
    }

    const refImagesList = this.ref_images as
      | Record<string, unknown>[]
      | undefined;
    if (refImagesList?.length) {
      const refImagesUrls: string[] = [];
      for (const ref of refImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) refImagesUrls.push(u);
        }
      }
      if (refImagesUrls.length) args["ref_image_urls"] = refImagesUrls;
    }

    const lastFrameUrlRef = this.last_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameUrlRef)) {
      const lastFrameUrlUrl = await assetToFalUrl(apiKey, lastFrameUrlRef!);
      if (lastFrameUrlUrl) args["last_frame_url"] = lastFrameUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-vace-14b/pose", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanVace14bDepth extends FalNode {
  static readonly nodeType = "fal.video_to_video.WanVace14bDepth";
  static readonly title = "Wan Vace14b Depth";
  static readonly description = `VACE is a video generation model that uses a source image, mask, and video to create prompted videos with controllable sources.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    frames_zip: "str",
    seed: "int",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "URL to the source video file. Required for depth task."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Number of frames to interpolate between the original frames. A value of 0 means no interpolation."
  })
  declare num_interpolated_frames: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Temporal downsample factor for the video. This is an integer value that determines how many frames to skip in the video. A value of 0 means no downsampling. For each downsample factor, one upsample factor will automatically be applied."
  })
  declare temporal_downsample_factor: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the first frame of the video. If provided, the model will use this frame as a reference."
  })
  declare first_frame_url: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "URLs to source reference image. If provided, the model will use this image as reference."
  })
  declare ref_images: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "Guidance scale for classifier-free guidance. Higher values encourage the model to generate images closely related to the text prompt."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Number of frames to generate. Must be between 81 to 241 (inclusive)."
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 15,
    description:
      "The minimum frames per second to downsample the video to. This is used to help determine the auto downsample factor to try and find the lowest detail-preserving downsample factor. The default value is appropriate for most videos, if you are using a video with very fast motion, you may need to increase this value. If your video has a very low amount of motion, you could decrease this value to allow for higher downsampling and thus longer sequences."
  })
  declare auto_downsample_min_fps: any;

  @prop({
    type: "enum",
    default: "content_aware",
    values: ["content_aware", "white", "black"],
    description:
      "The transparency mode to apply to the first and last frames. This controls how the transparent areas of the first and last frames are filled."
  })
  declare transparency_mode: any;

  @prop({
    type: "enum",
    default: "unipc",
    values: ["unipc", "dpm++", "euler"],
    description: "Sampler to use for video generation."
  })
  declare sampler: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "film",
    values: ["rife", "film"],
    description:
      "The model to use for frame interpolation. Options are 'rife' or 'film'."
  })
  declare interpolator_model: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to preprocess the input video."
  })
  declare preprocess: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the model will automatically temporally downsample the video to an appropriate frame length for the model, then will interpolate it back to the original frame length."
  })
  declare enable_auto_downsample: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "str",
    default: "regular",
    description:
      "Acceleration to use for inference. Options are 'none' or 'regular'. Accelerated inference will very slightly affect output, but will be significantly faster."
  })
  declare acceleration: any;

  @prop({
    type: "str",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 5 to 30. Ignored if match_input_frames_per_second is true."
  })
  declare frames_per_second: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the number of frames in the generated video will match the number of frames in the input video. If false, the number of frames will be determined by the num_frames parameter."
  })
  declare match_input_num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default:
      "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "240p", "360p", "480p", "580p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, also return a ZIP file containing all generated frames."
  })
  declare return_frames_zip: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "1:1", "9:16"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the frames per second of the generated video will match the input video. If false, the frames per second will be determined by the frames_per_second parameter."
  })
  declare match_input_frames_per_second: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the last frame of the video. If provided, the model will use this frame as a reference."
  })
  declare last_frame_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 0);
    const temporalDownsampleFactor = Number(
      this.temporal_downsample_factor ?? 0
    );
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const numFrames = Number(this.num_frames ?? 81);
    const autoDownsampleMinFps = Number(this.auto_downsample_min_fps ?? 15);
    const transparencyMode = String(this.transparency_mode ?? "content_aware");
    const sampler = String(this.sampler ?? "unipc");
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const seed = String(this.seed ?? "");
    const interpolatorModel = String(this.interpolator_model ?? "film");
    const preprocess = Boolean(this.preprocess ?? false);
    const enableAutoDownsample = Boolean(this.enable_auto_downsample ?? false);
    const shift = Number(this.shift ?? 5);
    const acceleration = String(this.acceleration ?? "regular");
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const matchInputNumFrames = Boolean(this.match_input_num_frames ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(
      this.negative_prompt ??
        "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const resolution = String(this.resolution ?? "auto");
    const returnFramesZip = Boolean(this.return_frames_zip ?? false);
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const matchInputFramesPerSecond = Boolean(
      this.match_input_frames_per_second ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_interpolated_frames: numInterpolatedFrames,
      temporal_downsample_factor: temporalDownsampleFactor,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      auto_downsample_min_fps: autoDownsampleMinFps,
      transparency_mode: transparencyMode,
      sampler: sampler,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      interpolator_model: interpolatorModel,
      preprocess: preprocess,
      enable_auto_downsample: enableAutoDownsample,
      shift: shift,
      acceleration: acceleration,
      frames_per_second: framesPerSecond,
      match_input_num_frames: matchInputNumFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      resolution: resolution,
      return_frames_zip: returnFramesZip,
      aspect_ratio: aspectRatio,
      match_input_frames_per_second: matchInputFramesPerSecond,
      num_inference_steps: numInferenceSteps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const firstFrameUrlRef = this.first_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameUrlRef)) {
      const firstFrameUrlUrl = await assetToFalUrl(apiKey, firstFrameUrlRef!);
      if (firstFrameUrlUrl) args["first_frame_url"] = firstFrameUrlUrl;
    }

    const refImagesList = this.ref_images as
      | Record<string, unknown>[]
      | undefined;
    if (refImagesList?.length) {
      const refImagesUrls: string[] = [];
      for (const ref of refImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) refImagesUrls.push(u);
        }
      }
      if (refImagesUrls.length) args["ref_image_urls"] = refImagesUrls;
    }

    const lastFrameUrlRef = this.last_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameUrlRef)) {
      const lastFrameUrlUrl = await assetToFalUrl(apiKey, lastFrameUrlRef!);
      if (lastFrameUrlUrl) args["last_frame_url"] = lastFrameUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-vace-14b/depth", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class DwposeVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.DwposeVideo";
  static readonly title = "Dwpose Video";
  static readonly description = `Predict poses from videos.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "video",
    default: "",
    description: "URL of video to be used for pose estimation"
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "body-pose",
    values: [
      "full-pose",
      "body-pose",
      "face-pose",
      "hand-pose",
      "face-hand-mask",
      "face-mask",
      "hand-mask"
    ],
    description:
      "Mode of drawing the pose on the video. Options are: 'full-pose', 'body-pose', 'face-pose', 'hand-pose', 'face-hand-mask', 'face-mask', 'hand-mask'."
  })
  declare draw_mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const drawMode = String(this.draw_mode ?? "body-pose");

    const args: Record<string, unknown> = {
      draw_mode: drawMode
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/dwpose/video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class FfmpegApiMergeAudioVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.FfmpegApiMergeAudioVideo";
  static readonly title = "Ffmpeg Api Merge Audio Video";
  static readonly description = `Merge videos with standalone audio files or audio from video files.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "video",
    default: "",
    description: "URL of the video file to use as the video track"
  })
  declare video: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Offset in seconds for when the audio should start relative to the video"
  })
  declare start_offset: any;

  @prop({
    type: "audio",
    default: "",
    description: "URL of the audio file to use as the audio track"
  })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const startOffset = Number(this.start_offset ?? 0);

    const args: Record<string, unknown> = {
      start_offset: startOffset
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ffmpeg-api/merge-audio-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanVace13b extends FalNode {
  static readonly nodeType = "fal.video_to_video.WanVace13b";
  static readonly title = "Wan Vace13b";
  static readonly description = `Vace a video generation model that uses a source image, mask, and video to create prompted videos with controllable sources.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the source video file. If provided, the model will use this video as a reference."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL to the guiding mask file. If provided, the model will use this mask as a reference to create masked video. If provided mask video url will be ignored."
  })
  declare mask_image: any;

  @prop({
    type: "enum",
    default: "depth",
    values: ["depth", "inpainting", "pose"],
    description: "Task type for the model."
  })
  declare task: any;

  @prop({
    type: "int",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 5 to 24."
  })
  declare frames_per_second: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "Urls to source reference image. If provided, the model will use this image as reference."
  })
  declare ref_images: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Number of frames to generate. Must be between 81 to 100 (inclusive). Works only with only reference images as input if source video or mask video is provided output len would be same as source up to 241 frames"
  })
  declare num_frames: any;

  @prop({
    type: "str",
    default:
      "bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "580p", "720p"],
    description: "Resolution of the generated video (480p,580p, or 720p)."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["auto", "9:16", "16:9"],
    description: "Aspect ratio of the generated video (16:9 or 9:16)."
  })
  declare aspect_ratio: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the source mask file. If provided, the model will use this mask as a reference."
  })
  declare mask_video: any;

  @prop({
    type: "int",
    default: -1,
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to preprocess the input video."
  })
  declare preprocess: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const shift = Number(this.shift ?? 5);
    const prompt = String(this.prompt ?? "");
    const task = String(this.task ?? "depth");
    const framesPerSecond = Number(this.frames_per_second ?? 16);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const numFrames = Number(this.num_frames ?? 81);
    const negativePrompt = String(
      this.negative_prompt ??
        "bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const seed = Number(this.seed ?? -1);
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const preprocess = Boolean(this.preprocess ?? false);
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );

    const args: Record<string, unknown> = {
      shift: shift,
      prompt: prompt,
      task: task,
      frames_per_second: framesPerSecond,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      negative_prompt: negativePrompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      seed: seed,
      num_inference_steps: numInferenceSteps,
      preprocess: preprocess,
      enable_prompt_expansion: enablePromptExpansion
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const maskImageRef = this.mask_image as Record<string, unknown> | undefined;
    if (isRefSet(maskImageRef)) {
      const maskImageUrl =
        (await imageToDataUrl(maskImageRef!)) ??
        (await assetToFalUrl(apiKey, maskImageRef!));
      if (maskImageUrl) args["mask_image_url"] = maskImageUrl;
    }

    const refImagesList = this.ref_images as
      | Record<string, unknown>[]
      | undefined;
    if (refImagesList?.length) {
      const refImagesUrls: string[] = [];
      for (const ref of refImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) refImagesUrls.push(u);
        }
      }
      if (refImagesUrls.length) args["ref_image_urls"] = refImagesUrls;
    }

    const maskVideoRef = this.mask_video as Record<string, unknown> | undefined;
    if (isRefSet(maskVideoRef)) {
      const maskVideoUrl = await assetToFalUrl(apiKey, maskVideoRef!);
      if (maskVideoUrl) args["mask_video_url"] = maskVideoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-vace-1-3b", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LumaDreamMachineRay2FlashReframe extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.LumaDreamMachineRay2FlashReframe";
  static readonly title = "Luma Dream Machine Ray2 Flash Reframe";
  static readonly description = `Adjust and enhance videos with Ray-2 Reframe. This advanced tool seamlessly reframes videos to your desired aspect ratio, intelligently inpainting missing regions to ensure realistic visuals and coherent motion, delivering exceptional quality and creative flexibility.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Optional prompt for reframing"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"],
    description: "The aspect ratio of the reframed video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "Start Y coordinate for reframing"
  })
  declare y_start: any;

  @prop({
    type: "str",
    default: "",
    description: "End X coordinate for reframing"
  })
  declare x_end: any;

  @prop({
    type: "video",
    default: "",
    description: "URL of the input video to reframe"
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description: "End Y coordinate for reframing"
  })
  declare y_end: any;

  @prop({
    type: "str",
    default: "",
    description: "Y position of the grid for reframing"
  })
  declare grid_position_y: any;

  @prop({
    type: "image",
    default: "",
    description: "Optional URL of the first frame image for reframing"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "X position of the grid for reframing"
  })
  declare grid_position_x: any;

  @prop({
    type: "str",
    default: "",
    description: "Start X coordinate for reframing"
  })
  declare x_start: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "");
    const yStart = String(this.y_start ?? "");
    const xEnd = String(this.x_end ?? "");
    const yEnd = String(this.y_end ?? "");
    const gridPositionY = String(this.grid_position_y ?? "");
    const gridPositionX = String(this.grid_position_x ?? "");
    const xStart = String(this.x_start ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      y_start: yStart,
      x_end: xEnd,
      y_end: yEnd,
      grid_position_y: gridPositionY,
      grid_position_x: gridPositionX,
      x_start: xStart
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/luma-dream-machine/ray-2-flash/reframe",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LumaDreamMachineRay2Reframe extends FalNode {
  static readonly nodeType = "fal.video_to_video.LumaDreamMachineRay2Reframe";
  static readonly title = "Luma Dream Machine Ray2 Reframe";
  static readonly description = `Adjust and enhance videos with Ray-2 Reframe. This advanced tool seamlessly reframes videos to your desired aspect ratio, intelligently inpainting missing regions to ensure realistic visuals and coherent motion, delivering exceptional quality and creative flexibility.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Optional prompt for reframing"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"],
    description: "The aspect ratio of the reframed video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "Start Y coordinate for reframing"
  })
  declare y_start: any;

  @prop({
    type: "str",
    default: "",
    description: "End X coordinate for reframing"
  })
  declare x_end: any;

  @prop({
    type: "video",
    default: "",
    description: "URL of the input video to reframe"
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description: "End Y coordinate for reframing"
  })
  declare y_end: any;

  @prop({
    type: "str",
    default: "",
    description: "Y position of the grid for reframing"
  })
  declare grid_position_y: any;

  @prop({
    type: "image",
    default: "",
    description: "Optional URL of the first frame image for reframing"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "X position of the grid for reframing"
  })
  declare grid_position_x: any;

  @prop({
    type: "str",
    default: "",
    description: "Start X coordinate for reframing"
  })
  declare x_start: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "");
    const yStart = String(this.y_start ?? "");
    const xEnd = String(this.x_end ?? "");
    const yEnd = String(this.y_end ?? "");
    const gridPositionY = String(this.grid_position_y ?? "");
    const gridPositionX = String(this.grid_position_x ?? "");
    const xStart = String(this.x_start ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      y_start: yStart,
      x_end: xEnd,
      y_end: yEnd,
      grid_position_y: gridPositionY,
      grid_position_x: gridPositionX,
      x_start: xStart
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/luma-dream-machine/ray-2/reframe",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class VeedLipsync extends FalNode {
  static readonly nodeType = "fal.video_to_video.VeedLipsync";
  static readonly title = "Veed Lipsync";
  static readonly description = `Generate realistic lipsync from any audio using VEED's latest model
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "video", default: "" })
  declare video: any;

  @prop({ type: "audio", default: "" })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "veed/lipsync", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanVace14b extends FalNode {
  static readonly nodeType = "fal.video_to_video.WanVace14b";
  static readonly title = "Wan Vace14b";
  static readonly description = `VACE is a video generation model that uses a source image, mask, and video to create prompted videos with controllable sources.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    frames_zip: "str",
    seed: "int",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the source video file. If provided, the model will use this video as a reference."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Number of frames to interpolate between the original frames. A value of 0 means no interpolation."
  })
  declare num_interpolated_frames: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Temporal downsample factor for the video. This is an integer value that determines how many frames to skip in the video. A value of 0 means no downsampling. For each downsample factor, one upsample factor will automatically be applied."
  })
  declare temporal_downsample_factor: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the first frame of the video. If provided, the model will use this frame as a reference."
  })
  declare first_frame_url: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "URLs to source reference image. If provided, the model will use this image as reference."
  })
  declare ref_images: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "Guidance scale for classifier-free guidance. Higher values encourage the model to generate images closely related to the text prompt."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Number of frames to generate. Must be between 81 to 241 (inclusive)."
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 15,
    description:
      "The minimum frames per second to downsample the video to. This is used to help determine the auto downsample factor to try and find the lowest detail-preserving downsample factor. The default value is appropriate for most videos, if you are using a video with very fast motion, you may need to increase this value. If your video has a very low amount of motion, you could decrease this value to allow for higher downsampling and thus longer sequences."
  })
  declare auto_downsample_min_fps: any;

  @prop({
    type: "enum",
    default: "content_aware",
    values: ["content_aware", "white", "black"],
    description:
      "The transparency mode to apply to the first and last frames. This controls how the transparent areas of the first and last frames are filled."
  })
  declare transparency_mode: any;

  @prop({
    type: "enum",
    default: "unipc",
    values: ["unipc", "dpm++", "euler"],
    description: "Sampler to use for video generation."
  })
  declare sampler: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the source mask file. If provided, the model will use this mask as a reference."
  })
  declare mask_video: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "film",
    values: ["rife", "film"],
    description:
      "The model to use for frame interpolation. Options are 'rife' or 'film'."
  })
  declare interpolator_model: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to preprocess the input video."
  })
  declare preprocess: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the model will automatically temporally downsample the video to an appropriate frame length for the model, then will interpolate it back to the original frame length."
  })
  declare enable_auto_downsample: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "regular",
    description:
      "Acceleration to use for inference. Options are 'none' or 'regular'. Accelerated inference will very slightly affect output, but will be significantly faster."
  })
  declare acceleration: any;

  @prop({
    type: "enum",
    default: "depth",
    values: ["depth", "pose", "inpainting", "outpainting", "reframe"],
    description: "Task type for the model."
  })
  declare task: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL to the guiding mask file. If provided, the model will use this mask as a reference to create masked video. If provided mask video url will be ignored."
  })
  declare mask_image: any;

  @prop({
    type: "str",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 5 to 30. Ignored if match_input_frames_per_second is true."
  })
  declare frames_per_second: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the number of frames in the generated video will match the number of frames in the input video. If false, the number of frames will be determined by the num_frames parameter."
  })
  declare match_input_num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default:
      "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "240p", "360p", "480p", "580p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "1:1", "9:16"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, also return a ZIP file containing all generated frames."
  })
  declare return_frames_zip: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the frames per second of the generated video will match the input video. If false, the frames per second will be determined by the frames_per_second parameter."
  })
  declare match_input_frames_per_second: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the last frame of the video. If provided, the model will use this frame as a reference."
  })
  declare last_frame_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 0);
    const temporalDownsampleFactor = Number(
      this.temporal_downsample_factor ?? 0
    );
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const numFrames = Number(this.num_frames ?? 81);
    const autoDownsampleMinFps = Number(this.auto_downsample_min_fps ?? 15);
    const transparencyMode = String(this.transparency_mode ?? "content_aware");
    const sampler = String(this.sampler ?? "unipc");
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const seed = String(this.seed ?? "");
    const interpolatorModel = String(this.interpolator_model ?? "film");
    const preprocess = Boolean(this.preprocess ?? false);
    const enableAutoDownsample = Boolean(this.enable_auto_downsample ?? false);
    const shift = Number(this.shift ?? 5);
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const acceleration = String(this.acceleration ?? "regular");
    const task = String(this.task ?? "depth");
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const matchInputNumFrames = Boolean(this.match_input_num_frames ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(
      this.negative_prompt ??
        "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const resolution = String(this.resolution ?? "auto");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const returnFramesZip = Boolean(this.return_frames_zip ?? false);
    const matchInputFramesPerSecond = Boolean(
      this.match_input_frames_per_second ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_interpolated_frames: numInterpolatedFrames,
      temporal_downsample_factor: temporalDownsampleFactor,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      auto_downsample_min_fps: autoDownsampleMinFps,
      transparency_mode: transparencyMode,
      sampler: sampler,
      video_quality: videoQuality,
      sync_mode: syncMode,
      seed: seed,
      interpolator_model: interpolatorModel,
      preprocess: preprocess,
      enable_auto_downsample: enableAutoDownsample,
      shift: shift,
      enable_prompt_expansion: enablePromptExpansion,
      acceleration: acceleration,
      task: task,
      frames_per_second: framesPerSecond,
      match_input_num_frames: matchInputNumFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      return_frames_zip: returnFramesZip,
      match_input_frames_per_second: matchInputFramesPerSecond,
      num_inference_steps: numInferenceSteps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const firstFrameUrlRef = this.first_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameUrlRef)) {
      const firstFrameUrlUrl = await assetToFalUrl(apiKey, firstFrameUrlRef!);
      if (firstFrameUrlUrl) args["first_frame_url"] = firstFrameUrlUrl;
    }

    const refImagesList = this.ref_images as
      | Record<string, unknown>[]
      | undefined;
    if (refImagesList?.length) {
      const refImagesUrls: string[] = [];
      for (const ref of refImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) refImagesUrls.push(u);
        }
      }
      if (refImagesUrls.length) args["ref_image_urls"] = refImagesUrls;
    }

    const maskVideoRef = this.mask_video as Record<string, unknown> | undefined;
    if (isRefSet(maskVideoRef)) {
      const maskVideoUrl = await assetToFalUrl(apiKey, maskVideoRef!);
      if (maskVideoUrl) args["mask_video_url"] = maskVideoUrl;
    }

    const maskImageRef = this.mask_image as Record<string, unknown> | undefined;
    if (isRefSet(maskImageRef)) {
      const maskImageUrl =
        (await imageToDataUrl(maskImageRef!)) ??
        (await assetToFalUrl(apiKey, maskImageRef!));
      if (maskImageUrl) args["mask_image_url"] = maskImageUrl;
    }

    const lastFrameUrlRef = this.last_frame_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameUrlRef)) {
      const lastFrameUrlUrl = await assetToFalUrl(apiKey, lastFrameUrlRef!);
      if (lastFrameUrlUrl) args["last_frame_url"] = lastFrameUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-vace-14b", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LtxVideo13bDistilledExtend extends FalNode {
  static readonly nodeType = "fal.video_to_video.LtxVideo13bDistilledExtend";
  static readonly title = "Ltx Video13b Distilled Extend";
  static readonly description = `Extend videos using LTX Video-0.9.7 13B Distilled and custom LoRA
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "int",
    default: 5,
    description:
      "The number of inference steps to skip in the initial steps of the second pass. By skipping some steps at the beginning, the second pass can focus on smaller details instead of larger changes."
  })
  declare second_pass_skip_initial_steps: any;

  @prop({
    type: "int",
    default: 8,
    description: "Number of inference steps during the first pass."
  })
  declare first_pass_num_inference_steps: any;

  @prop({
    type: "int",
    default: 24,
    description: "The frame rate of the video."
  })
  declare frame_rate: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to reverse the video."
  })
  declare reverse_video: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt to guide generation"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to expand the prompt using a language model."
  })
  declare expand_prompt: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "The factor for adaptive instance normalization (AdaIN) applied to generated video chunks after the first. This can help deal with a gradual increase in saturation/contrast in the generated video by normalizing the color distribution across the video. A high value will ensure the color distribution is more consistent across the video, while a low value will allow for more variation in color distribution."
  })
  declare temporal_adain_factor: any;

  @prop({
    type: "list[LoRAWeight]",
    default: [],
    description: "LoRA weights to use for generation"
  })
  declare loras: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames in the video."
  })
  declare num_frames: any;

  @prop({
    type: "int",
    default: 8,
    description: "Number of inference steps during the second pass."
  })
  declare second_pass_num_inference_steps: any;

  @prop({
    type: "str",
    default: "worst quality, inconsistent motion, blurry, jittery, distorted",
    description: "Negative prompt for generation"
  })
  declare negative_prompt: any;

  @prop({ type: "video", default: "", description: "Video to be extended." })
  declare video: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to use a detail pass. If True, the model will perform a second pass to refine the video and enhance details. This incurs a 2.0x cost multiplier on the base price."
  })
  declare enable_detail_pass: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["9:16", "1:1", "16:9", "auto"],
    description: "The aspect ratio of the video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "The compression ratio for tone mapping. This is used to compress the dynamic range of the video to improve visual quality. A value of 0.0 means no compression, while a value of 1.0 means maximum compression."
  })
  declare tone_map_compression_ratio: any;

  @prop({
    type: "int",
    default: 29,
    description:
      "The constant rate factor (CRF) to compress input media with. Compressed input media more closely matches the model's training data, which can improve motion quality."
  })
  declare constant_rate_factor: any;

  @prop({ type: "str", default: "", description: "Random seed for generation" })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const secondPassSkipInitialSteps = Number(
      this.second_pass_skip_initial_steps ?? 5
    );
    const firstPassNumInferenceSteps = Number(
      this.first_pass_num_inference_steps ?? 8
    );
    const frameRate = Number(this.frame_rate ?? 24);
    const reverseVideo = Boolean(this.reverse_video ?? false);
    const prompt = String(this.prompt ?? "");
    const expandPrompt = Boolean(this.expand_prompt ?? false);
    const temporalAdainFactor = Number(this.temporal_adain_factor ?? 0.5);
    const loras = String(this.loras ?? []);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 121);
    const secondPassNumInferenceSteps = Number(
      this.second_pass_num_inference_steps ?? 8
    );
    const negativePrompt = String(
      this.negative_prompt ??
        "worst quality, inconsistent motion, blurry, jittery, distorted"
    );
    const enableDetailPass = Boolean(this.enable_detail_pass ?? false);
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "720p");
    const toneMapCompressionRatio = Number(
      this.tone_map_compression_ratio ?? 0
    );
    const constantRateFactor = Number(this.constant_rate_factor ?? 29);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      second_pass_skip_initial_steps: secondPassSkipInitialSteps,
      first_pass_num_inference_steps: firstPassNumInferenceSteps,
      frame_rate: frameRate,
      reverse_video: reverseVideo,
      prompt: prompt,
      expand_prompt: expandPrompt,
      temporal_adain_factor: temporalAdainFactor,
      loras: loras,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      second_pass_num_inference_steps: secondPassNumInferenceSteps,
      negative_prompt: negativePrompt,
      enable_detail_pass: enableDetailPass,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      tone_map_compression_ratio: toneMapCompressionRatio,
      constant_rate_factor: constantRateFactor,
      seed: seed
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) {
        args["video"] = {
          video_url: videoUrl,
          start_frame_num: Number((this as any).start_frame_num ?? 0),
          reverse_video: Boolean((this as any).reverse_video ?? false),
          limit_num_frames: Boolean((this as any).limit_num_frames ?? false),
          resample_fps: Boolean((this as any).resample_fps ?? false),
          strength: Number((this as any).strength ?? 0),
          target_fps: Number((this as any).target_fps ?? 0),
          max_num_frames: Number((this as any).max_num_frames ?? 0)
        };
      }
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-video-13b-distilled/extend",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LtxVideo13bDistilledMulticonditioning extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.LtxVideo13bDistilledMulticonditioning";
  static readonly title = "Ltx Video13b Distilled Multiconditioning";
  static readonly description = `Generate videos from prompts, images, and videos using LTX Video-0.9.7 13B Distilled and custom LoRA
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "int",
    default: 5,
    description:
      "The number of inference steps to skip in the initial steps of the second pass. By skipping some steps at the beginning, the second pass can focus on smaller details instead of larger changes."
  })
  declare second_pass_skip_initial_steps: any;

  @prop({
    type: "int",
    default: 8,
    description: "Number of inference steps during the first pass."
  })
  declare first_pass_num_inference_steps: any;

  @prop({
    type: "int",
    default: 24,
    description: "The frame rate of the video."
  })
  declare frame_rate: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to reverse the video."
  })
  declare reverse_video: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt to guide generation"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to expand the prompt using a language model."
  })
  declare expand_prompt: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "The factor for adaptive instance normalization (AdaIN) applied to generated video chunks after the first. This can help deal with a gradual increase in saturation/contrast in the generated video by normalizing the color distribution across the video. A high value will ensure the color distribution is more consistent across the video, while a low value will allow for more variation in color distribution."
  })
  declare temporal_adain_factor: any;

  @prop({
    type: "list[LoRAWeight]",
    default: [],
    description: "LoRA weights to use for generation"
  })
  declare loras: any;

  @prop({
    type: "list[ImageConditioningInput]",
    default: [],
    description: "URL of images to use as conditioning"
  })
  declare images: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames in the video."
  })
  declare num_frames: any;

  @prop({
    type: "int",
    default: 8,
    description: "Number of inference steps during the second pass."
  })
  declare second_pass_num_inference_steps: any;

  @prop({
    type: "str",
    default: "worst quality, inconsistent motion, blurry, jittery, distorted",
    description: "Negative prompt for generation"
  })
  declare negative_prompt: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to use a detail pass. If True, the model will perform a second pass to refine the video and enhance details. This incurs a 2.0x cost multiplier on the base price."
  })
  declare enable_detail_pass: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["9:16", "1:1", "16:9", "auto"],
    description: "The aspect ratio of the video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "The compression ratio for tone mapping. This is used to compress the dynamic range of the video to improve visual quality. A value of 0.0 means no compression, while a value of 1.0 means maximum compression."
  })
  declare tone_map_compression_ratio: any;

  @prop({
    type: "list[VideoConditioningInput]",
    default: [],
    description: "Videos to use as conditioning"
  })
  declare videos: any;

  @prop({
    type: "int",
    default: 29,
    description:
      "The constant rate factor (CRF) to compress input media with. Compressed input media more closely matches the model's training data, which can improve motion quality."
  })
  declare constant_rate_factor: any;

  @prop({ type: "str", default: "", description: "Random seed for generation" })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const secondPassSkipInitialSteps = Number(
      this.second_pass_skip_initial_steps ?? 5
    );
    const firstPassNumInferenceSteps = Number(
      this.first_pass_num_inference_steps ?? 8
    );
    const frameRate = Number(this.frame_rate ?? 24);
    const reverseVideo = Boolean(this.reverse_video ?? false);
    const prompt = String(this.prompt ?? "");
    const expandPrompt = Boolean(this.expand_prompt ?? false);
    const temporalAdainFactor = Number(this.temporal_adain_factor ?? 0.5);
    const loras = String(this.loras ?? []);
    const images = String(this.images ?? []);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 121);
    const secondPassNumInferenceSteps = Number(
      this.second_pass_num_inference_steps ?? 8
    );
    const negativePrompt = String(
      this.negative_prompt ??
        "worst quality, inconsistent motion, blurry, jittery, distorted"
    );
    const enableDetailPass = Boolean(this.enable_detail_pass ?? false);
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "720p");
    const toneMapCompressionRatio = Number(
      this.tone_map_compression_ratio ?? 0
    );
    const videos = String(this.videos ?? []);
    const constantRateFactor = Number(this.constant_rate_factor ?? 29);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      second_pass_skip_initial_steps: secondPassSkipInitialSteps,
      first_pass_num_inference_steps: firstPassNumInferenceSteps,
      frame_rate: frameRate,
      reverse_video: reverseVideo,
      prompt: prompt,
      expand_prompt: expandPrompt,
      temporal_adain_factor: temporalAdainFactor,
      loras: loras,
      images: images,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      second_pass_num_inference_steps: secondPassNumInferenceSteps,
      negative_prompt: negativePrompt,
      enable_detail_pass: enableDetailPass,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      tone_map_compression_ratio: toneMapCompressionRatio,
      videos: videos,
      constant_rate_factor: constantRateFactor,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-video-13b-distilled/multiconditioning",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LtxVideo13bDevMulticonditioning extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.LtxVideo13bDevMulticonditioning";
  static readonly title = "Ltx Video13b Dev Multiconditioning";
  static readonly description = `Generate videos from prompts, images, and videos using LTX Video-0.9.7 13B and custom LoRA
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt to guide generation"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 30,
    description: "Number of inference steps during the first pass."
  })
  declare first_pass_num_inference_steps: any;

  @prop({
    type: "int",
    default: 24,
    description: "The frame rate of the video."
  })
  declare frame_rate: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to reverse the video."
  })
  declare reverse_video: any;

  @prop({
    type: "int",
    default: 17,
    description:
      "The number of inference steps to skip in the initial steps of the second pass. By skipping some steps at the beginning, the second pass can focus on smaller details instead of larger changes."
  })
  declare second_pass_skip_initial_steps: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "The factor for adaptive instance normalization (AdaIN) applied to generated video chunks after the first. This can help deal with a gradual increase in saturation/contrast in the generated video by normalizing the color distribution across the video. A high value will ensure the color distribution is more consistent across the video, while a low value will allow for more variation in color distribution."
  })
  declare temporal_adain_factor: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to expand the prompt using a language model."
  })
  declare expand_prompt: any;

  @prop({
    type: "list[LoRAWeight]",
    default: [],
    description: "LoRA weights to use for generation"
  })
  declare loras: any;

  @prop({
    type: "list[ImageConditioningInput]",
    default: [],
    description: "URL of images to use as conditioning"
  })
  declare images: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames in the video."
  })
  declare num_frames: any;

  @prop({
    type: "int",
    default: 30,
    description: "Number of inference steps during the second pass."
  })
  declare second_pass_num_inference_steps: any;

  @prop({
    type: "str",
    default: "worst quality, inconsistent motion, blurry, jittery, distorted",
    description: "Negative prompt for generation"
  })
  declare negative_prompt: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to use a detail pass. If True, the model will perform a second pass to refine the video and enhance details. This incurs a 2.0x cost multiplier on the base price."
  })
  declare enable_detail_pass: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["9:16", "1:1", "16:9", "auto"],
    description: "The aspect ratio of the video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "The compression ratio for tone mapping. This is used to compress the dynamic range of the video to improve visual quality. A value of 0.0 means no compression, while a value of 1.0 means maximum compression."
  })
  declare tone_map_compression_ratio: any;

  @prop({
    type: "list[VideoConditioningInput]",
    default: [],
    description: "Videos to use as conditioning"
  })
  declare videos: any;

  @prop({
    type: "int",
    default: 29,
    description:
      "The constant rate factor (CRF) to compress input media with. Compressed input media more closely matches the model's training data, which can improve motion quality."
  })
  declare constant_rate_factor: any;

  @prop({ type: "str", default: "", description: "Random seed for generation" })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const firstPassNumInferenceSteps = Number(
      this.first_pass_num_inference_steps ?? 30
    );
    const frameRate = Number(this.frame_rate ?? 24);
    const reverseVideo = Boolean(this.reverse_video ?? false);
    const secondPassSkipInitialSteps = Number(
      this.second_pass_skip_initial_steps ?? 17
    );
    const temporalAdainFactor = Number(this.temporal_adain_factor ?? 0.5);
    const expandPrompt = Boolean(this.expand_prompt ?? false);
    const loras = String(this.loras ?? []);
    const images = String(this.images ?? []);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 121);
    const secondPassNumInferenceSteps = Number(
      this.second_pass_num_inference_steps ?? 30
    );
    const negativePrompt = String(
      this.negative_prompt ??
        "worst quality, inconsistent motion, blurry, jittery, distorted"
    );
    const enableDetailPass = Boolean(this.enable_detail_pass ?? false);
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "720p");
    const toneMapCompressionRatio = Number(
      this.tone_map_compression_ratio ?? 0
    );
    const videos = String(this.videos ?? []);
    const constantRateFactor = Number(this.constant_rate_factor ?? 29);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      first_pass_num_inference_steps: firstPassNumInferenceSteps,
      frame_rate: frameRate,
      reverse_video: reverseVideo,
      second_pass_skip_initial_steps: secondPassSkipInitialSteps,
      temporal_adain_factor: temporalAdainFactor,
      expand_prompt: expandPrompt,
      loras: loras,
      images: images,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      second_pass_num_inference_steps: secondPassNumInferenceSteps,
      negative_prompt: negativePrompt,
      enable_detail_pass: enableDetailPass,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      tone_map_compression_ratio: toneMapCompressionRatio,
      videos: videos,
      constant_rate_factor: constantRateFactor,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-video-13b-dev/multiconditioning",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LtxVideo13bDevExtend extends FalNode {
  static readonly nodeType = "fal.video_to_video.LtxVideo13bDevExtend";
  static readonly title = "Ltx Video13b Dev Extend";
  static readonly description = `Extend videos using LTX Video-0.9.7 13B and custom LoRA
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt to guide generation"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 30,
    description: "Number of inference steps during the first pass."
  })
  declare first_pass_num_inference_steps: any;

  @prop({
    type: "int",
    default: 24,
    description: "The frame rate of the video."
  })
  declare frame_rate: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to reverse the video."
  })
  declare reverse_video: any;

  @prop({
    type: "int",
    default: 17,
    description:
      "The number of inference steps to skip in the initial steps of the second pass. By skipping some steps at the beginning, the second pass can focus on smaller details instead of larger changes."
  })
  declare second_pass_skip_initial_steps: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "The factor for adaptive instance normalization (AdaIN) applied to generated video chunks after the first. This can help deal with a gradual increase in saturation/contrast in the generated video by normalizing the color distribution across the video. A high value will ensure the color distribution is more consistent across the video, while a low value will allow for more variation in color distribution."
  })
  declare temporal_adain_factor: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to expand the prompt using a language model."
  })
  declare expand_prompt: any;

  @prop({
    type: "list[LoRAWeight]",
    default: [],
    description: "LoRA weights to use for generation"
  })
  declare loras: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames in the video."
  })
  declare num_frames: any;

  @prop({
    type: "int",
    default: 30,
    description: "Number of inference steps during the second pass."
  })
  declare second_pass_num_inference_steps: any;

  @prop({
    type: "str",
    default: "worst quality, inconsistent motion, blurry, jittery, distorted",
    description: "Negative prompt for generation"
  })
  declare negative_prompt: any;

  @prop({ type: "video", default: "", description: "Video to be extended." })
  declare video: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to use a detail pass. If True, the model will perform a second pass to refine the video and enhance details. This incurs a 2.0x cost multiplier on the base price."
  })
  declare enable_detail_pass: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["9:16", "1:1", "16:9", "auto"],
    description: "The aspect ratio of the video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p"],
    description: "Resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "The compression ratio for tone mapping. This is used to compress the dynamic range of the video to improve visual quality. A value of 0.0 means no compression, while a value of 1.0 means maximum compression."
  })
  declare tone_map_compression_ratio: any;

  @prop({
    type: "int",
    default: 29,
    description:
      "The constant rate factor (CRF) to compress input media with. Compressed input media more closely matches the model's training data, which can improve motion quality."
  })
  declare constant_rate_factor: any;

  @prop({ type: "str", default: "", description: "Random seed for generation" })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const firstPassNumInferenceSteps = Number(
      this.first_pass_num_inference_steps ?? 30
    );
    const frameRate = Number(this.frame_rate ?? 24);
    const reverseVideo = Boolean(this.reverse_video ?? false);
    const secondPassSkipInitialSteps = Number(
      this.second_pass_skip_initial_steps ?? 17
    );
    const temporalAdainFactor = Number(this.temporal_adain_factor ?? 0.5);
    const expandPrompt = Boolean(this.expand_prompt ?? false);
    const loras = String(this.loras ?? []);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 121);
    const secondPassNumInferenceSteps = Number(
      this.second_pass_num_inference_steps ?? 30
    );
    const negativePrompt = String(
      this.negative_prompt ??
        "worst quality, inconsistent motion, blurry, jittery, distorted"
    );
    const enableDetailPass = Boolean(this.enable_detail_pass ?? false);
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "720p");
    const toneMapCompressionRatio = Number(
      this.tone_map_compression_ratio ?? 0
    );
    const constantRateFactor = Number(this.constant_rate_factor ?? 29);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      first_pass_num_inference_steps: firstPassNumInferenceSteps,
      frame_rate: frameRate,
      reverse_video: reverseVideo,
      second_pass_skip_initial_steps: secondPassSkipInitialSteps,
      temporal_adain_factor: temporalAdainFactor,
      expand_prompt: expandPrompt,
      loras: loras,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      second_pass_num_inference_steps: secondPassNumInferenceSteps,
      negative_prompt: negativePrompt,
      enable_detail_pass: enableDetailPass,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      tone_map_compression_ratio: toneMapCompressionRatio,
      constant_rate_factor: constantRateFactor,
      seed: seed
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) {
        args["video"] = {
          video_url: videoUrl,
          start_frame_num: Number((this as any).start_frame_num ?? 0),
          reverse_video: Boolean((this as any).reverse_video ?? false),
          limit_num_frames: Boolean((this as any).limit_num_frames ?? false),
          resample_fps: Boolean((this as any).resample_fps ?? false),
          strength: Number((this as any).strength ?? 0),
          target_fps: Number((this as any).target_fps ?? 0),
          max_num_frames: Number((this as any).max_num_frames ?? 0)
        };
      }
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-video-13b-dev/extend",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LtxVideoLoraMulticonditioning extends FalNode {
  static readonly nodeType = "fal.video_to_video.LtxVideoLoraMulticonditioning";
  static readonly title = "Ltx Video Lora Multiconditioning";
  static readonly description = `Generate videos from prompts, images, and videos using LTX Video-0.9.7 and custom LoRA
video, editing, video-to-video, vid2vid, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to reverse the video."
  })
  declare reverse_video: any;

  @prop({
    type: "int",
    default: 89,
    description: "The number of frames in the video."
  })
  declare number_of_frames: any;

  @prop({
    type: "list[LoRAWeight]",
    default: [],
    description: "The LoRA weights to use for generation."
  })
  declare loras: any;

  @prop({
    type: "int",
    default: 25,
    description: "The frame rate of the video."
  })
  declare frames_per_second: any;

  @prop({
    type: "list[ImageCondition]",
    default: [],
    description: "The image conditions to use for generation."
  })
  declare images: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default:
      "blurry, low quality, low resolution, inconsistent motion, jittery, distorted",
    description: "The negative prompt to use."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["16:9", "1:1", "9:16", "auto"],
    description: "The aspect ratio of the video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p"],
    description: "The resolution of the video."
  })
  declare resolution: any;

  @prop({
    type: "list[VideoCondition]",
    default: [],
    description: "The video conditions to use for generation."
  })
  declare videos: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to expand the prompt using the LLM."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "int",
    default: 30,
    description: "The number of inference steps to use."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed to use for generation."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const reverseVideo = Boolean(this.reverse_video ?? false);
    const numberOfFrames = Number(this.number_of_frames ?? 89);
    const loras = String(this.loras ?? []);
    const framesPerSecond = Number(this.frames_per_second ?? 25);
    const images = String(this.images ?? []);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, low quality, low resolution, inconsistent motion, jittery, distorted"
    );
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "720p");
    const videos = String(this.videos ?? []);
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      reverse_video: reverseVideo,
      number_of_frames: numberOfFrames,
      loras: loras,
      frames_per_second: framesPerSecond,
      images: images,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      videos: videos,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-video-lora/multiconditioning",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MagiExtendVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.MagiExtendVideo";
  static readonly title = "Magi Extend Video";
  static readonly description = `MAGI-1 extends videos with an exceptional understanding of physical interactions and prompts
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL of the input video to represent the beginning of the video. If the input video does not match the chosen aspect ratio, it is resized and center cropped."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p"],
    description:
      "Resolution of the generated video (480p or 720p). 480p is 0.5 billing units, and 720p is 1 billing unit."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "9:16", "1:1"],
    description:
      "Aspect ratio of the generated video. If 'auto', the aspect ratio will be determined automatically based on the input image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The frame to begin the generation from, with the remaining frames will be treated as the prefix video. The final video will contain the frames up until this number unchanged, followed by the generated frames. The default start frame is 32 frames before the end of the video, which gives optimal results."
  })
  declare start_frame: any;

  @prop({
    type: "bool",
    default: true,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: 16,
    values: [4, 8, 16, 32, 64],
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: 96,
    description:
      "Number of frames to generate. Must be between 96 and 192 (inclusive). Each additional 24 frames beyond 96 incurs an additional billing unit."
  })
  declare num_frames: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const startFrame = String(this.start_frame ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = String(this.num_inference_steps ?? 16);
    const numFrames = String(this.num_frames ?? 96);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      start_frame: startFrame,
      enable_safety_checker: enableSafetyChecker,
      seed: seed,
      num_inference_steps: numInferenceSteps,
      num_frames: numFrames
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/magi/extend-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MagiDistilledExtendVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.MagiDistilledExtendVideo";
  static readonly title = "Magi Distilled Extend Video";
  static readonly description = `MAGI-1 distilled extends videos faster with an exceptional understanding of physical interactions and prompts
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL of the input video to represent the beginning of the video. If the input video does not match the chosen aspect ratio, it is resized and center cropped."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "9:16", "1:1"],
    description:
      "Aspect ratio of the generated video. If 'auto', the aspect ratio will be determined automatically based on the input image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p"],
    description:
      "Resolution of the generated video (480p or 720p). 480p is 0.5 billing units, and 720p is 1 billing unit."
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The frame to begin the generation from, with the remaining frames will be treated as the prefix video. The final video will contain the frames up until this number unchanged, followed by the generated frames. The default start frame is 32 frames before the end of the video, which gives optimal results."
  })
  declare start_frame: any;

  @prop({
    type: "bool",
    default: true,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default: 96,
    description:
      "Number of frames to generate. Must be between 96 and 192 (inclusive). Each additional 24 frames beyond 96 incurs an additional billing unit."
  })
  declare num_frames: any;

  @prop({
    type: "enum",
    default: 16,
    values: [4, 8, 16, 32],
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "720p");
    const startFrame = String(this.start_frame ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = String(this.num_frames ?? 96);
    const numInferenceSteps = String(this.num_inference_steps ?? 16);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      start_frame: startFrame,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      num_inference_steps: numInferenceSteps,
      seed: seed
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/magi-distilled/extend-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanVace extends FalNode {
  static readonly nodeType = "fal.video_to_video.WanVace";
  static readonly title = "Wan Vace";
  static readonly description = `Vace a video generation model that uses a source image, mask, and video to create prompted videos with controllable sources.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the source video file. If provided, the model will use this video as a reference."
  })
  declare video: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL to the guiding mask file. If provided, the model will use this mask as a reference to create masked video. If provided mask video url will be ignored."
  })
  declare mask_image: any;

  @prop({
    type: "enum",
    default: "depth",
    values: ["depth", "inpainting"],
    description: "Task type for the model."
  })
  declare task: any;

  @prop({
    type: "str",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 5 to 24."
  })
  declare frames_per_second: any;

  @prop({
    type: "list[image]",
    default: "",
    description:
      "Urls to source reference image. If provided, the model will use this image as reference."
  })
  declare ref_images: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default: 81,
    description:
      "Number of frames to generate. Must be between 81 to 100 (inclusive). Works only with only reference images as input if source video or mask video is provided output len would be same as source up to 241 frames"
  })
  declare num_frames: any;

  @prop({
    type: "str",
    default:
      "bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "580p", "720p"],
    description: "Resolution of the generated video (480p,580p, or 720p)."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["auto", "9:16", "16:9"],
    description: "Aspect ratio of the generated video (16:9 or 9:16)."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to preprocess the input video."
  })
  declare preprocess: any;

  @prop({
    type: "video",
    default: "",
    description:
      "URL to the source mask file. If provided, the model will use this mask as a reference."
  })
  declare mask_video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const shift = Number(this.shift ?? 5);
    const task = String(this.task ?? "depth");
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const numFrames = String(this.num_frames ?? 81);
    const negativePrompt = String(
      this.negative_prompt ??
        "bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const seed = String(this.seed ?? "");
    const preprocess = Boolean(this.preprocess ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      shift: shift,
      task: task,
      frames_per_second: framesPerSecond,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      negative_prompt: negativePrompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      preprocess: preprocess
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const maskImageRef = this.mask_image as Record<string, unknown> | undefined;
    if (isRefSet(maskImageRef)) {
      const maskImageUrl =
        (await imageToDataUrl(maskImageRef!)) ??
        (await assetToFalUrl(apiKey, maskImageRef!));
      if (maskImageUrl) args["mask_image_url"] = maskImageUrl;
    }

    const refImagesList = this.ref_images as
      | Record<string, unknown>[]
      | undefined;
    if (refImagesList?.length) {
      const refImagesUrls: string[] = [];
      for (const ref of refImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) refImagesUrls.push(u);
        }
      }
      if (refImagesUrls.length) args["ref_image_urls"] = refImagesUrls;
    }

    const maskVideoRef = this.mask_video as Record<string, unknown> | undefined;
    if (isRefSet(maskVideoRef)) {
      const maskVideoUrl = await assetToFalUrl(apiKey, maskVideoRef!);
      if (maskVideoUrl) args["mask_video_url"] = maskVideoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-vace", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class CassetteaiVideoSoundEffectsGenerator extends FalNode {
  static readonly nodeType =
    "fal.video_to_video.CassetteaiVideoSoundEffectsGenerator";
  static readonly title = "Cassetteai Video Sound Effects Generator";
  static readonly description = `Add sound effects to your videos
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "video",
    default: "",
    description: "A video file to analyze & re-sound with generated SFX."
  })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "cassetteai/video-sound-effects-generator",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class SyncLipsyncV2 extends FalNode {
  static readonly nodeType = "fal.video_to_video.SyncLipsyncV2";
  static readonly title = "Sync Lipsync V2";
  static readonly description = `Generate realistic lipsync animations from audio using advanced algorithms for high-quality synchronization with Sync Lipsync 2.0 model
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "enum",
    default: "cut_off",
    values: ["cut_off", "loop", "bounce", "silence", "remap"],
    description: "Lipsync mode when audio and video durations are out of sync."
  })
  declare sync_mode: any;

  @prop({ type: "video", default: "", description: "URL of the input video" })
  declare video: any;

  @prop({
    type: "enum",
    default: "lipsync-2",
    values: ["lipsync-2", "lipsync-2-pro"],
    description:
      "The model to use for lipsyncing. 'lipsync-2-pro' will cost roughly 1.67 times as much as 'lipsync-2' for the same duration."
  })
  declare model: any;

  @prop({ type: "audio", default: "", description: "URL of the input audio" })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const syncMode = String(this.sync_mode ?? "cut_off");
    const model = String(this.model ?? "lipsync-2");

    const args: Record<string, unknown> = {
      sync_mode: syncMode,
      model: model
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sync-lipsync/v2", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Latentsync extends FalNode {
  static readonly nodeType = "fal.video_to_video.Latentsync";
  static readonly title = "Latentsync";
  static readonly description = `LatentSync is a video-to-video model that generates lip sync animations from audio using advanced algorithms for high-quality synchronization.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to generate the lip sync for."
  })
  declare video: any;

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the audio to generate the lip sync for."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for generation. If None, a random seed will be used."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description: "Guidance scale for the model inference"
  })
  declare guidance_scale: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Video loop mode when audio is longer than video. Options: pingpong, loop"
  })
  declare loop_mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const seed = String(this.seed ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 1);
    const loopMode = String(this.loop_mode ?? "");

    const args: Record<string, unknown> = {
      seed: seed,
      guidance_scale: guidanceScale,
      loop_mode: loopMode
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/latentsync", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PikaV2Pikadditions extends FalNode {
  static readonly nodeType = "fal.video_to_video.PikaV2Pikadditions";
  static readonly title = "Pika V2 Pikadditions";
  static readonly description = `Pikadditions is a powerful video-to-video AI model that allows you to add anyone or anything to any video with seamless integration.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt describing what to add"
  })
  declare prompt: any;

  @prop({ type: "video", default: "", description: "URL of the input video" })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator"
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to guide the model"
  })
  declare negative_prompt: any;

  @prop({ type: "image", default: "", description: "URL of the image to add" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/pika/v2/pikadditions", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LtxVideoV095Extend extends FalNode {
  static readonly nodeType = "fal.video_to_video.LtxVideoV095Extend";
  static readonly title = "Ltx Video V095 Extend";
  static readonly description = `Generate videos from prompts and videos using LTX Video-0.9.5
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt to guide generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["9:16", "16:9"],
    description: "Aspect ratio of the generated video (16:9 or 9:16)."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p"],
    description: "Resolution of the generated video (480p or 720p)."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to expand the prompt using the model's own capabilities."
  })
  declare expand_prompt: any;

  @prop({ type: "int", default: 40, description: "Number of inference steps" })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "Random seed for generation" })
  declare seed: any;

  @prop({
    type: "str",
    default: "worst quality, inconsistent motion, blurry, jittery, distorted",
    description: "Negative prompt for generation"
  })
  declare negative_prompt: any;

  @prop({ type: "video", default: "", description: "Video to be extended." })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "720p");
    const expandPrompt = Boolean(this.expand_prompt ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(
      this.negative_prompt ??
        "worst quality, inconsistent motion, blurry, jittery, distorted"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      expand_prompt: expandPrompt,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) {
        args["video"] = {
          video_url: videoUrl,
          start_frame_num: Number((this as any).start_frame_num ?? 0)
        };
      }
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ltx-video-v095/extend", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LtxVideoV095Multiconditioning extends FalNode {
  static readonly nodeType = "fal.video_to_video.LtxVideoV095Multiconditioning";
  static readonly title = "Ltx Video V095 Multiconditioning";
  static readonly description = `Generate videos from prompts,images, and videos using LTX Video-0.9.5
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt to guide generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["9:16", "16:9"],
    description: "Aspect ratio of the generated video (16:9 or 9:16)."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p"],
    description: "Resolution of the generated video (480p or 720p)."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to expand the prompt using the model's own capabilities."
  })
  declare expand_prompt: any;

  @prop({
    type: "list[VideoConditioningInput]",
    default: [],
    description: "Videos to use as conditioning"
  })
  declare videos: any;

  @prop({
    type: "list[ImageConditioningInput]",
    default: [],
    description: "URL of images to use as conditioning"
  })
  declare images: any;

  @prop({ type: "str", default: "", description: "Random seed for generation" })
  declare seed: any;

  @prop({ type: "int", default: 40, description: "Number of inference steps" })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "worst quality, inconsistent motion, blurry, jittery, distorted",
    description: "Negative prompt for generation"
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "720p");
    const expandPrompt = Boolean(this.expand_prompt ?? true);
    const videos = String(this.videos ?? []);
    const images = String(this.images ?? []);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const negativePrompt = String(
      this.negative_prompt ??
        "worst quality, inconsistent motion, blurry, jittery, distorted"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      expand_prompt: expandPrompt,
      videos: videos,
      images: images,
      seed: seed,
      num_inference_steps: numInferenceSteps,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-video-v095/multiconditioning",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class TopazUpscaleVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.TopazUpscaleVideo";
  static readonly title = "Topaz Upscale Video";
  static readonly description = `Professional-grade video upscaling using Topaz technology. Enhance your videos with high-quality upscaling.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Noise reduction level (0.0-1.0). Default varies by model."
  })
  declare noise: any;

  @prop({
    type: "video",
    default: "",
    description: "URL of the video to upscale"
  })
  declare video: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to use H264 codec for output video. Default is H265."
  })
  declare H264_output: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Compression artifact removal level (0.0-1.0). Default varies by model."
  })
  declare compression: any;

  @prop({
    type: "enum",
    default: "Proteus",
    values: [
      "Proteus",
      "Artemis HQ",
      "Artemis MQ",
      "Artemis LQ",
      "Nyx",
      "Nyx Fast",
      "Nyx XL",
      "Nyx HF",
      "Gaia HQ",
      "Gaia CG"
    ],
    description:
      "Video enhancement model. Proteus is best for most videos, Artemis for denoise+sharpen, Nyx for dedicated denoising, Gaia for AI-generated/CG/animation content."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    description: "Film grain amount (0.0-1.0). Default varies by model."
  })
  declare grain: any;

  @prop({
    type: "float",
    default: 2,
    description:
      "Factor to upscale the video by (e.g. 2.0 doubles width and height)"
  })
  declare upscale_factor: any;

  @prop({
    type: "str",
    default: "",
    description: "Halo reduction level (0.0-1.0). Default varies by model."
  })
  declare halo: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Target FPS for frame interpolation. If set, frame interpolation will be enabled."
  })
  declare target_fps: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Recover original detail level (0.0-1.0). Higher values preserve more original detail."
  })
  declare recover_detail: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const noise = String(this.noise ?? "");
    const H264Output = Boolean(this.H264_output ?? false);
    const compression = String(this.compression ?? "");
    const model = String(this.model ?? "Proteus");
    const grain = String(this.grain ?? "");
    const upscaleFactor = Number(this.upscale_factor ?? 2);
    const halo = String(this.halo ?? "");
    const targetFps = String(this.target_fps ?? "");
    const recoverDetail = String(this.recover_detail ?? "");

    const args: Record<string, unknown> = {
      noise: noise,
      H264_output: H264Output,
      compression: compression,
      model: model,
      grain: grain,
      upscale_factor: upscaleFactor,
      halo: halo,
      target_fps: targetFps,
      recover_detail: recoverDetail
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/topaz/upscale/video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class HunyuanVideoLoraVideoToVideo extends FalNode {
  static readonly nodeType = "fal.video_to_video.HunyuanVideoLoraVideoToVideo";
  static readonly title = "Hunyuan Video Lora Video To Video";
  static readonly description = `Hunyuan Video is an Open video generation model with high visual quality, motion diversity, text-video alignment, and generation stability. Use this endpoint to generate videos from videos.
video, editing, video-to-video, vid2vid, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16"],
    description: "The aspect ratio of the video to generate."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "580p", "720p"],
    description: "The resolution of the video to generate."
  })
  declare resolution: any;

  @prop({ type: "video", default: "", description: "URL of the video" })
  declare video: any;

  @prop({
    type: "list[LoraWeight]",
    default: [],
    description:
      "\n            The LoRAs to use for the image generation. You can use any number of LoRAs\n            and they will be merged together to generate the final image.\n        "
  })
  declare loras: any;

  @prop({
    type: "float",
    default: 0.75,
    description: "Strength of video-to-video"
  })
  declare strength: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: -1,
    description: "The seed to use for generating the video."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: 129,
    values: ["129", "85"],
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "By default, generations are done with 35 steps. Pro mode does 55 steps which results in higher quality videos but will take more time and cost 2x more billing units."
  })
  declare pro_mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "720p");
    const loras = String(this.loras ?? []);
    const strength = Number(this.strength ?? 0.75);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const seed = Number(this.seed ?? -1);
    const numFrames = String(this.num_frames ?? 129);
    const proMode = Boolean(this.pro_mode ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      loras: loras,
      strength: strength,
      enable_safety_checker: enableSafetyChecker,
      seed: seed,
      num_frames: numFrames,
      pro_mode: proMode
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/hunyuan-video-lora/video-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class FfmpegApiCompose extends FalNode {
  static readonly nodeType = "fal.video_to_video.FfmpegApiCompose";
  static readonly title = "Ffmpeg Api Compose";
  static readonly description = `Compose videos from multiple media sources using FFmpeg API.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video_url: "video", thumbnail_url: "image" };

  @prop({
    type: "list[Track]",
    default: [],
    description: "List of tracks to be combined into the final media"
  })
  declare tracks: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const tracks = String(this.tracks ?? []);

    const args: Record<string, unknown> = {
      tracks: tracks
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ffmpeg-api/compose", args);
    return res as Record<string, unknown>;
  }
}

export class SyncLipsync extends FalNode {
  static readonly nodeType = "fal.video_to_video.SyncLipsync";
  static readonly title = "Sync Lipsync";
  static readonly description = `Generate realistic lipsync animations from audio using advanced algorithms for high-quality synchronization.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "enum",
    default: "cut_off",
    values: ["cut_off", "loop", "bounce", "silence", "remap"],
    description: "Lipsync mode when audio and video durations are out of sync."
  })
  declare sync_mode: any;

  @prop({ type: "video", default: "", description: "URL of the input video" })
  declare video: any;

  @prop({
    type: "enum",
    default: "lipsync-1.9.0-beta",
    values: ["lipsync-1.8.0", "lipsync-1.7.1", "lipsync-1.9.0-beta"],
    description: "The model to use for lipsyncing"
  })
  declare model: any;

  @prop({ type: "audio", default: "", description: "URL of the input audio" })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const syncMode = String(this.sync_mode ?? "cut_off");
    const model = String(this.model ?? "lipsync-1.9.0-beta");

    const args: Record<string, unknown> = {
      sync_mode: syncMode,
      model: model
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sync-lipsync", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Dubbing extends FalNode {
  static readonly nodeType = "fal.video_to_video.Dubbing";
  static readonly title = "Dubbing";
  static readonly description = `This endpoint delivers seamlessly localized videos by generating lip-synced dubs in multiple languages, ensuring natural and immersive multilingual experiences
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "bool",
    default: true,
    description: "Whether to lip sync the audio to the video"
  })
  declare do_lipsync: any;

  @prop({
    type: "video",
    default: "",
    description: "Input video URL to be dubbed."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "hindi",
    values: ["hindi", "turkish", "english"],
    description: "Target language to dub the video to"
  })
  declare target_language: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const doLipsync = Boolean(this.do_lipsync ?? true);
    const targetLanguage = String(this.target_language ?? "hindi");

    const args: Record<string, unknown> = {
      do_lipsync: doLipsync,
      target_language: targetLanguage
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/dubbing", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Controlnext extends FalNode {
  static readonly nodeType = "fal.video_to_video.Controlnext";
  static readonly title = "Controlnext";
  static readonly description = `Animate a reference image with a driving video using ControlNeXt.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "float",
    default: 1,
    description: "Condition scale for ControlNeXt."
  })
  declare controlnext_cond_scale: any;

  @prop({ type: "video", default: "", description: "URL of the input video." })
  declare video: any;

  @prop({
    type: "int",
    default: 7,
    description: "Frames per second for the output video."
  })
  declare fps: any;

  @prop({
    type: "int",
    default: 240,
    description: "Maximum number of frames to process."
  })
  declare max_frame_num: any;

  @prop({
    type: "int",
    default: 576,
    description: "Width of the output video."
  })
  declare width: any;

  @prop({
    type: "int",
    default: 6,
    description: "Number of overlapping frames between batches."
  })
  declare overlap: any;

  @prop({
    type: "float",
    default: 3,
    description: "Guidance scale for the diffusion process."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 24,
    description: "Number of frames to process in each batch."
  })
  declare batch_frames: any;

  @prop({
    type: "int",
    default: 1024,
    description: "Height of the output video."
  })
  declare height: any;

  @prop({
    type: "int",
    default: 2,
    description: "Stride for sampling frames from the input video."
  })
  declare sample_stride: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the reference image."
  })
  declare image: any;

  @prop({
    type: "int",
    default: 2,
    description: "Chunk size for decoding frames."
  })
  declare decode_chunk_size: any;

  @prop({
    type: "float",
    default: 127,
    description: "Motion bucket ID for the pipeline."
  })
  declare motion_bucket_id: any;

  @prop({ type: "int", default: 25, description: "Number of inference steps." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const controlnextCondScale = Number(this.controlnext_cond_scale ?? 1);
    const fps = Number(this.fps ?? 7);
    const maxFrameNum = Number(this.max_frame_num ?? 240);
    const width = Number(this.width ?? 576);
    const overlap = Number(this.overlap ?? 6);
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const batchFrames = Number(this.batch_frames ?? 24);
    const height = Number(this.height ?? 1024);
    const sampleStride = Number(this.sample_stride ?? 2);
    const decodeChunkSize = Number(this.decode_chunk_size ?? 2);
    const motionBucketId = Number(this.motion_bucket_id ?? 127);
    const numInferenceSteps = Number(this.num_inference_steps ?? 25);

    const args: Record<string, unknown> = {
      controlnext_cond_scale: controlnextCondScale,
      fps: fps,
      max_frame_num: maxFrameNum,
      width: width,
      overlap: overlap,
      guidance_scale: guidanceScale,
      batch_frames: batchFrames,
      height: height,
      sample_stride: sampleStride,
      decode_chunk_size: decodeChunkSize,
      motion_bucket_id: motionBucketId,
      num_inference_steps: numInferenceSteps
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/controlnext", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Sam2Video extends FalNode {
  static readonly nodeType = "fal.video_to_video.Sam2Video";
  static readonly title = "Sam2 Video";
  static readonly description = `SAM 2 is a model for segmenting images and videos in real-time.
video, editing, video-to-video, vid2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    boundingbox_frames_zip: "str",
    video: "video"
  };

  @prop({
    type: "video",
    default: "",
    description: "The URL of the video to be segmented."
  })
  declare video: any;

  @prop({
    type: "list[PointPrompt]",
    default: [],
    description: "List of prompts to segment the video"
  })
  declare prompts: any;

  @prop({
    type: "bool",
    default: false,
    description: "Return per-frame bounding box overlays as a zip archive."
  })
  declare boundingbox_zip: any;

  @prop({
    type: "list[BoxPrompt]",
    default: [],
    description: "Coordinates for boxes"
  })
  declare box_prompts: any;

  @prop({
    type: "bool",
    default: false,
    description: "Apply the mask on the video."
  })
  declare apply_mask: any;

  @prop({
    type: "str",
    default: "",
    description: "The URL of the mask to be applied initially."
  })
  declare mask_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompts = String(this.prompts ?? []);
    const boundingboxZip = Boolean(this.boundingbox_zip ?? false);
    const boxPrompts = String(this.box_prompts ?? []);
    const applyMask = Boolean(this.apply_mask ?? false);
    const maskUrl = String(this.mask_url ?? "");

    const args: Record<string, unknown> = {
      prompts: prompts,
      boundingbox_zip: boundingboxZip,
      box_prompts: boxPrompts,
      apply_mask: applyMask,
      mask_url: maskUrl
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sam2/video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export const FAL_VIDEO_TO_VIDEO_NODES: readonly NodeClass[] = [
  AMTInterpolation,
  AnimateDiffVideoToVideo,
  AnimateDiffTurboVideoToVideo,
  AutoCaption,
  BenV2Video,
  BiRefNetV2Video,
  BriaVideoEraserMask,
  BriaVideoEraserKeypoints,
  BriaVideoEraserPrompt,
  CogVideoX5BVideoToVideo,
  HunyuanVideoToVideo,
  VideoUpscaler,
  CCSR,
  Ltx219BDistilledVideoToVideoLora,
  Ltx219BDistilledVideoToVideo,
  Ltx219BVideoToVideoLora,
  Ltx219BVideoToVideo,
  Ltx219BDistilledExtendVideoLora,
  Ltx219BDistilledExtendVideo,
  Ltx219BExtendVideoLora,
  Ltx219BExtendVideo,
  BriaVideoEraseKeypoints,
  BriaVideoErasePrompt,
  BriaVideoEraseMask,
  LightxRelight,
  LightxRecamera,
  KlingVideoV26StandardMotionControl,
  KlingVideoV26ProMotionControl,
  DecartLucyRestyle,
  Scail,
  ClarityaiCrystalVideoUpscaler,
  WanV26ReferenceToVideo,
  Veo31FastExtendVideo,
  Veo31ExtendVideo,
  KlingVideoO1StandardVideoToVideoReference,
  KlingVideoO1StandardVideoToVideoEdit,
  KlingVideoO3StandardVideoToVideoReference,
  KlingVideoO3StandardVideoToVideoEdit,
  KlingVideoO3ProVideoToVideoReference,
  KlingVideoO3ProVideoToVideoEdit,
  SteadyDancer,
  OneToAllAnimation13B,
  OneToAllAnimation14B,
  WanVisionEnhancer,
  SyncLipsyncReact1,
  VeedVideoBackgroundRemovalFast,
  KlingVideoO1VideoToVideoEdit,
  KlingVideoO1VideoToVideoReference,
  VeedVideoBackgroundRemoval,
  VeedVideoBackgroundRemovalGreenScreen,
  Ltx2RetakeVideo,
  DecartLucyEditFast,
  Sam3VideoRle,
  Sam3Video,
  Editto,
  FlashvsrUpscaleVideo,
  WorkflowUtilitiesAutoSubtitle,
  BytedanceUpscalerUpscaleVideo,
  VideoAsPrompt,
  ViduQ2VideoExtensionPro,
  MireloAiSfxV15VideoToVideo,
  KreaWan14BVideoToVideo,
  Sora2VideoToVideoRemix,
  WanVaceAppsLongReframe,
  InfinitalkVideoToVideo,
  SeedvrUpscaleVideo,
  WanVaceAppsVideoEdit,
  WanV2214bAnimateReplace,
  WanV2214bAnimateMove,
  DecartLucyEditPro,
  DecartLucyEditDev,
  Wan22VaceFunA14bReframe,
  Wan22VaceFunA14bOutpainting,
  Wan22VaceFunA14bInpainting,
  Wan22VaceFunA14bDepth,
  Wan22VaceFunA14bPose,
  HunyuanVideoFoley,
  SyncLipsyncV2Pro,
  WanFunControl,
  BriaVideoIncreaseResolution,
  Infinitalk,
  MireloAiSfxV1VideoToVideo,
  MoonvalleyMareyPoseTransfer,
  MoonvalleyMareyMotionTransfer,
  FfmpegApiMergeVideos,
  WanV22A14bVideoToVideo,
  Ltxv13b098DistilledExtend,
  RifeVideo,
  FilmVideo,
  LumaDreamMachineRay2FlashModify,
  Ltxv13b098DistilledMulticonditioning,
  PixverseSoundEffects,
  ThinksoundAudio,
  Thinksound,
  PixverseExtendFast,
  PixverseExtend,
  PixverseLipsync,
  LumaDreamMachineRay2Modify,
  WanVace14bReframe,
  WanVace14bOutpainting,
  WanVace14bInpainting,
  WanVace14bPose,
  WanVace14bDepth,
  DwposeVideo,
  FfmpegApiMergeAudioVideo,
  WanVace13b,
  LumaDreamMachineRay2FlashReframe,
  LumaDreamMachineRay2Reframe,
  VeedLipsync,
  WanVace14b,
  LtxVideo13bDistilledExtend,
  LtxVideo13bDistilledMulticonditioning,
  LtxVideo13bDevMulticonditioning,
  LtxVideo13bDevExtend,
  LtxVideoLoraMulticonditioning,
  MagiExtendVideo,
  MagiDistilledExtendVideo,
  WanVace,
  CassetteaiVideoSoundEffectsGenerator,
  SyncLipsyncV2,
  Latentsync,
  PikaV2Pikadditions,
  LtxVideoV095Extend,
  LtxVideoV095Multiconditioning,
  TopazUpscaleVideo,
  HunyuanVideoLoraVideoToVideo,
  FfmpegApiCompose,
  SyncLipsync,
  Dubbing,
  Controlnext,
  Sam2Video
] as const;
