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

export class FluxProKontext extends FalNode {
  static readonly nodeType = "fal.image_to_image.FluxProKontext";
  static readonly title = "Flux Pro Kontext";
  static readonly description = `FLUX.1 Kontext [pro] edits images from text instructions with strong character and scene consistency.
editing, image-to-image, img2img, flux, kontext`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "seed": "int", "images": "list[Image]", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]", "prompt": "str" };

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Image prompt for the omni model.", min: 1 })
  declare image: any;

  @prop({ type: "enum", default: "2", values: ["1", "2", "3", "4", "5", "6"], description: "The safety tolerance level for the generated image. 1 being the most strict and 5 being the most permissive." })
  declare safety_tolerance: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate.", min: 1, max: 4 })
  declare num_images: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "enum", default: "", values: ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"], description: "The aspect ratio of the generated image." })
  declare aspect_ratio: any;

  @prop({ type: "bool", default: false, description: "Whether to enhance the prompt for better results." })
  declare enhance_prompt: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        ", min: 1, max: 20 })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const seed = String(this.seed ?? "");
    const safetyTolerance = String(this.safety_tolerance ?? "2");
    const numImages = Number(this.num_images ?? 1);
    const outputFormat = String(this.output_format ?? "jpeg");
    const aspectRatio = String(this.aspect_ratio ?? "");
    const enhancePrompt = Boolean(this.enhance_prompt ?? false);
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      "seed": seed,
      "safety_tolerance": safetyTolerance,
      "num_images": numImages,
      "output_format": outputFormat,
      "aspect_ratio": aspectRatio,
      "enhance_prompt": enhancePrompt,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "prompt": prompt,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-pro/kontext", args);
    const images = res.images as { url: string }[];
    return { output: { type: "image", uri: images[0].url } };
  }
}

export const FAL_IMAGE_TO_IMAGE_NODES: readonly NodeClass[] = [
  FluxProKontext,
] as const;
