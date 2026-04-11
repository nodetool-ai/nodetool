/**
 * LocalSearchNodesTool -- search the NodeRegistry by keyword.
 *
 * Local version of SearchNodesTool (from mcp-tools.ts) that queries
 * the registry directly instead of via REST API.
 */

import type { ProcessingContext } from "@nodetool/runtime";
import type { NodeRegistry, NodeMetadata } from "@nodetool/node-sdk";
import { Tool } from "./base-tool.js";

function typeMetaToString(
  tm: NodeMetadata["properties"][number]["type"]
): string {
  const args = (tm.type_args ?? []).map(typeMetaToString).filter(Boolean);
  return args.length > 0 ? `${tm.type}[${args.join(", ")}]` : tm.type;
}

function firstSentence(text: string): string {
  const dot = text.indexOf(".");
  if (dot > 0 && dot < 120) return text.slice(0, dot + 1);
  return text.length > 120 ? text.slice(0, 117) + "..." : text;
}

function matchesQuery(meta: NodeMetadata, terms: string[]): boolean {
  const haystack = [
    meta.node_type,
    meta.title,
    meta.description,
    meta.namespace
  ]
    .join(" ")
    .toLowerCase();

  return terms.every((term) => haystack.includes(term.toLowerCase()));
}

interface CompactSearchResult {
  type: string;
  title: string;
  description: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ name: string; type: string }>;
}

function toCompact(meta: NodeMetadata): CompactSearchResult {
  return {
    type: meta.node_type,
    title: meta.title,
    description: firstSentence(meta.description),
    inputs: meta.properties.map((p: NodeMetadata["properties"][number]) => ({
      name: p.name,
      type: typeMetaToString(p.type)
    })),
    outputs: meta.outputs.map((o: NodeMetadata["outputs"][number]) => ({
      name: o.name,
      type: typeMetaToString(o.type)
    }))
  };
}

const SEARCH_NODES_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    query: {
      type: "array" as const,
      items: { type: "string" as const },
      description:
        "Search terms to match against node type, title, and description"
    },
    n_results: {
      type: "number" as const,
      description: "Maximum number of results to return (default 10)",
      default: 10
    },
    input_type: {
      type: "string" as const,
      description: "Optional filter: only nodes with this input type"
    },
    output_type: {
      type: "string" as const,
      description: "Optional filter: only nodes with this output type"
    }
  },
  required: ["query"] as string[]
};

export class LocalSearchNodesTool extends Tool {
  readonly name = "search_nodes";
  readonly description =
    "Search for available nodes by keyword. Use this to find deterministic nodes before building the graph.";
  readonly inputSchema: Record<string, unknown> = SEARCH_NODES_INPUT_SCHEMA;

  constructor(private readonly registry: NodeRegistry) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const queryArr = (params["query"] as string[]) ?? [];
    const maxResults =
      typeof params["n_results"] === "number" ? params["n_results"] : 10;
    const inputType = params["input_type"] as string | undefined;
    const outputType = params["output_type"] as string | undefined;

    if (queryArr.length === 0) {
      return { status: "error", errors: ["query must be a non-empty array"] };
    }

    const allMetadata = this.registry.listMetadata();
    let results = allMetadata.filter((meta: NodeMetadata) => matchesQuery(meta, queryArr));

    if (inputType) {
      results = results.filter((meta: NodeMetadata) =>
        meta.properties.some(
          (p: NodeMetadata["properties"][number]) =>
            typeMetaToString(p.type).toLowerCase() === inputType.toLowerCase()
        )
      );
    }

    if (outputType) {
      results = results.filter((meta: NodeMetadata) =>
        meta.outputs.some(
          (o: NodeMetadata["outputs"][number]) =>
            typeMetaToString(o.type).toLowerCase() === outputType.toLowerCase()
        )
      );
    }

    const limited = results.slice(0, maxResults);
    return {
      total: results.length,
      results: limited.map(toCompact)
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const query = (params["query"] as string[]) ?? [];
    return `Searching for nodes: ${query.join(", ")}`;
  }
}
