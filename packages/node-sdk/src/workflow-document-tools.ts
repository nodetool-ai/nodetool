import type { Graph } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import {
  inferredCodeInputNames,
  inferredCodeOutputNames
} from "./code-analysis.js";
import { isJsCodeNodeType } from "./code-node-validation.js";
import {
  typeMetaToString,
  typesIncompatible,
  valueIncompatibleWithType
} from "./type-compat.js";

export const WORKFLOW_DOCUMENT_TOOL_NAMES = [
  "ui_get_graph",
  "ui_add_node",
  "ui_connect_nodes",
  "ui_update_node_data",
  "ui_delete_node",
  "ui_delete_edge",
  "ui_move_node",
  "ui_set_node_title"
] as const;

export type WorkflowDocumentToolName =
  (typeof WORKFLOW_DOCUMENT_TOOL_NAMES)[number];

type TypeMeta = { type?: unknown; type_args?: unknown; args?: unknown };

interface WorkflowNodeMetadata {
  properties: Array<{
    name: string;
    type: TypeMeta;
    default?: unknown;
    required?: boolean;
  }>;
  outputs: Array<{ name: string; type: TypeMeta }>;
}

export interface WorkflowDocumentToolOptions {
  workflowId: string;
  resolveMetadata: (nodeType: string) => WorkflowNodeMetadata | undefined;
  createEdgeId?: () => string;
}

export interface WorkflowDocumentToolResult {
  graph: Graph;
  result: Record<string, unknown>;
  changed: boolean;
}

type GraphNode = Graph["nodes"][number];
type GraphEdge = Graph["edges"][number];

const DYNAMIC_NODE_DATA_FIELDS = new Set([
  "dynamic_properties",
  "dynamic_inputs",
  "dynamic_outputs"
]);
const UI_NODE_DATA_FIELDS = new Set([
  "title",
  "color",
  "collapsed",
  "bypassed",
  "model_id",
  "endpoint_id",
  "selected_generation",
  "selected_generations"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nodeData(node: GraphNode): Record<string, unknown> {
  return isRecord(node.data) ? node.data : {};
}

function nodeUi(node: GraphNode): Record<string, unknown> {
  return isRecord(node.ui_properties) ? node.ui_properties : {};
}

function findNode(graph: Graph, id: string): GraphNode {
  const node = graph.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`Node not found: ${id}`);
  return node;
}

function normalizePosition(
  value: unknown,
  fallbackIndex: number
) {
  if (
    isRecord(value) &&
    typeof value.x === "number" &&
    typeof value.y === "number"
  ) {
    return { x: value.x, y: value.y };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        return normalizePosition(JSON.parse(trimmed), fallbackIndex);
      } catch {
        // Fall through to the numeric-pair parser.
      }
    }
    const pair = trimmed.match(/-?\d+(?:\.\d+)?/g);
    if (pair && pair.length >= 2) {
      const x = Number(pair[0]);
      const y = Number(pair[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
    }
  }
  return {
    x: 120 + (fallbackIndex % 6) * 240,
    y: 120 + Math.floor(fallbackIndex / 6) * 160
  };
}

function wouldCreateCycle(
  edges: GraphEdge[],
  source: string,
  target: string
): boolean {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const next = outgoing.get(edge.source) ?? [];
    next.push(edge.target);
    outgoing.set(edge.source, next);
  }
  const pending = [target];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const nodeId = pending.pop();
    if (!nodeId) continue;
    if (nodeId === source) return true;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    pending.push(...(outgoing.get(nodeId) ?? []));
  }
  return false;
}

function nodeCode(node: GraphNode): string {
  const data = nodeData(node);
  const nested = isRecord(data.properties) ? data.properties.code : undefined;
  const code = nested ?? data.code;
  return typeof code === "string" ? code : "";
}

const ANY_TYPE: TypeMeta = { type: "any" };

function outputType(
  node: GraphNode,
  metadata: WorkflowNodeMetadata,
  handle: string
): TypeMeta | undefined {
  const declared = metadata.outputs.find((output) => output.name === handle);
  if (declared) return declared.type;
  const dynamic = isRecord(node.dynamic_outputs)
    ? node.dynamic_outputs[handle]
    : undefined;
  if (isRecord(dynamic)) return dynamic;
  if (
    isJsCodeNodeType(String(node.type ?? "")) &&
    inferredCodeOutputNames(nodeCode(node)).includes(handle)
  ) {
    return ANY_TYPE;
  }
  return undefined;
}

