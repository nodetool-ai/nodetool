import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import {
  DEVICE_VALUES,
  DTYPE_VALUES,
  ensureArray,
  extractRepoId,
  getPipeline,
  tjsModelDefault,
  loadRawImage,
  normalizeOption
} from "../transformers-base.js";
import { defaultRepoFor } from "../recommended-models.js";

const TJS_TYPE = "tjs.zero_shot_image_classification";

type ClassificationResult = { label: string; score: number };

function parseLabels(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export class ZeroShotImageClassificationNode extends BaseNode {
  static readonly nodeType = "transformers.ZeroShotImageClassification";
  static readonly title = "Zero-Shot Image Classification";
  static readonly description =
    "Score arbitrary user-supplied labels for an image using a CLIP-style Transformers.js pipeline.\n" +
    "vision, zero-shot, classification, clip, transformers, huggingface\n\n" +
    "Use cases:\n" +
    "- Tag images with custom categories\n" +
    "- Build moderation or NSFW filters\n" +
    "- Search images by free-form descriptions";
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
  declare image: any;

  @prop({
    type: "str",
    default: "a photo of a cat, a photo of a dog, a photo of a bird",
    title: "Candidate Labels",
    description: "Comma-separated list of candidate labels."
  })
  declare candidate_labels: any;

  @prop({
    type: TJS_TYPE,
    default: tjsModelDefault(TJS_TYPE, defaultRepoFor(TJS_TYPE)),
    title: "Model",
    description: "Transformers.js model (ONNX-compatible)."
  })
  declare model: any;

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
    const labels = parseLabels(this.candidate_labels);
    if (labels.length === 0) {
      throw new Error("At least one candidate label is required");
    }

    const pipeline = (await getPipeline({
      task: "zero-shot-image-classification",
      model: extractRepoId(this.model) || undefined,
      dtype: normalizeOption(this.dtype),
      device: normalizeOption(this.device)
    })) as (
      input: unknown,
      labels: string[],
      opts?: Record<string, unknown>
    ) => Promise<ClassificationResult | ClassificationResult[]>;

    const raw = await pipeline(rawImage, labels);
    const results = ensureArray<ClassificationResult>(raw);
    const top = results[0] ?? { label: "", score: 0 };

    return {
      label: top.label,
      score: top.score,
      results
    };
  }
}

export const ZERO_SHOT_IMAGE_CLASSIFICATION_NODES: readonly NodeClass[] = [
  ZeroShotImageClassificationNode
];
