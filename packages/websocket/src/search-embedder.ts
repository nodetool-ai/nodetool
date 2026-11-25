/**
 * Embedding for library search (docs/plans/library-search.md, D10, D13):
 * vectors come from the runtime providers. A hosted model runs through the
 * generation seam, so its cost lands in the prediction ledger like
 * `embed_text`. A local model (Transformers.js, node-llama-cpp) is called
 * directly and loads in the indexer process only; the server asks that
 * process for query vectors over IPC.
 */

import { randomUUID } from "node:crypto";
import { getSecret } from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import {
  EMBED_JOB_PREFIX,
  IN_PROCESS_EMBEDDING_PROVIDERS,
  type EmbeddingSpace,
  type LibraryEmbedder
} from "@nodetool-ai/search-services";

let transformersRegistered = false;

/** The Transformers.js provider is a pack; the indexer process loads no packs, so register it on first use. */
async function ensureLocalProvider(provider: string): Promise<void> {
  if (provider !== "transformers_js" || transformersRegistered) return;
  const { importPack } = await import("@nodetool-ai/node-catalog");
  const pack = await importPack<{ registerTransformersJsProvider(): void }>(
    "transformers-js",
    "@nodetool-ai/transformers-js-provider"
  );
  pack.registerTransformersJsProvider();
  transformersRegistered = true;
}

function isVectorList(value: unknown): value is number[][] {
  return Array.isArray(value) && value.every((row) => Array.isArray(row));
}

/** Embed `texts` in `space` for `userId`. */
export async function embedWithProvider(
  texts: string[],
  space: EmbeddingSpace,
  userId: string
): Promise<number[][]> {
  const context = new ProcessingContext({
    jobId: `${EMBED_JOB_PREFIX}${randomUUID()}`,
    userId,
    secretResolver: getSecret
  });
  let result: unknown;
  if (IN_PROCESS_EMBEDDING_PROVIDERS.has(space.provider)) {
    await ensureLocalProvider(space.provider);
    const provider = await context.getProvider(space.provider);
    result = await provider.generateEmbedding({ text: texts, model: space.model });
  } else {
    result = await context.runProviderPrediction({
      provider: space.provider,
      capability: "generate_embedding",
      model: space.model,
      params: { text: texts }
    });
  }
  if (!isVectorList(result)) {
    throw new Error(`${space.provider} returned no embeddings for ${space.model}.`);
  }
  return result;
}

export const providerLibraryEmbedder: LibraryEmbedder = { embed: embedWithProvider };
