import { Connection, Edge, Node } from "@xyflow/react";
import { NodeMetadata } from "../stores/ApiTypes";
import { NodeData } from "../stores/NodeData";
import { findOutputHandle, findInputHandle } from "../utils/handleUtils";
import { isConnectable } from "../utils/TypeHandler";
import { wouldCreateCycle } from "../utils/graphCycle";

export type ConnectionValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

interface ValidateConnectionParams {
  connection: Connection;
  nodes: Node<NodeData>[];
  edges: Edge[];
  nodeMetadata: Record<string, NodeMetadata>;
}

export const validateConnection = ({
  connection,
  nodes,
  edges,
  nodeMetadata
}: ValidateConnectionParams): ConnectionValidationResult => {
  const { source, sourceHandle, target, targetHandle } = connection;

  if (!source || !target) {
    return { valid: true };
  }

  const sourceNode = nodes.find((n) => n.id === source);
  const targetNode = nodes.find((n) => n.id === target);

  if (!sourceNode || !targetNode) {
    return { valid: false, reason: "Source or target node not found" };
  }

  if (!sourceNode.type || !targetNode.type) {
    return { valid: false, reason: "Node type is missing" };
  }

  if (!sourceHandle || !targetHandle) {
    return { valid: true };
  }

  const sourceMeta = nodeMetadata[sourceNode.type];
  const targetMeta = nodeMetadata[targetNode.type];

  if (!sourceMeta || !targetMeta) {
    return { valid: true };
  }

  const sourceOutputHandle = findOutputHandle(
    sourceNode,
    sourceHandle,
    sourceMeta
  );
  const targetInputHandle = findInputHandle(
    targetNode,
    targetHandle,
    targetMeta
  );

  if (!sourceOutputHandle) {
    return {
      valid: false,
      reason: `Invalid output handle "${sourceHandle}" on source node`
    };
  }

  const isDynamicProperty =
    targetNode.data.dynamic_properties?.[targetHandle] !== undefined;

  if (!targetInputHandle && !isDynamicProperty) {
    return {
      valid: false,
      reason: `Invalid input handle "${targetHandle}" on target node`
    };
  }

  const sourceType = sourceOutputHandle.type;
  const targetType = targetInputHandle?.type || { type: "any", type_args: [], optional: false, type_name: "any" };

  if (!isConnectable(sourceType, targetType, true)) {
    return {
      valid: false,
      reason: `Type mismatch: cannot connect ${sourceType.type} to ${targetType.type}`
    };
  }

  if (wouldCreateCycle(edges, source, target)) {
    return { valid: false, reason: "Cannot create cyclic connection" };
  }

  return { valid: true };
};

export const validateEdge = (
  edge: Edge,
  nodeMap: Map<string, Node<NodeData>>,
  metadata: Record<string, NodeMetadata>
): { valid: boolean; reason?: string } => {
  const sourceNode = nodeMap.get(edge.source);
  const targetNode = nodeMap.get(edge.target);

  if (!sourceNode || !targetNode) {
    return { valid: false, reason: "References non-existent nodes" };
  }

  if (!edge.sourceHandle || !edge.targetHandle) {
    return { valid: false, reason: "Missing handles" };
  }

  const sourceNodeType = sourceNode.type || "";
  const targetNodeType = targetNode.type || "";
  const sourceMetadata = metadata[sourceNodeType];
  const targetMetadata = metadata[targetNodeType];

  if (!sourceMetadata || !targetMetadata) {
    return { valid: true };
  }

  const sourceOutputHandle = findOutputHandle(
    sourceNode,
    edge.sourceHandle,
    sourceMetadata
  );
  const targetInputHandle = findInputHandle(
    targetNode,
    edge.targetHandle,
    targetMetadata
  );
  const isDynamicProperty =
    targetNode.data.dynamic_properties?.[edge.targetHandle] !== undefined;

  if (!sourceOutputHandle) {
    return {
      valid: false,
      reason: `Invalid source handle "${edge.sourceHandle}"`
    };
  }

  if (!targetInputHandle && !isDynamicProperty) {
    return {
      valid: false,
      reason: `Invalid target handle "${edge.targetHandle}"`
    };
  }

  const sourceType = sourceOutputHandle.type;
  const targetType = targetInputHandle?.type || { type: "any", type_args: [], optional: false, type_name: "any" };

  if (!isConnectable(sourceType, targetType, true)) {
    return {
      valid: false,
      reason: `Type mismatch: ${sourceType.type} → ${targetType.type}`
    };
  }

  return { valid: true };
};
