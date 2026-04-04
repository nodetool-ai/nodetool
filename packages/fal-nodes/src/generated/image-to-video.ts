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

export class PixverseV56ImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV56ImageToVideo";
  static readonly title = "Pixverse V56 Image To Video";
  static readonly description = `Generate high-quality videos from images with Pixverse v5.6.
video, generation, pixverse, v5.6, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt describing the desired video motion"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8", "10"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution quality of the output video"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description: "Optional visual style for the video"
  })
  declare style: any;

  @prop({
    type: "str",
    default: "",
    description: "Thinking mode for video generation"
  })
  declare thinking_type: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare image: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to generate audio for the video"
  })
  declare generate_audio_switch: any;

  @prop({
    type: "str",
    default: "",
    description: "Optional seed for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "What to avoid in the generated video"
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "5");
    const resolution = String(this.resolution ?? "720p");
    const style = String(this.style ?? "");
    const thinkingType = String(this.thinking_type ?? "");
    const generateAudioSwitch = Boolean(this.generate_audio_switch ?? false);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      resolution: resolution,
      style: style,
      thinking_type: thinkingType,
      generate_audio_switch: generateAudioSwitch,
      seed: seed,
      negative_prompt: negativePrompt
    };

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
      "fal-ai/pixverse/v5.6/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LumaDreamMachine extends FalNode {
  static readonly nodeType = "fal.image_to_video.LumaDreamMachine";
  static readonly title = "Luma Dream Machine";
  static readonly description = `Generate video clips from your images using Luma Dream Machine v1.5. Supports various aspect ratios and optional end-frame blending.
video, generation, animation, blending, aspect-ratio, img2vid, image-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "4:3", "3:4", "21:9", "9:21"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether the video should loop (end of video is blended with the beginning)"
  })
  declare loop: any;

  @prop({
    type: "image",
    default: "",
    description: "An image to blend the end of the video with"
  })
  declare end_image: any;

  @prop({ type: "image", default: "" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const loop = Boolean(this.loop ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      loop: loop
    };

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
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/luma-dream-machine/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class AMTFrameInterpolation extends FalNode {
  static readonly nodeType = "fal.image_to_video.AMTFrameInterpolation";
  static readonly title = "A M T Frame Interpolation";
  static readonly description = `AMT Frame Interpolation creates smooth transitions between image frames.
video, interpolation, frame-generation, amt, image-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "list[Frame]",
    default: [],
    description: "Frames to interpolate"
  })
  declare frames: any;

  @prop({
    type: "int",
    default: 4,
    description: "Number of recursive interpolation passes"
  })
  declare recursive_interpolation_passes: any;

  @prop({ type: "int", default: 24, description: "Output frames per second" })
  declare output_fps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const frames = String(this.frames ?? []);
    const recursiveInterpolationPasses = Number(
      this.recursive_interpolation_passes ?? 4
    );
    const outputFps = Number(this.output_fps ?? 24);

    const args: Record<string, unknown> = {
      frames: frames,
      recursive_interpolation_passes: recursiveInterpolationPasses,
      output_fps: outputFps
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/amt-interpolation/frame-interpolation",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class AIAvatar extends FalNode {
  static readonly nodeType = "fal.image_to_video.AIAvatar";
  static readonly title = "A I Avatar";
  static readonly description = `MultiTalk generates talking avatar videos from images and audio files.
video, avatar, talking-head, multitalk, image-to-video`;
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
    default: 42,
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 145,
    description:
      "Number of frames to generate. Must be between 81 to 129 (inclusive). If the number of frames is greater than 81, the video will be generated with 1.25x more billing units."
  })
  declare num_frames: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "480p");
    const acceleration = String(this.acceleration ?? "regular");
    const seed = Number(this.seed ?? 42);
    const numFrames = Number(this.num_frames ?? 145);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      acceleration: acceleration,
      seed: seed,
      num_frames: numFrames
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

    const res = await falSubmit(apiKey, "fal-ai/ai-avatar", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class AIAvatarSingleText extends FalNode {
  static readonly nodeType = "fal.image_to_video.AIAvatarSingleText";
  static readonly title = "A I Avatar Single Text";
  static readonly description = `MultiTalk generates talking avatar videos from an image and text input.
video, avatar, talking-head, text-to-speech, image-to-video`;
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
    type: "str",
    default: "",
    description: "The text input to guide video generation."
  })
  declare text_input: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "Aria",
      "Roger",
      "Sarah",
      "Laura",
      "Charlie",
      "George",
      "Callum",
      "River",
      "Liam",
      "Charlotte",
      "Alice",
      "Matilda",
      "Will",
      "Jessica",
      "Eric",
      "Chris",
      "Brian",
      "Daniel",
      "Lily",
      "Bill"
    ],
    description: "The voice to use for speech generation"
  })
  declare voice: any;

  @prop({
    type: "int",
    default: 42,
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 136,
    description:
      "Number of frames to generate. Must be between 81 to 129 (inclusive). If the number of frames is greater than 81, the video will be generated with 1.25x more billing units."
  })
  declare num_frames: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "480p");
    const acceleration = String(this.acceleration ?? "regular");
    const textInput = String(this.text_input ?? "");
    const voice = String(this.voice ?? "");
    const seed = Number(this.seed ?? 42);
    const numFrames = Number(this.num_frames ?? 136);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      acceleration: acceleration,
      text_input: textInput,
      voice: voice,
      seed: seed,
      num_frames: numFrames
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ai-avatar/single-text", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class AIAvatarMultiText extends FalNode {
  static readonly nodeType = "fal.image_to_video.AIAvatarMultiText";
  static readonly title = "A I Avatar Multi Text";
  static readonly description = `MultiTalk generates multi-speaker avatar videos from images and text.
video, avatar, multi-speaker, talking-head, image-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "The text input to guide video generation."
  })
  declare second_text_input: any;

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
    type: "image",
    default: "",
    description:
      "URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "The text input to guide video generation."
  })
  declare first_text_input: any;

  @prop({
    type: "enum",
    default: "Roger",
    values: [
      "Aria",
      "Roger",
      "Sarah",
      "Laura",
      "Charlie",
      "George",
      "Callum",
      "River",
      "Liam",
      "Charlotte",
      "Alice",
      "Matilda",
      "Will",
      "Jessica",
      "Eric",
      "Chris",
      "Brian",
      "Daniel",
      "Lily",
      "Bill"
    ],
    description: "The second person's voice to use for speech generation"
  })
  declare voice2: any;

  @prop({
    type: "enum",
    default: "Sarah",
    values: [
      "Aria",
      "Roger",
      "Sarah",
      "Laura",
      "Charlie",
      "George",
      "Callum",
      "River",
      "Liam",
      "Charlotte",
      "Alice",
      "Matilda",
      "Will",
      "Jessica",
      "Eric",
      "Chris",
      "Brian",
      "Daniel",
      "Lily",
      "Bill"
    ],
    description: "The first person's voice to use for speech generation"
  })
  declare voice1: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 191,
    description:
      "Number of frames to generate. Must be between 81 to 129 (inclusive). If the number of frames is greater than 81, the video will be generated with 1.25x more billing units."
  })
  declare num_frames: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const secondTextInput = String(this.second_text_input ?? "");
    const acceleration = String(this.acceleration ?? "regular");
    const resolution = String(this.resolution ?? "480p");
    const firstTextInput = String(this.first_text_input ?? "");
    const voice2 = String(this.voice2 ?? "Roger");
    const voice1 = String(this.voice1 ?? "Sarah");
    const seed = Number(this.seed ?? 81);
    const numFrames = Number(this.num_frames ?? 191);

    const args: Record<string, unknown> = {
      prompt: prompt,
      second_text_input: secondTextInput,
      acceleration: acceleration,
      resolution: resolution,
      first_text_input: firstTextInput,
      voice2: voice2,
      voice1: voice1,
      seed: seed,
      num_frames: numFrames
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ai-avatar/multi-text", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class AIAvatarMulti extends FalNode {
  static readonly nodeType = "fal.image_to_video.AIAvatarMulti";
  static readonly title = "A I Avatar Multi";
  static readonly description = `MultiTalk generates multi-speaker avatar videos with audio synchronization.
video, avatar, multi-speaker, talking-head, image-to-video`;
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
    type: "audio",
    default: "",
    description: "The URL of the Person 1 audio file."
  })
  declare first_audio: any;

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
    description: "The URL of the Person 2 audio file."
  })
  declare second_audio: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to use only the first audio file."
  })
  declare use_only_first_audio: any;

  @prop({
    type: "int",
    default: 181,
    description:
      "Number of frames to generate. Must be between 81 to 129 (inclusive). If the number of frames is greater than 81, the video will be generated with 1.25x more billing units."
  })
  declare num_frames: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "480p");
    const acceleration = String(this.acceleration ?? "regular");
    const seed = Number(this.seed ?? 81);
    const useOnlyFirstAudio = Boolean(this.use_only_first_audio ?? false);
    const numFrames = Number(this.num_frames ?? 181);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      acceleration: acceleration,
      seed: seed,
      use_only_first_audio: useOnlyFirstAudio,
      num_frames: numFrames
    };

    const firstAudioRef = this.first_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstAudioRef)) {
      const firstAudioUrl = await assetToFalUrl(apiKey, firstAudioRef!);
      if (firstAudioUrl) args["first_audio_url"] = firstAudioUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const secondAudioRef = this.second_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(secondAudioRef)) {
      const secondAudioUrl = await assetToFalUrl(apiKey, secondAudioRef!);
      if (secondAudioUrl) args["second_audio_url"] = secondAudioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ai-avatar/multi", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class SeeDanceV15ProImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.SeeDanceV15ProImageToVideo";
  static readonly title = "See Dance V15 Pro Image To Video";
  static readonly description = `SeeDance v1.5 Pro generates high-quality dance videos from images.
video, dance, animation, seedance, bytedance, image-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt used to generate the video"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p", "1080p"],
    description:
      "Video resolution - 480p for faster generation, 720p for balance, 1080p for higher quality"
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["4", "5", "6", "7", "8", "9", "10", "11", "12"],
    description: "Duration of the video in seconds"
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the video"
  })
  declare generate_audio: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "auto"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image used to generate video"
  })
  declare image: any;

  @prop({
    type: "bool",
    default: true,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to fix the camera position"
  })
  declare camera_fixed: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image the video ends with. Defaults to None."
  })
  declare end_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Random seed to control video generation. Use -1 for random."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const duration = String(this.duration ?? "5");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const cameraFixed = Boolean(this.camera_fixed ?? false);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      duration: duration,
      generate_audio: generateAudio,
      aspect_ratio: aspectRatio,
      enable_safety_checker: enableSafetyChecker,
      camera_fixed: cameraFixed,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
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
      "fal-ai/bytedance/seedance/v1.5/pro/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class SeeDanceV1ProFastImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.SeeDanceV1ProFastImageToVideo";
  static readonly title = "See Dance V1 Pro Fast Image To Video";
  static readonly description = `SeeDance v1 Pro Fast generates dance videos quickly from images.
video, dance, fast, seedance, bytedance, image-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt used to generate the video"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "auto"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["480p", "720p", "1080p"],
    description:
      "Video resolution - 480p for faster generation, 720p for balance, 1080p for higher quality"
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
    description: "Duration of the video in seconds"
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image used to generate video"
  })
  declare image: any;

  @prop({
    type: "bool",
    default: true,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to fix the camera position"
  })
  declare camera_fixed: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The number of frames to generate. If provided, will override duration."
  })
  declare num_frames: any;

  @prop({
    type: "str",
    default: "",
    description: "Random seed to control video generation. Use -1 for random."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "1080p");
    const duration = String(this.duration ?? "5");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const cameraFixed = Boolean(this.camera_fixed ?? false);
    const numFrames = String(this.num_frames ?? "");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      duration: duration,
      enable_safety_checker: enableSafetyChecker,
      camera_fixed: cameraFixed,
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
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/bytedance/seedance/v1/pro/fast/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class SeeDanceV1LiteReferenceToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.SeeDanceV1LiteReferenceToVideo";
  static readonly title = "See Dance V1 Lite Reference To Video";
  static readonly description = `SeeDance v1 Lite generates lightweight dance videos using reference images.
video, dance, lite, reference, seedance, image-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt used to generate the video"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "auto"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p"],
    description:
      "Video resolution - 480p for faster generation, 720p for higher quality"
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
    description: "Duration of the video in seconds"
  })
  declare duration: any;

  @prop({
    type: "list[image]",
    default: [],
    description: "Reference images to generate the video with."
  })
  declare reference_images: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to fix the camera position"
  })
  declare camera_fixed: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The number of frames to generate. If provided, will override duration."
  })
  declare num_frames: any;

  @prop({
    type: "str",
    default: "",
    description: "Random seed to control video generation. Use -1 for random."
  })
  declare seed: any;

  @prop({
    type: "bool",
    default: true,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "720p");
    const duration = String(this.duration ?? "5");
    const cameraFixed = Boolean(this.camera_fixed ?? false);
    const numFrames = String(this.num_frames ?? "");
    const seed = String(this.seed ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      duration: duration,
      camera_fixed: cameraFixed,
      num_frames: numFrames,
      seed: seed,
      enable_safety_checker: enableSafetyChecker
    };

    const referenceImagesList = this.reference_images as
      | Record<string, unknown>[]
      | undefined;
    if (referenceImagesList?.length) {
      const referenceImagesUrls: string[] = [];
      for (const ref of referenceImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) referenceImagesUrls.push(u);
        }
      }
      if (referenceImagesUrls.length)
        args["reference_image_urls"] = referenceImagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/bytedance/seedance/v1/lite/reference-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ByteDanceVideoStylize extends FalNode {
  static readonly nodeType = "fal.image_to_video.ByteDanceVideoStylize";
  static readonly title = "Byte Dance Video Stylize";
  static readonly description = `ByteDance Video Stylize applies artistic styles to image-based video generation.
video, style-transfer, artistic, bytedance, image-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({
    type: "str",
    default: "",
    description:
      "The style for your character in the video. Please use a short description."
  })
  declare style: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to make the stylized video from."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const style = String(this.style ?? "");

    const args: Record<string, unknown> = {
      style: style
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/bytedance/video-stylize", args);
    return { output: res };
  }
}

