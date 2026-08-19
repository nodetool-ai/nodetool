/**
 * The `collections` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `collections.ts`, so nothing the
 * implementations pull in reaches the entry graph. `collections.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";

export const QUERY_COLLECTION_SCHEMA: JsonSchema = {
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

export const listCollectionsSpec: CapabilitySpec = {
  name: "list_collections",
  description:
    "List the available knowledge collections (vector stores) the user has. " +
    "Use this to discover what you can search before calling query_collection.",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  },
  category: "read",
  userMessage: () => "Listing knowledge collections"
};

export const queryCollectionSpec: CapabilitySpec = {
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
};

export const vectorTextSearchSpec: CapabilitySpec = {
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
};

export const vectorIndexSpec: CapabilitySpec = {
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
};

export const vectorHybridSearchSpec: CapabilitySpec = {
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
};

export const vectorRecursiveSplitAndIndexSpec: CapabilitySpec = {
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
    return msg.length > 80 ? "Recursively splitting and indexing text..." : msg;
  }
};

export const vectorMarkdownSplitAndIndexSpec: CapabilitySpec = {
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
};

export const vectorBatchIndexSpec: CapabilitySpec = {
  name: "vector_batch_index",
  description: "Index a batch of text chunks into a vector database collection",
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
};

export const createCollectionSpec: CapabilitySpec = {
  name: "create_collection",
  description:
    "Create an empty vector collection to index documents into. The " +
    "collection records you as its owner, so other users of this install " +
    "cannot delete it. Pick the embedding model with find_model when you " +
    "need one other than the default.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          "Collection name. No path separators, control characters or surrounding whitespace."
      },
      embedding_model: {
        type: "string",
        description: "Embedding model id, e.g. all-minilm:latest"
      },
      embedding_provider: {
        type: "string",
        description: "Provider serving the embedding model, e.g. ollama"
      }
    },
    required: ["name"]
  },
  category: "write",
  userMessage: (params) => `Creating collection ${params["name"]}`
};

export const deleteCollectionSpec: CapabilitySpec = {
  name: "delete_collection",
  description:
    "Delete a vector collection and everything indexed in it. Irreversible. " +
    "A collection owned by another user is refused.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The collection to delete" }
    },
    required: ["name"]
  },
  category: "write",
  userMessage: (params) => `Deleting collection ${params["name"]}`
};

/** Every spec this module declares, in declaration order. */
export const collectionsSpecs: readonly CapabilitySpec[] = [
  listCollectionsSpec,
  queryCollectionSpec,
  vectorTextSearchSpec,
  vectorIndexSpec,
  vectorHybridSearchSpec,
  vectorRecursiveSplitAndIndexSpec,
  vectorMarkdownSplitAndIndexSpec,
  vectorBatchIndexSpec,
  createCollectionSpec,
  deleteCollectionSpec
];
