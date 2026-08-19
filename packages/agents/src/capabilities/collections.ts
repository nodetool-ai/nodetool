/**
 * The `collections` capability module — knowledge collections and the vector
 * store behind them.
 *
 * Eight capabilities that used to be eight `Tool` subclasses: the two
 * zero-arg discovery/query tools from `collection-tools.ts`, and the
 * six `vector_*` tools from `../tools/vector-tools.ts`.
 *
 * What was a constructor argument is now a field on the run. The six vector
 * tools took a `VectorCollection`; their schemas name no collection, so a run
 * that binds none cannot serve them and they say so instead of guessing.
 * `@nodetool-ai/vectorstore` stays imported inside the two implementations
 * that need it, which is what kept those two out of the zero-arg catalogs.
 *
 * Design: docs/tool-class-retirement-design.md § "Migration" (`/collections`).
 */

import { readFile } from "node:fs/promises";
import type { JsonSchema } from "@nodetool-ai/runtime";
import type { VectorCollection, VectorMatch } from "@nodetool-ai/vectorstore";
import {
  flattenMetadata,
  generateDocumentId,
  splitMarkdownByHeaders,
  splitTextRecursive
} from "../tools/vector-tool-support.js";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  listCollectionsSpec,
  queryCollectionSpec,
  vectorTextSearchSpec,
  vectorIndexSpec,
  vectorHybridSearchSpec,
  vectorRecursiveSplitAndIndexSpec,
  vectorMarkdownSplitAndIndexSpec,
  vectorBatchIndexSpec,
  createCollectionSpec,
  deleteCollectionSpec,
  QUERY_COLLECTION_SCHEMA
} from "./collections.specs.js";
import { userIdOf } from "../tools/mcp-tool-support.js";
import { isString } from "../utils/type-guards.js";

export { QUERY_COLLECTION_SCHEMA } from "./collections.specs.js";

interface CollectionSummary {
  name: string;
  count?: number;
  metadata?: Record<string, unknown>;
}

/**
 * The refusal a vector capability returns when the run binds no collection.
 * The six schemas carry no collection name — the collection was chosen by
 * whoever constructed the tool — so there is nothing to resolve from the args.
 */
function noCollectionError(what: string) {
  return {
    error:
      `Cannot ${what}: no vector collection is bound to this run. Bind one ` +
      "with `vectorCollection` on the capability run, or use " +
      "`query_collection` to search a collection by name."
  };
}

function collectionOf(run: CapabilityRun): VectorCollection | undefined {
  return run.vectorCollection;
}

// ---------------------------------------------------------------------------
// list_collections
// ---------------------------------------------------------------------------

const listCollections: CapabilityExport = {
  spec: listCollectionsSpec,
  impl: async () => {
    const { getDefaultVectorProvider } =
      await import("@nodetool-ai/vectorstore");
    const provider = getDefaultVectorProvider();
    const infos = await provider.listCollections();
    const collections: CollectionSummary[] = infos.map((info) => ({
      name: info.name,
      metadata: info.metadata
    }));
    return { collections };
  }
};

const queryCollection: CapabilityExport = {
  spec: queryCollectionSpec,
  impl: async (_run, params) => {
    const name = String(params["collection"] ?? "");
    const query = String(params["query"] ?? "");
    const nResults = Number(params["n_results"] ?? 5);
    if (!name) return { error: "collection is required" };
    if (!query) return { error: "query is required" };

    const { resolveCollection } = await import("@nodetool-ai/vectorstore");
    const collection = await resolveCollection(name);
    const matches = await collection.query({ text: query, topK: nResults });

    return {
      collection: name,
      matches: matches
        .filter((m) => m.document != null)
        .map((m) => ({
          id: m.id,
          document: m.document,
          score: m.score ?? null
        }))
    };
  }
};

// ---------------------------------------------------------------------------
// vector_text_search
// ---------------------------------------------------------------------------

