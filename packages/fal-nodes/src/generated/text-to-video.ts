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

export class HunyuanVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.HunyuanVideo";
  static readonly title = "Hunyuan Video";
  static readonly description = `Hunyuan Video is Tencent's advanced text-to-video model for high-quality video generation.
video, generation, hunyuan, text-to-video, txt2vid`;
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
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const seed = String(this.seed ?? "");
    const numFrames = String(this.num_frames ?? 129);
    const proMode = Boolean(this.pro_mode ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      enable_safety_checker: enableSafetyChecker,
      seed: seed,
      num_frames: numFrames,
      pro_mode: proMode
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class CogVideoX5B extends FalNode {
  static readonly nodeType = "fal.text_to_video.CogVideoX5B";
  static readonly title = "Cog Video X5 B";
  static readonly description = `CogVideoX-5B is a powerful open-source text-to-video generation model with 5 billion parameters.
video, generation, cogvideo, text-to-video, txt2vid`;
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
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of the model\n            will output the same video every time.\n        "
  })
  declare seed: any;

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
    type: "int",
    default: 50,
    description: "The number of inference steps to perform."
  })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const useRife = Boolean(this.use_rife ?? true);
    const loras = String(this.loras ?? []);
    const videoSize = String(this.video_size ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 7);
    const seed = String(this.seed ?? "");
    const exportFps = Number(this.export_fps ?? 16);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);

    const args: Record<string, unknown> = {
      prompt: prompt,
      use_rife: useRife,
      loras: loras,
      video_size: videoSize,
      guidance_scale: guidanceScale,
      seed: seed,
      export_fps: exportFps,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/cogvideox-5b", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class AnimateDiffTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.AnimateDiffTextToVideo";
  static readonly title = "Animate Diff Text To Video";
  static readonly description = `AnimateDiff generates smooth animations from text prompts using diffusion models.
video, generation, animatediff, animation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "The prompt to use for generating the video. Be as descriptive as possible for best results."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 16,
    description: "The number of frames to generate for the video."
  })
  declare num_frames: any;

  @prop({
    type: "int",
    default: 8,
    description: "Number of frames per second to extract from the video."
  })
  declare fps: any;

  @prop({
    type: "str",
    default: "square",
    description: "The size of the video to generate."
  })
  declare video_size: any;

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
    const numFrames = Number(this.num_frames ?? 16);
    const fps = Number(this.fps ?? 8);
    const videoSize = String(this.video_size ?? "square");
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
      num_frames: numFrames,
      fps: fps,
      video_size: videoSize,
      guidance_scale: guidanceScale,
      seed: seed,
      num_inference_steps: numInferenceSteps,
      negative_prompt: negativePrompt,
      motions: motions
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/fast-animatediff/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class AnimateDiffTurboTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.AnimateDiffTurboTextToVideo";
  static readonly title = "Animate Diff Turbo Text To Video";
  static readonly description = `AnimateDiff Turbo generates animations at lightning speed with reduced steps.
video, generation, animatediff, turbo, fast, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "The prompt to use for generating the video. Be as descriptive as possible for best results."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 8,
    description: "Number of frames per second to extract from the video."
  })
  declare fps: any;

  @prop({
    type: "str",
    default: "square",
    description: "The size of the video to generate."
  })
  declare video_size: any;

  @prop({
    type: "float",
    default: 2,
    description:
      "The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt when looking for a related image to show you."
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
    default: 8,
    description:
      "The number of inference steps to perform. 4-12 is recommended for turbo mode."
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
    type: "int",
    default: 16,
    description: "The number of frames to generate for the video."
  })
  declare num_frames: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const fps = Number(this.fps ?? 8);
    const videoSize = String(this.video_size ?? "square");
    const guidanceScale = Number(this.guidance_scale ?? 2);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 8);
    const negativePrompt = String(
      this.negative_prompt ??
        "(bad quality, worst quality:1.2), ugly faces, bad anime"
    );
    const numFrames = Number(this.num_frames ?? 16);

    const args: Record<string, unknown> = {
      prompt: prompt,
      fps: fps,
      video_size: videoSize,
      guidance_scale: guidanceScale,
      seed: seed,
      num_inference_steps: numInferenceSteps,
      negative_prompt: negativePrompt,
      num_frames: numFrames
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/fast-animatediff/turbo/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class AnimateDiffSparseCtrlLCM extends FalNode {
  static readonly nodeType = "fal.text_to_video.AnimateDiffSparseCtrlLCM";
  static readonly title = "Animate Diff Sparse Ctrl L C M";
  static readonly description = `AnimateDiff SparseCtrl LCM animates drawings with latent consistency models for fast generation.
video, generation, animatediff, sparsectrl, lcm, animation, text-to-video`;
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
    default: -1,
    description:
      "\n        The same seed and the same prompt given to the same version of Stable\n        Diffusion will output the same image every time.\n        "
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "scribble",
    values: ["scribble", "rgb"],
    description:
      "The type of controlnet to use for generating the video. The controlnet determines how the video will be animated."
  })
  declare controlnet_type: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "The frame index of the third keyframe to use for the generation."
  })
  declare keyframe_2_index: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "The frame index of the first keyframe to use for the generation."
  })
  declare keyframe_0_index: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the second keyframe to use for the generation."
  })
  declare keyframe_1_image: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "The frame index of the second keyframe to use for the generation."
  })
  declare keyframe_1_index: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt when looking for a related image to show you."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 4,
    description:
      "Increasing the amount of steps tells Stable Diffusion that it should take more steps to generate your final result which can increase the amount of detail in your image."
  })
  declare num_inference_steps: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the third keyframe to use for the generation."
  })
  declare keyframe_2_image: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The negative prompt to use. Use it to specify what you don't want.\n        "
  })
  declare negative_prompt: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the first keyframe to use for the generation."
  })
  declare keyframe_0_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const controlnetType = String(this.controlnet_type ?? "scribble");
    const keyframe_2Index = Number(this.keyframe_2_index ?? 0);
    const keyframe_0Index = Number(this.keyframe_0_index ?? 0);
    const keyframe_1Index = Number(this.keyframe_1_index ?? 0);
    const guidanceScale = Number(this.guidance_scale ?? 1);
    const numInferenceSteps = Number(this.num_inference_steps ?? 4);
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      seed: seed,
      controlnet_type: controlnetType,
      keyframe_2_index: keyframe_2Index,
      keyframe_0_index: keyframe_0Index,
      keyframe_1_index: keyframe_1Index,
      guidance_scale: guidanceScale,
      num_inference_steps: numInferenceSteps,
      negative_prompt: negativePrompt
    };

    const keyframe_1ImageRef = this.keyframe_1_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(keyframe_1ImageRef)) {
      const keyframe_1ImageUrl =
        (await imageToDataUrl(keyframe_1ImageRef!)) ??
        (await assetToFalUrl(apiKey, keyframe_1ImageRef!));
      if (keyframe_1ImageUrl) args["keyframe_1_image_url"] = keyframe_1ImageUrl;
    }

    const keyframe_2ImageRef = this.keyframe_2_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(keyframe_2ImageRef)) {
      const keyframe_2ImageUrl =
        (await imageToDataUrl(keyframe_2ImageRef!)) ??
        (await assetToFalUrl(apiKey, keyframe_2ImageRef!));
      if (keyframe_2ImageUrl) args["keyframe_2_image_url"] = keyframe_2ImageUrl;
    }

    const keyframe_0ImageRef = this.keyframe_0_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(keyframe_0ImageRef)) {
      const keyframe_0ImageUrl =
        (await imageToDataUrl(keyframe_0ImageRef!)) ??
        (await assetToFalUrl(apiKey, keyframe_0ImageRef!));
      if (keyframe_0ImageUrl) args["keyframe_0_image_url"] = keyframe_0ImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/animatediff-sparsectrl-lcm",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class VeedAvatarsTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.VeedAvatarsTextToVideo";
  static readonly title = "Veed Avatars Text To Video";
  static readonly description = `VEED Avatars generates talking avatar videos from text using realistic AI-powered characters.
video, generation, avatar, talking-head, veed, text-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare text: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "emily_vertical_primary",
      "emily_vertical_secondary",
      "marcus_vertical_primary",
      "marcus_vertical_secondary",
      "mira_vertical_primary",
      "mira_vertical_secondary",
      "jasmine_vertical_primary",
      "jasmine_vertical_secondary",
      "jasmine_vertical_walking",
      "aisha_vertical_walking",
      "elena_vertical_primary",
      "elena_vertical_secondary",
      "any_male_vertical_primary",
      "any_female_vertical_primary",
      "any_male_vertical_secondary",
      "any_female_vertical_secondary",
      "any_female_vertical_walking",
      "emily_primary",
      "emily_side",
      "marcus_primary",
      "marcus_side",
      "aisha_walking",
      "elena_primary",
      "elena_side",
      "any_male_primary",
      "any_female_primary",
      "any_male_side",
      "any_female_side"
    ],
    description: "The avatar to use for the video"
  })
  declare avatar_id: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const avatarId = String(this.avatar_id ?? "");

    const args: Record<string, unknown> = {
      text: text,
      avatar_id: avatarId
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "veed/avatars/text-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ArgilAvatarsTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.ArgilAvatarsTextToVideo";
  static readonly title = "Argil Avatars Text To Video";
  static readonly description = `Argil Avatars creates realistic talking avatar videos from text descriptions.
video, generation, avatar, talking-head, argil, text-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    moderation_transcription: "str",
    moderation_error: "str",
    moderation_flagged: "bool",
    video: "video"
  };

  @prop({ type: "str", default: "" })
  declare text: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "Rachel",
      "Clyde",
      "Roger",
      "Sarah",
      "Laura",
      "Thomas",
      "Charlie",
      "George",
      "Callum",
      "River",
      "Harry",
      "Liam",
      "Alice",
      "Matilda",
      "Will",
      "Jessica",
      "Lilly",
      "Bill",
      "Oxley",
      "Luna"
    ]
  })
  declare voice: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Enabling the remove background feature will result in a 50% increase in the price."
  })
  declare remove_background: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "Mia outdoor (UGC)",
      "Lara (Masterclass)",
      "Ines (UGC)",
      "Maria (Masterclass)",
      "Emma (UGC)",
      "Sienna (Masterclass)",
      "Elena (UGC)",
      "Jasmine (Masterclass)",
      "Amara (Masterclass)",
      "Ryan podcast (UGC)",
      "Tyler (Masterclass)",
      "Jayse (Masterclass)",
      "Paul (Masterclass)",
      "Matteo (UGC)",
      "Daniel car (UGC)",
      "Dario (Masterclass)",
      "Viva (Masterclass)",
      "Chen (Masterclass)",
      "Alex (Masterclass)",
      "Vanessa (UGC)",
      "Laurent (UGC)",
      "Noemie car (UGC)",
      "Brandon (UGC)",
      "Byron (Masterclass)",
      "Calista (Masterclass)",
      "Milo (Masterclass)",
      "Fabien (Masterclass)",
      "Rose (UGC)"
    ]
  })
  declare avatar: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const voice = String(this.voice ?? "");
    const removeBackground = Boolean(this.remove_background ?? false);
    const avatar = String(this.avatar ?? "");

    const args: Record<string, unknown> = {
      text: text,
      voice: voice,
      remove_background: removeBackground,
      avatar: avatar
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "argil/avatars/text-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class SeeDanceV15ProTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.SeeDanceV15ProTextToVideo";
  static readonly title = "See Dance V15 Pro Text To Video";
  static readonly description = `SeeDance v1.5 Pro from ByteDance generates high-quality dance videos from text prompts.
video, generation, dance, seedance, bytedance, text-to-video`;
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
    default: "16:9",
    values: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "auto"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p", "1080p"],
    description:
      "Video resolution - 480p for faster generation, 720p for balance, 1080p for higher quality"
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio for the video"
  })
  declare generate_audio: any;

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
    description: "Random seed to control video generation. Use -1 for random."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "720p");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const duration = String(this.duration ?? "5");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const cameraFixed = Boolean(this.camera_fixed ?? false);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      generate_audio: generateAudio,
      duration: duration,
      enable_safety_checker: enableSafetyChecker,
      camera_fixed: cameraFixed,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/bytedance/seedance/v1.5/pro/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class SeeDanceV1ProFastTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.SeeDanceV1ProFastTextToVideo";
  static readonly title = "See Dance V1 Pro Fast Text To Video";
  static readonly description = `SeeDance v1 Pro Fast generates dance videos quickly from text with reduced generation time.
video, generation, dance, seedance, fast, bytedance, text-to-video`;
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
    default: "16:9",
    values: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
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
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/bytedance/seedance/v1/pro/fast/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class VeedFabric10Text extends FalNode {
  static readonly nodeType = "fal.text_to_video.VeedFabric10Text";
  static readonly title = "Veed Fabric10 Text";
  static readonly description = `VEED Fabric 1.0 generates video content from text using advanced video synthesis.
video, generation, fabric, veed, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare text: any;

  @prop({
    type: "enum",
    default: "",
    values: ["720p", "480p"],
    description: "Resolution"
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional additional voice description. The primary voice description is auto-generated from the image. You can use simple descriptors like 'British accent' or 'Confident' or provide a detailed description like 'Confident male voice, mid-20s, with notes of...'"
  })
  declare voice_description: any;

  @prop({ type: "image", default: "" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const resolution = String(this.resolution ?? "");
    const voiceDescription = String(this.voice_description ?? "");

    const args: Record<string, unknown> = {
      text: text,
      resolution: resolution,
      voice_description: voiceDescription
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "veed/fabric-1.0/text", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LTXVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.LTXVideo";
  static readonly title = "L T X Video";
  static readonly description = `LTX Video generates high-quality videos from text prompts with advanced temporal consistency.
video, generation, ltx, text-to-video, txt2vid`;
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
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ltx-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV1StandardTextToVideo extends FalNode {
  static readonly nodeType =
    "fal.text_to_video.KlingVideoV1StandardTextToVideo";
  static readonly title = "Kling Video V1 Standard Text To Video";
  static readonly description = `Kling Video v1 Standard generates videos from text with balanced quality and speed.
video, generation, kling, text-to-video, txt2vid`;
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
    type: "str",
    default: "",
    description: "Advanced Camera control parameters"
  })
  declare advanced_camera_control: any;

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

  @prop({ type: "str", default: "", description: "Camera control parameters" })
  declare camera_control: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const advancedCameraControl = String(this.advanced_camera_control ?? "");
    const duration = String(this.duration ?? "5");
    const cfgScale = Number(this.cfg_scale ?? 0.5);
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );
    const cameraControl = String(this.camera_control ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      advanced_camera_control: advancedCameraControl,
      duration: duration,
      cfg_scale: cfgScale,
      negative_prompt: negativePrompt,
      camera_control: cameraControl
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/v1/standard/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MochiV1 extends FalNode {
  static readonly nodeType = "fal.text_to_video.MochiV1";
  static readonly title = "Mochi V1";
  static readonly description = `Mochi v1 generates creative videos from text with unique artistic style.
video, generation, mochi, artistic, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate a video from."
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "int",
    default: -1,
    description: "The seed to use for generating the video."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "The negative prompt for the video."
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = Number(this.seed ?? -1);
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/mochi-v1", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class StableVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.StableVideo";
  static readonly title = "Stable Video";
  static readonly description = `Stable Video generates consistent and stable video sequences from text prompts.
video, generation, stable, text-to-video, txt2vid`;
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

export class T2VTurbo extends FalNode {
  static readonly nodeType = "fal.text_to_video.T2VTurbo";
  static readonly title = "T2 V Turbo";
  static readonly description = `T2V Turbo generates videos from text at high speed with optimized performance.
video, generation, turbo, fast, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate images from"
  })
  declare prompt: any;

  @prop({ type: "float", default: 7.5, description: "The guidance scale" })
  declare guidance_scale: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed to use for the random number generator"
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 8,
    description: "The FPS of the exported video"
  })
  declare export_fps: any;

  @prop({
    type: "int",
    default: 4,
    description: "The number of steps to sample"
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 16,
    description: "The number of frames to generate"
  })
  declare num_frames: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const seed = String(this.seed ?? "");
    const exportFps = Number(this.export_fps ?? 8);
    const numInferenceSteps = Number(this.num_inference_steps ?? 4);
    const numFrames = Number(this.num_frames ?? 16);

    const args: Record<string, unknown> = {
      prompt: prompt,
      guidance_scale: guidanceScale,
      seed: seed,
      export_fps: exportFps,
      num_inference_steps: numInferenceSteps,
      num_frames: numFrames
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/t2v-turbo", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LumaDreamMachineTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.LumaDreamMachineTextToVideo";
  static readonly title = "Luma Dream Machine Text To Video";
  static readonly description = `Luma Dream Machine generates creative videos from text with dreamlike aesthetics.
video, generation, luma, dream-machine, text-to-video, txt2vid`;
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
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/luma-dream-machine", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LumaPhoton extends FalNode {
  static readonly nodeType = "fal.text_to_video.LumaPhoton";
  static readonly title = "Luma Photon";
  static readonly description = `Luma Photon generates photorealistic videos from text with high visual fidelity.
video, generation, luma, photon, photorealistic, text-to-video`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { images: "list[File]" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/luma-photon", args);
    const images = res.images as { url: string }[];
    return { output: { type: "image", uri: images[0].url } };
  }
}

export class PixverseV56TextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.PixverseV56TextToVideo";
  static readonly title = "Pixverse V56 Text To Video";
  static readonly description = `Pixverse
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "720p");
    const style = String(this.style ?? "");
    const thinkingType = String(this.thinking_type ?? "");
    const duration = String(this.duration ?? "5");
    const generateAudioSwitch = Boolean(this.generate_audio_switch ?? false);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      style: style,
      thinking_type: thinkingType,
      duration: duration,
      generate_audio_switch: generateAudioSwitch,
      seed: seed,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/pixverse/v5.6/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BDistilledTextToVideoLora extends FalNode {
  static readonly nodeType =
    "fal.text_to_video.Ltx219BDistilledTextToVideoLora";
  static readonly title = "Ltx219 B Distilled Text To Video Lora";
  static readonly description = `LTX-2 19B Distilled
video, generation, text-to-video, txt2vid, lora`;
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
    description: "The prompt to generate the video from."
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
    default: "landscape_4_3",
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
    description:
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const useMultiscale = Boolean(this.use_multiscale ?? true);
    const prompt = String(this.prompt ?? "");
    const acceleration = String(this.acceleration ?? "none");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const fps = Number(this.fps ?? 25);
    const loras = String(this.loras ?? []);
    const cameraLora = String(this.camera_lora ?? "none");
    const videoSize = String(this.video_size ?? "landscape_4_3");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 121);
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");

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
      camera_lora_scale: cameraLoraScale,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/distilled/text-to-video/lora",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BDistilledTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.Ltx219BDistilledTextToVideo";
  static readonly title = "Ltx219 B Distilled Text To Video";
  static readonly description = `LTX-2 19B Distilled
video, generation, text-to-video, txt2vid`;
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
    description: "The prompt to generate the video from."
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
    default: "landscape_4_3",
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
    description:
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const useMultiscale = Boolean(this.use_multiscale ?? true);
    const prompt = String(this.prompt ?? "");
    const acceleration = String(this.acceleration ?? "none");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const fps = Number(this.fps ?? 25);
    const cameraLora = String(this.camera_lora ?? "none");
    const videoSize = String(this.video_size ?? "landscape_4_3");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 121);
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");

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
      camera_lora_scale: cameraLoraScale,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/distilled/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BTextToVideoLora extends FalNode {
  static readonly nodeType = "fal.text_to_video.Ltx219BTextToVideoLora";
  static readonly title = "Ltx219 B Text To Video Lora";
  static readonly description = `LTX-2 19B
video, generation, text-to-video, txt2vid, lora`;
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
    description: "The prompt to generate the video from."
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
    default: "landscape_4_3",
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
    default: 3,
    description: "The guidance scale to use."
  })
  declare guidance_scale: any;

  @prop({
    type: "str",
    default:
      "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts.",
    description: "The negative prompt to generate the video from."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

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
    const videoSize = String(this.video_size ?? "landscape_4_3");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 121);
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
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
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      guidance_scale: guidanceScale,
      negative_prompt: negativePrompt,
      camera_lora_scale: cameraLoraScale,
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      num_inference_steps: numInferenceSteps
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/text-to-video/lora",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.Ltx219BTextToVideo";
  static readonly title = "Ltx219 B Text To Video";
  static readonly description = `LTX-2 19B
video, generation, text-to-video, txt2vid`;
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
    description: "The prompt to generate the video from."
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
    default: "landscape_4_3",
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
    default: 3,
    description: "The guidance scale to use."
  })
  declare guidance_scale: any;

  @prop({
    type: "str",
    default:
      "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts.",
    description: "The negative prompt to generate the video from."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

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
    const videoSize = String(this.video_size ?? "landscape_4_3");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 121);
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);

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
      guidance_scale: guidanceScale,
      negative_prompt: negativePrompt,
      camera_lora_scale: cameraLoraScale,
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      num_inference_steps: numInferenceSteps
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ltx-2-19b/text-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Kandinsky5ProTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.Kandinsky5ProTextToVideo";
  static readonly title = "Kandinsky5 Pro Text To Video";
  static readonly description = `Kandinsky5 Pro
video, generation, text-to-video, txt2vid, professional`;
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

  @prop({
    type: "str",
    default: "5s",
    description: "The length of the video to generate (5s or 10s)"
  })
  declare duration: any;

  @prop({
    type: "int",
    default: 28,
    description: "The number of inference steps."
  })
  declare num_inference_steps: any;

  @prop({
    type: "enum",
    default: "3:2",
    values: ["3:2", "1:1", "2:3"],
    description: "Aspect ratio of the generated video. One of (3:2, 1:1, 2:3)."
  })
  declare aspect_ratio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "512P");
    const acceleration = String(this.acceleration ?? "regular");
    const duration = String(this.duration ?? "5s");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const aspectRatio = String(this.aspect_ratio ?? "3:2");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      acceleration: acceleration,
      duration: duration,
      num_inference_steps: numInferenceSteps,
      aspect_ratio: aspectRatio
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kandinsky5-pro/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV26TextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.WanV26TextToVideo";
  static readonly title = "Wan V26 Text To Video";
  static readonly description = `Wan v2.6 Text to Video
video, generation, text-to-video, txt2vid`;
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
      "The text prompt for video generation. Supports Chinese and English, max 800 characters. For multi-shot videos, use format: 'Overall description. First shot [0-3s] content. Second shot [3-5s] content.'"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10", "15"],
    description:
      "Duration of the generated video in seconds. Choose between 5, 10, or 15 seconds."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["720p", "1080p"],
    description:
      "Video resolution tier. Wan 2.6 T2V only supports 720p and 1080p (no 480p)."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    description:
      "The aspect ratio of the generated video. Wan 2.6 supports additional ratios."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: true,
    description: "If set to true, the safety checker will be enabled."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "\nURL of the audio to use as the background music. Must be publicly accessible.\nLimit handling: If the audio duration exceeds the duration value (5, 10, or 15 seconds),\nthe audio is truncated to the first N seconds, and the rest is discarded. If\nthe audio is shorter than the video, the remaining part of the video will be silent.\nFor example, if the audio is 3 seconds long and the video duration is 5 seconds, the\nfirst 3 seconds of the output video will have sound, and the last 2 seconds will be silent.\n- Format: WAV, MP3.\n- Duration: 3 to 30 s.\n- File size: Up to 15 MB.\n"
  })
  declare audio: any;

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
      "When true, enables intelligent multi-shot segmentation for coherent narrative videos. Only active when enable_prompt_expansion is True. Set to false for single-shot generation."
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
    description:
      "Whether to enable prompt rewriting using LLM. Improves results for short prompts but increases processing time."
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

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "wan/v2.6/text-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV26ProTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.KlingVideoV26ProTextToVideo";
  static readonly title = "Kling Video V26 Pro Text To Video";
  static readonly description = `Kling Video v2.6 Text to Video
video, generation, text-to-video, txt2vid, professional`;
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
    type: "bool",
    default: true,
    description:
      "Whether to generate native audio for the video. Supports Chinese and English voice output. Other languages are automatically translated to English. For English speech, use lowercase letters; for acronyms or proper nouns, use uppercase."
  })
  declare generate_audio: any;

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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? "5");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );
    const cfgScale = Number(this.cfg_scale ?? 0.5);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      duration: duration,
      generate_audio: generateAudio,
      negative_prompt: negativePrompt,
      cfg_scale: cfgScale
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/v2.6/pro/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV55TextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.PixverseV55TextToVideo";
  static readonly title = "Pixverse V55 Text To Video";
  static readonly description = `Pixverse
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

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
    type: "bool",
    default: false,
    description: "Enable multi-clip generation with dynamic camera changes"
  })
  declare generate_multi_clip_switch: any;

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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "720p");
    const style = String(this.style ?? "");
    const thinkingType = String(this.thinking_type ?? "");
    const duration = String(this.duration ?? "5");
    const generateMultiClipSwitch = Boolean(
      this.generate_multi_clip_switch ?? false
    );
    const generateAudioSwitch = Boolean(this.generate_audio_switch ?? false);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      style: style,
      thinking_type: thinkingType,
      duration: duration,
      generate_multi_clip_switch: generateMultiClipSwitch,
      generate_audio_switch: generateAudioSwitch,
      seed: seed,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/pixverse/v5.5/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx2TextToVideoFast extends FalNode {
  static readonly nodeType = "fal.text_to_video.Ltx2TextToVideoFast";
  static readonly title = "Ltx2 Text To Video Fast";
  static readonly description = `LTX Video 2.0 Fast
