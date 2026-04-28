import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  DEVICE_VALUES,
  DTYPE_VALUES,
  asString,
  extractRepoId,
  getPipeline,
  tjsModelDefault,
  normalizeOption
} from "../transformers-base.js";
import { defaultRepoFor } from "../recommended-models.js";

const TJS_TYPE = "tjs.zero_shot_classification";

type ZeroShotResult = {
  sequence?: string;
  labels?: string[];
  scores?: number[];
};

function parseLabels(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export class ZeroShotClassificationNode extends BaseNode {
  static readonly nodeType = "transformers.ZeroShotClassification";
  static readonly title = "Zero-Shot Classification";
  static readonly description =
    "Classify text into arbitrary user-supplied labels using a Transformers.js zero-shot pipeline.\n" +
    "nlp, zero-shot, classification, transformers, huggingface\n\n" +
    "Use cases:\n" +
    "- Tag content without training data\n" +
    "- Route messages to topics or teams\n" +
    "- Score relevance of documents to a query";
  static readonly metadataOutputTypes = {
    label: "str",
    score: "float",
    labels: "list",
    scores: "list"
  };

  @prop({
    type: "str",
    default: "I have a problem with my iphone that needs to be resolved asap.",
    title: "Text",
    description: "Text to classify."
  })
  declare text: any;

  @prop({
    type: "str",
    default: "urgent, not urgent, phone, tablet, computer",
    title: "Candidate Labels",
    description: "Comma-separated list of candidate labels."
  })
  declare candidate_labels: any;

  @prop({
    type: "bool",
    default: false,
    title: "Multi-label",
    description: "Allow multiple labels to be true simultaneously."
  })
  declare multi_label: any;

  @prop({
    type: TJS_TYPE,
    default: tjsModelDefault(TJS_TYPE, defaultRepoFor(TJS_TYPE)),
    title: "Model",
    description: "Transformers.js model (ONNX-compatible)."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "This example is {}.",
    title: "Hypothesis Template",
    description: "Template used to construct the entailment hypothesis."
  })
  declare hypothesis_template: any;

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
    const labels = parseLabels(this.candidate_labels);
    if (labels.length === 0) {
      throw new Error("At least one candidate label is required");
    }

    const pipeline = (await getPipeline({
      task: "zero-shot-classification",
      model: extractRepoId(this.model) || undefined,
      dtype: normalizeOption(this.dtype),
      device: normalizeOption(this.device)
    })) as (
      input: string,
      labels: string[],
      opts?: Record<string, unknown>
    ) => Promise<ZeroShotResult | ZeroShotResult[]>;

    const opts: Record<string, unknown> = {
      multi_label: Boolean(this.multi_label)
    };
    const hypothesis = asString(this.hypothesis_template);
    if (hypothesis) opts.hypothesis_template = hypothesis;

    const raw = await pipeline(text, labels, opts);
    const result = Array.isArray(raw) ? raw[0] : raw;

    const outLabels = result?.labels ?? [];
    const scores = result?.scores ?? [];
    return {
      label: outLabels[0] ?? "",
      score: scores[0] ?? 0,
      labels: outLabels,
      scores
    };
  }
}

export const ZERO_SHOT_CLASSIFICATION_NODES: readonly NodeClass[] = [
  ZeroShotClassificationNode
];
