/**
 * The `nodes` capability module — the node catalog an agent browses before it
 * builds a graph.
 *
 * Three capabilities that used to be three `Tool` subclasses:
 * `../tools/local-{list,search,get-node-info}-tool.ts`. The registry they took
 * as a required constructor argument is `run.nodeRegistry` now, which is
 * optional — a registry-free process (the multi-task planner, a unit test)
 * gets the same refusal every other registry-backed capability gives instead
 * of a constructor it cannot satisfy.
 *
 * `run_node` belongs to this namespace too, but it stays where it is: its
 * single-node runner is a closure only `packages/websocket` can build, so the
 * host supplies it through `createCapabilityRun`'s `capabilities` option.
 *
 * Design: docs/tool-class-retirement-design.md § "Migration" (`/nodes`).
 */

import type { JsonSchema } from "@nodetool-ai/runtime";
import type {
  NodeMetadata,
  ScoredNode,
  ScoreOptions
} from "@nodetool-ai/node-sdk";
import { noRegistryError } from "../tools/mcp-tool-support.js";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  listNodesSpec,
  searchNodesSpec,
  getNodeInfoSpec,
  LIST_NODES_INPUT_SCHEMA,
  SEARCH_NODES_INPUT_SCHEMA,
  GET_NODE_INFO_INPUT_SCHEMA
} from "./nodes.specs.js";
import { isFunction, isNumber } from "../utils/type-guards.js";

export {
  LIST_NODES_INPUT_SCHEMA,
  SEARCH_NODES_INPUT_SCHEMA,
  GET_NODE_INFO_INPUT_SCHEMA
} from "./nodes.specs.js";

function firstSentence(text: string): string {
  const dot = text.indexOf(".");
  if (dot > 0 && dot < 120) return text.slice(0, dot + 1);
  return text.length > 120 ? text.slice(0, 117) + "..." : text;
}

function typeMetaToString(
  tm: NodeMetadata["properties"][number]["type"]
): string {
  const args = (tm.type_args ?? []).map(typeMetaToString).filter(Boolean);
  return args.length > 0 ? `${tm.type}[${args.join(", ")}]` : tm.type;
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

const listNodes: CapabilityExport = {
  spec: listNodesSpec,
  impl: async (run: CapabilityRun, params) => {
    const registry = run.nodeRegistry;
    if (!registry) return noRegistryError("list node types");

    const namespace = params["namespace"] as string | undefined;
    const limit = isNumber(params["limit"]) ? params["limit"] : 50;

    let allMetadata = registry.listMetadata();

    if (namespace) {
      allMetadata = allMetadata.filter(
        (m: NodeMetadata) =>
          m.namespace === namespace ||
          m.namespace.startsWith(namespace + ".") ||
          m.node_type.startsWith(namespace + ".")
      );
    }

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
};

const searchNodes: CapabilityExport = {
  spec: searchNodesSpec,
  impl: async (run: CapabilityRun, params) => {
    const registry = run.nodeRegistry;
    if (!registry) return noRegistryError("search node types");

    const queryArr = (params["query"] as string[]) ?? [];
    const maxResults =
      isNumber(params["n_results"]) ? params["n_results"] : 10;
    const inputType = params["input_type"] as string | undefined;
    const outputType = params["output_type"] as string | undefined;
    const namespace = params["namespace"] as string | undefined;
    const includeProviderNodes = params["include_provider_nodes"] === true;

    if (queryArr.length === 0) {
      return { status: "error", errors: ["query must be a non-empty array"] };
    }

    const scoreOptions: ScoreOptions = {
      includeProviderNodes,
      namespacePrefix: namespace
    };
    // Prefer the registry's memoized index; fall back to a one-shot rank for
    // structural mocks that only implement `listMetadata`.
    const indexed = registry as {
      searchMetadata?: (
        terms: readonly string[],
        options?: ScoreOptions
      ) => ScoredNode[];
    };
    let ranked: ScoredNode[];
    if (isFunction(indexed.searchMetadata)) {
      ranked = indexed.searchMetadata(queryArr, scoreOptions);
    } else {
      const { rankNodeMetadata } = await import("@nodetool-ai/node-sdk");
      ranked = rankNodeMetadata(
        registry.listMetadata(),
        queryArr,
        scoreOptions
      );
    }

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
};

const getNodeInfo: CapabilityExport = {
  spec: getNodeInfoSpec,
  impl: async (run: CapabilityRun, params) => {
    const registry = run.nodeRegistry;
    if (!registry) return noRegistryError("read node metadata");

    const nodeType = params["node_type"] as string | undefined;
    if (!nodeType) {
      return { status: "error", errors: ["node_type is required"] };
    }

    const meta = registry.getMetadata(nodeType);
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
      properties: meta.properties.map(
        (p: NodeMetadata["properties"][number]) => ({
          name: p.name,
          type: typeMetaToString(p.type),
          default: p.default,
          description: p.description ?? undefined,
          required: p.required ?? false,
          min: p.min ?? undefined,
          max: p.max ?? undefined,
          values: p.values ?? undefined
        })
      ),
      outputs: meta.outputs.map((o: NodeMetadata["outputs"][number]) => ({
        name: o.name,
        type: typeMetaToString(o.type)
      })),
      supports_dynamic_inputs: meta.supports_dynamic_inputs ?? false,
      supports_dynamic_outputs: meta.supports_dynamic_outputs ?? false,
      is_streaming_output: meta.is_streaming_output ?? false,
      is_streaming_input: meta.is_streaming_input ?? false,
      required_settings: meta.required_settings ?? [],
      required_runtimes: meta.required_runtimes ?? []
    };
  }
};

/** Every node capability, in the order `getAllMcpTools` offered them. */
export const NODE_CAPABILITIES: readonly CapabilityExport[] = [
  listNodes,
  searchNodes,
  getNodeInfo
];

export const module: CapabilityModule = {
  module: "nodes",
  exports: NODE_CAPABILITIES
};

export { listNodes, searchNodes, getNodeInfo };