video, generation, text-to-video, txt2vid, fast`;
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
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2/text-to-video/fast",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx2TextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.Ltx2TextToVideo";
  static readonly title = "Ltx2 Text To Video";
  static readonly description = `LTX Video 2.0 Pro
video, generation, text-to-video, txt2vid`;
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
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ltx-2/text-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class HunyuanVideoV15TextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.HunyuanVideoV15TextToVideo";
  static readonly title = "Hunyuan Video V15 Text To Video";
  static readonly description = `Hunyuan Video V1.5
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video."
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
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/hunyuan-video-v1.5/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class InfinityStarTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.InfinityStarTextToVideo";
  static readonly title = "Infinity Star Text To Video";
  static readonly description = `Infinity Star
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for generating the video"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "1:1", "9:16"],
    description: "Aspect ratio of the generated output"
  })
  declare aspect_ratio: any;

  @prop({
    type: "float",
    default: 0.4,
    description: "Tau value for video scale"
  })
  declare tau_video: any;

  @prop({ type: "bool", default: true, description: "Whether to use APG" })
  declare use_apg: any;

  @prop({
    type: "float",
    default: 7.5,
    description: "Guidance scale for generation"
  })
  declare guidance_scale: any;

  @prop({ type: "int", default: 50, description: "Number of inference steps" })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. Leave empty for random generation."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to guide what to avoid in generation"
  })
  declare negative_prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to use an LLM to enhance the prompt."
  })
  declare enhance_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const tauVideo = Number(this.tau_video ?? 0.4);
    const useApg = Boolean(this.use_apg ?? true);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");
    const enhancePrompt = Boolean(this.enhance_prompt ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      tau_video: tauVideo,
      use_apg: useApg,
      guidance_scale: guidanceScale,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      negative_prompt: negativePrompt,
      enhance_prompt: enhancePrompt
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/infinity-star/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class SanaVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.SanaVideo";
  static readonly title = "Sana Video";
  static readonly description = `Sana Video
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    seed: "int",
    timings: "dict[str, any]",
    video: "video"
  };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt describing the video to generate."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p", "720p"],
    description: "The resolution of the output video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "4:3", "3:4", "1:1"],
    description:
      "The aspect ratio of the output video. Only used when resolution is '720p'."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: true,
    description: "Enable safety checking of the generated video."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: 16,
    description: "Frames per second for the output video."
  })
  declare frames_per_second: any;

  @prop({
    type: "int",
    default: 30,
    description: "Motion intensity score (higher = more motion)."
  })
  declare motion_score: any;

  @prop({
    type: "float",
    default: 6,
    description:
      "Guidance scale for generation (higher = more prompt adherence)."
  })
  declare guidance_scale: any;

  @prop({ type: "int", default: 28, description: "Number of denoising steps." })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 81,
    description: "Number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "str",
    default:
      "A chaotic sequence with misshapen, deformed limbs in heavy motion blur, sudden disappearance, jump cuts, jerky movements, rapid shot changes, frames out of sync, inconsistent character shapes, temporal artifacts, jitter, and ghosting effects, creating a disorienting visual experience.",
    description:
      "The negative prompt describing what to avoid in the generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducible generation. If not provided, a random seed will be used."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "480p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const framesPerSecond = Number(this.frames_per_second ?? 16);
    const motionScore = Number(this.motion_score ?? 30);
    const guidanceScale = Number(this.guidance_scale ?? 6);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const numFrames = Number(this.num_frames ?? 81);
    const negativePrompt = String(
      this.negative_prompt ??
        "A chaotic sequence with misshapen, deformed limbs in heavy motion blur, sudden disappearance, jump cuts, jerky movements, rapid shot changes, frames out of sync, inconsistent character shapes, temporal artifacts, jitter, and ghosting effects, creating a disorienting visual experience."
    );
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      enable_safety_checker: enableSafetyChecker,
      frames_per_second: framesPerSecond,
      motion_score: motionScore,
      guidance_scale: guidanceScale,
      num_inference_steps: numInferenceSteps,
      num_frames: numFrames,
      negative_prompt: negativePrompt,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sana-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LongcatVideoTextToVideo720P extends FalNode {
  static readonly nodeType = "fal.text_to_video.LongcatVideoTextToVideo720P";
  static readonly title = "Longcat Video Text To Video720 P";
  static readonly description = `LongCat Video
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
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
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "The aspect ratio of the generated video."
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
    const prompt = String(this.prompt ?? "");
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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
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
      aspect_ratio: aspectRatio,
      sync_mode: syncMode,
      video_quality: videoQuality,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/longcat-video/text-to-video/720p",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LongcatVideoTextToVideo480P extends FalNode {
  static readonly nodeType = "fal.text_to_video.LongcatVideoTextToVideo480P";
  static readonly title = "Longcat Video Text To Video480 P";
  static readonly description = `LongCat Video
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
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
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "The aspect ratio of the generated video."
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
    default: -1,
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 40,
    description:
      "The number of inference steps to use for the video generation."
  })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const syncMode = Boolean(this.sync_mode ?? false);
    const videoQuality = String(this.video_quality ?? "high");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const seed = Number(this.seed ?? -1);
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);

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
      aspect_ratio: aspectRatio,
      sync_mode: syncMode,
      video_quality: videoQuality,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      num_inference_steps: numInferenceSteps
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/longcat-video/text-to-video/480p",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LongcatVideoDistilledTextToVideo720P extends FalNode {
  static readonly nodeType =
    "fal.text_to_video.LongcatVideoDistilledTextToVideo720P";
  static readonly title = "Longcat Video Distilled Text To Video720 P";
  static readonly description = `LongCat Video Distilled
video, generation, text-to-video, txt2vid`;
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
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt to guide the video generation."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

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
    default: 162,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

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
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const prompt = String(this.prompt ?? "");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const fps = Number(this.fps ?? 30);
    const syncMode = Boolean(this.sync_mode ?? false);
    const numRefineInferenceSteps = Number(
      this.num_refine_inference_steps ?? 12
    );
    const videoQuality = String(this.video_quality ?? "high");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 162);
    const numInferenceSteps = Number(this.num_inference_steps ?? 12);
    const seed = Number(this.seed ?? -1);
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );

    const args: Record<string, unknown> = {
      video_write_mode: videoWriteMode,
      aspect_ratio: aspectRatio,
      prompt: prompt,
      video_output_type: videoOutputType,
      fps: fps,
      sync_mode: syncMode,
      num_refine_inference_steps: numRefineInferenceSteps,
      video_quality: videoQuality,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      enable_prompt_expansion: enablePromptExpansion
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/longcat-video/distilled/text-to-video/720p",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LongcatVideoDistilledTextToVideo480P extends FalNode {
  static readonly nodeType =
    "fal.text_to_video.LongcatVideoDistilledTextToVideo480P";
  static readonly title = "Longcat Video Distilled Text To Video480 P";
  static readonly description = `LongCat Video Distilled
video, generation, text-to-video, txt2vid`;
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
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt to guide the video generation."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

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
    default: 162,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

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
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const prompt = String(this.prompt ?? "");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const fps = Number(this.fps ?? 15);
    const syncMode = Boolean(this.sync_mode ?? false);
    const videoQuality = String(this.video_quality ?? "high");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 162);
    const numInferenceSteps = Number(this.num_inference_steps ?? 12);
    const seed = Number(this.seed ?? -1);
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );

    const args: Record<string, unknown> = {
      video_write_mode: videoWriteMode,
      aspect_ratio: aspectRatio,
      prompt: prompt,
      video_output_type: videoOutputType,
      fps: fps,
      sync_mode: syncMode,
      video_quality: videoQuality,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      enable_prompt_expansion: enablePromptExpansion
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/longcat-video/distilled/text-to-video/480p",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MinimaxHailuo23StandardTextToVideo extends FalNode {
  static readonly nodeType =
    "fal.text_to_video.MinimaxHailuo23StandardTextToVideo";
  static readonly title = "Minimax Hailuo23 Standard Text To Video";
  static readonly description = `MiniMax Hailuo 2.3 [Standard] (Text to Video)
video, generation, text-to-video, txt2vid, professional`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
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
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/minimax/hailuo-2.3/standard/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MinimaxHailuo23ProTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.MinimaxHailuo23ProTextToVideo";
  static readonly title = "Minimax Hailuo23 Pro Text To Video";
  static readonly description = `MiniMax Hailuo 2.3 [Pro] (Text to Video)
video, generation, text-to-video, txt2vid, professional`;
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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      prompt_optimizer: promptOptimizer
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/minimax/hailuo-2.3/pro/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ViduQ2TextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.ViduQ2TextToVideo";
  static readonly title = "Vidu Q2 Text To Video";
  static readonly description = `Vidu
video, generation, text-to-video, txt2vid`;
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
    values: ["360p", "520p", "720p", "1080p"],
    description: "Output video resolution"
  })
  declare resolution: any;

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
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/vidu/q2/text-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KreaWan14BTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.KreaWan14BTextToVideo";
  static readonly title = "Krea Wan14 B Text To Video";
  static readonly description = `Krea Wan 14b- Text to Video
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "Prompt for the video-to-video generation."
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "int",
    default: 78,
    description:
      "Number of frames to generate. Must be a multiple of 12 plus 6, for example 6, 18, 30, 42, etc."
  })
  declare num_frames: any;

  @prop({
    type: "str",
    default: "",
    description: "Seed for the video-to-video generation."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const numFrames = Number(this.num_frames ?? 78);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      enable_prompt_expansion: enablePromptExpansion,
      num_frames: numFrames,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/krea-wan-14b/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanAlpha extends FalNode {
  static readonly nodeType = "fal.text_to_video.WanAlpha";
  static readonly title = "Wan Alpha";
  static readonly description = `Wan Alpha
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    image: "image",
    seed: "int",
    mask: "image",
    video: "video"
  };

  @prop({
    type: "float",
    default: 10.5,
    description: "The shift of the generated video."
  })
  declare shift: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt to guide the video generation."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.75,
    description: "The upper bound of the mask clamping."
  })
  declare mask_clamp_upper: any;

  @prop({
    type: "int",
    default: 16,
    description: "The frame rate of the generated video."
  })
  declare fps: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: 81,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 0.1,
    description: "The lower bound of the mask clamping."
  })
  declare mask_clamp_lower: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "The threshold for mask binarization. When binarize_mask is True, this threshold will be used to binarize the mask. This will also be used for transparency when the output type is '.webm'."
  })
  declare mask_binarization_threshold: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to binarize the mask."
  })
  declare binarize_mask: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["240p", "360p", "480p", "580p", "720p"],
    description: "The resolution of the generated video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "VP9 (.webm)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "1:1", "9:16"],
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "euler",
    values: ["unipc", "dpm++", "euler"],
    description: "The sampler to use."
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
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 8,
    description: "The number of inference steps to use."
  })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const shift = Number(this.shift ?? 10.5);
    const prompt = String(this.prompt ?? "");
    const maskClampUpper = Number(this.mask_clamp_upper ?? 0.75);
    const fps = Number(this.fps ?? 16);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 81);
    const maskClampLower = Number(this.mask_clamp_lower ?? 0.1);
    const maskBinarizationThreshold = Number(
      this.mask_binarization_threshold ?? 0.8
    );
    const binarizeMask = Boolean(this.binarize_mask ?? false);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const resolution = String(this.resolution ?? "480p");
    const videoOutputType = String(this.video_output_type ?? "VP9 (.webm)");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const sampler = String(this.sampler ?? "euler");
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 8);

    const args: Record<string, unknown> = {
      shift: shift,
      prompt: prompt,
      mask_clamp_upper: maskClampUpper,
      fps: fps,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      mask_clamp_lower: maskClampLower,
      mask_binarization_threshold: maskBinarizationThreshold,
      binarize_mask: binarizeMask,
      video_write_mode: videoWriteMode,
      resolution: resolution,
      video_output_type: videoOutputType,
      aspect_ratio: aspectRatio,
      sampler: sampler,
      video_quality: videoQuality,
      sync_mode: syncMode,
      enable_prompt_expansion: enablePromptExpansion,
      seed: seed,
      num_inference_steps: numInferenceSteps
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-alpha", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Kandinsky5TextToVideoDistill extends FalNode {
  static readonly nodeType = "fal.text_to_video.Kandinsky5TextToVideoDistill";
  static readonly title = "Kandinsky5 Text To Video Distill";
  static readonly description = `Kandinsky5
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "768x512",
    description:
      "Resolution of the generated video in W:H format. Will be calculated based on the aspect ratio(768x512, 512x512, 512x768)."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "3:2",
    values: ["3:2", "1:1", "2:3"],
    description: "Aspect ratio of the generated video. One of (3:2, 1:1, 2:3)."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "5s",
    values: ["5s", "10s"],
    description: "The length of the video to generate (5s or 10s)"
  })
  declare duration: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "768x512");
    const aspectRatio = String(this.aspect_ratio ?? "3:2");
    const duration = String(this.duration ?? "5s");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      duration: duration
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kandinsky5/text-to-video/distill",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Kandinsky5TextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.Kandinsky5TextToVideo";
  static readonly title = "Kandinsky5 Text To Video";
  static readonly description = `Kandinsky5
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to guide video generation."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "768x512",
    description:
      "Resolution of the generated video in W:H format. Will be calculated based on the aspect ratio(768x512, 512x512, 512x768)."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "3:2",
    values: ["3:2", "1:1", "2:3"],
    description: "Aspect ratio of the generated video. One of (3:2, 1:1, 2:3)."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "5s",
    values: ["5s", "10s"],
    description: "The length of the video to generate (5s or 10s)"
  })
  declare duration: any;

  @prop({
    type: "int",
    default: 30,
    description: "The number of inference steps."
  })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "768x512");
    const aspectRatio = String(this.aspect_ratio ?? "3:2");
    const duration = String(this.duration ?? "5s");
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      duration: duration,
      num_inference_steps: numInferenceSteps
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kandinsky5/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Veo31Fast extends FalNode {
  static readonly nodeType = "fal.text_to_video.Veo31Fast";
  static readonly title = "Veo31 Fast";
  static readonly description = `Veo 3.1 Fast
video, generation, text-to-video, txt2vid, fast`;
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
    default: true,
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
    default: "16:9",
    values: ["16:9", "9:16"],
    description: "Aspect ratio of the generated video"
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
    const autoFix = Boolean(this.auto_fix ?? true);
    const duration = String(this.duration ?? "8s");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
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
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/veo3.1/fast", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Veo31 extends FalNode {
  static readonly nodeType = "fal.text_to_video.Veo31";
  static readonly title = "Veo31";
  static readonly description = `Veo 3.1
video, generation, text-to-video, txt2vid`;
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
    default: true,
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
    default: "16:9",
    values: ["16:9", "9:16"],
    description: "Aspect ratio of the generated video"
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
    const autoFix = Boolean(this.auto_fix ?? true);
    const duration = String(this.duration ?? "8s");
    const generateAudio = Boolean(this.generate_audio ?? true);
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
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
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/veo3.1", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Sora2TextToVideoPro extends FalNode {
  static readonly nodeType = "fal.text_to_video.Sora2TextToVideoPro";
  static readonly title = "Sora2 Text To Video Pro";
  static readonly description = `Sora 2
video, generation, text-to-video, txt2vid, professional`;
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
    default: "16:9",
    values: ["9:16", "16:9"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Up to two character IDs (from create-character) to use in the video. Refer to characters by name in the prompt. When set, only the OpenAI provider is used."
  })
  declare character_ids: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["720p", "1080p", "true_1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: 4,
    values: [4, 8, 12, 16, 20],
    description: "Duration of the generated video in seconds"
  })
  declare duration: any;

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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const characterIds = String(this.character_ids ?? "");
    const resolution = String(this.resolution ?? "1080p");
    const duration = String(this.duration ?? 4);
    const deleteVideo = Boolean(this.delete_video ?? true);
    const detectAndBlockIp = Boolean(this.detect_and_block_ip ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      character_ids: characterIds,
      resolution: resolution,
      duration: duration,
      delete_video: deleteVideo,
      detect_and_block_ip: detectAndBlockIp
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/sora-2/text-to-video/pro",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Sora2TextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.Sora2TextToVideo";
  static readonly title = "Sora2 Text To Video";
  static readonly description = `Sora 2
video, generation, text-to-video, txt2vid`;
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
    default: "16:9",
    values: ["9:16", "16:9"],
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
    type: "str",
    default: "720p",
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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? 4);
    const resolution = String(this.resolution ?? "720p");
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
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sora-2/text-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ovi extends FalNode {
  static readonly nodeType = "fal.text_to_video.Ovi";
  static readonly title = "Ovi";
  static readonly description = `Ovi Text to Video
video, generation, text-to-video, txt2vid`;
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
    default: "992x512",
    values: [
      "512x992",
      "992x512",
      "960x512",
      "512x960",
      "720x720",
      "448x1120",
      "1120x448"
    ],
    description:
      "Resolution of the generated video in W:H format. One of (512x992, 992x512, 960x512, 512x960, 720x720, or 448x1120)."
  })
  declare resolution: any;

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
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "992x512");
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const audioNegativePrompt = String(
      this.audio_negative_prompt ?? "robotic, muffled, echo, distorted"
    );
    const negativePrompt = String(
      this.negative_prompt ?? "jitter, bad hands, blur, distortion"
    );
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      num_inference_steps: numInferenceSteps,
      audio_negative_prompt: audioNegativePrompt,
      negative_prompt: negativePrompt,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ovi", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Wan25PreviewTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.Wan25PreviewTextToVideo";
  static readonly title = "Wan25 Preview Text To Video";
  static readonly description = `Wan 2.5 Text to Video
video, generation, text-to-video, txt2vid`;
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
      "The text prompt for video generation. Supports Chinese and English, max 800 characters."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["480p", "720p", "1080p"],
    description: "Video resolution tier"
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    description:
      "Duration of the generated video in seconds. Choose between 5 or 10 seconds."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "The aspect ratio of the generated video"
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
      "Whether to enable prompt rewriting using LLM. Improves results for short prompts but increases processing time."
  })
  declare enable_prompt_expansion: any;

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
      "\nURL of the audio to use as the background music. Must be publicly accessible.\nLimit handling: If the audio duration exceeds the duration value (5 or 10 seconds),\nthe audio is truncated to the first 5 or 10 seconds, and the rest is discarded. If\nthe audio is shorter than the video, the remaining part of the video will be silent.\nFor example, if the audio is 3 seconds long and the video duration is 5 seconds, the\nfirst 3 seconds of the output video will have sound, and the last 2 seconds will be silent.\n- Format: WAV, MP3.\n- Duration: 3 to 30 s.\n- File size: Up to 15 MB.\n"
  })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "1080p");
    const duration = String(this.duration ?? "5");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      duration: duration,
      aspect_ratio: aspectRatio,
      enable_safety_checker: enableSafetyChecker,
      seed: seed,
      enable_prompt_expansion: enablePromptExpansion,
      negative_prompt: negativePrompt
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan-25-preview/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV5TextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.PixverseV5TextToVideo";
  static readonly title = "Pixverse V5 Text To Video";
  static readonly description = `Pixverse
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

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
    description: "The style of the generated video"
  })
  declare style: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8"],
    description:
      "The duration of the generated video in seconds. 8s videos cost double. 1080p videos are limited to 5 seconds"
  })
  declare duration: any;

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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const style = String(this.style ?? "");
    const duration = String(this.duration ?? "5");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      style: style,
      duration: duration,
      seed: seed,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/pixverse/v5/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class InfinitalkSingleText extends FalNode {
  static readonly nodeType = "fal.text_to_video.InfinitalkSingleText";
  static readonly title = "Infinitalk Single Text";
  static readonly description = `Infinitalk