export class OmniHumanV15 extends FalNode {
  static readonly nodeType = "fal.image_to_video.OmniHumanV15";
  static readonly title = "Omni Human V15";
  static readonly description = `OmniHuman v1.5 generates realistic human videos from images.
video, human, realistic, bytedance, image-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { duration: "float", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt used to guide the video generation."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["720p", "1080p"],
    description:
      "The resolution of the generated video. Defaults to 1080p. 720p generation is faster and higher in quality. 1080p generation is limited to 30s audio and 720p generation is limited to 60s audio."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Generate a video at a faster rate with a slight quality trade-off."
  })
  declare turbo_mode: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "The URL of the audio file to generate the video. Audio must be under 30s long for 1080p generation and under 60s long for 720p generation."
  })
  declare audio: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image used to generate the video"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "1080p");
    const turboMode = Boolean(this.turbo_mode ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      turbo_mode: turboMode
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
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
      "fal-ai/bytedance/omnihuman/v1.5",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class CogVideoX5BImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.CogVideoX5BImageToVideo";
  static readonly title = "Cog Video X5 B Image To Video";
  static readonly description = `CogVideoX-5B generates high-quality videos from images with advanced motion.
video, generation, cogvideo, image-to-video, img2vid`;
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
    type: "bool",
    default: true,
    description: "Use RIFE for video interpolation"
  })
  declare use_rife: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL to the image to generate the video from."
  })
  declare image: any;

  @prop({
    type: "list[LoraWeight]",
    default: [],
    description:
      "\n            The LoRAs to use for the image generation. We currently support one lora.\n        "
  })
  declare loras: any;

  @prop({
    type: "str",
    default: "",
    description: "The size of the generated video."
  })
  declare video_size: any;

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
    const loras = String(this.loras ?? []);
    const videoSize = String(this.video_size ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 7);
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const exportFps = Number(this.export_fps ?? 16);
    const negativePrompt = String(this.negative_prompt ?? "");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      use_rife: useRife,
      loras: loras,
      video_size: videoSize,
      guidance_scale: guidanceScale,
      num_inference_steps: numInferenceSteps,
      export_fps: exportFps,
      negative_prompt: negativePrompt,
      seed: seed
    };

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
      "fal-ai/cogvideox-5b/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class StableVideoImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.StableVideoImageToVideo";
  static readonly title = "Stable Video Image To Video";
  static readonly description = `Stable Video generates consistent video animations from images.
video, generation, stable, consistent, image-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "int",
    default: 127,
    description:
      "\n            The motion bucket id determines the motion of the generated video. The\n            higher the number, the more motion there will be.\n        "
  })
  declare motion_bucket_id: any;

  @prop({
    type: "int",
    default: 25,
    description: "The frames per second of the generated video."
  })
  declare fps: any;

  @prop({
    type: "float",
    default: 0.02,
    description:
      "\n            The conditoning augmentation determines the amount of noise that will be\n            added to the conditioning frame. The higher the number, the more noise\n            there will be, and the less the video will look like the initial image.\n            Increase it for more motion.\n        "
  })
  declare cond_aug: any;

  @prop({
    type: "int",
    default: -1,
    description:
      "\n            The same seed and the same prompt given to the same version of Stable Diffusion\n            will output the same image every time.\n        "
  })
  declare seed: any;

  @prop({
    type: "image",
    default: "",
    description:
      "The URL of the image to use as a starting point for the generation."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const motionBucketId = Number(this.motion_bucket_id ?? 127);
    const fps = Number(this.fps ?? 25);
    const condAug = Number(this.cond_aug ?? 0.02);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      motion_bucket_id: motionBucketId,
      fps: fps,
      cond_aug: condAug,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/stable-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LTXImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.LTXImageToVideo";
  static readonly title = "L T X Image To Video";
  static readonly description = `LTX Video generates temporally consistent videos from images.
video, generation, ltx, temporal, image-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 3,
    description: "The guidance scale to use."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 30,
    description: "The number of inference steps to take."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed to use for random number generation."
  })
  declare seed: any;

  @prop({
    type: "str",
    default:
      "low quality, worst quality, deformed, distorted, disfigured, motion smear, motion artifacts, fused fingers, bad anatomy, weird hand, ugly",
    description: "The negative prompt to generate the video from."
  })
  declare negative_prompt: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to generate the video from."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(
      this.negative_prompt ??
        "low quality, worst quality, deformed, distorted, disfigured, motion smear, motion artifacts, fused fingers, bad anatomy, weird hand, ugly"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      guidance_scale: guidanceScale,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      negative_prompt: negativePrompt
    };

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
      "fal-ai/ltx-video/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV1StandardImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.KlingVideoV1StandardImageToVideo";
  static readonly title = "Kling Video V1 Standard Image To Video";
  static readonly description = `Kling Video v1 Standard generates videos from images with balanced quality.
video, generation, kling, standard, image-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "", description: "The prompt for the video" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({ type: "str", default: "blur, distort, and low quality" })
  declare negative_prompt: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be used for the video"
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the image for Static Brush Application Area (Mask image created by users using the motion brush)"
  })
  declare static_mask_url: any;

  @prop({ type: "str", default: "", description: "List of dynamic masks" })
  declare dynamic_masks: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be used for the end of the video"
  })
  declare tail_image: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt.\n        "
  })
  declare cfg_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "5");
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );
    const dynamicMasks = String(this.dynamic_masks ?? "");
    const cfgScale = Number(this.cfg_scale ?? 0.5);

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      negative_prompt: negativePrompt,
      dynamic_masks: dynamicMasks,
      cfg_scale: cfgScale
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const staticMaskUrlRef = this.static_mask_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(staticMaskUrlRef)) {
      const staticMaskUrlUrl =
        (await imageToDataUrl(staticMaskUrlRef!)) ??
        (await assetToFalUrl(apiKey, staticMaskUrlRef!));
      if (staticMaskUrlUrl) args["static_mask_url"] = staticMaskUrlUrl;
    }

    const tailImageRef = this.tail_image as Record<string, unknown> | undefined;
    if (isRefSet(tailImageRef)) {
      const tailImageUrl =
        (await imageToDataUrl(tailImageRef!)) ??
        (await assetToFalUrl(apiKey, tailImageRef!));
      if (tailImageUrl) args["tail_image_url"] = tailImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/v1/standard/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV56Transition extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV56Transition";
  static readonly title = "Pixverse V56 Transition";
  static readonly description = `Pixverse v5.6 Transition creates smooth video transitions between two images with professional effects.
video, transition, pixverse, v5.6, effects`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare first_image: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "4:3", "1:1", "3:4", "9:16"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description: "The style of the generated video"
  })
  declare style: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Prompt optimization mode: 'enabled' to optimize, 'disabled' to turn off, 'auto' for model decision"
  })
  declare thinking_type: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8", "10"],
    description:
      "The duration of the generated video in seconds. 1080p videos are limited to 5 or 8 seconds"
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt for the transition"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Enable audio generation (BGM, SFX, dialogue)"
  })
  declare generate_audio_switch: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of the model\n            will output the same video every time.\n        "
  })
  declare seed: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the last frame"
  })
  declare end_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to be used for the generation"
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "720p");
    const style = String(this.style ?? "");
    const thinkingType = String(this.thinking_type ?? "");
    const duration = String(this.duration ?? "5");
    const prompt = String(this.prompt ?? "");
    const generateAudioSwitch = Boolean(this.generate_audio_switch ?? false);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      resolution: resolution,
      style: style,
      thinking_type: thinkingType,
      duration: duration,
      prompt: prompt,
      generate_audio_switch: generateAudioSwitch,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const firstImageRef = this.first_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstImageRef)) {
      const firstImageUrl =
        (await imageToDataUrl(firstImageRef!)) ??
        (await assetToFalUrl(apiKey, firstImageRef!));
      if (firstImageUrl) args["first_image_url"] = firstImageUrl;
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
      "fal-ai/pixverse/v5.6/transition",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ViduQ2ReferenceToVideoPro extends FalNode {
  static readonly nodeType = "fal.image_to_video.ViduQ2ReferenceToVideoPro";
  static readonly title = "Vidu Q2 Reference To Video Pro";
  static readonly description = `Vidu Q2 Reference-to-Video Pro generates professional quality videos using reference images for style and content.
video, generation, vidu, q2, pro, reference`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation, max 2000 characters"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 4,
    description: "Duration of the video in seconds (0 for automatic duration)"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["540p", "720p", "1080p"],
    description: "Output video resolution"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "16:9",
    description:
      "Aspect ratio of the output video (e.g., auto, 16:9, 9:16, 1:1, or any W:H)"
  })
  declare aspect_ratio: any;

  @prop({
    type: "list[video]",
    default: [],
    description:
      "URLs of the reference videos for video editing or motion reference. Supports up to 2 videos."
  })
  declare reference_video_urls: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to add background music to the generated video"
  })
  declare bgm: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "URLs of the reference images for subject appearance. If videos are provided, up to 4 images are allowed; otherwise up to 7 images."
  })
  declare reference_images: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "small", "medium", "large"],
    description: "The movement amplitude of objects in the frame"
  })
  declare movement_amplitude: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = Number(this.duration ?? 4);
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const bgm = Boolean(this.bgm ?? false);
    const seed = String(this.seed ?? "");
    const movementAmplitude = String(this.movement_amplitude ?? "auto");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      bgm: bgm,
      seed: seed,
      movement_amplitude: movementAmplitude
    };

    const referenceVideoUrlsList = this.reference_video_urls as
      | Record<string, unknown>[]
      | undefined;
    if (referenceVideoUrlsList?.length) {
      const referenceVideoUrlsUrls: string[] = [];
      for (const ref of referenceVideoUrlsList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) referenceVideoUrlsUrls.push(u);
        }
      }
      if (referenceVideoUrlsUrls.length)
        args["reference_video_urls"] = referenceVideoUrlsUrls;
    }

    const referenceImagesList = this.reference_images as
      | Record<string, unknown>[]
      | undefined;
    if (referenceImagesList?.length) {
      const referenceImagesUrls: string[] = [];
      for (const ref of referenceImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) referenceImagesUrls.push(u);
        }
      }
      if (referenceImagesUrls.length)
        args["reference_image_urls"] = referenceImagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/vidu/q2/reference-to-video/pro",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV26ImageToVideoFlash extends FalNode {
  static readonly nodeType = "fal.image_to_video.WanV26ImageToVideoFlash";
  static readonly title = "Wan V26 Image To Video Flash";
  static readonly description = `Wan v2.6 Flash generates videos from images with ultra-fast processing for rapid iteration.
video, generation, wan, v2.6, flash, fast`;
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
      "The text prompt describing the desired video motion. Max 800 characters."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10", "15"],
    description:
      "Duration of the generated video in seconds. Choose between 5, 10 or 15 seconds."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["720p", "1080p"],
    description: "Video resolution. Valid values: 720p, 1080p"
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: true,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the image to use as the first frame. Must be publicly accessible or base64 data URI. Image dimensions must be between 240 and 7680."
  })
  declare image: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable prompt rewriting using LLM."
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
    type: "bool",
    default: false,
    description:
      "When true, enables intelligent multi-shot segmentation. Only active when enable_prompt_expansion is True. Set to false for single-shot generation."
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
    type: "audio",
    default: "",
    description:
      "\nURL of the audio to use as the background music. Must be publicly accessible.\nLimit handling: If the audio duration exceeds the duration value (5, 10, or 15 seconds),\nthe audio is truncated to the first N seconds, and the rest is discarded. If\nthe audio is shorter than the video, the remaining part of the video will be silent.\nFor example, if the audio is 3 seconds long and the video duration is 5 seconds, the\nfirst 3 seconds of the output video will have sound, and the last 2 seconds will be silent.\n- Format: WAV, MP3.\n- Duration: 3 to 30 s.\n- File size: Up to 15 MB.\n"
  })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "5");
    const resolution = String(this.resolution ?? "1080p");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
    const multiShots = Boolean(this.multi_shots ?? false);
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      resolution: resolution,
      enable_safety_checker: enableSafetyChecker,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      multi_shots: multiShots,
      negative_prompt: negativePrompt
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

    const res = await falSubmit(apiKey, "wan/v2.6/image-to-video/flash", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV26ImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.WanV26ImageToVideo";
  static readonly title = "Wan V26 Image To Video";
  static readonly description = `Wan v2.6 generates high-quality videos from images with balanced quality and performance.
video, generation, wan, v2.6, image-to-video`;
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
      "The text prompt describing the desired video motion. Max 800 characters."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10", "15"],
    description:
      "Duration of the generated video in seconds. Choose between 5, 10 or 15 seconds."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["720p", "1080p"],
    description: "Video resolution. Valid values: 720p, 1080p"
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: true,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the image to use as the first frame. Must be publicly accessible or base64 data URI. Image dimensions must be between 240 and 7680."
  })
  declare image: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable prompt rewriting using LLM."
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
    type: "bool",
    default: false,
    description:
      "When true, enables intelligent multi-shot segmentation. Only active when enable_prompt_expansion is True. Set to false for single-shot generation."
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
    type: "audio",
    default: "",
    description:
      "\nURL of the audio to use as the background music. Must be publicly accessible.\nLimit handling: If the audio duration exceeds the duration value (5, 10, or 15 seconds),\nthe audio is truncated to the first N seconds, and the rest is discarded. If\nthe audio is shorter than the video, the remaining part of the video will be silent.\nFor example, if the audio is 3 seconds long and the video duration is 5 seconds, the\nfirst 3 seconds of the output video will have sound, and the last 2 seconds will be silent.\n- Format: WAV, MP3.\n- Duration: 3 to 30 s.\n- File size: Up to 15 MB.\n"
  })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "5");
    const resolution = String(this.resolution ?? "1080p");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
    const multiShots = Boolean(this.multi_shots ?? false);
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      resolution: resolution,
      enable_safety_checker: enableSafetyChecker,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      multi_shots: multiShots,
      negative_prompt: negativePrompt
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

    const res = await falSubmit(apiKey, "wan/v2.6/image-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.Ltx219BImageToVideo";
  static readonly title = "Ltx219 B Image To Video";
  static readonly description = `LTX-2 19B generates high-quality videos from images using the powerful 19-billion parameter model.
video, generation, ltx-2, 19b, large-model`;
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
    type: "str",
    default: "",
    description: "The prompt used for the generation."
  })
  declare prompt: any;

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
    description: "The URL of the image to use as the end of the video."
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
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

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
    description: "The strength of the image to use for the video generation."
  })
  declare image_strength: any;

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
    description: "The URL of the image to generate the video from."
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
    type: "float",
    default: 1,
    description:
      "The strength of the end image to use for the video generation."
  })
  declare end_image_strength: any;

  @prop({
    type: "enum",
    default: "forward",
    values: ["forward", "backward"],
    description:
      "The direction to interpolate the image sequence in. 'Forward' goes from the start image to the end image, 'Backward' goes from the end image to the start image."
  })
  declare interpolation_direction: any;

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
    const acceleration = String(this.acceleration ?? "regular");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const fps = Number(this.fps ?? 25);
    const cameraLora = String(this.camera_lora ?? "none");
    const videoSize = String(this.video_size ?? "auto");
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const numFrames = Number(this.num_frames ?? 121);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const imageStrength = Number(this.image_strength ?? 1);
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
    const endImageStrength = Number(this.end_image_strength ?? 1);
    const interpolationDirection = String(
      this.interpolation_direction ?? "forward"
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);

    const args: Record<string, unknown> = {
      use_multiscale: useMultiscale,
      prompt: prompt,
      acceleration: acceleration,
      generate_audio: generateAudio,
      fps: fps,
      camera_lora: cameraLora,
      video_size: videoSize,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      negative_prompt: negativePrompt,
      enable_safety_checker: enableSafetyChecker,
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      image_strength: imageStrength,
      camera_lora_scale: cameraLoraScale,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      end_image_strength: endImageStrength,
      interpolation_direction: interpolationDirection,
      num_inference_steps: numInferenceSteps
    };

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
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BImageToVideoLora extends FalNode {
  static readonly nodeType = "fal.image_to_video.Ltx219BImageToVideoLora";
  static readonly title = "Ltx219 B Image To Video Lora";
  static readonly description = `LTX-2 19B with LoRA enables custom-trained 19B models for specialized video generation.
video, generation, ltx-2, 19b, lora, custom`;
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
    type: "str",
    default: "",
    description: "The prompt used for the generation."
  })
  declare prompt: any;

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
    description: "The URL of the image to use as the end of the video."
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
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

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
    description: "The strength of the image to use for the video generation."
  })
  declare image_strength: any;

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
    description: "The URL of the image to generate the video from."
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
    type: "float",
    default: 1,
    description:
      "The strength of the end image to use for the video generation."
  })
  declare end_image_strength: any;

  @prop({
    type: "enum",
    default: "forward",
    values: ["forward", "backward"],
    description:
      "The direction to interpolate the image sequence in. 'Forward' goes from the start image to the end image, 'Backward' goes from the end image to the start image."
  })
  declare interpolation_direction: any;

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
    const acceleration = String(this.acceleration ?? "regular");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const fps = Number(this.fps ?? 25);
    const loras = String(this.loras ?? []);
    const cameraLora = String(this.camera_lora ?? "none");
    const videoSize = String(this.video_size ?? "auto");
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const numFrames = Number(this.num_frames ?? 121);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const imageStrength = Number(this.image_strength ?? 1);
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
    const endImageStrength = Number(this.end_image_strength ?? 1);
    const interpolationDirection = String(
      this.interpolation_direction ?? "forward"
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);

    const args: Record<string, unknown> = {
      use_multiscale: useMultiscale,
      prompt: prompt,
      acceleration: acceleration,
      generate_audio: generateAudio,
      fps: fps,
      loras: loras,
      camera_lora: cameraLora,
      video_size: videoSize,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      negative_prompt: negativePrompt,
      enable_safety_checker: enableSafetyChecker,
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      image_strength: imageStrength,
      camera_lora_scale: cameraLoraScale,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      end_image_strength: endImageStrength,
      interpolation_direction: interpolationDirection,
      num_inference_steps: numInferenceSteps
    };

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
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/image-to-video/lora",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BDistilledImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.Ltx219BDistilledImageToVideo";
  static readonly title = "Ltx219 B Distilled Image To Video";
  static readonly description = `LTX-2 19B Distilled generates videos efficiently using knowledge distillation from the 19B model.
video, generation, ltx-2, 19b, distilled, efficient`;
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
    type: "str",
    default: "",
    description: "The prompt used for the generation."
  })
  declare prompt: any;

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
    type: "image",
    default: "",
    description: "The URL of the image to use as the end of the video."
  })
  declare end_image: any;

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
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to generate the video from."
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
    type: "float",
    default: 1,
    description:
      "The strength of the end image to use for the video generation."
  })
  declare end_image_strength: any;

  @prop({
    type: "enum",
    default: "forward",
    values: ["forward", "backward"],
    description:
      "The direction to interpolate the image sequence in. 'Forward' goes from the start image to the end image, 'Backward' goes from the end image to the start image."
  })
  declare interpolation_direction: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const useMultiscale = Boolean(this.use_multiscale ?? true);
    const prompt = String(this.prompt ?? "");
    const acceleration = String(this.acceleration ?? "none");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const fps = Number(this.fps ?? 25);
    const cameraLora = String(this.camera_lora ?? "none");
    const videoSize = String(this.video_size ?? "auto");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 121);
    const imageStrength = Number(this.image_strength ?? 1);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
    const endImageStrength = Number(this.end_image_strength ?? 1);
    const interpolationDirection = String(
      this.interpolation_direction ?? "forward"
    );

    const args: Record<string, unknown> = {
      use_multiscale: useMultiscale,
      prompt: prompt,
      acceleration: acceleration,
      generate_audio: generateAudio,
      fps: fps,
      camera_lora: cameraLora,
      video_size: videoSize,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      image_strength: imageStrength,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      camera_lora_scale: cameraLoraScale,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      end_image_strength: endImageStrength,
      interpolation_direction: interpolationDirection
    };

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
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/distilled/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BDistilledImageToVideoLora extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.Ltx219BDistilledImageToVideoLora";
  static readonly title = "Ltx219 B Distilled Image To Video Lora";
  static readonly description = `LTX-2 19B Distilled with LoRA combines efficient generation with custom-trained models.
video, generation, ltx-2, 19b, distilled, lora`;
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
    type: "str",
    default: "",
    description: "The prompt used for the generation."
  })
  declare prompt: any;

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
    type: "image",
    default: "",
    description: "The URL of the image to use as the end of the video."
  })
  declare end_image: any;

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
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to generate the video from."
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
    type: "float",
    default: 1,
    description:
      "The strength of the end image to use for the video generation."
  })
  declare end_image_strength: any;

  @prop({
    type: "enum",
    default: "forward",
    values: ["forward", "backward"],
    description:
      "The direction to interpolate the image sequence in. 'Forward' goes from the start image to the end image, 'Backward' goes from the end image to the start image."
  })
  declare interpolation_direction: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const useMultiscale = Boolean(this.use_multiscale ?? true);
    const prompt = String(this.prompt ?? "");
    const acceleration = String(this.acceleration ?? "none");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const fps = Number(this.fps ?? 25);
    const loras = String(this.loras ?? []);
    const cameraLora = String(this.camera_lora ?? "none");
    const videoSize = String(this.video_size ?? "auto");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 121);
    const imageStrength = Number(this.image_strength ?? 1);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
    const endImageStrength = Number(this.end_image_strength ?? 1);
    const interpolationDirection = String(
      this.interpolation_direction ?? "forward"
    );

    const args: Record<string, unknown> = {
      use_multiscale: useMultiscale,
      prompt: prompt,
      acceleration: acceleration,
      generate_audio: generateAudio,
      fps: fps,
      loras: loras,
      camera_lora: cameraLora,
      video_size: videoSize,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      image_strength: imageStrength,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      camera_lora_scale: cameraLoraScale,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      end_image_strength: endImageStrength,
      interpolation_direction: interpolationDirection
    };

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
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/distilled/image-to-video/lora",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanMove extends FalNode {
  static readonly nodeType = "fal.image_to_video.WanMove";
  static readonly title = "Wan Move";
  static readonly description = `Wan Move generates videos with natural motion and movement from static images.
video, generation, wan, motion, animation`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt to guide the video generation."
  })
  declare prompt: any;

  @prop({
    type: "list[list[str]]",
    default: [],
    description:
      "A list of trajectories. Each trajectory list means the movement of one object."
  })
  declare trajectories: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped."
  })
  declare image: any;

  @prop({
    type: "float",
    default: 3.5,
    description:
      "Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality."
  })
  declare guidance_scale: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 40,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default:
      "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走",
    description: "Negative prompt to guide the video generation."
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const trajectories = String(this.trajectories ?? []);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const negativePrompt = String(
      this.negative_prompt ??
        "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      trajectories: trajectories,
      guidance_scale: guidanceScale,
      seed: seed,
      num_inference_steps: numInferenceSteps,
      negative_prompt: negativePrompt
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-move", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Kandinsky5ProImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.Kandinsky5ProImageToVideo";
  static readonly title = "Kandinsky5 Pro Image To Video";
  static readonly description = `Kandinsky5 Pro generates professional quality videos from images with artistic style and control.
video, generation, kandinsky, pro, artistic`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "512P",
    values: ["512P", "1024P"],
    description: "Video resolution: 512p or 1024p."
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "regular",
    description: "Acceleration level for faster generation."
  })
  declare acceleration: any;

  @prop({ type: "str", default: "5s", description: "Video duration." })
  declare duration: any;

  @prop({ type: "int", default: 28 })
  declare num_inference_steps: any;

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
    const resolution = String(this.resolution ?? "512P");
    const acceleration = String(this.acceleration ?? "regular");
    const duration = String(this.duration ?? "5s");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      acceleration: acceleration,
      duration: duration,
      num_inference_steps: numInferenceSteps
    };

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
      "fal-ai/kandinsky5-pro/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LiveAvatar extends FalNode {
  static readonly nodeType = "fal.image_to_video.LiveAvatar";
  static readonly title = "Live Avatar";
  static readonly description = `Live Avatar creates animated talking avatars from portrait images with realistic lip-sync and expressions.
video, avatar, talking-head, animation, portrait`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "int",
    default: 48,
    description:
      "Number of frames per clip. Must be a multiple of 4. Higher values = smoother but slower generation."
  })
  declare frames_per_clip: any;

  @prop({
    type: "str",
    default: "",
    description:
      "A text prompt describing the scene and character. Helps guide the video generation style and context."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "none",
    values: ["none", "light", "regular", "high"],
    description: "Acceleration level for faster video decoding "
  })
  declare acceleration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "The URL of the reference image for avatar generation. The character in this image will be animated."
  })
  declare image: any;

  @prop({
    type: "int",
    default: 10,
    description:
      "Number of video clips to generate. Each clip is approximately 3 seconds. Set higher for longer videos."
  })
  declare num_clips: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "The URL of the driving audio file (WAV or MP3). The avatar will be animated to match this audio."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    description: "Random seed for reproducible generation."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Classifier-free guidance scale. Higher values follow the prompt more closely."
  })
  declare guidance_scale: any;

  @prop({
    type: "bool",
    default: true,
    description: "Enable safety checker for content moderation."
  })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const framesPerClip = Number(this.frames_per_clip ?? 48);
    const prompt = String(this.prompt ?? "");
    const acceleration = String(this.acceleration ?? "none");
    const numClips = Number(this.num_clips ?? 10);
    const seed = String(this.seed ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 0);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      frames_per_clip: framesPerClip,
      prompt: prompt,
      acceleration: acceleration,
      num_clips: numClips,
      seed: seed,
      guidance_scale: guidanceScale,
      enable_safety_checker: enableSafetyChecker
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

    const res = await falSubmit(apiKey, "fal-ai/live-avatar", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class HunyuanVideoV15ImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.HunyuanVideoV15ImageToVideo";
  static readonly title = "Hunyuan Video V15 Image To Video";
  static readonly description = `Hunyuan Video v1.5 generates high-quality videos from images with advanced AI capabilities.
video, generation, hunyuan, v1.5, advanced`;
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
    description: "The aspect ratio of the video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "480p",
    description: "The resolution of the video."
  })
  declare resolution: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the reference image for image-to-video generation."
  })
  declare image: any;

  @prop({
    type: "bool",
    default: true,
    description: "Enable prompt expansion to enhance the input prompt."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "int",
    default: 28,
    description: "The number of inference steps."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "str",
    default: "",
    description: "The negative prompt to guide what not to generate."
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Random seed for reproducibility."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "480p");
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const numFrames = Number(this.num_frames ?? 121);
    const negativePrompt = String(this.negative_prompt ?? "");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps,
      num_frames: numFrames,
      negative_prompt: negativePrompt,
      seed: seed
    };

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
      "fal-ai/hunyuan-video-v1.5/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO1StandardImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.KlingVideoO1StandardImageToVideo";
  static readonly title = "Kling Video O1 Standard Image To Video";
  static readonly description = `Kling Video O1 Standard generates videos with optimized standard quality from images.
video, generation, kling, o1, standard`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Use @Image1 to reference the start frame, @Image2 to reference the end frame."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["3", "4", "5", "6", "7", "8", "9", "10"],
    description: "Video duration in seconds."
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Image to use as the first frame of the video.\n\nMax file size: 10.0MB, Min width: 300px, Min height: 300px, Min aspect ratio: 0.40, Max aspect ratio: 2.50, Timeout: 20.0s"
  })
  declare start_image: any;

  @prop({
    type: "image",
    default: "",
    description: "Image to use as the last frame of the video."
  })
  declare end_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "5");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration
    };

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl =
        (await imageToDataUrl(startImageRef!)) ??
        (await assetToFalUrl(apiKey, startImageRef!));
      if (startImageUrl) args["start_image_url"] = startImageUrl;
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
      "fal-ai/kling-video/o1/standard/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO1StandardReferenceToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.KlingVideoO1StandardReferenceToVideo";
  static readonly title = "Kling Video O1 Standard Reference To Video";
  static readonly description = `Kling Video O1 Standard generates videos using reference images for style consistency.
video, generation, kling, o1, standard, reference`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Take @Element1, @Element2 to reference elements and @Image1, @Image2 to reference images in order."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "The aspect ratio of the generated video frame."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["3", "4", "5", "6", "7", "8", "9", "10"],
    description: "Video duration in seconds."
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Elements (characters/objects) to include in the video. Reference in prompt as @Element1, @Element2, etc. Maximum 7 total (elements + reference images + start image)."
  })
  declare elements: any;

  @prop({
    type: "list[image]",
    default: "",
    description:
      "Additional reference images for style/appearance. Reference in prompt as @Image1, @Image2, etc. Maximum 7 total (elements + reference images + start image)."
  })
  declare images: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? "5");
    const elements = String(this.elements ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      duration: duration,
      elements: elements
    };

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
      "fal-ai/kling-video/o1/standard/reference-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO3StandardImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.KlingVideoO3StandardImageToVideo";
  static readonly title = "Kling Video O3 Standard Image To Video";
  static readonly description = `Kling Video O3 Standard generates videos from images with balanced quality and speed.
video, generation, kling, o3, standard, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Text prompt for video generation. Either prompt or multi_prompt must be provided, but not both."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: [
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15"
    ],
    description: "Video duration in seconds (3-15s)."
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "",
    description: "List of prompts for multi-shot video generation."
  })
  declare multi_prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to generate native audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "str",
    default: "customize",
    description: "The type of multi-shot video generation."
  })
  declare shot_type: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the start frame image."
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the end frame image (optional)."
  })
  declare end_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "5");
    const multiPrompt = String(this.multi_prompt ?? "");
    const generateAudio = Boolean(this.generate_audio ?? false);
    const shotType = String(this.shot_type ?? "customize");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      multi_prompt: multiPrompt,
      generate_audio: generateAudio,
      shot_type: shotType
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
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
      "fal-ai/kling-video/o3/standard/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO3ProImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.KlingVideoO3ProImageToVideo";
  static readonly title = "Kling Video O3 Pro Image To Video";
  static readonly description = `Kling Video O3 Pro generates professional quality videos from images with enhanced fidelity.
