import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  callMinimax,
  imageRefFromBytes,
  MINIMAX_IMAGE_ASPECTS
} from "../minimax-base.js";

/** Output handles MinimaxTextToImageNode.process() emits. */
type MinimaxTextToImageNodeOutputs = {
  output: { type: string; data: string; mimeType: string };
};

export class MinimaxTextToImageNode extends BaseNode {
  static readonly nodeType = "minimax.TextToImage";
  static readonly body = "content_card";
  static readonly title = "MiniMax Text to Image";
  static readonly description =
    "Generate images from text prompts using MiniMax image-01.\n" +
    "image, generation, text-to-image, t2i, minimax\n\n" +
    "Use cases:\n" +
    "- Create illustrations and concept art\n" +
    "- Generate marketing visuals\n" +
    "- Produce images at a chosen aspect ratio";
  static readonly metadataOutputTypes = { output: "image" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["prompt"];
  static readonly requiredSettings = ["MINIMAX_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: "image-01",
    title: "Model",
    description: "The MiniMax image model to use.",
    values: ["image-01"]
  })
  declare model: any;

  @prop({
    type: "str",
    default: "A cat holding a sign that says hello world",
    title: "Prompt",
    description: "Text prompt describing the desired image."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Describe what to avoid in the image."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "1:1",
    title: "Aspect Ratio",
    description: "Aspect ratio of the generated image.",
    values: MINIMAX_IMAGE_ASPECTS
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: true,
    title: "Prompt Optimizer",
    description:
      "Let MiniMax automatically refine the prompt before generating."
  })
  declare prompt_optimizer: any;

  async process(
    context?: ProcessingContext
  ): Promise<MinimaxTextToImageNodeOutputs> {
    const basePrompt = String(this.prompt ?? "");
    if (!basePrompt) throw new Error("Prompt is required");

    const negative = String(this.negative_prompt ?? "").trim();
    const prompt = negative
      ? `${basePrompt.trim()}\n\nDo not include: ${negative}`
      : basePrompt;

    const body = {
      model: String(this.model ?? "image-01") || "image-01",
      prompt,
      aspect_ratio: String(this.aspect_ratio ?? "1:1"),
      n: 1,
      response_format: "base64",
      prompt_optimizer: Boolean(this.prompt_optimizer ?? true)
    };

    if (!context) {
      throw new Error("MiniMax Text to Image requires a processing context");
    }
    // Which of the two carriers is populated depends on `response_format`.
    const reply = await callMinimax(context, {
      route: "image",
      capability: "text_to_image",
      model: body.model,
      input: body,
      nodeId: this.__node_id || undefined
    });

    const [b64] = reply.imageBase64;
    if (b64) {
      const bytes = new Uint8Array(Buffer.from(b64, "base64"));
      return { output: imageRefFromBytes(bytes) };
    }

    const [url] = reply.imageUrls;
    if (url) {
      const bytes = await context.downloadProviderMedia({
        provider: "minimax",
        url,
        signal: context.signal
      });
      return { output: imageRefFromBytes(bytes) };
    }

    throw new Error("MiniMax image_generation returned no image data");
  }
}

export const TEXT_TO_IMAGE_NODES: readonly NodeClass[] = [
  MinimaxTextToImageNode
];
