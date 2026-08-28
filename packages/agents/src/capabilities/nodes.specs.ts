/**
 * The `nodes` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `nodes.ts`, so nothing the
 * implementations pull in reaches the entry graph. `nodes.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";

export const LIST_NODES_INPUT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    namespace: {
      type: "string",
      description:
        "Optional namespace prefix filter (e.g. 'nodetool.text', 'lib.image')"
    },
    limit: {
      type: "number",
      description: "Maximum number of nodes to return (default 50)",
      default: 50
    }
  },
  required: []
};

export const SEARCH_NODES_INPUT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "array",
      items: { type: "string" },
      description:
        "Search terms matched against title, node_type, namespace, and description. Pass an array; a single string is read as one term."
    },
    n_results: {
      type: "number",
      description: "Maximum number of results to return (default 10).",
      default: 10
    },
    namespace: {
      type: "string",
      description:
        "Optional namespace prefix to scope the search (e.g. 'nodetool.control')."
    },
    input_type: {
      type: "string",
      description: "Optional filter: only nodes that accept this input type."
    },
    output_type: {
      type: "string",
      description: "Optional filter: only nodes that emit this output type."
    },
    include_provider_nodes: {
      type: "boolean",
      description:
        "Include provider-specific nodes (openai.*, anthropic.*, etc.) in results. Set to true ONLY when the user explicitly named a provider. Default: false.",
      default: false
    }
  },
  required: ["query"]
};

export const GET_NODE_INFO_INPUT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    node_type: {
      type: "string",
      description: "Fully-qualified node type (e.g. 'nodetool.text.Concat')"
    }
  },
  required: ["node_type"]
};

export const listNodesSpec: CapabilitySpec = {
  name: "list_nodes",
  description:
    "List available node types, optionally filtered by namespace. " +
    "Use this to browse what deterministic nodes are available. A namespace " +
    "no node uses answers with the namespaces that do exist — not an empty " +
    "list.",
  inputSchema: LIST_NODES_INPUT_SCHEMA,
  category: "read",
  userMessage: (params) => {
    const ns = params["namespace"];
    return ns ? `Listing nodes in namespace ${ns}` : "Listing available nodes";
  }
};

export const searchNodesSpec: CapabilitySpec = {
  name: "search_nodes",
  description:
    "Search for available nodes by keyword. Provider-specific nodes are hidden by default — set include_provider_nodes:true only when the user named a provider. Use namespace to scope to e.g. 'nodetool.control'.",
  inputSchema: SEARCH_NODES_INPUT_SCHEMA,
  category: "read",
  userMessage: (params) => {
    const query = params["query"];
    const terms = Array.isArray(query) ? query.join(", ") : String(query ?? "");
    return `Searching for nodes: ${terms}`;
  }
};

export const getNodeInfoSpec: CapabilitySpec = {
  name: "get_node_info",
  description:
    "Get detailed metadata for a node type including all inputs, outputs, types, and defaults. " +
    "Use this before add_node to verify exact property names and types.",
  inputSchema: GET_NODE_INFO_INPUT_SCHEMA,
  category: "read",
  userMessage: (params) => `Getting info for node type ${params["node_type"]}`
};

/** Every spec this module declares, in declaration order. */
export const nodesSpecs: readonly CapabilitySpec[] = [
  listNodesSpec,
  searchNodesSpec,
  getNodeInfoSpec
];