video, generation, kling, o3, pro, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Text prompt for video generation. Either prompt or multi_prompt must be provided, but not both."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: [
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15"
    ],
    description: "Video duration in seconds (3-15s)."
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "",
    description: "List of prompts for multi-shot video generation."
  })
  declare multi_prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to generate native audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "str",
    default: "customize",
    description: "The type of multi-shot video generation."
  })
  declare shot_type: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the start frame image."
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the end frame image (optional)."
  })
  declare end_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "5");
    const multiPrompt = String(this.multi_prompt ?? "");
    const generateAudio = Boolean(this.generate_audio ?? false);
    const shotType = String(this.shot_type ?? "customize");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      multi_prompt: multiPrompt,
      generate_audio: generateAudio,
      shot_type: shotType
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
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
      "fal-ai/kling-video/o3/pro/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO3StandardReferenceToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.KlingVideoO3StandardReferenceToVideo";
  static readonly title = "Kling Video O3 Standard Reference To Video";
  static readonly description = `Kling Video O3 Standard generates videos using reference images for style consistency.
video, generation, kling, o3, standard, reference`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Text prompt for video generation. Either prompt or multi_prompt must be provided, but not both."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: [
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15"
    ],
    description: "Video duration in seconds (3-15s)."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "The aspect ratio of the generated video frame."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to generate native audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "str",
    default: "",
    description: "List of prompts for multi-shot video generation."
  })
  declare multi_prompt: any;

  @prop({
    type: "str",
    default: "customize",
    description: "The type of multi-shot video generation."
  })
  declare shot_type: any;

  @prop({
    type: "image",
    default: "",
    description: "Image to use as the first frame of the video."
  })
  declare start_image: any;

  @prop({
    type: "image",
    default: "",
    description: "Image to use as the last frame of the video."
  })
  declare end_image: any;

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
    const duration = String(this.duration ?? "5");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const generateAudio = Boolean(this.generate_audio ?? false);
    const multiPrompt = String(this.multi_prompt ?? "");
    const shotType = String(this.shot_type ?? "customize");
    const elements = String(this.elements ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      aspect_ratio: aspectRatio,
      generate_audio: generateAudio,
      multi_prompt: multiPrompt,
      shot_type: shotType,
      elements: elements
    };

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl =
        (await imageToDataUrl(startImageRef!)) ??
        (await assetToFalUrl(apiKey, startImageRef!));
      if (startImageUrl) args["start_image_url"] = startImageUrl;
    }

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
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
      "fal-ai/kling-video/o3/standard/reference-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO3ProReferenceToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.KlingVideoO3ProReferenceToVideo";
  static readonly title = "Kling Video O3 Pro Reference To Video";
  static readonly description = `Kling Video O3 Pro generates high-fidelity videos using reference images for style and structure.
video, generation, kling, o3, pro, reference`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Text prompt for video generation. Either prompt or multi_prompt must be provided, but not both."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: [
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15"
    ],
    description: "Video duration in seconds (3-15s)."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "The aspect ratio of the generated video frame."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to generate native audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "str",
    default: "",
    description: "List of prompts for multi-shot video generation."
  })
  declare multi_prompt: any;

  @prop({
    type: "str",
    default: "customize",
    description: "The type of multi-shot video generation."
  })
  declare shot_type: any;

  @prop({
    type: "image",
    default: "",
    description: "Image to use as the first frame of the video."
  })
  declare start_image: any;

  @prop({
    type: "image",
    default: "",
    description: "Image to use as the last frame of the video."
  })
  declare end_image: any;

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
    const duration = String(this.duration ?? "5");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const generateAudio = Boolean(this.generate_audio ?? false);
    const multiPrompt = String(this.multi_prompt ?? "");
    const shotType = String(this.shot_type ?? "customize");
    const elements = String(this.elements ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      aspect_ratio: aspectRatio,
      generate_audio: generateAudio,
      multi_prompt: multiPrompt,
      shot_type: shotType,
      elements: elements
    };

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl =
        (await imageToDataUrl(startImageRef!)) ??
        (await assetToFalUrl(apiKey, startImageRef!));
      if (startImageUrl) args["start_image_url"] = startImageUrl;
    }

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
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
      "fal-ai/kling-video/o3/pro/reference-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV26ProImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.KlingVideoV26ProImageToVideo";
  static readonly title = "Kling Video V26 Pro Image To Video";
  static readonly description = `Kling Video v2.6 Pro generates professional quality videos with latest model improvements.
video, generation, kling, v2.6, pro`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional Voice IDs for video generation. Reference voices in your prompt with <<<voice_1>>> and <<<voice_2>>> (maximum 2 voices per task). Get voice IDs from the kling video create-voice endpoint: https://fal.ai/models/fal-ai/kling-video/create-voice"
  })
  declare voice_ids: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to generate native audio for the video. Supports Chinese and English voice output. Other languages are automatically translated to English. For English speech, use lowercase letters; for acronyms or proper nouns, use uppercase."
  })
  declare generate_audio: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be used for the video"
  })
  declare start_image: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be used for the end of the video"
  })
  declare end_image: any;

  @prop({ type: "str", default: "blur, distort, and low quality" })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const voiceIds = String(this.voice_ids ?? "");
    const duration = String(this.duration ?? "5");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      voice_ids: voiceIds,
      duration: duration,
      generate_audio: generateAudio,
      negative_prompt: negativePrompt
    };

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl =
        (await imageToDataUrl(startImageRef!)) ??
        (await assetToFalUrl(apiKey, startImageRef!));
      if (startImageUrl) args["start_image_url"] = startImageUrl;
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
      "fal-ai/kling-video/v2.6/pro/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoAiAvatarV2Standard extends FalNode {
  static readonly nodeType = "fal.image_to_video.KlingVideoAiAvatarV2Standard";
  static readonly title = "Kling Video Ai Avatar V2 Standard";
  static readonly description = `Kling Video AI Avatar v2 Standard creates animated talking avatars with standard quality.
video, avatar, kling, v2, standard, talking-head`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { duration: "float", video: "video" };

  @prop({
    type: "str",
    default: ".",
    description: "The prompt to use for the video generation."
  })
  declare prompt: any;

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the audio file."
  })
  declare audio: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as your avatar"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? ".");

    const args: Record<string, unknown> = {
      prompt: prompt
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
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
      "fal-ai/kling-video/ai-avatar/v2/standard",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoAiAvatarV2Pro extends FalNode {
  static readonly nodeType = "fal.image_to_video.KlingVideoAiAvatarV2Pro";
  static readonly title = "Kling Video Ai Avatar V2 Pro";
  static readonly description = `Kling Video AI Avatar v2 Pro creates professional quality animated talking avatars with enhanced realism.
video, avatar, kling, v2, pro, talking-head`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { duration: "float", video: "video" };

  @prop({
    type: "str",
    default: ".",
    description: "The prompt to use for the video generation."
  })
  declare prompt: any;

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the audio file."
  })
  declare audio: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as your avatar"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? ".");

    const args: Record<string, unknown> = {
      prompt: prompt
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
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
      "fal-ai/kling-video/ai-avatar/v2/pro",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class CreatifyAurora extends FalNode {
  static readonly nodeType = "fal.image_to_video.CreatifyAurora";
  static readonly title = "Creatify Aurora";
  static readonly description = `Creatify Aurora generates creative and visually stunning videos from images with unique effects.
video, generation, creatify, aurora, creative, effects`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "A text prompt to guide the video generation process."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p"],
    description: "The resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the audio file to be used for video generation."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: 2,
    description: "Guidance scale to be used for audio adherence."
  })
  declare audio_guidance_scale: any;

  @prop({
    type: "str",
    default: 1,
    description: "Guidance scale to be used for text prompt adherence."
  })
  declare guidance_scale: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image file to be used for video generation."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const audioGuidanceScale = String(this.audio_guidance_scale ?? 2);
    const guidanceScale = String(this.guidance_scale ?? 1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      audio_guidance_scale: audioGuidanceScale,
      guidance_scale: guidanceScale
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/creatify/aurora", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV55Effects extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV55Effects";
  static readonly title = "Pixverse V55 Effects";
  static readonly description = `Pixverse
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to be used for the generation"
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8", "10"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Prompt optimization mode: 'enabled' to optimize, 'disabled' to turn off, 'auto' for model decision"
  })
  declare thinking_type: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "Kiss Me AI",
      "Kiss",
      "Muscle Surge",
      "Warmth of Jesus",
      "Anything, Robot",
      "The Tiger Touch",
      "Hug",
      "Holy Wings",
      "Microwave",
      "Zombie Mode",
      "Squid Game",
      "Baby Face",
      "Black Myth: Wukong",
      "Long Hair Magic",
      "Leggy Run",
      "Fin-tastic Mermaid",
      "Punch Face",
      "Creepy Devil Smile",
      "Thunder God",
      "Eye Zoom Challenge",
      "Who's Arrested?",
      "Baby Arrived",
      "Werewolf Rage",
      "Bald Swipe",
      "BOOM DROP",
      "Huge Cutie",
      "Liquid Metal",
      "Sharksnap!",
      "Dust Me Away",
      "3D Figurine Factor",
      "Bikini Up",
      "My Girlfriends",
      "My Boyfriends",
      "Subject 3 Fever",
      "Earth Zoom",
      "Pole Dance",
      "Vroom Dance",
      "GhostFace Terror",
      "Dragon Evoker",
      "Skeletal Bae",
      "Summoning succubus",
      "Halloween Voodoo Doll",
      "3D Naked-Eye AD",
      "Package Explosion",
      "Dishes Served",
      "Ocean ad",
      "Supermarket AD",
      "Tree doll",
      "Come Feel My Abs",
      "The Bicep Flex",
      "London Elite Vibe",
      "Flora Nymph Gown",
      "Christmas Costume",
      "It's Snowy",
      "Reindeer Cruiser",
      "Snow Globe Maker",
      "Pet Christmas Outfit",
      "Adopt a Polar Pal",
      "Cat Christmas Box",
      "Starlight Gift Box",
      "Xmas Poster",
      "Pet Christmas Tree",
      "City Santa Hat",
      "Stocking Sweetie",
      "Christmas Night",
      "Xmas Front Page Karma",
      "Grinch's Xmas Hijack",
      "Giant Product",
      "Truck Fashion Shoot",
      "Beach AD",
      "Shoal Surround",
      "Mechanical Assembly",
      "Lighting AD",
      "Billboard AD",
      "Product close-up",
      "Parachute Delivery",
      "Dreamlike Cloud",
      "Macaron Machine",
      "Poster AD",
      "Truck AD",
      "Graffiti AD",
      "3D Figurine Factory",
      "The Exclusive First Class",
      "Art Zoom Challenge",
      "I Quit",
      "Hitchcock Dolly Zoom",
      "Smell the Lens",
      "I believe I can fly",
      "Strikout Dance",
      "Pixel World",
      "Mint in Box",
      "Hands up, Hand",
      "Flora Nymph Go",
      "Somber Embrace",
      "Beam me up",
      "Suit Swagger"
    ],
    description: "The effect to apply to the video"
  })
  declare effect: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional URL of the image to use as the first frame. If not provided, generates from text"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const negativePrompt = String(this.negative_prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const duration = String(this.duration ?? "5");
    const thinkingType = String(this.thinking_type ?? "");
    const effect = String(this.effect ?? "");

    const args: Record<string, unknown> = {
      negative_prompt: negativePrompt,
      resolution: resolution,
      duration: duration,
      thinking_type: thinkingType,
      effect: effect
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/pixverse/v5.5/effects", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV55Transition extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV55Transition";
  static readonly title = "Pixverse V55 Transition";
  static readonly description = `Pixverse
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare first_image: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "4:3", "1:1", "3:4", "9:16"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description: "The style of the generated video"
  })
  declare style: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Prompt optimization mode: 'enabled' to optimize, 'disabled' to turn off, 'auto' for model decision"
  })
  declare thinking_type: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8", "10"],
    description:
      "The duration of the generated video in seconds. Longer durations cost more. 1080p videos are limited to 5 or 8 seconds"
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt for the transition"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Enable audio generation (BGM, SFX, dialogue)"
  })
  declare generate_audio_switch: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of the model\n            will output the same video every time.\n        "
  })
  declare seed: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the last frame"
  })
  declare end_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to be used for the generation"
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "720p");
    const style = String(this.style ?? "");
    const thinkingType = String(this.thinking_type ?? "");
    const duration = String(this.duration ?? "5");
    const prompt = String(this.prompt ?? "");
    const generateAudioSwitch = Boolean(this.generate_audio_switch ?? false);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      resolution: resolution,
      style: style,
      thinking_type: thinkingType,
      duration: duration,
      prompt: prompt,
      generate_audio_switch: generateAudioSwitch,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const firstImageRef = this.first_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstImageRef)) {
      const firstImageUrl =
        (await imageToDataUrl(firstImageRef!)) ??
        (await assetToFalUrl(apiKey, firstImageRef!));
      if (firstImageUrl) args["first_image_url"] = firstImageUrl;
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
      "fal-ai/pixverse/v5.5/transition",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV55ImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV55ImageToVideo";
  static readonly title = "Pixverse V55 Image To Video";
  static readonly description = `Pixverse
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8", "10"],
    description:
      "The duration of the generated video in seconds. Longer durations cost more. 1080p videos are limited to 5 or 8 seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description: "The style of the generated video"
  })
  declare style: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Prompt optimization mode: 'enabled' to optimize, 'disabled' to turn off, 'auto' for model decision"
  })
  declare thinking_type: any;

  @prop({
    type: "bool",
    default: false,
    description: "Enable multi-clip generation with dynamic camera changes"
  })
  declare generate_multi_clip_switch: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare image: any;

  @prop({
    type: "bool",
    default: false,
    description: "Enable audio generation (BGM, SFX, dialogue)"
  })
  declare generate_audio_switch: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of the model\n            will output the same video every time.\n        "
  })
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
    const resolution = String(this.resolution ?? "720p");
    const style = String(this.style ?? "");
    const thinkingType = String(this.thinking_type ?? "");
    const generateMultiClipSwitch = Boolean(
      this.generate_multi_clip_switch ?? false
    );
    const generateAudioSwitch = Boolean(this.generate_audio_switch ?? false);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      resolution: resolution,
      style: style,
      thinking_type: thinkingType,
      generate_multi_clip_switch: generateMultiClipSwitch,
      generate_audio_switch: generateAudioSwitch,
      seed: seed,
      negative_prompt: negativePrompt
    };

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
      "fal-ai/pixverse/v5.5/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO1ImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.KlingVideoO1ImageToVideo";
  static readonly title = "Kling Video O1 Image To Video";
  static readonly description = `Kling O1 First Frame Last Frame to Video [Pro]
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Use @Image1 to reference the start frame, @Image2 to reference the end frame."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["3", "4", "5", "6", "7", "8", "9", "10"],
    description: "Video duration in seconds."
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Image to use as the first frame of the video.\n\nMax file size: 10.0MB, Min width: 300px, Min height: 300px, Min aspect ratio: 0.40, Max aspect ratio: 2.50, Timeout: 20.0s"
  })
  declare start_image: any;

  @prop({
    type: "image",
    default: "",
    description: "Image to use as the last frame of the video."
  })
  declare end_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "5");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration
    };

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl =
        (await imageToDataUrl(startImageRef!)) ??
        (await assetToFalUrl(apiKey, startImageRef!));
      if (startImageUrl) args["start_image_url"] = startImageUrl;
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
      "fal-ai/kling-video/o1/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO1ReferenceToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.KlingVideoO1ReferenceToVideo";
  static readonly title = "Kling Video O1 Reference To Video";
  static readonly description = `Kling O1 Reference Image to Video [Pro]
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Take @Element1, @Element2 to reference elements and @Image1, @Image2 to reference images in order."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "The aspect ratio of the generated video frame."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["3", "4", "5", "6", "7", "8", "9", "10"],
    description: "Video duration in seconds."
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Elements (characters/objects) to include in the video. Reference in prompt as @Element1, @Element2, etc. Maximum 7 total (elements + reference images + start image)."
  })
  declare elements: any;

  @prop({
    type: "list[image]",
    default: "",
    description:
      "Additional reference images for style/appearance. Reference in prompt as @Image1, @Image2, etc. Maximum 7 total (elements + reference images + start image)."
  })
  declare images: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? "5");
    const elements = String(this.elements ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      duration: duration,
      elements: elements
    };

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
      "fal-ai/kling-video/o1/reference-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx2ImageToVideoFast extends FalNode {
  static readonly nodeType = "fal.image_to_video.Ltx2ImageToVideoFast";
  static readonly title = "Ltx2 Image To Video Fast";
  static readonly description = `LTX Video 2.0 Fast
video, animation, image-to-video, img2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: 6,
    values: [6, 8, 10, 12, 14, 16, 18, 20],
    description:
      "The duration of the generated video in seconds. The fast model supports 6-20 seconds. Note: Durations longer than 10 seconds (12, 14, 16, 18, 20) are only supported with 25 FPS and 1080p resolution."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["1080p", "1440p", "2160p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the generated video"
  })
  declare generate_audio: any;

  @prop({
    type: "enum",
    default: 25,
    values: [25, 50],
    description: "The frames per second of the generated video"
  })
  declare fps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the image to generate the video from. Must be publicly accessible or base64 data URI. Supports PNG, JPEG, WebP, AVIF, and HEIF formats."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? 6);
    const resolution = String(this.resolution ?? "1080p");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const fps = String(this.fps ?? 25);

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      resolution: resolution,
      generate_audio: generateAudio,
      fps: fps
    };

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
      "fal-ai/ltx-2/image-to-video/fast",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx2ImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.Ltx2ImageToVideo";
  static readonly title = "Ltx2 Image To Video";
  static readonly description = `LTX Video 2.0 Pro
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: 6,
    values: [6, 8, 10],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["1080p", "1440p", "2160p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the generated video"
  })
  declare generate_audio: any;

  @prop({
    type: "enum",
    default: 25,
    values: [25, 50],
    description: "The frames per second of the generated video"
  })
  declare fps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the image to generate the video from. Must be publicly accessible or base64 data URI. Supports PNG, JPEG, WebP, AVIF, and HEIF formats."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? 6);
    const resolution = String(this.resolution ?? "1080p");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const fps = String(this.fps ?? 25);

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      resolution: resolution,
      generate_audio: generateAudio,
      fps: fps
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ltx-2/image-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class BytedanceLynx extends FalNode {
  static readonly nodeType = "fal.image_to_video.BytedanceLynx";
  static readonly title = "Bytedance Lynx";
  static readonly description = `Lynx
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt to guide video generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "580p", "720p"],
    description: "Resolution of the generated video (480p, 580p, or 720p)"
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "Aspect ratio of the generated video (16:9, 9:16, or 1:1)"
  })
  declare aspect_ratio: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Number of frames in the generated video. Must be between 9 to 100."
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 2,
    description:
      "Image guidance scale. Controls how closely the generated video follows the reference image. Higher values increase adherence to the reference image but may decrease quality."
  })
  declare guidance_scale_2: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Reference image scale. Controls the influence of the reference image on the generated video."
  })
  declare strength: any;

  @prop({
    type: "int",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 5 to 30."
  })
  declare frames_per_second: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the subject image to be used for video generation"
  })
  declare image: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality."
  })
  declare guidance_scale: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 50,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default:
      "Bright tones, overexposed, blurred background, static, subtitles, style, works, paintings, images, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards",
    description:
      "Negative prompt to guide what should not appear in the generated video"
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Identity preservation scale. Controls how closely the generated video preserves the subject's identity from the reference image."
  })
  declare ip_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const numFrames = Number(this.num_frames ?? 81);
    const guidanceScale_2 = Number(this.guidance_scale_2 ?? 2);
    const strength = Number(this.strength ?? 1);
    const framesPerSecond = Number(this.frames_per_second ?? 16);
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const negativePrompt = String(
      this.negative_prompt ??
        "Bright tones, overexposed, blurred background, static, subtitles, style, works, paintings, images, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards"
    );
    const ipScale = Number(this.ip_scale ?? 1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      num_frames: numFrames,
      guidance_scale_2: guidanceScale_2,
      strength: strength,
      frames_per_second: framesPerSecond,
      guidance_scale: guidanceScale,
      seed: seed,
      num_inference_steps: numInferenceSteps,
      negative_prompt: negativePrompt,
      ip_scale: ipScale
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "bytedance/lynx", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseSwap extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseSwap";
  static readonly title = "Pixverse Swap";
  static readonly description = `Pixverse
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p"],
    description: "The output resolution (1080p not supported)"
  })
  declare resolution: any;

  @prop({
    type: "video",
    default: "",
    description: "URL of the external video to swap"
  })
  declare video: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the target image for swapping"
  })
  declare image: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to keep the original audio"
  })
  declare original_sound_switch: any;

  @prop({
    type: "enum",
    default: "person",
    values: ["person", "object", "background"],
    description: "The swap mode to use"
  })
  declare mode: any;

  @prop({ type: "str", default: "", description: "Random seed for generation" })
  declare seed: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "The keyframe ID to use for face/object mapping. The input video is normalized to 24 FPS before processing, so keyframe 1 = first frame, keyframe 24 = 1 second in, etc. Valid range: 1 to (duration_seconds * 24)."
  })
  declare keyframe_id: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const resolution = String(this.resolution ?? "720p");
    const originalSoundSwitch = Boolean(this.original_sound_switch ?? true);
    const mode = String(this.mode ?? "person");
    const seed = String(this.seed ?? "");
    const keyframeId = Number(this.keyframe_id ?? 1);

    const args: Record<string, unknown> = {
      resolution: resolution,
      original_sound_switch: originalSoundSwitch,
      mode: mode,
      seed: seed,
      keyframe_id: keyframeId
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

    const res = await falSubmit(apiKey, "fal-ai/pixverse/swap", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PikaV22Pikaframes extends FalNode {
  static readonly nodeType = "fal.image_to_video.PikaV22Pikaframes";
  static readonly title = "Pika V22 Pikaframes";
  static readonly description = `Pika
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Default prompt for all transitions. Individual transition prompts override this."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "list[KeyframeTransition]",
    default: [],
    description:
      "Configuration for each transition. Length must be len(image_urls) - 1. Total duration of all transitions must not exceed 25 seconds. If not provided, uses default 5-second transitions with the global prompt."
  })
  declare transitions: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator"
  })
  declare seed: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "URLs of keyframe images (2-5 images) to create transitions between"
  })
  declare images: any;

  @prop({
    type: "str",
    default: "",
    description: "A negative prompt to guide the model"
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const transitions = String(this.transitions ?? []);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      transitions: transitions,
      seed: seed,
      negative_prompt: negativePrompt
    };

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

    const res = await falSubmit(apiKey, "fal-ai/pika/v2.2/pikaframes", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LongcatVideoImageToVideo720P extends FalNode {
  static readonly nodeType = "fal.image_to_video.LongcatVideoImageToVideo720P";
  static readonly title = "Longcat Video Image To Video720 P";
  static readonly description = `LongCat Video
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "str",
    default:
      "First-person view from the cockpit of a Formula 1 car. The driver's gloved hands firmly grip the intricate, carbon-fiber steering wheel adorned with numerous colorful buttons and a vibrant digital display showing race data. Beyond the windshield, a sun-drenched racetrack stretches ahead, lined with cheering spectators in the grandstands. Several rival cars are visible in the distance, creating a dynamic sense of competition. The sky above is a clear, brilliant blue, reflecting the exhilarating atmosphere of a high-speed race. high resolution 4k",
    description: "The prompt to guide the video generation."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "regular",
    values: ["none", "regular"],
    description: "The acceleration level to use for the video generation."
  })
  declare acceleration: any;

  @prop({
    type: "int",
    default: 30,
    description: "The frame rate of the generated video."
  })
  declare fps: any;

  @prop({
    type: "int",
    default: 40,
    description: "The number of inference steps to use for refinement."
  })
  declare num_refine_inference_steps: any;

  @prop({
    type: "float",
    default: 4,
    description: "The guidance scale to use for the video generation."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 162,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default:
      "Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards",
    description: "The negative prompt to use for the video generation."
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
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to generate a video from."
  })
  declare image: any;

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
    type: "int",
    default: 40,
    description:
      "The number of inference steps to use for the video generation."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: -1,
    description: "The seed for the random number generator."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(
      this.prompt ??
        "First-person view from the cockpit of a Formula 1 car. The driver's gloved hands firmly grip the intricate, carbon-fiber steering wheel adorned with numerous colorful buttons and a vibrant digital display showing race data. Beyond the windshield, a sun-drenched racetrack stretches ahead, lined with cheering spectators in the grandstands. Several rival cars are visible in the distance, creating a dynamic sense of competition. The sky above is a clear, brilliant blue, reflecting the exhilarating atmosphere of a high-speed race. high resolution 4k"
    );
    const acceleration = String(this.acceleration ?? "regular");
    const fps = Number(this.fps ?? 30);
    const numRefineInferenceSteps = Number(
      this.num_refine_inference_steps ?? 40
    );
    const guidanceScale = Number(this.guidance_scale ?? 4);
    const numFrames = Number(this.num_frames ?? 162);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const negativePrompt = String(
      this.negative_prompt ??
        "Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards"
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const syncMode = Boolean(this.sync_mode ?? false);
    const videoQuality = String(this.video_quality ?? "high");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      acceleration: acceleration,
      fps: fps,
      num_refine_inference_steps: numRefineInferenceSteps,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      sync_mode: syncMode,
      video_quality: videoQuality,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps,
      seed: seed
    };

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
      "fal-ai/longcat-video/image-to-video/720p",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LongcatVideoImageToVideo480P extends FalNode {
  static readonly nodeType = "fal.image_to_video.LongcatVideoImageToVideo480P";
  static readonly title = "Longcat Video Image To Video480 P";
  static readonly description = `LongCat Video
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "str",
    default:
      "First-person view from the cockpit of a Formula 1 car. The driver's gloved hands firmly grip the intricate, carbon-fiber steering wheel adorned with numerous colorful buttons and a vibrant digital display showing race data. Beyond the windshield, a sun-drenched racetrack stretches ahead, lined with cheering spectators in the grandstands. Several rival cars are visible in the distance, creating a dynamic sense of competition. The sky above is a clear, brilliant blue, reflecting the exhilarating atmosphere of a high-speed race. high resolution 4k",
    description: "The prompt to guide the video generation."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "regular",
    values: ["none", "regular"],
    description: "The acceleration level to use for the video generation."
  })
  declare acceleration: any;

  @prop({
    type: "int",
    default: 15,
    description: "The frame rate of the generated video."
  })
  declare fps: any;

  @prop({
    type: "float",
    default: 4,
    description: "The guidance scale to use for the video generation."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 162,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default:
      "Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards",
    description: "The negative prompt to use for the video generation."
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
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to generate a video from."
  })
  declare image: any;

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
    type: "int",
    default: 40,
    description:
      "The number of inference steps to use for the video generation."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: -1,
    description: "The seed for the random number generator."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(
      this.prompt ??
        "First-person view from the cockpit of a Formula 1 car. The driver's gloved hands firmly grip the intricate, carbon-fiber steering wheel adorned with numerous colorful buttons and a vibrant digital display showing race data. Beyond the windshield, a sun-drenched racetrack stretches ahead, lined with cheering spectators in the grandstands. Several rival cars are visible in the distance, creating a dynamic sense of competition. The sky above is a clear, brilliant blue, reflecting the exhilarating atmosphere of a high-speed race. high resolution 4k"
    );
    const acceleration = String(this.acceleration ?? "regular");
    const fps = Number(this.fps ?? 15);
    const guidanceScale = Number(this.guidance_scale ?? 4);
    const numFrames = Number(this.num_frames ?? 162);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const negativePrompt = String(
      this.negative_prompt ??
        "Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards"
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const syncMode = Boolean(this.sync_mode ?? false);
    const videoQuality = String(this.video_quality ?? "high");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      acceleration: acceleration,
      fps: fps,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      sync_mode: syncMode,
      video_quality: videoQuality,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps,
      seed: seed
    };

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
      "fal-ai/longcat-video/image-to-video/480p",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LongcatVideoDistilledImageToVideo720P extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.LongcatVideoDistilledImageToVideo720P";
  static readonly title = "Longcat Video Distilled Image To Video720 P";
  static readonly description = `LongCat Video Distilled
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

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
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default:
      "First-person view from the cockpit of a Formula 1 car. The driver's gloved hands firmly grip the intricate, carbon-fiber steering wheel adorned with numerous colorful buttons and a vibrant digital display showing race data. Beyond the windshield, a sun-drenched racetrack stretches ahead, lined with cheering spectators in the grandstands. Several rival cars are visible in the distance, creating a dynamic sense of competition. The sky above is a clear, brilliant blue, reflecting the exhilarating atmosphere of a high-speed race. high resolution 4k",
    description: "The prompt to guide the video generation."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 30,
    description: "The frame rate of the generated video."
  })
  declare fps: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "int",
    default: 12,
    description: "The number of inference steps to use for refinement."
  })
  declare num_refine_inference_steps: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to generate a video from."
  })
  declare image: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: 12,
    description: "The number of inference steps to use."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: -1,
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 162,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const prompt = String(
      this.prompt ??
        "First-person view from the cockpit of a Formula 1 car. The driver's gloved hands firmly grip the intricate, carbon-fiber steering wheel adorned with numerous colorful buttons and a vibrant digital display showing race data. Beyond the windshield, a sun-drenched racetrack stretches ahead, lined with cheering spectators in the grandstands. Several rival cars are visible in the distance, creating a dynamic sense of competition. The sky above is a clear, brilliant blue, reflecting the exhilarating atmosphere of a high-speed race. high resolution 4k"
    );
    const fps = Number(this.fps ?? 30);
    const syncMode = Boolean(this.sync_mode ?? false);
    const numRefineInferenceSteps = Number(
      this.num_refine_inference_steps ?? 12
    );
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 12);
    const seed = Number(this.seed ?? -1);
    const numFrames = Number(this.num_frames ?? 162);
    const videoQuality = String(this.video_quality ?? "high");

    const args: Record<string, unknown> = {
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      enable_prompt_expansion: enablePromptExpansion,
      prompt: prompt,
      fps: fps,
      sync_mode: syncMode,
      num_refine_inference_steps: numRefineInferenceSteps,
      enable_safety_checker: enableSafetyChecker,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      num_frames: numFrames,
      video_quality: videoQuality
    };

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
      "fal-ai/longcat-video/distilled/image-to-video/720p",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LongcatVideoDistilledImageToVideo480P extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.LongcatVideoDistilledImageToVideo480P";
  static readonly title = "Longcat Video Distilled Image To Video480 P";
  static readonly description = `LongCat Video Distilled
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

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
    type: "str",
    default:
      "First-person view from the cockpit of a Formula 1 car. The driver's gloved hands firmly grip the intricate, carbon-fiber steering wheel adorned with numerous colorful buttons and a vibrant digital display showing race data. Beyond the windshield, a sun-drenched racetrack stretches ahead, lined with cheering spectators in the grandstands. Several rival cars are visible in the distance, creating a dynamic sense of competition. The sky above is a clear, brilliant blue, reflecting the exhilarating atmosphere of a high-speed race. high resolution 4k",
    description: "The prompt to guide the video generation."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 15,
    description: "The frame rate of the generated video."
  })
  declare fps: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to generate a video from."
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
    default: true,
    description: "Whether to enable safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: 12,
    description: "The number of inference steps to use."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: -1,
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 162,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const prompt = String(
      this.prompt ??
        "First-person view from the cockpit of a Formula 1 car. The driver's gloved hands firmly grip the intricate, carbon-fiber steering wheel adorned with numerous colorful buttons and a vibrant digital display showing race data. Beyond the windshield, a sun-drenched racetrack stretches ahead, lined with cheering spectators in the grandstands. Several rival cars are visible in the distance, creating a dynamic sense of competition. The sky above is a clear, brilliant blue, reflecting the exhilarating atmosphere of a high-speed race. high resolution 4k"
    );
    const fps = Number(this.fps ?? 15);
    const syncMode = Boolean(this.sync_mode ?? false);
    const videoQuality = String(this.video_quality ?? "high");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 12);
    const seed = Number(this.seed ?? -1);
    const numFrames = Number(this.num_frames ?? 162);
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );

    const args: Record<string, unknown> = {
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      prompt: prompt,
      fps: fps,
      sync_mode: syncMode,
      video_quality: videoQuality,
      enable_safety_checker: enableSafetyChecker,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      num_frames: numFrames,
      enable_prompt_expansion: enablePromptExpansion
    };

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
      "fal-ai/longcat-video/distilled/image-to-video/480p",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MinimaxHailuo23FastStandardImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.MinimaxHailuo23FastStandardImageToVideo";
  static readonly title = "Minimax Hailuo23 Fast Standard Image To Video";
  static readonly description = `MiniMax Hailuo 2.3 Fast [Standard] (Image to Video)
video, animation, image-to-video, img2vid, fast, professional`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "6",
    values: ["6", "10"],
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to use the model's prompt optimizer"
  })
  declare prompt_optimizer: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "6");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      prompt_optimizer: promptOptimizer
    };

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
      "fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MinimaxHailuo23StandardImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.MinimaxHailuo23StandardImageToVideo";
  static readonly title = "Minimax Hailuo23 Standard Image To Video";
  static readonly description = `MiniMax Hailuo 2.3 [Standard] (Image to Video)
video, animation, image-to-video, img2vid, professional`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "6",
    values: ["6", "10"],
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to use the model's prompt optimizer"
  })
  declare prompt_optimizer: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "6");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      prompt_optimizer: promptOptimizer
    };

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
      "fal-ai/minimax/hailuo-2.3/standard/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MinimaxHailuo23FastProImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.MinimaxHailuo23FastProImageToVideo";
  static readonly title = "Minimax Hailuo23 Fast Pro Image To Video";
  static readonly description = `MiniMax Hailuo 2.3 Fast [Pro] (Image to Video)
video, animation, image-to-video, img2vid, fast, professional`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to use the model's prompt optimizer"
  })
  declare prompt_optimizer: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      prompt_optimizer: promptOptimizer
    };

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
      "fal-ai/minimax/hailuo-2.3-fast/pro/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ViduQ2ImageToVideoTurbo extends FalNode {
  static readonly nodeType = "fal.image_to_video.ViduQ2ImageToVideoTurbo";
  static readonly title = "Vidu Q2 Image To Video Turbo";
  static readonly description = `Vidu
video, animation, image-to-video, img2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation, max 3000 characters"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: 4,
    values: [2, 3, 4, 5, 6, 7, 8],
    description: "Duration of the video in seconds"
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
    type: "image",
    default: "",
    description: "URL of the image to use as the starting frame"
  })
  declare image: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to add background music to the video (only for 4-second videos)"
  })
  declare bgm: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the image to use as the ending frame. When provided, generates a transition video between start and end frames."
  })
  declare end_image: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "small", "medium", "large"],
    description: "The movement amplitude of objects in the frame"
  })
  declare movement_amplitude: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? 4);
    const resolution = String(this.resolution ?? "720p");
    const bgm = Boolean(this.bgm ?? false);
    const seed = String(this.seed ?? "");
    const movementAmplitude = String(this.movement_amplitude ?? "auto");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      resolution: resolution,
      bgm: bgm,
      seed: seed,
      movement_amplitude: movementAmplitude
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
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
      "fal-ai/vidu/q2/image-to-video/turbo",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ViduQ2ImageToVideoPro extends FalNode {
  static readonly nodeType = "fal.image_to_video.ViduQ2ImageToVideoPro";
  static readonly title = "Vidu Q2 Image To Video Pro";
  static readonly description = `Vidu
