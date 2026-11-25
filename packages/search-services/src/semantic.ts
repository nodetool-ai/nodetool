/**
 * The semantic layer of library search (docs/plans/library-search.md, D7 to
 * D12, D26, D27). Chunk vectors live in managed vector collections, one per
 * owner and embedding space, partitioned by project. The chunk text stays in
 * the main database: a vector record holds the chunk id, its vector and the
 * item and project ids.
 *
 * This package does not call model providers. The host installs a
 * {@link LibraryEmbedder} (the indexer process) and a query embedder (the
 * server, which may ask the indexer process over IPC). Without them, search
 * runs in keyword mode.
 */

import { createHash } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import { Setting } from "@nodetool-ai/models";
import {
  CollectionNotFoundError,
  getDefaultVectorProvider,
  MANAGED_COLLECTION_PREFIX,
  MANAGED_METADATA_KEY,
  type VectorCollection,
  type VectorProvider
} from "@nodetool-ai/vectorstore";

const log = createLogger("nodetool.search.semantic");

/** The settings of the `Library Search` group (D27). Env vars of the same name apply when unset. */
export const LIBRARY_SEARCH_SETTINGS = {
  semantic: "NODETOOL_SEARCH_SEMANTIC",
  provider: "NODETOOL_SEARCH_EMBEDDING_PROVIDER",
  model: "NODETOOL_SEARCH_EMBEDDING_MODEL",
  excludedProjects: "NODETOOL_SEARCH_EXCLUDED_PROJECTS",
  dailySpendLimit: "NODETOOL_SEARCH_DAILY_SPEND_LIMIT"
} as const;

/** The default local model (D31): 384 dimensions, runs through Transformers.js. */
export const DEFAULT_LOCAL_EMBEDDING = {
  provider: "transformers_js",
  model: "Xenova/all-MiniLM-L6-v2"
} as const;

/** Providers that load the model into the calling process. Only the indexer process may run them (D13). */
export const IN_PROCESS_EMBEDDING_PROVIDERS: ReadonlySet<string> = new Set([
  "transformers_js",
  "node_llama_cpp"
]);

/** One embedding model. Vectors from different spaces never mix. */
export interface EmbeddingSpace {
  /** `provider:model`. Stored on each chunk that has a vector in this space. */
  id: string;
  provider: string;
  model: string;
}

export function embeddingSpace(provider: string, model: string): EmbeddingSpace {
  return { id: `${provider}:${model}`, provider, model };
}

/** Embeds index passages. Installed by the process that runs the indexer. */
export interface LibraryEmbedder {
  embed(texts: string[], space: EmbeddingSpace, userId: string): Promise<number[][]>;
}

/** Embeds one query, or answers null when it cannot right now. */
export type LibraryQueryEmbedder = (
  text: string,
  space: EmbeddingSpace,
  userId: string
) => Promise<number[] | null>;

let embedder: LibraryEmbedder | null = null;
let queryEmbedder: LibraryQueryEmbedder | null = null;
let vectorProvider: VectorProvider | null = null;

/** Install how passages are embedded, or remove it with `null`. */
export function setLibraryEmbedder(next: LibraryEmbedder | null): void {
  embedder = next;
}

export function libraryEmbedder(): LibraryEmbedder | null {
  return embedder;
}

/**
 * Install how queries are embedded, or remove it with `null`. Without one, a
 * process that has a {@link LibraryEmbedder} uses it for queries too.
 */
export function setLibraryQueryEmbedder(next: LibraryQueryEmbedder | null): void {
  queryEmbedder = next;
}

/** Embed a query in `space`, or null when no embedder can. */
export async function embedLibraryQuery(
  text: string,
  space: EmbeddingSpace,
  userId: string
): Promise<number[] | null> {
  let vector: number[] | null | undefined;
  if (queryEmbedder) {
    vector = await queryEmbedder(text, space, userId);
  } else if (embedder) {
    [vector] = await embedder.embed([text], space, userId);
  }
  return vector && vector.length > 0 ? normalize(vector) : null;
}

/** Use another vector store than the process default. Tests pass an in-memory one. */
export function setLibraryVectorProvider(next: VectorProvider | null): void {
  vectorProvider = next;
}

function vectors(): VectorProvider {
  return vectorProvider ?? getDefaultVectorProvider();
}

async function readSetting(key: string): Promise<string | null> {
  try {
    const row = await Setting.find("1", key);
    if (row && row.value.trim()) return row.value.trim();
  } catch {
    // No settings table (a bare test database): the environment decides.
  }
  const env = process.env[key]?.trim();
  return env ? env : null;
}

/**
 * The configured embedding space, or null when search by meaning is off or
 * not set up. A deployment sets both provider and model (D26). Turning it on
 * without a model uses the default local model.
 */
export async function libraryEmbeddingSpace(): Promise<EmbeddingSpace | null> {
  const switched = (await readSetting(LIBRARY_SEARCH_SETTINGS.semantic))?.toLowerCase();
  if (switched === "off") return null;
  const provider = await readSetting(LIBRARY_SEARCH_SETTINGS.provider);
  const model = await readSetting(LIBRARY_SEARCH_SETTINGS.model);
  if (provider && model) return embeddingSpace(provider, model);
  if (switched === "on") {
    return embeddingSpace(provider ?? DEFAULT_LOCAL_EMBEDDING.provider, model ?? DEFAULT_LOCAL_EMBEDDING.model);
  }
  return null;
}

