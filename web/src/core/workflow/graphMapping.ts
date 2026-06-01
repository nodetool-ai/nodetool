import { Edge, Node } from "@xyflow/react";

import { NodeMetadata, TypeMetadata } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";
import { hasInputHandle, hasOutputHandle } from "../../utils/handleUtils";
import { CONTROL_HANDLE_ID } from "../../stores/graphEdgeToReactFlowEdge";
import { addExposedInput } from "../../utils/exposedInputs";

const ANY_TYPE: TypeMetadata = {
  type: "any",
  optional: false,
  type_args: [],
  type_name: null
};

interface NodePatch {
  dynamic_properties?: Record<string, unknown>;
  dynamic_outputs?: Record<string, TypeMetadata>;
  exposedInputs?: string[];
}

/**
 * Walk edges and ensure that every handle referenced by an edge actually
 * renders on the node body:
 *   - `supports_dynamic_inputs` target with unknown handle → add to `dynamic_properties`
 *   - `supports_dynamic_outputs` source with unknown handle → add to
 *     `dynamic_outputs` (type `any`)
 *   - static target property that's neither inline nor input-field → promote
 *     to `exposedInputs` (same rule as the connect-time auto-promotion in
 *     NodeStore)
 *
 * Without this, an edge can reference a handle that exists logically but
 * isn't rendered, leaving the connection stranded on load.
 */
