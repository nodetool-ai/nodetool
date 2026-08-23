import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  getFalApiKey,
  falSubmit,
  removeNulls,
  isRefSet,
  assetToFalUrl,
  imageToDataUrl,
} from "../fal-base.js";

// Re-export alias
const FalNode = BaseNode;

export class FluxDev extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxDev";
  static readonly title = "Flux Dev";
  static readonly description = `FLUX.1 [dev] is a powerful open-weight text-to-image model with 12 billion parameters. Optimized for prompt following and visual quality.
image, generation, flux, text-to-image, txt2img`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[Image]", "prompt": "str", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };

  @prop({ type: "enum", default: "none", values: ["none", "regular", "high"], description: "The speed of the generation. The higher the speed, the faster the generation." })
  declare acceleration: any;

  @prop({ type: "str", default: "", description: "The prompt to generate an image from" })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Enable safety checker to filter unsafe content" })
  declare enable_safety_checker: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate", min: 1, max: 4 })
  declare num_images: any;

  @prop({ type: "enum", default: "landscape_4_3", values: ["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"], description: "Size preset for the generated image" })
  declare image_size: any;

  @prop({ type: "int", default: 28, description: "Number of denoising steps. More steps typically improve quality", min: 1, max: 50 })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 3.5, description: "How strictly to follow the prompt. Higher values are more literal", min: 1, max: 20 })
  declare guidance_scale: any;

  @prop({ type: "int", default: -1, description: "Seed for reproducible results. Use -1 for random" })
  declare seed: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const acceleration = String(this.acceleration ?? "none");
    const prompt = String(this.prompt ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const syncMode = Boolean(this.sync_mode ?? false);
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const seed = Number(this.seed ?? -1);
    const outputFormat = String(this.output_format ?? "jpeg");

    const args: Record<string, unknown> = {
      "acceleration": acceleration,
      "prompt": prompt,
      "enable_safety_checker": enableSafetyChecker,
      "sync_mode": syncMode,
      "num_images": numImages,
      "image_size": imageSize,
      "num_inference_steps": numInferenceSteps,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "output_format": outputFormat,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux/dev", args);
    const images = res.images as { url: string }[];
    return { output: { type: "image", uri: images[0].url } };
  }
}

export class FluxSchnell extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxSchnell";
  static readonly title = "Flux Schnell";
  static readonly description = `FLUX.1 [schnell] is a fast distilled version of FLUX.1 optimized for speed. Can generate high-quality images in 1-4 steps.
image, generation, flux, fast, text-to-image, txt2img`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[Image]", "prompt": "str", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };

  @prop({ type: "enum", default: "none", values: ["none", "regular", "high"], description: "The speed of the generation. The higher the speed, the faster the generation." })
  declare acceleration: any;

  @prop({ type: "str", default: "", description: "The prompt to generate an image from" })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Enable safety checker to filter unsafe content" })
  declare enable_safety_checker: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate", min: 1, max: 4 })
  declare num_images: any;

  @prop({ type: "enum", default: "landscape_4_3", values: ["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"], description: "Size preset for the generated image" })
  declare image_size: any;

  @prop({ type: "int", default: 4, description: "Number of denoising steps (1-4 recommended for schnell)", min: 1, max: 12 })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 3.5, description: "\n        The CFG (Classifier Free Guidance) scale is a measure of how close you want\n        the model to stick to your prompt when looking for a related image to show you.\n    ", min: 1, max: 20 })
  declare guidance_scale: any;

  @prop({ type: "int", default: -1, description: "Seed for reproducible results. Use -1 for random" })
  declare seed: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const acceleration = String(this.acceleration ?? "none");
    const prompt = String(this.prompt ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const syncMode = Boolean(this.sync_mode ?? false);
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const numInferenceSteps = Number(this.num_inference_steps ?? 4);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const seed = Number(this.seed ?? -1);
    const outputFormat = String(this.output_format ?? "jpeg");

    const args: Record<string, unknown> = {
      "acceleration": acceleration,
      "prompt": prompt,
      "enable_safety_checker": enableSafetyChecker,
      "sync_mode": syncMode,
      "num_images": numImages,
      "image_size": imageSize,
      "num_inference_steps": numInferenceSteps,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "output_format": outputFormat,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux/schnell", args);
    const images = res.images as { url: string }[];
    return { output: { type: "image", uri: images[0].url } };
  }
}

export const FAL_TEXT_TO_IMAGE_NODES: readonly NodeClass[] = [
  FluxDev,
  FluxSchnell,
] as const;