video, generation, text-to-video, txt2vid`;
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
    const textInput = String(this.text_input ?? "");
    const voice = String(this.voice ?? "");
    const numFrames = Number(this.num_frames ?? 145);
    const seed = Number(this.seed ?? 42);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      acceleration: acceleration,
      text_input: textInput,
      voice: voice,
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

    const res = await falSubmit(apiKey, "fal-ai/infinitalk/single-text", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MoonvalleyMareyT2V extends FalNode {
  static readonly nodeType = "fal.text_to_video.MoonvalleyMareyT2V";
  static readonly title = "Moonvalley Marey T2 V";
  static readonly description = `Marey Realism V1.5
video, generation, text-to-video, txt2vid`;
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
    type: "enum",
    default: "1920x1080",
    values: ["1920x1080", "1152x1152", "1536x1152", "1152x1536"],
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
    removeNulls(args);

    const res = await falSubmit(apiKey, "moonvalley/marey/t2v", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV22A14bTextToVideoLora extends FalNode {
  static readonly nodeType = "fal.text_to_video.WanV22A14bTextToVideoLora";
  static readonly title = "Wan V22 A14b Text To Video Lora";
  static readonly description = `Wan-2.2 text-to-video is a video model that generates high-quality videos with high visual quality and motion diversity from text prompts. This endpoint supports LoRAs made for Wan 2.2.
