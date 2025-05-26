import { useMemo } from "react";
import { Edge, Node } from "@xyflow/react";
import { DataType } from "../config/data_types"; // Removed DATA_TYPES import, will pass dataTypes as prop
import { NodeMetadata } from "../stores/ApiTypes"; // Assuming NodeMetadata is exported

interface ProcessedEdgesOptions {
  edges: Edge[];
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

      if (sourceNode && sourceNode.type && edge.sourceHandle) {
        const sourceMetadata = getMetadata(sourceNode.type);
        if (sourceMetadata && sourceMetadata.outputs) {
          const outputInfo = sourceMetadata.outputs.find(
            (o) => o.name === edge.sourceHandle
          );
          if (outputInfo && outputInfo.type && outputInfo.type.type) {
            const typeInfoFromDataTypes = dataTypes.find(
              (dt) =>
                dt.value === outputInfo.type.type ||
                dt.name === outputInfo.type.type ||
                dt.slug === outputInfo.type.type
            );
            if (typeInfoFromDataTypes) {
              sourceTypeSlug = typeInfoFromDataTypes.slug;
              sourceColor = typeInfoFromDataTypes.color;
            }
          }
        }
      }

      if (targetNode && targetNode.type && edge.targetHandle) {
        const targetMetadata = getMetadata(targetNode.type);
        if (targetMetadata && targetMetadata.properties) {
          const inputInfo = targetMetadata.properties.find(
            (p) => p.name === edge.targetHandle
          );
          if (inputInfo && inputInfo.type && inputInfo.type.type) {
            const targetTypeString = inputInfo.type.type;
            const typeInfoFromDataTypes = dataTypes.find(
              (dt) =>
                dt.value === targetTypeString ||
                dt.name === targetTypeString ||
                dt.slug === targetTypeString
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
    console.log(
      `[useProcessedEdges] Edge colors recalculated for ${
        edges.length
      } edges in ${(endTime - startTime).toFixed(
        2
      )} ms. Active gradient keys: ${activeGradientKeys.size}`
    );
    return { processedEdges: processedResultEdges, activeGradientKeys };
  }, [edges, getNode, dataTypes, getMetadata]);
}
