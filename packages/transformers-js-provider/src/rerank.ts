import { getPipeline } from "@nodetool-ai/transformers-js-nodes";
import type { RerankParams, RerankResult } from "@nodetool-ai/runtime";

interface Tensor {
  data: ArrayLike<number>;
  dims: number[];
}

/** Tokenizer output: tensors this module hands back to the model unchanged. */
interface EncodedPairs {
  readonly input_ids: Tensor;
  readonly attention_mask: Tensor;
}

/**
 * The parts of a `text-classification` pipeline this module uses. The
 * pipeline's own call cannot encode a query/document pair, so the tokenizer
 * and model are called directly.
 */
interface CrossEncoderPipeline {
  tokenizer: (
    text: string[],
    options: { text_pair: string[]; padding: boolean; truncation: boolean }
  ) => EncodedPairs;
  model: (inputs: EncodedPairs) => Promise<{ logits: Tensor }>;
}

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/**
 * A cross-encoder has one relevance logit per pair. A head with several
 * labels gives the probability of its last label, the "relevant" class.
 */
function relevance(row: number[]): number {
  if (row.length === 1) {
    return sigmoid(row[0]);
  }
  const max = Math.max(...row);
  const exps = row.map((v) => Math.exp(v - max));
  return exps[exps.length - 1] / exps.reduce((a, b) => a + b, 0);
}

/** Score each document against the query with a cross-encoder. */
export async function rerank(params: RerankParams): Promise<RerankResult[]> {
  if (params.documents.length === 0) {
    return [];
  }
  params.signal?.throwIfAborted();
  const { tokenizer, model } = await getPipeline<CrossEncoderPipeline>({
    task: "text-classification",
    model: params.model
  });
  const inputs = tokenizer(
    params.documents.map(() => params.query),
    { text_pair: params.documents, padding: true, truncation: true }
  );
  const { logits } = await model(inputs);
  params.signal?.throwIfAborted();
  const labels = logits.dims[1] ?? 1;
  const results = params.documents.map((_, index) => {
    const row = Array.from({ length: labels }, (_, label) =>
      Number(logits.data[index * labels + label])
    );
    return { index, score: relevance(row) };
  });
  results.sort((a, b) => b.score - a.score);
  return params.topK != null && params.topK >= 0
    ? results.slice(0, params.topK)
    : results;
}
