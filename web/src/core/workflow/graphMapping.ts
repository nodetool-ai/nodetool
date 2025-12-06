import { Edge, Node } from "@xyflow/react";
import log from "loglevel";

import { NodeMetadata } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";
import { hasInputHandle, hasOutputHandle } from "../../utils/handleUtils";

/**
 * Validates if an edge is valid based on node existence and handle validity.
 * Pure helper so it can be tested without Zustand or UI wiring.
 */
export const isValidEdge = (
  edge: Edge,
  nodeMap: Map<string, Node<NodeData>>,
  metadata: Record<string, NodeMetadata>
): boolean => {
  const sourceNode = nodeMap.get(edge.source);
  const targetNode = nodeMap.get(edge.target);

  if (!sourceNode || !targetNode || !sourceNode.type || !targetNode.type) {
    log.debug("isValidEdge failed: missing nodes or types", {
      sourceNode,
      targetNode,
      edge
    });
    return false;
  }

  const sourceMetadata = metadata[sourceNode.type];
  const targetMetadata = metadata[targetNode.type];

  if (!edge.sourceHandle || !edge.targetHandle) {
    log.debug("isValidEdge failed: missing handles", { edge });
    return false;
  }

  if (!sourceMetadata || !targetMetadata) {
    // Allow provisional edges until metadata loads; handles are required above.
    return true;
  }

  if (!hasOutputHandle(sourceNode, edge.sourceHandle, sourceMetadata)) {
    return false;
  }

  if (
    !targetMetadata.is_dynamic &&
    !hasInputHandle(targetNode, edge.targetHandle, targetMetadata)
  ) {
    return false;
  }

  return true;
};

/**
 * Removes invalid parent references and edges to keep graph data consistent.
 */
export const sanitizeGraph = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  metadata: Record<string, NodeMetadata>
): { nodes: Node<NodeData>[]; edges: Edge[] } => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const sanitizedNodes = nodes.map((node) => {
    const sanitizedNode = { ...node };
    if (sanitizedNode.parentId && !nodeMap.has(sanitizedNode.parentId)) {
      log.warn(
        `Node ${sanitizedNode.id} references non-existent parent ${sanitizedNode.parentId}. Removing parent reference.`
      );
      delete sanitizedNode.parentId;
    }
    return sanitizedNode;
  });

  const sanitizedEdges = edges.filter((edge) => {
    if (isValidEdge(edge, nodeMap, metadata)) {
      return true;
    }

    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (!sourceNode || !targetNode) {
      log.warn(
        `Edge ${edge.id} references non-existent nodes. Source: ${
          edge.source
        } (${sourceNode ? "exists" : "missing"}), Target: ${edge.target} (${
          targetNode ? "exists" : "missing"
        }). Removing edge.`
      );
    } else if (!sourceNode.type || !targetNode.type) {
      log.warn(
        `Edge ${edge.id} connects nodes without types. Source type: ${sourceNode.type}, Target type: ${targetNode.type}. Removing edge.`
      );
    } else {
      const sourceMetadata = metadata[sourceNode.type];
      const targetMetadata = metadata[targetNode.type];

      if (
        !sourceMetadata ||
        !targetMetadata ||
        !edge.sourceHandle ||
        !edge.targetHandle
      ) {
        log.warn(
          `Edge ${edge.id} references invalid source or target handle. Source: ${edge.sourceHandle}, Target: ${edge.targetHandle}. Removing edge.`
        );
        return false;
      }

      const sourceHasValidHandle = hasOutputHandle(
        sourceNode,
        edge.sourceHandle,
        sourceMetadata
      );
      const targetHasValidHandle = hasInputHandle(
        targetNode,
        edge.targetHandle,
        targetMetadata
      );

      if (!sourceHasValidHandle) {
        const sourceDynamicOutputs = sourceNode.data.dynamic_outputs || {};
        log.warn(
          `Edge ${edge.id} references invalid source handle "${
            edge.sourceHandle
          }" on node ${edge.source} (type: ${
            sourceNode.type
          }). Available outputs: ${[
            ...sourceMetadata.outputs.map((o) => o.name),
            ...Object.keys(sourceDynamicOutputs)
          ].join(", ")}. Removing edge.`
        );
      } else if (!targetHasValidHandle) {
        const dynamicProperties = targetNode.data.dynamic_properties || {};
        log.warn(
          `Edge ${edge.id} references invalid target handle "${
            edge.targetHandle
          }" on node ${edge.target} (type: ${
            targetNode.type
          }). Available properties: ${[
            ...targetMetadata.properties.map((p) => p.name),
            ...Object.keys(dynamicProperties)
          ].join(", ")}. Removing edge.`
        );
      }
    }

    return false;
  });

  const removedEdgeCount = edges.length - sanitizedEdges.length;
  if (removedEdgeCount > 0) {
    log.info(
      `Sanitized graph: removed ${removedEdgeCount} invalid edge(s) out of ${edges.length} total edges.`
    );
  }

  return { nodes: sanitizedNodes, edges: sanitizedEdges };
};
