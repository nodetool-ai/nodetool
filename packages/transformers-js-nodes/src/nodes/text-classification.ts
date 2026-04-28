import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  DEVICE_VALUES,
  DTYPE_VALUES,
  asNumber,
  asString,
  ensureArray,
  extractRepoId,
  getPipeline,
  tjsModelDefault,
  normalizeOption
} from "../transformers-base.js";
import { defaultRepoFor } from "../recommended-models.js";

const TJS_TYPE = "tjs.text_classification";

type ClassificationResult = { label: string; score: number };

export class TextClassificationNode extends BaseNode {
  static readonly nodeType = "transformers.TextClassification";
  static readonly title = "Text Classification";
  static readonly description =
    "Classify text using a Transformers.js text-classification pipeline (e.g. sentiment analysis).\n" +
    "nlp, classification, sentiment, transformers, huggingface\n\n" +
    "Use cases:\n" +
    "- Detect sentiment of reviews or chats\n" +
    "- Triage support tickets\n" +
    "- Filter toxic or spam content";
  static readonly metadataOutputTypes = {
    label: "str",
    score: "float",
    results: "list"
  };

  @prop({
    type: "str",
    default: "I love this product!",
    title: "Text",
    description: "The text to classify."
  })
  declare text: any;

  @prop({
    type: TJS_TYPE,
    default: tjsModelDefault(TJS_TYPE, defaultRepoFor(TJS_TYPE)),
    title: "Model",
    description: "Transformers.js model (ONNX-compatible)."
  })
  declare model: any;

  @prop({
    type: "int",
    default: 1,
    title: "Top K",
    description: "Number of top labels to return (1 returns the best label).",
    min: 1,
    max: 100
  })
  declare top_k: any;

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

  async process(): Promise<Record<string, unknown>> {
    const text = asString(this.text);
    if (!text) throw new Error("Text is required");
    const topK = asNumber(this.top_k, 1);

    const pipeline = (await getPipeline({
      task: "text-classification",
      model: extractRepoId(this.model) || undefined,
      dtype: normalizeOption(this.dtype),
      device: normalizeOption(this.device)
    })) as (
      input: string,
      opts?: Record<string, unknown>
    ) => Promise<ClassificationResult | ClassificationResult[]>;

    const raw = await pipeline(text, { top_k: topK });
    const results = ensureArray<ClassificationResult>(raw);
    const top = results[0] ?? { label: "", score: 0 };

    return {
      label: top.label,
      score: top.score,
      results
    };
  }
}

export const TEXT_CLASSIFICATION_NODES: readonly NodeClass[] = [
  TextClassificationNode
];