/** Projects whose text is never sent to an embedding model. */
export async function excludedEmbeddingProjects(): Promise<string[]> {
  const raw = await readSetting(LIBRARY_SEARCH_SETTINGS.excludedProjects);
  return (raw ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** The daily spend limit for hosted embedding in US dollars, or null for none. */
export async function embeddingDailySpendLimit(): Promise<number | null> {
  const raw = await readSetting(LIBRARY_SEARCH_SETTINGS.dailySpendLimit);
  const limit = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(limit) && limit >= 0 ? limit : null;
}

/**
 * Turn search by meaning on with one model (D25, D28). Changing the model
 * starts a background rebuild: the old space keeps answering until the new
 * one is complete.
 */
export async function setupLibrarySemanticSearch(space: { provider: string; model: string } | null): Promise<void> {
  if (!space) {
    await Setting.upsert({ userId: "1", key: LIBRARY_SEARCH_SETTINGS.semantic, value: "off" });
    return;
  }
  await Setting.upsert({ userId: "1", key: LIBRARY_SEARCH_SETTINGS.provider, value: space.provider });
  await Setting.upsert({ userId: "1", key: LIBRARY_SEARCH_SETTINGS.model, value: space.model });
  await Setting.upsert({ userId: "1", key: LIBRARY_SEARCH_SETTINGS.semantic, value: "on" });
}

/** Scale a vector to unit length, so L2 distance orders like cosine similarity. */
export function normalize(vector: readonly number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const length = Math.sqrt(sum);
  return length > 0 ? vector.map((value) => value / length) : [...vector];
}

/** Cosine similarity of a hit from its distance, for the store's metric. */
export function similarityOf(distance: number): number {
  // pgvector's cosine distance is 1 - cos. sqlite-vec's L2 between unit vectors is sqrt(2 - 2cos).
  return vectors().name === "supabase" ? 1 - distance : 1 - (distance * distance) / 2;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

/** Record metadata key that partitions a managed collection (D9). */
export const LIBRARY_PARTITION_KEY = "project_id";
const OWNER_KEY = "library_owner";
const SPACE_KEY = "embedding_space";

/** The managed collection of one owner and space. Hashed: user ids and model ids may hold any character. */
export function libraryCollectionName(userId: string, space: EmbeddingSpace): string {
  return `${MANAGED_COLLECTION_PREFIX}${shortHash(userId)}_${shortHash(space.id)}`;
}

/** The managed collection for `userId` in `space`, created on first use. */
export async function libraryCollection(userId: string, space: EmbeddingSpace): Promise<VectorCollection> {
  return vectors().getOrCreateCollection({
    name: libraryCollectionName(userId, space),
    metadata: {
      [MANAGED_METADATA_KEY]: "library",
      [OWNER_KEY]: userId,
      [SPACE_KEY]: space.id,
      embedding_provider: space.provider,
      embedding_model: space.model
    },
    partitionKey: LIBRARY_PARTITION_KEY,
    metric: "cosine"
  });
}

/** The managed collection if it exists. */
export async function existingLibraryCollection(
  userId: string,
  space: EmbeddingSpace
): Promise<VectorCollection | null> {
  try {
    return await vectors().getCollection({ name: libraryCollectionName(userId, space) });
  } catch (error) {
    if (error instanceof CollectionNotFoundError) return null;
    throw error;
  }
}

/** Every managed collection of one owner, with its space. */
export async function libraryCollections(userId: string): Promise<Array<{ name: string; space: EmbeddingSpace }>> {
  const out: Array<{ name: string; space: EmbeddingSpace }> = [];
  for (const info of await vectors().listCollections()) {
    const meta = info.metadata ?? {};
    if (!info.name.startsWith(MANAGED_COLLECTION_PREFIX) || meta[OWNER_KEY] !== userId) continue;
    const provider = meta.embedding_provider;
    const model = meta.embedding_model;
    if (typeof provider === "string" && typeof model === "string") {
      out.push({ name: info.name, space: embeddingSpace(provider, model) });
    }
  }
  return out;
}

/** Drop an owner's managed collections, except the one for `keep` (D11, D12). */
export async function dropLibraryCollections(userId: string, keep?: EmbeddingSpace): Promise<number> {
  let dropped = 0;
  for (const collection of await libraryCollections(userId)) {
    if (keep && collection.space.id === keep.id) continue;
    await vectors().deleteCollection(collection.name);
    dropped += 1;
    log.info("Dropped library vector collection", { space: collection.space.id });
  }
  return dropped;
}

/**
 * Delete the vectors of removed chunks from every collection of their owner
 * (D12). Best effort: a vector left behind is dropped when a query meets it.
 */
export async function removeChunkVectors(userId: string, chunkIds: readonly string[]): Promise<void> {
  if (chunkIds.length === 0) return;
  try {
    // A deployment that never turned search by meaning on has no vector store to open.
    if (!vectorProvider && !(await libraryEmbeddingSpace())) return;
    for (const { name } of await libraryCollections(userId)) {
      const collection = await vectors().getCollection({ name });
      for (let start = 0; start < chunkIds.length; start += 500) {
        await collection.delete(chunkIds.slice(start, start + 500));
      }
    }
  } catch (error) {
    log.debug("Library vectors not removed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/** Whether search by meaning may have vectors at all, without touching the store. */
export function semanticLayerInstalled(): boolean {
  return embedder !== null || queryEmbedder !== null;
}
