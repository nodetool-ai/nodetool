import { useMemo, useRef } from "react";
import { Edge, Node } from "@xyflow/react";
import { DataType } from "../config/data_types";
import { NodeMetadata } from "../stores/ApiTypes";
import { findOutputHandle, findInputHandle } from "../utils/handleUtils";
import { NodeData } from "../stores/NodeData";

/**
 * Options for processing edges in the workflow graph.
 * Provides all data needed to compute edge types, colors, and status.
 */
interface ProcessedEdgesOptions {
  /** All edges in the workflow graph */
  edges: Edge[];
  /** All nodes in the workflow graph */
  nodes: Node<NodeData>[];
  /** Available data types for type checking */
  dataTypes: DataType[];
  /** Function to get node metadata by node type */
  getMetadata: (nodeType: string) => NodeMetadata | undefined;
  /** Optional workflow ID for status tracking */
  workflowId?: string;
  /** Optional edge status map for execution visualization */
  edgeStatuses?: Record<string, { status: string; counter?: number }>;
  /** Optional node status map - used to animate edges when source node is running */
  nodeStatuses?: Record<string, string | Record<string, unknown> | null | undefined>;
  /** true while the selection rectangle is being dragged */
  isSelecting?: boolean;
}

/**
 * Result of edge processing containing styled edges and gradient keys.
 */
interface ProcessedEdgesResult {
  /** Edges with computed styles, types, and status */
  processedEdges: Edge[];
  /** Set of gradient keys needed for SVG gradient definitions */
  activeGradientKeys: Set<string>;
}

/**
 * Hook that processes workflow edges to add type information, styling, and status.
 * This hook performs several critical transformations:
 * 
 * 1. **Type Resolution**: Determines the effective data type of each edge by
 *    tracing through Reroute nodes and looking up handle types in node metadata.
 * 
 * 2. **Visual Styling**: Computes edge colors based on source and target types.
 *    Matching types get solid colors, different types get gradient strokes.
 * 
 * 3. **Execution Status**: Adds status classes and labels for edges with data flowing.
 *    Message counters are displayed on edges with "message_sent" status.
 * 
 * 4. **Optimization**: Uses caching during selection drag operations to prevent
 *    expensive recalculations while the user is selecting nodes.
 * 
 * The hook implements several performance optimizations:
 * - O(1) data type lookups using Map structures
 * - Result caching during selection rectangle drag
 * - Lazy evaluation with useMemo to avoid unnecessary recalculations
 * 
 * @param options - Configuration for edge processing
 * @returns Processed edges with computed styles and metadata
 * 
 * @example
 * ```typescript
 * const { processedEdges, activeGradientKeys } = useProcessedEdges({
 *   edges,
 *   nodes,
 *   dataTypes,
 *   getMetadata: (type) => metadataByType[type],
 *   workflowId: currentWorkflow?.id,
 *   edgeStatuses: statusStore.edgeStatuses
 * });
 * 
 * // Render edges with processed styles
 * processedEdges.map(edge => <Edge key={edge.id} {...edge} />);
 * ```
 * 
 * @example
 * **Type Resolution Example**:
 * ```
 * Source (Text) --[string]--> Reroute --[string]--> Target (LLM)
 * ```
 * The edge type is resolved by tracing through the Reroute node to find
 * the original Text output type.
 * 
 * @example
 * **Gradient Generation**:
 * - Matching types (Text → Text): Solid color stroke
 * - Different types (Image → Audio): Gradient stroke between colors
 * - Gradients defined in SVG as `url(#gradient-{source}-{target})`
 */
