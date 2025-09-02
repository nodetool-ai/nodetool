import { useMemo } from "react";
import { Edge, Node } from "@xyflow/react";
import { DataType } from "../config/data_types";
import { NodeMetadata } from "../stores/ApiTypes";
import { findOutputHandle, findInputHandle } from "../utils/handleUtils";
import { NodeData } from "../stores/NodeData";

interface ProcessedEdgesOptions {
  edges: Edge[];
  nodes: Node<NodeData>[];
  dataTypes: DataType[];
  getMetadata: (nodeType: string) => NodeMetadata | undefined;
  workflowId?: string;
  edgeStatuses?: Record<string, string>;
}

interface ProcessedEdgesResult {
  processedEdges: Edge[];
  activeGradientKeys: Set<string>;
}

export function useProcessedEdges({
  edges,
  nodes,
  dataTypes,
  getMetadata,
  workflowId,
  edgeStatuses
}: ProcessedEdgesOptions): ProcessedEdgesResult {
  return useMemo(() => {
    const getNode = (id: string) => nodes.find((node) => node.id === id);
    const activeGradientKeys = new Set<string>();

    const REROUTE_TYPE = "nodetool.control.Reroute";
    const REROUTE_INPUT = "input_value";
    const REROUTE_OUTPUT = "output";

    function typeInfoFromTypeString(typeString: string | undefined): {
      slug: string;
      color: string;
    } {
      if (!typeString) {
        const anyType = dataTypes.find((dt) => dt.slug === "any");
        return {
          slug: anyType?.slug || "any",
          color: anyType?.color || "#888"
        };
      }
      const typeInfoFromDataTypes = dataTypes.find(
        (dt) =>
          dt.value === typeString ||
          dt.name === typeString ||
          dt.slug === typeString
      );
      return {
        slug: typeInfoFromDataTypes?.slug || "any",
        color:
          typeInfoFromDataTypes?.color ||
          dataTypes.find((dt) => dt.slug === "any")?.color ||
          "#888"
      };
    }

    function getEffectiveSourceType(
      startNodeId: string,
      startHandle: string | null | undefined
    ): { slug: string; color: string } {
      // Walk upstream through chained reroute nodes to find the originating output type
      let currentNode = getNode(startNodeId);
      let currentHandle = startHandle || "";
      const visited = new Set<string>();

      while (
        currentNode &&
        currentNode.type === REROUTE_TYPE &&
        currentHandle === REROUTE_OUTPUT
      ) {
        if (visited.has(currentNode.id)) break;
        visited.add(currentNode.id);
        const incoming = edges.find(
          (e) =>
            e.target === currentNode!.id && e.targetHandle === REROUTE_INPUT
        );
        if (!incoming) break;
        currentNode = getNode(incoming.source);
        currentHandle = incoming.sourceHandle || "";
      }

      if (currentNode && currentHandle) {
        const sourceMetadata = getMetadata(currentNode.type || "");
        if (sourceMetadata) {
          const outputHandle = findOutputHandle(
            currentNode as any,
            currentHandle,
            sourceMetadata
          );
          if (outputHandle && outputHandle.type && outputHandle.type.type) {
            return typeInfoFromTypeString(outputHandle.type.type);
          }
        }
      }
      return typeInfoFromTypeString("any");
    }

    const processedResultEdges = edges.map((edge) => {
      const sourceNode = getNode(edge.source);
      const targetNode = getNode(edge.target);

      let sourceTypeSlug = "any";
      let sourceColor =
        dataTypes.find((dt) => dt.slug === "any")?.color || "#888";
      let targetTypeSlug = "any";

      // --- Source Type Detection (with reroute propagation) ---
      if (sourceNode && edge.sourceHandle) {
        const effective = getEffectiveSourceType(
          sourceNode.id,
          edge.sourceHandle
        );
        sourceTypeSlug = effective.slug;
        sourceColor = effective.color;
      }

      // --- Target Type Detection (treat reroute input as passthrough) ---
      if (targetNode && edge.targetHandle) {
        if (
          targetNode.type === REROUTE_TYPE &&
          edge.targetHandle === REROUTE_INPUT
        ) {
          // Ensure same color on incoming edge to reroute
          targetTypeSlug = sourceTypeSlug;
        } else if (targetNode.type) {
          const targetMetadata = getMetadata(targetNode.type);
          if (targetMetadata) {
            const inputHandle = findInputHandle(
              targetNode as any,
              edge.targetHandle,
              targetMetadata
            );
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
      }
      let strokeStyle;
      if (sourceTypeSlug === targetTypeSlug) {
        strokeStyle = sourceColor;
      } else {
        const gradientKey = `gradient-${sourceTypeSlug}-${targetTypeSlug}`;
        strokeStyle = `url(#${gradientKey})`;
        activeGradientKeys.add(gradientKey);
      }

      // Build edge CSS class names (type slugs + transient statuses)
      const classes: string[] = [];
      if (sourceTypeSlug) classes.push(sourceTypeSlug);
      if (targetTypeSlug && targetTypeSlug !== sourceTypeSlug)
        classes.push(targetTypeSlug);

      // If we have a status for this edge and it's a message_sent, tag it
      const statusKey =
        workflowId && edge.id ? `${workflowId}:${edge.id}` : undefined;
      const status = statusKey ? edgeStatuses?.[statusKey] : undefined;
      if (status === "message_sent") {
        classes.push("message-sent");
      }

      return {
        ...edge,
        className: [edge.className, ...classes].filter(Boolean).join(" "),
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
  }, [edges, nodes, dataTypes, getMetadata, workflowId, edgeStatuses]);
}
