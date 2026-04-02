import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getApiKey,
  kieExecuteTask,
  isRefSet,
  uploadImageInput,
  uploadAudioInput,
  uploadVideoInput
} from "../kie-base.js";

export class KlingTextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.KlingTextToVideo";
  static readonly title = "Kling 2.6 Text To Video";
  static readonly description = `Generate videos from text using Kuaishou's Kling 2.6 model via Kie.ai.

    kie, kling, kuaishou, video generation, ai, text-to-video, 2.6

    Kling 2.6 produces high-quality videos from text descriptions with
    realistic motion, natural lighting, and cinematic detail.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "int",
    default: 5,
    title: "Duration",
    description: "Video duration in seconds.",
    min: 1,
    max: 10
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "768P",
    values: ["768P"],
    title: "Resolution",
    description: "Video resolution."
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: -1,
    title: "Seed",
    description: "Random seed for reproducible results. Use -1 for random seed."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");
    params["duration"] = Number(this.duration ?? 5);
    params["resolution"] = String(this.resolution ?? "768P");
    params["seed"] = Number(this.seed ?? -1);

    const result = await kieExecuteTask(
      apiKey,
      "kling-2.6/text-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class KlingImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.KlingImageToVideo";
  static readonly title = "Kling 2.6 Image To Video";
  static readonly description = `Generate videos from images using Kuaishou's Kling 2.6 model via Kie.ai.

    kie, kling, kuaishou, video generation, ai, image-to-video, 2.6

    Transforms static images into dynamic videos with realistic motion
    and temporal consistency while preserving the original visual style.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "Optional text prompt to guide the video generation."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image1",
    description: "First source image for the video generation."
  })
  declare image1: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image2",
    description: "Second source image (optional)."
  })
  declare image2: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image3",
    description: "Third source image (optional)."
  })
  declare image3: any;

  @prop({
    type: "bool",
    default: false,
    title: "Sound",
    description: "Whether to generate sound for the video."
  })
  declare sound: any;

  @prop({
    type: "int",
    default: 5,
    title: "Duration",
    description: "Video duration in seconds."
  })
  declare duration: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const imageUrls: string[] = [];
    for (const img of [this.image1, this.image2, this.image3]) {
      if (isRefSet(img)) imageUrls.push(await uploadImageInput(apiKey, img));
    }
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["sound"] = Boolean(this.sound ?? false);
    params["duration"] = Number(this.duration ?? 5);
    if (imageUrls.length) params["image_urls"] = imageUrls;

    const result = await kieExecuteTask(
      apiKey,
      "kling-2.6/image-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class KlingAIAvatarStandardNode extends BaseNode {
  static readonly nodeType = "kie.video.KlingAIAvatarStandard";
  static readonly title = "Kling AIAvatar Standard";
  static readonly description = `Generate talking avatar videos using Kuaishou's Kling AI via Kie.ai.

    kie, kling, kuaishou, avatar, video generation, ai, talking-head, lip-sync

    Transforms a photo plus audio track into a lip-synced talking avatar video
    with natural-looking speech animation and consistent identity.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The face/character image to animate."
  })
  declare image: any;

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
    description: "The audio track for lip-syncing."
  })
  declare audio: any;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "Optional text to guide emotions and expressions."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "standard",
    values: ["standard", "pro"],
    title: "Mode",
    description: "Generation mode: 'standard' or 'pro' for higher quality."
  })
  declare mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    let audioUrl = "";
    if (isRefSet(this.audio))
      audioUrl = await uploadAudioInput(apiKey, this.audio);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["mode"] = String(this.mode ?? "standard");
    if (imageUrl) params["image_url"] = imageUrl;
    if (audioUrl) params["audio_url"] = audioUrl;

    const result = await kieExecuteTask(
      apiKey,
      "kling/v1-avatar-standard",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class KlingAIAvatarProNode extends BaseNode {
  static readonly nodeType = "kie.video.KlingAIAvatarPro";
  static readonly title = "Kling AIAvatar Pro";
  static readonly description = `Generate talking avatar videos using Kuaishou's Kling AI via Kie.ai.

    kie, kling, kuaishou, avatar, video generation, ai, talking-head, lip-sync

    Transforms a photo plus audio track into a lip-synced talking avatar video
    with natural-looking speech animation and consistent identity.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The face/character image to animate."
  })
  declare image: any;

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
    description: "The audio track for lip-syncing."
  })
  declare audio: any;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "Optional text to guide emotions and expressions."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "standard",
    values: ["standard", "pro"],
    title: "Mode",
    description: "Generation mode: 'standard' or 'pro' for higher quality."
  })
  declare mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    let audioUrl = "";
    if (isRefSet(this.audio))
      audioUrl = await uploadAudioInput(apiKey, this.audio);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["mode"] = String(this.mode ?? "standard");
    if (imageUrl) params["image_url"] = imageUrl;
    if (audioUrl) params["audio_url"] = audioUrl;

    const result = await kieExecuteTask(
      apiKey,
      "kling/v1-avatar-pro",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class GrokImagineTextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.GrokImagineTextToVideo";
  static readonly title = "Grok Imagine Text To Video";
  static readonly description = `Generate videos from text using xAI's Grok Imagine model via Kie.ai.

    kie, grok, xai, video generation, ai, text-to-video, multimodal

    Grok Imagine generates videos from text prompts using xAI's
    multimodal generation capabilities.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["720p", "1080p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "medium",
    values: ["short", "medium", "long"],
    title: "Duration",
    description: "The duration tier of the video."
  })
  declare duration: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["resolution"] = String(this.resolution ?? "1080p");
    params["duration"] = String(this.duration ?? "medium");

    const result = await kieExecuteTask(
      apiKey,
      "grok-imagine/text-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class GrokImagineImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.GrokImagineImageToVideo";
  static readonly title = "Grok Imagine Image To Video";
  static readonly description = `Generate videos from images using xAI's Grok Imagine model via Kie.ai.

    kie, grok, xai, video generation, ai, image-to-video, multimodal

    Grok Imagine transforms images into videos using xAI's
    multimodal generation capabilities.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "Optional text guide for the animation."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The source image to animate."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "medium",
    values: ["short", "medium", "long"],
    title: "Duration",
    description: "The duration tier of the video."
  })
  declare duration: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["duration"] = String(this.duration ?? "medium");
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "grok-imagine/image-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class SeedanceV1LiteTextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.SeedanceV1LiteTextToVideo";
  static readonly title = "Seedance V1 Lite Text To Video";
  static readonly description = `Bytedance 1.0 - text-to-video-lite via Kie.ai.

    kie, seedance, bytedance, video generation, ai, text-to-video, lite

    Seedance V1 Lite offers efficient text-to-video generation
    with good quality and faster processing times.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    title: "Duration",
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    title: "Remove Watermark",
    description: "Whether to remove the watermark from the video."
  })
  declare remove_watermark: any;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");
    params["resolution"] = String(this.resolution ?? "720p");
    params["duration"] = String(this.duration ?? "5");
    params["remove_watermark"] = Boolean(this.remove_watermark ?? true);
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );

    const result = await kieExecuteTask(
      apiKey,
      "seedance/v1-lite-text-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class SeedanceV1ProTextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.SeedanceV1ProTextToVideo";
  static readonly title = "Seedance V1 Pro Text To Video";
  static readonly description = `Bytedance 1.0 - text-to-video-pro via Kie.ai.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    title: "Duration",
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    title: "Remove Watermark",
    description: "Whether to remove the watermark from the video."
  })
  declare remove_watermark: any;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");
    params["resolution"] = String(this.resolution ?? "720p");
    params["duration"] = String(this.duration ?? "5");
    params["remove_watermark"] = Boolean(this.remove_watermark ?? true);
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );

    const result = await kieExecuteTask(
      apiKey,
      "seedance/v1-pro-text-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class SeedanceV1LiteImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.SeedanceV1LiteImageToVideo";
  static readonly title = "Seedance V1 Lite Image To Video";
  static readonly description = `Bytedance 1.0 - image-to-video-lite via Kie.ai.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    title: "Duration",
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    title: "Remove Watermark",
    description: "Whether to remove the watermark from the video."
  })
  declare remove_watermark: any;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "Optional text guide for the video generation."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image1",
    description: "First source image for the video generation."
  })
  declare image1: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image2",
    description: "Second source image (optional)."
  })
  declare image2: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image3",
    description: "Third source image (optional)."
  })
  declare image3: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const imageUrls: string[] = [];
    for (const img of [this.image1, this.image2, this.image3]) {
      if (isRefSet(img)) imageUrls.push(await uploadImageInput(apiKey, img));
    }
    const params: Record<string, unknown> = {};
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");
    params["resolution"] = String(this.resolution ?? "720p");
    params["duration"] = String(this.duration ?? "5");
    params["remove_watermark"] = Boolean(this.remove_watermark ?? true);
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    if (imageUrls.length) params["image_urls"] = imageUrls;

    const result = await kieExecuteTask(
      apiKey,
      "seedance/v1-lite-image-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class SeedanceV1ProImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.SeedanceV1ProImageToVideo";
  static readonly title = "Seedance V1 Pro Image To Video";
  static readonly description = `Bytedance 1.0 - image-to-video-pro via Kie.ai.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    title: "Duration",
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    title: "Remove Watermark",
    description: "Whether to remove the watermark from the video."
  })
  declare remove_watermark: any;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "Optional text guide for the video generation."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image1",
    description: "First source image for the video generation."
  })
  declare image1: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image2",
    description: "Second source image (optional)."
  })
  declare image2: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image3",
    description: "Third source image (optional)."
  })
  declare image3: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const imageUrls: string[] = [];
    for (const img of [this.image1, this.image2, this.image3]) {
      if (isRefSet(img)) imageUrls.push(await uploadImageInput(apiKey, img));
    }
    const params: Record<string, unknown> = {};
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");
    params["resolution"] = String(this.resolution ?? "720p");
    params["duration"] = String(this.duration ?? "5");
    params["remove_watermark"] = Boolean(this.remove_watermark ?? true);
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    if (imageUrls.length) params["image_urls"] = imageUrls;

    const result = await kieExecuteTask(
      apiKey,
      "seedance/v1-pro-image-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class SeedanceV1ProFastImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.SeedanceV1ProFastImageToVideo";
  static readonly title = "Seedance V1 Pro Fast Image To Video";
  static readonly description = `Bytedance 1.0 - fast-image-to-video-pro via Kie.ai.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    title: "Duration",
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    title: "Remove Watermark",
    description: "Whether to remove the watermark from the video."
  })
  declare remove_watermark: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image1",
    description: "First source image for the video generation."
  })
  declare image1: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image2",
    description: "Second source image (optional)."
  })
  declare image2: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image3",
    description: "Third source image (optional)."
  })
  declare image3: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const imageUrls: string[] = [];
    for (const img of [this.image1, this.image2, this.image3]) {
      if (isRefSet(img)) imageUrls.push(await uploadImageInput(apiKey, img));
    }
    const params: Record<string, unknown> = {};
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");
    params["resolution"] = String(this.resolution ?? "720p");
    params["duration"] = String(this.duration ?? "5");
    params["remove_watermark"] = Boolean(this.remove_watermark ?? true);
    if (imageUrls.length) params["image_urls"] = imageUrls;

    const result = await kieExecuteTask(
      apiKey,
      "seedance/v1-pro-fast-image-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class HailuoTextToVideoProNode extends BaseNode {
  static readonly nodeType = "kie.video.HailuoTextToVideoPro";
  static readonly title = "Hailuo 2.3 Pro Text To Video";
  static readonly description = `Generate videos from text using MiniMax's Hailuo 2.3 Pro model via Kie.ai.

    kie, hailuo, minimax, video generation, ai, text-to-video, pro

    Hailuo 2.3 Pro offers the highest quality text-to-video generation with
    realistic motion, detailed textures, and cinematic quality.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "6",
    values: ["6", "10"],
    title: "Duration",
    description:
      "The duration of the video in seconds. 10s is not supported for 1080p."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "768P",
    values: ["768P", "1080P"],
    title: "Resolution",
    description: "Video resolution."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["duration"] = String(this.duration ?? "6");
    params["resolution"] = String(this.resolution ?? "768P");

    const result = await kieExecuteTask(
      apiKey,
      "hailuo/2-3-text-to-video-pro",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class HailuoTextToVideoStandardNode extends BaseNode {
  static readonly nodeType = "kie.video.HailuoTextToVideoStandard";
  static readonly title = "Hailuo 2.3 Standard Text To Video";
  static readonly description = `Generate videos from text using MiniMax's Hailuo 2.3 Standard model via Kie.ai.

    kie, hailuo, minimax, video generation, ai, text-to-video, standard, fast`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "6",
    values: ["6", "10"],
    title: "Duration",
    description:
      "The duration of the video in seconds. 10s is not supported for 1080p."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "768P",
    values: ["768P", "1080P"],
    title: "Resolution",
    description: "Video resolution."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["duration"] = String(this.duration ?? "6");
    params["resolution"] = String(this.resolution ?? "768P");

    const result = await kieExecuteTask(
      apiKey,
      "hailuo/2-3-text-to-video-standard",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class HailuoImageToVideoProNode extends BaseNode {
  static readonly nodeType = "kie.video.HailuoImageToVideoPro";
  static readonly title = "Hailuo 2.3 Pro Image To Video";
  static readonly description = `Generate videos from images using MiniMax's Hailuo 2.3 Pro model via Kie.ai.

    kie, hailuo, minimax, video generation, ai, image-to-video, pro

    Hailuo 2.3 Pro offers the highest quality image-to-video generation with
    realistic motion, detailed textures, and cinematic quality.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The reference image to animate into a video."
  })
  declare image: any;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "Optional text to guide the video generation."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "6",
    values: ["6", "10"],
    title: "Duration",
    description:
      "The duration of the video in seconds. 10s is not supported for 1080p."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "768P",
    values: ["768P", "1080P"],
    title: "Resolution",
    description: "Video resolution."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["duration"] = String(this.duration ?? "6");
    params["resolution"] = String(this.resolution ?? "768P");
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "hailuo/2-3-image-to-video-pro",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class HailuoImageToVideoStandardNode extends BaseNode {
  static readonly nodeType = "kie.video.HailuoImageToVideoStandard";
  static readonly title = "Hailuo 2.3 Standard Image To Video";
  static readonly description = `Generate videos from images using MiniMax's Hailuo 2.3 Standard model via Kie.ai.

    kie, hailuo, minimax, video generation, ai, image-to-video, standard, fast

    Hailuo 2.3 Standard offers efficient image-to-video generation with good quality
    and faster processing times for practical use cases.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The reference image to animate into a video."
  })
  declare image: any;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "Optional text to guide the video generation."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "6",
    values: ["6", "10"],
    title: "Duration",
    description:
      "The duration of the video in seconds. 10s is not supported for 1080p."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "768P",
    values: ["768P", "1080P"],
    title: "Resolution",
    description: "Video resolution."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["duration"] = String(this.duration ?? "6");
    params["resolution"] = String(this.resolution ?? "768P");
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "hailuo/2-3-image-to-video-standard",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Kling25TurboTextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Kling25TurboTextToVideo";
  static readonly title = "Kling 2.5 Turbo Text To Video";
  static readonly description = `Generate videos from text using Kuaishou's Kling 2.5 Turbo model via Kie.ai.

    kie, kling, kuaishou, video generation, ai, text-to-video, turbo

    Kling 2.5 Turbo offers improved prompt adherence, fluid motion,
    consistent artistic styles, and realistic physics simulation.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    title: "Duration",
    description: "Video duration in seconds."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Things to avoid in the generated video."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Cfg Scale",
    description:
      "The CFG scale for prompt adherence. Lower values allow more creativity.",
    min: 0,
    max: 1
  })
  declare cfg_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["duration"] = String(this.duration ?? "5");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");
    params["negative_prompt"] = String(this.negative_prompt ?? "");
    params["cfg_scale"] = Number(this.cfg_scale ?? 0.5);

    const result = await kieExecuteTask(
      apiKey,
      "kling/v2-5-turbo-text-to-video-pro",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Kling25TurboImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Kling25TurboImageToVideo";
  static readonly title = "Kling 2.5 Turbo Image To Video";
  static readonly description = `Generate videos from images using Kuaishou's Kling 2.5 Turbo model via Kie.ai.

    kie, kling, kuaishou, video generation, ai, image-to-video, turbo

    Transforms a static image into a dynamic video while preserving
    visual style, colors, lighting, and texture.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "Text description to guide the video generation."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The source image to animate."
  })
  declare image: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Tail Image",
    description: "Tail frame image for the video (optional)."
  })
  declare tail_image: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    title: "Duration",
    description: "Video duration in seconds."
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Elements to avoid in the video."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Cfg Scale",
    description:
      "The CFG scale for prompt adherence. Lower values allow more creativity.",
    min: 0,
    max: 1
  })
  declare cfg_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["duration"] = String(this.duration ?? "5");
    params["negative_prompt"] = String(this.negative_prompt ?? "");
    params["cfg_scale"] = Number(this.cfg_scale ?? 0.5);
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "kling/v2-5-turbo-image-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Sora2ProTextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Sora2ProTextToVideo";
  static readonly title = "Sora 2 Pro Text To Video";
  static readonly description = `Generate videos from text using Sora 2 Pro via Kie.ai.

    kie, sora, openai, video generation, ai, text-to-video, pro

    Sora 2 Pro generates high-quality videos from text descriptions
    with advanced motion and temporal consistency.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "enum",
    default: "landscape",
    values: ["landscape", "portrait", "square"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: true,
    title: "Remove Watermark",
    description: "Whether to remove the watermark from the video."
  })
  declare remove_watermark: any;

  @prop({
    type: "enum",
    default: "10",
    values: ["10", "15"],
    title: "N Frames",
    description: "Number of frames for the video output."
  })
  declare n_frames: any;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["aspect_ratio"] = String(this.aspect_ratio ?? "landscape");
    params["remove_watermark"] = Boolean(this.remove_watermark ?? true);
    params["n_frames"] = String(this.n_frames ?? "10");
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );

    const result = await kieExecuteTask(
      apiKey,
      "sora-2/pro-text-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Sora2ProImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Sora2ProImageToVideo";
  static readonly title = "Sora 2 Pro Image To Video";
  static readonly description = `Generate videos from images using Sora 2 Pro via Kie.ai.

    kie, sora, openai, video generation, ai, image-to-video, pro

    Sora 2 Pro transforms images into high-quality videos with
    realistic motion and temporal consistency.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "enum",
    default: "landscape",
    values: ["landscape", "portrait", "square"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: true,
    title: "Remove Watermark",
    description: "Whether to remove the watermark from the video."
  })
  declare remove_watermark: any;

  @prop({
    type: "enum",
    default: "10",
    values: ["10", "15"],
    title: "N Frames",
    description: "Number of frames for the video output."
  })
  declare n_frames: any;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "Optional text guide for the video generation."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The source image to animate."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    params["aspect_ratio"] = String(this.aspect_ratio ?? "landscape");
    params["remove_watermark"] = Boolean(this.remove_watermark ?? true);
    params["n_frames"] = String(this.n_frames ?? "10");
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "sora-2/pro-image-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Sora2ProStoryboardNode extends BaseNode {
  static readonly nodeType = "kie.video.Sora2ProStoryboard";
  static readonly title = "Sora 2 Pro Storyboard";
  static readonly description = `Generate videos from storyboards using Sora 2 Pro via Kie.ai.

    kie, sora, openai, video generation, ai, storyboard, pro

    Sora 2 Pro creates videos from storyboard sequences with
    consistent characters and scenes across frames.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "enum",
    default: "landscape",
    values: ["landscape", "portrait", "square"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: true,
    title: "Remove Watermark",
    description: "Whether to remove the watermark from the video."
  })
  declare remove_watermark: any;

  @prop({
    type: "enum",
    default: "10",
    values: ["10", "15", "25"],
    title: "N Frames",
    description: "Number of frames for the video output."
  })
  declare n_frames: any;

  @prop({
    type: "str",
    default: "",
    title: "Shots",
    description: "The shots to generate, with columns: Scene, duration."
  })
  declare shots: any;

  @prop({
    type: "list[image]",
    default: [],
    title: "Images",
    description: "The images to use for the video generation."
  })
  declare images: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const imagesUrls: string[] = [];
    const imagesList = Array.isArray(this.images) ? this.images : [];
    for (const item of imagesList) {
      if (isRefSet(item)) imagesUrls.push(await uploadImageInput(apiKey, item));
    }
    const params: Record<string, unknown> = {};
    params["aspect_ratio"] = String(this.aspect_ratio ?? "landscape");
    params["remove_watermark"] = Boolean(this.remove_watermark ?? true);
    params["n_frames"] = String(this.n_frames ?? "10");
    params["shots"] = String(this.shots ?? "");
    if (imagesUrls.length) params["image_urls"] = imagesUrls;

    const result = await kieExecuteTask(
      apiKey,
      "sora-2/pro-storyboard",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Sora2TextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Sora2TextToVideo";
  static readonly title = "Sora 2 Text To Video";
  static readonly description = `Generate videos from text using Sora 2 Standard via Kie.ai.

    kie, sora, openai, video generation, ai, text-to-video, standard

    Sora 2 Standard generates quality videos from text descriptions
    with efficient processing and good visual quality.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "enum",
    default: "landscape",
    values: ["landscape", "portrait", "square"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: true,
    title: "Remove Watermark",
    description: "Whether to remove the watermark from the video."
  })
  declare remove_watermark: any;

  @prop({
    type: "enum",
    default: "10",
    values: ["10", "15"],
    title: "N Frames",
    description: "Number of frames for the video output."
  })
  declare n_frames: any;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["aspect_ratio"] = String(this.aspect_ratio ?? "landscape");
    params["remove_watermark"] = Boolean(this.remove_watermark ?? true);
    params["n_frames"] = String(this.n_frames ?? "10");
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );

    const result = await kieExecuteTask(
      apiKey,
      "sora-2/text-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class WanMultiShotTextToVideoProNode extends BaseNode {
  static readonly nodeType = "kie.video.WanMultiShotTextToVideoPro";
  static readonly title = "Wan 2.1 Multi-Shot Text To Video";
  static readonly description = `Generate videos from text using Alibaba's Wan 2.1 model via Kie.ai.

    kie, wan, alibaba, video generation, ai, text-to-video, multi-shot, 2.1

    Wan 2.1 Multi-Shot generates complex videos with multiple shots
    and scene transitions from text descriptions.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["720p", "1080p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    title: "Duration",
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    title: "Remove Watermark",
    description: "Whether to remove the watermark from the video."
  })
  declare remove_watermark: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");
    params["resolution"] = String(this.resolution ?? "1080p");
    params["duration"] = String(this.duration ?? "5");
    params["remove_watermark"] = Boolean(this.remove_watermark ?? true);

    const result = await kieExecuteTask(
      apiKey,
      "wan/multi-shot-text-to-video-pro",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Wan26TextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Wan26TextToVideo";
  static readonly title = "Wan 2.6 Text To Video";
  static readonly description = `Generate videos from text using Alibaba's Wan 2.6 model via Kie.ai.

    kie, wan, alibaba, video generation, ai, text-to-video, 2.6

    Wan 2.6 generates high-quality videos from text descriptions
    with advanced motion and visual fidelity.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5s",
    values: ["5s", "10"],
    title: "Duration",
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["1080p", "720p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["duration"] = String(this.duration ?? "5s");
    params["resolution"] = String(this.resolution ?? "1080p");

    const result = await kieExecuteTask(
      apiKey,
      "wan/2-6-text-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Wan26ImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Wan26ImageToVideo";
  static readonly title = "Wan 2.6 Image To Video";
  static readonly description = `Generate videos from images using Alibaba's Wan 2.6 model via Kie.ai.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image1",
    description: "First source image for the video generation."
  })
  declare image1: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image2",
    description: "Second source image (optional)."
  })
  declare image2: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image3",
    description: "Third source image (optional)."
  })
  declare image3: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    title: "Duration",
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["1080p", "720p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let image1Url = "";
    if (isRefSet(this.image1))
      image1Url = await uploadImageInput(apiKey, this.image1);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["duration"] = String(this.duration ?? "5");
    params["resolution"] = String(this.resolution ?? "1080p");
    if (image1Url) params["image_url"] = image1Url;

    const result = await kieExecuteTask(
      apiKey,
      "wan/2-6-image-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Wan26VideoToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Wan26VideoToVideo";
  static readonly title = "Wan 2.6 Video To Video";
  static readonly description = `Generate videos from videos using Alibaba's Wan 2.6 model via Kie.ai.

    kie, wan, alibaba, video generation, ai, video-to-video, 2.6

    Wan 2.6 transforms and enhances existing videos with AI-powered
    editing and style transfer capabilities.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the changes."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video1",
    description: "First source video for the video-to-video task."
  })
  declare video1: any;

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video2",
    description: "Second source video (optional)."
  })
  declare video2: any;

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video3",
    description: "Third source video (optional)."
  })
  declare video3: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    title: "Duration",
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["1080p", "720p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let video1Url = "";
    if (isRefSet(this.video1))
      video1Url = await uploadVideoInput(apiKey, this.video1);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["duration"] = String(this.duration ?? "5");
    params["resolution"] = String(this.resolution ?? "1080p");
    if (video1Url) params["video_url"] = video1Url;

    const result = await kieExecuteTask(
      apiKey,
      "wan/2-6-video-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class TopazVideoUpscaleNode extends BaseNode {
  static readonly nodeType = "kie.video.TopazVideoUpscale";
  static readonly title = "Topaz Video Upscale";
  static readonly description = `Upscale and enhance videos using Topaz Labs AI via Kie.ai.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The video to upscale."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["1080p", "4k"],
    title: "Resolution",
    description: "Target resolution for upscaling."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: true,
    title: "Denoise",
    description: "Apply denoising to reduce artifacts."
  })
  declare denoise: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let videoUrl = "";
    if (isRefSet(this.video))
      videoUrl = await uploadVideoInput(apiKey, this.video);
    const params: Record<string, unknown> = {};
    params["resolution"] = String(this.resolution ?? "1080p");
    params["denoise"] = Boolean(this.denoise ?? true);
    if (videoUrl) params["video_url"] = videoUrl;

    const result = await kieExecuteTask(
      apiKey,
      "topaz/video-upscale",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class InfinitalkV1Node extends BaseNode {
  static readonly nodeType = "kie.video.InfinitalkV1";
  static readonly title = "Infinitalk V1";
  static readonly description = `Generate videos using Infinitalk v1 (image-to-video) via Kie.ai.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "Optional text guide for the video generation."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The source image."
  })
  declare image: any;

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
    description: "The source audio track."
  })
  declare audio: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p"],
    title: "Resolution",
    description: "Video resolution."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    let audioUrl = "";
    if (isRefSet(this.audio))
      audioUrl = await uploadAudioInput(apiKey, this.audio);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["resolution"] = String(this.resolution ?? "480p");
    if (imageUrl) params["image_url"] = imageUrl;
    if (audioUrl) params["audio_url"] = audioUrl;

    const result = await kieExecuteTask(
      apiKey,
      "infinitalk/v1",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Veo31TextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Veo31TextToVideo";
  static readonly title = "Veo 31 Text To Video";
  static readonly description = `Generate videos from text using Google's Veo 3.1 via Kie.ai.

    kie, google, veo, veo3, veo3.1, video generation, ai, text-to-video

    Veo 3.1 offers native 9:16 vertical video support, multilingual prompt processing,
    and significant cost savings (25% of Google's direct API pricing).`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "enum",
    default: "veo3_fast",
    values: ["veo3", "veo3_fast"],
    title: "Model",
    description: "The model to use for video generation."
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16"],
    title: "Aspect Ratio",
    description: "Video aspect ratio."
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    title: "Call Back Url",
    description: "Optional callback URL for task completion."
  })
  declare call_back_url: any;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["model"] = String(this.model ?? "veo3_fast");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");
    params["call_back_url"] = String(this.call_back_url ?? "");
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );

    const result = await kieExecuteTask(
      apiKey,
      "veo-3-1/text-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class RunwayGen3AlphaTextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.RunwayGen3AlphaTextToVideo";
  static readonly title = "Runway Gen-3 Alpha Text To Video";
  static readonly description = `Generate videos from text using Runway's Gen-3 Alpha model via Kie.ai.

    kie, runway, gen-3, gen3alpha, video generation, ai, text-to-video

    Runway Gen-3 Alpha produces high-quality videos from text descriptions
    with advanced motion and temporal consistency.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "4:3", "1:1", "3:4", "9:16"],
    title: "Aspect Ratio",
    description:
      "The aspect ratio of the generated video. Required for text-to-video generation."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    title: "Duration",
    description:
      "Video duration in seconds. If 10-second video is selected, 1080p resolution cannot be used."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    title: "Quality",
    description:
      "Video resolution. If 1080p is selected, 10-second video cannot be generated."
  })
  declare quality: any;

  @prop({
    type: "str",
    default: "",
    title: "Water Mark",
    description:
      "Video watermark text content. An empty string indicates no watermark."
  })
  declare water_mark: any;

  @prop({
    type: "str",
    default: "",
    title: "Call Back Url",
    description: "Optional callback URL to receive task completion updates."
  })
  declare call_back_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");
    params["duration"] = String(this.duration ?? "5");
    params["quality"] = String(this.quality ?? "720p");
    params["water_mark"] = String(this.water_mark ?? "");
    params["call_back_url"] = String(this.call_back_url ?? "");

    const result = await kieExecuteTask(
      apiKey,
      "runway/gen3-alpha-text-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class RunwayGen3AlphaImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.RunwayGen3AlphaImageToVideo";
  static readonly title = "Runway Gen-3 Alpha Image To Video";
  static readonly description = `Generate videos from images using Runway's Gen-3 Alpha model via Kie.ai.

    kie, runway, gen-3, gen3alpha, video generation, ai, image-to-video

    Runway Gen-3 Alpha transforms static images into dynamic videos
    with realistic motion and temporal consistency.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "Reference image to base the video on."
  })
  declare image: any;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description:
      "Optional text to guide the video generation. Maximum length is 1800 characters."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    title: "Duration",
    description:
      "Video duration in seconds. If 10-second video is selected, 1080p resolution cannot be used."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    title: "Quality",
    description:
      "Video resolution. If 1080p is selected, 10-second video cannot be generated."
  })
  declare quality: any;

  @prop({
    type: "str",
    default: "",
    title: "Water Mark",
    description:
      "Video watermark text content. An empty string indicates no watermark."
  })
  declare water_mark: any;

  @prop({
    type: "str",
    default: "",
    title: "Call Back Url",
    description: "Optional callback URL to receive task completion updates."
  })
  declare call_back_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["duration"] = String(this.duration ?? "5");
    params["quality"] = String(this.quality ?? "720p");
    params["water_mark"] = String(this.water_mark ?? "");
    params["call_back_url"] = String(this.call_back_url ?? "");
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "runway/gen3-alpha-image-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class RunwayGen3AlphaExtendVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.RunwayGen3AlphaExtendVideo";
  static readonly title = "Runway Gen-3 Alpha Extend Video";
  static readonly description = `Extend videos using Runway's Gen-3 Alpha model via Kie.ai.

    kie, runway, gen-3, gen3alpha, video generation, ai, video-extension

    Runway Gen-3 Alpha can extend existing videos with additional generated content.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Video Url",
    description: "The source video URL to extend."
  })
  declare video_url: any;

  @prop({
    type: "str",
    default: "Continue the motion naturally with smooth transitions.",
    title: "Prompt",
    description:
      "Text prompt to guide the video extension. Maximum length is 1800 characters."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    title: "Duration",
    description:
      "Duration to extend the video by in seconds. If 10-second extension is selected, 1080p resolution cannot be used."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    title: "Quality",
    description:
      "Video resolution. If 1080p is selected, 10-second extension cannot be generated."
  })
  declare quality: any;

  @prop({
    type: "str",
    default: "",
    title: "Water Mark",
    description:
      "Video watermark text content. An empty string indicates no watermark."
  })
  declare water_mark: any;

  @prop({
    type: "str",
    default: "",
    title: "Call Back Url",
    description: "Optional callback URL to receive task completion updates."
  })
  declare call_back_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const params: Record<string, unknown> = {};
    params["video_url"] = String(this.video_url ?? "");
    params["prompt"] = String(
      this.prompt ?? "Continue the motion naturally with smooth transitions."
    );
    params["duration"] = String(this.duration ?? "5");
    params["quality"] = String(this.quality ?? "720p");
    params["water_mark"] = String(this.water_mark ?? "");
    params["call_back_url"] = String(this.call_back_url ?? "");

    const result = await kieExecuteTask(
      apiKey,
      "runway/gen3-alpha-extend-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class RunwayAlephVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.RunwayAlephVideo";
  static readonly title = "Runway Aleph Video";
  static readonly description = `Generate videos using Runway's Aleph model via Kie.ai.

    kie, runway, aleph, video generation, ai, text-to-video

    Aleph is Runway's advanced video generation model offering
    high-quality output with sophisticated motion handling.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    title: "Aspect Ratio",
    description:
      "The aspect ratio of the generated video. Required for text-to-video generation."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    title: "Duration",
    description:
      "Video duration in seconds. If 10-second video is selected, 1080p resolution cannot be used."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    title: "Quality",
    description:
      "Video resolution. If 1080p is selected, 10-second video cannot be generated."
  })
  declare quality: any;

  @prop({
    type: "str",
    default: "",
    title: "Water Mark",
    description:
      "Video watermark text content. An empty string indicates no watermark."
  })
  declare water_mark: any;

  @prop({
    type: "str",
    default: "",
    title: "Call Back Url",
    description: "Optional callback URL to receive task completion updates."
  })
  declare call_back_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");
    params["duration"] = String(this.duration ?? "5");
    params["quality"] = String(this.quality ?? "720p");
    params["water_mark"] = String(this.water_mark ?? "");
    params["call_back_url"] = String(this.call_back_url ?? "");

    const result = await kieExecuteTask(
      apiKey,
      "runway/aleph-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class LumaModifyVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.LumaModifyVideo";
  static readonly title = "Luma Modify Video";
  static readonly description = `Modify and enhance videos using Luma's API via Kie.ai.

    kie, luma, video modification, ai, video-editing

    Luma's video modification API allows for sophisticated video editing
    and enhancement capabilities.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The source video to modify."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "Enhance the video quality and add smooth motion.",
    title: "Prompt",
    description: "Text prompt describing the modifications to make."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the output video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    title: "Duration",
    description: "Duration of the modified video segment."
  })
  declare duration: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let videoUrl = "";
    if (isRefSet(this.video))
      videoUrl = await uploadVideoInput(apiKey, this.video);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ?? "Enhance the video quality and add smooth motion."
    );
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");
    params["duration"] = String(this.duration ?? "5");
    if (videoUrl) params["video_url"] = videoUrl;

    const result = await kieExecuteTask(
      apiKey,
      "luma/modify-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Veo31ImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Veo31ImageToVideo";
  static readonly title = "Veo 3.1 Image To Video";
  static readonly description = `Generate videos from images using Google's Veo 3.1 model via Kie.ai.

    kie, google, veo, veo3, veo3.1, video generation, ai, image-to-video, i2v

    Supports single image (image comes alive) or two images (first and last frames transition).
    For two images, the first image serves as the video's first frame and the second as the last frame.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "enum",
    default: "veo3_fast",
    values: ["veo3", "veo3_fast"],
    title: "Model",
    description: "The model to use for video generation."
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16"],
    title: "Aspect Ratio",
    description: "Video aspect ratio."
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    title: "Call Back Url",
    description: "Optional callback URL for task completion."
  })
  declare call_back_url: any;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description:
      "Optional text prompt describing how the image should come alive."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image1",
    description:
      "First source image. Required. Serves as the video's first frame."
  })
  declare image1: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image2",
    description:
      "Second source image (optional). If provided, serves as the video's last frame."
  })
  declare image2: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let image1Url = "";
    if (isRefSet(this.image1))
      image1Url = await uploadImageInput(apiKey, this.image1);
    const params: Record<string, unknown> = {};
    params["model"] = String(this.model ?? "veo3_fast");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");
    params["call_back_url"] = String(this.call_back_url ?? "");
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    if (image1Url) params["image_url"] = image1Url;

    const result = await kieExecuteTask(
      apiKey,
      "veo-3-1/image-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Veo31ReferenceToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Veo31ReferenceToVideo";
  static readonly title = "Veo 3.1 Reference To Video";
  static readonly description = `Generate videos from reference images using Google's Veo 3.1 Fast model via Kie.ai.

    kie, google, veo, veo3, veo3.1, video generation, ai, reference-to-video, material-to-video

    Material-to-video generation based on reference images. Only supports veo3_fast model
    and requires 1-3 reference images.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "enum",
    default: "veo3_fast",
    values: ["veo3", "veo3_fast"],
    title: "Model",
    description: "The model to use for video generation."
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16"],
    title: "Aspect Ratio",
    description: "Video aspect ratio."
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    title: "Call Back Url",
    description: "Optional callback URL for task completion."
  })
  declare call_back_url: any;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "Text prompt describing the desired video content."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image1",
    description: "First reference image. Required. Minimum 1, maximum 3 images."
  })
  declare image1: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image2",
    description: "Second reference image (optional)."
  })
  declare image2: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image3",
    description: "Third reference image (optional)."
  })
  declare image3: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const imageUrls: string[] = [];
    for (const img of [this.image1, this.image2, this.image3]) {
      if (isRefSet(img)) imageUrls.push(await uploadImageInput(apiKey, img));
    }
    const params: Record<string, unknown> = {};
    params["model"] = String(this.model ?? "veo3_fast");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");
    params["call_back_url"] = String(this.call_back_url ?? "");
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    if (imageUrls.length) params["image_urls"] = imageUrls;

    const result = await kieExecuteTask(
      apiKey,
      "veo-3-1/reference-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class KlingMotionControlNode extends BaseNode {
  static readonly nodeType = "kie.video.KlingMotionControl";
  static readonly title = "Kling 2.6 Motion Control";
  static readonly description = `Generate videos with motion control using Kuaishou's Kling 2.6 model via Kie.ai.

    kie, kling, kuaishou, video generation, ai, motion-control, character-animation, 2.6

    Kling Motion Control generates videos where character actions are guided by a reference video,
    while the visual appearance is based on a reference image. Perfect for character animation
    and motion transfer tasks.`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "The cartoon character is dancing.",
    title: "Prompt",
    description:
      "A text description of the desired output. Maximum 2500 characters."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description:
      "Reference image. The characters, backgrounds, and other elements in the generated video are based on this image. Supports .jpg/.jpeg/.png, max 10MB, size needs to be greater than 300px, aspect ratio 2:5 to 5:2."
  })
  declare image: any;

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description:
      "Reference video. The character actions in the generated video will be consistent with this reference video. Supports .mp4/.mov, max 100MB, 3-30 seconds duration depending on character_orientation."
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "video",
    values: ["image", "video"],
    title: "Character Orientation",
    description:
      "Generate the orientation of the characters in the video. 'image': same orientation as the person in the picture (max 10s video). 'video': consistent with the orientation of the characters in the video (max 30s video)."
  })
  declare character_orientation: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    title: "Mode",
    description:
      "Output resolution mode. Use '720p' for 720p or '1080p' for 1080p."
  })
  declare mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ?? "The cartoon character is dancing."
    );
    params["character_orientation"] = String(
      this.character_orientation ?? "video"
    );
    params["mode"] = String(this.mode ?? "720p");
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "kling/motion-control",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Kling21TextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Kling21TextToVideo";
  static readonly title = "Kling 2.1 Text To Video";
  static readonly description = `Generate videos from text using Kuaishou's Kling 2.1 model via Kie.ai.

    kie, kling, kuaishou, video generation, ai, text-to-video, 2.1

    Kling 2.1 powers cutting-edge video generation with hyper-realistic motion,
    advanced physics, and high-resolution outputs up to 1080p.

    Use cases:
    - Generate high-quality videos from text descriptions
    - Create dynamic, professional-grade video content
    - Produce videos with realistic motion and physics`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "int",
    default: 5,
    title: "Duration",
    description: "Video duration in seconds.",
    min: 1,
    max: 10
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720P",
    values: ["720P", "1080P"],
    title: "Resolution",
    description: "Video resolution."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "standard",
    values: ["standard", "pro"],
    title: "Mode",
    description: "Generation mode: standard or pro for higher quality."
  })
  declare mode: any;

  @prop({
    type: "int",
    default: -1,
    title: "Seed",
    description: "Random seed for reproducible results. Use -1 for random seed."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");
    params["duration"] = Number(this.duration ?? 5);
    params["resolution"] = String(this.resolution ?? "720P");
    params["mode"] = String(this.mode ?? "standard");
    params["seed"] = Number(this.seed ?? -1);

    const result = await kieExecuteTask(
      apiKey,
      "kling/v2-1-text-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Kling21ImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Kling21ImageToVideo";
  static readonly title = "Kling 2.1 Image To Video";
  static readonly description = `Generate videos from images using Kuaishou's Kling 2.1 model via Kie.ai.

    kie, kling, kuaishou, video generation, ai, image-to-video, 2.1

    Kling 2.1 transforms static images into dynamic videos with hyper-realistic
    motion and advanced physics simulation.

    Use cases:
    - Animate static images with realistic motion
    - Create videos from photos and artwork
    - Produce dynamic content from still images`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "Text prompt to guide the video generation."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image1",
    description: "First source image for the video generation."
  })
  declare image1: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image2",
    description: "Second source image (optional)."
  })
  declare image2: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image3",
    description: "Third source image (optional)."
  })
  declare image3: any;

  @prop({
    type: "bool",
    default: false,
    title: "Sound",
    description: "Whether to generate sound for the video."
  })
  declare sound: any;

  @prop({
    type: "int",
    default: 5,
    title: "Duration",
    description: "Video duration in seconds."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "standard",
    values: ["standard", "pro"],
    title: "Mode",
    description: "Generation mode: standard or pro for higher quality."
  })
  declare mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let image1Url = "";
    if (isRefSet(this.image1))
      image1Url = await uploadImageInput(apiKey, this.image1);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["sound"] = Boolean(this.sound ?? false);
    params["duration"] = Number(this.duration ?? 5);
    params["mode"] = String(this.mode ?? "standard");
    if (image1Url) params["image_url"] = image1Url;

    const result = await kieExecuteTask(
      apiKey,
      "kling/v2-1-image-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Wan25TextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Wan25TextToVideo";
  static readonly title = "Wan 2.5 Text To Video";
  static readonly description = `Generate videos from text using Alibaba's Wan 2.5 model via Kie.ai.

    kie, wan, alibaba, video generation, ai, text-to-video, 2.5

    Wan 2.5 is designed for cinematic AI video generation with native audio
    synchronization including dialogue, ambient sound, and background music.

    Use cases:
    - Generate cinematic videos from text descriptions
    - Create videos with synchronized audio
    - Produce content for social media and advertising`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5s",
    values: ["5s", "10s"],
    title: "Duration",
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["1080p", "720p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["duration"] = String(this.duration ?? "5s");
    params["resolution"] = String(this.resolution ?? "1080p");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");

    const result = await kieExecuteTask(
      apiKey,
      "wan/2-5-text-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Wan25ImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Wan25ImageToVideo";
  static readonly title = "Wan 2.5 Image To Video";
  static readonly description = `Generate videos from images using Alibaba's Wan 2.5 model via Kie.ai.

    kie, wan, alibaba, video generation, ai, image-to-video, 2.5

    Wan 2.5 transforms images into cinematic videos with native audio
    synchronization.

    Use cases:
    - Animate static images with cinematic quality
    - Create videos from photos with audio
    - Produce dynamic content from still images`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image1",
    description: "First source image for the video generation."
  })
  declare image1: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image2",
    description: "Second source image (optional)."
  })
  declare image2: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image3",
    description: "Third source image (optional)."
  })
  declare image3: any;

  @prop({
    type: "enum",
    default: "5s",
    values: ["5s", "10s"],
    title: "Duration",
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["1080p", "720p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let image1Url = "";
    if (isRefSet(this.image1))
      image1Url = await uploadImageInput(apiKey, this.image1);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["duration"] = String(this.duration ?? "5s");
    params["resolution"] = String(this.resolution ?? "1080p");
    if (image1Url) params["image_url"] = image1Url;

    const result = await kieExecuteTask(
      apiKey,
      "wan/2-5-image-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class WanAnimateNode extends BaseNode {
  static readonly nodeType = "kie.video.WanAnimate";
  static readonly title = "Wan 2.2 Animate";
  static readonly description = `Generate character animation videos using Alibaba's Wan 2.2 Animate via Kie.ai.

    kie, wan, alibaba, video generation, ai, image-to-video, animate, character

    Wan 2.2 Animate generates realistic character videos with motion, expressions,
    and lighting from static images.

    Use cases:
    - Animate character images with realistic motion
    - Create character-driven video content
    - Produce animated videos from portraits or character art`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "The character is moving naturally with realistic expressions.",
    title: "Prompt",
    description: "The text prompt describing the character animation."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "Character image to animate."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "3",
    values: ["3", "5"],
    title: "Duration",
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "The character is moving naturally with realistic expressions."
    );
    params["duration"] = String(this.duration ?? "3");
    params["resolution"] = String(this.resolution ?? "720p");
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "wan/animate",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class WanSpeechToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.WanSpeechToVideo";
  static readonly title = "Wan 2.2 Speech To Video";
  static readonly description = `Generate videos from speech using Alibaba's Wan 2.2 A14B Turbo via Kie.ai.

    kie, wan, alibaba, video generation, ai, speech-to-video, lip-sync

    Wan 2.2 A14B Turbo Speech to Video turns static images and audio clips
    into dynamic, expressive videos.

    Use cases:
    - Create talking head videos from images and audio
    - Generate lip-synced content for presentations
    - Produce dynamic videos from voice recordings`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "Character/face image to animate."
  })
  declare image: any;

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
    description: "Audio file for speech/lip-sync."
  })
  declare audio: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    let audioUrl = "";
    if (isRefSet(this.audio))
      audioUrl = await uploadAudioInput(apiKey, this.audio);
    const params: Record<string, unknown> = {};
    params["resolution"] = String(this.resolution ?? "720p");
    if (imageUrl) params["image_url"] = imageUrl;
    if (audioUrl) params["audio_url"] = audioUrl;

    const result = await kieExecuteTask(
      apiKey,
      "wan/speech-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Wan22TextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Wan22TextToVideo";
  static readonly title = "Wan 2.2 Text To Video";
  static readonly description = `Generate videos from text using Alibaba's Wan 2.2 A14B Turbo via Kie.ai.

    kie, wan, alibaba, video generation, ai, text-to-video, 2.2

    Wan 2.2 A14B Turbo delivers smooth 720p@24fps clips with cinematic quality,
    stable motion, and consistent visual style.

    Use cases:
    - Generate high-quality videos from text
    - Create content for diverse creative uses
    - Produce consistent video clips with stable motion`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "3",
    values: ["3", "5"],
    title: "Duration",
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["duration"] = String(this.duration ?? "3");
    params["resolution"] = String(this.resolution ?? "720p");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");

    const result = await kieExecuteTask(
      apiKey,
      "wan/2-2-text-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Wan22ImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Wan22ImageToVideo";
  static readonly title = "Wan 2.2 Image To Video";
  static readonly description = `Generate videos from images using Alibaba's Wan 2.2 A14B Turbo via Kie.ai.

    kie, wan, alibaba, video generation, ai, image-to-video, 2.2

    Wan 2.2 A14B Turbo transforms images into smooth video clips with
    cinematic quality and stable motion.

    Use cases:
    - Animate static images with smooth motion
    - Create videos from photos or artwork
    - Produce consistent video content from images`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "Source image for the video generation."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "3",
    values: ["3", "5"],
    title: "Duration",
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["duration"] = String(this.duration ?? "3");
    params["resolution"] = String(this.resolution ?? "720p");
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "wan/2-2-image-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Hailuo02TextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Hailuo02TextToVideo";
  static readonly title = "Hailuo 02 Text To Video";
  static readonly description = `Generate videos from text using Minimax's Hailuo 02 model via Kie.ai.

    kie, hailuo, minimax, video generation, ai, text-to-video

    Hailuo 02 is Minimax's advanced AI video generation model that produces
    short, cinematic clips with realistic motion and physics simulation.

    Use cases:
    - Generate cinematic video clips from text
    - Create videos with realistic motion and physics
    - Produce high-quality content up to 1080P`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    title: "Duration",
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video."
  })
  declare aspect_ratio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["duration"] = String(this.duration ?? "5");
    params["resolution"] = String(this.resolution ?? "720p");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");

    const result = await kieExecuteTask(
      apiKey,
      "hailuo/0-2-text-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Hailuo02ImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Hailuo02ImageToVideo";
  static readonly title = "Hailuo 02 Image To Video";
  static readonly description = `Generate videos from images using Minimax's Hailuo 02 model via Kie.ai.

    kie, hailuo, minimax, video generation, ai, image-to-video

    Hailuo 02 transforms images into cinematic clips with realistic motion
    and physics simulation.

    Use cases:
    - Animate images with realistic motion
    - Create videos from photos with physics simulation
    - Produce dynamic content from still images`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default:
      "A cinematic video with smooth motion, natural lighting, and high detail.",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "Source image for the video generation."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "5",
    values: ["5", "10"],
    title: "Duration",
    description: "The duration of the video in seconds."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    title: "Resolution",
    description: "The resolution of the video."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(
      this.prompt ??
        "A cinematic video with smooth motion, natural lighting, and high detail."
    );
    params["duration"] = String(this.duration ?? "5");
    params["resolution"] = String(this.resolution ?? "720p");
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "hailuo/0-2-image-to-video",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export class Sora2WatermarkRemoverNode extends BaseNode {
  static readonly nodeType = "kie.video.Sora2WatermarkRemover";
  static readonly title = "Sora 2 Watermark Remover";
  static readonly description = `Remove watermarks from Sora 2 videos using Kie.ai.

    kie, sora, openai, video editing, watermark removal

    Sora 2 Watermark Remover uses AI detection and motion tracking to remove
    dynamic watermarks from Sora 2 videos while keeping frames smooth and natural.

    Use cases:
    - Remove watermarks from generated videos
    - Clean up video content for final output
    - Prepare videos for professional use`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "Video to remove watermark from. Must be publicly accessible."
  })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let videoUrl = "";
    if (isRefSet(this.video))
      videoUrl = await uploadVideoInput(apiKey, this.video);
    const params: Record<string, unknown> = {};
    if (videoUrl) params["video_url"] = videoUrl;

    const result = await kieExecuteTask(
      apiKey,
      "sora-2/watermark-remover",
      params,
      8000,
      450
    );
    return { output: { type: "video", data: result.data } };
  }
}

export const KIE_VIDEO_NODES: readonly NodeClass[] = [
  KlingTextToVideoNode,
  KlingImageToVideoNode,
  KlingAIAvatarStandardNode,
  KlingAIAvatarProNode,
  GrokImagineTextToVideoNode,
  GrokImagineImageToVideoNode,
  SeedanceV1LiteTextToVideoNode,
  SeedanceV1ProTextToVideoNode,
  SeedanceV1LiteImageToVideoNode,
  SeedanceV1ProImageToVideoNode,
  SeedanceV1ProFastImageToVideoNode,
  HailuoTextToVideoProNode,
  HailuoTextToVideoStandardNode,
  HailuoImageToVideoProNode,
  HailuoImageToVideoStandardNode,
  Kling25TurboTextToVideoNode,
  Kling25TurboImageToVideoNode,
  Sora2ProTextToVideoNode,
  Sora2ProImageToVideoNode,
  Sora2ProStoryboardNode,
  Sora2TextToVideoNode,
  WanMultiShotTextToVideoProNode,
  Wan26TextToVideoNode,
  Wan26ImageToVideoNode,
  Wan26VideoToVideoNode,
  TopazVideoUpscaleNode,
  InfinitalkV1Node,
  Veo31TextToVideoNode,
  RunwayGen3AlphaTextToVideoNode,
  RunwayGen3AlphaImageToVideoNode,
  RunwayGen3AlphaExtendVideoNode,
  RunwayAlephVideoNode,
  LumaModifyVideoNode,
  Veo31ImageToVideoNode,
  Veo31ReferenceToVideoNode,
  KlingMotionControlNode,
  Kling21TextToVideoNode,
  Kling21ImageToVideoNode,
  Wan25TextToVideoNode,
  Wan25ImageToVideoNode,
  WanAnimateNode,
  WanSpeechToVideoNode,
  Wan22TextToVideoNode,
  Wan22ImageToVideoNode,
  Hailuo02TextToVideoNode,
  Hailuo02ImageToVideoNode,
  Sora2WatermarkRemoverNode
] as const;
