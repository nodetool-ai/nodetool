import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  getReveApiKey,
  postprocessingArray,
  reveGenerate,
  reveImageToRef,
  REVE_ASPECT_RATIOS,
  REVE_POSTPROCESSING
} from "../reve-base.js";

export class CreateImageNode extends BaseNode {
  static readonly nodeType = "reve.CreateImage";
  static readonly body = "content_card";
  static readonly title = "Create Image";
  static readonly description =
    "Generate an image from a text prompt using Reve.\n" +
    "image, generate, text-to-image, reve\n\n" +
    "Use cases:\n" +
    "- Produce images with strong prompt adherence\n" +
    "- Render legible typography and posters\n" +
    "- Create on-brand marketing visuals";
  static readonly metadataOutputTypes = { output: "image" };
  static readonly inlineFields: string[] = ["prompt"];
  static readonly requiredSettings = ["REVE_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Text description of the image to generate (max 2560 chars)."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "3:2",
    title: "Aspect Ratio",
    description: "Proportions of the generated image.",
    values: [...REVE_ASPECT_RATIOS]
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "latest",
    title: "Version",
    description: "Model version to use.",
    values: ["latest", "reve-create@20250915"]
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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReveApiKey(this._secrets);

    const prompt = String(this.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");

    const result = await reveGenerate(apiKey, "create", {
      prompt,
      aspect_ratio: String(this.aspect_ratio ?? "3:2"),
      version: String(this.version ?? "latest"),
      postprocessing: postprocessingArray(this.postprocessing),
      test_time_scaling: Number(this.test_time_scaling ?? 1)
    });

    return { output: await reveImageToRef(result.image) };
  }
}

export const CREATE_IMAGE_NODES: readonly NodeClass[] = [CreateImageNode];
