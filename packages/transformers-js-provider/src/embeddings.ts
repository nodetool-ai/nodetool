import { getPipeline } from "@nodetool/transformers-js-nodes";

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

type FeatureExtractionPipelineFn = (
  input: string | string[],
  opts?: Record<string, unknown>
) => Promise<EmbeddingTensor>;

/**
 * Coerce transformers.js feature-extraction tensor output to `number[][]`.
 *
 * The pipeline returns a Tensor with `data` (flat typed array) and `dims`
 * ([batchSize, hiddenSize] for a single input with mean-pooling). When
 * `tolist()` is available we use it; otherwise we reshape `data` by `dims`.
 */
function tensorToVectors(t: EmbeddingTensor): number[][] {
  if (typeof t.tolist === "function") {
    const list = t.tolist();
    if (Array.isArray(list) && list.length > 0 && Array.isArray(list[0])) {
      return list as number[][];
    }
    if (Array.isArray(list)) {
      return [list as number[]];
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

export async function generateEmbedding(
  args: EmbedArgs
): Promise<number[][]> {
  const pipeline = (await getPipeline({
    task: "feature-extraction",
    model: args.model
  })) as FeatureExtractionPipelineFn;

  const result = await pipeline(args.text, {
    pooling: "mean",
    normalize: true
  });

  return tensorToVectors(result);
}