video, animation, image-to-video, img2vid, professional`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation, max 3000 characters"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: 4,
    values: [2, 3, 4, 5, 6, 7, 8],
    description: "Duration of the video in seconds"
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
    type: "image",
    default: "",
    description: "URL of the image to use as the starting frame"
  })
  declare image: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to add background music to the video (only for 4-second videos)"
  })
  declare bgm: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the image to use as the ending frame. When provided, generates a transition video between start and end frames."
  })
  declare end_image: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "small", "medium", "large"],
    description: "The movement amplitude of objects in the frame"
  })
  declare movement_amplitude: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? 4);
    const resolution = String(this.resolution ?? "720p");
    const bgm = Boolean(this.bgm ?? false);
    const seed = String(this.seed ?? "");
    const movementAmplitude = String(this.movement_amplitude ?? "auto");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      resolution: resolution,
      bgm: bgm,
      seed: seed,
      movement_amplitude: movementAmplitude
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
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
      "fal-ai/vidu/q2/image-to-video/pro",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV25TurboStandardImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.KlingVideoV25TurboStandardImageToVideo";
  static readonly title = "Kling Video V25 Turbo Standard Image To Video";
  static readonly description = `Kling Video
video, animation, image-to-video, img2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt.\n        "
  })
  declare cfg_scale: any;

  @prop({ type: "str", default: "blur, distort, and low quality" })
  declare negative_prompt: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be used for the video"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "5");
    const cfgScale = Number(this.cfg_scale ?? 0.5);
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      cfg_scale: cfgScale,
      negative_prompt: negativePrompt
    };

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
      "fal-ai/kling-video/v2.5-turbo/standard/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Veo31FastFirstLastFrameToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.Veo31FastFirstLastFrameToVideo";
  static readonly title = "Veo31 Fast First Last Frame To Video";
  static readonly description = `Veo 3.1 Fast
video, animation, image-to-video, img2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt describing the video you want to generate"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "8s",
    values: ["4s", "6s", "8s"],
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
    type: "enum",
    default: "720p",
    values: ["720p", "1080p", "4k"],
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
    type: "video",
    default: "",
    description: "URL of the first frame of the video"
  })
  declare first_frame_url: any;

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

  @prop({
    type: "video",
    default: "",
    description: "URL of the last frame of the video"
  })
  declare last_frame_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "8s");
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
      "fal-ai/veo3.1/fast/first-last-frame-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Veo31FirstLastFrameToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.Veo31FirstLastFrameToVideo";
  static readonly title = "Veo31 First Last Frame To Video";
  static readonly description = `Veo 3.1
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt describing the video you want to generate"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "8s",
    values: ["4s", "6s", "8s"],
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
    type: "enum",
    default: "720p",
    values: ["720p", "1080p", "4k"],
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
    type: "video",
    default: "",
    description: "URL of the first frame of the video"
  })
  declare first_frame_url: any;

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

  @prop({
    type: "video",
    default: "",
    description: "URL of the last frame of the video"
  })
  declare last_frame_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "8s");
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
      "fal-ai/veo3.1/first-last-frame-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Veo31ReferenceToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.Veo31ReferenceToVideo";
  static readonly title = "Veo31 Reference To Video";
  static readonly description = `Veo 3.1
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt describing the video you want to generate"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "8s",
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
    type: "enum",
    default: "720p",
    values: ["720p", "1080p", "4k"],
    description: "The resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16"],
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
    type: "list[image]",
    default: [],
    description:
      "URLs of the reference images to use for consistent subject appearance"
  })
  declare images: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "8s");
    const autoFix = Boolean(this.auto_fix ?? false);
    const generateAudio = Boolean(this.generate_audio ?? true);
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const safetyTolerance = String(this.safety_tolerance ?? "4");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      auto_fix: autoFix,
      generate_audio: generateAudio,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      safety_tolerance: safetyTolerance
    };

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
      "fal-ai/veo3.1/reference-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Veo31FastImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.Veo31FastImageToVideo";
  static readonly title = "Veo31 Fast Image To Video";
  static readonly description = `Veo 3.1 Fast
video, animation, image-to-video, img2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt describing the video you want to generate"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to automatically attempt to fix prompts that fail content policy or other validation checks by rewriting them."
  })
  declare auto_fix: any;

  @prop({
    type: "enum",
    default: "8s",
    values: ["4s", "6s", "8s"],
    description: "The duration of the generated video."
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p", "4k"],
    description: "The resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "9:16"],
    description:
      "The aspect ratio of the generated video. Only 16:9 and 9:16 are supported."
  })
  declare aspect_ratio: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the input image to animate. Should be 720p or higher resolution in 16:9 or 9:16 aspect ratio. If the image is not in 16:9 or 9:16 aspect ratio, it will be cropped to fit."
  })
  declare image: any;

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
    const autoFix = Boolean(this.auto_fix ?? false);
    const duration = String(this.duration ?? "8s");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const safetyTolerance = String(this.safety_tolerance ?? "4");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      auto_fix: autoFix,
      duration: duration,
      generate_audio: generateAudio,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      safety_tolerance: safetyTolerance,
      seed: seed,
      negative_prompt: negativePrompt
    };

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
      "fal-ai/veo3.1/fast/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Veo31ImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.Veo31ImageToVideo";
  static readonly title = "Veo31 Image To Video";
  static readonly description = `Veo 3.1
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt describing the video you want to generate"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to automatically attempt to fix prompts that fail content policy or other validation checks by rewriting them."
  })
  declare auto_fix: any;

  @prop({
    type: "enum",
    default: "8s",
    values: ["4s", "6s", "8s"],
    description: "The duration of the generated video."
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p", "4k"],
    description: "The resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "9:16"],
    description:
      "The aspect ratio of the generated video. Only 16:9 and 9:16 are supported."
  })
  declare aspect_ratio: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the input image to animate. Should be 720p or higher resolution in 16:9 or 9:16 aspect ratio. If the image is not in 16:9 or 9:16 aspect ratio, it will be cropped to fit."
  })
  declare image: any;

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
    const autoFix = Boolean(this.auto_fix ?? false);
    const duration = String(this.duration ?? "8s");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const safetyTolerance = String(this.safety_tolerance ?? "4");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      auto_fix: autoFix,
      duration: duration,
      generate_audio: generateAudio,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      safety_tolerance: safetyTolerance,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/veo3.1/image-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Sora2ImageToVideoPro extends FalNode {
  static readonly nodeType = "fal.image_to_video.Sora2ImageToVideoPro";
  static readonly title = "Sora2 Image To Video Pro";
  static readonly description = `Sora 2
video, animation, image-to-video, img2vid, professional`;
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
    description: "The text prompt describing the video you want to generate"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "9:16", "16:9"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: 4,
    values: [4, 8, 12, 16, 20],
    description: "Duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "720p", "1080p", "true_1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Up to two character IDs (from create-character) to use in the video. Refer to characters by name in the prompt. When set, only the OpenAI provider is used."
  })
  declare character_ids: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as the first frame"
  })
  declare image: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to delete the video after generation for privacy reasons. If True, the video cannot be used for remixing and will be permanently deleted."
  })
  declare delete_video: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If enabled, the prompt (and image for image-to-video) will be checked for known intellectual property references and the request will be blocked if any are detected."
  })
  declare detect_and_block_ip: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const duration = String(this.duration ?? 4);
    const resolution = String(this.resolution ?? "auto");
    const characterIds = String(this.character_ids ?? "");
    const deleteVideo = Boolean(this.delete_video ?? true);
    const detectAndBlockIp = Boolean(this.detect_and_block_ip ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      duration: duration,
      resolution: resolution,
      character_ids: characterIds,
      delete_video: deleteVideo,
      detect_and_block_ip: detectAndBlockIp
    };

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
      "fal-ai/sora-2/image-to-video/pro",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Sora2ImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.Sora2ImageToVideo";
  static readonly title = "Sora2 Image To Video";
  static readonly description = `Sora 2
video, animation, image-to-video, img2vid`;
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
    description: "The text prompt describing the video you want to generate"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "9:16", "16:9"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: 4,
    values: [4, 8, 12, 16, 20],
    description: "Duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "720p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Up to two character IDs (from create-character) to use in the video. Refer to characters by name in the prompt. When set, only the OpenAI provider is used."
  })
  declare character_ids: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as the first frame"
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "sora-2",
    values: ["sora-2", "sora-2-2025-12-08", "sora-2-2025-10-06"],
    description:
      "The model to use for the generation. When the default model is selected, the latest snapshot of the model will be used - otherwise, select a specific snapshot of the model."
  })
  declare model: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to delete the video after generation for privacy reasons. If True, the video cannot be used for remixing and will be permanently deleted."
  })
  declare delete_video: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If enabled, the prompt (and image for image-to-video) will be checked for known intellectual property references and the request will be blocked if any are detected."
  })
  declare detect_and_block_ip: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const duration = String(this.duration ?? 4);
    const resolution = String(this.resolution ?? "auto");
    const characterIds = String(this.character_ids ?? "");
    const model = String(this.model ?? "sora-2");
    const deleteVideo = Boolean(this.delete_video ?? true);
    const detectAndBlockIp = Boolean(this.detect_and_block_ip ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      duration: duration,
      resolution: resolution,
      character_ids: characterIds,
      model: model,
      delete_video: deleteVideo,
      detect_and_block_ip: detectAndBlockIp
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sora-2/image-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class OviImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.OviImageToVideo";
  static readonly title = "Ovi Image To Video";
  static readonly description = `Ovi
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

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
    description: "The number of inference steps."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "robotic, muffled, echo, distorted",
    description: "Negative prompt for audio generation."
  })
  declare audio_negative_prompt: any;

  @prop({
    type: "str",
    default: "jitter, bad hands, blur, distortion",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "image",
    default: "",
    description: "The image URL to guide video generation."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const audioNegativePrompt = String(
      this.audio_negative_prompt ?? "robotic, muffled, echo, distorted"
    );
    const negativePrompt = String(
      this.negative_prompt ?? "jitter, bad hands, blur, distortion"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      seed: seed,
      num_inference_steps: numInferenceSteps,
      audio_negative_prompt: audioNegativePrompt,
      negative_prompt: negativePrompt
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ovi/image-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class VeedFabric10Fast extends FalNode {
  static readonly nodeType = "fal.image_to_video.VeedFabric10Fast";
  static readonly title = "Veed Fabric10 Fast";
  static readonly description = `Fabric 1.0 Fast
video, animation, image-to-video, img2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "enum",
    default: "",
    values: ["720p", "480p"],
    description: "Resolution"
  })
  declare resolution: any;

  @prop({ type: "audio", default: "" })
  declare audio: any;

  @prop({ type: "image", default: "" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const resolution = String(this.resolution ?? "");

    const args: Record<string, unknown> = {
      resolution: resolution
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "veed/fabric-1.0/fast", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class VeedFabric10 extends FalNode {
  static readonly nodeType = "fal.image_to_video.VeedFabric10";
  static readonly title = "Veed Fabric10";
  static readonly description = `Fabric 1.0
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "enum",
    default: "",
    values: ["720p", "480p"],
    description: "Resolution"
  })
  declare resolution: any;

  @prop({ type: "audio", default: "" })
  declare audio: any;

  @prop({ type: "image", default: "" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const resolution = String(this.resolution ?? "");

    const args: Record<string, unknown> = {
      resolution: resolution
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "veed/fabric-1.0", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV1StandardAiAvatar extends FalNode {
  static readonly nodeType = "fal.image_to_video.KlingVideoV1StandardAiAvatar";
  static readonly title = "Kling Video V1 Standard Ai Avatar";
  static readonly description = `Kling AI Avatar
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { duration: "float", video: "video" };

  @prop({
    type: "str",
    default: ".",
    description: "The prompt to use for the video generation."
  })
  declare prompt: any;

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the audio file."
  })
  declare audio: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as your avatar"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? ".");

    const args: Record<string, unknown> = {
      prompt: prompt
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
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
      "fal-ai/kling-video/v1/standard/ai-avatar",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV1ProAiAvatar extends FalNode {
  static readonly nodeType = "fal.image_to_video.KlingVideoV1ProAiAvatar";
  static readonly title = "Kling Video V1 Pro Ai Avatar";
  static readonly description = `Kling AI Avatar Pro
video, animation, image-to-video, img2vid, professional`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { duration: "float", video: "video" };

  @prop({
    type: "str",
    default: ".",
    description: "The prompt to use for the video generation."
  })
  declare prompt: any;

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the audio file."
  })
  declare audio: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as your avatar"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? ".");

    const args: Record<string, unknown> = {
      prompt: prompt
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
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
      "fal-ai/kling-video/v1/pro/ai-avatar",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class DecartLucy14BImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.DecartLucy14BImageToVideo";
  static readonly title = "Decart Lucy14 B Image To Video";
  static readonly description = `Decart Lucy 14b
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "bool",
    default: true,
    description:
      "\n            If set to true, the function will wait for the image to be generated\n            and uploaded before returning the response. This will increase the\n            latency of the function but it allows you to get the image directly\n            in the response without going through the CDN.\n        "
  })
  declare sync_mode: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["9:16", "16:9"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "Text description of the desired video content"
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const syncMode = Boolean(this.sync_mode ?? true);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      sync_mode: syncMode,
      aspect_ratio: aspectRatio,
      prompt: prompt
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "decart/lucy-14b/image-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanAti extends FalNode {
  static readonly nodeType = "fal.image_to_video.WanAti";
  static readonly title = "Wan Ati";
  static readonly description = `Wan Ati
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p", "580p", "720p"],
    description: "Resolution of the generated video (480p, 580p, 720p)."
  })
  declare resolution: any;

  @prop({ type: "image", default: "", description: "URL of the input image." })
  declare image: any;

  @prop({
    type: "list[list[str]]",
    default: [],
    description:
      "Motion tracks to guide video generation. Each track is a sequence of points defining a motion trajectory. Multiple tracks can control different elements or objects in the video. Expected format: array of tracks, where each track is an array of points with 'x' and 'y' coordinates (up to 121 points per track). Points will be automatically padded to 121 if fewer are provided. Coordinates should be within the image dimensions."
  })
  declare track: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 40,
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
    const resolution = String(this.resolution ?? "480p");
    const track = String(this.track ?? []);
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      track: track,
      guidance_scale: guidanceScale,
      num_inference_steps: numInferenceSteps,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-ati", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV5Transition extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV5Transition";
  static readonly title = "Pixverse V5 Transition";
  static readonly description = `Create seamless transition between images using PixVerse v5
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare first_image: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "4:3", "1:1", "3:4", "9:16"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt for the transition"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "The style of the generated video"
  })
  declare style: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of the model\n            will output the same video every time.\n        "
  })
  declare seed: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the last frame"
  })
  declare end_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to be used for the generation"
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const prompt = String(this.prompt ?? "");
    const style = String(this.style ?? "");
    const duration = String(this.duration ?? "5");
    const resolution = String(this.resolution ?? "720p");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      prompt: prompt,
      style: style,
      duration: duration,
      resolution: resolution,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const firstImageRef = this.first_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstImageRef)) {
      const firstImageUrl =
        (await imageToDataUrl(firstImageRef!)) ??
        (await assetToFalUrl(apiKey, firstImageRef!));
      if (firstImageUrl) args["first_image_url"] = firstImageUrl;
    }

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/pixverse/v5/transition", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV5Effects extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV5Effects";
  static readonly title = "Pixverse V5 Effects";
  static readonly description = `Generate high quality video clips with different effects using PixVerse v5
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to be used for the generation"
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "Kiss Me AI",
      "Kiss",
      "Muscle Surge",
      "Warmth of Jesus",
      "Anything, Robot",
      "The Tiger Touch",
      "Hug",
      "Holy Wings",
      "Microwave",
      "Zombie Mode",
      "Squid Game",
      "Baby Face",
      "Black Myth: Wukong",
      "Long Hair Magic",
      "Leggy Run",
      "Fin-tastic Mermaid",
      "Punch Face",
      "Creepy Devil Smile",
      "Thunder God",
      "Eye Zoom Challenge",
      "Who's Arrested?",
      "Baby Arrived",
      "Werewolf Rage",
      "Bald Swipe",
      "BOOM DROP",
      "Huge Cutie",
      "Liquid Metal",
      "Sharksnap!",
      "Dust Me Away",
      "3D Figurine Factor",
      "Bikini Up",
      "My Girlfriends",
      "My Boyfriends",
      "Subject 3 Fever",
      "Earth Zoom",
      "Pole Dance",
      "Vroom Dance",
      "GhostFace Terror",
      "Dragon Evoker",
      "Skeletal Bae",
      "Summoning succubus",
      "Halloween Voodoo Doll",
      "3D Naked-Eye AD",
      "Package Explosion",
      "Dishes Served",
      "Ocean ad",
      "Supermarket AD",
      "Tree doll",
      "Come Feel My Abs",
      "The Bicep Flex",
      "London Elite Vibe",
      "Flora Nymph Gown",
      "Christmas Costume",
      "It's Snowy",
      "Reindeer Cruiser",
      "Snow Globe Maker",
      "Pet Christmas Outfit",
      "Adopt a Polar Pal",
      "Cat Christmas Box",
      "Starlight Gift Box",
      "Xmas Poster",
      "Pet Christmas Tree",
      "City Santa Hat",
      "Stocking Sweetie",
      "Christmas Night",
      "Xmas Front Page Karma",
      "Grinch's Xmas Hijack",
      "Giant Product",
      "Truck Fashion Shoot",
      "Beach AD",
      "Shoal Surround",
      "Mechanical Assembly",
      "Lighting AD",
      "Billboard AD",
      "Product close-up",
      "Parachute Delivery",
      "Dreamlike Cloud",
      "Macaron Machine",
      "Poster AD",
      "Truck AD",
      "Graffiti AD",
      "3D Figurine Factory",
      "The Exclusive First Class",
      "Art Zoom Challenge",
      "I Quit",
      "Hitchcock Dolly Zoom",
      "Smell the Lens",
      "I believe I can fly",
      "Strikout Dance",
      "Pixel World",
      "Mint in Box",
      "Hands up, Hand",
      "Flora Nymph Go",
      "Somber Embrace",
      "Beam me up",
      "Suit Swagger"
    ],
    description: "The effect to apply to the video"
  })
  declare effect: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional URL of the image to use as the first frame. If not provided, generates from text"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const negativePrompt = String(this.negative_prompt ?? "");
    const duration = String(this.duration ?? "5");
    const resolution = String(this.resolution ?? "720p");
    const effect = String(this.effect ?? "");

    const args: Record<string, unknown> = {
      negative_prompt: negativePrompt,
      duration: duration,
      resolution: resolution,
      effect: effect
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/pixverse/v5/effects", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV5ImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV5ImageToVideo";
  static readonly title = "Pixverse V5 Image To Video";
  static readonly description = `Generate high quality video clips from text and image prompts using PixVerse v5
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8"],
    description:
      "The duration of the generated video in seconds. 8s videos cost double. 1080p videos are limited to 5 seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description: "The style of the generated video"
  })
  declare style: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of the model\n            will output the same video every time.\n        "
  })
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
    const resolution = String(this.resolution ?? "720p");
    const style = String(this.style ?? "");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      resolution: resolution,
      style: style,
      seed: seed,
      negative_prompt: negativePrompt
    };

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
      "fal-ai/pixverse/v5/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MoonvalleyMareyI2v extends FalNode {
  static readonly nodeType = "fal.image_to_video.MoonvalleyMareyI2v";
  static readonly title = "Moonvalley Marey I2v";
  static readonly description = `Generate a video starting from an image as the first frame with Marey, a generative video model trained exclusively on fully licensed data.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate a video from"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5s",
    values: ["5s", "10s"],
    description: "The duration of the generated video."
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as the first frame of the video."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "1920x1080",
    values: ["1920x1080", "1080x1920", "1152x1152", "1536x1152", "1152x1536"],
    description:
      "The dimensions of the generated video in width x height format."
  })
  declare dimensions: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Controls how strongly the generation is guided by the prompt (0-20). Higher values follow the prompt more closely."
  })
  declare guidance_scale: any;

  @prop({
    type: "str",
    default: -1,
    description:
      "Seed for random number generation. Use -1 for random seed each run."
  })
  declare seed: any;

  @prop({
    type: "str",
    default:
      "<synthetic> <scene cut> low-poly, flat shader, bad rigging, stiff animation, uncanny eyes, low-quality textures, looping glitch, cheap effect, overbloom, bloom spam, default lighting, game asset, stiff face, ugly specular, AI artifacts",
    description:
      "Negative prompt used to guide the model away from undesirable features."
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "5s");
    const dimensions = String(this.dimensions ?? "1920x1080");
    const guidanceScale = String(this.guidance_scale ?? "");
    const seed = String(this.seed ?? -1);
    const negativePrompt = String(
      this.negative_prompt ??
        "<synthetic> <scene cut> low-poly, flat shader, bad rigging, stiff animation, uncanny eyes, low-quality textures, looping glitch, cheap effect, overbloom, bloom spam, default lighting, game asset, stiff face, ugly specular, AI artifacts"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      dimensions: dimensions,
      guidance_scale: guidanceScale,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "moonvalley/marey/i2v", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV22A14bImageToVideoLora extends FalNode {
  static readonly nodeType = "fal.image_to_video.WanV22A14bImageToVideoLora";
  static readonly title = "Wan V22 A14b Image To Video Lora";
  static readonly description = `Wan-2.2 image-to-video is a video model that generates high-quality videos with high visual quality and motion diversity from text prompts and images. This endpoint supports LoRAs made for Wan 2.2
