/**
 * AddNodeTool -- planner tool that adds a node to the graph being built.
 *
 * The LLM calls this to add either:
 * - A deterministic workflow node (type from NodeRegistry)
 * - An agent step node (type: "nodetool.agents.AgentStep")
 */

import type { ProcessingContext } from "@nodetool/runtime";
import type { NodeRegistry } from "@nodetool/node-sdk";
import { Tool } from "./base-tool.js";
import { AGENT_STEP_NODE_TYPE, type GraphBuilder } from "../graph-builder.js";
import { createLogger } from "@nodetool/config";

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
        'Fully-qualified node type from registry, or "nodetool.agents.AgentStep" for LLM-driven steps'
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
    'Use a registry node type for deterministic work, or "nodetool.agents.AgentStep" for LLM reasoning.';
  readonly inputSchema: Record<string, unknown> = ADD_NODE_INPUT_SCHEMA;

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
    const isAgentStep = type === AGENT_STEP_NODE_TYPE;
    if (!isAgentStep && !this.registry.has(type)) {
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

    // Validate agent step properties
    if (isAgentStep) {
      const instructions = properties["instructions"];
      if (!instructions || typeof instructions !== "string") {
        return {
          status: "error",
          errors: [
            'AgentStep nodes require an "instructions" property (non-empty string).'
          ]
        };
      }
    }

    const errors = this.builder.addNode(id, type, properties, name);
    if (errors.length > 0) {
      return { status: "error", errors };
    }

    // Include set properties in response and warn if none were set
    const propsSet = Object.keys(properties);
    const meta = !isAgentStep ? this.registry.getMetadata(type) : null;
    const configurableProps = meta?.properties
      ?.filter((p: { name: string }) => p.name !== "text" && p.name !== "input") // skip edge-connected inputs
      ?.map((p: { name: string; default?: unknown }) => `${p.name} (default: ${JSON.stringify(p.default)})`) ?? [];

    const result: Record<string, unknown> = {
      status: "node_added",
      id,
      type,
      properties_set: propsSet,
      total_nodes: this.builder.nodeCount
    };

    if (propsSet.length === 0 && configurableProps.length > 0) {
      result["warning"] =
        `No node_properties were set. This node has configurable properties: [${configurableProps.join(", ")}]. ` +
        `If any need non-default values, remove this node and re-add with node_properties set.`;
    }

    return result;
  }

  userMessage(params: Record<string, unknown>): string {
    const id = params["id"] ?? "?";
    const type = params["type"] ?? "?";
    return `Adding node: ${id} (${type})`;
  }
}