function inputType(
  node: GraphNode,
  metadata: WorkflowNodeMetadata,
  handle: string
): TypeMeta | undefined {
  const declared = metadata.properties.find(
    (property) => property.name === handle
  );
  if (declared) return declared.type;
  const dynamicInputs = isRecord(node.dynamic_inputs)
    ? node.dynamic_inputs
    : {};
  const dynamicProperties = isRecord(node.dynamic_properties)
    ? node.dynamic_properties
    : {};
  if (handle in dynamicInputs || handle in dynamicProperties) {
    const dynamic = dynamicInputs[handle] ?? dynamicProperties[handle];
    if (isRecord(dynamic) && isRecord(dynamic.type)) return dynamic.type;
    if (isRecord(dynamic) && typeof dynamic.type === "string") return dynamic;
    return ANY_TYPE;
  }
  if (
    isJsCodeNodeType(String(node.type ?? "")) &&
    inferredCodeInputNames(nodeCode(node)).includes(handle)
  ) {
    return ANY_TYPE;
  }
  return undefined;
}

/** Stamp inferred Code-node slots onto the node without replacing existing ones. */
function applyInferredCodeHandles(node: GraphNode): void {
  if (!isJsCodeNodeType(String(node.type ?? ""))) return;
  const code = nodeCode(node);
  const dynProps = isRecord(node.dynamic_properties)
    ? { ...node.dynamic_properties }
    : {};
  const dynOuts = isRecord(node.dynamic_outputs)
    ? { ...node.dynamic_outputs }
    : {};
  for (const name of inferredCodeInputNames(code)) {
    if (!(name in dynProps)) dynProps[name] = "";
  }
  for (const name of inferredCodeOutputNames(code)) {
    if (!(name in dynOuts)) dynOuts[name] = { type: "any" };
  }
  node.dynamic_properties = dynProps;
  node.dynamic_outputs = dynOuts;
}

function projectGraph(
  graph: Graph,
  workflowId: string
) {
  return {
    ok: true,
    workflow_id: workflowId,
    nodes: graph.nodes.map((node) => {
      const ui = nodeUi(node);
      type DataFields = {
        properties: ReturnType<typeof nodeData>;
        dynamic_properties: unknown;
        dynamic_inputs: unknown;
        dynamic_outputs: unknown;
        title?: string;
      };
      const data: DataFields = {
        properties: nodeData(node),
        dynamic_properties: node.dynamic_properties ?? {},
        dynamic_inputs: node.dynamic_inputs ?? {},
        dynamic_outputs: node.dynamic_outputs ?? {}
      };
      if (typeof ui.title === "string") {
        data.title = ui.title;
      }
      return {
        id: node.id,
        type: node.type,
        position: normalizePosition(ui.position, 0),
        data
      };
    }),
    edges: graph.edges.map((edge) => ({ ...edge }))
  };
}

