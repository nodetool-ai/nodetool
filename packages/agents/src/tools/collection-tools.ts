/**
 * Collection discovery + query tools.
 *
 * These let the chat agent find and read knowledge collections on its own,
 * replacing the old client-side collection picker. Both are read-only.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";

interface CollectionSummary {
  name: string;
  count?: number;
  metadata?: Record<string, unknown>;
}

export class ListCollectionsTool extends Tool {
  readonly name = "list_collections";
  readonly description =
    "List the available knowledge collections (vector stores) the user has. " +
    "Use this to discover what you can search before calling query_collection.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {},
    required: [] as string[]
  };

  async process(
    _context: ProcessingContext,
    _params: Record<string, unknown>
  ): Promise<unknown> {
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

  userMessage(): string {
    return "Listing knowledge collections";
  }
}

export class QueryCollectionTool extends Tool {
  readonly name = "query_collection";
  readonly description =
    "Semantic search within a named knowledge collection. Returns the most " +
    "relevant document chunks. Call list_collections first if you don't know " +
    "the collection name.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      collection: {
        type: "string" as const,
        description: "Name of the collection to search"
      },
      query: {
        type: "string" as const,
        description: "The text to search for"
      },
      n_results: {
        type: "number" as const,
        description: "Maximum number of chunks to return",
        default: 5
      }
    },
    required: ["collection", "query"]
  };

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
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

  userMessage(params: Record<string, unknown>): string {
    const name = params["collection"];
    return name ? `Searching collection '${name}'` : "Searching collection";
  }
}
