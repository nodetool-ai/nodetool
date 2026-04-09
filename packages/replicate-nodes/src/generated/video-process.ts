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

export class Modify_Video extends ReplicateNode {
  static readonly nodeType = "replicate.video.process.Modify_Video";
  static readonly title = "Modify_ Video";
  static readonly description = `Modify a video with style transfer and prompt-based editing
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "image",
    default: "",
    description:
      "An optional first frame of the video to modify. This should be a modified version of the original first frame, it will be used to guide the video modification."
  })
  declare first_frame: any;

  @prop({
    type: "str",
    default: "",
    description: "Deprecated: Use first_frame instead."
  })
  declare first_frame_url: any;

  @prop({
    type: "enum",
    default: "adhere_1",
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
      "How closely the output should follow the source video. Adhere: very close, for subtle enhancements. Flex: allows more stylistic change while keeping recognizable elements. Reimagine: loosely follows the source, for dramatic or transformative changes."
  })
  declare mode: any;

  @prop({
    type: "str",
    default: "",
    description: "A prompt to guide the video modification"
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "The video to modify. Maximum video size is 100mb. Maximum video duration is 30 seconds."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description: "Deprecated: Use video instead."
  })
  declare video_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const firstFrameUrl = String(this.first_frame_url ?? "");
    const mode = String(this.mode ?? "adhere_1");
    const prompt = String(this.prompt ?? "");
    const videoUrl = String(this.video_url ?? "");

    const args: Record<string, unknown> = {
      first_frame_url: firstFrameUrl,
      mode: mode,
      prompt: prompt,
      video_url: videoUrl
    };

    const firstFrameRef = this.first_frame as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameRef)) {
      const firstFrameUrl = await assetToUrl(firstFrameRef!, apiKey);
      if (firstFrameUrl) args["first_frame"] = firstFrameUrl;
    }

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToUrl(videoRef!, apiKey);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "luma/modify-video:de2d85dcc392377a811cf6cda8f2b2b862548954363551b9cf27383ba04aed94",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Reframe_Video extends ReplicateNode {
  static readonly nodeType = "replicate.video.process.Reframe_Video";
  static readonly title = "Reframe_ Video";
  static readonly description = `Change the aspect ratio of any video up to 30 seconds long, outputs will be 720p
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["1:1", "3:4", "4:3", "9:16", "16:9", "9:21", "21:9"],
    description: "Aspect ratio of the output"
  })
  declare aspect_ratio: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "The x position of the input in the grid, in pixels. Controls horizontal positioning of the source within the target output dimensions."
  })
  declare grid_position_x: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "The y position of the input in the grid, in pixels. Controls vertical positioning of the source within the target output dimensions."
  })
  declare grid_position_y: any;

  @prop({
    type: "str",
    default: "",
    description: "A prompt to guide the reframing generation"
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "The video to reframe. Maximum video duration is 10 seconds."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    description:
      "URL of the video to reframe. Maximum video duration is 10 seconds."
  })
  declare video_url: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "The x end of the crop bounds, in pixels. Defines the right boundary where your source will be placed in the output frame. The distance between x_start and x_end determines the resized width of your content."
  })
  declare x_end: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "The x start of the crop bounds, in pixels. Defines the left boundary where your source will be placed in the output frame. The distance between x_start and x_end determines the resized width of your content."
  })
  declare x_start: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "The y end of the crop bounds, in pixels. Defines the bottom boundary where your source will be placed in the output frame. The distance between y_start and y_end determines the resized height of your content."
  })
  declare y_end: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "The y start of the crop bounds, in pixels. Defines the top boundary where your source will be placed in the output frame. The distance between y_start and y_end determines the resized height of your content."
  })
  declare y_start: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const gridPositionX = Number(this.grid_position_x ?? 0);
    const gridPositionY = Number(this.grid_position_y ?? 0);
    const prompt = String(this.prompt ?? "");
    const videoUrl = String(this.video_url ?? "");
    const xEnd = Number(this.x_end ?? 0);
    const xStart = Number(this.x_start ?? 0);
    const yEnd = Number(this.y_end ?? 0);
    const yStart = Number(this.y_start ?? 0);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      grid_position_x: gridPositionX,
      grid_position_y: gridPositionY,
      prompt: prompt,
      video_url: videoUrl,
      x_end: xEnd,
      x_start: xStart,
      y_end: yEnd,
      y_start: yStart
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToUrl(videoRef!, apiKey);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "luma/reframe-video:7a27619ccb64e4f1942e9a53e503142be08d505587313afa1da037b631a6760e",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class RealBasicVSR extends ReplicateNode {
  static readonly nodeType = "replicate.video.process.RealBasicVSR";
  static readonly title = "Real Basic V S R";
  static readonly description = `RealBasicVSR: Investigating Tradeoffs in Real-World Video Super-Resolution
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({ type: "video", default: "", description: "input video" })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToUrl(videoRef!, apiKey);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "pollinations/real-basicvsr-video-superresolution:005b4db1d719c1672c522b220db3bc899a81889986b5adc7a01b4f4cfb34e4a7",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Crystal_Video_Upscaler extends ReplicateNode {
  static readonly nodeType = "replicate.video.process.Crystal_Video_Upscaler";
  static readonly title = "Crystal_ Video_ Upscaler";
  static readonly description = `High-precision video upscaler optimized for portraits, faces and products. One of the upscale modes powered by Clarity AI. X:https://x.com/philz1337x
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "float",
    default: 2,
    description:
      "Scale factor for upscaling (will be capped if output will exceed 4K)"
  })
  declare scale_factor: any;

  @prop({
    type: "video",
    default: "",
    description: "An input video for upscaling"
  })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const scaleFactor = Number(this.scale_factor ?? 2);

    const args: Record<string, unknown> = {
      scale_factor: scaleFactor
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToUrl(videoRef!, apiKey);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "philz1337x/crystal-video-upscaler:a1817a6d378e6734bbdf8a184a6eca7870401891550ef9064a902a695241ad67",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class RealEsrGan_Video extends ReplicateNode {
  static readonly nodeType = "replicate.video.process.RealEsrGan_Video";
  static readonly title = "Real Esr Gan_ Video";
  static readonly description = `Real-ESRGAN Video Upscaler
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "RealESRGAN_x4plus",
    values: [
      "RealESRGAN_x4plus",
      "RealESRGAN_x4plus_anime_6B",
      "realesr-animevideov3"
    ],
    description: "Upscaling model"
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "FHD",
    values: ["FHD", "2k", "4k"],
    description: "Output resolution"
  })
  declare resolution: any;

  @prop({ type: "video", default: "", description: "Input Video" })
  declare video_path: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const model = String(this.model ?? "RealESRGAN_x4plus");
    const resolution = String(this.resolution ?? "FHD");

    const args: Record<string, unknown> = {
      model: model,
      resolution: resolution
    };

    const videoPathRef = this.video_path as Record<string, unknown> | undefined;
    if (isRefSet(videoPathRef)) {
      const videoPathUrl = await assetToUrl(videoPathRef!, apiKey);
      if (videoPathUrl) args["video_path"] = videoPathUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/real-esrgan-video:3e56ce4b57863bd03048b42bc09bdd4db20d427cca5fde9d8ae4dc60e1bb4775",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class StableVideoFaceRestoration extends ReplicateNode {
  static readonly nodeType =
    "replicate.video.process.StableVideoFaceRestoration";
  static readonly title = "Stable Video Face Restoration";
  static readonly description = `SVFR: A Unified Framework for Generalized Video Face Restoration
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "int",
    default: 16,
    description: "Chunk size for decoding long videos."
  })
  declare decode_chunk_size: any;

  @prop({
    type: "float",
    default: 1,
    description: "Image-to-image noise strength."
  })
  declare i2i_noise_strength: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An inpainting mask image (white areas will be restored). Only required when tasks includes inpainting."
  })
  declare mask: any;

  @prop({
    type: "float",
    default: 2,
    description: "Maximum guidance scale for restoration."
  })
  declare max_appearance_guidance_scale: any;

  @prop({
    type: "float",
    default: 2,
    description: "Minimum guidance scale for restoration."
  })
  declare min_appearance_guidance_scale: any;

  @prop({
    type: "float",
    default: 0,
    description: "Noise augmentation strength."
  })
  declare noise_aug_strength: any;

  @prop({ type: "int", default: 30, description: "Number of diffusion steps." })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 3,
    description: "Number of overlapping frames between segments."
  })
  declare overlap: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "face-restoration",
    values: [
      "face-restoration",
      "face-restoration-and-colorization",
      "face-restoration-and-colorization-and-inpainting"
    ],
    description: "Which restoration tasks to apply."
  })
  declare tasks: any;

  @prop({
    type: "video",
    default: "",
    description: "Input video file (e.g. MP4)."
  })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const decodeChunkSize = Number(this.decode_chunk_size ?? 16);
    const i2iNoiseStrength = Number(this.i2i_noise_strength ?? 1);
    const maxAppearanceGuidanceScale = Number(
      this.max_appearance_guidance_scale ?? 2
    );
    const minAppearanceGuidanceScale = Number(
      this.min_appearance_guidance_scale ?? 2
    );
    const noiseAugStrength = Number(this.noise_aug_strength ?? 0);
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const overlap = Number(this.overlap ?? 3);
    const seed = Number(this.seed ?? -1);
    const tasks = String(this.tasks ?? "face-restoration");

    const args: Record<string, unknown> = {
      decode_chunk_size: decodeChunkSize,
      i2i_noise_strength: i2iNoiseStrength,
      max_appearance_guidance_scale: maxAppearanceGuidanceScale,
      min_appearance_guidance_scale: minAppearanceGuidanceScale,
      noise_aug_strength: noiseAugStrength,
      num_inference_steps: numInferenceSteps,
      overlap: overlap,
      seed: seed,
      tasks: tasks
    };

    const maskRef = this.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = await assetToUrl(maskRef!, apiKey);
      if (maskUrl) args["mask"] = maskUrl;
    }

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToUrl(videoRef!, apiKey);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "zsxkib/stable-video-face-restoration:63512c77555a80ca5c84c590641036ba9f938d38b9a1841ea369780072561373",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Deoldify_Video extends ReplicateNode {
  static readonly nodeType = "replicate.video.process.Deoldify_Video";
  static readonly title = "Deoldify_ Video";
  static readonly description = `Add colours to old video footage.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({ type: "video", default: "", description: "Path to a video" })
  declare input_video: any;

  @prop({
    type: "int",
    default: 21,
    description:
      "The default value of 35 has been carefully chosen and should work -ok- for most scenarios (but probably won't be the -best-). This determines resolution at which the color portion of the image is rendered. Lower resolution will render faster, and colors also tend to look more vibrant. Older and lower quality images in particular will generally benefit by lowering the render factor. Higher render factors are often better for higher quality images, but the colors may get slightly washed out."
  })
  declare render_factor: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const renderFactor = Number(this.render_factor ?? 21);

    const args: Record<string, unknown> = {
      render_factor: renderFactor
    };

    const inputVideoRef = this.input_video as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputVideoRef)) {
      const inputVideoUrl = await assetToUrl(inputVideoRef!, apiKey);
      if (inputVideoUrl) args["input_video"] = inputVideoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "arielreplicate/deoldify_video:8f1189b476fcb54cfbe1d07d97b025c571a2ce4e9a7a9558640c78647576e16f",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class AutoCaption extends ReplicateNode {
  static readonly nodeType = "replicate.video.process.AutoCaption";
  static readonly title = "Auto Caption";
  static readonly description = `Automatically add captions to a video
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "int",
    default: 20,
    description:
      "Max characters space for subtitles. 20 is good for videos, 10 is good for reels"
  })
  declare MaxChars: any;

  @prop({ type: "str", default: "white", description: "Caption color" })
  declare color: any;

  @prop({
    type: "enum",
    default: "Poppins/Poppins-ExtraBold.ttf",
    values: [
      "Poppins/Poppins-Bold.ttf",
      "Poppins/Poppins-BoldItalic.ttf",
      "Poppins/Poppins-ExtraBold.ttf",
      "Poppins/Poppins-ExtraBoldItalic.ttf",
      "Poppins/Poppins-Black.ttf",
      "Poppins/Poppins-BlackItalic.ttf",
      "Atkinson_Hyperlegible/AtkinsonHyperlegible-Bold.ttf",
      "Atkinson_Hyperlegible/AtkinsonHyperlegible-BoldItalic.ttf",
      "M_PLUS_Rounded_1c/MPLUSRounded1c-ExtraBold.ttf",
      "Arial/Arial_Bold.ttf",
      "Arial/Arial_BoldItalic.ttf",
      "Tajawal/Tajawal-Bold.ttf",
      "Tajawal/Tajawal-ExtraBold.ttf",
      "Tajawal/Tajawal-Black.ttf"
    ],
    description: "Font"
  })
  declare font: any;

  @prop({
    type: "float",
    default: 7,
    description: "Font size. 7.0 is good for videos, 4.0 is good for reels"
  })
  declare fontsize: any;

  @prop({ type: "str", default: "yellow", description: "Highlight color" })
  declare highlight_color: any;

  @prop({
    type: "float",
    default: -5,
    description: "Kerning for the subtitles"
  })
  declare kerning: any;

  @prop({
    type: "float",
    default: 0,
    description: "Opacity for the subtitles background"
  })
  declare opacity: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Output transcript json, if true will output a transcript file that you can edit and use for the next run in transcript_file_input"
  })
  declare output_transcript: any;

  @prop({
    type: "bool",
    default: true,
    description: "Output video, if true will output the video with subtitles"
  })
  declare output_video: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Right to left subtitles, for right to left languages. Only Arial fonts are supported."
  })
  declare right_to_left: any;

  @prop({ type: "str", default: "black", description: "Stroke color" })
  declare stroke_color: any;

  @prop({ type: "float", default: 2.6, description: "Stroke width" })
  declare stroke_width: any;

  @prop({
    type: "enum",
    default: "bottom75",
    values: ["bottom75", "center", "top", "bottom", "left", "right"],
    description: "Subtitles position"
  })
  declare subs_position: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Transcript file, if provided will use this for words rather than whisper."
  })
  declare transcript_file_input: any;

  @prop({
    type: "bool",
    default: false,
    description: "Translate the subtitles to English"
  })
  declare translate: any;

  @prop({ type: "video", default: "", description: "Video file" })
  declare video_file_input: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const MaxChars = Number(this.MaxChars ?? 20);
    const color = String(this.color ?? "white");
    const font = String(this.font ?? "Poppins/Poppins-ExtraBold.ttf");
    const fontsize = Number(this.fontsize ?? 7);
    const highlightColor = String(this.highlight_color ?? "yellow");
    const kerning = Number(this.kerning ?? -5);
    const opacity = Number(this.opacity ?? 0);
    const outputTranscript = Boolean(this.output_transcript ?? true);
    const outputVideo = Boolean(this.output_video ?? true);
    const rightToLeft = Boolean(this.right_to_left ?? false);
    const strokeColor = String(this.stroke_color ?? "black");
    const strokeWidth = Number(this.stroke_width ?? 2.6);
    const subsPosition = String(this.subs_position ?? "bottom75");
    const translate = Boolean(this.translate ?? false);

    const args: Record<string, unknown> = {
      MaxChars: MaxChars,
      color: color,
      font: font,
      fontsize: fontsize,
      highlight_color: highlightColor,
      kerning: kerning,
      opacity: opacity,
      output_transcript: outputTranscript,
      output_video: outputVideo,
      right_to_left: rightToLeft,
      stroke_color: strokeColor,
      stroke_width: strokeWidth,
      subs_position: subsPosition,
      translate: translate
    };

    const transcriptFileInputRef = this.transcript_file_input as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(transcriptFileInputRef)) {
      const transcriptFileInputUrl = await assetToUrl(
        transcriptFileInputRef!,
        apiKey
      );
      if (transcriptFileInputUrl)
        args["transcript_file_input"] = transcriptFileInputUrl;
    }

    const videoFileInputRef = this.video_file_input as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(videoFileInputRef)) {
      const videoFileInputUrl = await assetToUrl(videoFileInputRef!, apiKey);
      if (videoFileInputUrl) args["video_file_input"] = videoFileInputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "fictions-ai/autocaption:18a45ff0d95feb4449d192bbdc06b4a6df168fa33def76dfc51b78ae224b599b",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Wan_2_2_S2V extends ReplicateNode {
  static readonly nodeType = "replicate.video.process.Wan_2_2_S2V";
  static readonly title = "Wan_2_2_ S2 V";
  static readonly description = `Generate a video from an audio clip and a reference image
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "audio",
    default: "",
    description: "Audio file to synchronize the video with"
  })
  declare audio: any;

  @prop({
    type: "image",
    default: "",
    description: "First frame image to start the video from"
  })
  declare image: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to interpolate video to higher frame rate (25fps)"
  })
  declare interpolate: any;

  @prop({
    type: "int",
    default: 81,
    description: "Number of frames per video chunk"
  })
  declare num_frames_per_chunk: any;

  @prop({
    type: "str",
    default: "",
    description: "Prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank for random"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const interpolate = Boolean(this.interpolate ?? false);
    const numFramesPerChunk = Number(this.num_frames_per_chunk ?? 81);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      interpolate: interpolate,
      num_frames_per_chunk: numFramesPerChunk,
      prompt: prompt,
      seed: seed
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "wan-video/wan-2.2-s2v:09607e6e761d2f015b0d740f938ec59199f54aa623384465a5054b230405acf4",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class VEED_Fabric extends ReplicateNode {
  static readonly nodeType = "replicate.video.process.VEED_Fabric";
  static readonly title = "V E E D_ Fabric";
  static readonly description = `VEED Fabric 1.0 is an image-to-video API that turns any image into a talking video
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "audio",
    default: "",
    description: "Audio to generate video from"
  })
  declare audio: any;

  @prop({
    type: "image",
    default: "",
    description: "Image to generate video from"
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p"],
    description: "Resolution of the generated video"
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const resolution = String(this.resolution ?? "720p");

    const args: Record<string, unknown> = {
      resolution: resolution
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "veed/fabric-1.0:739bbce4edc07b0b1bd055998983324fe9a8ea18d854b5979423c5d6f62e5b78",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export const REPLICATE_VIDEO_PROCESS_NODES: readonly NodeClass[] = [
  Modify_Video,
  Reframe_Video,
  RealBasicVSR,
  Crystal_Video_Upscaler,
  RealEsrGan_Video,
  StableVideoFaceRestoration,
  Deoldify_Video,
  AutoCaption,
  Wan_2_2_S2V,
  VEED_Fabric
] as const;
