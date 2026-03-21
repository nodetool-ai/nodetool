import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import { getApiKey, kieExecuteTask, uploadImageInput, isRefSet } from "./kie-base.js";

// ---------------------------------------------------------------------------
// 1. Flux2ProTextToImage
// ---------------------------------------------------------------------------
export class Flux2ProTextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.Flux2ProTextToImage";
            static readonly title = "Flux 2 Pro Text To Image";
            static readonly description = "Generate images using Black Forest Labs' Flux 2 Pro Text-to-Image model via Kie.ai.\n\n    kie, flux, flux-2, flux-pro, black-forest-labs, image generation, ai, text-to-image\n\n    Use cases:\n    - Generate high-quality artistic images from text\n    - Create professional visual content\n    - Generate images with fine detail and artistic style";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing the image to generate." })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the generated image. 'auto' matches the first input image ratio.", values: [
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
  "auto"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "1K", title: "Resolution", description: "Output image resolution.", values: [
  "1K",
  "2K"
] })
  declare resolution: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const result = await kieExecuteTask(
      apiKey,
      "flux-2/pro-text-to-image",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
        resolution: String(inputs.resolution ?? "1K"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 2. Flux2ProImageToImage
// ---------------------------------------------------------------------------
export class Flux2ProImageToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.Flux2ProImageToImage";
            static readonly title = "Flux 2 Pro Image To Image";
            static readonly description = "Generate images using Black Forest Labs' Flux 2 Pro Image-to-Image model via Kie.ai.\n\n    kie, flux, flux-2, flux-pro, black-forest-labs, image generation, ai, image-to-image\n\n    Use cases:\n    - Transform existing images with text prompts\n    - Apply artistic styles to photos\n    - Create variations of existing images\n    - Enhance and modify images";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing how to transform the image." })
  declare prompt: any;

  @prop({ type: "list[image]", default: [], title: "Images", description: "Source images to transform (1-8 images supported)." })
  declare images: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the generated image. 'auto' matches the first input image ratio.", values: [
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
  "auto"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "1K", title: "Resolution", description: "Output image resolution.", values: [
  "1K",
  "2K"
] })
  declare resolution: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const images = (inputs.images as unknown[]) ?? [];
    const input_urls: string[] = [];
    for (const img of images) {
      if (img && typeof img === "object" && ((img as Record<string, unknown>).data || (img as Record<string, unknown>).uri)) {
        input_urls.push(await uploadImageInput(apiKey, img));
      }
    }
    const result = await kieExecuteTask(
      apiKey,
      "flux-2/pro-image-to-image",
      {
        prompt,
        input_urls,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
        resolution: String(inputs.resolution ?? "1K"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 3. Flux2FlexTextToImage
// ---------------------------------------------------------------------------
export class Flux2FlexTextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.Flux2FlexTextToImage";
            static readonly title = "Flux 2 Flex Text To Image";
            static readonly description = "Generate images using Black Forest Labs' Flux 2 Flex Text-to-Image model via Kie.ai.\n\n    kie, flux, flux-2, flux-flex, black-forest-labs, image generation, ai, text-to-image\n\n    Use cases:\n    - Generate high-quality images from text with flexible parameters\n    - Create professional visual content\n    - Generate images with fine detail and artistic style";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing the image to generate." })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the generated image. 'auto' matches the first input image ratio.", values: [
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
  "auto"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "1K", title: "Resolution", description: "Output image resolution.", values: [
  "1K",
  "2K"
] })
  declare resolution: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const result = await kieExecuteTask(
      apiKey,
      "flux-2/flex-text-to-image",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
        resolution: String(inputs.resolution ?? "1K"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 4. Flux2FlexImageToImage
// ---------------------------------------------------------------------------
export class Flux2FlexImageToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.Flux2FlexImageToImage";
            static readonly title = "Flux 2 Flex Image To Image";
            static readonly description = "Generate images using Black Forest Labs' Flux 2 Flex Image-to-Image model via Kie.ai.\n\n    kie, flux, flux-2, flux-flex, black-forest-labs, image generation, ai, image-to-image\n\n    Use cases:\n    - Transform existing images with text prompts\n    - Apply artistic styles to photos\n    - Create variations of existing images\n    - Enhance and modify images";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing how to transform the image." })
  declare prompt: any;

  @prop({ type: "list[image]", default: [], title: "Images", description: "Source images to transform (1-8 images supported)." })
  declare images: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the generated image. 'auto' matches the first input image ratio.", values: [
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
  "auto"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "1K", title: "Resolution", description: "Output image resolution.", values: [
  "1K",
  "2K"
] })
  declare resolution: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const images = (inputs.images as unknown[]) ?? [];
    const input_urls: string[] = [];
    for (const img of images) {
      if (img && typeof img === "object" && ((img as Record<string, unknown>).data || (img as Record<string, unknown>).uri)) {
        input_urls.push(await uploadImageInput(apiKey, img));
      }
    }
    const result = await kieExecuteTask(
      apiKey,
      "flux-2/flex-image-to-image",
      {
        prompt,
        input_urls,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
        resolution: String(inputs.resolution ?? "1K"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 5. Seedream45TextToImage
// ---------------------------------------------------------------------------
export class Seedream45TextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.Seedream45TextToImage";
            static readonly title = "Seedream 4.5 Text To Image";
            static readonly description = "Generate images using ByteDance's Seedream 4.5 Text-to-Image model via Kie.ai.\n\n    kie, seedream, bytedance, image generation, ai, text-to-image, 4k\n\n    Seedream 4.5 generates high-quality visuals up to 4K resolution with\n    improved detail fidelity, multi-image blending, and sharp text/face rendering.\n\n    Use cases:\n    - Generate creative and artistic images from text\n    - Create diverse visual content up to 4K\n    - Generate illustrations with unique styles";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing the image to generate." })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the generated image.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "basic", title: "Quality", description: "Basic outputs 2K images, while High outputs 4K images.", values: [
  "basic",
  "high"
] })
  declare quality: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const result = await kieExecuteTask(
      apiKey,
      "seedream/4-5-text-to-image",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
        resolution: String(inputs.resolution ?? "1K"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 6. Seedream45Edit
// ---------------------------------------------------------------------------
export class Seedream45EditNode extends BaseNode {
  static readonly nodeType = "kie.image.Seedream45Edit";
            static readonly title = "Seedream 4.5 Edit";
            static readonly description = "Edit images using ByteDance's Seedream 4.5 Edit model via Kie.ai.\n\n    kie, seedream, bytedance, image editing, ai, image-to-image, 4k\n\n    Seedream 4.5 Edit allows you to modify existing images while maintaining\n    high quality and detail fidelity up to 4K resolution.\n\n    Use cases:\n    - Edit and enhance existing images\n    - Apply style changes to photos\n    - Modify specific regions of images\n    - Improve image quality and resolution";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing how to edit the image." })
  declare prompt: any;

  @prop({ type: "list[image]", default: [], title: "Image Input", description: "The source images to edit." })
  declare image_input: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the output image.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "basic", title: "Quality", description: "Basic outputs 2K images, while High outputs 4K images.", values: [
  "basic",
  "high"
] })
  declare quality: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const imageUrl = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "seedream/4-5-edit",
      {
        prompt,
        image_url: imageUrl,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
        resolution: String(inputs.resolution ?? "1K"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 7. ZImage
// ---------------------------------------------------------------------------
export class ZImageNode extends BaseNode {
  static readonly nodeType = "kie.image.ZImage";
            static readonly title = "Z-Image Turbo";
            static readonly description = "Generate images using Alibaba's Z-Image Turbo model via Kie.ai.\n\n    kie, z-image, zimage, alibaba, image generation, ai, text-to-image, photorealistic\n\n    Z-Image Turbo produces realistic, detail-rich images with very low latency.\n    It supports bilingual text (English/Chinese) in images with sharp text rendering.\n\n    Use cases:\n    - Generate high-quality photorealistic images quickly\n    - Create images with embedded text (English/Chinese)\n    - Generate detailed illustrations with low latency\n    - Product visualizations";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing the image to generate." })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the generated image.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4"
] })
  declare aspect_ratio: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {
      prompt,
      aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
    };
    const seed = Number(inputs.seed ?? -1);
    if (seed >= 0) params.seed = seed;
    const result = await kieExecuteTask(apiKey, "z-image/turbo", params, 1500, 200);
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 8. NanoBanana
// ---------------------------------------------------------------------------
export class NanoBananaNode extends BaseNode {
  static readonly nodeType = "kie.image.NanoBanana";
            static readonly title = "Nano Banana";
            static readonly description = "Generate images using Google's Nano Banana model (Gemini 2.5) via Kie.ai.\n\n    kie, nano-banana, google, gemini, image generation, ai, text-to-image, fast";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing the image to generate." })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", title: "Image Size", description: "The size of the output image.", values: [
  "1:1",
  "9:16",
  "16:9",
  "3:4",
  "4:3",
  "3:2",
  "2:3",
  "5:4",
  "4:5",
  "21:9",
  "auto"
] })
  declare image_size: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const result = await kieExecuteTask(
      apiKey,
      "nano-banana/text-to-image",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 9. NanoBananaPro
// ---------------------------------------------------------------------------
export class NanoBananaProNode extends BaseNode {
  static readonly nodeType = "kie.image.NanoBananaPro";
            static readonly title = "Nano Banana Pro";
            static readonly description = "Generate images using Google's Nano Banana Pro model (Gemini 3.0) via Kie.ai.\n\n    kie, nano-banana-pro, google, gemini, image generation, ai, text-to-image, 4k, high-fidelity";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing the image to generate." })
  declare prompt: any;

  @prop({ type: "list[image]", default: [], title: "Image Input", description: "Optional image inputs for multimodal generation." })
  declare image_input: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the generated image.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "2K", title: "Resolution", description: "Output image resolution.", values: [
  "1K",
  "2K",
  "4K"
] })
  declare resolution: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const result = await kieExecuteTask(
      apiKey,
      "nano-banana-pro/text-to-image",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 10. FluxKontext
// ---------------------------------------------------------------------------
export class FluxKontextNode extends BaseNode {
  static readonly nodeType = "kie.image.FluxKontext";
            static readonly title = "Flux Kontext";
            static readonly description = "Generate images using Black Forest Labs' Flux Kontext model via Kie.ai.\n\n    kie, flux, flux-kontext, black-forest-labs, image generation, ai, text-to-image, editing\n\n    Flux Kontext supports Pro (speed-optimized) and Max (quality-focused) variants\n    with features like multiple aspect ratios, safety controls, and async processing.\n\n    Use cases:\n    - Generate high-quality artistic images\n    - Advanced image editing and generation\n    - Create professional visual content\n    - Generate images with fine detail and artistic style";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing the image to generate." })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the generated image.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "pro", title: "Mode", description: "Generation mode: 'pro' for speed, 'max' for quality.", values: [
  "pro",
  "max"
] })
  declare mode: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const images = (inputs.images as unknown[]) ?? [];
    const input_urls: string[] = [];
    for (const img of images) {
      if (img && typeof img === "object" && ((img as Record<string, unknown>).data || (img as Record<string, unknown>).uri)) {
        input_urls.push(await uploadImageInput(apiKey, img));
      }
    }
    const params: Record<string, unknown> = {
      prompt,
      aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
    };
    if (input_urls.length > 0) params.input_urls = input_urls;
    const result = await kieExecuteTask(apiKey, "flux-kontext/text-to-image", params, 1500, 200);
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 11. GrokImagineTextToImage
// ---------------------------------------------------------------------------
export class GrokImagineTextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.GrokImagineTextToImage";
            static readonly title = "Grok Imagine Text To Image";
            static readonly description = "Generate images using xAI's Grok Imagine Text-to-Image model via Kie.ai.\n\n    kie, grok, xai, image generation, ai, text-to-image, multimodal\n\n    Grok Imagine is a multimodal generative model that can generate images\n    from text prompts.\n\n    Use cases:\n    - Generate images from text descriptions\n    - Create visual content with AI";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing the image to generate." })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the generated image.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4"
] })
  declare aspect_ratio: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const result = await kieExecuteTask(
      apiKey,
      "grok-imagine/text-to-image",
      {
        prompt,
        n: Number(inputs.n ?? 1),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 12. GrokImagineUpscale
// ---------------------------------------------------------------------------
export class GrokImagineUpscaleNode extends BaseNode {
  static readonly nodeType = "kie.image.GrokImagineUpscale";
            static readonly title = "Grok Imagine Upscale";
            static readonly description = "Upscale images using xAI's Grok Imagine Upscale model via Kie.ai.\n\n    kie, grok, xai, upscale, enhance, image, ai, super-resolution\n\n    Grok Imagine Upscale enhances and upscales images to higher resolutions\n    while maintaining quality and detail.\n\n    Constraints:\n    - Only images generated by Kie AI models (via Grok Imagine) are supported for upscaling.";
        static readonly metadataOutputTypes = {
    output: "image"
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
}, title: "Image", description: "The image to upscale. Must be an image previously generated by a Kie.ai node." })
  declare image: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const imageUrl = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "grok-imagine/upscale",
      {
        image_url: imageUrl,
        scale_factor: Number(inputs.scale_factor ?? 2),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 13. QwenTextToImage
// ---------------------------------------------------------------------------
export class QwenTextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.QwenTextToImage";
            static readonly title = "Qwen Text To Image";
            static readonly description = "Generate images using Qwen's Text-to-Image model via Kie.ai.\n\n    kie, qwen, alibaba, image generation, ai, text-to-image\n\n    Qwen's text-to-image model generates high-quality images from text descriptions.\n\n    Use cases:\n    - Generate images from text descriptions\n    - Create artistic and realistic images\n    - Generate illustrations and artwork";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing the image to generate." })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the generated image.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4"
] })
  declare aspect_ratio: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const result = await kieExecuteTask(
      apiKey,
      "qwen/text-to-image",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
        resolution: String(inputs.resolution ?? "1K"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 14. QwenImageToImage
// ---------------------------------------------------------------------------
export class QwenImageToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.QwenImageToImage";
            static readonly title = "Qwen Image To Image";
            static readonly description = "Transform images using Qwen's Image-to-Image model via Kie.ai.\n\n    kie, qwen, alibaba, image transformation, ai, image-to-image\n\n    Qwen's image-to-image model transforms images based on text prompts\n    while preserving the overall structure and style.\n\n    Use cases:\n    - Transform images with text guidance\n    - Apply artistic styles to photos\n    - Create variations of existing images";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing how to transform the image." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "The source image to transform." })
  declare image: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the output image.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4"
] })
  declare aspect_ratio: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const imageUrl = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "qwen/image-to-image",
      {
        prompt,
        image_url: imageUrl,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
        resolution: String(inputs.resolution ?? "1K"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 15. TopazImageUpscale
// ---------------------------------------------------------------------------
export class TopazImageUpscaleNode extends BaseNode {
  static readonly nodeType = "kie.image.TopazImageUpscale";
            static readonly title = "Topaz Image Upscale";
            static readonly description = "Upscale and enhance images using Topaz Labs AI via Kie.ai.\n\n    kie, topaz, upscale, enhance, image, ai, super-resolution\n\n    Topaz Image Upscale uses advanced AI models to enlarge images\n    while preserving and enhancing detail.\n\n    Use cases:\n    - Upscale low-resolution images\n    - Enhance image quality and detail\n    - Enlarge images for print or display";
        static readonly metadataOutputTypes = {
    output: "image"
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
}, title: "Image", description: "The image to upscale." })
  declare image: any;

  @prop({ type: "enum", default: "2", title: "Upscale Factor", description: "The upscaling factor (2x or 4x).", values: [
  "2",
  "4"
] })
  declare upscale_factor: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const imageUrl = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "topaz/image-upscale",
      {
        image_url: imageUrl,
        scale_factor: Number(inputs.scale_factor ?? 2),
        model_name: String(inputs.model_name ?? "Standard V2"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 16. RecraftRemoveBackground
// ---------------------------------------------------------------------------
export class RecraftRemoveBackgroundNode extends BaseNode {
  static readonly nodeType = "kie.image.RecraftRemoveBackground";
            static readonly title = "Recraft Remove Background";
            static readonly description = "Remove background from images using Recraft's model via Kie.ai.\n\n    kie, recraft, remove-background, image processing, ai\n\n    Use cases:\n    - Automatically remove backgrounds from photos\n    - Create transparent PNGs for design work\n    - Isolate subjects in images";
        static readonly metadataOutputTypes = {
    output: "image"
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
}, title: "Image", description: "The image to remove the background from." })
  declare image: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const imageUrl = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "recraft/remove-background",
      { image_url: imageUrl },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 17. IdeogramCharacter
// ---------------------------------------------------------------------------
export class IdeogramCharacterNode extends BaseNode {
  static readonly nodeType = "kie.image.IdeogramCharacter";
            static readonly title = "Ideogram Character";
            static readonly description = "Generate character images using Ideogram via Kie.ai.\n\n    kie, ideogram, character, image generation, ai, character consistency\n\n    Ideogram Character generates images of characters in different settings while\n    maintaining character consistency using reference images and text prompts.\n\n    Use cases:\n    - Generate character images in various settings\n    - Maintain character consistency across images\n    - Create character portraits with specific backgrounds";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Text description for the character image." })
  declare prompt: any;

  @prop({ type: "list[image]", default: [], title: "Reference Images", description: "Reference images for character guidance." })
  declare reference_images: any;

  @prop({ type: "enum", default: "BALANCED", title: "Rendering Speed", description: "Rendering speed preference.", values: [
  "TURBO",
  "BALANCED",
  "QUALITY"
] })
  declare rendering_speed: any;

  @prop({ type: "enum", default: "AUTO", title: "Style", description: "Generation style.", values: [
  "AUTO",
  "REALISTIC",
  "FICTION"
] })
  declare style: any;

  @prop({ type: "bool", default: true, title: "Expand Prompt", description: "Whether to expand/augment the prompt." })
  declare expand_prompt: any;

  @prop({ type: "enum", default: "square_hd", title: "Image Size", description: "The size of the output image.", values: [
  "square",
  "square_hd",
  "portrait_4_3",
  "portrait_16_9",
  "landscape_4_3",
  "landscape_16_9"
] })
  declare image_size: any;

  @prop({ type: "str", default: "", title: "Negative Prompt", description: "Undesired elements to exclude from the image." })
  declare negative_prompt: any;

  @prop({ type: "int", default: 0, title: "Seed", description: "Random seed for generation.", min: 0 })
  declare seed: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const images = (inputs.images as unknown[]) ?? [];
    const input_urls: string[] = [];
    for (const img of images) {
      if (img && typeof img === "object" && ((img as Record<string, unknown>).data || (img as Record<string, unknown>).uri)) {
        input_urls.push(await uploadImageInput(apiKey, img));
      }
    }
    const params: Record<string, unknown> = {
      prompt,
      aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
      rendering_speed: String(inputs.rendering_speed ?? "DEFAULT"),
    };
    const characterDescription = String(inputs.character_description ?? "");
    if (characterDescription) params.character_description = characterDescription;
    if (input_urls.length > 0) params.input_urls = input_urls;
    const result = await kieExecuteTask(apiKey, "ideogram/v3-character", params, 1500, 200);
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 18. IdeogramCharacterEdit
// ---------------------------------------------------------------------------
export class IdeogramCharacterEditNode extends BaseNode {
  static readonly nodeType = "kie.image.IdeogramCharacterEdit";
            static readonly title = "Ideogram Character Edit";
            static readonly description = "Edit masked character images using Ideogram via Kie.ai.\n\n    kie, ideogram, character-edit, image editing, ai, inpainting\n\n    Ideogram Character Edit allows you to fill masked parts of character images\n    while maintaining character consistency using reference images and text prompts.\n\n    Use cases:\n    - Edit specific parts of character images\n    - Fill masked areas with new content\n    - Maintain character consistency during edits";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Text description for the masked area." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "Base image with masked area to fill." })
  declare image: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Mask", description: "Mask image indicating areas to edit." })
  declare mask: any;

  @prop({ type: "list[image]", default: [], title: "Reference Images", description: "Reference images for character guidance." })
  declare reference_images: any;

  @prop({ type: "enum", default: "BALANCED", title: "Rendering Speed", description: "Rendering speed preference.", values: [
  "TURBO",
  "BALANCED",
  "QUALITY"
] })
  declare rendering_speed: any;

  @prop({ type: "enum", default: "AUTO", title: "Style", description: "Generation style.", values: [
  "AUTO",
  "REALISTIC",
  "FICTION"
] })
  declare style: any;

  @prop({ type: "bool", default: true, title: "Expand Prompt", description: "Whether to expand/augment the prompt." })
  declare expand_prompt: any;

  @prop({ type: "int", default: 0, title: "Seed", description: "Random seed for generation.", min: 0 })
  declare seed: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const imageUrl = await uploadImageInput(apiKey, inputs.image);
    const params: Record<string, unknown> = {
      prompt,
      image_url: imageUrl,
      rendering_speed: String(inputs.rendering_speed ?? "DEFAULT"),
    };
    if (isRefSet(inputs.mask)) {
      params.mask_url = await uploadImageInput(apiKey, inputs.mask);
    }
    const characterDescription = String(inputs.character_description ?? "");
    if (characterDescription) params.character_description = characterDescription;
    const refImages = (inputs.images as unknown[]) ?? [];
    const ref_urls: string[] = [];
    for (const img of refImages) {
      if (img && typeof img === "object" && ((img as Record<string, unknown>).data || (img as Record<string, unknown>).uri)) {
        ref_urls.push(await uploadImageInput(apiKey, img));
      }
    }
    if (ref_urls.length > 0) params.reference_image_urls = ref_urls;
    const result = await kieExecuteTask(apiKey, "ideogram/v3-character-edit", params, 1500, 200);
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 19. IdeogramCharacterRemix
// ---------------------------------------------------------------------------
export class IdeogramCharacterRemixNode extends BaseNode {
  static readonly nodeType = "kie.image.IdeogramCharacterRemix";
            static readonly title = "Ideogram Character Remix";
            static readonly description = "Remix characters in images using Ideogram via Kie.ai.\n\n    kie, ideogram, character-remix, image generation, ai, remix\n\n    Ideogram Character Remix allows you to remix images while maintaining character consistency\n    using reference images and text prompts.";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Text description for remixing." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "Base image to remix." })
  declare image: any;

  @prop({ type: "list[image]", default: [], title: "Reference Images", description: "Reference images for character guidance." })
  declare reference_images: any;

  @prop({ type: "enum", default: "BALANCED", title: "Rendering Speed", description: "Rendering speed preference.", values: [
  "TURBO",
  "BALANCED",
  "QUALITY"
] })
  declare rendering_speed: any;

  @prop({ type: "enum", default: "AUTO", title: "Style", description: "Generation style.", values: [
  "AUTO",
  "GENERAL",
  "REALISTIC",
  "DESIGN"
] })
  declare style: any;

  @prop({ type: "bool", default: true, title: "Expand Prompt", description: "Whether to expand/augment the prompt." })
  declare expand_prompt: any;

  @prop({ type: "enum", default: "square_hd", title: "Image Size", description: "The size of the output image.", values: [
  "square",
  "square_hd",
  "portrait_4_3",
  "portrait_16_9",
  "landscape_4_3",
  "landscape_16_9"
] })
  declare image_size: any;

  @prop({ type: "float", default: 0.8, title: "Strength", description: "How strongly to apply the remix (0.0 to 1.0).", min: 0, max: 1 })
  declare strength: any;

  @prop({ type: "str", default: "", title: "Negative Prompt", description: "Undesired elements to exclude from the image." })
  declare negative_prompt: any;

  @prop({ type: "list[image]", default: [], title: "Additional Images", description: "Additional image inputs." })
  declare additional_images: any;

  @prop({ type: "str", default: "", title: "Reference Mask Urls", description: "URL(s) to masks for references (comma-separated)." })
  declare reference_mask_urls: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const imageUrl = await uploadImageInput(apiKey, inputs.image);
    const params: Record<string, unknown> = {
      prompt,
      image_url: imageUrl,
      rendering_speed: String(inputs.rendering_speed ?? "DEFAULT"),
      style_type: String(inputs.style_type ?? "AUTO"),
    };
    const characterDescription = String(inputs.character_description ?? "");
    if (characterDescription) params.character_description = characterDescription;
    const refImages = (inputs.images as unknown[]) ?? [];
    const ref_urls: string[] = [];
    for (const img of refImages) {
      if (img && typeof img === "object" && ((img as Record<string, unknown>).data || (img as Record<string, unknown>).uri)) {
        ref_urls.push(await uploadImageInput(apiKey, img));
      }
    }
    if (ref_urls.length > 0) params.reference_image_urls = ref_urls;
    const result = await kieExecuteTask(apiKey, "ideogram/v3-character-remix", params, 1500, 200);
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 20. IdeogramV3Reframe
// ---------------------------------------------------------------------------
export class IdeogramV3ReframeNode extends BaseNode {
  static readonly nodeType = "kie.image.IdeogramV3Reframe";
            static readonly title = "Ideogram V3 Reframe";
            static readonly description = "Reframe images using Ideogram v3 via Kie.ai.\n\n    kie, ideogram, v3-reframe, image processing, ai, reframe\n\n    Use cases:\n    - Reframe and rescale existing images\n    - Change aspect ratio of images while maintaining quality";
        static readonly metadataOutputTypes = {
    output: "image"
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
}, title: "Image", description: "URL of the image to reframe." })
  declare image: any;

  @prop({ type: "enum", default: "square_hd", title: "Image Size", description: "Output resolution preset.", values: [
  "square",
  "square_hd",
  "portrait_4_3",
  "portrait_16_9",
  "landscape_4_3",
  "landscape_16_9"
] })
  declare image_size: any;

  @prop({ type: "enum", default: "BALANCED", title: "Rendering Speed", description: "Rendering speed preference.", values: [
  "TURBO",
  "BALANCED",
  "QUALITY"
] })
  declare rendering_speed: any;

  @prop({ type: "enum", default: "AUTO", title: "Style", description: "Generation style.", values: [
  "AUTO",
  "GENERAL",
  "REALISTIC",
  "DESIGN"
] })
  declare style: any;

  @prop({ type: "int", default: 0, title: "Seed", description: "RNG seed." })
  declare seed: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const imageUrl = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "ideogram/v3-reframe",
      {
        image_url: imageUrl,
        resolution: String(inputs.resolution ?? "AUTO"),
        rendering_speed: String(inputs.rendering_speed ?? "DEFAULT"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 21. RecraftCrispUpscale
// ---------------------------------------------------------------------------
export class RecraftCrispUpscaleNode extends BaseNode {
  static readonly nodeType = "kie.image.RecraftCrispUpscale";
            static readonly title = "Recraft Crisp Upscale";
            static readonly description = "Upscale images using Recraft's Crisp Upscale model via Kie.ai.\n\n    kie, recraft, crisp-upscale, upscale, ai";
        static readonly metadataOutputTypes = {
    output: "image"
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
}, title: "Image", description: "The image to upscale." })
  declare image: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const imageUrl = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "recraft/crisp-upscale",
      { image_url: imageUrl },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 22. Imagen4Fast
// ---------------------------------------------------------------------------
export class Imagen4FastNode extends BaseNode {
  static readonly nodeType = "kie.image.Imagen4Fast";
            static readonly title = "Imagen 4 Fast";
            static readonly description = "Generate images using Google's Imagen 4 Fast model via Kie.ai.\n\n    kie, google, imagen, imagen4, fast, image generation, ai";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing the image to generate." })
  declare prompt: any;

  @prop({ type: "str", default: "", title: "Negative Prompt", description: "Undesired elements to exclude." })
  declare negative_prompt: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the generated image.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4"
] })
  declare aspect_ratio: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const result = await kieExecuteTask(
      apiKey,
      "imagen-4/fast",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 23. Imagen4Ultra
// ---------------------------------------------------------------------------
export class Imagen4UltraNode extends BaseNode {
  static readonly nodeType = "kie.image.Imagen4Ultra";
            static readonly title = "Imagen 4 Ultra";
            static readonly description = "Generate images using Google's Imagen 4 Ultra model via Kie.ai.\n\n    kie, google, imagen, imagen4, ultra, image generation, ai";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing the image to generate." })
  declare prompt: any;

  @prop({ type: "str", default: "", title: "Negative Prompt", description: "Undesired elements to exclude." })
  declare negative_prompt: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the generated image.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4"
] })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 0, title: "Seed", description: "RNG seed." })
  declare seed: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const result = await kieExecuteTask(
      apiKey,
      "imagen-4/ultra",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 24. Imagen4
// ---------------------------------------------------------------------------
export class Imagen4Node extends BaseNode {
  static readonly nodeType = "kie.image.Imagen4";
            static readonly title = "Imagen 4";
            static readonly description = "Generate images using Google's Imagen 4 model via Kie.ai.\n\n    kie, google, imagen, imagen4, image generation, ai";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing the image to generate." })
  declare prompt: any;

  @prop({ type: "str", default: "", title: "Negative Prompt", description: "Undesired elements to exclude." })
  declare negative_prompt: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the generated image.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4"
] })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 0, title: "Seed", description: "RNG seed." })
  declare seed: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const result = await kieExecuteTask(
      apiKey,
      "imagen-4/standard",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 25. NanoBananaEdit
// ---------------------------------------------------------------------------
export class NanoBananaEditNode extends BaseNode {
  static readonly nodeType = "kie.image.NanoBananaEdit";
            static readonly title = "Nano Banana Edit";
            static readonly description = "Edit images using Google's Nano Banana model via Kie.ai.\n\n    kie, google, nano-banana, nano-banana-edit, image editing, ai";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Text description of the changes to make." })
  declare prompt: any;

  @prop({ type: "list[image]", default: [], title: "Image Input", description: "Images to edit." })
  declare image_input: any;

  @prop({ type: "enum", default: "1:1", title: "Image Size", description: "The size of the output image.", values: [
  "1:1",
  "9:16",
  "16:9",
  "3:4",
  "4:3",
  "3:2",
  "2:3",
  "5:4",
  "4:5",
  "21:9",
  "auto"
] })
  declare image_size: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const imageUrl = await uploadImageInput(apiKey, inputs.image);
    const params: Record<string, unknown> = {
      prompt,
      image_url: imageUrl,
    };
    if (isRefSet(inputs.mask)) {
      params.mask_url = await uploadImageInput(apiKey, inputs.mask);
    }
    const result = await kieExecuteTask(apiKey, "nano-banana/edit", params, 1500, 200);
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 26. GPTImage4oTextToImage
// ---------------------------------------------------------------------------
export class GPTImage4oTextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.GPTImage4oTextToImage";
            static readonly title = "GPT 4o Image Text To Image";
            static readonly description = "Generate images using OpenAI's GPT-4o Image model via Kie.ai.\n\n    kie, openai, gpt-4o, 4o-image, image generation, ai, text-to-image\n\n    The GPT-Image-1 model (ChatGPT 4o Image) understands both text and visual\n    context, allowing precise image creation with accurate text rendering\n    and consistent styles.\n\n    Use cases:\n    - Generate high-quality images from text descriptions\n    - Create images with precise text rendering\n    - Generate design and marketing materials\n    - Produce creative visuals with strong instruction following";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing the image to generate." })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", title: "Size", description: "The aspect ratio of the generated image.", values: [
  "1:1",
  "3:2",
  "2:3"
] })
  declare size: any;

  @prop({ type: "int", default: 1, title: "N Variants", description: "Number of image variants to generate (1, 2, or 4).", min: 1, max: 4 })
  declare n_variants: any;

  @prop({ type: "bool", default: false, title: "Is Enhance", description: "Enable prompt enhancement for more refined effects." })
  declare is_enhance: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const result = await kieExecuteTask(
      apiKey,
      "gpt-image-4o/text-to-image",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
        quality: String(inputs.quality ?? "standard"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 27. GPTImage4oImageToImage
// ---------------------------------------------------------------------------
export class GPTImage4oImageToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.GPTImage4oImageToImage";
            static readonly title = "GPT 4o Image Edit";
            static readonly description = "Edit images using OpenAI's GPT-4o Image model via Kie.ai.\n\n    kie, openai, gpt-4o, 4o-image, image editing, ai, image-to-image\n\n    The GPT-Image-1 model (ChatGPT 4o Image) enables precise image editing\n    with strong instruction following and accurate text rendering.\n\n    Use cases:\n    - Edit and transform existing images\n    - Apply specific modifications to images\n    - Add or modify text in images\n    - Create variations of existing visuals";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing how to edit the image." })
  declare prompt: any;

  @prop({ type: "list[image]", default: [], title: "Images", description: "Input images to edit (supports up to 5 images)." })
  declare images: any;

  @prop({ type: "enum", default: "1:1", title: "Size", description: "The aspect ratio of the output image.", values: [
  "1:1",
  "3:2",
  "2:3"
] })
  declare size: any;

  @prop({ type: "int", default: 1, title: "N Variants", description: "Number of image variants to generate (1, 2, or 4).", min: 1, max: 4 })
  declare n_variants: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const images = (inputs.images as unknown[]) ?? [];
    const input_urls: string[] = [];
    for (const img of images) {
      if (img && typeof img === "object" && ((img as Record<string, unknown>).data || (img as Record<string, unknown>).uri)) {
        input_urls.push(await uploadImageInput(apiKey, img));
      }
    }
    const result = await kieExecuteTask(
      apiKey,
      "gpt-image-4o/image-to-image",
      {
        prompt,
        input_urls,
        quality: String(inputs.quality ?? "standard"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 28. GPTImage15TextToImage
// ---------------------------------------------------------------------------
export class GPTImage15TextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.GPTImage15TextToImage";
            static readonly title = "GPT Image 1.5 Text To Image";
            static readonly description = "Generate images using OpenAI's GPT Image 1.5 model via Kie.ai.\n\n    kie, openai, gpt-image-1.5, image generation, ai, text-to-image\n\n    GPT Image 1.5 is OpenAI's flagship image generation model for high-quality\n    image creation and precise image editing, with strong instruction following\n    and improved text rendering.\n\n    Use cases:\n    - Generate high-quality images from text descriptions\n    - Create images with excellent text rendering\n    - Generate professional marketing and design materials\n    - Produce creative visuals with precise control";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing the image to generate." })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the generated image.", values: [
  "1:1",
  "2:3",
  "3:2"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "medium", title: "Quality", description: "Image quality setting. Medium = balanced, High = slow/detailed.", values: [
  "medium",
  "high"
] })
  declare quality: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const result = await kieExecuteTask(
      apiKey,
      "gpt-image-1-5/text-to-image",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
        quality: String(inputs.quality ?? "standard"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 29. GPTImage15ImageToImage
// ---------------------------------------------------------------------------
export class GPTImage15ImageToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.GPTImage15ImageToImage";
            static readonly title = "GPT Image 1.5 Edit";
            static readonly description = "Edit images using OpenAI's GPT Image 1.5 model via Kie.ai.\n\n    kie, openai, gpt-image-1.5, image editing, ai, image-to-image\n\n    GPT Image 1.5 enables precise image editing with strong instruction following\n    and improved text rendering capabilities.\n\n    Use cases:\n    - Edit and transform existing images\n    - Apply specific modifications with precise control\n    - Add or modify text in images accurately\n    - Create variations with high fidelity";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing how to edit the image." })
  declare prompt: any;

  @prop({ type: "list[image]", default: [], title: "Images", description: "Input images to edit (supports up to 16 images)." })
  declare images: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the output image.", values: [
  "1:1",
  "2:3",
  "3:2"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "medium", title: "Quality", description: "Image quality setting. Medium = balanced, High = slow/detailed.", values: [
  "medium",
  "high"
] })
  declare quality: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const images = (inputs.images as unknown[]) ?? [];
    const input_urls: string[] = [];
    for (const img of images) {
      if (img && typeof img === "object" && ((img as Record<string, unknown>).data || (img as Record<string, unknown>).uri)) {
        input_urls.push(await uploadImageInput(apiKey, img));
      }
    }
    const result = await kieExecuteTask(
      apiKey,
      "gpt-image-1-5/image-to-image",
      {
        prompt,
        input_urls,
        quality: String(inputs.quality ?? "standard"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 30. IdeogramV3TextToImage
// ---------------------------------------------------------------------------
export class IdeogramV3TextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.IdeogramV3TextToImage";
            static readonly title = "Ideogram V3 Text To Image";
            static readonly description = "Generate images using Ideogram V3 model via Kie.ai.\n\n    kie, ideogram, v3, image generation, ai, text-to-image\n\n    Ideogram V3 is the latest generation of Ideogram's image generation model,\n    offering text-to-image with improved consistency and creative control.\n\n    Use cases:\n    - Generate creative images from text descriptions\n    - Create images with excellent text rendering\n    - Produce artistic and design content";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing the image to generate." })
  declare prompt: any;

  @prop({ type: "str", default: "", title: "Negative Prompt", description: "Elements to avoid in the generated image." })
  declare negative_prompt: any;

  @prop({ type: "enum", default: "BALANCED", title: "Rendering Speed", description: "Rendering speed preference.", values: [
  "TURBO",
  "BALANCED",
  "QUALITY"
] })
  declare rendering_speed: any;

  @prop({ type: "enum", default: "AUTO", title: "Style", description: "Generation style.", values: [
  "AUTO",
  "GENERAL",
  "REALISTIC",
  "DESIGN"
] })
  declare style: any;

  @prop({ type: "enum", default: "square", title: "Image Size", description: "The resolution of the generated image.", values: [
  "square",
  "square_hd",
  "portrait_4_3",
  "portrait_16_9",
  "landscape_4_3",
  "landscape_16_9"
] })
  declare image_size: any;

  @prop({ type: "bool", default: true, title: "Expand Prompt", description: "Whether to expand/augment the prompt with MagicPrompt." })
  declare expand_prompt: any;

  @prop({ type: "int", default: -1, title: "Seed", description: "Random seed for reproducible results. Use -1 for random." })
  declare seed: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {
      prompt,
      aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
      rendering_speed: String(inputs.rendering_speed ?? "DEFAULT"),
      style_type: String(inputs.style_type ?? "AUTO"),
    };
    const negativePrompt = String(inputs.negative_prompt ?? "");
    if (negativePrompt) params.negative_prompt = negativePrompt;
    const result = await kieExecuteTask(apiKey, "ideogram/v3-text-to-image", params, 1500, 200);
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 31. IdeogramV3ImageToImage
// ---------------------------------------------------------------------------
export class IdeogramV3ImageToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.IdeogramV3ImageToImage";
            static readonly title = "Ideogram V3 Image To Image";
            static readonly description = "Edit images using Ideogram V3 model via Kie.ai.\n\n    kie, ideogram, v3, image editing, ai, image-to-image\n\n    Ideogram V3 offers image editing capabilities with improved consistency\n    and creative control.\n\n    Use cases:\n    - Edit and transform existing images\n    - Apply style changes while maintaining structure\n    - Create variations of existing images";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing how to transform the image." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "The source image to transform." })
  declare image: any;

  @prop({ type: "str", default: "", title: "Negative Prompt", description: "Elements to avoid in the output." })
  declare negative_prompt: any;

  @prop({ type: "enum", default: "BALANCED", title: "Rendering Speed", description: "Rendering speed preference.", values: [
  "TURBO",
  "BALANCED",
  "QUALITY"
] })
  declare rendering_speed: any;

  @prop({ type: "enum", default: "AUTO", title: "Style", description: "Generation style.", values: [
  "AUTO",
  "GENERAL",
  "REALISTIC",
  "DESIGN"
] })
  declare style: any;

  @prop({ type: "enum", default: "square", title: "Image Size", description: "The resolution of the output image.", values: [
  "square",
  "square_hd",
  "portrait_4_3",
  "portrait_16_9",
  "landscape_4_3",
  "landscape_16_9"
] })
  declare image_size: any;

  @prop({ type: "float", default: 0.5, title: "Strength", description: "Strength of the input image in the remix (0-1). Lower = more original preserved.", min: 0, max: 1 })
  declare strength: any;

  @prop({ type: "bool", default: true, title: "Expand Prompt", description: "Whether to expand/augment the prompt with MagicPrompt." })
  declare expand_prompt: any;

  @prop({ type: "int", default: -1, title: "Seed", description: "Random seed for reproducible results. Use -1 for random." })
  declare seed: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const imageUrl = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "ideogram/v3-image-to-image",
      {
        prompt,
        image_url: imageUrl,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
        rendering_speed: String(inputs.rendering_speed ?? "DEFAULT"),
        style_type: String(inputs.style_type ?? "AUTO"),
        image_weight: Number(inputs.image_weight ?? 50),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 32. Seedream40TextToImage
// ---------------------------------------------------------------------------
export class Seedream40TextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.Seedream40TextToImage";
            static readonly title = "Seedream 4.0 Text To Image";
            static readonly description = "Generate images using ByteDance's Seedream 4.0 model via Kie.ai.\n\n    kie, seedream, bytedance, seedream-4, image generation, ai, text-to-image\n\n    Seedream 4.0 is ByteDance's image generation model that combines text-to-image\n    with batch consistency, high speed, and professional-quality outputs.\n\n    Use cases:\n    - Generate creative and artistic images from text\n    - Create professional visual content\n    - Produce consistent batch images";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing the image to generate." })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the generated image.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "basic", title: "Quality", description: "Basic outputs 2K images, while High outputs 4K images.", values: [
  "basic",
  "high"
] })
  declare quality: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const result = await kieExecuteTask(
      apiKey,
      "seedream/4-0-text-to-image",
      {
        prompt,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
        resolution: String(inputs.resolution ?? "1K"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// 33. Seedream40ImageToImage
// ---------------------------------------------------------------------------
export class Seedream40ImageToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.Seedream40ImageToImage";
            static readonly title = "Seedream 4.0 Edit";
            static readonly description = "Edit images using ByteDance's Seedream 4.0 model via Kie.ai.\n\n    kie, seedream, bytedance, seedream-4, image editing, ai, image-to-image\n\n    Seedream 4.0 offers image-to-image capabilities with batch consistency\n    and professional-quality outputs.\n\n    Use cases:\n    - Edit and transform existing images\n    - Apply style changes to photos\n    - Create variations of existing images";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt describing how to transform the image." })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "The source image to transform." })
  declare image: any;

  @prop({ type: "enum", default: "1:1", title: "Aspect Ratio", description: "The aspect ratio of the output image.", values: [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4"
] })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "basic", title: "Quality", description: "Basic outputs 2K images, while High outputs 4K images.", values: [
  "basic",
  "high"
] })
  declare quality: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");
    const imageUrl = await uploadImageInput(apiKey, inputs.image);
    const result = await kieExecuteTask(
      apiKey,
      "seedream/4-0-image-to-image",
      {
        prompt,
        image_url: imageUrl,
        aspect_ratio: String(inputs.aspect_ratio ?? "1:1"),
        resolution: String(inputs.resolution ?? "1K"),
      },
      1500,
      200
    );
    return { output: { data: result.data } };
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const KIE_IMAGE_NODES: readonly NodeClass[] = [
  Flux2ProTextToImageNode,
  Flux2ProImageToImageNode,
  Flux2FlexTextToImageNode,
  Flux2FlexImageToImageNode,
  Seedream45TextToImageNode,
  Seedream45EditNode,
  ZImageNode,
  NanoBananaNode,
  NanoBananaProNode,
  FluxKontextNode,
  GrokImagineTextToImageNode,
  GrokImagineUpscaleNode,
  QwenTextToImageNode,
  QwenImageToImageNode,
  TopazImageUpscaleNode,
  RecraftRemoveBackgroundNode,
  IdeogramCharacterNode,
  IdeogramCharacterEditNode,
  IdeogramCharacterRemixNode,
  IdeogramV3ReframeNode,
  RecraftCrispUpscaleNode,
  Imagen4FastNode,
  Imagen4UltraNode,
  Imagen4Node,
  NanoBananaEditNode,
  GPTImage4oTextToImageNode,
  GPTImage4oImageToImageNode,
  GPTImage15TextToImageNode,
  GPTImage15ImageToImageNode,
  IdeogramV3TextToImageNode,
  IdeogramV3ImageToImageNode,
  Seedream40TextToImageNode,
  Seedream40ImageToImageNode,
];