video, animation, image-to-video, img2vid, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift value for the video. Must be between 1.0 and 10.0."
  })
  declare shift: any;

  @prop({
    type: "bool",
    default: false,
    description: "If true, the video will be reversed."
  })
  declare reverse_video: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "Number of frames to interpolate between each pair of generated frames. Must be between 0 and 4."
  })
  declare num_interpolated_frames: any;

  @prop({
    type: "enum",
    default: "regular",
    values: ["none", "regular"],
    description:
      "Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'regular'."
  })
  declare acceleration: any;

  @prop({
    type: "list[LoRAWeight]",
    default: [],
    description: "LoRA weights to be used in the inference."
  })
  declare loras: any;

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

  @prop({ type: "image", default: "", description: "URL of the end image." })
  declare end_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If set to true, input data will be checked for safety before processing."
  })
  declare enable_safety_checker: any;

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
      "Aspect ratio of the generated video. If 'auto', the aspect ratio will be determined automatically based on the input image."
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
    type: "float",
    default: 4,
    description:
      "Guidance scale for the second stage of the model. This is used to control the adherence to the prompt in the second stage of the model."
  })
  declare guidance_scale_2: any;

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
    const shift = Number(this.shift ?? 5);
    const reverseVideo = Boolean(this.reverse_video ?? false);
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 1);
    const acceleration = String(this.acceleration ?? "regular");
    const loras = String(this.loras ?? []);
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const numFrames = Number(this.num_frames ?? 81);
    const negativePrompt = String(this.negative_prompt ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "720p");
    const enableOutputSafetyChecker = Boolean(
      this.enable_output_safety_checker ?? false
    );
    const videoQuality = String(this.video_quality ?? "high");
    const guidanceScale_2 = Number(this.guidance_scale_2 ?? 4);
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
      shift: shift,
      reverse_video: reverseVideo,
      num_interpolated_frames: numInterpolatedFrames,
      acceleration: acceleration,
      loras: loras,
      frames_per_second: framesPerSecond,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      negative_prompt: negativePrompt,
      enable_safety_checker: enableSafetyChecker,
      video_write_mode: videoWriteMode,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      enable_output_safety_checker: enableOutputSafetyChecker,
      video_quality: videoQuality,
      guidance_scale_2: guidanceScale_2,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps,
      interpolator_model: interpolatorModel,
      adjust_fps_for_interpolation: adjustFpsForInterpolation,
      seed: seed
    };

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
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan/v2.2-a14b/image-to-video/lora",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MinimaxHailuo02FastImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.MinimaxHailuo02FastImageToVideo";
  static readonly title = "Minimax Hailuo02 Fast Image To Video";
  static readonly description = `Create blazing fast and economical videos with MiniMax Hailuo-02 Image To Video API at 512p resolution
video, animation, image-to-video, img2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "6",
    values: ["6", "10"],
    description:
      "The duration of the video in seconds. 10 seconds videos are not supported for 1080p resolution."
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to use the model's prompt optimizer"
  })
  declare prompt_optimizer: any;

  @prop({ type: "image", default: "" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "6");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      prompt_optimizer: promptOptimizer
    };

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
      "fal-ai/minimax/hailuo-02-fast/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Veo3ImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.Veo3ImageToVideo";
  static readonly title = "Veo3 Image To Video";
  static readonly description = `Veo 3 is the latest state-of-the art video generation model from Google DeepMind
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt describing how the image should be animated"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "9:16"],
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    description: "The resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to automatically attempt to fix prompts that fail content policy or other validation checks by rewriting them."
  })
  declare auto_fix: any;

  @prop({
    type: "enum",
    default: "8s",
    values: ["4s", "6s", "8s"],
    description: "The duration of the generated video."
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the input image to animate. Should be 720p or higher resolution in 16:9 or 9:16 aspect ratio. If the image is not in 16:9 or 9:16 aspect ratio, it will be cropped to fit."
  })
  declare image: any;

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
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "720p");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const autoFix = Boolean(this.auto_fix ?? false);
    const duration = String(this.duration ?? "8s");
    const safetyTolerance = String(this.safety_tolerance ?? "4");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      generate_audio: generateAudio,
      auto_fix: autoFix,
      duration: duration,
      safety_tolerance: safetyTolerance,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/veo3/image-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV22A14bImageToVideoTurbo extends FalNode {
  static readonly nodeType = "fal.image_to_video.WanV22A14bImageToVideoTurbo";
  static readonly title = "Wan V22 A14b Image To Video Turbo";
  static readonly description = `Wan-2.2 Turbo image-to-video is a video model that generates high-quality videos with high visual quality and motion diversity from text prompts. 
video, animation, image-to-video, img2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

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
    default: "regular",
    values: ["none", "regular"],
    description:
      "Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'regular'."
  })
  declare acceleration: any;

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
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({ type: "image", default: "", description: "URL of the end image." })
  declare end_image: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning."
  })
  declare enable_prompt_expansion: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const acceleration = String(this.acceleration ?? "regular");
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const resolution = String(this.resolution ?? "720p");
    const enableOutputSafetyChecker = Boolean(
      this.enable_output_safety_checker ?? false
    );
    const videoQuality = String(this.video_quality ?? "high");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const seed = String(this.seed ?? "");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      acceleration: acceleration,
      video_write_mode: videoWriteMode,
      resolution: resolution,
      enable_output_safety_checker: enableOutputSafetyChecker,
      video_quality: videoQuality,
      enable_safety_checker: enableSafetyChecker,
      seed: seed,
      enable_prompt_expansion: enablePromptExpansion
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
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
      "fal-ai/wan/v2.2-a14b/image-to-video/turbo",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV225bImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.WanV225bImageToVideo";
  static readonly title = "Wan V225b Image To Video";
  static readonly description = `Wan 2.2's 5B model produces up to 5 seconds of video 720p at 24FPS with fluid motion and powerful prompt understanding
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift value for the video. Must be between 1.0 and 10.0."
  })
  declare shift: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Number of frames to interpolate between each pair of generated frames. Must be between 0 and 4."
  })
  declare num_interpolated_frames: any;

  @prop({
    type: "str",
    default: 24,
    description:
      "Frames per second of the generated video. Must be between 4 to 60. When using interpolation and 'adjust_fps_for_interpolation' is set to true (default true,) the final FPS will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If 'adjust_fps_for_interpolation' is set to false, this value will be used as-is."
  })
  declare frames_per_second: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If set to true, input data will be checked for safety before processing."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Number of frames to generate. Must be between 17 to 161 (inclusive)."
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 3.5,
    description:
      "Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality."
  })
  declare guidance_scale: any;

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
      "Aspect ratio of the generated video. If 'auto', the aspect ratio will be determined automatically based on the input image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["580p", "720p"],
    description: "Resolution of the generated video (580p or 720p)."
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
      "Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "int",
    default: 40,
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
    const shift = Number(this.shift ?? 5);
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 0);
    const framesPerSecond = String(this.frames_per_second ?? 24);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const numFrames = Number(this.num_frames ?? 81);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const negativePrompt = String(this.negative_prompt ?? "");
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "720p");
    const enableOutputSafetyChecker = Boolean(
      this.enable_output_safety_checker ?? false
    );
    const videoQuality = String(this.video_quality ?? "high");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const interpolatorModel = String(this.interpolator_model ?? "film");
    const adjustFpsForInterpolation = Boolean(
      this.adjust_fps_for_interpolation ?? true
    );
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      shift: shift,
      num_interpolated_frames: numInterpolatedFrames,
      frames_per_second: framesPerSecond,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      guidance_scale: guidanceScale,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      enable_output_safety_checker: enableOutputSafetyChecker,
      video_quality: videoQuality,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps,
      interpolator_model: interpolatorModel,
      adjust_fps_for_interpolation: adjustFpsForInterpolation,
      seed: seed
    };

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
      "fal-ai/wan/v2.2-5b/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV22A14bImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.WanV22A14bImageToVideo";
  static readonly title = "Wan V22 A14b Image To Video";
  static readonly description = `fal-ai/wan/v2.2-A14B/image-to-video
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift value for the video. Must be between 1.0 and 10.0."
  })
  declare shift: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "Number of frames to interpolate between each pair of generated frames. Must be between 0 and 4."
  })
  declare num_interpolated_frames: any;

  @prop({
    type: "enum",
    default: "regular",
    values: ["none", "regular"],
    description:
      "Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'regular'."
  })
  declare acceleration: any;

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

  @prop({ type: "image", default: "", description: "URL of the end image." })
  declare end_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If set to true, input data will be checked for safety before processing."
  })
  declare enable_safety_checker: any;

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
      "Aspect ratio of the generated video. If 'auto', the aspect ratio will be determined automatically based on the input image."
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
    type: "float",
    default: 3.5,
    description:
      "Guidance scale for the second stage of the model. This is used to control the adherence to the prompt in the second stage of the model."
  })
  declare guidance_scale_2: any;

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
    const shift = Number(this.shift ?? 5);
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 1);
    const acceleration = String(this.acceleration ?? "regular");
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const numFrames = Number(this.num_frames ?? 81);
    const negativePrompt = String(this.negative_prompt ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "720p");
    const enableOutputSafetyChecker = Boolean(
      this.enable_output_safety_checker ?? false
    );
    const videoQuality = String(this.video_quality ?? "high");
    const guidanceScale_2 = Number(this.guidance_scale_2 ?? 3.5);
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
      shift: shift,
      num_interpolated_frames: numInterpolatedFrames,
      acceleration: acceleration,
      frames_per_second: framesPerSecond,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      negative_prompt: negativePrompt,
      enable_safety_checker: enableSafetyChecker,
      video_write_mode: videoWriteMode,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      enable_output_safety_checker: enableOutputSafetyChecker,
      video_quality: videoQuality,
      guidance_scale_2: guidanceScale_2,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps,
      interpolator_model: interpolatorModel,
      adjust_fps_for_interpolation: adjustFpsForInterpolation,
      seed: seed
    };

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
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan/v2.2-a14b/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class BytedanceOmnihuman extends FalNode {
  static readonly nodeType = "fal.image_to_video.BytedanceOmnihuman";
  static readonly title = "Bytedance Omnihuman";
  static readonly description = `OmniHuman generates video using an image of a human figure paired with an audio file. It produces vivid, high-quality videos where the character's emotions and movements maintain a strong correlation with the audio.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { duration: "float", video: "video" };

  @prop({
    type: "audio",
    default: "",
    description:
      "The URL of the audio file to generate the video. Audio must be under 30s long."
  })
  declare audio: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image used to generate the video"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/bytedance/omnihuman", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltxv13b098DistilledImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.Ltxv13b098DistilledImageToVideo";
  static readonly title = "Ltxv13b098 Distilled Image To Video";
  static readonly description = `Generate long videos from prompts and images using LTX Video-0.9.8 13B Distilled and custom LoRA
video, animation, image-to-video, img2vid`;
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
    type: "image",
    default: "",
    description: "Image URL for Image-to-Video task"
  })
  declare image: any;

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
      "fal-ai/ltxv-13b-098-distilled/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Veo3FastImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.Veo3FastImageToVideo";
  static readonly title = "Veo3 Fast Image To Video";
  static readonly description = `Now with a 50% price drop. Generate videos from your image prompts using Veo 3 fast.
video, animation, image-to-video, img2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt describing how the image should be animated"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "16:9", "9:16"],
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    description: "The resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to automatically attempt to fix prompts that fail content policy or other validation checks by rewriting them."
  })
  declare auto_fix: any;

  @prop({
    type: "enum",
    default: "8s",
    values: ["4s", "6s", "8s"],
    description: "The duration of the generated video."
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the input image to animate. Should be 720p or higher resolution in 16:9 or 9:16 aspect ratio. If the image is not in 16:9 or 9:16 aspect ratio, it will be cropped to fit."
  })
  declare image: any;

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
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "720p");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const autoFix = Boolean(this.auto_fix ?? false);
    const duration = String(this.duration ?? "8s");
    const safetyTolerance = String(this.safety_tolerance ?? "4");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      generate_audio: generateAudio,
      auto_fix: autoFix,
      duration: duration,
      safety_tolerance: safetyTolerance,
      seed: seed,
      negative_prompt: negativePrompt
    };

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
      "fal-ai/veo3/fast/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ViduQ1ReferenceToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.ViduQ1ReferenceToVideo";
  static readonly title = "Vidu Q1 Reference To Video";
  static readonly description = `Generate video clips from your multiple image references using Vidu Q1
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation, max 1500 characters"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "The aspect ratio of the output video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to add background music to the generated video"
  })
  declare bgm: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "URLs of the reference images to use for consistent subject appearance. Q1 model supports up to 7 reference images."
  })
  declare reference_images: any;

  @prop({ type: "str", default: "", description: "Random seed for generation" })
  declare seed: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "small", "medium", "large"],
    description: "The movement amplitude of objects in the frame"
  })
  declare movement_amplitude: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const bgm = Boolean(this.bgm ?? false);
    const seed = String(this.seed ?? "");
    const movementAmplitude = String(this.movement_amplitude ?? "auto");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      bgm: bgm,
      seed: seed,
      movement_amplitude: movementAmplitude
    };

    const referenceImagesList = this.reference_images as
      | Record<string, unknown>[]
      | undefined;
    if (referenceImagesList?.length) {
      const referenceImagesUrls: string[] = [];
      for (const ref of referenceImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) referenceImagesUrls.push(u);
        }
      }
      if (referenceImagesUrls.length)
        args["reference_image_urls"] = referenceImagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/vidu/q1/reference-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MinimaxHailuo02ProImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.MinimaxHailuo02ProImageToVideo";
  static readonly title = "Minimax Hailuo02 Pro Image To Video";
  static readonly description = `MiniMax Hailuo-02 Image To Video API (Pro, 1080p): Advanced image-to-video generation model with 1080p resolution
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to use the model's prompt optimizer"
  })
  declare prompt_optimizer: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional URL of the image to use as the last frame of the video"
  })
  declare end_image: any;

  @prop({ type: "image", default: "" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      prompt_optimizer: promptOptimizer
    };

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
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/minimax/hailuo-02/pro/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class BytedanceSeedanceV1LiteImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.BytedanceSeedanceV1LiteImageToVideo";
  static readonly title = "Bytedance Seedance V1 Lite Image To Video";
  static readonly description = `Seedance 1.0 Lite
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt used to generate the video"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "auto"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p", "1080p"],
    description:
      "Video resolution - 480p for faster generation, 720p for higher quality"
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
    description: "Duration of the video in seconds"
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image used to generate video"
  })
  declare image: any;

  @prop({
    type: "bool",
    default: true,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to fix the camera position"
  })
  declare camera_fixed: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image the video ends with. Defaults to None."
  })
  declare end_image: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The number of frames to generate. If provided, will override duration."
  })
  declare num_frames: any;

  @prop({
    type: "str",
    default: "",
    description: "Random seed to control video generation. Use -1 for random."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "720p");
    const duration = String(this.duration ?? "5");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const cameraFixed = Boolean(this.camera_fixed ?? false);
    const numFrames = String(this.num_frames ?? "");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      duration: duration,
      enable_safety_checker: enableSafetyChecker,
      camera_fixed: cameraFixed,
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
      "fal-ai/bytedance/seedance/v1/lite/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class HunyuanAvatar extends FalNode {
  static readonly nodeType = "fal.image_to_video.HunyuanAvatar";
  static readonly title = "Hunyuan Avatar";
  static readonly description = `HunyuanAvatar is a High-Fidelity Audio-Driven Human Animation model for Multiple Characters .
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "A cat is singing.",
    description: "Text prompt describing the scene."
  })
  declare text: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the reference image."
  })
  declare image: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "If true, the video will be generated faster with no noticeable degradation in the visual quality."
  })
  declare turbo_mode: any;

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the audio file."
  })
  declare audio: any;

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
    description: "Random seed for generation."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 129,
    description:
      "Number of video frames to generate at 25 FPS. If greater than the input audio length, it will capped to the length of the input audio."
  })
  declare num_frames: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "A cat is singing.");
    const turboMode = Boolean(this.turbo_mode ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const seed = String(this.seed ?? "");
    const numFrames = Number(this.num_frames ?? 129);

    const args: Record<string, unknown> = {
      text: text,
      turbo_mode: turboMode,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      num_frames: numFrames
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

    const res = await falSubmit(apiKey, "fal-ai/hunyuan-avatar", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV21ProImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.KlingVideoV21ProImageToVideo";
  static readonly title = "Kling Video V21 Pro Image To Video";
  static readonly description = `Kling 2.1 Pro is an advanced endpoint for the Kling 2.1 model, offering professional-grade videos with enhanced visual fidelity, precise camera movements, and dynamic motion control, perfect for cinematic storytelling.  
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt.\n        "
  })
  declare cfg_scale: any;

  @prop({ type: "str", default: "blur, distort, and low quality" })
  declare negative_prompt: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be used for the end of the video"
  })
  declare tail_image: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be used for the video"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "5");
    const cfgScale = Number(this.cfg_scale ?? 0.5);
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      cfg_scale: cfgScale,
      negative_prompt: negativePrompt
    };

    const tailImageRef = this.tail_image as Record<string, unknown> | undefined;
    if (isRefSet(tailImageRef)) {
      const tailImageUrl =
        (await imageToDataUrl(tailImageRef!)) ??
        (await assetToFalUrl(apiKey, tailImageRef!));
      if (tailImageUrl) args["tail_image_url"] = tailImageUrl;
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
      "fal-ai/kling-video/v2.1/pro/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class HunyuanPortrait extends FalNode {
  static readonly nodeType = "fal.image_to_video.HunyuanPortrait";
  static readonly title = "Hunyuan Portrait";
  static readonly description = `HunyuanPortrait is a diffusion-based framework for generating lifelike, temporally consistent portrait animations.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "video",
    default: "",
    description: "The URL of the driving video."
  })
  declare video: any;

  @prop({
    type: "int",
    default: -1,
    description:
      "Random seed for generation. If None, a random seed will be used."
  })
  declare seed: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to use ArcFace for face recognition."
  })
  declare use_arcface: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the source image."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const seed = Number(this.seed ?? -1);
    const useArcface = Boolean(this.use_arcface ?? true);

    const args: Record<string, unknown> = {
      seed: seed,
      use_arcface: useArcface
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

    const res = await falSubmit(apiKey, "fal-ai/hunyuan-portrait", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV16StandardElements extends FalNode {
  static readonly nodeType = "fal.image_to_video.KlingVideoV16StandardElements";
  static readonly title = "Kling Video V16 Standard Elements";
  static readonly description = `Generate video clips from your multiple image references using Kling 1.6 (standard)
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "The aspect ratio of the generated video frame"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "List of image URLs to use for video generation. Supports up to 4 images."
  })
  declare input_images: any;

  @prop({ type: "str", default: "blur, distort, and low quality" })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? "5");
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      duration: duration,
      negative_prompt: negativePrompt
    };

    const inputImagesList = this.input_images as
      | Record<string, unknown>[]
      | undefined;
    if (inputImagesList?.length) {
      const inputImagesUrls: string[] = [];
      for (const ref of inputImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) inputImagesUrls.push(u);
        }
      }
      if (inputImagesUrls.length) args["input_image_urls"] = inputImagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/v1.6/standard/elements",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV16ProElements extends FalNode {
  static readonly nodeType = "fal.image_to_video.KlingVideoV16ProElements";
  static readonly title = "Kling Video V16 Pro Elements";
  static readonly description = `Generate video clips from your multiple image references using Kling 1.6 (pro)
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "The aspect ratio of the generated video frame"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "List of image URLs to use for video generation. Supports up to 4 images."
  })
  declare input_images: any;

  @prop({ type: "str", default: "blur, distort, and low quality" })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? "5");
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      duration: duration,
      negative_prompt: negativePrompt
    };

    const inputImagesList = this.input_images as
      | Record<string, unknown>[]
      | undefined;
    if (inputImagesList?.length) {
      const inputImagesUrls: string[] = [];
      for (const ref of inputImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) inputImagesUrls.push(u);
        }
      }
      if (inputImagesUrls.length) args["input_image_urls"] = inputImagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/v1.6/pro/elements",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LtxVideo13bDistilledImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.LtxVideo13bDistilledImageToVideo";
  static readonly title = "Ltx Video13b Distilled Image To Video";
  static readonly description = `Generate videos from prompts and images using LTX Video-0.9.7 13B Distilled and custom LoRA
video, animation, image-to-video, img2vid`;
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
    type: "image",
    default: "",
    description: "Image URL for Image-to-Video task"
  })
  declare image: any;

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
      "fal-ai/ltx-video-13b-distilled/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LtxVideo13bDevImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.LtxVideo13bDevImageToVideo";
  static readonly title = "Ltx Video13b Dev Image To Video";
  static readonly description = `Generate videos from prompts and images using LTX Video-0.9.7 13B and custom LoRA
video, animation, image-to-video, img2vid`;
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
    type: "image",
    default: "",
    description: "Image URL for Image-to-Video task"
  })
  declare image: any;

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
      "fal-ai/ltx-video-13b-dev/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LtxVideoLoraImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.LtxVideoLoraImageToVideo";
  static readonly title = "Ltx Video Lora Image To Video";
  static readonly description = `Generate videos from prompts and images using LTX Video-0.9.7 and custom LoRA