const vectorTextSearch: CapabilityExport = {
  spec: vectorTextSearchSpec,
  impl: async (run, params) => {
    const collection = collectionOf(run);
    if (!collection) return noCollectionError("search the vector store");
    const text = params["text"] as string;
    const nResults = (params["n_results"] as number) ?? 10;

    const matches = await collection.query({ text, topK: nResults });

    const out: Record<string, string> = {};
    for (const m of matches) {
      if (m.document != null) out[m.id] = m.document;
    }
    return out;
  }
};

// ---------------------------------------------------------------------------
// vector_index
// ---------------------------------------------------------------------------

const vectorIndex: CapabilityExport = {
  spec: vectorIndexSpec,
  impl: async (run, params) => {
    const collection = collectionOf(run);
    if (!collection) return noCollectionError("index a text chunk");
    const text = params["text"] as string;
    const sourceId = params["source_id"] as string;
    const metadata = (params["metadata"] as Record<string, unknown>) ?? {};

    if (!sourceId.trim()) return { error: "The source ID cannot be empty" };

    const documentId = generateDocumentId(sourceId);

    await collection.upsert([
      {
        id: documentId,
        document: text,
        metadata:
          Object.keys(metadata).length > 0
            ? flattenMetadata(metadata)
            : undefined
      }
    ]);

    return {
      status: "success",
      document_id: documentId,
      message: `Successfully indexed text chunk with ID ${documentId}`
    };
  }
};

// ---------------------------------------------------------------------------
// vector_hybrid_search
// ---------------------------------------------------------------------------

/**
 * The keyword half of the fusion: tokens long enough to be worth matching,
 * expressed as the store's `$document` filter. Null when nothing qualifies,
 * in which case the semantic result stands in for the keyword one.
 */
function keywordFilter(
  text: string,
  minLength: number
): Record<string, unknown> | null {
  const tokens = text
    .toLowerCase()
    .split(/[ ,.!?\-_=|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= minLength);

  if (tokens.length === 0) return null;
  if (tokens.length > 1) {
    return {
      $document: { $or: tokens.map((t) => ({ $contains: t })) }
    };
  }
  return { $document: { $contains: tokens[0] } };
}

const vectorHybridSearch: CapabilityExport = {
  spec: vectorHybridSearchSpec,
  impl: async (run, params) => {
    const collection = collectionOf(run);
    if (!collection) return noCollectionError("run a hybrid search");
    try {
      const text = params["text"] as string;
      if (!text.trim()) return { error: "Search text cannot be empty" };

      const nResults = (params["n_results"] as number) ?? 5;
      const kConstant = (params["k_constant"] as number) ?? 60.0;
      const minKeywordLength = (params["min_keyword_length"] as number) ?? 3;

      const semanticMatches = await collection.query({
        text,
        topK: nResults * 2
      });

      const filter = keywordFilter(text, minKeywordLength);
      let keywordMatches: VectorMatch[] = semanticMatches;
      if (filter) {
        keywordMatches = await collection.query({
          text,
          topK: nResults * 2,
          filter
        });
      }

      const combined: Record<string, { doc: string; score: number }> = {};
      const fuse = (matches: VectorMatch[]) => {
        matches.forEach((m, rank) => {
          // RRF uses 1-based ranks: first result scores 1/(k+1).
          const score = 1 / (rank + 1 + kConstant);
          if (m.document == null) return;
          if (combined[m.id]) combined[m.id].score += score;
          else combined[m.id] = { doc: m.document, score };
        });
      };
      fuse(semanticMatches);
      fuse(keywordMatches);

      const sorted = Object.entries(combined)
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, nResults);

      const out: Record<string, string> = {};
      for (const [id, item] of sorted) out[id] = item.doc;
      return out;
    } catch (e: unknown) {
      return { error: String(e) };
    }
  }
};

// ---------------------------------------------------------------------------
// vector_recursive_split_and_index
// ---------------------------------------------------------------------------