/** Apply one workflow document tool to the persisted graph representation. */
export function applyWorkflowDocumentTool(
  source: Graph,
  name: WorkflowDocumentToolName,
  args: Record<string, unknown>,
  options: WorkflowDocumentToolOptions
): WorkflowDocumentToolResult {
  const graph = structuredClone(source);
  if (name === "ui_get_graph") {
    return {
      graph,
      result: projectGraph(graph, options.workflowId),
      changed: false
    };
  }

  if (name === "ui_add_node") {
    const id = String(args.id);
    const type = String(args.type);
    if (graph.nodes.some((node) => node.id === id)) {
      throw new Error(`A node with id "${id}" already exists.`);
    }
    const metadata = options.resolveMetadata(type);
    if (!metadata) {
      throw new Error(
        `Node type not found: ${type}. Use ui_search_nodes to find the correct type.`
      );
    }
    const provided = isRecord(args.properties) ? args.properties : {};
    const properties: Record<string, unknown> = { ...provided };
    const warnings: string[] = [];
    for (const property of metadata.properties) {
      if (!(property.name in properties)) {
        properties[property.name] = property.default;
      } else if (
        valueIncompatibleWithType(
          properties[property.name],
          typeMetaToString(property.type)
        )
      ) {
        throw new Error(
          `Value for property ${property.name} does not match type ${property.type.type}`
        );
      }
      const value = properties[property.name];
      if (
        property.required &&
        !(property.name in provided) &&
        (value === null || value === undefined || value === "")
      ) {
        warnings.push(
          `Required property '${property.name}' is not set. Use ui_update_node_data to set it.`
        );
      }
    }
    const added: GraphNode = {
      id,
      type,
      data: properties,
      ui_properties: {
        position: normalizePosition(args.position, graph.nodes.length),
        zIndex: 0,
        width: 200,
        selectable: true
      },
      dynamic_properties: {},
      dynamic_outputs: {}
    };
    applyInferredCodeHandles(added);
    graph.nodes.push(added);
    type ResultFields = { ok: true; node_id: string; warnings?: string[] };
    const result: ResultFields = {
      ok: true,
      node_id: id
    };
    if (warnings.length) {
      result.warnings = warnings;
    }
    return { graph, result, changed: true };
  }

  if (name === "ui_connect_nodes") {
    const sourceId = String(args.source_node_id);
    const targetId = String(args.target_node_id);
    const sourceHandle = String(args.source_handle);
    const targetHandle = String(args.target_handle);
    const sourceNode = findNode(graph, sourceId);
    const targetNode = findNode(graph, targetId);
    const sourceMetadata = options.resolveMetadata(sourceNode.type);
    const targetMetadata = options.resolveMetadata(targetNode.type);
    if (!sourceMetadata) {
      throw new Error(`Source node has no metadata: ${sourceNode.type}`);
    }
    if (!targetMetadata) {
      throw new Error(`Target node has no metadata: ${targetNode.type}`);
    }
    const sourceType = outputType(sourceNode, sourceMetadata, sourceHandle);
    const targetType = inputType(targetNode, targetMetadata, targetHandle);
    if (!sourceType) {
      const available = sourceMetadata.outputs.map((slot) => slot.name);
      throw new Error(
        `Source handle '${sourceHandle}' not found on ${sourceNode.type}. Available outputs: [${available.join(", ") || "none"}]`
      );
    }
    if (!targetType) {
      const available = targetMetadata.properties.map(
        (property) => property.name
      );
      throw new Error(
        `Target handle '${targetHandle}' not found on ${targetNode.type}. Available inputs: [${available.join(", ") || "none"}]`
      );
    }
    const duplicate = graph.edges.find(
      (edge) =>
        edge.source === sourceId &&
        edge.sourceHandle === sourceHandle &&
        edge.target === targetId &&
        edge.targetHandle === targetHandle
    );
    if (duplicate) {
      return {
        graph,
        result: {
          ok: true,
          edge_id: duplicate.id,
          note: "edge already exists"
        },
        changed: false
      };
    }
    if (wouldCreateCycle(graph.edges, sourceId, targetId)) {
      throw new Error(
        `Connecting ${sourceId} → ${targetId} would create a cycle.`
      );
    }
    const sourceTypeName = typeMetaToString(sourceType);
    const targetTypeName = typeMetaToString(targetType);
    if (typesIncompatible(sourceTypeName, targetTypeName)) {
      throw new Error(
        `Type mismatch: source '${sourceHandle}' produces ${sourceTypeName} but target '${targetHandle}' expects ${targetTypeName}.`
      );
    }
    const edgeId =
      options.createEdgeId?.() ?? `edge_${globalThis.crypto.randomUUID()}`;
    graph.edges.push({
      id: edgeId,
      source: sourceId,
      sourceHandle,
      target: targetId,
      targetHandle
    });
    return { graph, result: { ok: true, edge_id: edgeId }, changed: true };
  }

  const nodeId = String(args.node_id);
  if (name === "ui_delete_edge") {
    const edgeId = String(args.edge_id);
    const index = graph.edges.findIndex((edge) => edge.id === edgeId);
    if (index < 0) throw new Error(`Edge not found: ${edgeId}`);
    graph.edges.splice(index, 1);
    return { graph, result: { ok: true, edge_id: edgeId }, changed: true };
  }

  const node = findNode(graph, nodeId);
  if (name === "ui_delete_node") {
    const parentPosition = normalizePosition(nodeUi(node).position, 0);
    for (const child of graph.nodes) {
      if (child.parent_id !== nodeId) continue;
      const childPosition = normalizePosition(nodeUi(child).position, 0);
      child.parent_id = null;
      child.ui_properties = {
        ...nodeUi(child),
        position: {
          x: parentPosition.x + childPosition.x,
          y: parentPosition.y + childPosition.y
        }
      };
    }
    graph.nodes = graph.nodes.filter((candidate) => candidate.id !== nodeId);
    graph.edges = graph.edges.filter(
      (edge) => edge.source !== nodeId && edge.target !== nodeId
    );
    return { graph, result: { ok: true, node_id: nodeId }, changed: true };
  }
  if (name === "ui_move_node") {
    node.ui_properties = {
      ...nodeUi(node),
      position: normalizePosition(args.position, 0)
    };
    return {
      graph,
      result: { ok: true, node_id: nodeId, position: args.position },
      changed: true
    };
  }
  if (name === "ui_set_node_title") {
    node.ui_properties = { ...nodeUi(node), title: String(args.title) };
    return {
      graph,
      result: { ok: true, node_id: nodeId, title: args.title },
      changed: true
    };
  }

  const update = isRecord(args.data) ? args.data : {};
  const { properties, title, ...rest } = update;
  const propertyPatch = isRecord(properties) ? properties : {};
  node.data = { ...nodeData(node), ...propertyPatch };
  const uiPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (DYNAMIC_NODE_DATA_FIELDS.has(key)) {
      (node as Record<string, unknown>)[key] = value;
    } else if (UI_NODE_DATA_FIELDS.has(key)) {
      uiPatch[key] = value;
    }
  }
  if (typeof title === "string") uiPatch.title = title;
  if (Object.keys(uiPatch).length > 0) {
    node.ui_properties = { ...nodeUi(node), ...uiPatch };
  }
  applyInferredCodeHandles(node);
  return { graph, result: { ok: true, node_id: nodeId }, changed: true };
}