video, generation, text-to-video, txt2vid, lora`;
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
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "Aspect ratio of the generated video (16:9 or 9:16)."
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
    const shift = Number(this.shift ?? 5);
    const reverseVideo = Boolean(this.reverse_video ?? false);
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 1);
    const acceleration = String(this.acceleration ?? "regular");
    const loras = String(this.loras ?? []);
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const numFrames = Number(this.num_frames ?? 81);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(this.negative_prompt ?? "");
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "720p");
    const enableOutputSafetyChecker = Boolean(
      this.enable_output_safety_checker ?? false
    );
    const guidanceScale_2 = Number(this.guidance_scale_2 ?? 4);
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
      shift: shift,
      reverse_video: reverseVideo,
      num_interpolated_frames: numInterpolatedFrames,
      acceleration: acceleration,
      loras: loras,
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
      video_quality: videoQuality,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps,
      interpolator_model: interpolatorModel,
      adjust_fps_for_interpolation: adjustFpsForInterpolation,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan/v2.2-a14b/text-to-video/lora",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV225bTextToVideoDistill extends FalNode {
  static readonly nodeType = "fal.text_to_video.WanV225bTextToVideoDistill";
  static readonly title = "Wan V225b Text To Video Distill";
  static readonly description = `Wan 2.2's 5B distill model produces up to 5 seconds of video 720p at 24FPS with fluid motion and powerful prompt understanding
video, generation, text-to-video, txt2vid`;
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
    type: "float",
    default: 1,
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
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description:
      "The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "Aspect ratio of the generated video (16:9 or 9:16)."
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
    const guidanceScale = Number(this.guidance_scale ?? 1);
    const numFrames = Number(this.num_frames ?? 81);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
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
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      enable_safety_checker: enableSafetyChecker,
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
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan/v2.2-5b/text-to-video/distill",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV225bTextToVideoFastWan extends FalNode {
  static readonly nodeType = "fal.text_to_video.WanV225bTextToVideoFastWan";
  static readonly title = "Wan V225b Text To Video Fast Wan";
  static readonly description = `Wan 2.2's 5B FastVideo model produces up to 5 seconds of video 720p at 24FPS with fluid motion and powerful prompt understanding
