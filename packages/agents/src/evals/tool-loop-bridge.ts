/** Headless executor for the frontend workflow-tool evaluation suite. */
import { z } from "zod";
import { parseWithTypeCoercion } from "@nodetool-ai/runtime";
import { uiToolSchemas, type NodeMetadata } from "@nodetool-ai/protocol";
import type { Graph } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import {
  applyWorkflowDocumentTool,
  type WorkflowDocumentToolName
} from "@nodetool-ai/node-sdk";
import {
  isNumber,
  isObjectLike,
  isRecord,
  isString
} from "../utils/type-guards.js";

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

export interface ToolLoopState {
  nodeMetadata: Record<string, NodeMetadata>;
  nodes: HeadlessNode[];
  edges: HeadlessEdge[];
  currentWorkflowId: string;
}

export interface ToolLoopInitialState {
  nodeMetadata: Record<string, NodeMetadata>;
  nodes?: HeadlessNode[];
  edges?: HeadlessEdge[];
  currentWorkflowId?: string;
}

export interface ToolLoopFinalState {
  nodes: HeadlessNode[];
  edges: HeadlessEdge[];
}

export interface HeadlessTool {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface HeadlessBridge {
  state: ToolLoopState;
  tools: HeadlessTool[];
  finalState: () => ToolLoopFinalState;
}

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

interface CreateBridgeOptions {
  toolNames?: readonly string[];
}

/** A node's `ui_properties` on the wire; a title only when it has one. */
interface WireUiProperties {
  position: { x: number; y: number };
  title?: string;
}

function toGraph(state: ToolLoopState): Graph {
  return {
    nodes: state.nodes.map((node) => {
      const ui: WireUiProperties = { position: { ...node.position } };
      if (node.data.title !== undefined) ui.title = node.data.title;
      return {
        id: node.id,
        type: node.type,
        data: { ...node.data.properties },
        ui_properties: ui
      };
    }),
    edges: state.edges.map((edge) => ({ ...edge }))
  };
}

function syncStateFromGraph(state: ToolLoopState, graph: Graph): void {
  state.nodes = graph.nodes.map((node) => {
    const data =
      isRecord(node.data)
        ? (node.data as Record<string, unknown>)
        : {};
    const ui =
      isObjectLike(node.ui_properties)
        ? (node.ui_properties as Record<string, unknown>)
        : {};
    const position =
      isObjectLike(ui.position)
        ? (ui.position as { x: number; y: number })
        : { x: 0, y: 0 };
    const nodeData: HeadlessNode["data"] = { properties: { ...data } };
    if (isString(ui.title)) nodeData.title = ui.title;
    return {
      id: node.id,
      type: node.type,
      position: { ...position },
      data: nodeData
    };
  });
  state.edges = graph.edges.map((edge) => ({
    id: edge.id ?? "",
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle
  }));
}

function searchNodes(
  state: ToolLoopState,
  args: Record<string, unknown>
) {
  const query = String(args.query ?? "").toLowerCase();
  const limit = isNumber(args.limit) ? args.limit : 10;
  const results = Object.values(state.nodeMetadata)
    .filter(
      (metadata) =>
        !query ||
        metadata.node_type.toLowerCase().includes(query) ||
        (metadata.title ?? "").toLowerCase().includes(query) ||
        (metadata.description ?? "").toLowerCase().includes(query)
    )
    .slice(0, limit)
    .map((metadata) => ({
      node_type: metadata.node_type,
      title: metadata.title,
      description: metadata.description,
      properties: metadata.properties.map((property) => ({
        name: property.name,
        type: property.type?.type,
        required: property.required
      })),
      outputs: metadata.outputs.map((output) => ({
        name: output.name,
        type: output.type?.type
      }))
    }));
  return { ok: true, count: results.length, results };
}

export function createToolLoopBridge(
  initial: ToolLoopInitialState,
  opts: CreateBridgeOptions = {}
): HeadlessBridge {
  const state: ToolLoopState = {
    nodeMetadata: initial.nodeMetadata,
    nodes: structuredClone(initial.nodes ?? []),
    edges: structuredClone(initial.edges ?? []),
    currentWorkflowId: initial.currentWorkflowId ?? "wf_eval"
  };
  let edgeSequence = state.edges.length;

  const tools = (opts.toolNames ?? DEFAULT_TOOL_NAMES).map((name) => {
    const contract = uiToolSchemas[name];
    if (!contract) {
      throw new Error(`No shared schema in uiToolSchemas for tool "${name}"`);
    }
    const parameters = z.object(contract.parameters);
    return {
      name,
      description: contract.description,
      parameters,
      execute: async (args: Record<string, unknown>): Promise<unknown> => {
        const parsed = parseWithTypeCoercion(parameters, args ?? {});
        if (name === "ui_search_nodes") return searchNodes(state, parsed);
        const applied = applyWorkflowDocumentTool(
          toGraph(state),
          name as WorkflowDocumentToolName,
          parsed,
          {
            workflowId: state.currentWorkflowId,
            resolveMetadata: (type) => state.nodeMetadata[type],
            createEdgeId: () => `edge_${++edgeSequence}`
          }
        );
        syncStateFromGraph(state, applied.graph);
        return applied.result;
      }
    };
  });

  return {
    state,
    tools,
    finalState: () => ({
      nodes: structuredClone(state.nodes),
      edges: structuredClone(state.edges)
    })
  };
}
