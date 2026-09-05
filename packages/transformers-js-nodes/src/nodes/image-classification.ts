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
import type {
  HfModelRef,
  ImageRefLike
} from "../transformers-base.js";
import { defaultRepoFor } from "../recommended-models.js";

const TJS_TYPE = "tjs.image_classification";

type ImageClassificationResult = { label: string; score: number };

/** Output handles ImageClassificationNode.process() emits. */
type ImageClassificationNodeOutputs = {
  label: string;
  score: number;
  results: ImageClassificationResult[];
};

export class ImageClassificationNode extends BaseNode {
  static readonly nodeType = "transformers.ImageClassification";
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["image"];
  static readonly title = "Image Classification";
  static readonly description =
    "Classify an image using a Transformers.js image-classification pipeline.\n" +
    "vision, classification, image, transformers, huggingface\n\n" +
    "Use cases:\n" +
    "- Tag photos with high-level categories\n" +
    "- Filter content by class\n" +
    "- Build moderation pipelines";
  static readonly metadataOutputTypes = {
    label: "str",
    score: "float",
    results: "list"
  };

  @prop({
    type: "image",
    default: { type: "image" },
    title: "Image",
    description: "Image to classify."
  })
  declare image: ImageRefLike;

  @prop({
    type: TJS_TYPE,
    default: tjsModelDefault(TJS_TYPE, defaultRepoFor(TJS_TYPE)),
    title: "Model",
    description: "Transformers.js model (ONNX-compatible)."
  })
  declare model: HfModelRef;

  @prop({
    type: "int",
    default: 5,
    title: "Top K",
    description: "Number of top labels to return.",
    min: 1,
    max: 100
  })
  declare top_k: number;

  @prop({
    type: "enum",
    default: "auto",
    title: "Quantization",
    description: "Model dtype / quantization level.",
    values: DTYPE_VALUES
  })
  declare dtype: string;

  @prop({
    type: "enum",
    default: "auto",
    title: "Device",
    description: "Inference device.",
    values: DEVICE_VALUES
  })
  declare device: string;

  async process(
    context?: ProcessingContext
  ): Promise<ImageClassificationNodeOutputs> {
    const rawImage = await loadRawImage(this.image, context);

    const pipeline = await getPipeline<
      (
        input: unknown,
        opts?: Record<string, unknown>
      ) => Promise<ImageClassificationResult | ImageClassificationResult[]>
    >({
      task: "image-classification",
      model: extractRepoId(this.model) || undefined,
      dtype: normalizeOption(this.dtype),
      device: normalizeOption(this.device)
    });

    const raw = await pipeline(rawImage, { top_k: asNumber(this.top_k, 5) });
    const results = ensureArray<ImageClassificationResult>(raw);
    const top = results[0] ?? { label: "", score: 0 };

    return {
      label: top.label,
      score: top.score,
      results
    };
  }
}

export const IMAGE_CLASSIFICATION_NODES: readonly NodeClass[] = [
  ImageClassificationNode
];