video, generation, text-to-video, txt2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

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
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "Aspect ratio of the generated video (16:9 or 9:16)."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "580p", "720p"],
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
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 0);
    const framesPerSecond = String(this.frames_per_second ?? 24);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const numFrames = Number(this.num_frames ?? 81);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const negativePrompt = String(this.negative_prompt ?? "");
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "720p");
    const enableOutputSafetyChecker = Boolean(
      this.enable_output_safety_checker ?? false
    );
    const videoQuality = String(this.video_quality ?? "high");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const seed = String(this.seed ?? "");
    const interpolatorModel = String(this.interpolator_model ?? "film");
    const adjustFpsForInterpolation = Boolean(
      this.adjust_fps_for_interpolation ?? true
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
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
      seed: seed,
      interpolator_model: interpolatorModel,
      adjust_fps_for_interpolation: adjustFpsForInterpolation
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan/v2.2-5b/text-to-video/fast-wan",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV22A14bTextToVideoTurbo extends FalNode {
  static readonly nodeType = "fal.text_to_video.WanV22A14bTextToVideoTurbo";
  static readonly title = "Wan V22 A14b Text To Video Turbo";
  static readonly description = `Wan-2.2 turbo text-to-video is a video model that generates high-quality videos with high visual quality and motion diversity from text prompts. 
video, generation, text-to-video, txt2vid, fast`;
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
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "Aspect ratio of the generated video (16:9 or 9:16)."
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
    default: "720p",
    values: ["480p", "580p", "720p"],
    description: "Resolution of the generated video (480p, 580p, or 720p)."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description:
      "The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size."
  })
  declare video_write_mode: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If set to true, output video will be checked for safety after generation."
  })
  declare enable_output_safety_checker: any;

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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const acceleration = String(this.acceleration ?? "regular");
    const resolution = String(this.resolution ?? "720p");
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
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
      resolution: resolution,
      video_write_mode: videoWriteMode,
      enable_output_safety_checker: enableOutputSafetyChecker,
      video_quality: videoQuality,
      enable_safety_checker: enableSafetyChecker,
      seed: seed,
      enable_prompt_expansion: enablePromptExpansion
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan/v2.2-a14b/text-to-video/turbo",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV225bTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.WanV225bTextToVideo";
  static readonly title = "Wan V225b Text To Video";
  static readonly description = `Wan 2.2's 5B model produces up to 5 seconds of video 720p at 24FPS with fluid motion and powerful prompt understanding
video, generation, text-to-video, txt2vid`;
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
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "Aspect ratio of the generated video (16:9 or 9:16)."
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
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const numFrames = Number(this.num_frames ?? 81);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(this.negative_prompt ?? "");
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
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
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      enable_safety_checker: enableSafetyChecker,
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
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan/v2.2-5b/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV22A14bTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.WanV22A14bTextToVideo";
  static readonly title = "Wan V22 A14b Text To Video";
  static readonly description = `Wan-2.2 text-to-video is a video model that generates high-quality videos with high visual quality and motion diversity from text prompts. 
video, generation, text-to-video, txt2vid`;
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
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "Aspect ratio of the generated video (16:9 or 9:16)."
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
    const shift = Number(this.shift ?? 5);
    const numInterpolatedFrames = Number(this.num_interpolated_frames ?? 1);
    const acceleration = String(this.acceleration ?? "regular");
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const numFrames = Number(this.num_frames ?? 81);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(this.negative_prompt ?? "");
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "720p");
    const enableOutputSafetyChecker = Boolean(
      this.enable_output_safety_checker ?? false
    );
    const guidanceScale_2 = Number(this.guidance_scale_2 ?? 4);
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
      shift: shift,
      num_interpolated_frames: numInterpolatedFrames,
      acceleration: acceleration,
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
      video_quality: videoQuality,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps,
      interpolator_model: interpolatorModel,
      adjust_fps_for_interpolation: adjustFpsForInterpolation,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan/v2.2-a14b/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltxv13b098Distilled extends FalNode {
  static readonly nodeType = "fal.text_to_video.Ltxv13b098Distilled";
  static readonly title = "Ltxv13b098 Distilled";
  static readonly description = `Generate long videos from prompts using LTX Video-0.9.8 13B Distilled and custom LoRA
video, generation, text-to-video, txt2vid`;
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
    default: "16:9",
    values: ["9:16", "1:1", "16:9"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "The compression ratio for tone mapping. This is used to compress the dynamic range of the video to improve visual quality. A value of 0.0 means no compression, while a value of 1.0 means maximum compression."
  })
  declare tone_map_compression_ratio: any;

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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const toneMapCompressionRatio = Number(
      this.tone_map_compression_ratio ?? 0
    );
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
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ltxv-13b-098-distilled", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MinimaxHailuo02ProTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.MinimaxHailuo02ProTextToVideo";
  static readonly title = "Minimax Hailuo02 Pro Text To Video";
  static readonly description = `MiniMax Hailuo-02 Text To Video API (Pro, 1080p): Advanced video generation model with 1080p resolution
video, generation, text-to-video, txt2vid`;
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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      prompt_optimizer: promptOptimizer
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/minimax/hailuo-02/pro/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class BytedanceSeedanceV1ProTextToVideo extends FalNode {
  static readonly nodeType =
    "fal.text_to_video.BytedanceSeedanceV1ProTextToVideo";
  static readonly title = "Bytedance Seedance V1 Pro Text To Video";
  static readonly description = `Seedance 1.0 Pro, a high quality video generation model developed by Bytedance.
video, generation, text-to-video, txt2vid`;
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
    default: "16:9",
    values: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
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
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/bytedance/seedance/v1/pro/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class BytedanceSeedanceV1LiteTextToVideo extends FalNode {
  static readonly nodeType =
    "fal.text_to_video.BytedanceSeedanceV1LiteTextToVideo";
  static readonly title = "Bytedance Seedance V1 Lite Text To Video";
  static readonly description = `Seedance 1.0 Lite
video, generation, text-to-video, txt2vid`;
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
    default: "16:9",
    values: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "9:21"],
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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
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
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/bytedance/seedance/v1/lite/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV21MasterTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.KlingVideoV21MasterTextToVideo";
  static readonly title = "Kling Video V21 Master Text To Video";
  static readonly description = `Kling 2.1 Master: The premium endpoint for Kling 2.1, designed for top-tier text-to-video generation with unparalleled motion fluidity, cinematic visuals, and exceptional prompt precision.
video, generation, text-to-video, txt2vid`;
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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? "5");
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );
    const cfgScale = Number(this.cfg_scale ?? 0.5);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      duration: duration,
      negative_prompt: negativePrompt,
      cfg_scale: cfgScale
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/v2.1/master/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LtxVideo13bDev extends FalNode {
  static readonly nodeType = "fal.text_to_video.LtxVideo13bDev";
  static readonly title = "Ltx Video13b Dev";
  static readonly description = `Generate videos from prompts using LTX Video-0.9.7 13B and custom LoRA
video, generation, text-to-video, txt2vid`;
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
    default: "16:9",
    values: ["9:16", "1:1", "16:9"],
    description: "Aspect ratio of the generated video."
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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "720p");
    const toneMapCompressionRatio = Number(
      this.tone_map_compression_ratio ?? 0
    );
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
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ltx-video-13b-dev", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LtxVideo13bDistilled extends FalNode {
  static readonly nodeType = "fal.text_to_video.LtxVideo13bDistilled";
  static readonly title = "Ltx Video13b Distilled";
  static readonly description = `Generate videos from prompts using LTX Video-0.9.7 13B Distilled and custom LoRA
video, generation, text-to-video, txt2vid`;
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
    default: "16:9",
    values: ["9:16", "1:1", "16:9"],
    description: "Aspect ratio of the generated video."
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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "720p");
    const toneMapCompressionRatio = Number(
      this.tone_map_compression_ratio ?? 0
    );
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
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ltx-video-13b-distilled", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV45TextToVideoFast extends FalNode {
  static readonly nodeType = "fal.text_to_video.PixverseV45TextToVideoFast";
  static readonly title = "Pixverse V45 Text To Video Fast";
  static readonly description = `Generate high quality and fast video clips from text and image prompts using PixVerse v4.5 fast
video, generation, text-to-video, txt2vid, fast`;
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
    type: "enum",
    default: "16:9",
    values: ["16:9", "4:3", "1:1", "3:4", "9:16"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const style = String(this.style ?? "");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      style: style,
      seed: seed,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/pixverse/v4.5/text-to-video/fast",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV45TextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.PixverseV45TextToVideo";
  static readonly title = "Pixverse V45 Text To Video";
  static readonly description = `Generate high quality video clips from text and image prompts using PixVerse v4.5
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

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
    description: "The style of the generated video"
  })
  declare style: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8"],
    description:
      "The duration of the generated video in seconds. 8s videos cost double. 1080p videos are limited to 5 seconds"
  })
  declare duration: any;

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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const style = String(this.style ?? "");
    const duration = String(this.duration ?? "5");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      style: style,
      duration: duration,
      seed: seed,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/pixverse/v4.5/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ViduQ1TextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.ViduQ1TextToVideo";
  static readonly title = "Vidu Q1 Text To Video";
  static readonly description = `Vidu Q1 Text to Video generates high-quality 1080p videos with exceptional visual quality and motion diversity
video, generation, text-to-video, txt2vid`;
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
    type: "enum",
    default: "general",
    values: ["general", "anime"],
    description: "The style of output video"
  })
  declare style: any;

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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const style = String(this.style ?? "general");
    const seed = String(this.seed ?? "");
    const movementAmplitude = String(this.movement_amplitude ?? "auto");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      style: style,
      seed: seed,
      movement_amplitude: movementAmplitude
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/vidu/q1/text-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Magi extends FalNode {
  static readonly nodeType = "fal.text_to_video.Magi";
  static readonly title = "Magi";
  static readonly description = `MAGI-1 is a video generation model with exceptional understanding of physical interactions and cinematic prompts
video, generation, text-to-video, txt2vid`;
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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = String(this.num_frames ?? 96);
    const numInferenceSteps = String(this.num_inference_steps ?? 16);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      num_inference_steps: numInferenceSteps,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/magi", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MagiDistilled extends FalNode {
  static readonly nodeType = "fal.text_to_video.MagiDistilled";
  static readonly title = "Magi Distilled";
  static readonly description = `MAGI-1 distilled is a faster video generation model with exceptional understanding of physical interactions and cinematic prompts
video, generation, text-to-video, txt2vid`;
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
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: 16,
    values: [4, 8, 16, 32],
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const resolution = String(this.resolution ?? "720p");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = String(this.num_frames ?? 96);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = String(this.num_inference_steps ?? 16);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      seed: seed,
      num_inference_steps: numInferenceSteps
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/magi-distilled", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV4TextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.PixverseV4TextToVideo";
  static readonly title = "Pixverse V4 Text To Video";
  static readonly description = `Generate high quality video clips from text and image prompts using PixVerse v4
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

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
    description: "The style of the generated video"
  })
  declare style: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8"],
    description:
      "The duration of the generated video in seconds. 8s videos cost double. 1080p videos are limited to 5 seconds"
  })
  declare duration: any;

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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const style = String(this.style ?? "");
    const duration = String(this.duration ?? "5");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      style: style,
      duration: duration,
      seed: seed,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/pixverse/v4/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV4TextToVideoFast extends FalNode {
  static readonly nodeType = "fal.text_to_video.PixverseV4TextToVideoFast";
  static readonly title = "Pixverse V4 Text To Video Fast";
  static readonly description = `Generate high quality and fast video clips from text and image prompts using PixVerse v4 fast
video, generation, text-to-video, txt2vid, fast`;
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
    type: "enum",
    default: "16:9",
    values: ["16:9", "4:3", "1:1", "3:4", "9:16"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const style = String(this.style ?? "");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      style: style,
      seed: seed,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/pixverse/v4/text-to-video/fast",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoLipsyncAudioToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.KlingVideoLipsyncAudioToVideo";
  static readonly title = "Kling Video Lipsync Audio To Video";
  static readonly description = `Kling LipSync is an audio-to-video model that generates realistic lip movements from audio input.
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "video",
    default: "",
    description:
      "The URL of the video to generate the lip sync for. Supports .mp4/.mov, ≤100MB, 2–10s, 720p/1080p only, width/height 720–1920px."
  })
  declare video: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "The URL of the audio to generate the lip sync for. Minimum duration is 2s and maximum duration is 60s. Maximum file size is 5MB."
  })
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

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/lipsync/audio-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoLipsyncTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.KlingVideoLipsyncTextToVideo";
  static readonly title = "Kling Video Lipsync Text To Video";
  static readonly description = `Kling LipSync is a text-to-video model that generates realistic lip movements from text input.
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Text content for lip-sync video generation. Max 120 characters."
  })
  declare text: any;

  @prop({
    type: "video",
    default: "",
    description:
      "The URL of the video to generate the lip sync for. Supports .mp4/.mov, ≤100MB, 2-60s, 720p/1080p only, width/height 720–1920px. If validation fails, an error is returned."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "genshin_vindi2",
      "zhinen_xuesheng",
      "AOT",
      "ai_shatang",
      "genshin_klee2",
      "genshin_kirara",
      "ai_kaiya",
      "oversea_male1",
      "ai_chenjiahao_712",
      "girlfriend_4_speech02",
      "chat1_female_new-3",
      "chat_0407_5-1",
      "cartoon-boy-07",
      "uk_boy1",
      "cartoon-girl-01",
      "PeppaPig_platform",
      "ai_huangzhong_712",
      "ai_huangyaoshi_712",
      "ai_laoguowang_712",
      "chengshu_jiejie",
      "you_pingjing",
      "calm_story1",
      "uk_man2",
      "laopopo_speech02",
      "heainainai_speech02",
      "reader_en_m-v1",
      "commercial_lady_en_f-v1",
      "tiyuxi_xuedi",
      "tiexin_nanyou",
      "girlfriend_1_speech02",
      "girlfriend_2_speech02",
      "zhuxi_speech02",
      "uk_oldman3",
      "dongbeilaotie_speech02",
      "chongqingxiaohuo_speech02",
      "chuanmeizi_speech02",
      "chaoshandashu_speech02",
      "ai_taiwan_man2_speech02",
      "xianzhanggui_speech02",
      "tianjinjiejie_speech02",
      "diyinnansang_DB_CN_M_04-v2",
      "yizhipiannan-v1",
      "guanxiaofang-v2",
      "tianmeixuemei-v1",
      "daopianyansang-v1",
      "mengwa-v1"
    ],
    description: "Voice ID to use for speech synthesis"
  })
  declare voice_id: any;

  @prop({
    type: "float",
    default: 1,
    description: "Speech rate for Text to Video generation"
  })
  declare voice_speed: any;

  @prop({
    type: "enum",
    default: "en",
    values: ["zh", "en"],
    description: "The voice language corresponding to the Voice ID"
  })
  declare voice_language: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const text = String(this.text ?? "");
    const voiceId = String(this.voice_id ?? "");
    const voiceSpeed = Number(this.voice_speed ?? 1);
    const voiceLanguage = String(this.voice_language ?? "en");

    const args: Record<string, unknown> = {
      text: text,
      voice_id: voiceId,
      voice_speed: voiceSpeed,
      voice_language: voiceLanguage
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/lipsync/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanT2vLora extends FalNode {
  static readonly nodeType = "fal.text_to_video.WanT2vLora";
  static readonly title = "Wan T2v Lora";
  static readonly description = `Add custom LoRAs to Wan-2.1 is a text-to-video model that generates high-quality videos with high visual quality and motion diversity from images
video, generation, text-to-video, txt2vid, lora`;
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
    default: "16:9",
    values: ["9:16", "16:9"],
    description: "Aspect ratio of the generated video (16:9 or 9:16)."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "If true, the video will be reversed."
  })
  declare reverse_video: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p", "580p", "720p"],
    description: "Resolution of the generated video (480p, 580p, or 720p)."
  })
  declare resolution: any;

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
    type: "int",
    default: 30,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: 81,
    description:
      "Number of frames to generate. Must be between 81 to 100 (inclusive)."
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
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const reverseVideo = Boolean(this.reverse_video ?? false);
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const resolution = String(this.resolution ?? "480p");
    const loras = String(this.loras ?? []);
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const turboMode = Boolean(this.turbo_mode ?? true);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const numFrames = String(this.num_frames ?? 81);
    const negativePrompt = String(
      this.negative_prompt ??
        "bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      reverse_video: reverseVideo,
      enable_prompt_expansion: enablePromptExpansion,
      resolution: resolution,
      loras: loras,
      frames_per_second: framesPerSecond,
      turbo_mode: turboMode,
      enable_safety_checker: enableSafetyChecker,
      num_inference_steps: numInferenceSteps,
      num_frames: numFrames,
      negative_prompt: negativePrompt,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-t2v-lora", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LumaDreamMachineRay2Flash extends FalNode {
  static readonly nodeType = "fal.text_to_video.LumaDreamMachineRay2Flash";
  static readonly title = "Luma Dream Machine Ray2 Flash";
  static readonly description = `Ray2 Flash is a fast video generative model capable of creating realistic visuals with natural, coherent motion.
video, generation, text-to-video, txt2vid`;
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
    type: "enum",
    default: "540p",
    values: ["540p", "720p", "1080p"],
    description:
      "The resolution of the generated video (720p costs 2x more, 1080p costs 4x more)"
  })
  declare resolution: any;

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
    description: "The duration of the generated video (9s costs 2x more)"
  })
  declare duration: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "540p");
    const loop = Boolean(this.loop ?? false);
    const duration = String(this.duration ?? "5s");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      loop: loop,
      duration: duration
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/luma-dream-machine/ray-2-flash",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PikaV21TextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.PikaV21TextToVideo";
  static readonly title = "Pika V21 Text To Video";
  static readonly description = `Start with a simple text input to create dynamic generations that defy expectations. Anything you dream can come to life with sharp details, impressive character control and cinematic camera moves.
video, generation, text-to-video, txt2vid`;
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
    default: "16:9",
    values: ["16:9", "9:16", "1:1", "4:5", "5:4", "3:2", "2:3"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = Number(this.duration ?? 5);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      duration: duration,
      seed: seed,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/pika/v2.1/text-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PikaV22TextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.PikaV22TextToVideo";
  static readonly title = "Pika V22 Text To Video";
  static readonly description = `Start with a simple text input to create dynamic generations that defy expectations in up to 1080p. Experience better image clarity and crisper, sharper visuals.
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["1080p", "720p"],
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
    type: "str",
    default: "",
    description: "The seed for the random number generator"
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "ugly, bad, terrible",
    description: "A negative prompt to guide the model"
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? 5);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(
      this.negative_prompt ?? "ugly, bad, terrible"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      duration: duration,
      seed: seed,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/pika/v2.2/text-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PikaV2TurboTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.PikaV2TurboTextToVideo";
  static readonly title = "Pika V2 Turbo Text To Video";
  static readonly description = `Pika v2 Turbo creates videos from a text prompt with high quality output.
video, generation, text-to-video, txt2vid, fast`;
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
    default: "16:9",
    values: ["16:9", "9:16", "1:1", "4:5", "5:4", "3:2", "2:3"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = Number(this.duration ?? 5);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      duration: duration,
      seed: seed,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/pika/v2/turbo/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanProTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.WanProTextToVideo";
  static readonly title = "Wan Pro Text To Video";
  static readonly description = `Wan-2.1 Pro is a premium text-to-video model that generates high-quality 1080p videos at 30fps with up to 6 seconds duration, delivering exceptional visual quality and motion diversity from text prompts
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker"
  })
  declare enable_safety_checker: any;

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
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      enable_safety_checker: enableSafetyChecker,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-pro/text-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV16ProEffects extends FalNode {
  static readonly nodeType = "fal.text_to_video.KlingVideoV16ProEffects";
  static readonly title = "Kling Video V16 Pro Effects";
  static readonly description = `Generate video clips from your prompts using Kling 1.6 (pro)
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

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
      "URL of images to be used for hug, kiss or heart_gesture video."
  })
  declare input_images: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "hug",
      "kiss",
      "heart_gesture",
      "squish",
      "expansion",
      "fuzzyfuzzy",
      "bloombloom",
      "dizzydizzy",
      "jelly_press",
      "jelly_slice",
      "jelly_squish",
      "jelly_jiggle",
      "pixelpixel",
      "yearbook",
      "instant_film",
      "anime_figure",
      "rocketrocket",
      "fly_fly",
      "disappear",
      "lightning_power",
      "bullet_time",
      "bullet_time_360",
      "media_interview",
      "day_to_night",
      "let's_ride",
      "jumpdrop",
      "swish_swish",
      "running_man",
      "jazz_jazz",
      "swing_swing",
      "skateskate",
      "building_sweater",
      "pure_white_wings",
      "black_wings",
      "golden_wing",
      "pink_pink_wings",
      "rampage_ape",
      "a_list_look",
      "countdown_teleport",
      "firework_2026",
      "instant_christmas",
      "birthday_star",
      "firework",
      "celebration",
      "tiger_hug_pro",
      "pet_lion_pro",
      "guardian_spirit",
      "squeeze_scream",
      "inner_voice",
      "memory_alive",
      "guess_what",
      "eagle_snatch",
      "hug_from_past",
      "instant_kid",
      "dollar_rain",
      "cry_cry",
      "building_collapse",
      "mushroom",
      "jesus_hug",
      "shark_alert",
      "lie_flat",
      "polar_bear_hug",
      "brown_bear_hug",
      "office_escape_plow",
      "watermelon_bomb",
      "boss_coming",
      "wig_out",
      "car_explosion",
      "tiger_hug",
      "siblings",
      "construction_worker",
      "snatched",
      "felt_felt",
      "plushcut",
      "drunk_dance",
      "drunk_dance_pet",
      "daoma_dance",
      "bouncy_dance",
      "smooth_sailing_dance",
      "new_year_greeting",
      "lion_dance",
      "prosperity",
      "great_success",
      "golden_horse_fortune",
      "red_packet_box",
      "lucky_horse_year",
      "lucky_red_packet",
      "lucky_money_come",
      "lion_dance_pet",
      "dumpling_making_pet",
      "fish_making_pet",
      "pet_red_packet",
      "lantern_glow",
      "expression_challenge",
      "overdrive",
      "heart_gesture_dance",
      "poping",
      "martial_arts",
      "running",
      "nezha",
      "motorcycle_dance",
      "subject_3_dance",
      "ghost_step_dance",
      "phantom_jewel",
      "zoom_out",
      "cheers_2026",
      "kiss_pro",
      "fight_pro",
      "hug_pro",
      "heart_gesture_pro",
      "dollar_rain_pro",
      "pet_bee_pro",
      "santa_random_surprise",
      "magic_match_tree",
      "happy_birthday",
      "thumbs_up_pro",
      "surprise_bouquet",
      "bouquet_drop",
      "3d_cartoon_1_pro",
      "glamour_photo_shoot",
      "box_of_joy",
      "first_toast_of_the_year",
      "my_santa_pic",
      "santa_gift",
      "steampunk_christmas",
      "snowglobe",
      "christmas_photo_shoot",
      "ornament_crash",
      "santa_express",
      "particle_santa_surround",
      "coronation_of_frost",
      "spark_in_the_snow",
      "scarlet_and_snow",
      "cozy_toon_wrap",
      "bullet_time_lite",
      "magic_cloak",
      "balloon_parade",
      "jumping_ginger_joy",
      "c4d_cartoon_pro",
      "venomous_spider",
      "throne_of_king",
      "luminous_elf",
      "woodland_elf",
      "japanese_anime_1",
      "american_comics",
      "snowboarding",
      "witch_transform",
      "vampire_transform",
      "pumpkin_head_transform",
      "demon_transform",
      "mummy_transform",
      "zombie_transform",
      "cute_pumpkin_transform",
      "cute_ghost_transform",
      "knock_knock_halloween",
      "halloween_escape",
      "baseball",
      "trampoline",
      "trampoline_night",
      "pucker_up",
      "feed_mooncake",
      "flyer",
      "dishwasher",
      "pet_chinese_opera",
      "magic_fireball",
      "gallery_ring",
      "pet_moto_rider",
      "muscle_pet",
      "pet_delivery",
      "mythic_style",
      "steampunk",
      "3d_cartoon_2",
      "pet_chef",
      "santa_gifts",
      "santa_hug",
      "girlfriend",
      "boyfriend",
      "heart_gesture_1",
      "pet_wizard",
      "smoke_smoke",
      "gun_shot",
      "double_gun",
      "pet_warrior",
      "long_hair",
      "pet_dance",
      "wool_curly",
      "pet_bee",
      "marry_me",
      "piggy_morph",
      "ski_ski",
      "magic_broom",
      "splashsplash",
      "surfsurf",
      "fairy_wing",
      "angel_wing",
      "dark_wing",
      "emoji"
    ],
    description: "The effect scene to use for the video generation"
  })
  declare effect_scene: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const duration = String(this.duration ?? "5");
    const effectScene = String(this.effect_scene ?? "");

    const args: Record<string, unknown> = {
      duration: duration,
      effect_scene: effectScene
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
      "fal-ai/kling-video/v1.6/pro/effects",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV16StandardEffects extends FalNode {
  static readonly nodeType = "fal.text_to_video.KlingVideoV16StandardEffects";
  static readonly title = "Kling Video V16 Standard Effects";
  static readonly description = `Generate video clips from your prompts using Kling 1.6 (std)
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

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
      "URL of images to be used for hug, kiss or heart_gesture video."
  })
  declare input_images: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "hug",
      "kiss",
      "heart_gesture",
      "squish",
      "expansion",
      "fuzzyfuzzy",
      "bloombloom",
      "dizzydizzy",
      "jelly_press",
      "jelly_slice",
      "jelly_squish",
      "jelly_jiggle",
      "pixelpixel",
      "yearbook",
      "instant_film",
      "anime_figure",
      "rocketrocket",
      "fly_fly",
      "disappear",
      "lightning_power",
      "bullet_time",
      "bullet_time_360",
      "media_interview",
      "day_to_night",
      "let's_ride",
      "jumpdrop",
      "swish_swish",
      "running_man",
      "jazz_jazz",
      "swing_swing",
      "skateskate",
      "building_sweater",
      "pure_white_wings",
      "black_wings",
      "golden_wing",
      "pink_pink_wings",
      "rampage_ape",
      "a_list_look",
      "countdown_teleport",
      "firework_2026",
      "instant_christmas",
      "birthday_star",
      "firework",
      "celebration",
      "tiger_hug_pro",
      "pet_lion_pro",
      "guardian_spirit",
      "squeeze_scream",
      "inner_voice",
      "memory_alive",
      "guess_what",
      "eagle_snatch",
      "hug_from_past",
      "instant_kid",
      "dollar_rain",
      "cry_cry",
      "building_collapse",
      "mushroom",
      "jesus_hug",
      "shark_alert",
      "lie_flat",
      "polar_bear_hug",
      "brown_bear_hug",
      "office_escape_plow",
      "watermelon_bomb",
      "boss_coming",
      "wig_out",
      "car_explosion",
      "tiger_hug",
      "siblings",
      "construction_worker",
      "snatched",
      "felt_felt",
      "plushcut",
      "drunk_dance",
      "drunk_dance_pet",
      "daoma_dance",
      "bouncy_dance",
      "smooth_sailing_dance",
      "new_year_greeting",
      "lion_dance",
      "prosperity",
      "great_success",
      "golden_horse_fortune",
      "red_packet_box",
      "lucky_horse_year",
      "lucky_red_packet",
      "lucky_money_come",
      "lion_dance_pet",
      "dumpling_making_pet",
      "fish_making_pet",
      "pet_red_packet",
      "lantern_glow",
      "expression_challenge",
      "overdrive",
      "heart_gesture_dance",
      "poping",
      "martial_arts",
      "running",
      "nezha",
      "motorcycle_dance",
      "subject_3_dance",
      "ghost_step_dance",
      "phantom_jewel",
      "zoom_out",
      "cheers_2026",
      "kiss_pro",
      "fight_pro",
      "hug_pro",
      "heart_gesture_pro",
      "dollar_rain_pro",
      "pet_bee_pro",
      "santa_random_surprise",
      "magic_match_tree",
      "happy_birthday",
      "thumbs_up_pro",
      "surprise_bouquet",
      "bouquet_drop",
      "3d_cartoon_1_pro",
      "glamour_photo_shoot",
      "box_of_joy",
      "first_toast_of_the_year",
      "my_santa_pic",
      "santa_gift",
      "steampunk_christmas",
      "snowglobe",
      "christmas_photo_shoot",
      "ornament_crash",
      "santa_express",
      "particle_santa_surround",
      "coronation_of_frost",
      "spark_in_the_snow",
      "scarlet_and_snow",
      "cozy_toon_wrap",
      "bullet_time_lite",
      "magic_cloak",
      "balloon_parade",
      "jumping_ginger_joy",
      "c4d_cartoon_pro",
      "venomous_spider",
      "throne_of_king",
      "luminous_elf",
      "woodland_elf",
      "japanese_anime_1",
      "american_comics",
      "snowboarding",
      "witch_transform",
      "vampire_transform",
      "pumpkin_head_transform",
      "demon_transform",
      "mummy_transform",
      "zombie_transform",
      "cute_pumpkin_transform",
      "cute_ghost_transform",
      "knock_knock_halloween",
      "halloween_escape",
      "baseball",
      "trampoline",
      "trampoline_night",
      "pucker_up",
      "feed_mooncake",
      "flyer",
      "dishwasher",
      "pet_chinese_opera",
      "magic_fireball",
      "gallery_ring",
      "pet_moto_rider",
      "muscle_pet",
      "pet_delivery",
      "mythic_style",
      "steampunk",
      "3d_cartoon_2",
      "pet_chef",
      "santa_gifts",
      "santa_hug",
      "girlfriend",
      "boyfriend",
      "heart_gesture_1",
      "pet_wizard",
      "smoke_smoke",
      "gun_shot",
      "double_gun",
      "pet_warrior",
      "long_hair",
      "pet_dance",
      "wool_curly",
      "pet_bee",
      "marry_me",
      "piggy_morph",
      "ski_ski",
      "magic_broom",
      "splashsplash",
      "surfsurf",
      "fairy_wing",
      "angel_wing",
      "dark_wing",
      "emoji"
    ],
    description: "The effect scene to use for the video generation"
  })
  declare effect_scene: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const duration = String(this.duration ?? "5");
    const effectScene = String(this.effect_scene ?? "");

    const args: Record<string, unknown> = {
      duration: duration,
      effect_scene: effectScene
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
      "fal-ai/kling-video/v1.6/standard/effects",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV15ProEffects extends FalNode {
  static readonly nodeType = "fal.text_to_video.KlingVideoV15ProEffects";
  static readonly title = "Kling Video V15 Pro Effects";
  static readonly description = `Generate video clips from your prompts using Kling 1.5 (pro)
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

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
      "URL of images to be used for hug, kiss or heart_gesture video."
  })
  declare input_images: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "hug",
      "kiss",
      "heart_gesture",
      "squish",
      "expansion",
      "fuzzyfuzzy",
      "bloombloom",
      "dizzydizzy",
      "jelly_press",
      "jelly_slice",
      "jelly_squish",
      "jelly_jiggle",
      "pixelpixel",
      "yearbook",
      "instant_film",
      "anime_figure",
      "rocketrocket",
      "fly_fly",
      "disappear",
      "lightning_power",
      "bullet_time",
      "bullet_time_360",
      "media_interview",
      "day_to_night",
      "let's_ride",
      "jumpdrop",
      "swish_swish",
      "running_man",
      "jazz_jazz",
      "swing_swing",
      "skateskate",
      "building_sweater",
      "pure_white_wings",
      "black_wings",
      "golden_wing",
      "pink_pink_wings",
      "rampage_ape",
      "a_list_look",
      "countdown_teleport",
      "firework_2026",
      "instant_christmas",
      "birthday_star",
      "firework",
      "celebration",
      "tiger_hug_pro",
      "pet_lion_pro",
      "guardian_spirit",
      "squeeze_scream",
      "inner_voice",
      "memory_alive",
      "guess_what",
      "eagle_snatch",
      "hug_from_past",
      "instant_kid",
      "dollar_rain",
      "cry_cry",
      "building_collapse",
      "mushroom",
      "jesus_hug",
      "shark_alert",
      "lie_flat",
      "polar_bear_hug",
      "brown_bear_hug",
      "office_escape_plow",
      "watermelon_bomb",
      "boss_coming",
      "wig_out",
      "car_explosion",
      "tiger_hug",
      "siblings",
      "construction_worker",
      "snatched",
      "felt_felt",
      "plushcut",
      "drunk_dance",
      "drunk_dance_pet",
      "daoma_dance",
      "bouncy_dance",
      "smooth_sailing_dance",
      "new_year_greeting",
      "lion_dance",
      "prosperity",
      "great_success",
      "golden_horse_fortune",
      "red_packet_box",
      "lucky_horse_year",
      "lucky_red_packet",
      "lucky_money_come",
      "lion_dance_pet",
      "dumpling_making_pet",
      "fish_making_pet",
      "pet_red_packet",
      "lantern_glow",
      "expression_challenge",
      "overdrive",
      "heart_gesture_dance",
      "poping",
      "martial_arts",
      "running",
      "nezha",
      "motorcycle_dance",
      "subject_3_dance",
      "ghost_step_dance",
      "phantom_jewel",
      "zoom_out",
      "cheers_2026",
      "kiss_pro",
      "fight_pro",
      "hug_pro",
      "heart_gesture_pro",
      "dollar_rain_pro",
      "pet_bee_pro",
      "santa_random_surprise",
      "magic_match_tree",
      "happy_birthday",
      "thumbs_up_pro",
      "surprise_bouquet",
      "bouquet_drop",
      "3d_cartoon_1_pro",
      "glamour_photo_shoot",
      "box_of_joy",
      "first_toast_of_the_year",
      "my_santa_pic",
      "santa_gift",
      "steampunk_christmas",
      "snowglobe",
      "christmas_photo_shoot",
      "ornament_crash",
      "santa_express",
      "particle_santa_surround",
      "coronation_of_frost",
      "spark_in_the_snow",
      "scarlet_and_snow",
      "cozy_toon_wrap",
      "bullet_time_lite",
      "magic_cloak",
      "balloon_parade",
      "jumping_ginger_joy",
      "c4d_cartoon_pro",
      "venomous_spider",
      "throne_of_king",
      "luminous_elf",
      "woodland_elf",
      "japanese_anime_1",
      "american_comics",
      "snowboarding",
      "witch_transform",
      "vampire_transform",
      "pumpkin_head_transform",
      "demon_transform",
      "mummy_transform",
      "zombie_transform",
      "cute_pumpkin_transform",
      "cute_ghost_transform",
      "knock_knock_halloween",
      "halloween_escape",
      "baseball",
      "trampoline",
      "trampoline_night",
      "pucker_up",
      "feed_mooncake",
      "flyer",
      "dishwasher",
      "pet_chinese_opera",
      "magic_fireball",
      "gallery_ring",
      "pet_moto_rider",
      "muscle_pet",
      "pet_delivery",
      "mythic_style",
      "steampunk",
      "3d_cartoon_2",
      "pet_chef",
      "santa_gifts",
      "santa_hug",
      "girlfriend",
      "boyfriend",
      "heart_gesture_1",
      "pet_wizard",
      "smoke_smoke",
      "gun_shot",
      "double_gun",
      "pet_warrior",
      "long_hair",
      "pet_dance",
      "wool_curly",
      "pet_bee",
      "marry_me",
      "piggy_morph",
      "ski_ski",
      "magic_broom",
      "splashsplash",
      "surfsurf",
      "fairy_wing",
      "angel_wing",
      "dark_wing",
      "emoji"
    ],
    description: "The effect scene to use for the video generation"
  })
  declare effect_scene: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const duration = String(this.duration ?? "5");
    const effectScene = String(this.effect_scene ?? "");

    const args: Record<string, unknown> = {
      duration: duration,
      effect_scene: effectScene
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
      "fal-ai/kling-video/v1.5/pro/effects",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV1StandardEffects extends FalNode {
  static readonly nodeType = "fal.text_to_video.KlingVideoV1StandardEffects";
  static readonly title = "Kling Video V1 Standard Effects";
  static readonly description = `Generate video clips from your prompts using Kling 1.0
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

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
      "URL of images to be used for hug, kiss or heart_gesture video."
  })
  declare input_images: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "hug",
      "kiss",
      "heart_gesture",
      "squish",
      "expansion",
      "fuzzyfuzzy",
      "bloombloom",
      "dizzydizzy",
      "jelly_press",
      "jelly_slice",
      "jelly_squish",
      "jelly_jiggle",
      "pixelpixel",
      "yearbook",
      "instant_film",
      "anime_figure",
      "rocketrocket",
      "fly_fly",
      "disappear",
      "lightning_power",
      "bullet_time",
      "bullet_time_360",
      "media_interview",
      "day_to_night",
      "let's_ride",
      "jumpdrop",
      "swish_swish",
      "running_man",
      "jazz_jazz",
      "swing_swing",
      "skateskate",
      "building_sweater",
      "pure_white_wings",
      "black_wings",
      "golden_wing",
      "pink_pink_wings",
      "rampage_ape",
      "a_list_look",
      "countdown_teleport",
      "firework_2026",
      "instant_christmas",
      "birthday_star",
      "firework",
      "celebration",
      "tiger_hug_pro",
      "pet_lion_pro",
      "guardian_spirit",
      "squeeze_scream",
      "inner_voice",
      "memory_alive",
      "guess_what",
      "eagle_snatch",
      "hug_from_past",
      "instant_kid",
      "dollar_rain",
      "cry_cry",
      "building_collapse",
      "mushroom",
      "jesus_hug",
      "shark_alert",
      "lie_flat",
      "polar_bear_hug",
      "brown_bear_hug",
      "office_escape_plow",
      "watermelon_bomb",
      "boss_coming",
      "wig_out",
      "car_explosion",
      "tiger_hug",
      "siblings",
      "construction_worker",
      "snatched",
      "felt_felt",
      "plushcut",
      "drunk_dance",
      "drunk_dance_pet",
      "daoma_dance",
      "bouncy_dance",
      "smooth_sailing_dance",
      "new_year_greeting",
      "lion_dance",
      "prosperity",
      "great_success",
      "golden_horse_fortune",
      "red_packet_box",
      "lucky_horse_year",
      "lucky_red_packet",
      "lucky_money_come",
      "lion_dance_pet",
      "dumpling_making_pet",
      "fish_making_pet",
      "pet_red_packet",
      "lantern_glow",
      "expression_challenge",
      "overdrive",
      "heart_gesture_dance",
      "poping",
      "martial_arts",
      "running",
      "nezha",
      "motorcycle_dance",
      "subject_3_dance",
      "ghost_step_dance",
      "phantom_jewel",
      "zoom_out",
      "cheers_2026",
      "kiss_pro",
      "fight_pro",
      "hug_pro",
      "heart_gesture_pro",
      "dollar_rain_pro",
      "pet_bee_pro",
      "santa_random_surprise",
      "magic_match_tree",
      "happy_birthday",
      "thumbs_up_pro",
      "surprise_bouquet",
      "bouquet_drop",
      "3d_cartoon_1_pro",
      "glamour_photo_shoot",
      "box_of_joy",
      "first_toast_of_the_year",
      "my_santa_pic",
      "santa_gift",
      "steampunk_christmas",
      "snowglobe",
      "christmas_photo_shoot",
      "ornament_crash",
      "santa_express",
      "particle_santa_surround",
      "coronation_of_frost",
      "spark_in_the_snow",
      "scarlet_and_snow",
      "cozy_toon_wrap",
      "bullet_time_lite",
      "magic_cloak",
      "balloon_parade",
      "jumping_ginger_joy",
      "c4d_cartoon_pro",
      "venomous_spider",
      "throne_of_king",
      "luminous_elf",
      "woodland_elf",
      "japanese_anime_1",
      "american_comics",
      "snowboarding",
      "witch_transform",
      "vampire_transform",
      "pumpkin_head_transform",
      "demon_transform",
      "mummy_transform",
      "zombie_transform",
      "cute_pumpkin_transform",
      "cute_ghost_transform",
      "knock_knock_halloween",
      "halloween_escape",
      "baseball",
      "trampoline",
      "trampoline_night",
      "pucker_up",
      "feed_mooncake",
      "flyer",
      "dishwasher",
      "pet_chinese_opera",
      "magic_fireball",
      "gallery_ring",
      "pet_moto_rider",
      "muscle_pet",
      "pet_delivery",
      "mythic_style",
      "steampunk",
      "3d_cartoon_2",
      "pet_chef",
      "santa_gifts",
      "santa_hug",
      "girlfriend",
      "boyfriend",
      "heart_gesture_1",
      "pet_wizard",
      "smoke_smoke",
      "gun_shot",
      "double_gun",
      "pet_warrior",
      "long_hair",
      "pet_dance",
      "wool_curly",
      "pet_bee",
      "marry_me",
      "piggy_morph",
      "ski_ski",
      "magic_broom",
      "splashsplash",
      "surfsurf",
      "fairy_wing",
      "angel_wing",
      "dark_wing",
      "emoji"
    ],
    description: "The effect scene to use for the video generation"
  })
  declare effect_scene: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const duration = String(this.duration ?? "5");
    const effectScene = String(this.effect_scene ?? "");

    const args: Record<string, unknown> = {
      duration: duration,
      effect_scene: effectScene
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
      "fal-ai/kling-video/v1/standard/effects",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LtxVideoV095 extends FalNode {
  static readonly nodeType = "fal.text_to_video.LtxVideoV095";
  static readonly title = "Ltx Video V095";
  static readonly description = `Generate videos from prompts using LTX Video-0.9.5
video, generation, text-to-video, txt2vid`;
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
    default: "720p",
    values: ["480p", "720p"],
    description: "Resolution of the generated video (480p or 720p)."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["9:16", "16:9"],
    description: "Aspect ratio of the generated video (16:9 or 9:16)."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to expand the prompt using the model's own capabilities."
  })
  declare expand_prompt: any;

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
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const expandPrompt = Boolean(this.expand_prompt ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const negativePrompt = String(
      this.negative_prompt ??
        "worst quality, inconsistent motion, blurry, jittery, distorted"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      expand_prompt: expandPrompt,
      seed: seed,
      num_inference_steps: numInferenceSteps,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ltx-video-v095", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV16ProTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.KlingVideoV16ProTextToVideo";
  static readonly title = "Kling Video V16 Pro Text To Video";
  static readonly description = `Generate video clips from your prompts using Kling 1.6 (pro)
video, generation, text-to-video, txt2vid`;
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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? "5");
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );
    const cfgScale = Number(this.cfg_scale ?? 0.5);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      duration: duration,
      negative_prompt: negativePrompt,
      cfg_scale: cfgScale
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/v1.6/pro/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanT2v extends FalNode {
  static readonly nodeType = "fal.text_to_video.WanT2v";
  static readonly title = "Wan T2v";
  static readonly description = `Wan-2.1 is a text-to-video model that generates high-quality videos with high visual quality and motion diversity from text prompts
video, generation, text-to-video, txt2vid`;
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
    default: "16:9",
    values: ["9:16", "16:9"],
    description: "Aspect ratio of the generated video (16:9 or 9:16)."
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
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the video will be generated faster with no noticeable degradation in the visual quality."
  })
  declare turbo_mode: any;

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
      "Number of frames to generate. Must be between 81 to 100 (inclusive)."
  })
  declare num_frames: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "720p");
    const enablePromptExpansion = Boolean(
      this.enable_prompt_expansion ?? false
    );
    const turboMode = Boolean(this.turbo_mode ?? false);
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(
      this.negative_prompt ??
        "bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards"
    );
    const numFrames = String(this.num_frames ?? 81);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      enable_prompt_expansion: enablePromptExpansion,
      turbo_mode: turboMode,
      frames_per_second: framesPerSecond,
      enable_safety_checker: enableSafetyChecker,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      negative_prompt: negativePrompt,
      num_frames: numFrames
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-t2v", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Veo2 extends FalNode {
  static readonly nodeType = "fal.text_to_video.Veo2";
  static readonly title = "Veo2";
  static readonly description = `Veo 2 creates videos with realistic motion and high quality output. Explore different styles and find your own with extensive camera controls.
video, generation, text-to-video, txt2vid`;
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
    default: "5s",
    values: ["5s", "6s", "7s", "8s"],
    description: "The duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["9:16", "16:9", "1:1"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to automatically attempt to fix prompts that fail content policy or other validation checks by rewriting them"
  })
  declare auto_fix: any;

  @prop({
    type: "str",
    default: "",
    description: "A seed to use for the video generation"
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "A negative prompt to guide the video generation"
  })
  declare negative_prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enhance the video generation"
  })
  declare enhance_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const duration = String(this.duration ?? "5s");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const autoFix = Boolean(this.auto_fix ?? true);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");
    const enhancePrompt = Boolean(this.enhance_prompt ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      duration: duration,
      aspect_ratio: aspectRatio,
      auto_fix: autoFix,
      seed: seed,
      negative_prompt: negativePrompt,
      enhance_prompt: enhancePrompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/veo2", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MinimaxVideo01Director extends FalNode {
  static readonly nodeType = "fal.text_to_video.MinimaxVideo01Director";
  static readonly title = "Minimax Video01 Director";
  static readonly description = `Generate video clips more accurately with respect to natural language descriptions and using camera movement instructions for shot control.
video, generation, text-to-video, txt2vid`;
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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      prompt_optimizer: promptOptimizer
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/minimax/video-01-director",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV35TextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.PixverseV35TextToVideo";
  static readonly title = "Pixverse V35 Text To Video";
  static readonly description = `Generate high quality video clips from text prompts using PixVerse v3.5
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["360p", "540p", "720p", "1080p"],
    description: "The resolution of the generated video"
  })
  declare resolution: any;

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
    description: "The style of the generated video"
  })
  declare style: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "8"],
    description:
      "The duration of the generated video in seconds. 8s videos cost double. 1080p videos are limited to 5 seconds"
  })
  declare duration: any;

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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const style = String(this.style ?? "");
    const duration = String(this.duration ?? "5");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      style: style,
      duration: duration,
      seed: seed,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/pixverse/v3.5/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class PixverseV35TextToVideoFast extends FalNode {
  static readonly nodeType = "fal.text_to_video.PixverseV35TextToVideoFast";
  static readonly title = "Pixverse V35 Text To Video Fast";
  static readonly description = `Generate high quality video clips quickly from text prompts using PixVerse v3.5 Fast
video, generation, text-to-video, txt2vid, fast`;
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
    type: "enum",
    default: "16:9",
    values: ["16:9", "4:3", "1:1", "3:4", "9:16"],
    description: "The aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const style = String(this.style ?? "");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      style: style,
      seed: seed,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/pixverse/v3.5/text-to-video/fast",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LumaDreamMachineRay2 extends FalNode {
  static readonly nodeType = "fal.text_to_video.LumaDreamMachineRay2";
  static readonly title = "Luma Dream Machine Ray2";
  static readonly description = `Ray2 is a large-scale video generative model capable of creating realistic visuals with natural, coherent motion.
video, generation, text-to-video, txt2vid`;
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
    type: "enum",
    default: "540p",
    values: ["540p", "720p", "1080p"],
    description:
      "The resolution of the generated video (720p costs 2x more, 1080p costs 4x more)"
  })
  declare resolution: any;

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
    description: "The duration of the generated video (9s costs 2x more)"
  })
  declare duration: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "540p");
    const loop = Boolean(this.loop ?? false);
    const duration = String(this.duration ?? "5s");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      loop: loop,
      duration: duration
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/luma-dream-machine/ray-2",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class HunyuanVideoLora extends FalNode {
  static readonly nodeType = "fal.text_to_video.HunyuanVideoLora";
  static readonly title = "Hunyuan Video Lora";
  static readonly description = `Hunyuan Video is an Open video generation model with high visual quality, motion diversity, text-video alignment, and generation stability
video, generation, text-to-video, txt2vid, lora`;
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

  @prop({
    type: "list[LoraWeight]",
    default: [],
    description:
      "\n            The LoRAs to use for the image generation. You can use any number of LoRAs\n            and they will be merged together to generate the final image.\n        "
  })
  declare loras: any;

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
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const seed = Number(this.seed ?? -1);
    const numFrames = String(this.num_frames ?? 129);
    const proMode = Boolean(this.pro_mode ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      loras: loras,
      enable_safety_checker: enableSafetyChecker,
      seed: seed,
      num_frames: numFrames,
      pro_mode: proMode
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan-video-lora", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Transpixar extends FalNode {
  static readonly nodeType = "fal.text_to_video.Transpixar";
  static readonly title = "Transpixar";
  static readonly description = `Transform text into stunning videos with TransPixar - an AI model that generates both RGB footage and alpha channels, enabling seamless compositing and creative video effects.
video, generation, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    videos: "list[File]",
    timings: "dict[str, any]",
    seed: "int"
  };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 7,
    description:
      "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related video to show you.\n        "
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 24,
    description: "The number of inference steps to perform."
  })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 8, description: "The target FPS of the video" })
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
    const guidanceScale = Number(this.guidance_scale ?? 7);
    const numInferenceSteps = Number(this.num_inference_steps ?? 24);
    const exportFps = Number(this.export_fps ?? 8);
    const negativePrompt = String(this.negative_prompt ?? "");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      guidance_scale: guidanceScale,
      num_inference_steps: numInferenceSteps,
      export_fps: exportFps,
      negative_prompt: negativePrompt,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/transpixar", args);
    return res as Record<string, unknown>;
  }
}

