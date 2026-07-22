/**
 * Headless bridge for the frontend tool-loop eval.
 *
 * The real frontend tools (`web/src/lib/tools/builtin/*`) mutate live zustand
 * stores and, for the editor surfaces, the DOM. None of that can run under
 * Node. This bridge reimplements the *effects* of the graph-editor + discovery
 * tools against a plain in-memory graph, so a model can drive the exact same
 * tool surface headlessly.
 *
 * What it does NOT fork is the tool *contract*: names, descriptions, and Zod
 * parameter schemas are imported verbatim from `@nodetool-ai/protocol`'s
 * {@link uiToolSchemas} — the single source of truth the browser builtins also
 * consume (each `builtin/*.ts` wraps the same `uiXParams` shapes). Validation
 * goes through the same `parseWithTypeCoercion` path as
 * `FrontendToolRegistry.call`, so args are coerced identically.
 */

import { z } from "zod";
import { parseWithTypeCoercion } from "@nodetool-ai/runtime";
import { uiToolSchemas, type NodeMetadata } from "@nodetool-ai/protocol";

export interface HeadlessNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { properties: Record<string, unknown>; title?: string };
}

export interface HeadlessEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
}

/** The mutable graph the tools read and write. */
export interface ToolLoopState {
  nodeMetadata: Record<string, NodeMetadata>;
  nodes: HeadlessNode[];
  edges: HeadlessEdge[];
  currentWorkflowId: string;
}

/** Case-supplied starting point for a run. */
export interface ToolLoopInitialState {
  /** Node types the model may discover/add, keyed by `node_type`. */
  nodeMetadata: Record<string, NodeMetadata>;
  /** Pre-existing nodes (defaults to empty). */
  nodes?: HeadlessNode[];
  /** Pre-existing edges (defaults to empty). */
  edges?: HeadlessEdge[];
  currentWorkflowId?: string;
}

/** Snapshot of the graph handed to final-state predicates. */
export interface ToolLoopFinalState {
  nodes: HeadlessNode[];
  edges: HeadlessEdge[];
}

/** One executable tool: the real contract + a headless executor. */
export interface HeadlessTool {
  name: string;
  description: string;
  /** `z.object(...)` built from the shared `uiToolSchemas` parameter shape. */
  parameters: z.ZodTypeAny;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface HeadlessBridge {
  state: ToolLoopState;
  tools: HeadlessTool[];
  finalState: () => ToolLoopFinalState;
}

/**
 * Graph-editor + discovery tools that have a faithful headless implementation.
 * Editor-surface tools (timeline/sketch/storyboard/…) and backend-backed ones
 * (`ui_search_models`) are intentionally excluded — they need a browser or a
 * live service.
 */
export const DEFAULT_TOOL_NAMES = [
  "ui_search_nodes",
  "ui_add_node",
  "ui_connect_nodes",
  "ui_update_node_data",
  "ui_set_node_title",
  "ui_move_node",
  "ui_delete_node",
  "ui_delete_edge",
  "ui_get_graph"
] as const;

export type DefaultToolName = (typeof DEFAULT_TOOL_NAMES)[number];

export interface CreateBridgeOptions {
  /** Restrict the exposed tools (defaults to {@link DEFAULT_TOOL_NAMES}). */
  toolNames?: readonly string[];
}

function cloneNode(n: HeadlessNode): HeadlessNode {
  return {
    id: n.id,
    type: n.type,
    position: { ...n.position },
    data: {
      properties: { ...(n.data?.properties ?? {}) },
      ...(n.data?.title !== undefined ? { title: n.data.title } : {})
    }
  };
}

/** True if adding source→target to `edges` would introduce a cycle. */
function wouldCreateCycle(
  edges: HeadlessEdge[],
  source: string,
  target: string
): boolean {
  // Walk forward from `target`; if we can reach `source`, the new edge closes
  // a loop.
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    const list = adjacency.get(e.source) ?? [];
    list.push(e.target);
    adjacency.set(e.source, list);
  }
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === source) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of adjacency.get(node) ?? []) stack.push(next);
  }
  return false;
}

/**
 * Build an in-memory bridge whose tools share the frontend contract but run
 * headlessly. Each `execute` validates args with the shared Zod schema first,
 * exactly like `FrontendToolRegistry.call`.
 */