video, animation, image-to-video, img2vid, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["16:9", "1:1", "9:16", "auto"],
    description: "The aspect ratio of the video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to reverse the video."
  })
  declare reverse_video: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p"],
    description: "The resolution of the video."
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: 89,
    description: "The number of frames in the video."
  })
  declare number_of_frames: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as input."
  })
  declare image: any;

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
    type: "str",
    default: "",
    description: "The seed to use for generation."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const reverseVideo = Boolean(this.reverse_video ?? false);
    const resolution = String(this.resolution ?? "720p");
    const numberOfFrames = Number(this.number_of_frames ?? 89);
    const loras = String(this.loras ?? []);
    const framesPerSecond = Number(this.frames_per_second ?? 25);
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, low quality, low resolution, inconsistent motion, jittery, distorted"
    );
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      reverse_video: reverseVideo,
      resolution: resolution,
      number_of_frames: numberOfFrames,
      loras: loras,
      frames_per_second: framesPerSecond,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      seed: seed
    };

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
      "fal-ai/ltx-video-lora/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV45Transition extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV45Transition";
  static readonly title = "Pixverse V45 Transition";
  static readonly description = `Create seamless transition between images using PixVerse v4.5
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare first_image: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "4:3", "1:1", "3:4", "9:16"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt for the transition"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "The style of the generated video"
  })
  declare style: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of the model\n            will output the same video every time.\n        "
  })
  declare seed: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the last frame"
  })
  declare end_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to be used for the generation"
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const prompt = String(this.prompt ?? "");
    const style = String(this.style ?? "");
    const duration = String(this.duration ?? "5");
    const resolution = String(this.resolution ?? "720p");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      prompt: prompt,
      style: style,
      duration: duration,
      resolution: resolution,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const firstImageRef = this.first_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstImageRef)) {
      const firstImageUrl =
        (await imageToDataUrl(firstImageRef!)) ??
        (await assetToFalUrl(apiKey, firstImageRef!));
      if (firstImageUrl) args["first_image_url"] = firstImageUrl;
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
      "fal-ai/pixverse/v4.5/transition",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV45ImageToVideoFast extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV45ImageToVideoFast";
  static readonly title = "Pixverse V45 Image To Video Fast";
  static readonly description = `Generate fast high quality video clips from text and image prompts using PixVerse v4.5
video, animation, image-to-video, img2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description: "The style of the generated video"
  })
  declare style: any;

  @prop({
    type: "str",
    default: "",
    description: "The type of camera movement to apply to the video"
  })
  declare camera_movement: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of the model\n            will output the same video every time.\n        "
  })
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
    const cameraMovement = String(this.camera_movement ?? "");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      style: style,
      camera_movement: cameraMovement,
      seed: seed,
      negative_prompt: negativePrompt
    };

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
      "fal-ai/pixverse/v4.5/image-to-video/fast",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV45Effects extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV45Effects";
  static readonly title = "Pixverse V45 Effects";
  static readonly description = `Generate high quality video clips with different effects using PixVerse v4.5
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to be used for the generation"
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "Kiss Me AI",
      "Kiss",
      "Muscle Surge",
      "Warmth of Jesus",
      "Anything, Robot",
      "The Tiger Touch",
      "Hug",
      "Holy Wings",
      "Microwave",
      "Zombie Mode",
      "Squid Game",
      "Baby Face",
      "Black Myth: Wukong",
      "Long Hair Magic",
      "Leggy Run",
      "Fin-tastic Mermaid",
      "Punch Face",
      "Creepy Devil Smile",
      "Thunder God",
      "Eye Zoom Challenge",
      "Who's Arrested?",
      "Baby Arrived",
      "Werewolf Rage",
      "Bald Swipe",
      "BOOM DROP",
      "Huge Cutie",
      "Liquid Metal",
      "Sharksnap!",
      "Dust Me Away",
      "3D Figurine Factor",
      "Bikini Up",
      "My Girlfriends",
      "My Boyfriends",
      "Subject 3 Fever",
      "Earth Zoom",
      "Pole Dance",
      "Vroom Dance",
      "GhostFace Terror",
      "Dragon Evoker",
      "Skeletal Bae",
      "Summoning succubus",
      "Halloween Voodoo Doll",
      "3D Naked-Eye AD",
      "Package Explosion",
      "Dishes Served",
      "Ocean ad",
      "Supermarket AD",
      "Tree doll",
      "Come Feel My Abs",
      "The Bicep Flex",
      "London Elite Vibe",
      "Flora Nymph Gown",
      "Christmas Costume",
      "It's Snowy",
      "Reindeer Cruiser",
      "Snow Globe Maker",
      "Pet Christmas Outfit",
      "Adopt a Polar Pal",
      "Cat Christmas Box",
      "Starlight Gift Box",
      "Xmas Poster",
      "Pet Christmas Tree",
      "City Santa Hat",
      "Stocking Sweetie",
      "Christmas Night",
      "Xmas Front Page Karma",
      "Grinch's Xmas Hijack",
      "Giant Product",
      "Truck Fashion Shoot",
      "Beach AD",
      "Shoal Surround",
      "Mechanical Assembly",
      "Lighting AD",
      "Billboard AD",
      "Product close-up",
      "Parachute Delivery",
      "Dreamlike Cloud",
      "Macaron Machine",
      "Poster AD",
      "Truck AD",
      "Graffiti AD",
      "3D Figurine Factory",
      "The Exclusive First Class",
      "Art Zoom Challenge",
      "I Quit",
      "Hitchcock Dolly Zoom",
      "Smell the Lens",
      "I believe I can fly",
      "Strikout Dance",
      "Pixel World",
      "Mint in Box",
      "Hands up, Hand",
      "Flora Nymph Go",
      "Somber Embrace",
      "Beam me up",
      "Suit Swagger"
    ],
    description: "The effect to apply to the video"
  })
  declare effect: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional URL of the image to use as the first frame. If not provided, generates from text"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const negativePrompt = String(this.negative_prompt ?? "");
    const duration = String(this.duration ?? "5");
    const resolution = String(this.resolution ?? "720p");
    const effect = String(this.effect ?? "");

    const args: Record<string, unknown> = {
      negative_prompt: negativePrompt,
      duration: duration,
      resolution: resolution,
      effect: effect
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/pixverse/v4.5/effects", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class HunyuanCustom extends FalNode {
  static readonly nodeType = "fal.image_to_video.HunyuanCustom";
  static readonly title = "Hunyuan Custom";
  static readonly description = `HunyuanCustom revolutionizes video generation with unmatched identity consistency across multiple input types. Its innovative fusion modules and alignment networks outperform competitors, maintaining subject integrity while responding flexibly to text, image, audio, and video conditions.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation (max 500 characters)."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "512p",
    values: ["512p", "720p"],
    description:
      "The resolution of the video to generate. 720p generations cost 1.5x more than 480p generations."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16"],
    description: "The aspect ratio of the video to generate."
  })
  declare aspect_ratio: any;

  @prop({
    type: "int",
    default: 129,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "bool",
    default: true,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({ type: "image", default: "", description: "URL of the image input." })
  declare image: any;

  @prop({
    type: "int",
    default: 25,
    description: "The frames per second of the generated video."
  })
  declare fps: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "The number of inference steps to run. Lower gets faster results, higher gets better results."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed to use for generating the video."
  })
  declare seed: any;

  @prop({
    type: "str",
    default:
      "Aerial view, aerial view, overexposed, low quality, deformation, a poor composition, bad hands, bad teeth, bad eyes, bad limbs, distortion, blurring, text, subtitles, static, picture, black border.",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 7.5,
    description: "Classifier-Free Guidance scale for the generation."
  })
  declare cfg_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "512p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const numFrames = Number(this.num_frames ?? 129);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const fps = Number(this.fps ?? 25);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(
      this.negative_prompt ??
        "Aerial view, aerial view, overexposed, low quality, deformation, a poor composition, bad hands, bad teeth, bad eyes, bad limbs, distortion, blurring, text, subtitles, static, picture, black border."
    );
    const cfgScale = Number(this.cfg_scale ?? 7.5);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      num_frames: numFrames,
      enable_safety_checker: enableSafetyChecker,
      fps: fps,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      negative_prompt: negativePrompt,
      cfg_scale: cfgScale
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan-custom", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class FramepackF1 extends FalNode {
  static readonly nodeType = "fal.image_to_video.FramepackF1";
  static readonly title = "Framepack F1";
  static readonly description = `Framepack is an efficient Image-to-video model that autoregressively generates videos.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation (max 500 characters)."
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
    default: "480p",
    values: ["720p", "480p"],
    description:
      "The resolution of the video to generate. 720p generations cost 1.5x more than 480p generations."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({ type: "image", default: "", description: "URL of the image input." })
  declare image: any;

  @prop({
    type: "float",
    default: 10,
    description: "Guidance scale for the generation."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 180,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed to use for generating the video."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 1,
    description: "Classifier-Free Guidance scale for the generation."
  })
  declare cfg_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "480p");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 10);
    const numFrames = Number(this.num_frames ?? 180);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");
    const cfgScale = Number(this.cfg_scale ?? 1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      enable_safety_checker: enableSafetyChecker,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      seed: seed,
      negative_prompt: negativePrompt,
      cfg_scale: cfgScale
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/framepack/f1", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ViduQ1StartEndToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.ViduQ1StartEndToVideo";
  static readonly title = "Vidu Q1 Start End To Video";
  static readonly description = `Vidu Q1 Start-End to Video generates smooth transition 1080p videos between specified start and end images.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation, max 1500 characters"
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare start_image: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the last frame"
  })
  declare end_image: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "small", "medium", "large"],
    description: "The movement amplitude of objects in the frame"
  })
  declare movement_amplitude: any;

  @prop({
    type: "str",
    default: "",
    description: "Seed for the random number generator"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const movementAmplitude = String(this.movement_amplitude ?? "auto");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      movement_amplitude: movementAmplitude,
      seed: seed
    };

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl =
        (await imageToDataUrl(startImageRef!)) ??
        (await assetToFalUrl(apiKey, startImageRef!));
      if (startImageUrl) args["start_image_url"] = startImageUrl;
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
      "fal-ai/vidu/q1/start-end-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ViduQ1ImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.ViduQ1ImageToVideo";
  static readonly title = "Vidu Q1 Image To Video";
  static readonly description = `Vidu Q1 Image to Video generates high-quality 1080p videos with exceptional visual quality and motion diversity from a single image
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation, max 1500 characters"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Seed for the random number generator"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "small", "medium", "large"],
    description: "The movement amplitude of objects in the frame"
  })
  declare movement_amplitude: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const seed = String(this.seed ?? "");
    const movementAmplitude = String(this.movement_amplitude ?? "auto");

    const args: Record<string, unknown> = {
      prompt: prompt,
      seed: seed,
      movement_amplitude: movementAmplitude
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/vidu/q1/image-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MagiImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.MagiImageToVideo";
  static readonly title = "Magi Image To Video";
  static readonly description = `MAGI-1 generates videos from images with exceptional understanding of physical interactions and prompting
video, animation, image-to-video, img2vid`;
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
    type: "image",
    default: "",
    description:
      "URL of the input image to represent the first frame of the video. If the input image does not match the chosen aspect ratio, it is resized and center cropped."
  })
  declare image: any;

  @prop({
    type: "bool",
    default: true,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

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
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

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
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numInferenceSteps = String(this.num_inference_steps ?? 16);
    const seed = String(this.seed ?? "");
    const numFrames = String(this.num_frames ?? 96);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      enable_safety_checker: enableSafetyChecker,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      num_frames: numFrames
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/magi/image-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV4Effects extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV4Effects";
  static readonly title = "Pixverse V4 Effects";
  static readonly description = `Generate high quality video clips with different effects using PixVerse v4
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to be used for the generation"
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "Kiss Me AI",
      "Kiss",
      "Muscle Surge",
      "Warmth of Jesus",
      "Anything, Robot",
      "The Tiger Touch",
      "Hug",
      "Holy Wings",
      "Microwave",
      "Zombie Mode",
      "Squid Game",
      "Baby Face",
      "Black Myth: Wukong",
      "Long Hair Magic",
      "Leggy Run",
      "Fin-tastic Mermaid",
      "Punch Face",
      "Creepy Devil Smile",
      "Thunder God",
      "Eye Zoom Challenge",
      "Who's Arrested?",
      "Baby Arrived",
      "Werewolf Rage",
      "Bald Swipe",
      "BOOM DROP",
      "Huge Cutie",
      "Liquid Metal",
      "Sharksnap!",
      "Dust Me Away",
      "3D Figurine Factor",
      "Bikini Up",
      "My Girlfriends",
      "My Boyfriends",
      "Subject 3 Fever",
      "Earth Zoom",
      "Pole Dance",
      "Vroom Dance",
      "GhostFace Terror",
      "Dragon Evoker",
      "Skeletal Bae",
      "Summoning succubus",
      "Halloween Voodoo Doll",
      "3D Naked-Eye AD",
      "Package Explosion",
      "Dishes Served",
      "Ocean ad",
      "Supermarket AD",
      "Tree doll",
      "Come Feel My Abs",
      "The Bicep Flex",
      "London Elite Vibe",
      "Flora Nymph Gown",
      "Christmas Costume",
      "It's Snowy",
      "Reindeer Cruiser",
      "Snow Globe Maker",
      "Pet Christmas Outfit",
      "Adopt a Polar Pal",
      "Cat Christmas Box",
      "Starlight Gift Box",
      "Xmas Poster",
      "Pet Christmas Tree",
      "City Santa Hat",
      "Stocking Sweetie",
      "Christmas Night",
      "Xmas Front Page Karma",
      "Grinch's Xmas Hijack",
      "Giant Product",
      "Truck Fashion Shoot",
      "Beach AD",
      "Shoal Surround",
      "Mechanical Assembly",
      "Lighting AD",
      "Billboard AD",
      "Product close-up",
      "Parachute Delivery",
      "Dreamlike Cloud",
      "Macaron Machine",
      "Poster AD",
      "Truck AD",
      "Graffiti AD",
      "3D Figurine Factory",
      "The Exclusive First Class",
      "Art Zoom Challenge",
      "I Quit",
      "Hitchcock Dolly Zoom",
      "Smell the Lens",
      "I believe I can fly",
      "Strikout Dance",
      "Pixel World",
      "Mint in Box",
      "Hands up, Hand",
      "Flora Nymph Go",
      "Somber Embrace",
      "Beam me up",
      "Suit Swagger"
    ],
    description: "The effect to apply to the video"
  })
  declare effect: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional URL of the image to use as the first frame. If not provided, generates from text"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const negativePrompt = String(this.negative_prompt ?? "");
    const duration = String(this.duration ?? "5");
    const resolution = String(this.resolution ?? "720p");
    const effect = String(this.effect ?? "");

    const args: Record<string, unknown> = {
      negative_prompt: negativePrompt,
      duration: duration,
      resolution: resolution,
      effect: effect
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/pixverse/v4/effects", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MagiDistilledImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.MagiDistilledImageToVideo";
  static readonly title = "Magi Distilled Image To Video";
  static readonly description = `MAGI-1 distilled generates videos faster from images with exceptional understanding of physical interactions and prompting
video, animation, image-to-video, img2vid`;
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
    type: "image",
    default: "",
    description:
      "URL of the input image to represent the first frame of the video. If the input image does not match the chosen aspect ratio, it is resized and center cropped."
  })
  declare image: any;

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
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = String(this.num_frames ?? 96);
    const numInferenceSteps = String(this.num_inference_steps ?? 16);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      num_inference_steps: numInferenceSteps,
      seed: seed
    };

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
      "fal-ai/magi-distilled/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class FramepackFlf2v extends FalNode {
  static readonly nodeType = "fal.image_to_video.FramepackFlf2v";
  static readonly title = "Framepack Flf2v";
  static readonly description = `Framepack is an efficient Image-to-video model that autoregressively generates videos.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation (max 500 characters)."
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
    default: "480p",
    values: ["720p", "480p"],
    description:
      "The resolution of the video to generate. 720p generations cost 1.5x more than 480p generations."
  })
  declare resolution: any;

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

  @prop({ type: "image", default: "", description: "URL of the image input." })
  declare image: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Determines the influence of the final frame on the generated video. Higher values result in the output being more heavily influenced by the last frame."
  })
  declare strength: any;

  @prop({
    type: "float",
    default: 10,
    description: "Guidance scale for the generation."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 240,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the end image input."
  })
  declare end_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 1,
    description: "Classifier-Free Guidance scale for the generation."
  })
  declare cfg_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "480p");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const seed = String(this.seed ?? "");
    const strength = Number(this.strength ?? 0.8);
    const guidanceScale = Number(this.guidance_scale ?? 10);
    const numFrames = Number(this.num_frames ?? 240);
    const negativePrompt = String(this.negative_prompt ?? "");
    const cfgScale = Number(this.cfg_scale ?? 1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      enable_safety_checker: enableSafetyChecker,
      seed: seed,
      strength: strength,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      negative_prompt: negativePrompt,
      cfg_scale: cfgScale
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/framepack/flf2v", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanFlf2v extends FalNode {
  static readonly nodeType = "fal.image_to_video.WanFlf2v";
  static readonly title = "Wan Flf2v";
  static readonly description = `Wan-2.1 flf2v generates dynamic videos by intelligently bridging a given first frame to a desired end frame through smooth, coherent motion sequences.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "regular",
    values: ["none", "regular"],
    description:
      "Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'regular'."
  })
  declare acceleration: any;

  @prop({
    type: "str",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 5 to 24."
  })
  declare frames_per_second: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the starting image. If the input image does not match the chosen aspect ratio, it is resized and center cropped."
  })
  declare start_image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the ending image. If the input image does not match the chosen aspect ratio, it is resized and center cropped."
  })
  declare end_image: any;

  @prop({
    type: "str",
    default:
      "bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: 81,
    description:
      "Number of frames to generate. Must be between 81 to 100 (inclusive). If the number of frames is greater than 81, the video will be generated with 1.25x more billing units."
  })
  declare num_frames: any;

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
    type: "float",
    default: 5,
    description:
      "Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality."
  })
  declare guide_scale: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const shift = Number(this.shift ?? 5);
    const prompt = String(this.prompt ?? "");
    const acceleration = String(this.acceleration ?? "regular");
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(
      this.negative_prompt ??
        "bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const numFrames = String(this.num_frames ?? 81);
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "720p");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const guideScale = Number(this.guide_scale ?? 5);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      shift: shift,
      prompt: prompt,
      acceleration: acceleration,
      frames_per_second: framesPerSecond,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      num_frames: numFrames,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps,
      guide_scale: guideScale,
      seed: seed
    };

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl =
        (await imageToDataUrl(startImageRef!)) ??
        (await assetToFalUrl(apiKey, startImageRef!));
      if (startImageUrl) args["start_image_url"] = startImageUrl;
    }

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-flf2v", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Framepack extends FalNode {
  static readonly nodeType = "fal.image_to_video.Framepack";
  static readonly title = "Framepack";
  static readonly description = `Framepack is an efficient Image-to-video model that autoregressively generates videos.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation (max 500 characters)."
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
    default: "480p",
    values: ["720p", "480p"],
    description:
      "The resolution of the video to generate. 720p generations cost 1.5x more than 480p generations."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: false,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({ type: "image", default: "", description: "URL of the image input." })
  declare image: any;

  @prop({
    type: "float",
    default: 10,
    description: "Guidance scale for the generation."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 180,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed to use for generating the video."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 1,
    description: "Classifier-Free Guidance scale for the generation."
  })
  declare cfg_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "480p");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 10);
    const numFrames = Number(this.num_frames ?? 180);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");
    const cfgScale = Number(this.cfg_scale ?? 1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      enable_safety_checker: enableSafetyChecker,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      seed: seed,
      negative_prompt: negativePrompt,
      cfg_scale: cfgScale
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/framepack", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV4ImageToVideoFast extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV4ImageToVideoFast";
  static readonly title = "Pixverse V4 Image To Video Fast";
  static readonly description = `Generate fast high quality video clips from text and image prompts using PixVerse v4