export class KlingVideoV16StandardTextToVideo extends FalNode {
  static readonly nodeType =
    "fal.text_to_video.KlingVideoV16StandardTextToVideo";
  static readonly title = "Kling Video V16 Standard Text To Video";
  static readonly description = `Generate video clips from your prompts using Kling 1.6 (std)
video, generation, text-to-video, txt2vid`;
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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? "5");
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );
    const cfgScale = Number(this.cfg_scale ?? 0.5);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      duration: duration,
      negative_prompt: negativePrompt,
      cfg_scale: cfgScale
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/v1.6/standard/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MinimaxVideo01Live extends FalNode {
  static readonly nodeType = "fal.text_to_video.MinimaxVideo01Live";
  static readonly title = "Minimax Video01 Live";
  static readonly description = `Generate video clips from your prompts using MiniMax model
video, generation, text-to-video, txt2vid`;
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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      prompt_optimizer: promptOptimizer
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/minimax/video-01-live", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV15ProTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.KlingVideoV15ProTextToVideo";
  static readonly title = "Kling Video V15 Pro Text To Video";
  static readonly description = `Generate video clips from your prompts using Kling 1.5 (pro)
video, generation, text-to-video, txt2vid`;
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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? "5");
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );
    const cfgScale = Number(this.cfg_scale ?? 0.5);

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      duration: duration,
      negative_prompt: negativePrompt,
      cfg_scale: cfgScale
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/v1.5/pro/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class FastSvdTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.FastSvdTextToVideo";
  static readonly title = "Fast Svd Text To Video";
  static readonly description = `Generate short video clips from your prompts using SVD v1.1
video, generation, text-to-video, txt2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to use as a starting point for the generation."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.02,
    description:
      "\n            The conditoning augmentation determines the amount of noise that will be\n            added to the conditioning frame. The higher the number, the more noise\n            there will be, and the less the video will look like the initial image.\n            Increase it for more motion.\n        "
  })
  declare cond_aug: any;

  @prop({
    type: "enum",
    default: "none",
    values: ["none", "minimum", "medium", "high"],
    description:
      "\n            Enabling [DeepCache](https://github.com/horseee/DeepCache) will make the execution\n            faster, but might sometimes degrade overall quality. The higher the setting, the\n            faster the execution will be, but the more quality might be lost.\n        "
  })
  declare deep_cache: any;

  @prop({
    type: "int",
    default: 10,
    description:
      "\n            The FPS of the generated video. The higher the number, the faster the video will\n            play. Total video length is 25 frames.\n        "
  })
  declare fps: any;

  @prop({
    type: "int",
    default: 127,
    description:
      "\n            The motion bucket id determines the motion of the generated video. The\n            higher the number, the more motion there will be.\n        "
  })
  declare motion_bucket_id: any;

  @prop({
    type: "str",
    default: "landscape_16_9",
    description: "The size of the generated video."
  })
  declare video_size: any;

  @prop({
    type: "int",
    default: 20,
    description:
      "\n            The number of steps to run the model for. The higher the number the better\n            the quality and longer it will take to generate.\n        "
  })
  declare steps: any;

  @prop({
    type: "int",
    default: -1,
    description:
      "\n            The same seed and the same prompt given to the same version of Stable Diffusion\n            will output the same image every time.\n        "
  })
  declare seed: any;

  @prop({
    type: "str",
    default:
      "unrealistic, saturated, high contrast, big nose, painting, drawing, sketch, cartoon, anime, manga, render, CG, 3d, watermark, signature, label",
    description:
      "The negative prompt to use as a starting point for the generation."
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const condAug = Number(this.cond_aug ?? 0.02);
    const deepCache = String(this.deep_cache ?? "none");
    const fps = Number(this.fps ?? 10);
    const motionBucketId = Number(this.motion_bucket_id ?? 127);
    const videoSize = String(this.video_size ?? "landscape_16_9");
    const steps = Number(this.steps ?? 20);
    const seed = Number(this.seed ?? -1);
    const negativePrompt = String(
      this.negative_prompt ??
        "unrealistic, saturated, high contrast, big nose, painting, drawing, sketch, cartoon, anime, manga, render, CG, 3d, watermark, signature, label"
    );

    const args: Record<string, unknown> = {
      prompt: prompt,
      cond_aug: condAug,
      deep_cache: deepCache,
      fps: fps,
      motion_bucket_id: motionBucketId,
      video_size: videoSize,
      steps: steps,
      seed: seed,
      negative_prompt: negativePrompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/fast-svd/text-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class FastSvdLcmTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.FastSvdLcmTextToVideo";
  static readonly title = "Fast Svd Lcm Text To Video";
  static readonly description = `Generate short video clips from your images using SVD v1.1 at Lightning Speed
