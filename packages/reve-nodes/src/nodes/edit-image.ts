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

export class EditImageNode extends BaseNode {
  static readonly nodeType = "reve.EditImage";
  static readonly body = "content_card";
  static readonly title = "Edit Image";
  static readonly description =
    "Edit an existing image with a text instruction using Reve.\n" +
    "image, edit, instruct, inpaint, reve\n\n" +
    "Use cases:\n" +
    "- Apply targeted edits described in plain language\n" +
    "- Change styles, colors, or objects in a photo\n" +
    "- Add or remove elements from an image";
  static readonly metadataOutputTypes = { output: "image" };
  static readonly inlineFields: string[] = ["edit_instruction"];
  static readonly inputFields: string[] = ["image"];
  static readonly requiredSettings = ["REVE_API_KEY"];
  static readonly autoSaveAsset = true;

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
    description: "The reference image to edit."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    title: "Edit Instruction",
    description: "How to modify the image (max 2560 chars)."
  })
  declare edit_instruction: any;

  @prop({
    type: "enum",
    default: "none",
    title: "Aspect Ratio",
    description:
      "Output proportions. 'none' keeps the reference image's aspect ratio.",
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
      "reve-edit-fast@20251030",
      "reve-edit@20250915"
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

    const instruction = String(this.edit_instruction ?? "");
    if (!instruction) throw new Error("Edit instruction is required");

    const referenceImage = await refToBase64(this.image, context);

    const aspectRatio = String(this.aspect_ratio ?? "none");
    const result = await reveGenerate(apiKey, "edit", {
      edit_instruction: instruction,
      reference_image: referenceImage,
      aspect_ratio: aspectRatio === "none" ? undefined : aspectRatio,
      version: String(this.version ?? "latest"),
      postprocessing: postprocessingArray(this.postprocessing),
      test_time_scaling: Number(this.test_time_scaling ?? 1)
    });

    return { output: await reveImageToRef(result.image) };
  }
}

export const EDIT_IMAGE_NODES: readonly NodeClass[] = [EditImageNode];
