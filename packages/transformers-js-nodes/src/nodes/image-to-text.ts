import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  DEVICE_VALUES,
  DTYPE_VALUES,
  asNumber,
  asString,
  ensureArray,
  extractRepoId,
  getPipeline,
  tjsModelDefault,
  loadRawImage,
  normalizeOption
} from "../transformers-base.js";
import { defaultRepoFor } from "../recommended-models.js";

const TJS_TYPE = "tjs.image_to_text";

type CaptionResult = { generated_text: string };

export class ImageToTextNode extends BaseNode {
  static readonly nodeType = "transformers.ImageToText";
  static readonly title = "Image to Text (Captioning)";
  static readonly description =
    "Generate a textual description for an image using a Transformers.js image-to-text pipeline.\n" +
    "vision, captioning, image-to-text, transformers, huggingface\n\n" +
    "Use cases:\n" +
    "- Auto-caption photos for accessibility\n" +
    "- Index images by their content\n" +
    "- Feed captions into downstream LLM workflows";
  static readonly metadataOutputTypes = { text: "str" };

  @prop({
    type: "image",
    default: { type: "image" },
    title: "Image",
    description: "Image to caption."
  })
  declare image: any;

  @prop({
    type: TJS_TYPE,
    default: tjsModelDefault(TJS_TYPE, defaultRepoFor(TJS_TYPE)),
    title: "Model",
    description: "Transformers.js model (ONNX-compatible)."
  })
  declare model: any;

  @prop({
    type: "int",
    default: 50,
    title: "Max New Tokens",
    description: "Maximum number of tokens in the caption.",
    min: 1,
    max: 1024
  })
  declare max_new_tokens: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Quantization",
    description: "Model dtype / quantization level.",
    values: DTYPE_VALUES
  })
  declare dtype: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Device",
    description: "Inference device.",
    values: DEVICE_VALUES
  })
  declare device: any;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const rawImage = await loadRawImage(this.image, context);

    const pipeline = (await getPipeline({
      task: "image-to-text",
      model: extractRepoId(this.model) || undefined,
      dtype: normalizeOption(this.dtype),
      device: normalizeOption(this.device)
    })) as (
      input: unknown,
      opts?: Record<string, unknown>
    ) => Promise<CaptionResult | CaptionResult[]>;

    const raw = await pipeline(rawImage, {
      max_new_tokens: asNumber(this.max_new_tokens, 50)
    });
    const first = ensureArray<CaptionResult>(raw)[0];
    return { text: first?.generated_text ?? "" };
  }
}

export const IMAGE_TO_TEXT_NODES: readonly NodeClass[] = [ImageToTextNode];
