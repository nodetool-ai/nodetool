/**
 * LocalGetNodeInfoTool -- get full metadata for a specific node type.
 *
 * Local version of GetNodeInfoTool (from mcp-tools.ts) that queries
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

const GET_NODE_INFO_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    node_type: {
      type: "string" as const,
      description:
        "Fully-qualified node type (e.g. 'nodetool.text.Concat')"
    }
  },
  required: ["node_type"] as string[]
};

export class LocalGetNodeInfoTool extends Tool {
  readonly name = "get_node_info";
  readonly description =
    "Get detailed metadata for a node type including all inputs, outputs, types, and defaults. " +
    "Use this before add_node to verify exact property names and types.";
  readonly inputSchema: Record<string, unknown> = GET_NODE_INFO_INPUT_SCHEMA;

  constructor(private readonly registry: NodeRegistry) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const nodeType = params["node_type"] as string | undefined;
    if (!nodeType) {
      return { status: "error", errors: ["node_type is required"] };
    }

    const meta = this.registry.getMetadata(nodeType);
    if (!meta) {
      return {
        status: "error",
        errors: [
          `Node type '${nodeType}' not found. Use search_nodes to find available types.`
        ]
      };
    }

    return {
      node_type: meta.node_type,
      title: meta.title,
      description: meta.description,
      namespace: meta.namespace,
      properties: meta.properties.map((p: NodeMetadata["properties"][number]) => ({
        name: p.name,
        type: typeMetaToString(p.type),
        default: p.default,
        description: p.description ?? undefined,
        required: p.required ?? false,
        min: p.min ?? undefined,
        max: p.max ?? undefined,
        values: p.values ?? undefined
      })),
      outputs: meta.outputs.map((o: NodeMetadata["outputs"][number]) => ({
        name: o.name,
        type: typeMetaToString(o.type)
      })),
      is_streaming_output: meta.is_streaming_output ?? false,
      is_streaming_input: meta.is_streaming_input ?? false,
      required_settings: meta.required_settings ?? [],
      required_runtimes: meta.required_runtimes ?? []
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Getting info for node type ${params["node_type"]}`;
  }
}