const ensureHandlesForEdges = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  metadata: Record<string, NodeMetadata>
): Node<NodeData>[] => {
  const updates = new Map<string, NodePatch>();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const getPatch = (id: string): NodePatch => {
    const existing = updates.get(id);
    if (existing) return existing;
    const fresh: NodePatch = {};
    updates.set(id, fresh);
    return fresh;
  };

  for (const edge of edges) {
    if (
      !edge.sourceHandle ||
      !edge.targetHandle ||
      edge.sourceHandle === CONTROL_HANDLE_ID ||
      edge.targetHandle === CONTROL_HANDLE_ID
    ) {
      continue;
    }

    const targetNode = nodeById.get(edge.target);
    const targetMeta = targetNode?.type ? metadata[targetNode.type] : undefined;
    if (targetNode && targetMeta) {
      if (targetMeta.supports_dynamic_inputs) {
        const patch = getPatch(targetNode.id);
        const currentDynProps =
          patch.dynamic_properties ??
          targetNode.data.dynamic_properties ??
          {};
        const dynInputs = targetNode.data.dynamic_inputs ?? {};
        const known = new Set([
          ...targetMeta.properties.map((p) => p.name),
          ...Object.keys(currentDynProps),
          ...Object.keys(dynInputs)
        ]);
        if (!known.has(edge.targetHandle)) {
          patch.dynamic_properties = {
            ...currentDynProps,
            [edge.targetHandle]: ""
          };
        }
      } else {
        // Static property promotion: if the edge targets a real metadata
        // property that isn't rendered as a handle (not inline, not in
        // input_fields, not yet exposed), promote it to exposedInputs.
        const isMetadataProperty = targetMeta.properties.some(
          (p) => p.name === edge.targetHandle
        );
        const inlineFields = targetMeta.inline_fields ?? [];
        const inputFields = targetMeta.input_fields ?? [];
        const isMetadataHandle =
          inlineFields.includes(edge.targetHandle) ||
          inputFields.includes(edge.targetHandle);
        if (isMetadataProperty && !isMetadataHandle) {
          const patch = getPatch(targetNode.id);
          const currentExposed =
            patch.exposedInputs ?? targetNode.data.exposedInputs ?? [];
          const next = addExposedInput(currentExposed, edge.targetHandle);
          if (next !== currentExposed) {
            patch.exposedInputs = next;
          }
        }
      }
    }

    const sourceNode = nodeById.get(edge.source);
    const sourceMeta = sourceNode?.type ? metadata[sourceNode.type] : undefined;
    if (sourceNode && sourceMeta?.supports_dynamic_outputs) {
      const patch = getPatch(sourceNode.id);
      const currentDynOutputs =
        patch.dynamic_outputs ?? sourceNode.data.dynamic_outputs ?? {};
      const known = new Set([
        ...sourceMeta.outputs.map((o) => o.name),
        ...Object.keys(currentDynOutputs)
      ]);
      if (!known.has(edge.sourceHandle)) {
        patch.dynamic_outputs = {
          ...currentDynOutputs,
          [edge.sourceHandle]: ANY_TYPE
        };
      }
    }
  }

  if (updates.size === 0) {
    return nodes;
  }

  return nodes.map((node) => {
    const patch = updates.get(node.id);
    if (!patch || Object.keys(patch).length === 0) return node;
    return {
      ...node,
      data: {
        ...node.data,
        ...(patch.dynamic_properties !== undefined && {
          dynamic_properties: patch.dynamic_properties
        }),
        ...(patch.dynamic_outputs !== undefined && {
          dynamic_outputs: patch.dynamic_outputs
        }),
        ...(patch.exposedInputs !== undefined && {
          exposedInputs: patch.exposedInputs
        })
      }
    };
  });
};

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
    console.debug("isValidEdge failed: missing nodes or types", {
      sourceNode,
      targetNode,
      edge
    });
    return false;
  }

  const sourceMetadata = metadata[sourceNode.type];
  const targetMetadata = metadata[targetNode.type];

  if (!edge.sourceHandle || !edge.targetHandle) {
    console.debug("isValidEdge failed: missing handles", { edge });
    return false;
  }

  // Control edges use __control__ targetHandle and don't need regular handle validation
  if (edge.targetHandle === CONTROL_HANDLE_ID || edge.sourceHandle === CONTROL_HANDLE_ID) {
    return true;
  }

  if (!sourceMetadata || !targetMetadata) {
    // Allow provisional edges until metadata loads; handles are required above.
    return true;
  }

  if (!hasOutputHandle(sourceNode, edge.sourceHandle, sourceMetadata)) {
    return false;
  }

  if (
    !targetMetadata.supports_dynamic_inputs &&
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
  const nodesWithDynamicHandles = ensureHandlesForEdges(nodes, edges, metadata);
  const nodeMap = new Map(
    nodesWithDynamicHandles.map((node) => [node.id, node])
  );
  const sanitizedNodes = nodesWithDynamicHandles.map((node) => {
    const sanitizedNode = { ...node };
    if (sanitizedNode.parentId && !nodeMap.has(sanitizedNode.parentId)) {
      console.warn(
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
      console.warn(
        `Edge ${edge.id} references non-existent nodes. Source: ${
          edge.source
        } (${sourceNode ? "exists" : "missing"}), Target: ${edge.target} (${
          targetNode ? "exists" : "missing"
        }). Removing edge.`
      );
    } else if (!sourceNode.type || !targetNode.type) {
      console.warn(
        `Edge ${edge.id} connects nodes without types. Source type: ${sourceNode.type}, Target type: ${targetNode.type}. Removing edge.`
      );
    } else {
      const sourceMetadata = metadata[sourceNode.type];
      const targetMetadata = metadata[targetNode.type];

      if (!edge.sourceHandle || !edge.targetHandle) {
        console.warn(
          `Edge ${edge.id} missing handle. Source: ${edge.sourceHandle}, Target: ${edge.targetHandle}. Removing edge.`
        );
        return false;
      }

      // Keep edges when metadata is missing — the nodes are still on the
      // canvas as placeholders.
      if (!sourceMetadata || !targetMetadata) {
        return true;
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
        console.warn(
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
        console.warn(
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
    console.info(
      `Sanitized graph: removed ${removedEdgeCount} invalid edge(s) out of ${edges.length} total edges.`
    );
  }

  return { nodes: sanitizedNodes, edges: sanitizedEdges };
};
