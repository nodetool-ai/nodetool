import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getApiKey,
  kieExecuteTask,
  uploadImageInput,
  uploadAudioInput,
  uploadVideoInput,
  isRefSet,
} from "./kie-base.js";

// ---------------------------------------------------------------------------
// 1. KlingTextToVideo
// ---------------------------------------------------------------------------
export class KlingTextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.KlingTextToVideo";
            static readonly title = "Kling 2.6 Text To Video";
            static readonly description = "Generate videos from text using Kuaishou's Kling 2.6 model via Kie.ai.\n\n    kie, kling, kuaishou, video generation, ai, text-to-video, 2.6\n\n    Kling 2.6 produces high-quality videos from text descriptions with\n    realistic motion, natural lighting, and cinematic detail.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "The aspect ratio of the generated video.", values: [
  "16:9",
  "9:16",
  "1:1"
] })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 5, title: "Duration", description: "Video duration in seconds.", min: 1, max: 10 })
  declare duration: any;

  @prop({ type: "enum", default: "768P", title: "Resolution", description: "Video resolution.", values: [
  "768P"
] })
  declare resolution: any;

  @prop({ type: "int", default: -1, title: "Seed", description: "Random seed for reproducible results. Use -1 for random seed." })
  declare seed: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const result = await kieExecuteTask(
      apiKey,
      "kling-2.6/text-to-video",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        resolution: String(inputs.resolution ?? "768P"),
        duration: String(inputs.duration ?? "5"),
        seed: Number(inputs.seed ?? -1),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 2. KlingImageToVideo
// ---------------------------------------------------------------------------
export class KlingImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.KlingImageToVideo";
            static readonly title = "Kling 2.6 Image To Video";
            static readonly description = "Generate videos from images using Kuaishou's Kling 2.6 model via Kie.ai.\n\n    kie, kling, kuaishou, video generation, ai, image-to-video, 2.6\n\n    Transforms static images into dynamic videos with realistic motion\n    and temporal consistency while preserving the original visual style.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "Optional text prompt to guide the video generation." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image1", description: "First source image for the video generation." })
  declare image1: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image2", description: "Second source image (optional)." })
  declare image2: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image3", description: "Third source image (optional)." })
  declare image3: any;

  @prop({ type: "bool", default: false, title: "Sound", description: "Whether to generate sound for the video." })
  declare sound: any;

  @prop({ type: "int", default: 5, title: "Duration", description: "Video duration in seconds." })
  declare duration: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_urls: string[] = [];
    for (const img of [inputs.image1, inputs.image2, inputs.image3]) {
      if (isRefSet(img)) image_urls.push(await uploadImageInput(apiKey, img));
    }
    if (image_urls.length === 0) throw new Error("At least one image is required");
    const result = await kieExecuteTask(
      apiKey,
      "kling-2.6/image-to-video",
      {
        prompt: String(inputs.prompt ?? ""),
        image_urls,
        sound: Boolean(inputs.sound ?? false),
        duration: String(inputs.duration ?? "5"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 3. KlingAIAvatarStandard
// ---------------------------------------------------------------------------
export class KlingAIAvatarStandardNode extends BaseNode {
  static readonly nodeType = "kie.video.KlingAIAvatarStandard";
            static readonly title = "Kling AIAvatar Standard";
            static readonly description = "Generate talking avatar videos using Kuaishou's Kling AI via Kie.ai.\n\n    kie, kling, kuaishou, avatar, video generation, ai, talking-head, lip-sync\n\n    Transforms a photo plus audio track into a lip-synced talking avatar video\n    with natural-looking speech animation and consistent identity.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "The face/character image to animate." })
  declare image: any;

  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Audio", description: "The audio track for lip-syncing." })
  declare audio: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "Optional text to guide emotions and expressions." })
  declare prompt: any;

  @prop({ type: "enum", default: "standard", title: "Mode", description: "Generation mode: 'standard' or 'pro' for higher quality.", values: [
  "standard",
  "pro"
] })
  declare mode: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const audio_url = await uploadAudioInput(apiKey, inputs.audio);
    const result = await kieExecuteTask(
      apiKey,
      "kling/v1-avatar-standard",
      {
        image_url,
        audio_url,
        prompt: String(inputs.prompt ?? ""),
        mode: String(inputs.mode ?? "standard"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 4. KlingAIAvatarPro
// ---------------------------------------------------------------------------
export class KlingAIAvatarProNode extends BaseNode {
  static readonly nodeType = "kie.video.KlingAIAvatarPro";
            static readonly title = "Kling AIAvatar Pro";
            static readonly description = "Generate talking avatar videos using Kuaishou's Kling AI via Kie.ai.\n\n    kie, kling, kuaishou, avatar, video generation, ai, talking-head, lip-sync\n\n    Transforms a photo plus audio track into a lip-synced talking avatar video\n    with natural-looking speech animation and consistent identity.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "The face/character image to animate." })
  declare image: any;

  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Audio", description: "The audio track for lip-syncing." })
  declare audio: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "Optional text to guide emotions and expressions." })
  declare prompt: any;

  @prop({ type: "enum", default: "standard", title: "Mode", description: "Generation mode: 'standard' or 'pro' for higher quality.", values: [
  "standard",
  "pro"
] })
  declare mode: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const audio_url = await uploadAudioInput(apiKey, inputs.audio);
    const result = await kieExecuteTask(
      apiKey,
      "kling/v1-avatar-pro",
      {
        image_url,
        audio_url,
        prompt: String(inputs.prompt ?? ""),
        mode: String(inputs.mode ?? "standard"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 5. GrokImagineTextToVideo
// ---------------------------------------------------------------------------
export class GrokImagineTextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.GrokImagineTextToVideo";
            static readonly title = "Grok Imagine Text To Video";
            static readonly description = "Generate videos from text using xAI's Grok Imagine model via Kie.ai.\n\n    kie, grok, xai, video generation, ai, text-to-video, multimodal\n\n    Grok Imagine generates videos from text prompts using xAI's\n    multimodal generation capabilities.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;

  @prop({ type: "enum", default: "1080p", title: "Resolution", description: "The resolution of the video.", values: [
  "720p",
  "1080p"
] })
  declare resolution: any;

  @prop({ type: "enum", default: "medium", title: "Duration", description: "The duration tier of the video.", values: [
  "short",
  "medium",
  "long"
] })
  declare duration: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const result = await kieExecuteTask(
      apiKey,
      "grok-imagine/text-to-video",
      {
        prompt,
        resolution: String(inputs.resolution ?? "1080p"),
        duration: String(inputs.duration ?? "medium"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 6. GrokImagineImageToVideo
// ---------------------------------------------------------------------------
export class GrokImagineImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.GrokImagineImageToVideo";
            static readonly title = "Grok Imagine Image To Video";
            static readonly description = "Generate videos from images using xAI's Grok Imagine model via Kie.ai.\n\n    kie, grok, xai, video generation, ai, image-to-video, multimodal\n\n    Grok Imagine transforms images into videos using xAI's\n    multimodal generation capabilities.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "Optional text guide for the animation." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "The source image to animate." })
  declare image: any;

  @prop({ type: "enum", default: "medium", title: "Duration", description: "The duration tier of the video.", values: [
  "short",
  "medium",
  "long"
] })
  declare duration: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "grok-imagine/image-to-video",
      {
        prompt: String(inputs.prompt ?? ""),
        image_url,
        duration: String(inputs.duration ?? "medium"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 7. SeedanceV1LiteTextToVideo
// ---------------------------------------------------------------------------
export class SeedanceV1LiteTextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.SeedanceV1LiteTextToVideo";
            static readonly title = "Seedance V1 Lite Text To Video";
            static readonly description = "Bytedance 1.0 - text-to-video-lite via Kie.ai.\n\n    kie, seedance, bytedance, video generation, ai, text-to-video, lite\n\n    Seedance V1 Lite offers efficient text-to-video generation\n    with good quality and faster processing times.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "The aspect ratio of the generated video.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "21:9",
  "9:21"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "720p", title: "Resolution", description: "The resolution of the video.", values: [
  "720p"
] })
  declare resolution: any;

  @prop({ type: "enum", default: "5", title: "Duration", description: "The duration of the video in seconds.", values: [
  "5",
  "10"
] })
  declare duration: any;

  @prop({ type: "bool", default: true, title: "Remove Watermark", description: "Whether to remove the watermark from the video." })
  declare remove_watermark: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const result = await kieExecuteTask(
      apiKey,
      "seedance/v1-lite-text-to-video",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        resolution: String(inputs.resolution ?? "720p"),
        duration: String(inputs.duration ?? "5"),
        remove_watermark: Boolean(inputs.remove_watermark ?? true),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 8. SeedanceV1ProTextToVideo
// ---------------------------------------------------------------------------
export class SeedanceV1ProTextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.SeedanceV1ProTextToVideo";
            static readonly title = "Seedance V1 Pro Text To Video";
            static readonly description = "Bytedance 1.0 - text-to-video-pro via Kie.ai.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "The aspect ratio of the generated video.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "21:9",
  "9:21"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "720p", title: "Resolution", description: "The resolution of the video.", values: [
  "720p"
] })
  declare resolution: any;

  @prop({ type: "enum", default: "5", title: "Duration", description: "The duration of the video in seconds.", values: [
  "5",
  "10"
] })
  declare duration: any;

  @prop({ type: "bool", default: true, title: "Remove Watermark", description: "Whether to remove the watermark from the video." })
  declare remove_watermark: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const result = await kieExecuteTask(
      apiKey,
      "seedance/v1-pro-text-to-video",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        resolution: String(inputs.resolution ?? "720p"),
        duration: String(inputs.duration ?? "5"),
        remove_watermark: Boolean(inputs.remove_watermark ?? true),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 9. SeedanceV1LiteImageToVideo
// ---------------------------------------------------------------------------
export class SeedanceV1LiteImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.SeedanceV1LiteImageToVideo";
            static readonly title = "Seedance V1 Lite Image To Video";
            static readonly description = "Bytedance 1.0 - image-to-video-lite via Kie.ai.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "The aspect ratio of the generated video.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "21:9",
  "9:21"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "720p", title: "Resolution", description: "The resolution of the video.", values: [
  "720p"
] })
  declare resolution: any;

  @prop({ type: "enum", default: "5", title: "Duration", description: "The duration of the video in seconds.", values: [
  "5",
  "10"
] })
  declare duration: any;

  @prop({ type: "bool", default: true, title: "Remove Watermark", description: "Whether to remove the watermark from the video." })
  declare remove_watermark: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "Optional text guide for the video generation." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image1", description: "First source image for the video generation." })
  declare image1: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image2", description: "Second source image (optional)." })
  declare image2: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image3", description: "Third source image (optional)." })
  declare image3: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_urls: string[] = [];
    for (const img of [inputs.image1, inputs.image2, inputs.image3]) {
      if (isRefSet(img)) image_urls.push(await uploadImageInput(apiKey, img));
    }
    if (image_urls.length === 0) throw new Error("At least one image is required");
    const result = await kieExecuteTask(
      apiKey,
      "seedance/v1-lite-image-to-video",
      {
        prompt: String(inputs.prompt ?? ""),
        image_urls,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        resolution: String(inputs.resolution ?? "720p"),
        duration: String(inputs.duration ?? "5"),
        remove_watermark: Boolean(inputs.remove_watermark ?? true),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 10. SeedanceV1ProImageToVideo
// ---------------------------------------------------------------------------
export class SeedanceV1ProImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.SeedanceV1ProImageToVideo";
            static readonly title = "Seedance V1 Pro Image To Video";
            static readonly description = "Bytedance 1.0 - image-to-video-pro via Kie.ai.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "The aspect ratio of the generated video.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "21:9",
  "9:21"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "720p", title: "Resolution", description: "The resolution of the video.", values: [
  "720p"
] })
  declare resolution: any;

  @prop({ type: "enum", default: "5", title: "Duration", description: "The duration of the video in seconds.", values: [
  "5",
  "10"
] })
  declare duration: any;

  @prop({ type: "bool", default: true, title: "Remove Watermark", description: "Whether to remove the watermark from the video." })
  declare remove_watermark: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "Optional text guide for the video generation." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image1", description: "First source image for the video generation." })
  declare image1: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image2", description: "Second source image (optional)." })
  declare image2: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image3", description: "Third source image (optional)." })
  declare image3: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_urls: string[] = [];
    for (const img of [inputs.image1, inputs.image2, inputs.image3]) {
      if (isRefSet(img)) image_urls.push(await uploadImageInput(apiKey, img));
    }
    if (image_urls.length === 0) throw new Error("At least one image is required");
    const result = await kieExecuteTask(
      apiKey,
      "seedance/v1-pro-image-to-video",
      {
        prompt: String(inputs.prompt ?? ""),
        image_urls,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        resolution: String(inputs.resolution ?? "720p"),
        duration: String(inputs.duration ?? "5"),
        remove_watermark: Boolean(inputs.remove_watermark ?? true),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 11. SeedanceV1ProFastImageToVideo
// ---------------------------------------------------------------------------
export class SeedanceV1ProFastImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.SeedanceV1ProFastImageToVideo";
            static readonly title = "Seedance V1 Pro Fast Image To Video";
            static readonly description = "Bytedance 1.0 - fast-image-to-video-pro via Kie.ai.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "The aspect ratio of the generated video.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "21:9",
  "9:21"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "720p", title: "Resolution", description: "The resolution of the video.", values: [
  "720p"
] })
  declare resolution: any;

  @prop({ type: "enum", default: "5", title: "Duration", description: "The duration of the video in seconds.", values: [
  "5",
  "10"
] })
  declare duration: any;

  @prop({ type: "bool", default: true, title: "Remove Watermark", description: "Whether to remove the watermark from the video." })
  declare remove_watermark: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image1", description: "First source image for the video generation." })
  declare image1: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image2", description: "Second source image (optional)." })
  declare image2: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image3", description: "Third source image (optional)." })
  declare image3: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_urls: string[] = [];
    for (const img of [inputs.image1, inputs.image2, inputs.image3]) {
      if (isRefSet(img)) image_urls.push(await uploadImageInput(apiKey, img));
    }
    if (image_urls.length === 0) throw new Error("At least one image is required");
    const result = await kieExecuteTask(
      apiKey,
      "seedance/v1-pro-fast-image-to-video",
      {
        image_urls,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        resolution: String(inputs.resolution ?? "720p"),
        duration: String(inputs.duration ?? "5"),
        remove_watermark: Boolean(inputs.remove_watermark ?? true),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 12. HailuoTextToVideoPro
// ---------------------------------------------------------------------------
export class HailuoTextToVideoProNode extends BaseNode {
  static readonly nodeType = "kie.video.HailuoTextToVideoPro";
            static readonly title = "Hailuo 2.3 Pro Text To Video";
            static readonly description = "Generate videos from text using MiniMax's Hailuo 2.3 Pro model via Kie.ai.\n\n    kie, hailuo, minimax, video generation, ai, text-to-video, pro\n\n    Hailuo 2.3 Pro offers the highest quality text-to-video generation with\n    realistic motion, detailed textures, and cinematic quality.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;

  @prop({ type: "enum", default: "6", title: "Duration", description: "The duration of the video in seconds. 10s is not supported for 1080p.", values: [
  "6",
  "10"
] })
  declare duration: any;

  @prop({ type: "enum", default: "768P", title: "Resolution", description: "Video resolution.", values: [
  "768P",
  "1080P"
] })
  declare resolution: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const resolution = String(inputs.resolution ?? "768P");
    const duration = String(inputs.duration ?? "6");
    if (resolution === "1080P" && duration === "10") {
      throw new Error("1080P resolution with 10s duration is not supported");
    }
    const result = await kieExecuteTask(
      apiKey,
      "hailuo/2-3-text-to-video-pro",
      { prompt, duration, resolution },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 13. HailuoTextToVideoStandard
// ---------------------------------------------------------------------------
export class HailuoTextToVideoStandardNode extends BaseNode {
  static readonly nodeType = "kie.video.HailuoTextToVideoStandard";
            static readonly title = "Hailuo 2.3 Standard Text To Video";
            static readonly description = "Generate videos from text using MiniMax's Hailuo 2.3 Standard model via Kie.ai.\n\n    kie, hailuo, minimax, video generation, ai, text-to-video, standard, fast";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;

  @prop({ type: "enum", default: "6", title: "Duration", description: "The duration of the video in seconds. 10s is not supported for 1080p.", values: [
  "6",
  "10"
] })
  declare duration: any;

  @prop({ type: "enum", default: "768P", title: "Resolution", description: "Video resolution.", values: [
  "768P",
  "1080P"
] })
  declare resolution: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const resolution = String(inputs.resolution ?? "768P");
    const duration = String(inputs.duration ?? "6");
    if (resolution === "1080P" && duration === "10") {
      throw new Error("1080P resolution with 10s duration is not supported");
    }
    const result = await kieExecuteTask(
      apiKey,
      "hailuo/2-3-text-to-video-standard",
      { prompt, duration, resolution },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 14. HailuoImageToVideoPro
// ---------------------------------------------------------------------------
export class HailuoImageToVideoProNode extends BaseNode {
  static readonly nodeType = "kie.video.HailuoImageToVideoPro";
            static readonly title = "Hailuo 2.3 Pro Image To Video";
            static readonly description = "Generate videos from images using MiniMax's Hailuo 2.3 Pro model via Kie.ai.\n\n    kie, hailuo, minimax, video generation, ai, image-to-video, pro\n\n    Hailuo 2.3 Pro offers the highest quality image-to-video generation with\n    realistic motion, detailed textures, and cinematic quality.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "The reference image to animate into a video." })
  declare image: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "Optional text to guide the video generation." })
  declare prompt: any;

  @prop({ type: "enum", default: "6", title: "Duration", description: "The duration of the video in seconds. 10s is not supported for 1080p.", values: [
  "6",
  "10"
] })
  declare duration: any;

  @prop({ type: "enum", default: "768P", title: "Resolution", description: "Video resolution.", values: [
  "768P",
  "1080P"
] })
  declare resolution: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const resolution = String(inputs.resolution ?? "768P");
    const duration = String(inputs.duration ?? "6");
    if (resolution === "1080P" && duration === "10") {
      throw new Error("1080P resolution with 10s duration is not supported");
    }
    const result = await kieExecuteTask(
      apiKey,
      "hailuo/2-3-image-to-video-pro",
      {
        image_url,
        prompt: String(inputs.prompt ?? ""),
        duration,
        resolution,
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 15. HailuoImageToVideoStandard
// ---------------------------------------------------------------------------
export class HailuoImageToVideoStandardNode extends BaseNode {
  static readonly nodeType = "kie.video.HailuoImageToVideoStandard";
            static readonly title = "Hailuo 2.3 Standard Image To Video";
            static readonly description = "Generate videos from images using MiniMax's Hailuo 2.3 Standard model via Kie.ai.\n\n    kie, hailuo, minimax, video generation, ai, image-to-video, standard, fast\n\n    Hailuo 2.3 Standard offers efficient image-to-video generation with good quality\n    and faster processing times for practical use cases.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "The reference image to animate into a video." })
  declare image: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "Optional text to guide the video generation." })
  declare prompt: any;

  @prop({ type: "enum", default: "6", title: "Duration", description: "The duration of the video in seconds. 10s is not supported for 1080p.", values: [
  "6",
  "10"
] })
  declare duration: any;

  @prop({ type: "enum", default: "768P", title: "Resolution", description: "Video resolution.", values: [
  "768P",
  "1080P"
] })
  declare resolution: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const resolution = String(inputs.resolution ?? "768P");
    const duration = String(inputs.duration ?? "6");
    if (resolution === "1080P" && duration === "10") {
      throw new Error("1080P resolution with 10s duration is not supported");
    }
    const result = await kieExecuteTask(
      apiKey,
      "hailuo/2-3-image-to-video-standard",
      {
        image_url,
        prompt: String(inputs.prompt ?? ""),
        duration,
        resolution,
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 16. Kling25TurboTextToVideo
// ---------------------------------------------------------------------------
export class Kling25TurboTextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Kling25TurboTextToVideo";
            static readonly title = "Kling 2.5 Turbo Text To Video";
            static readonly description = "Generate videos from text using Kuaishou's Kling 2.5 Turbo model via Kie.ai.\n\n    kie, kling, kuaishou, video generation, ai, text-to-video, turbo\n\n    Kling 2.5 Turbo offers improved prompt adherence, fluid motion,\n    consistent artistic styles, and realistic physics simulation.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;

  @prop({ type: "enum", default: "5", title: "Duration", description: "Video duration in seconds.", values: [
  "5",
  "10"
] })
  declare duration: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "The aspect ratio of the generated video.", values: [
  "16:9",
  "9:16",
  "1:1"
] })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", title: "Negative Prompt", description: "Things to avoid in the generated video." })
  declare negative_prompt: any;

  @prop({ type: "float", default: 0.5, title: "Cfg Scale", description: "The CFG scale for prompt adherence. Lower values allow more creativity.", min: 0, max: 1 })
  declare cfg_scale: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const result = await kieExecuteTask(
      apiKey,
      "kling/v2-5-turbo-text-to-video-pro",
      {
        prompt,
        duration: String(inputs.duration ?? "5"),
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        negative_prompt: String(inputs.negative_prompt ?? ""),
        cfg_scale: Number(inputs.cfg_scale ?? 0.5),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 17. Kling25TurboImageToVideo
// ---------------------------------------------------------------------------
export class Kling25TurboImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Kling25TurboImageToVideo";
            static readonly title = "Kling 2.5 Turbo Image To Video";
            static readonly description = "Generate videos from images using Kuaishou's Kling 2.5 Turbo model via Kie.ai.\n\n    kie, kling, kuaishou, video generation, ai, image-to-video, turbo\n\n    Transforms a static image into a dynamic video while preserving\n    visual style, colors, lighting, and texture.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "Text description to guide the video generation." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "The source image to animate." })
  declare image: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Tail Image", description: "Tail frame image for the video (optional)." })
  declare tail_image: any;

  @prop({ type: "enum", default: "5", title: "Duration", description: "Video duration in seconds.", values: [
  "5",
  "10"
] })
  declare duration: any;

  @prop({ type: "str", default: "", title: "Negative Prompt", description: "Elements to avoid in the video." })
  declare negative_prompt: any;

  @prop({ type: "float", default: 0.5, title: "Cfg Scale", description: "The CFG scale for prompt adherence. Lower values allow more creativity.", min: 0, max: 1 })
  declare cfg_scale: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "kling/v2-5-turbo-image-to-video",
      {
        prompt: String(inputs.prompt ?? ""),
        image_url,
        duration: String(inputs.duration ?? "5"),
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        negative_prompt: String(inputs.negative_prompt ?? ""),
        cfg_scale: Number(inputs.cfg_scale ?? 0.5),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 18. Sora2ProTextToVideo
// ---------------------------------------------------------------------------
export class Sora2ProTextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Sora2ProTextToVideo";
            static readonly title = "Sora 2 Pro Text To Video";
            static readonly description = "Generate videos from text using Sora 2 Pro via Kie.ai.\n\n    kie, sora, openai, video generation, ai, text-to-video, pro\n\n    Sora 2 Pro generates high-quality videos from text descriptions\n    with advanced motion and temporal consistency.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "enum", default: "landscape", title: "Aspect Ratio", description: "The aspect ratio of the generated video.", values: [
  "landscape",
  "portrait",
  "square"
] })
  declare aspect_ratio: any;

  @prop({ type: "bool", default: true, title: "Remove Watermark", description: "Whether to remove the watermark from the video." })
  declare remove_watermark: any;

  @prop({ type: "enum", default: "10", title: "N Frames", description: "Number of frames for the video output.", values: [
  "10",
  "15"
] })
  declare n_frames: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const result = await kieExecuteTask(
      apiKey,
      "sora-2/pro-text-to-video",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        n_frames: String(inputs.n_frames ?? "default"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 19. Sora2ProImageToVideo
// ---------------------------------------------------------------------------
export class Sora2ProImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Sora2ProImageToVideo";
            static readonly title = "Sora 2 Pro Image To Video";
            static readonly description = "Generate videos from images using Sora 2 Pro via Kie.ai.\n\n    kie, sora, openai, video generation, ai, image-to-video, pro\n\n    Sora 2 Pro transforms images into high-quality videos with\n    realistic motion and temporal consistency.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "enum", default: "landscape", title: "Aspect Ratio", description: "The aspect ratio of the generated video.", values: [
  "landscape",
  "portrait",
  "square"
] })
  declare aspect_ratio: any;

  @prop({ type: "bool", default: true, title: "Remove Watermark", description: "Whether to remove the watermark from the video." })
  declare remove_watermark: any;

  @prop({ type: "enum", default: "10", title: "N Frames", description: "Number of frames for the video output.", values: [
  "10",
  "15"
] })
  declare n_frames: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "Optional text guide for the video generation." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "The source image to animate." })
  declare image: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "sora-2/pro-image-to-video",
      {
        prompt: String(inputs.prompt ?? ""),
        image_url,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        n_frames: String(inputs.n_frames ?? "default"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 20. Sora2ProStoryboard
// ---------------------------------------------------------------------------
export class Sora2ProStoryboardNode extends BaseNode {
  static readonly nodeType = "kie.video.Sora2ProStoryboard";
            static readonly title = "Sora 2 Pro Storyboard";
            static readonly description = "Generate videos from storyboards using Sora 2 Pro via Kie.ai.\n\n    kie, sora, openai, video generation, ai, storyboard, pro\n\n    Sora 2 Pro creates videos from storyboard sequences with\n    consistent characters and scenes across frames.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "enum", default: "landscape", title: "Aspect Ratio", description: "The aspect ratio of the generated video.", values: [
  "landscape",
  "portrait",
  "square"
] })
  declare aspect_ratio: any;

  @prop({ type: "bool", default: true, title: "Remove Watermark", description: "Whether to remove the watermark from the video." })
  declare remove_watermark: any;

  @prop({ type: "enum", default: "10", title: "N Frames", description: "Number of frames for the video output.", values: [
  "10",
  "15",
  "25"
] })
  declare n_frames: any;

  @prop({ type: "dataframe", default: {
  "type": "dataframe",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "columns": null
}, title: "Shots", description: "The shots to generate, with columns: Scene, duration." })
  declare shots: any;

  @prop({ type: "list[image]", default: [], title: "Images", description: "The images to use for the video generation." })
  declare images: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const rawImages = Array.isArray(inputs.images) ? inputs.images : [];
    const image_urls: string[] = [];
    for (const img of rawImages.slice(0, 5)) {
      if (isRefSet(img)) image_urls.push(await uploadImageInput(apiKey, img));
    }
    const result = await kieExecuteTask(
      apiKey,
      "sora-2/pro-storyboard",
      { prompt, image_urls },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 21. Sora2TextToVideo
// ---------------------------------------------------------------------------
export class Sora2TextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Sora2TextToVideo";
            static readonly title = "Sora 2 Text To Video";
            static readonly description = "Generate videos from text using Sora 2 Standard via Kie.ai.\n\n    kie, sora, openai, video generation, ai, text-to-video, standard\n\n    Sora 2 Standard generates quality videos from text descriptions\n    with efficient processing and good visual quality.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "enum", default: "landscape", title: "Aspect Ratio", description: "The aspect ratio of the generated video.", values: [
  "landscape",
  "portrait",
  "square"
] })
  declare aspect_ratio: any;

  @prop({ type: "bool", default: true, title: "Remove Watermark", description: "Whether to remove the watermark from the video." })
  declare remove_watermark: any;

  @prop({ type: "enum", default: "10", title: "N Frames", description: "Number of frames for the video output.", values: [
  "10",
  "15"
] })
  declare n_frames: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const result = await kieExecuteTask(
      apiKey,
      "sora-2/text-to-video",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        n_frames: String(inputs.n_frames ?? "default"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 22. WanMultiShotTextToVideoPro
// ---------------------------------------------------------------------------
export class WanMultiShotTextToVideoProNode extends BaseNode {
  static readonly nodeType = "kie.video.WanMultiShotTextToVideoPro";
            static readonly title = "Wan 2.1 Multi-Shot Text To Video";
            static readonly description = "Generate videos from text using Alibaba's Wan 2.1 model via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, text-to-video, multi-shot, 2.1\n\n    Wan 2.1 Multi-Shot generates complex videos with multiple shots\n    and scene transitions from text descriptions.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "The aspect ratio of the generated video.", values: [
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "1080p", title: "Resolution", description: "The resolution of the video.", values: [
  "720p",
  "1080p"
] })
  declare resolution: any;

  @prop({ type: "enum", default: "5", title: "Duration", description: "The duration of the video in seconds.", values: [
  "5",
  "10"
] })
  declare duration: any;

  @prop({ type: "bool", default: true, title: "Remove Watermark", description: "Whether to remove the watermark from the video." })
  declare remove_watermark: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const result = await kieExecuteTask(
      apiKey,
      "wan/multi-shot-text-to-video-pro",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        resolution: String(inputs.resolution ?? "720P"),
        duration: String(inputs.duration ?? "5"),
        shot_count: Number(inputs.shot_count ?? 3),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 23. Wan26TextToVideo
// ---------------------------------------------------------------------------
export class Wan26TextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Wan26TextToVideo";
            static readonly title = "Wan 2.6 Text To Video";
            static readonly description = "Generate videos from text using Alibaba's Wan 2.6 model via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, text-to-video, 2.6\n\n    Wan 2.6 generates high-quality videos from text descriptions\n    with advanced motion and visual fidelity.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;

  @prop({ type: "enum", default: "5s", title: "Duration", description: "The duration of the video in seconds.", values: [
  "5s",
  "10"
] })
  declare duration: any;

  @prop({ type: "enum", default: "1080p", title: "Resolution", description: "The resolution of the video.", values: [
  "1080p",
  "720p"
] })
  declare resolution: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const result = await kieExecuteTask(
      apiKey,
      "wan/2-6-text-to-video",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        resolution: String(inputs.resolution ?? "720P"),
        duration: String(inputs.duration ?? "5"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 24. Wan26ImageToVideo
// ---------------------------------------------------------------------------
export class Wan26ImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Wan26ImageToVideo";
            static readonly title = "Wan 2.6 Image To Video";
            static readonly description = "Generate videos from images using Alibaba's Wan 2.6 model via Kie.ai.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image1", description: "First source image for the video generation." })
  declare image1: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image2", description: "Second source image (optional)." })
  declare image2: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image3", description: "Third source image (optional)." })
  declare image3: any;

  @prop({ type: "enum", default: "5", title: "Duration", description: "The duration of the video in seconds.", values: [
  "5",
  "10"
] })
  declare duration: any;

  @prop({ type: "enum", default: "1080p", title: "Resolution", description: "The resolution of the video.", values: [
  "1080p",
  "720p"
] })
  declare resolution: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "wan/2-6-image-to-video",
      {
        prompt: String(inputs.prompt ?? ""),
        image_url,
        resolution: String(inputs.resolution ?? "720P"),
        duration: String(inputs.duration ?? "5"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 25. Wan26VideoToVideo
// ---------------------------------------------------------------------------
export class Wan26VideoToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Wan26VideoToVideo";
            static readonly title = "Wan 2.6 Video To Video";
            static readonly description = "Generate videos from videos using Alibaba's Wan 2.6 model via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, video-to-video, 2.6\n\n    Wan 2.6 transforms and enhances existing videos with AI-powered\n    editing and style transfer capabilities.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the changes." })
  declare prompt: any;

  @prop({ type: "video", default: {
  "type": "video",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "duration": null,
  "format": null
}, title: "Video1", description: "First source video for the video-to-video task." })
  declare video1: any;

  @prop({ type: "video", default: {
  "type": "video",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "duration": null,
  "format": null
}, title: "Video2", description: "Second source video (optional)." })
  declare video2: any;

  @prop({ type: "video", default: {
  "type": "video",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "duration": null,
  "format": null
}, title: "Video3", description: "Third source video (optional)." })
  declare video3: any;

  @prop({ type: "enum", default: "5", title: "Duration", description: "The duration of the video in seconds.", values: [
  "5",
  "10"
] })
  declare duration: any;

  @prop({ type: "enum", default: "1080p", title: "Resolution", description: "The resolution of the video.", values: [
  "1080p",
  "720p"
] })
  declare resolution: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const video_url = await uploadVideoInput(apiKey, inputs.video);
    const result = await kieExecuteTask(
      apiKey,
      "wan/2-6-video-to-video",
      {
        prompt: String(inputs.prompt ?? ""),
        video_url,
        resolution: String(inputs.resolution ?? "720P"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 26. TopazVideoUpscale
// ---------------------------------------------------------------------------
export class TopazVideoUpscaleNode extends BaseNode {
  static readonly nodeType = "kie.video.TopazVideoUpscale";
            static readonly title = "Topaz Video Upscale";
            static readonly description = "Upscale and enhance videos using Topaz Labs AI via Kie.ai.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "video", default: {
  "type": "video",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "duration": null,
  "format": null
}, title: "Video", description: "The video to upscale." })
  declare video: any;

  @prop({ type: "enum", default: "1080p", title: "Resolution", description: "Target resolution for upscaling.", values: [
  "1080p",
  "4k"
] })
  declare resolution: any;

  @prop({ type: "bool", default: true, title: "Denoise", description: "Apply denoising to reduce artifacts." })
  declare denoise: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const video_url = await uploadVideoInput(apiKey, inputs.video);
    const result = await kieExecuteTask(
      apiKey,
      "topaz/video-upscale",
      {
        video_url,
        scale_factor: Number(inputs.scale_factor ?? 2),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 27. InfinitalkV1
// ---------------------------------------------------------------------------
export class InfinitalkV1Node extends BaseNode {
  static readonly nodeType = "kie.video.InfinitalkV1";
            static readonly title = "Infinitalk V1";
            static readonly description = "Generate videos using Infinitalk v1 (image-to-video) via Kie.ai.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  

  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "Optional text guide for the video generation." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "The source image." })
  declare image: any;

  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Audio", description: "The source audio track." })
  declare audio: any;

  @prop({ type: "enum", default: "480p", title: "Resolution", description: "Video resolution.", values: [
  "480p"
] })
  declare resolution: any;

  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const audio_url = await uploadAudioInput(apiKey, inputs.audio);
    const result = await kieExecuteTask(
      apiKey,
      "infinitalk/v1",
      { image_url, audio_url },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 28. Veo31TextToVideo
// ---------------------------------------------------------------------------
export class Veo31TextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Veo31TextToVideo";
            static readonly title = "Veo 31 Text To Video";
            static readonly description = "Generate videos from text using Google's Veo 3.1 via Kie.ai.\n\n    kie, google, veo, veo3, veo3.1, video generation, ai, text-to-video\n\n    Veo 3.1 offers native 9:16 vertical video support, multilingual prompt processing,\n    and significant cost savings (25% of Google's direct API pricing).";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "enum", default: "veo3_fast", title: "Model", description: "The model to use for video generation.", values: [
  "veo3",
  "veo3_fast"
] })
  declare model: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "Video aspect ratio.", values: [
  "16:9",
  "9:16"
] })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", title: "Call Back Url", description: "Optional callback URL for task completion." })
  declare call_back_url: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const result = await kieExecuteTask(
      apiKey,
      "veo-3-1/text-to-video",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        duration: String(inputs.duration ?? "8"),
        generate_audio: Boolean(inputs.generate_audio ?? true),
        negative_prompt: String(inputs.negative_prompt ?? ""),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 29. RunwayGen3AlphaTextToVideo
// ---------------------------------------------------------------------------
export class RunwayGen3AlphaTextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.RunwayGen3AlphaTextToVideo";
            static readonly title = "Runway Gen-3 Alpha Text To Video";
            static readonly description = "Generate videos from text using Runway's Gen-3 Alpha model via Kie.ai.\n\n    kie, runway, gen-3, gen3alpha, video generation, ai, text-to-video\n\n    Runway Gen-3 Alpha produces high-quality videos from text descriptions\n    with advanced motion and temporal consistency.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "The aspect ratio of the generated video. Required for text-to-video generation.", values: [
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: 5, title: "Duration", description: "Video duration in seconds. If 10-second video is selected, 1080p resolution cannot be used.", values: [
  5,
  10
] })
  declare duration: any;

  @prop({ type: "enum", default: "720p", title: "Quality", description: "Video resolution. If 1080p is selected, 10-second video cannot be generated.", values: [
  "720p",
  "1080p"
] })
  declare quality: any;

  @prop({ type: "str", default: "", title: "Water Mark", description: "Video watermark text content. An empty string indicates no watermark." })
  declare water_mark: any;

  @prop({ type: "str", default: "", title: "Call Back Url", description: "Optional callback URL to receive task completion updates." })
  declare call_back_url: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const result = await kieExecuteTask(
      apiKey,
      "runway/gen3-alpha-text-to-video",
      {
        prompt,
        duration: String(inputs.duration ?? "5"),
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        watermark: Boolean(inputs.watermark ?? false),
        seed: Number(inputs.seed ?? -1),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 30. RunwayGen3AlphaImageToVideo
// ---------------------------------------------------------------------------
export class RunwayGen3AlphaImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.RunwayGen3AlphaImageToVideo";
            static readonly title = "Runway Gen-3 Alpha Image To Video";
            static readonly description = "Generate videos from images using Runway's Gen-3 Alpha model via Kie.ai.\n\n    kie, runway, gen-3, gen3alpha, video generation, ai, image-to-video\n\n    Runway Gen-3 Alpha transforms static images into dynamic videos\n    with realistic motion and temporal consistency.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "Reference image to base the video on." })
  declare image: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "Optional text to guide the video generation. Maximum length is 1800 characters." })
  declare prompt: any;

  @prop({ type: "enum", default: 5, title: "Duration", description: "Video duration in seconds. If 10-second video is selected, 1080p resolution cannot be used.", values: [
  5,
  10
] })
  declare duration: any;

  @prop({ type: "enum", default: "720p", title: "Quality", description: "Video resolution. If 1080p is selected, 10-second video cannot be generated.", values: [
  "720p",
  "1080p"
] })
  declare quality: any;

  @prop({ type: "str", default: "", title: "Water Mark", description: "Video watermark text content. An empty string indicates no watermark." })
  declare water_mark: any;

  @prop({ type: "str", default: "", title: "Call Back Url", description: "Optional callback URL to receive task completion updates." })
  declare call_back_url: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "runway/gen3-alpha-image-to-video",
      {
        prompt: String(inputs.prompt ?? ""),
        image_url,
        duration: String(inputs.duration ?? "5"),
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        watermark: Boolean(inputs.watermark ?? false),
        seed: Number(inputs.seed ?? -1),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 31. RunwayGen3AlphaExtendVideo
// ---------------------------------------------------------------------------
export class RunwayGen3AlphaExtendVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.RunwayGen3AlphaExtendVideo";
            static readonly title = "Runway Gen-3 Alpha Extend Video";
            static readonly description = "Extend videos using Runway's Gen-3 Alpha model via Kie.ai.\n\n    kie, runway, gen-3, gen3alpha, video generation, ai, video-extension\n\n    Runway Gen-3 Alpha can extend existing videos with additional generated content.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Video Url", description: "The source video URL to extend." })
  declare video_url: any;

  @prop({ type: "str", default: "Continue the motion naturally with smooth transitions.", title: "Prompt", description: "Text prompt to guide the video extension. Maximum length is 1800 characters." })
  declare prompt: any;

  @prop({ type: "enum", default: 5, title: "Duration", description: "Duration to extend the video by in seconds. If 10-second extension is selected, 1080p resolution cannot be used.", values: [
  5,
  10
] })
  declare duration: any;

  @prop({ type: "enum", default: "720p", title: "Quality", description: "Video resolution. If 1080p is selected, 10-second extension cannot be generated.", values: [
  "720p",
  "1080p"
] })
  declare quality: any;

  @prop({ type: "str", default: "", title: "Water Mark", description: "Video watermark text content. An empty string indicates no watermark." })
  declare water_mark: any;

  @prop({ type: "str", default: "", title: "Call Back Url", description: "Optional callback URL to receive task completion updates." })
  declare call_back_url: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const video_url = await uploadVideoInput(apiKey, inputs.video);
    const result = await kieExecuteTask(
      apiKey,
      "runway/gen3-alpha-extend-video",
      {
        prompt: String(inputs.prompt ?? ""),
        video_url,
        duration: String(inputs.duration ?? "5"),
        watermark: Boolean(inputs.watermark ?? false),
        seed: Number(inputs.seed ?? -1),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 32. RunwayAlephVideo
// ---------------------------------------------------------------------------
export class RunwayAlephVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.RunwayAlephVideo";
            static readonly title = "Runway Aleph Video";
            static readonly description = "Generate videos using Runway's Aleph model via Kie.ai.\n\n    kie, runway, aleph, video generation, ai, text-to-video\n\n    Aleph is Runway's advanced video generation model offering\n    high-quality output with sophisticated motion handling.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "The aspect ratio of the generated video. Required for text-to-video generation.", values: [
  "16:9",
  "9:16",
  "1:1"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: 5, title: "Duration", description: "Video duration in seconds. If 10-second video is selected, 1080p resolution cannot be used.", values: [
  5,
  10
] })
  declare duration: any;

  @prop({ type: "enum", default: "720p", title: "Quality", description: "Video resolution. If 1080p is selected, 10-second video cannot be generated.", values: [
  "720p",
  "1080p"
] })
  declare quality: any;

  @prop({ type: "str", default: "", title: "Water Mark", description: "Video watermark text content. An empty string indicates no watermark." })
  declare water_mark: any;

  @prop({ type: "str", default: "", title: "Call Back Url", description: "Optional callback URL to receive task completion updates." })
  declare call_back_url: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const payload: Record<string, unknown> = {
      prompt: String(inputs.prompt ?? ""),
      duration: String(inputs.duration ?? "5"),
      aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
      watermark: Boolean(inputs.watermark ?? false),
      seed: Number(inputs.seed ?? -1),
    };
    if (isRefSet(inputs.image)) {
      payload.image_url = await uploadImageInput(apiKey, inputs.image);
    }
    const result = await kieExecuteTask(apiKey, "runway/aleph-video", payload, 8000, 450);
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 33. LumaModifyVideo
// ---------------------------------------------------------------------------
export class LumaModifyVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.LumaModifyVideo";
            static readonly title = "Luma Modify Video";
            static readonly description = "Modify and enhance videos using Luma's API via Kie.ai.\n\n    kie, luma, video modification, ai, video-editing\n\n    Luma's video modification API allows for sophisticated video editing\n    and enhancement capabilities.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "video", default: {
  "type": "video",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "duration": null,
  "format": null
}, title: "Video", description: "The source video to modify." })
  declare video: any;

  @prop({ type: "str", default: "Enhance the video quality and add smooth motion.", title: "Prompt", description: "Text prompt describing the modifications to make." })
  declare prompt: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "The aspect ratio of the output video.", values: [
  "16:9",
  "9:16",
  "1:1"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "5", title: "Duration", description: "Duration of the modified video segment.", values: [
  "5",
  "10"
] })
  declare duration: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const video_url = await uploadVideoInput(apiKey, inputs.video);
    const result = await kieExecuteTask(
      apiKey,
      "luma/modify-video",
      {
        prompt: String(inputs.prompt ?? ""),
        video_url,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        loop: Boolean(inputs.loop ?? false),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 34. Veo31ImageToVideo
// ---------------------------------------------------------------------------
export class Veo31ImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Veo31ImageToVideo";
            static readonly title = "Veo 3.1 Image To Video";
            static readonly description = "Generate videos from images using Google's Veo 3.1 model via Kie.ai.\n\n    kie, google, veo, veo3, veo3.1, video generation, ai, image-to-video, i2v\n\n    Supports single image (image comes alive) or two images (first and last frames transition).\n    For two images, the first image serves as the video's first frame and the second as the last frame.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "enum", default: "veo3_fast", title: "Model", description: "The model to use for video generation.", values: [
  "veo3",
  "veo3_fast"
] })
  declare model: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "Video aspect ratio.", values: [
  "16:9",
  "9:16"
] })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", title: "Call Back Url", description: "Optional callback URL for task completion." })
  declare call_back_url: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "Optional text prompt describing how the image should come alive." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image1", description: "First source image. Required. Serves as the video's first frame." })
  declare image1: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image2", description: "Second source image (optional). If provided, serves as the video's last frame." })
  declare image2: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "veo-3-1/image-to-video",
      {
        prompt: String(inputs.prompt ?? ""),
        image_url,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        duration: String(inputs.duration ?? "8"),
        generate_audio: Boolean(inputs.generate_audio ?? true),
        negative_prompt: String(inputs.negative_prompt ?? ""),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 35. Veo31ReferenceToVideo
// ---------------------------------------------------------------------------
export class Veo31ReferenceToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Veo31ReferenceToVideo";
            static readonly title = "Veo 3.1 Reference To Video";
            static readonly description = "Generate videos from reference images using Google's Veo 3.1 Fast model via Kie.ai.\n\n    kie, google, veo, veo3, veo3.1, video generation, ai, reference-to-video, material-to-video\n\n    Material-to-video generation based on reference images. Only supports veo3_fast model\n    and requires 1-3 reference images.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "enum", default: "veo3_fast", title: "Model", description: "The model to use for video generation.", values: [
  "veo3",
  "veo3_fast"
] })
  declare model: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "Video aspect ratio.", values: [
  "16:9",
  "9:16"
] })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", title: "Call Back Url", description: "Optional callback URL for task completion." })
  declare call_back_url: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "Text prompt describing the desired video content." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image1", description: "First reference image. Required. Minimum 1, maximum 3 images." })
  declare image1: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image2", description: "Second reference image (optional)." })
  declare image2: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image3", description: "Third reference image (optional)." })
  declare image3: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const rawImages = Array.isArray(inputs.images) ? inputs.images : [];
    const image_urls: string[] = [];
    for (const img of rawImages) {
      if (isRefSet(img)) image_urls.push(await uploadImageInput(apiKey, img));
    }
    const result = await kieExecuteTask(
      apiKey,
      "veo-3-1/reference-to-video",
      {
        prompt: String(inputs.prompt ?? ""),
        image_urls,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        duration: String(inputs.duration ?? "8"),
        generate_audio: Boolean(inputs.generate_audio ?? true),
        negative_prompt: String(inputs.negative_prompt ?? ""),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 36. KlingMotionControl
// ---------------------------------------------------------------------------
export class KlingMotionControlNode extends BaseNode {
  static readonly nodeType = "kie.video.KlingMotionControl";
            static readonly title = "Kling 2.6 Motion Control";
            static readonly description = "Generate videos with motion control using Kuaishou's Kling 2.6 model via Kie.ai.\n\n    kie, kling, kuaishou, video generation, ai, motion-control, character-animation, 2.6\n\n    Kling Motion Control generates videos where character actions are guided by a reference video,\n    while the visual appearance is based on a reference image. Perfect for character animation\n    and motion transfer tasks.";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "The cartoon character is dancing.", title: "Prompt", description: "A text description of the desired output. Maximum 2500 characters." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "Reference image. The characters, backgrounds, and other elements in the generated video are based on this image. Supports .jpg/.jpeg/.png, max 10MB, size needs to be greater than 300px, aspect ratio 2:5 to 5:2." })
  declare image: any;

  @prop({ type: "video", default: {
  "type": "video",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "duration": null,
  "format": null
}, title: "Video", description: "Reference video. The character actions in the generated video will be consistent with this reference video. Supports .mp4/.mov, max 100MB, 3-30 seconds duration depending on character_orientation." })
  declare video: any;

  @prop({ type: "enum", default: "video", title: "Character Orientation", description: "Generate the orientation of the characters in the video. 'image': same orientation as the person in the picture (max 10s video). 'video': consistent with the orientation of the characters in the video (max 30s video).", values: [
  "image",
  "video"
] })
  declare character_orientation: any;

  @prop({ type: "enum", default: "720p", title: "Mode", description: "Output resolution mode. Use '720p' for 720p or '1080p' for 1080p.", values: [
  "720p",
  "1080p"
] })
  declare mode: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "kling/motion-control",
      {
        prompt: String(inputs.prompt ?? ""),
        image_url,
        motion_type: String(inputs.motion_type ?? "camera"),
        duration: String(inputs.duration ?? "5"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 37. Kling21TextToVideo
// ---------------------------------------------------------------------------
export class Kling21TextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Kling21TextToVideo";
            static readonly title = "Kling 2.1 Text To Video";
            static readonly description = "Generate videos from text using Kuaishou's Kling 2.1 model via Kie.ai.\n\n    kie, kling, kuaishou, video generation, ai, text-to-video, 2.1\n\n    Kling 2.1 powers cutting-edge video generation with hyper-realistic motion,\n    advanced physics, and high-resolution outputs up to 1080p.\n\n    Use cases:\n    - Generate high-quality videos from text descriptions\n    - Create dynamic, professional-grade video content\n    - Produce videos with realistic motion and physics";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "The aspect ratio of the generated video.", values: [
  "16:9",
  "9:16",
  "1:1"
] })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 5, title: "Duration", description: "Video duration in seconds.", min: 1, max: 10 })
  declare duration: any;

  @prop({ type: "enum", default: "720P", title: "Resolution", description: "Video resolution.", values: [
  "720P",
  "1080P"
] })
  declare resolution: any;

  @prop({ type: "enum", default: "standard", title: "Mode", description: "Generation mode: standard or pro for higher quality.", values: [
  "standard",
  "pro"
] })
  declare mode: any;

  @prop({ type: "int", default: -1, title: "Seed", description: "Random seed for reproducible results. Use -1 for random seed." })
  declare seed: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const result = await kieExecuteTask(
      apiKey,
      "kling/v2-1-text-to-video",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        duration: String(inputs.duration ?? "5"),
        negative_prompt: String(inputs.negative_prompt ?? ""),
        cfg_scale: Number(inputs.cfg_scale ?? 0.5),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 38. Kling21ImageToVideo
// ---------------------------------------------------------------------------
export class Kling21ImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Kling21ImageToVideo";
            static readonly title = "Kling 2.1 Image To Video";
            static readonly description = "Generate videos from images using Kuaishou's Kling 2.1 model via Kie.ai.\n\n    kie, kling, kuaishou, video generation, ai, image-to-video, 2.1\n\n    Kling 2.1 transforms static images into dynamic videos with hyper-realistic\n    motion and advanced physics simulation.\n\n    Use cases:\n    - Animate static images with realistic motion\n    - Create videos from photos and artwork\n    - Produce dynamic content from still images";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "Text prompt to guide the video generation." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image1", description: "First source image for the video generation." })
  declare image1: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image2", description: "Second source image (optional)." })
  declare image2: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image3", description: "Third source image (optional)." })
  declare image3: any;

  @prop({ type: "bool", default: false, title: "Sound", description: "Whether to generate sound for the video." })
  declare sound: any;

  @prop({ type: "int", default: 5, title: "Duration", description: "Video duration in seconds." })
  declare duration: any;

  @prop({ type: "enum", default: "standard", title: "Mode", description: "Generation mode: standard or pro for higher quality.", values: [
  "standard",
  "pro"
] })
  declare mode: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "kling/v2-1-image-to-video",
      {
        prompt: String(inputs.prompt ?? ""),
        image_url,
        duration: String(inputs.duration ?? "5"),
        negative_prompt: String(inputs.negative_prompt ?? ""),
        cfg_scale: Number(inputs.cfg_scale ?? 0.5),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 39. Wan25TextToVideo
// ---------------------------------------------------------------------------
export class Wan25TextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Wan25TextToVideo";
            static readonly title = "Wan 2.5 Text To Video";
            static readonly description = "Generate videos from text using Alibaba's Wan 2.5 model via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, text-to-video, 2.5\n\n    Wan 2.5 is designed for cinematic AI video generation with native audio\n    synchronization including dialogue, ambient sound, and background music.\n\n    Use cases:\n    - Generate cinematic videos from text descriptions\n    - Create videos with synchronized audio\n    - Produce content for social media and advertising";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;

  @prop({ type: "enum", default: "5s", title: "Duration", description: "The duration of the video in seconds.", values: [
  "5s",
  "10s"
] })
  declare duration: any;

  @prop({ type: "enum", default: "1080p", title: "Resolution", description: "The resolution of the video.", values: [
  "1080p",
  "720p"
] })
  declare resolution: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "The aspect ratio of the generated video.", values: [
  "16:9",
  "9:16",
  "1:1"
] })
  declare aspect_ratio: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const result = await kieExecuteTask(
      apiKey,
      "wan/2-5-text-to-video",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        resolution: String(inputs.resolution ?? "720P"),
        duration: String(inputs.duration ?? "5"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 40. Wan25ImageToVideo
// ---------------------------------------------------------------------------
export class Wan25ImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Wan25ImageToVideo";
            static readonly title = "Wan 2.5 Image To Video";
            static readonly description = "Generate videos from images using Alibaba's Wan 2.5 model via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, image-to-video, 2.5\n\n    Wan 2.5 transforms images into cinematic videos with native audio\n    synchronization.\n\n    Use cases:\n    - Animate static images with cinematic quality\n    - Create videos from photos with audio\n    - Produce dynamic content from still images";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image1", description: "First source image for the video generation." })
  declare image1: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image2", description: "Second source image (optional)." })
  declare image2: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image3", description: "Third source image (optional)." })
  declare image3: any;

  @prop({ type: "enum", default: "5s", title: "Duration", description: "The duration of the video in seconds.", values: [
  "5s",
  "10s"
] })
  declare duration: any;

  @prop({ type: "enum", default: "1080p", title: "Resolution", description: "The resolution of the video.", values: [
  "1080p",
  "720p"
] })
  declare resolution: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "wan/2-5-image-to-video",
      {
        prompt: String(inputs.prompt ?? ""),
        image_url,
        resolution: String(inputs.resolution ?? "720P"),
        duration: String(inputs.duration ?? "5"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 41. WanAnimate
// ---------------------------------------------------------------------------
export class WanAnimateNode extends BaseNode {
  static readonly nodeType = "kie.video.WanAnimate";
            static readonly title = "Wan 2.2 Animate";
            static readonly description = "Generate character animation videos using Alibaba's Wan 2.2 Animate via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, image-to-video, animate, character\n\n    Wan 2.2 Animate generates realistic character videos with motion, expressions,\n    and lighting from static images.\n\n    Use cases:\n    - Animate character images with realistic motion\n    - Create character-driven video content\n    - Produce animated videos from portraits or character art";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "The character is moving naturally with realistic expressions.", title: "Prompt", description: "The text prompt describing the character animation." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "Character image to animate." })
  declare image: any;

  @prop({ type: "enum", default: "3", title: "Duration", description: "The duration of the video in seconds.", values: [
  "3",
  "5"
] })
  declare duration: any;

  @prop({ type: "enum", default: "720p", title: "Resolution", description: "The resolution of the video.", values: [
  "720p",
  "1080p"
] })
  declare resolution: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "wan/animate",
      {
        prompt: String(inputs.prompt ?? ""),
        image_url,
        resolution: String(inputs.resolution ?? "720P"),
        duration: String(inputs.duration ?? "5"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 42. WanSpeechToVideo
// ---------------------------------------------------------------------------
export class WanSpeechToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.WanSpeechToVideo";
            static readonly title = "Wan 2.2 Speech To Video";
            static readonly description = "Generate videos from speech using Alibaba's Wan 2.2 A14B Turbo via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, speech-to-video, lip-sync\n\n    Wan 2.2 A14B Turbo Speech to Video turns static images and audio clips\n    into dynamic, expressive videos.\n\n    Use cases:\n    - Create talking head videos from images and audio\n    - Generate lip-synced content for presentations\n    - Produce dynamic videos from voice recordings";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "Character/face image to animate." })
  declare image: any;

  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Audio", description: "Audio file for speech/lip-sync." })
  declare audio: any;

  @prop({ type: "enum", default: "720p", title: "Resolution", description: "The resolution of the video.", values: [
  "720p",
  "1080p"
] })
  declare resolution: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const audio_url = await uploadAudioInput(apiKey, inputs.audio);
    const result = await kieExecuteTask(
      apiKey,
      "wan/speech-to-video",
      {
        prompt: String(inputs.prompt ?? ""),
        image_url,
        audio_url,
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 43. Wan22TextToVideo
// ---------------------------------------------------------------------------
export class Wan22TextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Wan22TextToVideo";
            static readonly title = "Wan 2.2 Text To Video";
            static readonly description = "Generate videos from text using Alibaba's Wan 2.2 A14B Turbo via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, text-to-video, 2.2\n\n    Wan 2.2 A14B Turbo delivers smooth 720p@24fps clips with cinematic quality,\n    stable motion, and consistent visual style.\n\n    Use cases:\n    - Generate high-quality videos from text\n    - Create content for diverse creative uses\n    - Produce consistent video clips with stable motion";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;

  @prop({ type: "enum", default: "3", title: "Duration", description: "The duration of the video in seconds.", values: [
  "3",
  "5"
] })
  declare duration: any;

  @prop({ type: "enum", default: "720p", title: "Resolution", description: "The resolution of the video.", values: [
  "720p"
] })
  declare resolution: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "The aspect ratio of the generated video.", values: [
  "16:9",
  "9:16",
  "1:1"
] })
  declare aspect_ratio: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const result = await kieExecuteTask(
      apiKey,
      "wan/2-2-text-to-video",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "16:9"),
        resolution: String(inputs.resolution ?? "720P"),
        duration: String(inputs.duration ?? "5"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 44. Wan22ImageToVideo
// ---------------------------------------------------------------------------
export class Wan22ImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Wan22ImageToVideo";
            static readonly title = "Wan 2.2 Image To Video";
            static readonly description = "Generate videos from images using Alibaba's Wan 2.2 A14B Turbo via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, image-to-video, 2.2\n\n    Wan 2.2 A14B Turbo transforms images into smooth video clips with\n    cinematic quality and stable motion.\n\n    Use cases:\n    - Animate static images with smooth motion\n    - Create videos from photos or artwork\n    - Produce consistent video content from images";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "Source image for the video generation." })
  declare image: any;

  @prop({ type: "enum", default: "3", title: "Duration", description: "The duration of the video in seconds.", values: [
  "3",
  "5"
] })
  declare duration: any;

  @prop({ type: "enum", default: "720p", title: "Resolution", description: "The resolution of the video.", values: [
  "720p"
] })
  declare resolution: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "wan/2-2-image-to-video",
      {
        prompt: String(inputs.prompt ?? ""),
        image_url,
        resolution: String(inputs.resolution ?? "720P"),
        duration: String(inputs.duration ?? "5"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 45. Hailuo02TextToVideo
// ---------------------------------------------------------------------------
export class Hailuo02TextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Hailuo02TextToVideo";
            static readonly title = "Hailuo 02 Text To Video";
            static readonly description = "Generate videos from text using Minimax's Hailuo 02 model via Kie.ai.\n\n    kie, hailuo, minimax, video generation, ai, text-to-video\n\n    Hailuo 02 is Minimax's advanced AI video generation model that produces\n    short, cinematic clips with realistic motion and physics simulation.\n\n    Use cases:\n    - Generate cinematic video clips from text\n    - Create videos with realistic motion and physics\n    - Produce high-quality content up to 1080P";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;

  @prop({ type: "enum", default: "5", title: "Duration", description: "The duration of the video in seconds.", values: [
  "5",
  "10"
] })
  declare duration: any;

  @prop({ type: "enum", default: "720p", title: "Resolution", description: "The resolution of the video.", values: [
  "720p",
  "1080p"
] })
  declare resolution: any;

  @prop({ type: "enum", default: "16:9", title: "Aspect Ratio", description: "The aspect ratio of the generated video.", values: [
  "16:9",
  "9:16",
  "1:1"
] })
  declare aspect_ratio: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");
    const result = await kieExecuteTask(
      apiKey,
      "hailuo/0-2-text-to-video",
      {
        prompt,
        duration: String(inputs.duration ?? "6"),
        resolution: String(inputs.resolution ?? "768P"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 46. Hailuo02ImageToVideo
// ---------------------------------------------------------------------------
export class Hailuo02ImageToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Hailuo02ImageToVideo";
            static readonly title = "Hailuo 02 Image To Video";
            static readonly description = "Generate videos from images using Minimax's Hailuo 02 model via Kie.ai.\n\n    kie, hailuo, minimax, video generation, ai, image-to-video\n\n    Hailuo 02 transforms images into cinematic clips with realistic motion\n    and physics simulation.\n\n    Use cases:\n    - Animate images with realistic motion\n    - Create videos from photos with physics simulation\n    - Produce dynamic content from still images";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "A cinematic video with smooth motion, natural lighting, and high detail.", title: "Prompt", description: "The text prompt describing the video." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "Source image for the video generation." })
  declare image: any;

  @prop({ type: "enum", default: "5", title: "Duration", description: "The duration of the video in seconds.", values: [
  "5",
  "10"
] })
  declare duration: any;

  @prop({ type: "enum", default: "720p", title: "Resolution", description: "The resolution of the video.", values: [
  "720p",
  "1080p"
] })
  declare resolution: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const image_url = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "hailuo/0-2-image-to-video",
      {
        prompt: String(inputs.prompt ?? ""),
        image_url,
        duration: String(inputs.duration ?? "6"),
        resolution: String(inputs.resolution ?? "768P"),
      },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 47. Sora2WatermarkRemover
// ---------------------------------------------------------------------------
export class Sora2WatermarkRemoverNode extends BaseNode {
  static readonly nodeType = "kie.video.Sora2WatermarkRemover";
            static readonly title = "Sora 2 Watermark Remover";
            static readonly description = "Remove watermarks from Sora 2 videos using Kie.ai.\n\n    kie, sora, openai, video editing, watermark removal\n\n    Sora 2 Watermark Remover uses AI detection and motion tracking to remove\n    dynamic watermarks from Sora 2 videos while keeping frames smooth and natural.\n\n    Use cases:\n    - Remove watermarks from generated videos\n    - Clean up video content for final output\n    - Prepare videos for professional use";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  

  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "video", default: {
  "type": "video",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "duration": null,
  "format": null
}, title: "Video", description: "Video to remove watermark from. Must be publicly accessible." })
  declare video: any;

  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const video_url = await uploadVideoInput(apiKey, inputs.video);
    const result = await kieExecuteTask(
      apiKey,
      "sora-2/watermark-remover",
      { video_url },
      8000,
      450
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
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
  Sora2WatermarkRemoverNode,
];