video, animation, image-to-video, img2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description: "The style of the generated video"
  })
  declare style: any;

  @prop({
    type: "str",
    default: "",
    description: "The type of camera movement to apply to the video"
  })
  declare camera_movement: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of the model\n            will output the same video every time.\n        "
  })
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
    const cameraMovement = String(this.camera_movement ?? "");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      style: style,
      camera_movement: cameraMovement,
      seed: seed,
      negative_prompt: negativePrompt
    };

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
      "fal-ai/pixverse/v4/image-to-video/fast",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV4ImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV4ImageToVideo";
  static readonly title = "Pixverse V4 Image To Video";
  static readonly description = `Generate high quality video clips from text and image prompts using PixVerse v4
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8"],
    description:
      "The duration of the generated video in seconds. 8s videos cost double. 1080p videos are limited to 5 seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description: "The style of the generated video"
  })
  declare style: any;

  @prop({
    type: "str",
    default: "",
    description: "The type of camera movement to apply to the video"
  })
  declare camera_movement: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of the model\n            will output the same video every time.\n        "
  })
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
    const resolution = String(this.resolution ?? "720p");
    const style = String(this.style ?? "");
    const cameraMovement = String(this.camera_movement ?? "");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      resolution: resolution,
      style: style,
      camera_movement: cameraMovement,
      seed: seed,
      negative_prompt: negativePrompt
    };

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
      "fal-ai/pixverse/v4/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV35Effects extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV35Effects";
  static readonly title = "Pixverse V35 Effects";
  static readonly description = `Generate high quality video clips with different effects using PixVerse v3.5
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to be used for the generation"
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "Kiss Me AI",
      "Kiss",
      "Muscle Surge",
      "Warmth of Jesus",
      "Anything, Robot",
      "The Tiger Touch",
      "Hug",
      "Holy Wings",
      "Microwave",
      "Zombie Mode",
      "Squid Game",
      "Baby Face",
      "Black Myth: Wukong",
      "Long Hair Magic",
      "Leggy Run",
      "Fin-tastic Mermaid",
      "Punch Face",
      "Creepy Devil Smile",
      "Thunder God",
      "Eye Zoom Challenge",
      "Who's Arrested?",
      "Baby Arrived",
      "Werewolf Rage",
      "Bald Swipe",
      "BOOM DROP",
      "Huge Cutie",
      "Liquid Metal",
      "Sharksnap!",
      "Dust Me Away",
      "3D Figurine Factor",
      "Bikini Up",
      "My Girlfriends",
      "My Boyfriends",
      "Subject 3 Fever",
      "Earth Zoom",
      "Pole Dance",
      "Vroom Dance",
      "GhostFace Terror",
      "Dragon Evoker",
      "Skeletal Bae",
      "Summoning succubus",
      "Halloween Voodoo Doll",
      "3D Naked-Eye AD",
      "Package Explosion",
      "Dishes Served",
      "Ocean ad",
      "Supermarket AD",
      "Tree doll",
      "Come Feel My Abs",
      "The Bicep Flex",
      "London Elite Vibe",
      "Flora Nymph Gown",
      "Christmas Costume",
      "It's Snowy",
      "Reindeer Cruiser",
      "Snow Globe Maker",
      "Pet Christmas Outfit",
      "Adopt a Polar Pal",
      "Cat Christmas Box",
      "Starlight Gift Box",
      "Xmas Poster",
      "Pet Christmas Tree",
      "City Santa Hat",
      "Stocking Sweetie",
      "Christmas Night",
      "Xmas Front Page Karma",
      "Grinch's Xmas Hijack",
      "Giant Product",
      "Truck Fashion Shoot",
      "Beach AD",
      "Shoal Surround",
      "Mechanical Assembly",
      "Lighting AD",
      "Billboard AD",
      "Product close-up",
      "Parachute Delivery",
      "Dreamlike Cloud",
      "Macaron Machine",
      "Poster AD",
      "Truck AD",
      "Graffiti AD",
      "3D Figurine Factory",
      "The Exclusive First Class",
      "Art Zoom Challenge",
      "I Quit",
      "Hitchcock Dolly Zoom",
      "Smell the Lens",
      "I believe I can fly",
      "Strikout Dance",
      "Pixel World",
      "Mint in Box",
      "Hands up, Hand",
      "Flora Nymph Go",
      "Somber Embrace",
      "Beam me up",
      "Suit Swagger"
    ],
    description: "The effect to apply to the video"
  })
  declare effect: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional URL of the image to use as the first frame. If not provided, generates from text"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const negativePrompt = String(this.negative_prompt ?? "");
    const duration = String(this.duration ?? "5");
    const resolution = String(this.resolution ?? "720p");
    const effect = String(this.effect ?? "");

    const args: Record<string, unknown> = {
      negative_prompt: negativePrompt,
      duration: duration,
      resolution: resolution,
      effect: effect
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/pixverse/v3.5/effects", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV35Transition extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV35Transition";
  static readonly title = "Pixverse V35 Transition";
  static readonly description = `Create seamless transition between images using PixVerse v3.5
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare first_image: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "4:3", "1:1", "3:4", "9:16"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt for the transition"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "The style of the generated video"
  })
  declare style: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of the model\n            will output the same video every time.\n        "
  })
  declare seed: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the last frame"
  })
  declare end_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to be used for the generation"
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const prompt = String(this.prompt ?? "");
    const style = String(this.style ?? "");
    const duration = String(this.duration ?? "5");
    const resolution = String(this.resolution ?? "720p");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      prompt: prompt,
      style: style,
      duration: duration,
      resolution: resolution,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const firstImageRef = this.first_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstImageRef)) {
      const firstImageUrl =
        (await imageToDataUrl(firstImageRef!)) ??
        (await assetToFalUrl(apiKey, firstImageRef!));
      if (firstImageUrl) args["first_image_url"] = firstImageUrl;
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
      "fal-ai/pixverse/v3.5/transition",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LumaDreamMachineRay2FlashImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.LumaDreamMachineRay2FlashImageToVideo";
  static readonly title = "Luma Dream Machine Ray2 Flash Image To Video";
  static readonly description = `Ray2 Flash is a fast video generative model capable of creating realistic visuals with natural, coherent motion.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "540p",
    values: ["540p", "720p", "1080p"],
    description:
      "The resolution of the generated video (720p costs 2x more, 1080p costs 4x more)"
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "4:3", "3:4", "21:9", "9:21"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether the video should loop (end of video is blended with the beginning)"
  })
  declare loop: any;

  @prop({
    type: "enum",
    default: "5s",
    values: ["5s", "9s"],
    description: "The duration of the generated video"
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Initial image to start the video from. Can be used together with end_image_url."
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Final image to end the video with. Can be used together with image_url."
  })
  declare end_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "540p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const loop = Boolean(this.loop ?? false);
    const duration = String(this.duration ?? "5s");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      loop: loop,
      duration: duration
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
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
      "fal-ai/luma-dream-machine/ray-2-flash/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PikaV15Pikaffects extends FalNode {
  static readonly nodeType = "fal.image_to_video.PikaV15Pikaffects";
  static readonly title = "Pika V15 Pikaffects";
  static readonly description = `Pika Effects are AI-powered video effects designed to modify objects, characters, and environments in a fun, engaging, and visually compelling manner.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt to guide the effect"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "Cake-ify",
      "Crumble",
      "Crush",
      "Decapitate",
      "Deflate",
      "Dissolve",
      "Explode",
      "Eye-pop",
      "Inflate",
      "Levitate",
      "Melt",
      "Peel",
      "Poke",
      "Squish",
      "Ta-da",
      "Tear"
    ],
    description: "The Pikaffect to apply"
  })
  declare pikaffect: any;

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

  @prop({ type: "image", default: "", description: "URL of the input image" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const pikaffect = String(this.pikaffect ?? "");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      pikaffect: pikaffect,
      seed: seed,
      negative_prompt: negativePrompt
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/pika/v1.5/pikaffects", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PikaV21ImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.PikaV21ImageToVideo";
  static readonly title = "Pika V21 Image To Video";
  static readonly description = `Turn photos into mind-blowing, dynamic videos. Your images can can come to life with sharp details, impressive character control and cinematic camera moves.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: 5,
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator"
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "A negative prompt to guide the model"
  })
  declare negative_prompt: any;

  @prop({ type: "image", default: "" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const duration = Number(this.duration ?? 5);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      duration: duration,
      seed: seed,
      negative_prompt: negativePrompt
    };

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
      "fal-ai/pika/v2.1/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PikaV22ImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.PikaV22ImageToVideo";
  static readonly title = "Pika V22 Image To Video";
  static readonly description = `Turn photos into mind-blowing, dynamic videos in up to 1080p. Experience better image clarity and crisper, sharper visuals.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: 5,
    values: [5, 10],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator"
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "A negative prompt to guide the model"
  })
  declare negative_prompt: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const duration = String(this.duration ?? 5);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      duration: duration,
      seed: seed,
      negative_prompt: negativePrompt
    };

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
      "fal-ai/pika/v2.2/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PikaV22Pikascenes extends FalNode {
  static readonly nodeType = "fal.image_to_video.PikaV22Pikascenes";
  static readonly title = "Pika V22 Pikascenes";
  static readonly description = `Pika Scenes v2.2 creates videos from a images with high quality output.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt describing the desired video"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1", "4:5", "5:4", "3:2", "2:3"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: 5,
    values: [5, 10],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "precise",
    values: ["precise", "creative"],
    description:
      "Mode for integrating multiple images. Precise mode is more accurate, creative mode is more creative."
  })
  declare ingredients_mode: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator"
  })
  declare seed: any;

  @prop({
    type: "list[image]",
    default: [],
    description: "URLs of images to combine into a video"
  })
  declare images: any;

  @prop({
    type: "str",
    default: "ugly, bad, terrible",
    description: "A negative prompt to guide the model"
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "1080p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? 5);
    const ingredientsMode = String(this.ingredients_mode ?? "precise");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(
      this.negative_prompt ?? "ugly, bad, terrible"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      duration: duration,
      ingredients_mode: ingredientsMode,
      seed: seed,
      negative_prompt: negativePrompt
    };

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

    const res = await falSubmit(apiKey, "fal-ai/pika/v2.2/pikascenes", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PikaV2TurboImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.PikaV2TurboImageToVideo";
  static readonly title = "Pika V2 Turbo Image To Video";
  static readonly description = `Turbo is the model to use when you feel the need for speed. Turn your image to stunning video up to 3x faster – all with high quality outputs. 
video, animation, image-to-video, img2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: 5,
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator"
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "A negative prompt to guide the model"
  })
  declare negative_prompt: any;

  @prop({ type: "image", default: "" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const duration = Number(this.duration ?? 5);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      duration: duration,
      seed: seed,
      negative_prompt: negativePrompt
    };

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
      "fal-ai/pika/v2/turbo/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ViduImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.ViduImageToVideo";
  static readonly title = "Vidu Image To Video";
  static readonly description = `Vidu Image to Video generates high-quality videos with exceptional visual quality and motion diversity from a single image
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation, max 1500 characters"
  })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "Random seed for generation" })
  declare seed: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "small", "medium", "large"],
    description: "The movement amplitude of objects in the frame"
  })
  declare movement_amplitude: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const seed = String(this.seed ?? "");
    const movementAmplitude = String(this.movement_amplitude ?? "auto");

    const args: Record<string, unknown> = {
      prompt: prompt,
      seed: seed,
      movement_amplitude: movementAmplitude
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/vidu/image-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ViduReferenceToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.ViduReferenceToVideo";
  static readonly title = "Vidu Reference To Video";
  static readonly description = `Vidu Reference to Video creates videos by using a reference images and combining them with a prompt.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation, max 1500 characters"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "The aspect ratio of the output video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "URLs of the reference images to use for consistent subject appearance"
  })
  declare reference_images: any;

  @prop({ type: "str", default: "", description: "Random seed for generation" })
  declare seed: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "small", "medium", "large"],
    description: "The movement amplitude of objects in the frame"
  })
  declare movement_amplitude: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const seed = String(this.seed ?? "");
    const movementAmplitude = String(this.movement_amplitude ?? "auto");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      seed: seed,
      movement_amplitude: movementAmplitude
    };

    const referenceImagesList = this.reference_images as
      | Record<string, unknown>[]
      | undefined;
    if (referenceImagesList?.length) {
      const referenceImagesUrls: string[] = [];
      for (const ref of referenceImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) referenceImagesUrls.push(u);
        }
      }
      if (referenceImagesUrls.length)
        args["reference_image_urls"] = referenceImagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/vidu/reference-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ViduStartEndToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.ViduStartEndToVideo";
  static readonly title = "Vidu Start End To Video";
  static readonly description = `Vidu Start-End to Video generates smooth transition videos between specified start and end images.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation, max 1500 characters"
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare start_image: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the last frame"
  })
  declare end_image: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "small", "medium", "large"],
    description: "The movement amplitude of objects in the frame"
  })
  declare movement_amplitude: any;

  @prop({ type: "str", default: "", description: "Random seed for generation" })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const movementAmplitude = String(this.movement_amplitude ?? "auto");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      movement_amplitude: movementAmplitude,
      seed: seed
    };

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl =
        (await imageToDataUrl(startImageRef!)) ??
        (await assetToFalUrl(apiKey, startImageRef!));
      if (startImageUrl) args["start_image_url"] = startImageUrl;
    }

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/vidu/start-end-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ViduTemplateToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.ViduTemplateToVideo";
  static readonly title = "Vidu Template To Video";
  static readonly description = `Vidu Template to Video lets you create different effects by applying motion templates to your images.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16"],
    description: "The aspect ratio of the output video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "hug",
    values: [
      "dreamy_wedding",
      "romantic_lift",
      "sweet_proposal",
      "couple_arrival",
      "cupid_arrow",
      "pet_lovers",
      "lunar_newyear",
      "hug",
      "kiss",
      "dynasty_dress",
      "wish_sender",
      "love_pose",
      "hair_swap",
      "youth_rewind",
      "morphlab",
      "live_photo",
      "emotionlab",
      "live_memory",
      "interaction",
      "christmas",
      "pet_finger",
      "eat_mushrooms",
      "beast_chase_library",
      "beast_chase_supermarket",
      "petal_scattered",
      "emoji_figure",
      "hair_color_change",
      "multiple_people_kissing",
      "beast_chase_amazon",
      "beast_chase_mountain",
      "balloonman_explodes_pro",
      "get_thinner",
      "jump2pool",
      "bodyshake",
      "jiggle_up",
      "shake_it_dance",
      "subject_3",
      "pubg_winner_hit",
      "shake_it_down",
      "blueprint_supreme",
      "hip_twist",
      "motor_dance",
      "rat_dance",
      "kwok_dance",
      "leg_sweep_dance",
      "heeseung_march",
      "shake_to_max",
      "dame_un_grrr",
      "i_know",
      "lit_bounce",
      "wave_dance",
      "chill_dance",
      "hip_flicking",
      "sakura_season",
      "zongzi_wrap",
      "zongzi_drop",
      "dragonboat_shot",
      "rain_kiss",
      "child_memory",
      "couple_drop",
      "couple_walk",
      "flower_receive",
      "love_drop",
      "cheek_kiss",
      "carry_me",
      "blow_kiss",
      "love_fall",
      "french_kiss_8s",
      "workday_feels",
      "love_story",
      "bloom_magic",
      "ghibli",
      "minecraft",
      "box_me",
      "claw_me",
      "clayshot",
      "manga_meme",
      "quad_meme",
      "pixel_me",
      "clayshot_duo",
      "irasutoya",
      "american_comic",
      "simpsons_comic",
      "yayoi_kusama_style",
      "pop_art",
      "jojo_style",
      "slice_therapy",
      "balloon_flyaway",
      "flying",
      "paperman",
      "pinch",
      "bloom_doorobear",
      "gender_swap",
      "nap_me",
      "sexy_me",
      "spin360",
      "smooth_shift",
      "paper_fall",
      "jump_to_cloud",
      "pilot",
      "sweet_dreams",
      "soul_depart",
      "punch_hit",
      "watermelon_hit",
      "split_stance_pet",
      "make_face",
      "break_glass",
      "split_stance_human",
      "covered_liquid_metal",
      "fluffy_plunge",
      "pet_belly_dance",
      "water_float",
      "relax_cut",
      "head_to_balloon",
      "cloning",
      "across_the_universe_jungle",
      "clothes_spinning_remnant",
      "across_the_universe_jurassic",
      "across_the_universe_moon",
      "fisheye_pet",
      "hitchcock_zoom",
      "cute_bangs",
      "earth_zoom_out",
      "fisheye_human",
      "drive_yacht",
      "virtual_singer",
      "earth_zoom_in",
      "aliens_coming",
      "drive_ferrari",
      "bjd_style",
      "virtual_fitting",
      "orbit",
      "zoom_in",
      "ai_outfit",
      "spin180",
      "orbit_dolly",
      "orbit_dolly_fast",
      "auto_spin",
      "walk_forward",
      "outfit_show",
      "zoom_in_fast",
      "zoom_out_image",
      "zoom_out_startend",
      "muscling",
      "captain_america",
      "hulk",
      "cap_walk",
      "hulk_dive",
      "exotic_princess",
      "beast_companion",
      "cartoon_doll",
      "golden_epoch",
      "oscar_gala",
      "fashion_stride",
      "star_carpet",
      "flame_carpet",
      "frost_carpet",
      "mecha_x",
      "style_me",
      "tap_me",
      "saber_warrior",
      "pet2human",
      "graduation",
      "fishermen",
      "happy_birthday",
      "fairy_me",
      "ladudu_me",
      "ladudu_me_random",
      "squid_game",
      "superman",
      "grow_wings",
      "clevage",
      "fly_with_doraemon",
      "creatice_product_down",
      "pole_dance",
      "hug_from_behind",
      "creatice_product_up_cybercity",
      "creatice_product_up_bluecircuit",
      "creatice_product_up",
      "run_fast",
      "background_explosion"
    ],
    description:
      "AI video template to use. Pricing varies by template: Standard templates (hug, kiss, love_pose, etc.) cost 4 credits ($0.20), Premium templates (lunar_newyear, dynasty_dress, dreamy_wedding, etc.) cost 6 credits ($0.30), and Advanced templates (live_photo) cost 10 credits ($0.50)."
  })
  declare template: any;

  @prop({ type: "str", default: "", description: "Random seed for generation" })
  declare seed: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "URLs of the images to use with the template. Number of images required varies by template: 'dynasty_dress' and 'shop_frame' accept 1-2 images, 'wish_sender' requires exactly 3 images, all other templates accept only 1 image."
  })
  declare input_images: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const template = String(this.template ?? "hug");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      template: template,
      seed: seed
    };

    const inputImagesList = this.input_images as
      | Record<string, unknown>[]
      | undefined;
    if (inputImagesList?.length) {
      const inputImagesUrls: string[] = [];
      for (const ref of inputImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) inputImagesUrls.push(u);
        }
      }
      if (inputImagesUrls.length) args["input_image_urls"] = inputImagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/vidu/template-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanI2vLora extends FalNode {
  static readonly nodeType = "fal.image_to_video.WanI2vLora";
  static readonly title = "Wan I2v Lora";
  static readonly description = `Add custom LoRAs to Wan-2.1 is a image-to-video model that generates high-quality videos with high visual quality and motion diversity from images
video, animation, image-to-video, img2vid, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift parameter for video generation."
  })
  declare shift: any;

  @prop({
    type: "bool",
    default: false,
    description: "If true, the video will be reversed."
  })
  declare reverse_video: any;

  @prop({
    type: "list[LoraWeight]",
    default: [],
    description: "LoRA weights to be used in the inference."
  })
  declare loras: any;

  @prop({
    type: "str",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 5 to 24."
  })
  declare frames_per_second: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "If true, the video will be generated faster with no noticeable degradation in the visual quality."
  })
  declare turbo_mode: any;

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
      "Number of frames to generate. Must be between 81 to 100 (inclusive). If the number of frames is greater than 81, the video will be generated with 1.25x more billing units."
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
    default: "16:9",
    values: ["auto", "16:9", "9:16", "1:1"],
    description: "Aspect ratio of the output video."
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
    type: "image",
    default: "",
    description:
      "URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped."
  })
  declare image: any;

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
    type: "float",
    default: 5,
    description:
      "Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality."
  })
  declare guide_scale: any;

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
    const shift = Number(this.shift ?? 5);
    const reverseVideo = Boolean(this.reverse_video ?? false);
    const loras = String(this.loras ?? []);
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const turboMode = Boolean(this.turbo_mode ?? true);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const numFrames = String(this.num_frames ?? 81);
    const negativePrompt = String(
      this.negative_prompt ??
        "bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "720p");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const guideScale = Number(this.guide_scale ?? 5);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      shift: shift,
      reverse_video: reverseVideo,
      loras: loras,
      frames_per_second: framesPerSecond,
      turbo_mode: turboMode,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      negative_prompt: negativePrompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps,
      guide_scale: guideScale,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-i2v-lora", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class HunyuanVideoImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.HunyuanVideoImageToVideo";
  static readonly title = "Hunyuan Video Image To Video";
  static readonly description = `Image to Video for the high-quality Hunyuan Video I2V model.
video, animation, image-to-video, img2vid`;
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
    type: "str",
    default: "720p",
    description: "The resolution of the video to generate."
  })
  declare resolution: any;

  @prop({ type: "image", default: "", description: "URL of the image input." })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed to use for generating the video."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: 129,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Turning on I2V Stability reduces hallucination but also reduces motion."
  })
  declare i2v_stability: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "720p");
    const seed = String(this.seed ?? "");
    const numFrames = String(this.num_frames ?? 129);
    const i2vStability = Boolean(this.i2v_stability ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      seed: seed,
      num_frames: numFrames,
      i2v_stability: i2vStability
    };

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
      "fal-ai/hunyuan-video-image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MinimaxVideo01DirectorImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.MinimaxVideo01DirectorImageToVideo";
  static readonly title = "Minimax Video01 Director Image To Video";
  static readonly description = `Generate video clips more accurately with respect to initial image, natural language descriptions, and using camera movement instructions for shot control.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Text prompt for video generation. Camera movement instructions can be added using square brackets (e.g. [Pan left] or [Zoom in]). You can use up to 3 combined movements per prompt. Supported movements: Truck left/right, Pan left/right, Push in/Pull out, Pedestal up/down, Tilt up/down, Zoom in/out, Shake, Tracking shot, Static shot. For example: [Truck left, Pan right, Zoom in]. For a more detailed guide, refer https://sixth-switch-2ac.notion.site/T2V-01-Director-Model-Tutorial-with-camera-movement-1886c20a98eb80f395b8e05291ad8645"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to use the model's prompt optimizer"
  })
  declare prompt_optimizer: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      prompt_optimizer: promptOptimizer
    };

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
      "fal-ai/minimax/video-01-director/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class SkyreelsI2v extends FalNode {
  static readonly nodeType = "fal.image_to_video.SkyreelsI2v";
  static readonly title = "Skyreels I2v";
  static readonly description = `SkyReels V1 is the first and most advanced open-source human-centric video foundation model. By fine-tuning HunyuanVideo on O(10M) high-quality film and television clips
video, animation, image-to-video, img2vid`;
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
    description: "Aspect ratio of the output video"
  })
  declare aspect_ratio: any;

  @prop({ type: "image", default: "", description: "URL of the image input." })
  declare image: any;

  @prop({
    type: "float",
    default: 6,
    description: "Guidance scale for generation (between 1.0 and 20.0)"
  })
  declare guidance_scale: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for generation. If not provided, a random seed will be used."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "Number of denoising steps (between 1 and 50). Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Negative prompt to guide generation away from certain attributes."
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const guidanceScale = Number(this.guidance_scale ?? 6);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      guidance_scale: guidanceScale,
      seed: seed,
      num_inference_steps: numInferenceSteps,
      negative_prompt: negativePrompt
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/skyreels-i2v", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LumaDreamMachineRay2ImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.LumaDreamMachineRay2ImageToVideo";
  static readonly title = "Luma Dream Machine Ray2 Image To Video";
  static readonly description = `Ray2 is a large-scale video generative model capable of creating realistic visuals with natural, coherent motion.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "540p",
    values: ["540p", "720p", "1080p"],
    description:
      "The resolution of the generated video (720p costs 2x more, 1080p costs 4x more)"
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "4:3", "3:4", "21:9", "9:21"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether the video should loop (end of video is blended with the beginning)"
  })
  declare loop: any;

  @prop({
    type: "enum",
    default: "5s",
    values: ["5s", "9s"],
    description: "The duration of the generated video"
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Initial image to start the video from. Can be used together with end_image_url."
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Final image to end the video with. Can be used together with image_url."
  })
  declare end_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "540p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const loop = Boolean(this.loop ?? false);
    const duration = String(this.duration ?? "5s");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      loop: loop,
      duration: duration
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
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
      "fal-ai/luma-dream-machine/ray-2/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class HunyuanVideoImg2vidLora extends FalNode {
  static readonly nodeType = "fal.image_to_video.HunyuanVideoImg2vidLora";
  static readonly title = "Hunyuan Video Img2vid Lora";
  static readonly description = `Image to Video for the Hunyuan Video model using a custom trained LoRA.
video, animation, image-to-video, img2vid, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "The seed to use for generating the video."
  })
  declare seed: any;

  @prop({
    type: "image",
    default: "",
    description:
      "The URL to the image to generate the video from. The image must be 960x544 or it will get cropped and resized to that size."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      seed: seed
    };

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
      "fal-ai/hunyuan-video-img2vid-lora",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV35ImageToVideoFast extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV35ImageToVideoFast";
  static readonly title = "Pixverse V35 Image To Video Fast";
  static readonly description = `Generate high quality video clips from text and image prompts quickly using PixVerse v3.5 Fast
