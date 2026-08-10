/**
 * The `collections` capability module — knowledge collections and the vector
 * store behind them.
 *
 * Eight capabilities that used to be eight `Tool` subclasses: the two
 * zero-arg discovery/query tools from `../tools/collection-tools.ts`, and the
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
function noCollectionError(what: string): Record<string, string> {
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
  spec: {
    name: "list_collections",
    description:
      "List the available knowledge collections (vector stores) the user has. " +
      "Use this to discover what you can search before calling query_collection.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [] as string[]
    },
    category: "read",
    userMessage: () => "Listing knowledge collections"
  },
  impl: async () => {
    const { getDefaultVectorProvider } = await import(
      "@nodetool-ai/vectorstore"
    );
    const provider = getDefaultVectorProvider();
    const infos = await provider.listCollections();
    const collections: CollectionSummary[] = infos.map((info) => ({
      name: info.name,
      metadata: info.metadata as Record<string, unknown>
    }));
    return { collections };
  }
};

// ---------------------------------------------------------------------------
// query_collection
// ---------------------------------------------------------------------------

const QUERY_COLLECTION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    collection: {
      type: "string",
      description: "Name of the collection to search"
    },
    query: {
      type: "string",
      description: "The text to search for"
    },
    n_results: {
      type: "number",
      description: "Maximum number of chunks to return",
      default: 5
    }
  },
  required: ["collection", "query"]
};

const queryCollection: CapabilityExport = {
  spec: {
    name: "query_collection",
    description:
      "Semantic search within a named knowledge collection. Returns the most " +
      "relevant document chunks. Call list_collections first if you don't know " +
      "the collection name.",
    inputSchema: QUERY_COLLECTION_SCHEMA,
    category: "read",
    userMessage: (params) => {
      const name = params["collection"];
      return name ? `Searching collection '${name}'` : "Searching collection";
    }
  },
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
  spec: {
    name: "vector_text_search",
    description:
      "Search all vector database collections for similar text using semantic search",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The text to search for" },
        n_results: {
          type: "integer",
          description: "Number of results to return",
          default: 10
        }
      },
      required: ["text"]
    },
    category: "read",
    userMessage: (params) => {
      const text = (params["text"] as string) ?? "something";
      const msg = `Performing semantic search for '${text}'...`;
      return msg.length > 80 ? "Performing semantic search..." : msg;
    }
  },
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
  spec: {
    name: "vector_index",
    description: "Index a text chunk into a vector database collection",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The text content to index" },
        source_id: {
          type: "string",
          description: "Unique identifier for the source of the text"
        },
        metadata: {
          type: "object",
          description: "Metadata to associate with the text chunk",
          default: {}
        }
      },
      required: ["text", "source_id"]
    },
    category: "write",
    userMessage: (params) => {
      const sourceId = (params["source_id"] as string) ?? "a source";
      const msg = `Indexing text chunk from ${sourceId}...`;
      return msg.length > 80 ? "Indexing text chunk..." : msg;
    }
  },
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
          Object.keys(metadata).length > 0 ? flattenMetadata(metadata) : undefined
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
  spec: {
    name: "vector_hybrid_search",
    description:
      "Search all vector database collections using both semantic and keyword-based search",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The text to search for" },
        n_results: {
          type: "integer",
          description: "Number of results to return per collection",
          default: 5
        },
        k_constant: {
          type: "number",
          description: "Constant for reciprocal rank fusion",
          default: 60.0
        },
        min_keyword_length: {
          type: "integer",
          description: "Minimum length for keyword tokens",
          default: 3
        }
      },
      required: ["text"]
    },
    category: "read",
    userMessage: (params) => {
      const text = (params["text"] as string) ?? "something";
      const msg = `Performing hybrid search for '${text}'...`;
      return msg.length > 80 ? "Performing hybrid search..." : msg;
    }
  },
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
  spec: {
    name: "vector_recursive_split_and_index",
    description:
      "Split text into chunks recursively and index them into a vector database collection",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The text content to split and index"
        },
        document_id: {
          type: "string",
          description: "Base identifier for the source document"
        },
        chunk_size: {
          type: "integer",
          description: "Maximum size of each chunk in characters",
          default: 1000
        },
        chunk_overlap: {
          type: "integer",
          description: "Number of characters to overlap between chunks",
          default: 200
        },
        separators: {
          type: "array",
          items: { type: "string" },
          description: "List of separators for recursive splitting",
          default: ["\n\n", "\n", "."]
        },
        metadata: {
          type: "object",
          description: "Additional metadata to associate with all chunks",
          default: {}
        }
      },
      required: ["text", "document_id"]
    },
    category: "write",
    userMessage: (params) => {
      const sourceId = (params["source_id"] as string) ?? "a source";
      const msg = `Recursively splitting and indexing text from ${sourceId}...`;
      return msg.length > 80
        ? "Recursively splitting and indexing text..."
        : msg;
    }
  },
  impl: async (run, params) => {
    const collection = collectionOf(run);
    if (!collection) return noCollectionError("split and index text");
    const text = params["text"] as string;
    const documentId = params["document_id"] as string;
    const baseMetadata = (params["metadata"] as Record<string, unknown>) ?? {};
    const chunkSize = (params["chunk_size"] as number) ?? 1000;
    const chunkOverlap = (params["chunk_overlap"] as number) ?? 200;
    let separators = (params["separators"] as string[]) ?? ["\n\n", "\n", "."];
    if (typeof separators === "string") separators = [separators];

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
  spec: {
    name: "vector_markdown_split_and_index",
    description:
      "Split markdown text into chunks based on headers and index them into a vector database collection",
    inputSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The path to the markdown file to split and index"
        },
        text: {
          type: "string",
          description: "Raw markdown content if no file_path provided"
        },
        chunk_size: {
          type: "integer",
          description: "Maximum size of each chunk in characters",
          default: 1000
        },
        chunk_overlap: {
          type: "integer",
          description: "Number of characters to overlap between chunks",
          default: 200
        }
      },
      required: []
    },
    category: "write",
    userMessage: (params) => {
      const sourceId = (params["source_id"] as string) ?? "a source";
      const msg = `Splitting and indexing Markdown from ${sourceId}...`;
      return msg.length > 80 ? "Splitting and indexing Markdown..." : msg;
    }
  },
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

const vectorBatchIndex: CapabilityExport = {
  spec: {
    name: "vector_batch_index",
    description:
      "Index a batch of text chunks into a vector database collection",
    inputSchema: {
      type: "object",
      properties: {
        chunks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              source_id: { type: "string" },
              metadata: { type: "object", default: {} }
            },
            required: ["text", "source_id"]
          },
          description: "List of text chunks to index"
        },
        base_metadata: {
          type: "object",
          description: "Base metadata to add to all chunks",
          default: {}
        }
      },
      required: ["chunks"]
    },
    category: "write",
    userMessage: (params) => {
      const chunks = (params["chunks"] as unknown[]) ?? [];
      return `Indexing a batch of ${chunks.length} text chunks...`;
    }
  },
  impl: async (run, params) => {
    const collection = collectionOf(run);
    if (!collection) return noCollectionError("index a batch of chunks");
    let chunks = params["chunks"] as Array<{
      text?: string;
      source_id?: string;
      metadata?: Record<string, unknown>;
    }>;
    if (typeof chunks === "string")
      chunks = [chunks as unknown as (typeof chunks)[0]];
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
export const COLLECTION_CAPABILITIES: readonly CapabilityExport[] = [
  listCollections,
  queryCollection,
  vectorTextSearch,
  vectorIndex,
  vectorHybridSearch,
  vectorRecursiveSplitAndIndex,
  vectorMarkdownSplitAndIndex,
  vectorBatchIndex
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
  vectorBatchIndex
};