export function useProcessedEdges({
  edges,
  nodes,
  dataTypes,
  getMetadata,
  workflowId,
  edgeStatuses,
  nodeStatuses,
  isSelecting
}: ProcessedEdgesOptions): ProcessedEdgesResult {
  // Keep latest nodes without making them a hard dependency of the memo
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Cache last result so we can reuse it during drag
  const lastResultRef = useRef<ProcessedEdgesResult>({
    processedEdges: [],
    activeGradientKeys: new Set()
  });

  // Structural key: only things that affect edge typing / gradients
  const [_nodesStructureKey] = useMemo(() => {
    if (isSelecting) {return "";} // we’ll reuse cache while dragging
    return nodes
      .map((n) => {
        const dynamicOutputs = n.data.dynamic_outputs
          ? Object.keys(n.data.dynamic_outputs).join(",")
          : "";
        const dynamicProps = n.data.dynamic_properties
          ? Object.keys(n.data.dynamic_properties).join(",")
          : "";
        return `${n.id}:${n.type}:${dynamicOutputs}:${dynamicProps}`;
      })
      .join("|");
  }, [nodes, isSelecting]);

  return useMemo(() => {
    // While dragging the rectangle, just reuse the last processed edges
    if (isSelecting && lastResultRef.current.processedEdges.length > 0) {
      return lastResultRef.current;
    }

    const currentNodes = nodesRef.current;
    const nodeMap = new Map(currentNodes.map((node) => [node.id, node]));
    const getNode = (id: string) => nodeMap.get(id);

    const activeGradientKeys = new Set<string>();

    const REROUTE_TYPE = "nodetool.control.Reroute";
    const REROUTE_INPUT = "input_value";
    const REROUTE_OUTPUT = "output";

    // Optimization: Build maps for O(1) dataType lookups instead of repeated find() calls
    const dataTypeBySlug = new Map(dataTypes.map((dt) => [dt.slug, dt]));
    const dataTypeByValue = new Map(dataTypes.map((dt) => [dt.value, dt]));
    const dataTypeByName = new Map(dataTypes.map((dt) => [dt.name, dt]));
    const anyType = dataTypeBySlug.get("any");
    const defaultColor = anyType?.color || "#888";

    function typeInfoFromTypeString(typeString: string | undefined): {
      slug: string;
      color: string;
    } {
      if (!typeString) {
        return {
          slug: anyType?.slug || "any",
          color: defaultColor
        };
      }
      const t = dataTypeByValue.get(typeString) || 
                dataTypeByName.get(typeString) || 
                dataTypeBySlug.get(typeString);
      return {
        slug: t?.slug || "any",
        color: t?.color || defaultColor
      };
    }

    function getEffectiveSourceType(
      startNodeId: string,
      startHandle: string | null | undefined
    ): { slug: string; color: string } {
      let currentNode = getNode(startNodeId);
      let currentHandle = startHandle || "";
      const visited = new Set<string>();

      while (
        currentNode &&
        currentNode.type === REROUTE_TYPE &&
        currentHandle === REROUTE_OUTPUT
      ) {
        if (visited.has(currentNode.id)) {break;}
        visited.add(currentNode.id);

        const incoming = edges.find(
          (e) =>
            e.target === currentNode!.id && e.targetHandle === REROUTE_INPUT
        );
        if (!incoming) {break;}
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
          if (outputHandle && outputHandle.type?.type) {
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
      let sourceColor = defaultColor;
      let targetTypeSlug = "any";

      if (sourceNode && edge.sourceHandle) {
        const effective = getEffectiveSourceType(
          sourceNode.id,
          edge.sourceHandle
        );
        sourceTypeSlug = effective.slug;
        sourceColor = effective.color;
      }

      if (targetNode && edge.targetHandle) {
        if (
          targetNode.type === REROUTE_TYPE &&
          edge.targetHandle === REROUTE_INPUT
        ) {
          targetTypeSlug = sourceTypeSlug;
        } else if (targetNode.type) {
          const targetMetadata = getMetadata(targetNode.type);
          if (targetMetadata) {
            const inputHandle = findInputHandle(
              targetNode as any,
              edge.targetHandle,
              targetMetadata
            );
            if (inputHandle?.type?.type) {
              const typeString = inputHandle.type.type;
              // Optimization: Use map lookup instead of find
              const t = dataTypeByValue.get(typeString) || 
                        dataTypeByName.get(typeString) || 
                        dataTypeBySlug.get(typeString);
              if (t) {
                targetTypeSlug = t.slug;
              }
            }
          }
        }
      }

      let strokeStyle: string;
      if (sourceTypeSlug === targetTypeSlug) {
        strokeStyle = sourceColor;
      } else {
        const gradientKey = `gradient-${sourceTypeSlug}-${targetTypeSlug}`;
        strokeStyle = `url(#${gradientKey})`;
        activeGradientKeys.add(gradientKey);
      }

      const classes: string[] = [];
      if (sourceTypeSlug) {classes.push(sourceTypeSlug);}
      if (targetTypeSlug && targetTypeSlug !== sourceTypeSlug) {
        classes.push(targetTypeSlug);
      }

      // Add class if source or target node is bypassed
      const isSourceBypassed = sourceNode?.data?.bypassed;
      const isTargetBypassed = targetNode?.data?.bypassed;
      if (isSourceBypassed || isTargetBypassed) {
        classes.push("from-bypassed");
      }

      // Add class if source node is a streaming output
      if (sourceNode?.type) {
        const sourceMetadata = getMetadata(sourceNode.type);
        if (sourceMetadata?.is_streaming_output) {
          classes.push("streaming-edge");
        }
      }

      const statusKey =
        workflowId && edge.id ? `${workflowId}:${edge.id}` : undefined;
      const statusObj = statusKey ? edgeStatuses?.[statusKey] : undefined;
      const status = statusObj?.status;
      const counter = statusObj?.counter;

      // Check if source node is running - animate edges from running nodes
      const sourceNodeStatusKey = workflowId ? `${workflowId}:${edge.source}` : undefined;
      const sourceNodeStatus = sourceNodeStatusKey ? nodeStatuses?.[sourceNodeStatusKey] : undefined;
      const isSourceRunning = sourceNodeStatus === "running" || sourceNodeStatus === "starting" || sourceNodeStatus === "booting";
      
      if (status === "message_sent" || isSourceRunning) {
        classes.push("message-sent");
      }

      const edgeLabel = counter && counter > 1 ? `${counter}` : undefined;
      return {
        ...edge,
        label: edgeLabel,
        labelStyle: {
          fill: "white",
          fontWeight: 600,
          fontSize: "10px"
        },
        labelBgStyle: {
          fill: "rgba(0, 0, 0, 0.4)",
          fillOpacity: 1,
          rx: 10,
          ry: 10
        },
        labelBgPadding: [6, 2] as [number, number],
        className: [edge.className, ...classes].filter(Boolean).join(" "),
        style: {
          ...edge.style,
          stroke: strokeStyle,
          strokeWidth: 2
        },
        data: {
          ...edge.data,
          status: status || null,
          counter: counter || null
        }
      };
    });

    const result = { processedEdges: processedResultEdges, activeGradientKeys };
    lastResultRef.current = result;
    return result;
  }, [edges, dataTypes, getMetadata, workflowId, edgeStatuses, nodeStatuses, isSelecting]);
}
