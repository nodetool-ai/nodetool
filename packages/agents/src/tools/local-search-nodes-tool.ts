/**
 * LocalSearchNodesTool — namespace-aware search over the NodeRegistry.
 *
 * Hides provider-specific nodes (`openai.*`, `anthropic.*`, etc.) by default
 * so the agent reaches for `nodetool.*` core nodes first. Set
 * `include_provider_nodes: true` only when the user explicitly named a
 * provider.
 */

import type { ProcessingContext } from "@nodetool/runtime";
import type { NodeRegistry, NodeMetadata } from "@nodetool/node-sdk";
import { rankNodeMetadata } from "@nodetool/node-sdk";
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

interface CompactSearchResult {
  type: string;
  title: string;
  description: string;
  score: number;
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ name: string; type: string }>;
}

function toCompact(meta: NodeMetadata, score: number): CompactSearchResult {
  return {
    type: meta.node_type,
    title: meta.title,
    description: firstSentence(meta.description),
    score,
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
        "Search terms matched against title, node_type, namespace, and description."
    },
    n_results: {
      type: "number" as const,
      description: "Maximum number of results to return (default 10).",
      default: 10
    },
    namespace: {
      type: "string" as const,
      description:
        "Optional namespace prefix to scope the search (e.g. 'nodetool.control')."
    },
    input_type: {
      type: "string" as const,
      description: "Optional filter: only nodes that accept this input type."
    },
    output_type: {
      type: "string" as const,
      description: "Optional filter: only nodes that emit this output type."
    },
    include_provider_nodes: {
      type: "boolean" as const,
      description:
        "Include provider-specific nodes (openai.*, anthropic.*, etc.) in results. Set to true ONLY when the user explicitly named a provider. Default: false.",
      default: false
    }
  },
  required: ["query"] as string[]
};

export class LocalSearchNodesTool extends Tool {
  readonly name = "search_nodes";
  readonly description =
    "Search for available nodes by keyword. Provider-specific nodes are hidden by default — set include_provider_nodes:true only when the user named a provider. Use namespace to scope to e.g. 'nodetool.control'.";
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
    const namespace = params["namespace"] as string | undefined;
    const includeProviderNodes = params["include_provider_nodes"] === true;

    if (queryArr.length === 0) {
      return { status: "error", errors: ["query must be a non-empty array"] };
    }

    const allMetadata = this.registry.listMetadata();
    let ranked = rankNodeMetadata(allMetadata, queryArr, {
      includeProviderNodes,
      namespacePrefix: namespace
    });

    if (inputType) {
      ranked = ranked.filter(({ meta }) =>
        meta.properties.some(
          (p: NodeMetadata["properties"][number]) =>
            typeMetaToString(p.type).toLowerCase() === inputType.toLowerCase()
        )
      );
    }

    if (outputType) {
      ranked = ranked.filter(({ meta }) =>
        meta.outputs.some(
          (o: NodeMetadata["outputs"][number]) =>
            typeMetaToString(o.type).toLowerCase() === outputType.toLowerCase()
        )
      );
    }

    const limited = ranked.slice(0, maxResults);
    return {
      total: ranked.length,
      results: limited.map(({ meta, score }) => toCompact(meta, score))
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const query = (params["query"] as string[]) ?? [];
    return `Searching for nodes: ${query.join(", ")}`;
  }
}
