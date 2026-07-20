/**
 * AddNodeTool -- planner tool that adds a node to the graph being built.
 *
 * The LLM calls this to add either:
 * - A deterministic workflow node (type from NodeRegistry)
 * - An LLM step node (type: "nodetool.agents.Agent", model omitted)
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { Tool } from "./base-tool.js";
import { type GraphBuilder } from "../graph-builder.js";
import { normalizeModelProperties } from "../normalize-model-properties.js";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.agents.add-node-tool");

const ADD_NODE_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    id: {
      type: "string" as const,
      description: "Unique identifier for this node (snake_case recommended)"
    },
    type: {
      type: "string" as const,
      description:
        'Fully-qualified node type from registry, e.g. "nodetool.agents.Agent" for LLM-driven steps'
    },
    node_properties: {
      type: "object" as const,
      description:
        'Configuration values for the node. Example: {"value": "Hello World"} for a String constant, ' +
        '{"delimiter": " "} for a Split node. Use get_node_info to see available properties. ' +
        "Pass {} if no configuration is needed (e.g. the node only receives input via edges)."
    },
    name: {
      type: "string" as const,
      description: "Optional human-readable name for the node"
    }
  },
  required: ["id", "type"] as string[],
  additionalProperties: true as const
};

export class AddNodeTool extends Tool {
  readonly name = "add_node";
  readonly description =
    "Add a node to the workflow graph. Set node configuration either via node_properties object " +
    "or as direct parameters (e.g. value: \"Hello World\" for a String constant). " +
    'Use a registry node type for deterministic work, or "nodetool.agents.Agent" for LLM reasoning.';
  readonly jsonSchema: Record<string, unknown> = ADD_NODE_INPUT_SCHEMA;

  constructor(
    private readonly builder: GraphBuilder,
    private readonly registry: NodeRegistry
  ) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const id = params["id"] as string | undefined;
    const type = params["type"] as string | undefined;
    const name = params["name"] as string | undefined;

    // Accept properties from node_properties, properties, or any extra params
    const knownKeys = new Set(["id", "type", "name", "node_properties", "properties"]);
    const extraProps: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      if (!knownKeys.has(k)) {
        extraProps[k] = v;
      }
    }
    const properties = (params["node_properties"] as Record<string, unknown>) ??
      (params["properties"] as Record<string, unknown>) ??
      (Object.keys(extraProps).length > 0 ? extraProps : {});

    log.debug("add_node", { id, type, properties });

    if (!id || typeof id !== "string") {
      return { status: "error", errors: ["id must be a non-empty string."] };
    }
    if (!type || typeof type !== "string") {
      return { status: "error", errors: ["type must be a non-empty string."] };
    }

    // Validate node type
    if (!this.registry.has(type)) {
      // Check loaded metadata for Python-only nodes
      const meta = this.registry.getMetadata(type);
      if (!meta) {
        return {
          status: "error",
          errors: [
            `Unknown node type: '${type}'. Use search_nodes to find available types.`
          ]
        };
      }
    }

    const errors = this.builder.addNode(
      id,
      type,
      normalizeModelProperties(type, properties, this.registry),
      name
    );
    if (errors.length > 0) {
      // Add an actionable hint to the duplicate-id error so the planner does
      // not bang the same id back into add_node. Wiring data into an existing
      // node is done via add_edge, not by re-adding.
      const annotated = errors.map((e) =>
        e.startsWith("Duplicate node id:")
          ? `${e} The node already exists — to wire data into it use add_edge. To create a separate node, pick a different id.`
          : e
      );
      return { status: "error", errors: annotated };
    }

    // Success. Properties left at defaults are fine — they get overridden by
    // edges or stay at the registry default. We deliberately do NOT emit a
    // "warning" or "remove-and-re-add" hint here: the planner LLM treats any
    // such field as a failure signal and retries with the same id, which then
    // hits the duplicate-id error and starves the loop.
    return {
      status: "node_added",
      id,
      type,
      properties_set: Object.keys(properties),
      total_nodes: this.builder.nodeCount
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const id = params["id"] ?? "?";
    const type = params["type"] ?? "?";
    return `Adding node: ${id} (${type})`;
  }
}
