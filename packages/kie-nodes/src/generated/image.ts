import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getApiKey,
  kieExecuteTask,
  isRefSet,
  uploadImageInput
} from "../kie-base.js";

export class Flux2ProTextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.Flux2ProTextToImage";
  static readonly title = "Flux 2 Pro Text To Image";
  static readonly description = `Generate images using Black Forest Labs' Flux 2 Pro Text-to-Image model via Kie.ai.

    kie, flux, flux-2, flux-pro, black-forest-labs, image generation, ai, text-to-image

    Use cases:
    - Generate high-quality artistic images from text
    - Create professional visual content
    - Generate images with fine detail and artistic style`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "auto"],
    title: "Aspect Ratio",
    description:
      "The aspect ratio of the generated image. 'auto' matches the first input image ratio."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "1K",
    values: ["1K", "2K"],
    title: "Resolution",
    description: "Output image resolution."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    params["resolution"] = String(this.resolution ?? "1K");

    const result = await kieExecuteTask(
      apiKey,
      "flux-2/pro-text-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class Flux2ProImageToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.Flux2ProImageToImage";
  static readonly title = "Flux 2 Pro Image To Image";
  static readonly description = `Generate images using Black Forest Labs' Flux 2 Pro Image-to-Image model via Kie.ai.

    kie, flux, flux-2, flux-pro, black-forest-labs, image generation, ai, image-to-image

    Use cases:
    - Transform existing images with text prompts
    - Apply artistic styles to photos
    - Create variations of existing images
    - Enhance and modify images`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing how to transform the image."
  })
  declare prompt: any;

  @prop({
    type: "list[image]",
    default: [],
    title: "Images",
    description: "Source images to transform (1-8 images supported)."
  })
  declare images: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "auto"],
    title: "Aspect Ratio",
    description:
      "The aspect ratio of the generated image. 'auto' matches the first input image ratio."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "1K",
    values: ["1K", "2K"],
    title: "Resolution",
    description: "Output image resolution."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const imagesUrls: string[] = [];
    const imagesList = Array.isArray(this.images) ? this.images : [];
    for (const item of imagesList) {
      if (isRefSet(item)) imagesUrls.push(await uploadImageInput(apiKey, item));
    }
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    params["resolution"] = String(this.resolution ?? "1K");
    if (imagesUrls.length) params["input_urls"] = imagesUrls;

    const result = await kieExecuteTask(
      apiKey,
      "flux-2/pro-image-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class Flux2FlexTextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.Flux2FlexTextToImage";
  static readonly title = "Flux 2 Flex Text To Image";
  static readonly description = `Generate images using Black Forest Labs' Flux 2 Flex Text-to-Image model via Kie.ai.

    kie, flux, flux-2, flux-flex, black-forest-labs, image generation, ai, text-to-image

    Use cases:
    - Generate high-quality images from text with flexible parameters
    - Create professional visual content
    - Generate images with fine detail and artistic style`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "auto"],
    title: "Aspect Ratio",
    description:
      "The aspect ratio of the generated image. 'auto' matches the first input image ratio."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "1K",
    values: ["1K", "2K"],
    title: "Resolution",
    description: "Output image resolution."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    params["resolution"] = String(this.resolution ?? "1K");

    const result = await kieExecuteTask(
      apiKey,
      "flux-2/flex-text-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class Flux2FlexImageToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.Flux2FlexImageToImage";
  static readonly title = "Flux 2 Flex Image To Image";
  static readonly description = `Generate images using Black Forest Labs' Flux 2 Flex Image-to-Image model via Kie.ai.

    kie, flux, flux-2, flux-flex, black-forest-labs, image generation, ai, image-to-image

    Use cases:
    - Transform existing images with text prompts
    - Apply artistic styles to photos
    - Create variations of existing images
    - Enhance and modify images`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing how to transform the image."
  })
  declare prompt: any;

  @prop({
    type: "list[image]",
    default: [],
    title: "Images",
    description: "Source images to transform (1-8 images supported)."
  })
  declare images: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "auto"],
    title: "Aspect Ratio",
    description:
      "The aspect ratio of the generated image. 'auto' matches the first input image ratio."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "1K",
    values: ["1K", "2K"],
    title: "Resolution",
    description: "Output image resolution."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const imagesUrls: string[] = [];
    const imagesList = Array.isArray(this.images) ? this.images : [];
    for (const item of imagesList) {
      if (isRefSet(item)) imagesUrls.push(await uploadImageInput(apiKey, item));
    }
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    params["resolution"] = String(this.resolution ?? "1K");
    if (imagesUrls.length) params["input_urls"] = imagesUrls;

    const result = await kieExecuteTask(
      apiKey,
      "flux-2/flex-image-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class Seedream45TextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.Seedream45TextToImage";
  static readonly title = "Seedream 4.5 Text To Image";
  static readonly description = `Generate images using ByteDance's Seedream 4.5 Text-to-Image model via Kie.ai.

    kie, seedream, bytedance, image generation, ai, text-to-image, 4k

    Seedream 4.5 generates high-quality visuals up to 4K resolution with
    improved detail fidelity, multi-image blending, and sharp text/face rendering.

    Use cases:
    - Generate creative and artistic images from text
    - Create diverse visual content up to 4K
    - Generate illustrations with unique styles`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "basic",
    values: ["basic", "high"],
    title: "Quality",
    description: "Basic outputs 2K images, while High outputs 4K images."
  })
  declare quality: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    params["resolution"] = String(this.quality ?? "basic");

    const result = await kieExecuteTask(
      apiKey,
      "seedream/4-5-text-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class Seedream45EditNode extends BaseNode {
  static readonly nodeType = "kie.image.Seedream45Edit";
  static readonly title = "Seedream 4.5 Edit";
  static readonly description = `Edit images using ByteDance's Seedream 4.5 Edit model via Kie.ai.

    kie, seedream, bytedance, image editing, ai, image-to-image, 4k

    Seedream 4.5 Edit allows you to modify existing images while maintaining
    high quality and detail fidelity up to 4K resolution.

    Use cases:
    - Edit and enhance existing images
    - Apply style changes to photos
    - Modify specific regions of images
    - Improve image quality and resolution`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing how to edit the image."
  })
  declare prompt: any;

  @prop({
    type: "list[image]",
    default: [],
    title: "Image Input",
    description: "The source images to edit."
  })
  declare image_input: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the output image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "basic",
    values: ["basic", "high"],
    title: "Quality",
    description: "Basic outputs 2K images, while High outputs 4K images."
  })
  declare quality: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    let imageInputUrl = "";
    if (isRefSet(this.image_input))
      imageInputUrl = await uploadImageInput(apiKey, this.image_input);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    params["resolution"] = String(this.quality ?? "basic");
    if (imageInputUrl) params["image_url"] = imageInputUrl;

    const result = await kieExecuteTask(
      apiKey,
      "seedream/4-5-edit",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class ZImageNode extends BaseNode {
  static readonly nodeType = "kie.image.ZImage";
  static readonly title = "Z-Image Turbo";
  static readonly description = `Generate images using Alibaba's Z-Image Turbo model via Kie.ai.

    kie, z-image, zimage, alibaba, image generation, ai, text-to-image, photorealistic

    Z-Image Turbo produces realistic, detail-rich images with very low latency.
    It supports bilingual text (English/Chinese) in images with sharp text rendering.

    Use cases:
    - Generate high-quality photorealistic images quickly
    - Create images with embedded text (English/Chinese)
    - Generate detailed illustrations with low latency
    - Product visualizations`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated image."
  })
  declare aspect_ratio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");

    const result = await kieExecuteTask(
      apiKey,
      "z-image/turbo",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class NanoBananaNode extends BaseNode {
  static readonly nodeType = "kie.image.NanoBanana";
  static readonly title = "Nano Banana";
  static readonly description = `Generate images using Google's Nano Banana model (Gemini 2.5) via Kie.ai.

    kie, nano-banana, google, gemini, image generation, ai, text-to-image, fast`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: [
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
    ],
    title: "Image Size",
    description: "The size of the output image."
  })
  declare image_size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["aspect_ratio"] = String(this.image_size ?? "1:1");

    const result = await kieExecuteTask(
      apiKey,
      "nano-banana/text-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class NanoBananaProNode extends BaseNode {
  static readonly nodeType = "kie.image.NanoBananaPro";
  static readonly title = "Nano Banana Pro";
  static readonly description = `Generate images using Google's Nano Banana Pro model (Gemini 3.0) via Kie.ai.

    kie, nano-banana-pro, google, gemini, image generation, ai, text-to-image, 4k, high-fidelity`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "list[image]",
    default: [],
    title: "Image Input",
    description: "Optional image inputs for multimodal generation."
  })
  declare image_input: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "2K",
    values: ["1K", "2K", "4K"],
    title: "Resolution",
    description: "Output image resolution."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    params["resolution"] = String(this.resolution ?? "2K");

    const result = await kieExecuteTask(
      apiKey,
      "nano-banana-pro/text-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class FluxKontextNode extends BaseNode {
  static readonly nodeType = "kie.image.FluxKontext";
  static readonly title = "Flux Kontext";
  static readonly description = `Generate images using Black Forest Labs' Flux Kontext model via Kie.ai.

    kie, flux, flux-kontext, black-forest-labs, image generation, ai, text-to-image, editing

    Flux Kontext supports Pro (speed-optimized) and Max (quality-focused) variants
    with features like multiple aspect ratios, safety controls, and async processing.

    Use cases:
    - Generate high-quality artistic images
    - Advanced image editing and generation
    - Create professional visual content
    - Generate images with fine detail and artistic style`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "pro",
    values: ["pro", "max"],
    title: "Mode",
    description: "Generation mode: 'pro' for speed, 'max' for quality."
  })
  declare mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    params["mode"] = String(this.mode ?? "pro");

    const result = await kieExecuteTask(
      apiKey,
      "flux-kontext/text-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class GrokImagineTextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.GrokImagineTextToImage";
  static readonly title = "Grok Imagine Text To Image";
  static readonly description = `Generate images using xAI's Grok Imagine Text-to-Image model via Kie.ai.

    kie, grok, xai, image generation, ai, text-to-image, multimodal

    Grok Imagine is a multimodal generative model that can generate images
    from text prompts.

    Use cases:
    - Generate images from text descriptions
    - Create visual content with AI`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated image."
  })
  declare aspect_ratio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");

    const result = await kieExecuteTask(
      apiKey,
      "grok-imagine/text-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class GrokImagineUpscaleNode extends BaseNode {
  static readonly nodeType = "kie.image.GrokImagineUpscale";
  static readonly title = "Grok Imagine Upscale";
  static readonly description = `Upscale images using xAI's Grok Imagine Upscale model via Kie.ai.

    kie, grok, xai, upscale, enhance, image, ai, super-resolution

    Grok Imagine Upscale enhances and upscales images to higher resolutions
    while maintaining quality and detail.

    Constraints:
    - Only images generated by Kie AI models (via Grok Imagine) are supported for upscaling.`;
  static readonly metadataOutputTypes = { output: "image" };
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
    description:
      "The image to upscale. Must be an image previously generated by a Kie.ai node."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "grok-imagine/upscale",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class QwenTextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.QwenTextToImage";
  static readonly title = "Qwen Text To Image";
  static readonly description = `Generate images using Qwen's Text-to-Image model via Kie.ai.

    kie, qwen, alibaba, image generation, ai, text-to-image

    Qwen's text-to-image model generates high-quality images from text descriptions.

    Use cases:
    - Generate images from text descriptions
    - Create artistic and realistic images
    - Generate illustrations and artwork`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated image."
  })
  declare aspect_ratio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");

    const result = await kieExecuteTask(
      apiKey,
      "qwen/text-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class QwenImageToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.QwenImageToImage";
  static readonly title = "Qwen Image To Image";
  static readonly description = `Transform images using Qwen's Image-to-Image model via Kie.ai.

    kie, qwen, alibaba, image transformation, ai, image-to-image

    Qwen's image-to-image model transforms images based on text prompts
    while preserving the overall structure and style.

    Use cases:
    - Transform images with text guidance
    - Apply artistic styles to photos
    - Create variations of existing images`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing how to transform the image."
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
    description: "The source image to transform."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the output image."
  })
  declare aspect_ratio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "qwen/image-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class TopazImageUpscaleNode extends BaseNode {
  static readonly nodeType = "kie.image.TopazImageUpscale";
  static readonly title = "Topaz Image Upscale";
  static readonly description = `Upscale and enhance images using Topaz Labs AI via Kie.ai.

    kie, topaz, upscale, enhance, image, ai, super-resolution

    Topaz Image Upscale uses advanced AI models to enlarge images
    while preserving and enhancing detail.

    Use cases:
    - Upscale low-resolution images
    - Enhance image quality and detail
    - Enlarge images for print or display`;
  static readonly metadataOutputTypes = { output: "image" };
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
    description: "The image to upscale."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "2",
    values: ["2", "4"],
    title: "Upscale Factor",
    description: "The upscaling factor (2x or 4x)."
  })
  declare upscale_factor: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    params["scale_factor"] = String(this.upscale_factor ?? "2");
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "topaz/image-upscale",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class RecraftRemoveBackgroundNode extends BaseNode {
  static readonly nodeType = "kie.image.RecraftRemoveBackground";
  static readonly title = "Recraft Remove Background";
  static readonly description = `Remove background from images using Recraft's model via Kie.ai.

    kie, recraft, remove-background, image processing, ai

    Use cases:
    - Automatically remove backgrounds from photos
    - Create transparent PNGs for design work
    - Isolate subjects in images`;
  static readonly metadataOutputTypes = { output: "image" };
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
    description: "The image to remove the background from."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "recraft/remove-background",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class IdeogramCharacterNode extends BaseNode {
  static readonly nodeType = "kie.image.IdeogramCharacter";
  static readonly title = "Ideogram Character";
  static readonly description = `Generate character images using Ideogram via Kie.ai.

    kie, ideogram, character, image generation, ai, character consistency

    Ideogram Character generates images of characters in different settings while
    maintaining character consistency using reference images and text prompts.

    Use cases:
    - Generate character images in various settings
    - Maintain character consistency across images
    - Create character portraits with specific backgrounds`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Text description for the character image."
  })
  declare prompt: any;

  @prop({
    type: "list[image]",
    default: [],
    title: "Reference Images",
    description: "Reference images for character guidance."
  })
  declare reference_images: any;

  @prop({
    type: "enum",
    default: "BALANCED",
    values: ["TURBO", "BALANCED", "QUALITY"],
    title: "Rendering Speed",
    description: "Rendering speed preference."
  })
  declare rendering_speed: any;

  @prop({
    type: "enum",
    default: "AUTO",
    values: ["AUTO", "REALISTIC", "FICTION"],
    title: "Style",
    description: "Generation style."
  })
  declare style: any;

  @prop({
    type: "bool",
    default: true,
    title: "Expand Prompt",
    description: "Whether to expand/augment the prompt."
  })
  declare expand_prompt: any;

  @prop({
    type: "enum",
    default: "square_hd",
    values: [
      "square",
      "square_hd",
      "portrait_4_3",
      "portrait_16_9",
      "landscape_4_3",
      "landscape_16_9"
    ],
    title: "Image Size",
    description: "The size of the output image."
  })
  declare image_size: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Undesired elements to exclude from the image."
  })
  declare negative_prompt: any;

  @prop({
    type: "int",
    default: 0,
    title: "Seed",
    description: "Random seed for generation.",
    min: 0
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const referenceImagesUrls: string[] = [];
    const referenceImagesList = Array.isArray(this.reference_images)
      ? this.reference_images
      : [];
    for (const item of referenceImagesList) {
      if (isRefSet(item))
        referenceImagesUrls.push(await uploadImageInput(apiKey, item));
    }
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["rendering_speed"] = String(this.rendering_speed ?? "BALANCED");
    params["style"] = String(this.style ?? "AUTO");
    params["expand_prompt"] = Boolean(this.expand_prompt ?? true);
    params["aspect_ratio"] = String(this.image_size ?? "square_hd");
    params["negative_prompt"] = String(this.negative_prompt ?? "");
    params["seed"] = Number(this.seed ?? 0);
    if (referenceImagesUrls.length) params["input_urls"] = referenceImagesUrls;

    const result = await kieExecuteTask(
      apiKey,
      "ideogram/v3-character",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class IdeogramCharacterEditNode extends BaseNode {
  static readonly nodeType = "kie.image.IdeogramCharacterEdit";
  static readonly title = "Ideogram Character Edit";
  static readonly description = `Edit masked character images using Ideogram via Kie.ai.

    kie, ideogram, character-edit, image editing, ai, inpainting

    Ideogram Character Edit allows you to fill masked parts of character images
    while maintaining character consistency using reference images and text prompts.

    Use cases:
    - Edit specific parts of character images
    - Fill masked areas with new content
    - Maintain character consistency during edits`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Text description for the masked area."
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
    description: "Base image with masked area to fill."
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
    title: "Mask",
    description: "Mask image indicating areas to edit."
  })
  declare mask: any;

  @prop({
    type: "list[image]",
    default: [],
    title: "Reference Images",
    description: "Reference images for character guidance."
  })
  declare reference_images: any;

  @prop({
    type: "enum",
    default: "BALANCED",
    values: ["TURBO", "BALANCED", "QUALITY"],
    title: "Rendering Speed",
    description: "Rendering speed preference."
  })
  declare rendering_speed: any;

  @prop({
    type: "enum",
    default: "AUTO",
    values: ["AUTO", "REALISTIC", "FICTION"],
    title: "Style",
    description: "Generation style."
  })
  declare style: any;

  @prop({
    type: "bool",
    default: true,
    title: "Expand Prompt",
    description: "Whether to expand/augment the prompt."
  })
  declare expand_prompt: any;

  @prop({
    type: "int",
    default: 0,
    title: "Seed",
    description: "Random seed for generation.",
    min: 0
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    let maskUrl = "";
    if (isRefSet(this.mask))
      maskUrl = await uploadImageInput(apiKey, this.mask);
    const referenceImagesUrls: string[] = [];
    const referenceImagesList = Array.isArray(this.reference_images)
      ? this.reference_images
      : [];
    for (const item of referenceImagesList) {
      if (isRefSet(item))
        referenceImagesUrls.push(await uploadImageInput(apiKey, item));
    }
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["rendering_speed"] = String(this.rendering_speed ?? "BALANCED");
    params["style"] = String(this.style ?? "AUTO");
    params["expand_prompt"] = Boolean(this.expand_prompt ?? true);
    params["seed"] = Number(this.seed ?? 0);
    if (imageUrl) params["image_url"] = imageUrl;
    if (maskUrl) params["mask_url"] = maskUrl;
    if (referenceImagesUrls.length)
      params["reference_image_urls"] = referenceImagesUrls;

    const result = await kieExecuteTask(
      apiKey,
      "ideogram/v3-character-edit",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class IdeogramCharacterRemixNode extends BaseNode {
  static readonly nodeType = "kie.image.IdeogramCharacterRemix";
  static readonly title = "Ideogram Character Remix";
  static readonly description = `Remix characters in images using Ideogram via Kie.ai.

    kie, ideogram, character-remix, image generation, ai, remix

    Ideogram Character Remix allows you to remix images while maintaining character consistency
    using reference images and text prompts.`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Text description for remixing."
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
    description: "Base image to remix."
  })
  declare image: any;

  @prop({
    type: "list[image]",
    default: [],
    title: "Reference Images",
    description: "Reference images for character guidance."
  })
  declare reference_images: any;

  @prop({
    type: "enum",
    default: "BALANCED",
    values: ["TURBO", "BALANCED", "QUALITY"],
    title: "Rendering Speed",
    description: "Rendering speed preference."
  })
  declare rendering_speed: any;

  @prop({
    type: "enum",
    default: "AUTO",
    values: ["AUTO", "GENERAL", "REALISTIC", "DESIGN"],
    title: "Style",
    description: "Generation style."
  })
  declare style: any;

  @prop({
    type: "bool",
    default: true,
    title: "Expand Prompt",
    description: "Whether to expand/augment the prompt."
  })
  declare expand_prompt: any;

  @prop({
    type: "enum",
    default: "square_hd",
    values: [
      "square",
      "square_hd",
      "portrait_4_3",
      "portrait_16_9",
      "landscape_4_3",
      "landscape_16_9"
    ],
    title: "Image Size",
    description: "The size of the output image."
  })
  declare image_size: any;

  @prop({
    type: "float",
    default: 0.8,
    title: "Strength",
    description: "How strongly to apply the remix (0.0 to 1.0).",
    min: 0,
    max: 1
  })
  declare strength: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Undesired elements to exclude from the image."
  })
  declare negative_prompt: any;

  @prop({
    type: "list[image]",
    default: [],
    title: "Additional Images",
    description: "Additional image this."
  })
  declare additional_images: any;

  @prop({
    type: "str",
    default: "",
    title: "Reference Mask Urls",
    description: "URL(s) to masks for references (comma-separated)."
  })
  declare reference_mask_urls: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const referenceImagesUrls: string[] = [];
    const referenceImagesList = Array.isArray(this.reference_images)
      ? this.reference_images
      : [];
    for (const item of referenceImagesList) {
      if (isRefSet(item))
        referenceImagesUrls.push(await uploadImageInput(apiKey, item));
    }
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["rendering_speed"] = String(this.rendering_speed ?? "BALANCED");
    params["style"] = String(this.style ?? "AUTO");
    params["expand_prompt"] = Boolean(this.expand_prompt ?? true);
    params["image_size"] = String(this.image_size ?? "square_hd");
    params["strength"] = Number(this.strength ?? 0.8);
    params["negative_prompt"] = String(this.negative_prompt ?? "");
    params["reference_mask_urls"] = String(this.reference_mask_urls ?? "");
    if (imageUrl) params["image_url"] = imageUrl;
    if (referenceImagesUrls.length)
      params["reference_image_urls"] = referenceImagesUrls;

    const result = await kieExecuteTask(
      apiKey,
      "ideogram/v3-character-remix",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class IdeogramV3ReframeNode extends BaseNode {
  static readonly nodeType = "kie.image.IdeogramV3Reframe";
  static readonly title = "Ideogram V3 Reframe";
  static readonly description = `Reframe images using Ideogram v3 via Kie.ai.

    kie, ideogram, v3-reframe, image processing, ai, reframe

    Use cases:
    - Reframe and rescale existing images
    - Change aspect ratio of images while maintaining quality`;
  static readonly metadataOutputTypes = { output: "image" };
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
    description: "URL of the image to reframe."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "square_hd",
    values: [
      "square",
      "square_hd",
      "portrait_4_3",
      "portrait_16_9",
      "landscape_4_3",
      "landscape_16_9"
    ],
    title: "Image Size",
    description: "Output resolution preset."
  })
  declare image_size: any;

  @prop({
    type: "enum",
    default: "BALANCED",
    values: ["TURBO", "BALANCED", "QUALITY"],
    title: "Rendering Speed",
    description: "Rendering speed preference."
  })
  declare rendering_speed: any;

  @prop({
    type: "enum",
    default: "AUTO",
    values: ["AUTO", "GENERAL", "REALISTIC", "DESIGN"],
    title: "Style",
    description: "Generation style."
  })
  declare style: any;

  @prop({ type: "int", default: 0, title: "Seed", description: "RNG seed." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    params["image_size"] = String(this.image_size ?? "square_hd");
    params["rendering_speed"] = String(this.rendering_speed ?? "BALANCED");
    params["style"] = String(this.style ?? "AUTO");
    params["seed"] = Number(this.seed ?? 0);
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "ideogram/v3-reframe",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class RecraftCrispUpscaleNode extends BaseNode {
  static readonly nodeType = "kie.image.RecraftCrispUpscale";
  static readonly title = "Recraft Crisp Upscale";
  static readonly description = `Upscale images using Recraft's Crisp Upscale model via Kie.ai.

    kie, recraft, crisp-upscale, upscale, ai`;
  static readonly metadataOutputTypes = { output: "image" };
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
    description: "The image to upscale."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "recraft/crisp-upscale",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class Imagen4FastNode extends BaseNode {
  static readonly nodeType = "kie.image.Imagen4Fast";
  static readonly title = "Imagen 4 Fast";
  static readonly description = `Generate images using Google's Imagen 4 Fast model via Kie.ai.

    kie, google, imagen, imagen4, fast, image generation, ai`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Undesired elements to exclude."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated image."
  })
  declare aspect_ratio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["negative_prompt"] = String(this.negative_prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");

    const result = await kieExecuteTask(
      apiKey,
      "imagen-4/fast",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class Imagen4UltraNode extends BaseNode {
  static readonly nodeType = "kie.image.Imagen4Ultra";
  static readonly title = "Imagen 4 Ultra";
  static readonly description = `Generate images using Google's Imagen 4 Ultra model via Kie.ai.

    kie, google, imagen, imagen4, ultra, image generation, ai`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Undesired elements to exclude."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated image."
  })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 0, title: "Seed", description: "RNG seed." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["negative_prompt"] = String(this.negative_prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    params["seed"] = Number(this.seed ?? 0);

    const result = await kieExecuteTask(
      apiKey,
      "imagen-4/ultra",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class Imagen4Node extends BaseNode {
  static readonly nodeType = "kie.image.Imagen4";
  static readonly title = "Imagen 4";
  static readonly description = `Generate images using Google's Imagen 4 model via Kie.ai.

    kie, google, imagen, imagen4, image generation, ai`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Undesired elements to exclude."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated image."
  })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 0, title: "Seed", description: "RNG seed." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["negative_prompt"] = String(this.negative_prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    params["seed"] = Number(this.seed ?? 0);

    const result = await kieExecuteTask(
      apiKey,
      "imagen-4/standard",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class NanoBananaEditNode extends BaseNode {
  static readonly nodeType = "kie.image.NanoBananaEdit";
  static readonly title = "Nano Banana Edit";
  static readonly description = `Edit images using Google's Nano Banana model via Kie.ai.

    kie, google, nano-banana, nano-banana-edit, image editing, ai`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Text description of the changes to make."
  })
  declare prompt: any;

  @prop({
    type: "list[image]",
    default: [],
    title: "Image Input",
    description: "Images to edit."
  })
  declare image_input: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: [
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
    ],
    title: "Image Size",
    description: "The size of the output image."
  })
  declare image_size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    let imageInputUrl = "";
    if (isRefSet(this.image_input))
      imageInputUrl = await uploadImageInput(apiKey, this.image_input);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["image_size"] = String(this.image_size ?? "1:1");
    if (imageInputUrl) params["image_url"] = imageInputUrl;

    const result = await kieExecuteTask(
      apiKey,
      "nano-banana/edit",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class GPTImage4oTextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.GPTImage4oTextToImage";
  static readonly title = "GPT 4o Image Text To Image";
  static readonly description = `Generate images using OpenAI's GPT-4o Image model via Kie.ai.

    kie, openai, gpt-4o, 4o-image, image generation, ai, text-to-image

    The GPT-Image-1 model (ChatGPT 4o Image) understands both text and visual
    context, allowing precise image creation with accurate text rendering
    and consistent styles.

    Use cases:
    - Generate high-quality images from text descriptions
    - Create images with precise text rendering
    - Generate design and marketing materials
    - Produce creative visuals with strong instruction following`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "3:2", "2:3"],
    title: "Size",
    description: "The aspect ratio of the generated image."
  })
  declare size: any;

  @prop({
    type: "int",
    default: 1,
    title: "N Variants",
    description: "Number of image variants to generate (1, 2, or 4).",
    min: 1,
    max: 4
  })
  declare n_variants: any;

  @prop({
    type: "bool",
    default: false,
    title: "Is Enhance",
    description: "Enable prompt enhancement for more refined effects."
  })
  declare is_enhance: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["size"] = String(this.size ?? "1:1");
    params["n_variants"] = Number(this.n_variants ?? 1);
    params["is_enhance"] = Boolean(this.is_enhance ?? false);

    const result = await kieExecuteTask(
      apiKey,
      "gpt-image-4o/text-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class GPTImage4oImageToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.GPTImage4oImageToImage";
  static readonly title = "GPT 4o Image Edit";
  static readonly description = `Edit images using OpenAI's GPT-4o Image model via Kie.ai.

    kie, openai, gpt-4o, 4o-image, image editing, ai, image-to-image

    The GPT-Image-1 model (ChatGPT 4o Image) enables precise image editing
    with strong instruction following and accurate text rendering.

    Use cases:
    - Edit and transform existing images
    - Apply specific modifications to images
    - Add or modify text in images
    - Create variations of existing visuals`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing how to edit the image."
  })
  declare prompt: any;

  @prop({
    type: "list[image]",
    default: [],
    title: "Images",
    description: "Input images to edit (supports up to 5 images)."
  })
  declare images: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "3:2", "2:3"],
    title: "Size",
    description: "The aspect ratio of the output image."
  })
  declare size: any;

  @prop({
    type: "int",
    default: 1,
    title: "N Variants",
    description: "Number of image variants to generate (1, 2, or 4).",
    min: 1,
    max: 4
  })
  declare n_variants: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const imagesUrls: string[] = [];
    const imagesList = Array.isArray(this.images) ? this.images : [];
    for (const item of imagesList) {
      if (isRefSet(item)) imagesUrls.push(await uploadImageInput(apiKey, item));
    }
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["size"] = String(this.size ?? "1:1");
    params["n_variants"] = Number(this.n_variants ?? 1);
    if (imagesUrls.length) params["input_urls"] = imagesUrls;

    const result = await kieExecuteTask(
      apiKey,
      "gpt-image-4o/image-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class GPTImage15TextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.GPTImage15TextToImage";
  static readonly title = "GPT Image 1.5 Text To Image";
  static readonly description = `Generate images using OpenAI's GPT Image 1.5 model via Kie.ai.

    kie, openai, gpt-image-1.5, image generation, ai, text-to-image

    GPT Image 1.5 is OpenAI's flagship image generation model for high-quality
    image creation and precise image editing, with strong instruction following
    and improved text rendering.

    Use cases:
    - Generate high-quality images from text descriptions
    - Create images with excellent text rendering
    - Generate professional marketing and design materials
    - Produce creative visuals with precise control`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "2:3", "3:2"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "medium",
    values: ["medium", "high"],
    title: "Quality",
    description:
      "Image quality setting. Medium = balanced, High = slow/detailed."
  })
  declare quality: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    params["quality"] = String(this.quality ?? "medium");

    const result = await kieExecuteTask(
      apiKey,
      "gpt-image-1-5/text-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class GPTImage15ImageToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.GPTImage15ImageToImage";
  static readonly title = "GPT Image 1.5 Edit";
  static readonly description = `Edit images using OpenAI's GPT Image 1.5 model via Kie.ai.

    kie, openai, gpt-image-1.5, image editing, ai, image-to-image

    GPT Image 1.5 enables precise image editing with strong instruction following
    and improved text rendering capabilities.

    Use cases:
    - Edit and transform existing images
    - Apply specific modifications with precise control
    - Add or modify text in images accurately
    - Create variations with high fidelity`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing how to edit the image."
  })
  declare prompt: any;

  @prop({
    type: "list[image]",
    default: [],
    title: "Images",
    description: "Input images to edit (supports up to 16 images)."
  })
  declare images: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "2:3", "3:2"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the output image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "medium",
    values: ["medium", "high"],
    title: "Quality",
    description:
      "Image quality setting. Medium = balanced, High = slow/detailed."
  })
  declare quality: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const imagesUrls: string[] = [];
    const imagesList = Array.isArray(this.images) ? this.images : [];
    for (const item of imagesList) {
      if (isRefSet(item)) imagesUrls.push(await uploadImageInput(apiKey, item));
    }
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    params["quality"] = String(this.quality ?? "medium");
    if (imagesUrls.length) params["input_urls"] = imagesUrls;

    const result = await kieExecuteTask(
      apiKey,
      "gpt-image-1-5/image-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class IdeogramV3TextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.IdeogramV3TextToImage";
  static readonly title = "Ideogram V3 Text To Image";
  static readonly description = `Generate images using Ideogram V3 model via Kie.ai.

    kie, ideogram, v3, image generation, ai, text-to-image

    Ideogram V3 is the latest generation of Ideogram's image generation model,
    offering text-to-image with improved consistency and creative control.

    Use cases:
    - Generate creative images from text descriptions
    - Create images with excellent text rendering
    - Produce artistic and design content`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Elements to avoid in the generated image."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "BALANCED",
    values: ["TURBO", "BALANCED", "QUALITY"],
    title: "Rendering Speed",
    description: "Rendering speed preference."
  })
  declare rendering_speed: any;

  @prop({
    type: "enum",
    default: "AUTO",
    values: ["AUTO", "GENERAL", "REALISTIC", "DESIGN"],
    title: "Style",
    description: "Generation style."
  })
  declare style: any;

  @prop({
    type: "enum",
    default: "square",
    values: [
      "square",
      "square_hd",
      "portrait_4_3",
      "portrait_16_9",
      "landscape_4_3",
      "landscape_16_9"
    ],
    title: "Image Size",
    description: "The resolution of the generated image."
  })
  declare image_size: any;

  @prop({
    type: "bool",
    default: true,
    title: "Expand Prompt",
    description: "Whether to expand/augment the prompt with MagicPrompt."
  })
  declare expand_prompt: any;

  @prop({
    type: "int",
    default: -1,
    title: "Seed",
    description: "Random seed for reproducible results. Use -1 for random."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    if (this.negative_prompt)
      params["negative_prompt"] = String(this.negative_prompt ?? "");
    params["rendering_speed"] = String(this.rendering_speed ?? "BALANCED");
    params["style"] = String(this.style ?? "AUTO");
    params["image_size"] = String(this.image_size ?? "square");
    params["expand_prompt"] = Boolean(this.expand_prompt ?? true);
    params["seed"] = Number(this.seed ?? -1);

    const result = await kieExecuteTask(
      apiKey,
      "ideogram/v3-text-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class IdeogramV3ImageToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.IdeogramV3ImageToImage";
  static readonly title = "Ideogram V3 Image To Image";
  static readonly description = `Edit images using Ideogram V3 model via Kie.ai.

    kie, ideogram, v3, image editing, ai, image-to-image

    Ideogram V3 offers image editing capabilities with improved consistency
    and creative control.

    Use cases:
    - Edit and transform existing images
    - Apply style changes while maintaining structure
    - Create variations of existing images`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing how to transform the image."
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
    description: "The source image to transform."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Elements to avoid in the output."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "BALANCED",
    values: ["TURBO", "BALANCED", "QUALITY"],
    title: "Rendering Speed",
    description: "Rendering speed preference."
  })
  declare rendering_speed: any;

  @prop({
    type: "enum",
    default: "AUTO",
    values: ["AUTO", "GENERAL", "REALISTIC", "DESIGN"],
    title: "Style",
    description: "Generation style."
  })
  declare style: any;

  @prop({
    type: "enum",
    default: "square",
    values: [
      "square",
      "square_hd",
      "portrait_4_3",
      "portrait_16_9",
      "landscape_4_3",
      "landscape_16_9"
    ],
    title: "Image Size",
    description: "The resolution of the output image."
  })
  declare image_size: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Strength",
    description:
      "Strength of the input image in the remix (0-1). Lower = more original preserved.",
    min: 0,
    max: 1
  })
  declare strength: any;

  @prop({
    type: "bool",
    default: true,
    title: "Expand Prompt",
    description: "Whether to expand/augment the prompt with MagicPrompt."
  })
  declare expand_prompt: any;

  @prop({
    type: "int",
    default: -1,
    title: "Seed",
    description: "Random seed for reproducible results. Use -1 for random."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["negative_prompt"] = String(this.negative_prompt ?? "");
    params["rendering_speed"] = String(this.rendering_speed ?? "BALANCED");
    params["style"] = String(this.style ?? "AUTO");
    params["image_size"] = String(this.image_size ?? "square");
    params["strength"] = Number(this.strength ?? 0.5);
    params["expand_prompt"] = Boolean(this.expand_prompt ?? true);
    params["seed"] = Number(this.seed ?? -1);
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "ideogram/v3-image-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class Seedream40TextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.Seedream40TextToImage";
  static readonly title = "Seedream 4.0 Text To Image";
  static readonly description = `Generate images using ByteDance's Seedream 4.0 model via Kie.ai.

    kie, seedream, bytedance, seedream-4, image generation, ai, text-to-image

    Seedream 4.0 is ByteDance's image generation model that combines text-to-image
    with batch consistency, high speed, and professional-quality outputs.

    Use cases:
    - Generate creative and artistic images from text
    - Create professional visual content
    - Produce consistent batch images`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "basic",
    values: ["basic", "high"],
    title: "Quality",
    description: "Basic outputs 2K images, while High outputs 4K images."
  })
  declare quality: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    params["resolution"] = String(this.quality ?? "basic");

    const result = await kieExecuteTask(
      apiKey,
      "seedream/4-0-text-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

export class Seedream40ImageToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.Seedream40ImageToImage";
  static readonly title = "Seedream 4.0 Edit";
  static readonly description = `Edit images using ByteDance's Seedream 4.0 model via Kie.ai.

    kie, seedream, bytedance, seedream-4, image editing, ai, image-to-image

    Seedream 4.0 offers image-to-image capabilities with batch consistency
    and professional-quality outputs.

    Use cases:
    - Edit and transform existing images
    - Apply style changes to photos
    - Create variations of existing images`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing how to transform the image."
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
    description: "The source image to transform."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    title: "Aspect Ratio",
    description: "The aspect ratio of the output image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "basic",
    values: ["basic", "high"],
    title: "Quality",
    description: "Basic outputs 2K images, while High outputs 4K images."
  })
  declare quality: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim())
      throw new Error("Prompt cannot be empty");
    let imageUrl = "";
    if (isRefSet(this.image))
      imageUrl = await uploadImageInput(apiKey, this.image);
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    params["resolution"] = String(this.quality ?? "basic");
    if (imageUrl) params["image_url"] = imageUrl;

    const result = await kieExecuteTask(
      apiKey,
      "seedream/4-0-image-to-image",
      params,
      1500,
      200
    );
    return { output: { type: "image", data: result.data } };
  }
}

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
  Seedream40ImageToImageNode
] as const;