video, generation, text-to-video, txt2vid, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to use as a starting point for the generation."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.02,
    description:
      "\n            The conditoning augmentation determines the amount of noise that will be\n            added to the conditioning frame. The higher the number, the more noise\n            there will be, and the less the video will look like the initial image.\n            Increase it for more motion.\n        "
  })
  declare cond_aug: any;

  @prop({
    type: "int",
    default: 10,
    description:
      "\n            The FPS of the generated video. The higher the number, the faster the video will\n            play. Total video length is 25 frames.\n        "
  })
  declare fps: any;

  @prop({
    type: "int",
    default: 127,
    description:
      "\n            The motion bucket id determines the motion of the generated video. The\n            higher the number, the more motion there will be.\n        "
  })
  declare motion_bucket_id: any;

  @prop({
    type: "str",
    default: "landscape_16_9",
    description: "The size of the generated video."
  })
  declare video_size: any;

  @prop({
    type: "int",
    default: 4,
    description:
      "\n            The number of steps to run the model for. The higher the number the better\n            the quality and longer it will take to generate.\n        "
  })
  declare steps: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and the same prompt given to the same version of Stable Diffusion\n            will output the same image every time.\n        "
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const condAug = Number(this.cond_aug ?? 0.02);
    const fps = Number(this.fps ?? 10);
    const motionBucketId = Number(this.motion_bucket_id ?? 127);
    const videoSize = String(this.video_size ?? "landscape_16_9");
    const steps = Number(this.steps ?? 4);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      cond_aug: condAug,
      fps: fps,
      motion_bucket_id: motionBucketId,
      video_size: videoSize,
      steps: steps,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/fast-svd-lcm/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class MinimaxVideo01 extends FalNode {
  static readonly nodeType = "fal.text_to_video.MinimaxVideo01";
  static readonly title = "Minimax Video01";
  static readonly description = `Generate video clips from your prompts using MiniMax model
video, generation, text-to-video, txt2vid`;
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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      prompt_optimizer: promptOptimizer
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/minimax/video-01", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV3StandardTextToVideo extends FalNode {
  static readonly nodeType =
    "fal.text_to_video.KlingVideoV3StandardTextToVideo";
  static readonly title = "Kling Video V3 Standard Text To Video";
  static readonly description = `Kling Video V3 Standard generates videos from text prompts with balanced quality and speed using the latest V3 model.
video, generation, kling, v3, standard, text-to-video, txt2vid`;
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
    type: "bool",
    default: true,
    description:
      "Whether to generate native audio for the video. Supports Chinese and English voice output. Other languages are automatically translated to English. For English speech, use lowercase letters; for acronyms or proper nouns, use uppercase."
  })
  declare generate_audio: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "The aspect ratio of the generated video frame"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "List of prompts for multi-shot video generation. If provided, overrides the single prompt and divides the video into multiple shots with specified prompts and durations."
  })
  declare multi_prompt: any;

  @prop({
    type: "enum",
    default: "customize",
    values: ["customize", "intelligent"],
    description: "The type of multi-shot video generation"
  })
  declare shot_type: any;

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
    const generateAudio = Boolean(this.generate_audio ?? true);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const multiPrompt = String(this.multi_prompt ?? "");
    const shotType = String(this.shot_type ?? "customize");
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );
    const cfgScale = Number(this.cfg_scale ?? 0.5);

    const args: Record<string, unknown> = {
      prompt: prompt,
      voice_ids: voiceIds,
      duration: duration,
      generate_audio: generateAudio,
      aspect_ratio: aspectRatio,
      multi_prompt: multiPrompt,
      shot_type: shotType,
      negative_prompt: negativePrompt,
      cfg_scale: cfgScale
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/v3/standard/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoV3ProTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.KlingVideoV3ProTextToVideo";
  static readonly title = "Kling Video V3 Pro Text To Video";
  static readonly description = `Kling Video V3 Pro generates professional quality videos from text prompts with enhanced visual fidelity using the latest V3 model.
video, generation, kling, v3, pro, text-to-video, txt2vid`;
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
    type: "bool",
    default: true,
    description:
      "Whether to generate native audio for the video. Supports Chinese and English voice output. Other languages are automatically translated to English. For English speech, use lowercase letters; for acronyms or proper nouns, use uppercase."
  })
  declare generate_audio: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "The aspect ratio of the generated video frame"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "List of prompts for multi-shot video generation. If provided, overrides the single prompt and divides the video into multiple shots with specified prompts and durations."
  })
  declare multi_prompt: any;

  @prop({
    type: "enum",
    default: "customize",
    values: ["customize", "intelligent"],
    description: "The type of multi-shot video generation"
  })
  declare shot_type: any;

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
    const generateAudio = Boolean(this.generate_audio ?? true);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const multiPrompt = String(this.multi_prompt ?? "");
    const shotType = String(this.shot_type ?? "customize");
    const negativePrompt = String(
      this.negative_prompt ?? "blur, distort, and low quality"
    );
    const cfgScale = Number(this.cfg_scale ?? 0.5);

    const args: Record<string, unknown> = {
      prompt: prompt,
      voice_ids: voiceIds,
      duration: duration,
      generate_audio: generateAudio,
      aspect_ratio: aspectRatio,
      multi_prompt: multiPrompt,
      shot_type: shotType,
      negative_prompt: negativePrompt,
      cfg_scale: cfgScale
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/v3/pro/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO3StandardTextToVideo extends FalNode {
  static readonly nodeType =
    "fal.text_to_video.KlingVideoO3StandardTextToVideo";
  static readonly title = "Kling Video O3 Standard Text To Video";
  static readonly description = `Kling Video O3 Standard generates videos from text prompts with balanced quality and speed.
video, generation, kling, o3, standard, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Text prompt for video generation. Required unless multi_prompt is provided."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional Voice IDs for video generation. Reference voices in your prompt with <<<voice_1>>> and <<<voice_2>>> (maximum 2 voices per task). Get voice IDs from the kling video create-voice endpoint: https://fal.ai/models/fal-ai/kling-video/create-voice"
  })
  declare voice_ids: any;

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
    default: "customize",
    description: "The type of multi-shot video generation."
  })
  declare shot_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const voiceIds = String(this.voice_ids ?? "");
    const generateAudio = Boolean(this.generate_audio ?? false);
    const multiPrompt = String(this.multi_prompt ?? "");
    const duration = String(this.duration ?? "5");
    const shotType = String(this.shot_type ?? "customize");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      voice_ids: voiceIds,
      generate_audio: generateAudio,
      multi_prompt: multiPrompt,
      duration: duration,
      shot_type: shotType
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/o3/standard/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class KlingVideoO3ProTextToVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.KlingVideoO3ProTextToVideo";
  static readonly title = "Kling Video O3 Pro Text To Video";
  static readonly description = `Kling Video O3 Pro generates professional quality videos from text prompts with enhanced fidelity.
video, generation, kling, o3, pro, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description:
      "Text prompt for video generation. Required unless multi_prompt is provided."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "Aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional Voice IDs for video generation. Reference voices in your prompt with <<<voice_1>>> and <<<voice_2>>> (maximum 2 voices per task). Get voice IDs from the kling video create-voice endpoint: https://fal.ai/models/fal-ai/kling-video/create-voice"
  })
  declare voice_ids: any;

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
    default: "customize",
    description: "The type of multi-shot video generation."
  })
  declare shot_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const voiceIds = String(this.voice_ids ?? "");
    const generateAudio = Boolean(this.generate_audio ?? false);
    const multiPrompt = String(this.multi_prompt ?? "");
    const duration = String(this.duration ?? "5");
    const shotType = String(this.shot_type ?? "customize");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      voice_ids: voiceIds,
      generate_audio: generateAudio,
      multi_prompt: multiPrompt,
      duration: duration,
      shot_type: shotType
    };
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/kling-video/o3/pro/text-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export const FAL_TEXT_TO_VIDEO_NODES: readonly NodeClass[] = [
  HunyuanVideo,
  CogVideoX5B,
  AnimateDiffTextToVideo,
  AnimateDiffTurboTextToVideo,
  AnimateDiffSparseCtrlLCM,
  VeedAvatarsTextToVideo,
  ArgilAvatarsTextToVideo,
  SeeDanceV15ProTextToVideo,
  SeeDanceV1ProFastTextToVideo,
  VeedFabric10Text,
  LTXVideo,
  KlingVideoV1StandardTextToVideo,
  MochiV1,
  StableVideo,
  T2VTurbo,
  LumaDreamMachineTextToVideo,
  LumaPhoton,
  PixverseV56TextToVideo,
  Ltx219BDistilledTextToVideoLora,
  Ltx219BDistilledTextToVideo,
  Ltx219BTextToVideoLora,
  Ltx219BTextToVideo,
  Kandinsky5ProTextToVideo,
  WanV26TextToVideo,
  KlingVideoV26ProTextToVideo,
  PixverseV55TextToVideo,
  Ltx2TextToVideoFast,
  Ltx2TextToVideo,
  HunyuanVideoV15TextToVideo,
  InfinityStarTextToVideo,
  SanaVideo,
  LongcatVideoTextToVideo720P,
  LongcatVideoTextToVideo480P,
  LongcatVideoDistilledTextToVideo720P,
  LongcatVideoDistilledTextToVideo480P,
  MinimaxHailuo23StandardTextToVideo,
  MinimaxHailuo23ProTextToVideo,
  ViduQ2TextToVideo,
  KreaWan14BTextToVideo,
  WanAlpha,
  Kandinsky5TextToVideoDistill,
  Kandinsky5TextToVideo,
  Veo31Fast,
  Veo31,
  Sora2TextToVideoPro,
  Sora2TextToVideo,
  Ovi,
  Wan25PreviewTextToVideo,
  PixverseV5TextToVideo,
  InfinitalkSingleText,
  MoonvalleyMareyT2V,
  WanV22A14bTextToVideoLora,
  WanV225bTextToVideoDistill,
  WanV225bTextToVideoFastWan,
  WanV22A14bTextToVideoTurbo,
  WanV225bTextToVideo,
  WanV22A14bTextToVideo,
  Ltxv13b098Distilled,
  MinimaxHailuo02ProTextToVideo,
  BytedanceSeedanceV1ProTextToVideo,
  BytedanceSeedanceV1LiteTextToVideo,
  KlingVideoV21MasterTextToVideo,
  LtxVideo13bDev,
  LtxVideo13bDistilled,
  PixverseV45TextToVideoFast,
  PixverseV45TextToVideo,
  ViduQ1TextToVideo,
  Magi,
  MagiDistilled,
  PixverseV4TextToVideo,
  PixverseV4TextToVideoFast,
  KlingVideoLipsyncAudioToVideo,
  KlingVideoLipsyncTextToVideo,
  WanT2vLora,
  LumaDreamMachineRay2Flash,
  PikaV21TextToVideo,
  PikaV22TextToVideo,
  PikaV2TurboTextToVideo,
  WanProTextToVideo,
  KlingVideoV16ProEffects,
  KlingVideoV16StandardEffects,
  KlingVideoV15ProEffects,
  KlingVideoV1StandardEffects,
  LtxVideoV095,
  KlingVideoV16ProTextToVideo,
  WanT2v,
  Veo2,
  MinimaxVideo01Director,
  PixverseV35TextToVideo,
  PixverseV35TextToVideoFast,
  LumaDreamMachineRay2,
  HunyuanVideoLora,
  Transpixar,
  KlingVideoV16StandardTextToVideo,
  MinimaxVideo01Live,
  KlingVideoV15ProTextToVideo,
  FastSvdTextToVideo,
  FastSvdLcmTextToVideo,
  MinimaxVideo01,
  KlingVideoV3StandardTextToVideo,
  KlingVideoV3ProTextToVideo,
  KlingVideoO3StandardTextToVideo,
  KlingVideoO3ProTextToVideo
] as const;
