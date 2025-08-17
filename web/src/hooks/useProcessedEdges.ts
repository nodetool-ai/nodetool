import { useMemo } from "react";
import { Edge, Node } from "@xyflow/react";
import { DataType } from "../config/data_types";
import { NodeMetadata } from "../stores/ApiTypes";
import { findOutputHandle, findInputHandle } from "../utils/handleUtils";
import { NodeData } from "../stores/NodeData";

interface ProcessedEdgesOptions {
  edges: Edge[];
  nodes: Node<NodeData>[];
  getNode: (id: string) => Node<NodeData> | undefined;
  dataTypes: DataType[];
  getMetadata: (nodeType: string) => NodeMetadata | undefined;
}

interface ProcessedEdgesResult {
  processedEdges: Edge[];
  activeGradientKeys: Set<string>;
}

export function useProcessedEdges({
  edges,
  nodes,
  getNode,
  dataTypes,
  getMetadata
}: ProcessedEdgesOptions): ProcessedEdgesResult {
  return useMemo(() => {
    const activeGradientKeys = new Set<string>();

    const processedResultEdges = edges.map((edge) => {
      const sourceNode = getNode(edge.source);
      const targetNode = getNode(edge.target);

      let sourceTypeSlug = "any";
      let sourceColor =
        dataTypes.find((dt) => dt.slug === "any")?.color || "#888";
      let targetTypeSlug = "any";

      // --- Source Type Detection ---
      if (sourceNode && sourceNode.type && edge.sourceHandle) {
        const sourceMetadata = getMetadata(sourceNode.type);
        if (sourceMetadata) {
          const outputHandle = findOutputHandle(sourceNode, edge.sourceHandle, sourceMetadata);
          if (outputHandle && outputHandle.type && outputHandle.type.type) {
            const typeString = outputHandle.type.type;
            const typeInfoFromDataTypes = dataTypes.find(
              (dt) =>
                dt.value === typeString ||
                dt.name === typeString ||
                dt.slug === typeString
            );
            if (typeInfoFromDataTypes) {
              sourceTypeSlug = typeInfoFromDataTypes.slug;
              sourceColor = typeInfoFromDataTypes.color;
            }
          }
        }
      }

      // --- Target Type Detection ---
      if (targetNode && targetNode.type && edge.targetHandle) {
        const targetMetadata = getMetadata(targetNode.type);
        if (targetMetadata) {
          const inputHandle = findInputHandle(targetNode, edge.targetHandle, targetMetadata);
          if (inputHandle && inputHandle.type && inputHandle.type.type) {
            const typeString = inputHandle.type.type;
            const typeInfoFromDataTypes = dataTypes.find(
              (dt) =>
                dt.value === typeString ||
                dt.name === typeString ||
                dt.slug === typeString
            );
            if (typeInfoFromDataTypes) {
              targetTypeSlug = typeInfoFromDataTypes.slug;
            }
          }
        }
      }
      let strokeStyle;
      if (sourceTypeSlug === targetTypeSlug) {
        strokeStyle = sourceColor;
      } else {
        const gradientKey = `gradient-${sourceTypeSlug}-${targetTypeSlug}`;
        strokeStyle = `url(#${gradientKey})`;
        activeGradientKeys.add(gradientKey);
      }

      return {
        ...edge,
        style: {
          ...edge.style,
          stroke: strokeStyle,
          strokeWidth: 2
        }
      };
    });

    return { processedEdges: processedResultEdges, activeGradientKeys };
    // `nodes` is a necessary dependency here to ensure correct edge type determination
    // when workflows are loaded, as `getNode`'s output depends on the `nodes` array being
    // fully populated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, nodes, getNode, dataTypes, getMetadata]);
}
