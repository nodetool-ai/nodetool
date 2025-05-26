import { useMemo } from "react";
import { Edge, Node } from "@xyflow/react";
import { DataType } from "../config/data_types"; // Removed DATA_TYPES import, will pass dataTypes as prop
import { NodeMetadata } from "../stores/ApiTypes"; // Assuming NodeMetadata is exported

interface ProcessedEdgesOptions {
  edges: Edge[];
  nodes: Node[];
  getNode: (id: string) => Node | undefined;
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
    const startTime = performance.now();
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
        if (sourceMetadata && sourceMetadata.outputs) {
          const outputInfo = sourceMetadata.outputs.find(
            (o) => o.name === edge.sourceHandle
          );
          if (outputInfo && outputInfo.type && outputInfo.type.type) {
            const typeString = outputInfo.type.type;
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
        if (targetMetadata && targetMetadata.properties) {
          const inputInfo = targetMetadata.properties.find(
            (p) => p.name === edge.targetHandle
          );
          if (inputInfo && inputInfo.type && inputInfo.type.type) {
            const typeString = inputInfo.type.type;
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

    const endTime = performance.now();
    return { processedEdges: processedResultEdges, activeGradientKeys };
  }, [edges, nodes, getNode, dataTypes, getMetadata]);
}
