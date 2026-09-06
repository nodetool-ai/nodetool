import { BaseNode, prop, type ImageRef } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import {
  generateMuapiMedia,
  getMuapiApiKey,
  MUAPI_IMAGE_ASPECT_RATIOS,
  MUAPI_IMAGE_MODELS,
  MUAPI_IMAGE_RESOLUTIONS
} from "../muapi-base.js";

type MuapiTextToImageOutputs = { output: ImageRef };

export class MuapiTextToImageNode extends BaseNode {
  static readonly nodeType = "muapi.TextToImage";
  static readonly body = "content_card";
  static readonly title = "MuAPI Text to Image";
  static readonly description =
    "Generate an image from a text prompt using MuAPI's FLUX 3 image routes.\n" +
    "image, generation, text-to-image, t2i, muapi\n\n" +
    "Use cases:\n" +
    "- Create artwork and concept images\n" +
    "- Produce marketing visuals\n" +
    "- Generate images at a chosen aspect ratio";
  static readonly metadataOutputTypes = { output: "image" };
  static readonly inlineFields = ["prompt"];
  static readonly inputFields = ["prompt"];
  static readonly requiredSettings = ["MUAPI_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "enum",
    default: "flux-3-text-to-image",
    title: "Model",
    description: "MuAPI image route to use.",
    values: [...MUAPI_IMAGE_MODELS]
  })
  declare model: string;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Text prompt describing the desired image."
  })
  declare prompt: string;

  @prop({
    type: "enum",
    default: "1:1",
    title: "Aspect Ratio",
    description: "Aspect ratio of the generated image.",
    values: [...MUAPI_IMAGE_ASPECT_RATIOS]
  })
  declare aspect_ratio: string;

  @prop({
    type: "enum",
    default: "2k",
    title: "Resolution",
    description: "Output image resolution.",
    values: [...MUAPI_IMAGE_RESOLUTIONS]
  })
  declare resolution: string;

  async process(context?: ProcessingContext): Promise<MuapiTextToImageOutputs> {
    const prompt = String(this.prompt ?? "").trim();
    if (!prompt) throw new Error("Prompt is required");

    return {
      output: await generateMuapiMedia({
        apiKey: getMuapiApiKey(this._secrets),
        endpoint: String(this.model ?? MUAPI_IMAGE_MODELS[0]),
        payload: {
          prompt,
          aspect_ratio: String(this.aspect_ratio ?? "1:1"),
          resolution: String(this.resolution ?? "2k")
        },
        kind: "image",
        signal: context?.signal
      })
    };
  }
}

export const TEXT_TO_IMAGE_NODES: readonly NodeClass[] = [
  MuapiTextToImageNode
];
