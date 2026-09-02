import { getPipeline } from "@nodetool-ai/transformers-js-nodes";

interface EmbedArgs {
  text: string | string[];
  model: string;
  dimensions?: number;
}

interface EmbeddingTensor {
  data?: ArrayLike<number>;
  dims?: number[];
  tolist?: () => number[][] | number[];
}

/** The `feature-extraction` call options this provider sets. */
interface FeatureExtractionOptions {
  pooling: "none" | "mean" | "cls" | "first_token" | "eos" | "last_token";
  /** Unit-length vectors; `truncateDimensions` re-normalizes on that basis. */
  normalize: boolean;
}

type FeatureExtractionPipelineFn = (
  input: string | string[],
  opts?: FeatureExtractionOptions
) => Promise<EmbeddingTensor>;

/** `tolist()` returns `number[][]` for a batch and a flat `number[]` for one input. */
function isVectorBatch(list: number[][] | number[]): list is number[][] {
  return list.length > 0 && Array.isArray(list[0]);
}

/**
 * Coerce transformers.js feature-extraction tensor output to `number[][]`.
 *
 * The pipeline returns a Tensor with `data` (flat typed array) and `dims`
 * ([batchSize, hiddenSize] for a single input with mean-pooling). When
 * `tolist()` is available we use it; otherwise we reshape `data` by `dims`.
 */
function tensorToVectors(t: EmbeddingTensor): number[][] {
  if (t.tolist) {
    const list = t.tolist();
    if (Array.isArray(list)) {
      return isVectorBatch(list) ? list : [list];
    }
  }

  if (t.data && t.dims && t.dims.length >= 2) {
    const [batchSize, hiddenSize] = t.dims;
    const flat = Array.from(t.data);
    const out: number[][] = [];
    for (let i = 0; i < batchSize; i++) {
      out.push(flat.slice(i * hiddenSize, (i + 1) * hiddenSize));
    }
    return out;
  }

  if (t.data) {
    return [Array.from(t.data)];
  }

  throw new Error("Unrecognized embedding tensor shape");
}

/**
 * Truncate each embedding to `dimensions` and re-normalize, mirroring the
 * OpenAI `dimensions` parameter (Matryoshka-style). Re-normalizing keeps the
 * vectors unit-length — the pipeline is invoked with `normalize: true`, and
 * cosine similarity assumes that property. A no-op when `dimensions` is unset
 * or already >= the model's hidden size.
 */
function truncateDimensions(
  vectors: number[][],
  dimensions?: number
): number[][] {
  if (!dimensions || dimensions <= 0) return vectors;
  return vectors.map((v) => {
    if (v.length <= dimensions) return v;
    const sliced = v.slice(0, dimensions);
    let norm = 0;
    for (const x of sliced) norm += x * x;
    norm = Math.sqrt(norm);
    return norm > 0 ? sliced.map((x) => x / norm) : sliced;
  });
}

export async function generateEmbedding(
  args: EmbedArgs
): Promise<number[][]> {
  const pipeline = await getPipeline<FeatureExtractionPipelineFn>({
    task: "feature-extraction",
    model: args.model
  });

  const result = await pipeline(args.text, {
    pooling: "mean",
    normalize: true
  });

  return truncateDimensions(tensorToVectors(result), args.dimensions);
}
