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
  getNodeInfoSpec
} from "./nodes.specs.js";
import {
  isFunction,
  isNonBlankString,
  isNumber,
  isString
} from "../utils/type-guards.js";

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

/**
 * The search terms a `query` argument names.
 *
 * The schema says `string[]`, and a model that sends the bare string
 * `"serpapi"` used to have it accepted: a string is iterable, so the scorer
 * walked it one **character** at a time and every node containing an "s", an
 * "e" or an "r" scored. `search_nodes({query: "serpapi"})` answered with 322
 * matches led by `CompareImages` at 133 — noise indistinguishable from a
 * ranked answer, and no way for the caller to tell it had passed the wrong
 * shape. A lone string is one term now, and anything else is refused by name.
 *
 * Returns `null` when the argument names no usable term.
 */
function searchTerms(raw: unknown): string[] | null {
  const values = isString(raw) ? [raw] : Array.isArray(raw) ? raw : null;
  if (values === null) return null;
  const terms = values.filter(isNonBlankString).map((term) => term.trim());
  return terms.length > 0 ? terms : null;
}

/** Namespaces nearest to one the registry does not have, best first. */
function nearestNamespaces(
  wanted: string,
  available: readonly string[]
): string[] {
  const target = wanted.toLowerCase();
  const head = target.split(".")[0] ?? target;
  const scored = available
    .map((namespace) => {
      const lower = namespace.toLowerCase();
      let score = 0;
      if (lower.startsWith(target) || target.startsWith(lower)) score += 3;
      if (lower.includes(head) || head.includes(lower.split(".")[0] ?? "")) {
        score += 1;
      }
      return { namespace, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : a.namespace.localeCompare(b.namespace)
    );
  return scored.slice(0, 12).map((entry) => entry.namespace);
}

const listNodes: CapabilityExport = {
  spec: listNodesSpec,
  impl: async (run: CapabilityRun, params) => {
    const registry = run.nodeRegistry;
    if (!registry) return noRegistryError("list node types");

    const namespace = isNonBlankString(params["namespace"])
      ? params["namespace"].trim()
      : undefined;
    const limit = isNumber(params["limit"]) ? params["limit"] : 50;

    const everything = registry.listMetadata();
    const allMetadata =
      namespace === undefined
        ? everything
        : everything.filter(
            (m: NodeMetadata) =>
              m.namespace === namespace ||
              m.namespace.startsWith(namespace + ".") ||
              m.node_type.startsWith(namespace + ".")
          );

    // A namespace the registry does not have used to answer `{total: 0,
    // namespaces: {}, nodes: []}` — indistinguishable from a namespace that
    // exists and is empty, and a dead end either way. Name the miss and hand
    // back the namespaces that do exist.
    if (namespace !== undefined && allMetadata.length === 0) {
      const known = [...new Set(everything.map((m) => m.namespace))].sort();
      const near = nearestNamespaces(namespace, known);
      return {
        total: 0,
        namespaces: {},
        nodes: [],
        note:
          `No node type is registered under namespace '${namespace}'. ` +
          (near.length > 0
            ? `Closest namespaces: ${near.join(", ")}. `
            : "") +
          `Call list_nodes with no namespace to see all ${known.length}, or ` +
          `search_nodes to find a node by keyword.`,
        available_namespaces: near.length > 0 ? near : known.slice(0, 40)
      };
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

    const queryArr = searchTerms(params["query"]);
    const maxResults =
      isNumber(params["n_results"]) ? params["n_results"] : 10;
    const inputType = params["input_type"] as string | undefined;
    const outputType = params["output_type"] as string | undefined;
    const namespace = params["namespace"] as string | undefined;
    const includeProviderNodes = params["include_provider_nodes"] === true;

    if (queryArr === null) {
      return {
        status: "error",
        errors: [
          "query must be a search string or a non-empty array of them, " +
            'e.g. ["web search"] or "web search".'
        ]
      };
    }

    const scoreOptions: ScoreOptions = {
      includeProviderNodes,
      namespacePrefix: namespace
    };
    // Prefer the registry's memoized index; fall back to a one-shot rank for
    // structural mocks that only implement `listMetadata`.
    const indexed = registry;
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

    if (ranked.length === 0) {
      return {
        total: 0,
        results: [],
        // A bare empty list reads as "NodeTool cannot do this", and the model
        // goes on guessing node types. Say which of the two filters that are
        // on by default could be hiding the answer, and where else to look.
        note:
          `No node matched ${queryArr.map((t) => `'${t}'`).join(", ")}. ` +
          (includeProviderNodes
            ? ""
            : "Provider nodes (openai.*, fal.*, kie.*, xai.*, …) are hidden " +
              "unless include_provider_nodes is true. ") +
          "Try fewer or broader terms, or list_nodes to browse namespaces. " +
          "Some surfaces are capability modules rather than nodes — a Code " +
          "node importing @nodetool-ai/sandbox-nodetool/<module> reaches " +
          "those."
      };
    }
    return {
      total: ranked.length,
      results: ranked
        .slice(0, maxResults)
        .map(({ meta, score }) => toCompact(meta, score))
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