export function createToolLoopBridge(
  initial: ToolLoopInitialState,
  opts: CreateBridgeOptions = {}
): HeadlessBridge {
  const state: ToolLoopState = {
    nodeMetadata: initial.nodeMetadata,
    nodes: (initial.nodes ?? []).map(cloneNode),
    edges: (initial.edges ?? []).map((e) => ({ ...e })),
    currentWorkflowId: initial.currentWorkflowId ?? "wf_eval"
  };

  let edgeSeq = state.edges.length;
  const generateEdgeId = () => `edge_${++edgeSeq}`;
  const findNode = (id: string) => state.nodes.find((n) => n.id === id);
  const meta = (type: string): NodeMetadata | undefined =>
    state.nodeMetadata[type];

  // Headless implementations keyed by tool name. Behaviour mirrors the browser
  // builtins closely enough to make the same objectives solvable, and to
  // surface the same failure modes (unknown type, missing handle, cycle).
  const impls: Record<
    string,
    (args: Record<string, unknown>) => Promise<unknown>
  > = {
    async ui_search_nodes(args) {
      const query = String(args.query ?? "").toLowerCase();
      const limit = typeof args.limit === "number" ? args.limit : 10;
      const results = Object.values(state.nodeMetadata)
        .filter((m) => {
          if (!query) return true;
          return (
            m.node_type.toLowerCase().includes(query) ||
            (m.title ?? "").toLowerCase().includes(query) ||
            (m.description ?? "").toLowerCase().includes(query)
          );
        })
        .slice(0, limit)
        .map((m) => ({
          node_type: m.node_type,
          title: m.title,
          description: m.description,
          properties: (m.properties ?? []).map((p) => ({
            name: p.name,
            type: p.type?.type,
            required: p.required
          })),
          outputs: (m.outputs ?? []).map((o) => ({
            name: o.name,
            type: o.type?.type
          }))
        }));
      return { ok: true, count: results.length, results };
    },

    async ui_add_node(args) {
      const id = String(args.id);
      const type = String(args.type);
      const m = meta(type);
      if (!m) {
        throw new Error(
          `Node type not found: ${type}. Use ui_search_nodes to find the correct type.`
        );
      }
      if (findNode(id)) {
        throw new Error(`A node with id "${id}" already exists.`);
      }
      const rawPos = args.position;
      const position =
        rawPos &&
        typeof rawPos === "object" &&
        "x" in rawPos &&
        "y" in rawPos &&
        typeof (rawPos as { x: unknown }).x === "number" &&
        typeof (rawPos as { y: unknown }).y === "number"
          ? { x: (rawPos as { x: number }).x, y: (rawPos as { y: number }).y }
          : { x: 120 + state.nodes.length * 240, y: 120 };

      const provided = (args.properties as Record<string, unknown>) ?? {};
      const properties: Record<string, unknown> = {};
      for (const prop of m.properties ?? []) {
        properties[prop.name] =
          prop.name in provided ? provided[prop.name] : prop.default;
      }
      // Preserve any extra provided keys the metadata doesn't declare.
      for (const [k, v] of Object.entries(provided)) {
        if (!(k in properties)) properties[k] = v;
      }

      state.nodes.push({ id, type, position, data: { properties } });

      const warnings: string[] = [];
      for (const prop of m.properties ?? []) {
        if (!prop.required) continue;
        if (prop.name in provided) continue;
        const v = properties[prop.name];
        if (v === null || v === undefined || v === "") {
          warnings.push(
            `Required property '${prop.name}' is not set. Use ui_update_node_data to set it.`
          );
        }
      }
      return warnings.length > 0 ? { ok: true, id, warnings } : { ok: true, id };
    },

    async ui_connect_nodes(args) {
      const sourceId = String(args.source_node_id);
      const targetId = String(args.target_node_id);
      const sourceHandle = String(args.source_handle);
      const targetHandle = String(args.target_handle);
      const src = findNode(sourceId);
      const tgt = findNode(targetId);
      if (!src) throw new Error(`Source node not found: ${sourceId}`);
      if (!tgt) throw new Error(`Target node not found: ${targetId}`);
      const srcMeta = meta(src.type);
      const tgtMeta = meta(tgt.type);
      if (!srcMeta) throw new Error(`Source node has no metadata: ${src.type}`);
      if (!tgtMeta) throw new Error(`Target node has no metadata: ${tgt.type}`);

      const hasOutput = (srcMeta.outputs ?? []).some(
        (o) => o.name === sourceHandle
      );
      if (!hasOutput) {
        const avail = (srcMeta.outputs ?? []).map((o) => o.name).join(", ");
        throw new Error(
          `Source handle '${sourceHandle}' not found on ${src.type}. Available outputs: [${avail || "none"}]`
        );
      }
      const hasInput = (tgtMeta.properties ?? []).some(
        (p) => p.name === targetHandle
      );
      if (!hasInput) {
        const avail = (tgtMeta.properties ?? []).map((p) => p.name).join(", ");
        throw new Error(
          `Target handle '${targetHandle}' not found on ${tgt.type}. Available inputs: [${avail || "none"}]`
        );
      }

      const duplicate = state.edges.find(
        (e) =>
          e.source === sourceId &&
          e.sourceHandle === sourceHandle &&
          e.target === targetId &&
          e.targetHandle === targetHandle
      );
      if (duplicate) {
        return { ok: true, edge_id: duplicate.id, note: "edge already exists" };
      }
      if (wouldCreateCycle(state.edges, sourceId, targetId)) {
        throw new Error(
          `Connecting ${sourceId} → ${targetId} would create a cycle.`
        );
      }
      const edgeId = generateEdgeId();
      state.edges.push({
        id: edgeId,
        source: sourceId,
        target: targetId,
        sourceHandle,
        targetHandle
      });
      return { ok: true, edge_id: edgeId };
    },

    async ui_update_node_data(args) {
      const node = findNode(String(args.node_id));
      if (!node) throw new Error(`Node not found: ${String(args.node_id)}`);
      const data = (args.data as Record<string, unknown>) ?? {};
      if (data.properties && typeof data.properties === "object") {
        node.data.properties = {
          ...node.data.properties,
          ...(data.properties as Record<string, unknown>)
        };
      }
      if (typeof data.title === "string") node.data.title = data.title;
      return { ok: true };
    },

    async ui_set_node_title(args) {
      const node = findNode(String(args.node_id));
      if (!node) throw new Error(`Node not found: ${String(args.node_id)}`);
      node.data.title = String(args.title);
      return { ok: true };
    },

    async ui_move_node(args) {
      const node = findNode(String(args.node_id));
      if (!node) throw new Error(`Node not found: ${String(args.node_id)}`);
      const pos = args.position as { x: number; y: number };
      node.position = { x: pos.x, y: pos.y };
      return { ok: true };
    },

    async ui_delete_node(args) {
      const id = String(args.node_id);
      const before = state.nodes.length;
      state.nodes = state.nodes.filter((n) => n.id !== id);
      if (state.nodes.length === before) {
        throw new Error(`Node not found: ${id}`);
      }
      // Drop dangling edges, matching the store's cascade.
      state.edges = state.edges.filter(
        (e) => e.source !== id && e.target !== id
      );
      return { ok: true };
    },

    async ui_delete_edge(args) {
      const id = String(args.edge_id);
      const before = state.edges.length;
      state.edges = state.edges.filter((e) => e.id !== id);
      if (state.edges.length === before) {
        throw new Error(`Edge not found: ${id}`);
      }
      return { ok: true };
    },

    async ui_get_graph() {
      return {
        ok: true,
        workflow_id: state.currentWorkflowId,
        nodes: state.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data
        })),
        edges: state.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle
        }))
      };
    }
  };

  const names = opts.toolNames ?? DEFAULT_TOOL_NAMES;
  const tools: HeadlessTool[] = [];
  for (const name of names) {
    const schema = uiToolSchemas[name];
    const impl = impls[name];
    if (!schema) {
      throw new Error(`No shared schema in uiToolSchemas for tool "${name}"`);
    }
    if (!impl) {
      throw new Error(`No headless implementation for tool "${name}"`);
    }
    const parameters = z.object(schema.parameters);
    tools.push({
      name,
      description: schema.description,
      parameters,
      // Validate through the same coercion path the browser registry uses,
      // then run the effect.
      execute: (args) => {
        const parsed = parseWithTypeCoercion(parameters, args ?? {}) as Record<
          string,
          unknown
        >;
        return impl(parsed);
      }
    });
  }

  return {
    state,
    tools,
    finalState: () => ({
      nodes: state.nodes.map(cloneNode),
      edges: state.edges.map((e) => ({ ...e }))
    })
  };
}
