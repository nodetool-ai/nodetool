import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  DEVICE_VALUES,
  DTYPE_VALUES,
  asString,
  getPipeline,
  normalizeOption
} from "../transformers-base.js";

type Tensor = {
  data?: ArrayLike<number>;
  dims?: number[];
  size?: number;
  tolist?: () => unknown;
};

function tensorToVector(tensor: unknown): number[] {
  if (!tensor || typeof tensor !== "object") return [];
  const t = tensor as Tensor;
  if (typeof t.tolist === "function") {
    const flat = t.tolist();
    if (Array.isArray(flat)) {
      const first = flat[0];
      if (Array.isArray(first) && Array.isArray(first[0])) {
        // [batch][seq][dim] — already pooled if pipeline applied pooling.
        return (first[0] as number[]).map(Number);
      }
      if (Array.isArray(first)) {
        return (first as number[]).map(Number);
      }
      return (flat as number[]).map(Number);
    }
  }
  if (t.data) return Array.from(t.data, Number);
  return [];
}

export class FeatureExtractionNode extends BaseNode {
  static readonly nodeType = "transformers.FeatureExtraction";
  static readonly title = "Feature Extraction (Embeddings)";
  static readonly description =
    "Compute text embeddings using a Transformers.js feature-extraction pipeline.\n" +
    "nlp, embeddings, vectors, transformers, huggingface, semantic-search\n\n" +
    "Use cases:\n" +
    "- Build semantic search or RAG pipelines\n" +
    "- Cluster or deduplicate documents\n" +
    "- Compute sentence similarity";
  static readonly metadataOutputTypes = {
    embedding: "list",
    dim: "int"
  };

  @prop({
    type: "str",
    default: "Hello world",
    title: "Text",
    description: "Text to embed."
  })
  declare text: any;

  @prop({
    type: "str",
    default: "Xenova/all-MiniLM-L6-v2",
    title: "Model",
    description: "Hugging Face model id (must be transformers.js-compatible)."
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "mean",
    title: "Pooling",
    description: "Pooling strategy applied to the token embeddings.",
    values: ["none", "mean", "cls"]
  })
  declare pooling: any;

  @prop({
    type: "bool",
    default: true,
    title: "Normalize",
    description: "L2-normalize the resulting embedding."
  })
  declare normalize: any;

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

    const pipeline = (await getPipeline({
      task: "feature-extraction",
      model: asString(this.model) || undefined,
      dtype: normalizeOption(this.dtype),
      device: normalizeOption(this.device)
    })) as (
      input: string,
      opts?: Record<string, unknown>
    ) => Promise<unknown>;

    const opts: Record<string, unknown> = {
      normalize: Boolean(this.normalize)
    };
    const pooling = asString(this.pooling, "mean");
    if (pooling && pooling !== "none") opts.pooling = pooling;

    const tensor = await pipeline(text, opts);
    const embedding = tensorToVector(tensor);
    return { embedding, dim: embedding.length };
  }
}

export const FEATURE_EXTRACTION_NODES: readonly NodeClass[] = [
  FeatureExtractionNode
];
