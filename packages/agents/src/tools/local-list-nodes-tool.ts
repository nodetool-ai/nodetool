/**
 * LocalListNodesTool -- list available node types from the registry.
 *
 * Local version of ListNodesTool (from mcp-tools.ts) that queries
 * the registry directly instead of via REST API.
 */

import type { ProcessingContext } from "@nodetool/runtime";
import type { NodeRegistry, NodeMetadata } from "@nodetool/node-sdk";
import { Tool } from "./base-tool.js";

function firstSentence(text: string): string {
  const dot = text.indexOf(".");
  if (dot > 0 && dot < 120) return text.slice(0, dot + 1);
  return text.length > 120 ? text.slice(0, 117) + "..." : text;
}

const LIST_NODES_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    namespace: {
      type: "string" as const,
      description:
        "Optional namespace prefix filter (e.g. 'nodetool.text', 'lib.image')"
    },
    limit: {
      type: "number" as const,
      description: "Maximum number of nodes to return (default 50)",
      default: 50
    }
  },
  required: [] as string[]
};

export class LocalListNodesTool extends Tool {
  readonly name = "list_nodes";
  readonly description =
    "List available node types, optionally filtered by namespace. " +
    "Use this to browse what deterministic nodes are available.";
  readonly inputSchema: Record<string, unknown> = LIST_NODES_INPUT_SCHEMA;

  constructor(private readonly registry: NodeRegistry) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const namespace = params["namespace"] as string | undefined;
    const limit =
      typeof params["limit"] === "number" ? params["limit"] : 50;

    let allMetadata = this.registry.listMetadata();

    if (namespace) {
      allMetadata = allMetadata.filter(
        (m: NodeMetadata) =>
          m.namespace === namespace ||
          m.namespace.startsWith(namespace + ".") ||
          m.node_type.startsWith(namespace + ".")
      );
    }

    // Group by namespace for overview
    const namespaces = new Map<string, number>();
    for (const m of allMetadata) {
      namespaces.set(m.namespace, (namespaces.get(m.namespace) ?? 0) + 1);
    }

    const limited = allMetadata.slice(0, limit);
    return {
      total: allMetadata.length,
      namespaces: Object.fromEntries(namespaces),
      nodes: limited.map((m: NodeMetadata) => ({
        type: m.node_type,
        title: m.title,
        description: firstSentence(m.description)
      }))
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const ns = params["namespace"];
    return ns ? `Listing nodes in namespace ${ns}` : "Listing available nodes";
  }
}