const vectorRecursiveSplitAndIndex: CapabilityExport = {
  spec: vectorRecursiveSplitAndIndexSpec,
  impl: async (run, params) => {
    const collection = collectionOf(run);
    if (!collection) return noCollectionError("split and index text");
    const text = params["text"] as string;
    const documentId = params["document_id"] as string;
    const baseMetadata = (params["metadata"] as Record<string, unknown>) ?? {};
    const chunkSize = (params["chunk_size"] as number) ?? 1000;
    const chunkOverlap = (params["chunk_overlap"] as number) ?? 200;
    let separators = (params["separators"] as string[]) ?? ["\n\n", "\n", "."];
    if (isString(separators)) separators = [separators];

    if (!text.trim()) return { error: "The text cannot be empty" };
    if (!documentId.trim()) return { error: "The document ID cannot be empty" };

    let rawChunks: string[];
    try {
      rawChunks = splitTextRecursive(text, separators, chunkSize, chunkOverlap);
    } catch (e: unknown) {
      return { error: `Text splitting failed: ${String(e)}` };
    }

    const indexedIds: string[] = [];
    try {
      for (let i = 0; i < rawChunks.length; i++) {
        const sourceId = `${documentId}:${i}`;
        const uniqueId = generateDocumentId(`${sourceId}:${i}`);
        const metadata = flattenMetadata({ ...baseMetadata, start_index: i });

        await collection.upsert([
          { id: uniqueId, document: rawChunks[i], metadata }
        ]);
        indexedIds.push(uniqueId);
      }
    } catch (e: unknown) {
      return {
        error: `Indexing failed: ${String(e)}`,
        indexed_count: indexedIds.length,
        total_chunks: rawChunks.length
      };
    }

    return {
      status: "success",
      indexed_count: indexedIds.length,
      document_id: documentId,
      message: `Successfully indexed ${indexedIds.length} chunks from document ${documentId}`
    };
  }
};

// ---------------------------------------------------------------------------
// vector_markdown_split_and_index
// ---------------------------------------------------------------------------

const vectorMarkdownSplitAndIndex: CapabilityExport = {
  spec: vectorMarkdownSplitAndIndexSpec,
  impl: async (run, params) => {
    const collection = collectionOf(run);
    if (!collection) return noCollectionError("split and index Markdown");
    const filePath = params["file_path"] as string | undefined;
    let text: string | undefined;
    let docId: string;

    if (filePath) {
      docId = filePath;
      text = await readFile(filePath, "utf-8");
    } else {
      text = params["text"] as string | undefined;
      docId = crypto.randomUUID();
      if (!text) return { error: "Neither file_path nor text is provided" };
    }

    // Split by headers first
    const headerSections = splitMarkdownByHeaders(text);

    // Further split by chunk size
    const chunkSize = (params["chunk_size"] as number) ?? 1000;
    const chunkOverlap = (params["chunk_overlap"] as number) ?? 200;

    const allChunks: string[] = [];
    for (const section of headerSections) {
      if (section.length <= chunkSize) {
        allChunks.push(section);
      } else {
        const sub = splitTextRecursive(
          section,
          ["\n\n", "\n", "."],
          chunkSize,
          chunkOverlap
        );
        allChunks.push(...sub);
      }
    }

    const indexedIds: string[] = [];
    for (let i = 0; i < allChunks.length; i++) {
      const uniqueId = `${docId}:${i}`;
      await collection.upsert([{ id: uniqueId, document: allChunks[i] }]);
      indexedIds.push(uniqueId);
    }

    return {
      status: "success",
      indexed_ids: indexedIds,
      message: `Successfully indexed ${indexedIds.length} chunks`
    };
  }
};

// ---------------------------------------------------------------------------
// vector_batch_index
// ---------------------------------------------------------------------------

/** One chunk as `vector_batch_index` takes it off the tool call. */
interface BatchChunk {
  text?: string;
  source_id?: string;
  metadata?: Record<string, unknown>;
}

