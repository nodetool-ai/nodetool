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
  type LibraryEmbedder,
  type LibraryImage
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

function contextFor(userId: string): ProcessingContext {
  return new ProcessingContext({
    jobId: `${EMBED_JOB_PREFIX}${randomUUID()}`,
    userId,
    secretResolver: getSecret
  });
}

function vectorsOf(result: unknown, space: EmbeddingSpace): number[][] {
  if (!isVectorList(result)) {
    throw new Error(`${space.provider} returned no embeddings for ${space.model}.`);
  }
  return result;
}

/** Embed `texts` in `space` for `userId`. */
export async function embedWithProvider(
  texts: string[],
  space: EmbeddingSpace,
  userId: string
): Promise<number[][]> {
  const context = contextFor(userId);
  if (IN_PROCESS_EMBEDDING_PROVIDERS.has(space.provider)) {
    await ensureLocalProvider(space.provider);
    const provider = await context.getProvider(space.provider);
    return vectorsOf(await provider.generateEmbedding({ text: texts, model: space.model }), space);
  }
  const result = await context.runProviderPrediction({
    provider: space.provider,
    capability: "generate_embedding",
    model: space.model,
    params: { text: texts }
  });
  return vectorsOf(result, space);
}

/** Embed image files in `space` for `userId`, with a model whose text embeddings share it. */
export async function embedImagesWithProvider(
  images: LibraryImage[],
  space: EmbeddingSpace,
  userId: string
): Promise<number[][]> {
  const context = contextFor(userId);
  const inputs = images.map((image) => ({ data: image.bytes, mimeType: image.contentType ?? undefined }));
  if (IN_PROCESS_EMBEDDING_PROVIDERS.has(space.provider)) {
    await ensureLocalProvider(space.provider);
    const provider = await context.getProvider(space.provider);
    return vectorsOf(await provider.generateImageEmbedding({ images: inputs, model: space.model }), space);
  }
  const result = await context.runProviderPrediction({
    provider: space.provider,
    capability: "generate_embedding",
    model: space.model,
    params: { images: inputs }
  });
  return vectorsOf(result, space);
}

export const providerLibraryEmbedder: LibraryEmbedder = {
  embed: embedWithProvider,
  embedImages: embedImagesWithProvider
};
