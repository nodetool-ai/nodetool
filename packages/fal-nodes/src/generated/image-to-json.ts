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

export class BagelUnderstand extends FalNode {
  static readonly nodeType = "fal.image_to_json.BagelUnderstand";
  static readonly title = "Bagel Understand";
  static readonly description = `Bagel is a 7B parameter multimodal model from Bytedance-Seed that can generate both text and images.
vision, analysis, json, image-understanding`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    prompt: "str",
    text: "str",
    timings: "dict[str, any]",
    seed: "int"
  };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to query the image with."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "The seed to use for the generation."
  })
  declare seed: any;

  @prop({ type: "image", default: "", description: "The image for the query." })
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

    const res = await falSubmit(apiKey, "fal-ai/bagel/understand", args);
    return res as Record<string, unknown>;
  }
}

export const FAL_IMAGE_TO_JSON_NODES: readonly NodeClass[] = [
  BagelUnderstand
] as const;