const vectorBatchIndex: CapabilityExport = {
  spec: vectorBatchIndexSpec,
  impl: async (run, params) => {
    const collection = collectionOf(run);
    if (!collection) return noCollectionError("index a batch of chunks");
    const rawChunks = params["chunks"];
    // A caller that passes one string where a list is expected gets it read
    // as a single chunk with no `source_id`, which the filter below drops —
    // the same outcome as before, without pretending a string is a chunk.
    const chunks: BatchChunk[] =
      isString(rawChunks)
        ? [{ text: rawChunks }]
        : (rawChunks as BatchChunk[]);
    const baseMetadata =
      (params["base_metadata"] as Record<string, unknown>) ?? {};

    if (!chunks || chunks.length === 0) return { error: "No chunks provided" };

    const records = chunks
      .filter((c) => c.text && c.source_id)
      .map((c) => ({
        id: generateDocumentId(c.source_id as string),
        document: c.text as string,
        metadata: flattenMetadata({ ...baseMetadata, ...(c.metadata ?? {}) })
      }));

    if (records.length === 0) return { error: "No valid chunks to index" };

    try {
      await collection.upsert(records);

      return {
        status: "success",
        indexed_count: records.length,
        message: `Successfully indexed ${records.length} chunks`
      };
    } catch (e: unknown) {
      return { error: `Indexing failed: ${String(e)}` };
    }
  }
};

/** Every collection capability: discovery and query first, then the store. */
/**
 * Collection lifecycle, under the ownership rules the HTTP layer applies.
 *
 * The `VectorProvider` interface has no concept of a user — collections are
 * one flat namespace — so ownership is a metadata stamp checked at the
 * boundary (`@nodetool-ai/vectorstore/collection-access`). The read
 * capabilities predate that and stay as they are; these two do not, because
 * creating and destroying a store is where a shared namespace stops being
 * something others can see and starts being something others lose. A
 * collection with no owner recorded predates the stamp and stays shared, which
 * is the same answer the API gives.
 */
const createCollection: CapabilityExport = {
  spec: createCollectionSpec,
  impl: async (run, params) => {
    const { getDefaultVectorProvider, validateCollectionName, OWNER_METADATA_KEY } =
      await import("@nodetool-ai/vectorstore");
    const name = String(params["name"] ?? "");
    const badName = validateCollectionName(name);
    if (badName) return { error: badName };

    const metadata: Record<string, string> = {
      [OWNER_METADATA_KEY]: userIdOf(run.context)
    };
    if (isString(params["embedding_model"])) {
      metadata.embedding_model = params["embedding_model"];
    }
    if (isString(params["embedding_provider"])) {
      metadata.embedding_provider = params["embedding_provider"];
    }

    const provider = getDefaultVectorProvider();
    // The store's name column is unique, so a duplicate arrives as a driver
    // error. Say what it means instead of forwarding raw SQL.
    try {
      await provider.createCollection({ name, metadata });
    } catch (err) {
      const existing = await provider
        .listCollections()
        .catch(() => [] as { name: string }[]);
      if (existing.some((c) => c.name === name)) {
        return { error: `Collection ${name} already exists.` };
      }
      throw err;
    }
    return { name, created: true };
  }
};

const deleteCollection: CapabilityExport = {
  spec: deleteCollectionSpec,
  impl: async (run, params) => {
    const { getDefaultVectorProvider, canAccessCollection } =
      await import("@nodetool-ai/vectorstore");
    const name = String(params["name"] ?? "");
    const provider = getDefaultVectorProvider();
    const infos = await provider.listCollections();
    const info = infos.find((c) => c.name === name);
    if (!info) return { error: `Collection ${name} was not found.` };
    // Checked before the delete, not after: deleteCollection is irreversible.
    if (!canAccessCollection(info.metadata, userIdOf(run.context))) {
      return { error: `Collection ${name} belongs to another user.` };
    }
    await provider.deleteCollection(name);
    return { name, deleted: true };
  }
};

export const COLLECTION_CAPABILITIES: readonly CapabilityExport[] = [
  listCollections,
  queryCollection,
  vectorTextSearch,
  vectorIndex,
  vectorHybridSearch,
  vectorRecursiveSplitAndIndex,
  vectorMarkdownSplitAndIndex,
  vectorBatchIndex,
  createCollection,
  deleteCollection
];

export const module: CapabilityModule = {
  module: "collections",
  exports: COLLECTION_CAPABILITIES
};

export {
  listCollections,
  queryCollection,
  vectorTextSearch,
  vectorIndex,
  vectorHybridSearch,
  vectorRecursiveSplitAndIndex,
  vectorMarkdownSplitAndIndex,
  vectorBatchIndex,
  createCollection,
  deleteCollection
};
