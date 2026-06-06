import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  getReveApiKey,
  postprocessingArray,
  refToBase64,
  reveGenerate,
  reveImageToRef,
  REVE_ASPECT_RATIOS,
  REVE_POSTPROCESSING
} from "../reve-base.js";

export class RemixImageNode extends BaseNode {
  static readonly nodeType = "reve.RemixImage";
  static readonly body = "content_card";
  static readonly title = "Remix Image";
  static readonly description =
    "Combine a prompt with 1-6 reference images using Reve.\n" +
    "image, remix, reference, compose, reve\n\n" +
    "Use cases:\n" +
    "- Blend subjects and styles from several images\n" +
    "- Place a referenced product into a new scene\n" +
    "- Compose characters from multiple references\n\n" +
    "Reference specific images in the prompt with <img>0</img>, <img>1</img>, " +
    "etc. (0 = first image).";
  static readonly metadataOutputTypes = { output: "image" };
  static readonly inlineFields: string[] = ["prompt"];
  static readonly inputFields: string[] = ["reference_images"];
  static readonly requiredSettings = ["REVE_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description:
      "Text prompt (max 2560 chars). Use <img>0</img>, <img>1</img>, ... to " +
      "reference images by index."
  })
  declare prompt: any;

  @prop({
    type: "list",
    default: [],
    title: "Reference Images",
    description: "1-6 reference images to remix."
  })
  declare reference_images: any;

  @prop({
    type: "enum",
    default: "none",
    title: "Aspect Ratio",
    description:
      "Output proportions. 'none' lets the model choose the aspect ratio.",
    values: ["none", ...REVE_ASPECT_RATIOS]
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "latest",
    title: "Version",
    description: "Model version to use.",
    values: [
      "latest-fast",
      "latest",
      "reve-remix-fast@20251030",
      "reve-remix@20250915"
    ]
  })
  declare version: any;

  @prop({
    type: "enum",
    default: "none",
    title: "Postprocessing",
    description: "Optional postprocessing operation applied to the result.",
    values: [...REVE_POSTPROCESSING]
  })
  declare postprocessing: any;

  @prop({
    type: "int",
    default: 1,
    title: "Test Time Scaling",
    description: "Effort multiplier for quality (1-15). Higher costs more.",
    min: 1,
    max: 15
  })
  declare test_time_scaling: any;

  async process(
    context?: Parameters<BaseNode["process"]>[0]
  ): Promise<Record<string, unknown>> {
    const apiKey = getReveApiKey(this._secrets);

    const prompt = String(this.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");

    const refs = Array.isArray(this.reference_images)
      ? this.reference_images
      : [];
    if (refs.length === 0) {
      throw new Error("At least one reference image is required");
    }
    if (refs.length > 6) {
      throw new Error("Remix accepts at most 6 reference images");
    }

    const referenceImages = await Promise.all(
      refs.map((ref) => refToBase64(ref, context))
    );

    const aspectRatio = String(this.aspect_ratio ?? "none");
    const result = await reveGenerate(apiKey, "remix", {
      prompt,
      reference_images: referenceImages,
      aspect_ratio: aspectRatio === "none" ? undefined : aspectRatio,
      version: String(this.version ?? "latest"),
      postprocessing: postprocessingArray(this.postprocessing),
      test_time_scaling: Number(this.test_time_scaling ?? 1)
    });

    return { output: await reveImageToRef(result.image) };
  }
}

export const REMIX_IMAGE_NODES: readonly NodeClass[] = [RemixImageNode];