video, animation, image-to-video, img2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description: "The style of the generated video"
  })
  declare style: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of the model\n            will output the same video every time.\n        "
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to be used for the generation"
  })
  declare negative_prompt: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const style = String(this.style ?? "");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      style: style,
      seed: seed,
      negative_prompt: negativePrompt
    };

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
      "fal-ai/pixverse/v3.5/image-to-video/fast",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV35ImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.PixverseV35ImageToVideo";
  static readonly title = "Pixverse V35 Image To Video";
  static readonly description = `Generate high quality video clips from text and image prompts using PixVerse v3.5
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8"],
    description:
      "The duration of the generated video in seconds. 8s videos cost double. 1080p videos are limited to 5 seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description: "The style of the generated video"
  })
  declare style: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of the model\n            will output the same video every time.\n        "
  })
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
    const resolution = String(this.resolution ?? "720p");
    const style = String(this.style ?? "");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      resolution: resolution,
      style: style,
      seed: seed,
      negative_prompt: negativePrompt
    };

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
      "fal-ai/pixverse/v3.5/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MinimaxVideo01SubjectReference extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.MinimaxVideo01SubjectReference";
  static readonly title = "Minimax Video01 Subject Reference";
  static readonly description = `Generate video clips maintaining consistent, realistic facial features and identity across dynamic video content
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to use the model's prompt optimizer"
  })
  declare prompt_optimizer: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the subject reference image to use for consistent subject appearance"
  })
  declare subject_reference_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      prompt_optimizer: promptOptimizer
    };

    const subjectReferenceImageRef = this.subject_reference_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(subjectReferenceImageRef)) {
      const subjectReferenceImageUrl =
        (await imageToDataUrl(subjectReferenceImageRef!)) ??
        (await assetToFalUrl(apiKey, subjectReferenceImageRef!));
      if (subjectReferenceImageUrl)
        args["subject_reference_image_url"] = subjectReferenceImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/minimax/video-01-subject-reference",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV16StandardImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.KlingVideoV16StandardImageToVideo";
  static readonly title = "Kling Video V16 Standard Image To Video";
  static readonly description = `Generate video clips from your images using Kling 1.6 (std)
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt.\n        "
  })
  declare cfg_scale: any;

  @prop({ type: "str", default: "blur, distort, and low quality" })
  declare negative_prompt: any;

  @prop({ type: "image", default: "" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "5");
    const cfgScale = Number(this.cfg_scale ?? 0.5);
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      cfg_scale: cfgScale,
      negative_prompt: negativePrompt
    };

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
      "fal-ai/kling-video/v1.6/standard/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class SadtalkerReference extends FalNode {
  static readonly nodeType = "fal.image_to_video.SadtalkerReference";
  static readonly title = "Sadtalker Reference";
  static readonly description = `Learning Realistic 3D Motion Coefficients for Stylized Audio-Driven Single Image Talking Face Animation
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "int", default: 0, description: "The style of the pose" })
  declare pose_style: any;

  @prop({ type: "image", default: "", description: "URL of the source image" })
  declare source_image: any;

  @prop({
    type: "video",
    default: "",
    description: "URL of the reference video"
  })
  declare reference_pose_video: any;

  @prop({ type: "audio", default: "", description: "URL of the driven audio" })
  declare driven_audio: any;

  @prop({
    type: "enum",
    default: "",
    values: ["gfpgan"],
    description: "The type of face enhancer to use"
  })
  declare face_enhancer: any;

  @prop({
    type: "float",
    default: 1,
    description: "The scale of the expression"
  })
  declare expression_scale: any;

  @prop({
    type: "enum",
    default: "256",
    values: ["256", "512"],
    description: "The resolution of the face model"
  })
  declare face_model_resolution: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to use still mode. Fewer head motion, works with preprocess 'full'."
  })
  declare still_mode: any;

  @prop({
    type: "enum",
    default: "crop",
    values: ["crop", "extcrop", "resize", "full", "extfull"],
    description: "The type of preprocessing to use"
  })
  declare preprocess: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const poseStyle = Number(this.pose_style ?? 0);
    const faceEnhancer = String(this.face_enhancer ?? "");
    const expressionScale = Number(this.expression_scale ?? 1);
    const faceModelResolution = String(this.face_model_resolution ?? "256");
    const stillMode = Boolean(this.still_mode ?? false);
    const preprocess = String(this.preprocess ?? "crop");

    const args: Record<string, unknown> = {
      pose_style: poseStyle,
      face_enhancer: faceEnhancer,
      expression_scale: expressionScale,
      face_model_resolution: faceModelResolution,
      still_mode: stillMode,
      preprocess: preprocess
    };

    const sourceImageRef = this.source_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(sourceImageRef)) {
      const sourceImageUrl =
        (await imageToDataUrl(sourceImageRef!)) ??
        (await assetToFalUrl(apiKey, sourceImageRef!));
      if (sourceImageUrl) args["source_image_url"] = sourceImageUrl;
    }

    const referencePoseVideoRef = this.reference_pose_video as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referencePoseVideoRef)) {
      const referencePoseVideoUrl = await assetToFalUrl(
        apiKey,
        referencePoseVideoRef!
      );
      if (referencePoseVideoUrl)
        args["reference_pose_video_url"] = referencePoseVideoUrl;
    }

    const drivenAudioRef = this.driven_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(drivenAudioRef)) {
      const drivenAudioUrl = await assetToFalUrl(apiKey, drivenAudioRef!);
      if (drivenAudioUrl) args["driven_audio_url"] = drivenAudioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sadtalker/reference", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MinimaxVideo01LiveImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.MinimaxVideo01LiveImageToVideo";
  static readonly title = "Minimax Video01 Live Image To Video";
  static readonly description = `Generate video clips from your images using MiniMax Video model
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to use the model's prompt optimizer"
  })
  declare prompt_optimizer: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to use as the first frame"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      prompt_optimizer: promptOptimizer
    };

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
      "fal-ai/minimax/video-01-live/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV15ProImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.KlingVideoV15ProImageToVideo";
  static readonly title = "Kling Video V15 Pro Image To Video";
  static readonly description = `Generate video clips from your images using Kling 1.5 (pro)
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "The aspect ratio of the generated video frame"
  })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "blur, distort, and low quality" })
  declare negative_prompt: any;

  @prop({ type: "image", default: "" })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the image for Static Brush Application Area (Mask image created by users using the motion brush)"
  })
  declare static_mask_url: any;

  @prop({ type: "str", default: "", description: "List of dynamic masks" })
  declare dynamic_masks: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be used for the end of the video"
  })
  declare tail_image: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt.\n        "
  })
  declare cfg_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "5");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );
    const dynamicMasks = String(this.dynamic_masks ?? "");
    const cfgScale = Number(this.cfg_scale ?? 0.5);

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      aspect_ratio: aspectRatio,
      negative_prompt: negativePrompt,
      dynamic_masks: dynamicMasks,
      cfg_scale: cfgScale
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const staticMaskUrlRef = this.static_mask_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(staticMaskUrlRef)) {
      const staticMaskUrlUrl =
        (await imageToDataUrl(staticMaskUrlRef!)) ??
        (await assetToFalUrl(apiKey, staticMaskUrlRef!));
      if (staticMaskUrlUrl) args["static_mask_url"] = staticMaskUrlUrl;
    }

    const tailImageRef = this.tail_image as Record<string, unknown> | undefined;
    if (isRefSet(tailImageRef)) {
      const tailImageUrl =
        (await imageToDataUrl(tailImageRef!)) ??
        (await assetToFalUrl(apiKey, tailImageRef!));
      if (tailImageUrl) args["tail_image_url"] = tailImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/v1.5/pro/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LivePortrait extends FalNode {
  static readonly nodeType = "fal.image_to_video.LivePortrait";
  static readonly title = "Live Portrait";
  static readonly description = `Transfer expression from a video to a portrait.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "float", default: 0, description: "Amount to smile" })
  declare smile: any;

  @prop({
    type: "video",
    default: "",
    description: "URL of the video to drive the lip syncing."
  })
  declare video: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable stitching. Recommended to set to True."
  })
  declare flag_stitching: any;

  @prop({
    type: "float",
    default: 0,
    description: "Amount to raise or lower eyebrows"
  })
  declare eyebrow: any;

  @prop({ type: "float", default: 0, description: "Amount to blink the eyes" })
  declare blink: any;

  @prop({
    type: "float",
    default: 0,
    description: "Amount to rotate the face in pitch"
  })
  declare rotate_pitch: any;

  @prop({ type: "float", default: 0, description: "Amount to wink" })
  declare wink: any;

  @prop({
    type: "float",
    default: 2.3,
    description: "Scaling factor for the face crop."
  })
  declare scale: any;

  @prop({
    type: "float",
    default: 0,
    description: "Amount to shape mouth in 'eee' position"
  })
  declare eee: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to paste-back/stitch the animated face cropping from the face-cropping space to the original image space."
  })
  declare flag_pasteback: any;

  @prop({
    type: "float",
    default: 0,
    description: "Amount to move pupils vertically"
  })
  declare pupil_y: any;

  @prop({
    type: "float",
    default: 0,
    description: "Amount to rotate the face in yaw"
  })
  declare rotate_yaw: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be animated"
  })
  declare image: any;

  @prop({
    type: "float",
    default: 0,
    description: "Amount to shape mouth in 'woo' position"
  })
  declare woo: any;

  @prop({
    type: "float",
    default: 0,
    description: "Amount to open mouth in 'aaa' shape"
  })
  declare aaa: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to conduct the rotation when flag_do_crop is True."
  })
  declare flag_do_rot: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to use relative motion."
  })
  declare flag_relative: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to enable eye retargeting."
  })
  declare flag_eye_retargeting: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to set the lip to closed state before animation. Only takes effect when flag_eye_retargeting and flag_lip_retargeting are False."
  })
  declare flag_lip_zero: any;

  @prop({
    type: "int",
    default: 32,
    description:
      "Batch size for the model. The larger the batch size, the faster the model will run, but the more memory it will consume."
  })
  declare batch_size: any;

  @prop({
    type: "float",
    default: 0,
    description: "Amount to rotate the face in roll"
  })
  declare rotate_roll: any;

  @prop({ type: "int", default: 512, description: "Size of the output image." })
  declare dsize: any;

  @prop({
    type: "float",
    default: -0.125,
    description:
      "Vertical offset ratio for face crop. Positive values move up, negative values move down."
  })
  declare vy_ratio: any;

  @prop({
    type: "float",
    default: 0,
    description: "Amount to move pupils horizontally"
  })
  declare pupil_x: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "\n        Whether to enable the safety checker. If enabled, the model will check if the input image contains a face before processing it.\n        The safety checker will process the input image\n        "
  })
  declare enable_safety_checker: any;

  @prop({
    type: "float",
    default: 0,
    description: "Horizontal offset ratio for face crop."
  })
  declare vx_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to enable lip retargeting."
  })
  declare flag_lip_retargeting: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to crop the source portrait to the face-cropping space."
  })
  declare flag_do_crop: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const smile = Number(this.smile ?? 0);
    const flagStitching = Boolean(this.flag_stitching ?? true);
    const eyebrow = Number(this.eyebrow ?? 0);
    const blink = Number(this.blink ?? 0);
    const rotatePitch = Number(this.rotate_pitch ?? 0);
    const wink = Number(this.wink ?? 0);
    const scale = Number(this.scale ?? 2.3);
    const eee = Number(this.eee ?? 0);
    const flagPasteback = Boolean(this.flag_pasteback ?? true);
    const pupilY = Number(this.pupil_y ?? 0);
    const rotateYaw = Number(this.rotate_yaw ?? 0);
    const woo = Number(this.woo ?? 0);
    const aaa = Number(this.aaa ?? 0);
    const flagDoRot = Boolean(this.flag_do_rot ?? true);
    const flagRelative = Boolean(this.flag_relative ?? true);
    const flagEyeRetargeting = Boolean(this.flag_eye_retargeting ?? false);
    const flagLipZero = Boolean(this.flag_lip_zero ?? true);
    const batchSize = Number(this.batch_size ?? 32);
    const rotateRoll = Number(this.rotate_roll ?? 0);
    const dsize = Number(this.dsize ?? 512);
    const vyRatio = Number(this.vy_ratio ?? -0.125);
    const pupilX = Number(this.pupil_x ?? 0);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const vxRatio = Number(this.vx_ratio ?? 0);
    const flagLipRetargeting = Boolean(this.flag_lip_retargeting ?? false);
    const flagDoCrop = Boolean(this.flag_do_crop ?? true);

    const args: Record<string, unknown> = {
      smile: smile,
      flag_stitching: flagStitching,
      eyebrow: eyebrow,
      blink: blink,
      rotate_pitch: rotatePitch,
      wink: wink,
      scale: scale,
      eee: eee,
      flag_pasteback: flagPasteback,
      pupil_y: pupilY,
      rotate_yaw: rotateYaw,
      woo: woo,
      aaa: aaa,
      flag_do_rot: flagDoRot,
      flag_relative: flagRelative,
      flag_eye_retargeting: flagEyeRetargeting,
      flag_lip_zero: flagLipZero,
      batch_size: batchSize,
      rotate_roll: rotateRoll,
      dsize: dsize,
      vy_ratio: vyRatio,
      pupil_x: pupilX,
      enable_safety_checker: enableSafetyChecker,
      vx_ratio: vxRatio,
      flag_lip_retargeting: flagLipRetargeting,
      flag_do_crop: flagDoCrop
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

    const res = await falSubmit(apiKey, "fal-ai/live-portrait", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Musetalk extends FalNode {
  static readonly nodeType = "fal.image_to_video.Musetalk";
  static readonly title = "Musetalk";
  static readonly description = `MuseTalk is a real-time high quality audio-driven lip-syncing model. Use MuseTalk to animate a face with your own audio.
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "audio", default: "", description: "URL of the audio" })
  declare audio: any;

  @prop({ type: "video", default: "", description: "URL of the source video" })
  declare source_video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }

    const sourceVideoRef = this.source_video as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(sourceVideoRef)) {
      const sourceVideoUrl = await assetToFalUrl(apiKey, sourceVideoRef!);
      if (sourceVideoUrl) args["source_video_url"] = sourceVideoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/musetalk", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Sadtalker extends FalNode {
  static readonly nodeType = "fal.image_to_video.Sadtalker";
  static readonly title = "Sadtalker";
  static readonly description = `Learning Realistic 3D Motion Coefficients for Stylized Audio-Driven Single Image Talking Face Animation
video, animation, image-to-video, img2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "int", default: 0, description: "The style of the pose" })
  declare pose_style: any;

  @prop({ type: "image", default: "", description: "URL of the source image" })
  declare source_image: any;

  @prop({ type: "audio", default: "", description: "URL of the driven audio" })
  declare driven_audio: any;

  @prop({
    type: "enum",
    default: "",
    values: ["gfpgan"],
    description: "The type of face enhancer to use"
  })
  declare face_enhancer: any;

  @prop({
    type: "float",
    default: 1,
    description: "The scale of the expression"
  })
  declare expression_scale: any;

  @prop({
    type: "enum",
    default: "256",
    values: ["256", "512"],
    description: "The resolution of the face model"
  })
  declare face_model_resolution: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to use still mode. Fewer head motion, works with preprocess 'full'."
  })
  declare still_mode: any;

  @prop({
    type: "enum",
    default: "crop",
    values: ["crop", "extcrop", "resize", "full", "extfull"],
    description: "The type of preprocessing to use"
  })
  declare preprocess: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const poseStyle = Number(this.pose_style ?? 0);
    const faceEnhancer = String(this.face_enhancer ?? "");
    const expressionScale = Number(this.expression_scale ?? 1);
    const faceModelResolution = String(this.face_model_resolution ?? "256");
    const stillMode = Boolean(this.still_mode ?? false);
    const preprocess = String(this.preprocess ?? "crop");

    const args: Record<string, unknown> = {
      pose_style: poseStyle,
      face_enhancer: faceEnhancer,
      expression_scale: expressionScale,
      face_model_resolution: faceModelResolution,
      still_mode: stillMode,
      preprocess: preprocess
    };

    const sourceImageRef = this.source_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(sourceImageRef)) {
      const sourceImageUrl =
        (await imageToDataUrl(sourceImageRef!)) ??
        (await assetToFalUrl(apiKey, sourceImageRef!));
      if (sourceImageUrl) args["source_image_url"] = sourceImageUrl;
    }

    const drivenAudioRef = this.driven_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(drivenAudioRef)) {
      const drivenAudioUrl = await assetToFalUrl(apiKey, drivenAudioRef!);
      if (drivenAudioUrl) args["driven_audio_url"] = drivenAudioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sadtalker", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class FastSvdLcm extends FalNode {
  static readonly nodeType = "fal.image_to_video.FastSvdLcm";
  static readonly title = "Fast Svd Lcm";
  static readonly description = `Generate short video clips from your images using SVD v1.1 at Lightning Speed
video, animation, image-to-video, img2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "float",
    default: 0.02,
    description:
      "\n            The conditoning augmentation determines the amount of noise that will be\n            added to the conditioning frame. The higher the number, the more noise\n            there will be, and the less the video will look like the initial image.\n            Increase it for more motion.\n        "
  })
  declare cond_aug: any;

  @prop({
    type: "image",
    default: "",
    description:
      "The URL of the image to use as a starting point for the generation."
  })
  declare image: any;

  @prop({
    type: "int",
    default: 4,
    description:
      "\n            The number of steps to run the model for. The higher the number the better\n            the quality and longer it will take to generate.\n        "
  })
  declare steps: any;

  @prop({
    type: "int",
    default: 127,
    description:
      "\n            The motion bucket id determines the motion of the generated video. The\n            higher the number, the more motion there will be.\n        "
  })
  declare motion_bucket_id: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of Stable Diffusion\n            will output the same image every time.\n        "
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 10,
    description:
      "\n            The FPS of the generated video. The higher the number, the faster the video will\n            play. Total video length is 25 frames.\n        "
  })
  declare fps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const condAug = Number(this.cond_aug ?? 0.02);
    const steps = Number(this.steps ?? 4);
    const motionBucketId = Number(this.motion_bucket_id ?? 127);
    const seed = String(this.seed ?? "");
    const fps = Number(this.fps ?? 10);

    const args: Record<string, unknown> = {
      cond_aug: condAug,
      steps: steps,
      motion_bucket_id: motionBucketId,
      seed: seed,
      fps: fps
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/fast-svd-lcm", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV3StandardImageToVideo extends FalNode {
  static readonly nodeType =
    "fal.image_to_video.KlingVideoV3StandardImageToVideo";
  static readonly title = "Kling Video V3 Standard Image To Video";
  static readonly description = `Kling Video V3 Standard generates videos from images with balanced quality and speed using the latest V3 model.
video, generation, kling, v3, standard, image-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Text prompt for video generation. Either prompt or multi_prompt must be provided, but not both."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional Voice IDs for video generation. Reference voices in your prompt with <<<voice_1>>> and <<<voice_2>>> (maximum 2 voices per task). Get voice IDs from the kling video create-voice endpoint: https://fal.ai/models/fal-ai/kling-video/create-voice"
  })
  declare voice_ids: any;

  @prop({
    type: "enum",
    default: "5",
    values: [
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15"
    ],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "",
    description:
      "List of prompts for multi-shot video generation. If provided, divides the video into multiple shots."
  })
  declare multi_prompt: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to generate native audio for the video. Supports Chinese and English voice output. Other languages are automatically translated to English. For English speech, use lowercase letters; for acronyms or proper nouns, use uppercase."
  })
  declare generate_audio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Elements (characters/objects) to include in the video. Each example can either be an image set (frontal + reference images) or a video. Reference in prompt as @Element1, @Element2, etc."
  })
  declare elements: any;

  @prop({
    type: "str",
    default: "customize",
    description:
      "The type of multi-shot video generation. Required when multi_prompt is provided."
  })
  declare shot_type: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be used for the video"
  })
  declare start_image: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be used for the end of the video"
  })
  declare end_image: any;

  @prop({ type: "str", default: "blur, distort, and low quality" })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt.\n        "
  })
  declare cfg_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const voiceIds = String(this.voice_ids ?? "");
    const duration = String(this.duration ?? "5");
    const multiPrompt = String(this.multi_prompt ?? "");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const elements = String(this.elements ?? "");
    const shotType = String(this.shot_type ?? "customize");
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );
    const cfgScale = Number(this.cfg_scale ?? 0.5);

    const args: Record<string, unknown> = {
      prompt: prompt,
      voice_ids: voiceIds,
      duration: duration,
      multi_prompt: multiPrompt,
      generate_audio: generateAudio,
      elements: elements,
      shot_type: shotType,
      negative_prompt: negativePrompt,
      cfg_scale: cfgScale
    };

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl =
        (await imageToDataUrl(startImageRef!)) ??
        (await assetToFalUrl(apiKey, startImageRef!));
      if (startImageUrl) args["start_image_url"] = startImageUrl;
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
      "fal-ai/kling-video/v3/standard/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV3ProImageToVideo extends FalNode {
  static readonly nodeType = "fal.image_to_video.KlingVideoV3ProImageToVideo";
  static readonly title = "Kling Video V3 Pro Image To Video";
  static readonly description = `Kling Video V3 Pro generates professional quality videos from images with enhanced visual fidelity using the latest V3 model.
video, generation, kling, v3, pro, image-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Text prompt for video generation. Either prompt or multi_prompt must be provided, but not both."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional Voice IDs for video generation. Reference voices in your prompt with <<<voice_1>>> and <<<voice_2>>> (maximum 2 voices per task). Get voice IDs from the kling video create-voice endpoint: https://fal.ai/models/fal-ai/kling-video/create-voice"
  })
  declare voice_ids: any;

  @prop({
    type: "enum",
    default: "5",
    values: [
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15"
    ],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "",
    description:
      "List of prompts for multi-shot video generation. If provided, divides the video into multiple shots."
  })
  declare multi_prompt: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to generate native audio for the video. Supports Chinese and English voice output. Other languages are automatically translated to English. For English speech, use lowercase letters; for acronyms or proper nouns, use uppercase."
  })
  declare generate_audio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Elements (characters/objects) to include in the video. Each example can either be an image set (frontal + reference images) or a video. Reference in prompt as @Element1, @Element2, etc."
  })
  declare elements: any;

  @prop({
    type: "str",
    default: "customize",
    description:
      "The type of multi-shot video generation. Required when multi_prompt is provided."
  })
  declare shot_type: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be used for the video"
  })
  declare start_image: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be used for the end of the video"
  })
  declare end_image: any;

  @prop({ type: "str", default: "blur, distort, and low quality" })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt.\n        "
  })
  declare cfg_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const voiceIds = String(this.voice_ids ?? "");
    const duration = String(this.duration ?? "5");
    const multiPrompt = String(this.multi_prompt ?? "");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const elements = String(this.elements ?? "");
    const shotType = String(this.shot_type ?? "customize");
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );
    const cfgScale = Number(this.cfg_scale ?? 0.5);

    const args: Record<string, unknown> = {
      prompt: prompt,
      voice_ids: voiceIds,
      duration: duration,
      multi_prompt: multiPrompt,
      generate_audio: generateAudio,
      elements: elements,
      shot_type: shotType,
      negative_prompt: negativePrompt,
      cfg_scale: cfgScale
    };

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl =
        (await imageToDataUrl(startImageRef!)) ??
        (await assetToFalUrl(apiKey, startImageRef!));
      if (startImageUrl) args["start_image_url"] = startImageUrl;
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
      "fal-ai/kling-video/v3/pro/image-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export const FAL_IMAGE_TO_VIDEO_NODES: readonly NodeClass[] = [
  PixverseV56ImageToVideo,
  LumaDreamMachine,
  AMTFrameInterpolation,
  AIAvatar,
  AIAvatarSingleText,
  AIAvatarMultiText,
  AIAvatarMulti,
  SeeDanceV15ProImageToVideo,
  SeeDanceV1ProFastImageToVideo,
  SeeDanceV1LiteReferenceToVideo,
  ByteDanceVideoStylize,
  OmniHumanV15,
  CogVideoX5BImageToVideo,
  StableVideoImageToVideo,
  LTXImageToVideo,
  KlingVideoV1StandardImageToVideo,
  PixverseV56Transition,
  ViduQ2ReferenceToVideoPro,
  WanV26ImageToVideoFlash,
  WanV26ImageToVideo,
  Ltx219BImageToVideo,
  Ltx219BImageToVideoLora,
  Ltx219BDistilledImageToVideo,
  Ltx219BDistilledImageToVideoLora,
  WanMove,
  Kandinsky5ProImageToVideo,
  LiveAvatar,
  HunyuanVideoV15ImageToVideo,
  KlingVideoO1StandardImageToVideo,
  KlingVideoO1StandardReferenceToVideo,
  KlingVideoO3StandardImageToVideo,
  KlingVideoO3ProImageToVideo,
  KlingVideoO3StandardReferenceToVideo,
  KlingVideoO3ProReferenceToVideo,
  KlingVideoV26ProImageToVideo,
  KlingVideoAiAvatarV2Standard,
  KlingVideoAiAvatarV2Pro,
  CreatifyAurora,
  PixverseV55Effects,
  PixverseV55Transition,
  PixverseV55ImageToVideo,
  KlingVideoO1ImageToVideo,
  KlingVideoO1ReferenceToVideo,
  Ltx2ImageToVideoFast,
  Ltx2ImageToVideo,
  BytedanceLynx,
  PixverseSwap,
  PikaV22Pikaframes,
  LongcatVideoImageToVideo720P,
  LongcatVideoImageToVideo480P,
  LongcatVideoDistilledImageToVideo720P,
  LongcatVideoDistilledImageToVideo480P,
  MinimaxHailuo23FastStandardImageToVideo,
  MinimaxHailuo23StandardImageToVideo,
  MinimaxHailuo23FastProImageToVideo,
  ViduQ2ImageToVideoTurbo,
  ViduQ2ImageToVideoPro,
  KlingVideoV25TurboStandardImageToVideo,
  Veo31FastFirstLastFrameToVideo,
  Veo31FirstLastFrameToVideo,
  Veo31ReferenceToVideo,
  Veo31FastImageToVideo,
  Veo31ImageToVideo,
  Sora2ImageToVideoPro,
  Sora2ImageToVideo,
  OviImageToVideo,
  VeedFabric10Fast,
  VeedFabric10,
  KlingVideoV1StandardAiAvatar,
  KlingVideoV1ProAiAvatar,
  DecartLucy14BImageToVideo,
  WanAti,
  PixverseV5Transition,
  PixverseV5Effects,
  PixverseV5ImageToVideo,
  MoonvalleyMareyI2v,
  WanV22A14bImageToVideoLora,
  MinimaxHailuo02FastImageToVideo,
  Veo3ImageToVideo,
  WanV22A14bImageToVideoTurbo,
  WanV225bImageToVideo,
  WanV22A14bImageToVideo,
  BytedanceOmnihuman,
  Ltxv13b098DistilledImageToVideo,
  Veo3FastImageToVideo,
  ViduQ1ReferenceToVideo,
  MinimaxHailuo02ProImageToVideo,
  BytedanceSeedanceV1LiteImageToVideo,
  HunyuanAvatar,
  KlingVideoV21ProImageToVideo,
  HunyuanPortrait,
  KlingVideoV16StandardElements,
  KlingVideoV16ProElements,
  LtxVideo13bDistilledImageToVideo,
  LtxVideo13bDevImageToVideo,
  LtxVideoLoraImageToVideo,
  PixverseV45Transition,
  PixverseV45ImageToVideoFast,
  PixverseV45Effects,
  HunyuanCustom,
  FramepackF1,
  ViduQ1StartEndToVideo,
  ViduQ1ImageToVideo,
  MagiImageToVideo,
  PixverseV4Effects,
  MagiDistilledImageToVideo,
  FramepackFlf2v,
  WanFlf2v,
  Framepack,
  PixverseV4ImageToVideoFast,
  PixverseV4ImageToVideo,
  PixverseV35Effects,
  PixverseV35Transition,
  LumaDreamMachineRay2FlashImageToVideo,
  PikaV15Pikaffects,
  PikaV21ImageToVideo,
  PikaV22ImageToVideo,
  PikaV22Pikascenes,
  PikaV2TurboImageToVideo,
  ViduImageToVideo,
  ViduReferenceToVideo,
  ViduStartEndToVideo,
  ViduTemplateToVideo,
  WanI2vLora,
  HunyuanVideoImageToVideo,
  MinimaxVideo01DirectorImageToVideo,
  SkyreelsI2v,
  LumaDreamMachineRay2ImageToVideo,
  HunyuanVideoImg2vidLora,
  PixverseV35ImageToVideoFast,
  PixverseV35ImageToVideo,
  MinimaxVideo01SubjectReference,
  KlingVideoV16StandardImageToVideo,
  SadtalkerReference,
  MinimaxVideo01LiveImageToVideo,
  KlingVideoV15ProImageToVideo,
  LivePortrait,
  Musetalk,
  Sadtalker,
  FastSvdLcm,
  KlingVideoV3StandardImageToVideo,
  KlingVideoV3ProImageToVideo
] as const;
