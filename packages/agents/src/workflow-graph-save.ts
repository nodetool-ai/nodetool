/**
 * The checks a workflow graph passes before it is stored.
 *
 * `create_workflow` and `update_workflow` run them on the graph an agent
 * authored, and the project folder sync runs them on the graph of a
 * `.workflow.json` file a person or an agent edited. One implementation, so a
 * file edit cannot store a graph the tools would refuse and both report a
 * refused graph with the same error.
 */
import { isEditorOnlyType, type NodeRegistry } from "@nodetool-ai/node-sdk";
import { pruneGraphLinks, type GraphLink } from "@nodetool-ai/protocol";
import { declareDynamicOutputsInGraph } from "./dynamic-slots.js";
import {
  RUNTIME_MODEL_CATALOGS,
  leftoverWiringHandleError,
  modelSelectionError,
  normalizeWorkflowGraph,
  type ModelCatalogs
} from "./tools/mcp-tool-support.js";
import { isObjectLike, isString } from "./utils/type-guards.js";

export interface WorkflowGraphSaveOptions {
  /**
   * The node registry of the host. Without one, unknown node types are not
   * checked and dynamic outputs are not declared.
   */
  nodeRegistry?: NodeRegistry;
  /** The provider and model catalogs. Defaults to the runtime's. */
  modelCatalogs?: ModelCatalogs;
  /**
   * The graph the workflow holds now. A replacement graph that names no
   * `links` keeps the links of this one.
   */
  stored?: unknown;
  /**
   * Keep the layout the graph came with. The agent tools lay every node out
   * anew, because an authored graph carries no layout. A workflow file does:
   * a node that has a position keeps its `ui_properties` as written, and only
   * a node without one is placed.
   */
  keepLayout?: boolean;
}

/** A graph ready to store, or the error that refuses it. */
export type WorkflowGraphSaveResult =
  | { ok: true; graph: unknown }
  | { ok: false; error: Record<string, unknown> };

/** The ids of the nodes in `graph`. */
export function graphNodeIds(graph: unknown): Set<string> {
  const nodes = isObjectLike(graph)
    ? (graph as { nodes?: unknown }).nodes
    : undefined;
  const ids = new Set<string>();
  if (Array.isArray(nodes)) {
    for (const node of nodes) {
      const id = isObjectLike(node) ? (node as { id?: unknown }).id : undefined;
      if (isString(id)) ids.add(id);
    }
  }
  return ids;
}

/** The lineage links of `graph`. */
export function graphLinks(graph: unknown): GraphLink[] {
  const links = isObjectLike(graph)
    ? (graph as { links?: unknown }).links
    : undefined;
  return Array.isArray(links) ? (links as GraphLink[]) : [];
}

/**
 * A replacement graph that names no `links` keeps the stored ones, so a
 * rewrite of nodes and edges does not silently erase lineage. Links to nodes
 * the new graph no longer has are dropped either way.
 */
export function withStoredLinks(graph: unknown, stored: unknown): unknown {
  if (!isObjectLike(graph)) return graph;
  const record = graph as Record<string, unknown>;
  const links = pruneGraphLinks(
    graphNodeIds(record),
    "links" in record ? graphLinks(record) : graphLinks(stored)
  );
  const { links: _dropped, ...rest } = record;
  return links.length > 0 ? { ...rest, links } : rest;
}

function hasPosition(node: Record<string, unknown>): boolean {
  const ui = node["ui_properties"];
  const position = isObjectLike(ui)
    ? (ui as { position?: unknown }).position
    : undefined;
  return (
    isObjectLike(position) &&
    Number.isFinite((position as { x?: unknown }).x) &&
    Number.isFinite((position as { y?: unknown }).y)
  );
}

/**
 * `normalized` with the `ui_properties` of every node that had a position in
 * `authored`, as it was written there.
 */
function withAuthoredLayout(normalized: unknown, authored: unknown): unknown {
  if (!isObjectLike(normalized) || !isObjectLike(authored)) return normalized;
  const record = normalized as Record<string, unknown>;
  const authoredNodes = (authored as { nodes?: unknown }).nodes;
  const nodes = record["nodes"];
  if (!Array.isArray(nodes) || !Array.isArray(authoredNodes)) return normalized;
  const placed = new Map<string, unknown>();
  for (const node of authoredNodes) {
    if (!isObjectLike(node)) continue;
    const written = node as Record<string, unknown>;
    if (isString(written["id"]) && hasPosition(written)) {
      placed.set(written["id"], written["ui_properties"]);
    }
  }
  return {
    ...record,
    nodes: nodes.map((node) => {
      if (!isObjectLike(node)) return node;
      const id = (node as { id?: unknown }).id;
      return isString(id) && placed.has(id)
        ? { ...(node as Record<string, unknown>), ui_properties: placed.get(id) }
        : node;
    })
  };
}

/**
 * Refuse a graph that names a node type nothing can run: a node with no
 * type, or a type the registry does not have as an installed node, a Python
 * node, or a node of a pack that can be installed. Editor-only nodes
 * (comments, groups, reroutes) have no class and are not refused.
 *
 * Such a node fails the run that reaches it, after the nodes before it ran.
 */
export function unknownNodeTypeError(
  graph: unknown,
  registry: Pick<NodeRegistry, "availability">
): Record<string, unknown> | null {
  if (!isObjectLike(graph)) return null;
  const nodes = (graph as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return null;
  const issues: Array<Record<string, unknown>> = [];
  for (const raw of nodes) {
    if (!isObjectLike(raw)) continue;
    const node = raw as Record<string, unknown>;
    const id = String(node["id"] ?? "");
    const type = isString(node["type"]) ? node["type"] : "";
    if (!type) {
      issues.push({
        code: "unknown_node",
        node_id: id,
        message: `Node "${id}" has no type`
      });
    } else if (
      registry.availability(type) === "unknown" &&
      !isEditorOnlyType(type)
    ) {
      issues.push({
        code: "unknown_node",
        node_id: id,
        node_type: type,
        message: `Unknown node type "${type}" on node "${id}"`
      });
    }
  }
  if (issues.length === 0) return null;
  return {
    error:
      "The graph names node types that do not exist. Use search_nodes to " +
      "find the node type and retry.",
    issues
  };
}

/**
 * Bring an authored graph into the stored shape and check it. The passes run
 * in this order: declare dynamic outputs, normalize to the stored shape, keep
 * the stored links, then refuse unknown node types, providers or models the
 * runtime cannot honour, and wiring handles left in property values.
 */
export async function prepareWorkflowGraphForSave(
  authored: unknown,
  options: WorkflowGraphSaveOptions = {}
): Promise<WorkflowGraphSaveResult> {
  const { nodeRegistry } = options;
  const declared = nodeRegistry
    ? declareDynamicOutputsInGraph(authored, nodeRegistry)
    : authored;
  const laidOut = normalizeWorkflowGraph(declared);
  const normalized = options.keepLayout
    ? withAuthoredLayout(laidOut, declared)
    : laidOut;
  const graph =
    "stored" in options
      ? withStoredLinks(normalized, options.stored)
      : normalized;
  const error =
    (nodeRegistry ? unknownNodeTypeError(graph, nodeRegistry) : null) ??
    (await modelSelectionError(
      graph,
      options.modelCatalogs ?? RUNTIME_MODEL_CATALOGS
    )) ??
    leftoverWiringHandleError(graph);
  return error ? { ok: false, error } : { ok: true, graph };
}
