import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
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

const TJS_TYPE = "tjs.feature_extraction";

type Tensor = {
  data?: ArrayLike<number>;
  dims?: number[];
  size?: number;
  tolist?: () => unknown;
};

function meanPool(matrix: number[][]): number[] {
  if (matrix.length === 0) return [];
  const dim = matrix[0]?.length ?? 0;
  const out = new Array<number>(dim).fill(0);
  for (const row of matrix) {
    for (let i = 0; i < dim; i++) {
      out[i] += Number(row[i] ?? 0);
    }
  }
  for (let i = 0; i < dim; i++) {
    out[i] /= matrix.length;
  }
  return out;
}

/**
 * Reduce a feature-extraction tensor to a single 1-D embedding vector.
 *
 * Transformers.js returns differently-shaped tensors depending on whether
 * the caller asked for pooling:
 *   - pooled (mean / cls):  shape `[batch, dim]`           → take batch[0]
 *   - no pooling:           shape `[batch, seq, dim]`      → mean-pool seq
 *   - already 1-D:          shape `[dim]`                  → pass through
 *
 * Falling back to the flat `.data` buffer drops shape information and is
 * only safe when the tensor is already known to be 1-D.
 */
function tensorToVector(tensor: unknown): number[] {
  if (!tensor || typeof tensor !== "object") return [];
  const t = tensor as Tensor;
  if (typeof t.tolist === "function") {
    const nested = t.tolist();
    if (Array.isArray(nested)) {
      const first = nested[0];
      if (Array.isArray(first) && Array.isArray(first[0])) {
        // [batch][seq][dim] — pool sequence axis to a single vector.
        return meanPool((first as unknown[]).map((row) => row as number[]));
      }
      if (Array.isArray(first)) {
        // [batch][dim] — already pooled by the pipeline.
        return (first as number[]).map(Number);
      }
      return (nested as number[]).map(Number);
    }
  }
  if (t.data && t.dims && t.dims.length === 1) {
    return Array.from(t.data, Number);
  }
  if (t.data && (!t.dims || t.dims.length === 0)) {
    return Array.from(t.data, Number);
  }
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
    type: TJS_TYPE,
    default: tjsModelDefault(TJS_TYPE, defaultRepoFor(TJS_TYPE)),
    title: "Model",
    description: "Transformers.js model (ONNX-compatible)."
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
      model: extractRepoId(this.model) || undefined,
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
