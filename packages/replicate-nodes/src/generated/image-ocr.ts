import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getReplicateApiKey,
  replicateSubmit,
  removeNulls,
  isRefSet,
  assetToUrl,
  outputToImageRef,
  outputToVideoRef,
  outputToAudioRef,
  outputToString,
} from "../replicate-base.js";

const ReplicateNode = BaseNode;

export class LatexOCR extends ReplicateNode {
  static readonly nodeType = "replicate.image_ocr.LatexOCR";
  static readonly title = "Latex O C R";
  static readonly description = `Optical character recognition to turn images of latex equations into latex format.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "Input image" })
  declare image_path: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const imagePath = String(inputs.image_path ?? this.image_path ?? "");

    const args: Record<string, unknown> = {
      "image_path": imagePath,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "mickeybeurskens/latex-ocr", args);
    return { output: outputToString(res.output) };
  }
}

export class TextExtractOCR extends ReplicateNode {
  static readonly nodeType = "replicate.image_ocr.TextExtractOCR";
  static readonly title = "Text Extract O C R";
  static readonly description = `A simple OCR Model that can easily extract text from an image.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Image to process" })
  declare image: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const args: Record<string, unknown> = {
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "abiruyt/text-extract-ocr", args);
    return { output: outputToString(res.output) };
  }
}

export const REPLICATE_IMAGE_OCR_NODES: readonly NodeClass[] = [
  LatexOCR,
  TextExtractOCR,
] as const;