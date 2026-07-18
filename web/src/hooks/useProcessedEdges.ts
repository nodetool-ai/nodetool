import { useMemo, useRef } from "react";
import { Edge, Node } from "@xyflow/react";
import { DataType } from "../config/data_types";
import { NodeMetadata } from "../stores/ApiTypes";
import { findOutputHandle, findInputHandle } from "../utils/handleUtils";
import { NodeData } from "../stores/NodeData";
import { forwardInputHandle, isForwardInput } from "../utils/forwardOutputs";
import { nodeKey, edgeKey } from "../stores/nodeKey";
import { MOTION } from "../components/ui_primitives";

interface ProcessedEdgesOptions {
  edges: Edge[];
  nodes: Node<NodeData>[];
  dataTypes: DataType[];
  getMetadata: (nodeType: string) => NodeMetadata | undefined;
  workflowId?: string;
  /**
   * Focused run for the workflow. Edge-status and node-status keys are
   * `${workflowId}:${focusedJobId}:${id}` (id = edge.id or edge.source); when
   * undefined, both are treated as empty (no focused run to display).
   */
  focusedJobId?: string;
  edgeStatuses?: Record<string, { status: string; counter?: number }>;
  nodeStatuses?: Record<string, string | Record<string, unknown> | null | undefined>;
  isSelecting?: boolean;
}

interface ProcessedEdgesResult {
  processedEdges: Edge[];
  activeGradientKeys: Set<string>;
}

// Global cache for node structure strings to avoid expensive object iteration during drag
// WeakMap ensures entries are cleaned up when NodeData objects are garbage collected
const structureCache = new WeakMap<NodeData, string>();

/**
 * Internal hook that processes structural aspects of edges (types, gradients, styles).
 * Separated from status updates to avoid expensive recalculations during execution.
 */
function useStructurallyProcessedEdges({
  edges,
  nodes,
  dataTypes,
  getMetadata,
  isSelecting
}: Pick<ProcessedEdgesOptions, "edges" | "nodes" | "dataTypes" | "getMetadata" | "isSelecting">): ProcessedEdgesResult {
  // Keep latest nodes without making them a hard dependency of the memo
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Cache last result so we can reuse it during drag
  const lastResultRef = useRef<ProcessedEdgesResult>({
    processedEdges: [],
    activeGradientKeys: new Set()
  });

  // Structural key: only things that affect edge typing / gradients.
  // Uses the global WeakMap `structureCache` keyed on `n.data` identity,
  // so position-only drags (which keep the same `data` ref) hit the cache
  // for every node and skip the expensive `.join()` entirely.
  const prevStructureKeyRef = useRef("");
  const prevStructureCountRef = useRef(0);
  const nodesStructureKey = useMemo(() => {
    if (isSelecting) {return "";} // we’ll reuse cache while dragging
    let changed = nodes.length !== prevStructureCountRef.current;
    const parts: string[] = [];
    for (const n of nodes) {
      let cached = structureCache.get(n.data);
      if (cached === undefined) {
        changed = true;
        const dynamicOutputs = n.data.dynamic_outputs
          ? Object.keys(n.data.dynamic_outputs).join(",")
          : "";
        const dynamicProps = n.data.dynamic_properties
          ? Object.keys(n.data.dynamic_properties).join(",")
          : "";
        cached = `${dynamicOutputs}:${dynamicProps}`;
        structureCache.set(n.data, cached);
      }
      parts.push(`${n.id}:${n.type}:${cached}`);
    }
    if (!changed) return prevStructureKeyRef.current;
    const result = parts.join("|");
    prevStructureKeyRef.current = result;
    prevStructureCountRef.current = nodes.length;
    return result;
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

    // Precompute the incoming edge feeding each (target, handle) so chasing a
    // forward chain (Reroute / If / Switch) is O(1) per hop instead of an O(E)
    // `edges.find` (which made forward-heavy graphs O(E²) on every structural
    // recompute).
    const incomingByTargetHandle = new Map<string, Edge>();
    for (const edge of edges) {
      if (!edge.targetHandle) continue;
      const key = `${edge.target}\u0000${edge.targetHandle}`;
      if (!incomingByTargetHandle.has(key)) {
        incomingByTargetHandle.set(key, edge);
      }
    }

    // Optimization: Build maps for O(1) dataType lookups instead of repeated find() calls
    const dataTypeBySlug = new Map(dataTypes.map((dt) => [dt.slug, dt]));
    const dataTypeByValue = new Map(dataTypes.map((dt) => [dt.value, dt]));
    const dataTypeByName = new Map(dataTypes.map((dt) => [dt.name, dt]));
    const anyType = dataTypeBySlug.get("any");
    const defaultColor = anyType?.color || "#888";

    function typeInfoFromTypeString(typeString: string | undefined): {
      slug: string;
      color: string;
      label: string;
    } {
      if (!typeString) {
        return {
          slug: anyType?.slug || "any",
          color: defaultColor,
          label: anyType?.label || "Any"
        };
      }
      const t = dataTypeByValue.get(typeString) || 
                dataTypeByName.get(typeString) || 
                dataTypeBySlug.get(typeString);
      return {
        slug: t?.slug || "any",
        color: t?.color || defaultColor,
        label: t?.label || "Any"
      };
    }

    function getEffectiveSourceType(
      startNodeId: string,
      startHandle: string | null | undefined
    ): { slug: string; color: string; label: string } {
      let currentNode = getNode(startNodeId);
      let currentHandle = startHandle || "";
      const visited = new Set<string>();

      // Follow forward nodes (Reroute / If / Switch) back to the true source so
      // the edge adopts the upstream type instead of the declared `any`.
      while (currentNode) {
        const inputHandle = forwardInputHandle(currentNode.type, currentHandle);
        if (!inputHandle) {break;}
        if (visited.has(currentNode.id)) {break;}
        visited.add(currentNode.id);

        const incoming = incomingByTargetHandle.get(
          `${currentNode.id}\u0000${inputHandle}`
        );
        if (!incoming) {break;}
        currentNode = getNode(incoming.source);
        currentHandle = incoming.sourceHandle || "";
      }

      if (currentNode && currentHandle) {
        const sourceMetadata = getMetadata(currentNode.type || "");
        if (sourceMetadata) {
          const outputHandle = findOutputHandle(
            currentNode as Node<NodeData>,
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
      // Control edges are rendered by the ControlEdge component - preserve type and skip processing
      if (edge.type === "control" || edge.data?.edge_type === "control") {
        return {
          ...edge,
          type: "control",
          className: [edge.className, "control-edge"].filter(Boolean).join(" ")
        };
      }

      const sourceNode = getNode(edge.source);
      const targetNode = getNode(edge.target);
      let normalizedSourceHandle = edge.sourceHandle;
      let normalizedTargetHandle = edge.targetHandle;

      if (sourceNode?.type && edge.sourceHandle) {
        const sourceMetadata = getMetadata(sourceNode.type);
        if (sourceMetadata) {
          const sourceHandle = findOutputHandle(
            sourceNode as Node<NodeData>,
            edge.sourceHandle,
            sourceMetadata
          );
          if (sourceHandle?.name) {
            normalizedSourceHandle = sourceHandle.name;
          }
        }
      }

      if (targetNode?.type && edge.targetHandle) {
        const targetMetadata = getMetadata(targetNode.type);
        if (targetMetadata) {
          const targetHandle = findInputHandle(
            targetNode as Node<NodeData>,
            edge.targetHandle,
            targetMetadata
          );
          if (targetHandle?.name) {
            normalizedTargetHandle = targetHandle.name;
          }
        }
      }

      let sourceTypeSlug = "any";
      let sourceColor = defaultColor;
      let sourceTypeLabel = "Any";
      let targetTypeSlug = "any";

      if (sourceNode && normalizedSourceHandle) {
        const effective = getEffectiveSourceType(
          sourceNode.id,
          normalizedSourceHandle
        );
        sourceTypeSlug = effective.slug;
        sourceColor = effective.color;
        sourceTypeLabel = effective.label;
      }

      if (targetNode && normalizedTargetHandle) {
        if (isForwardInput(targetNode.type, normalizedTargetHandle)) {
          targetTypeSlug = sourceTypeSlug;
        } else if (targetNode.type) {
          const targetMetadata = getMetadata(targetNode.type);
          if (targetMetadata) {
            const inputHandle = findInputHandle(
              targetNode as Node<NodeData>,
              normalizedTargetHandle,
              targetMetadata
            );
            if (inputHandle?.type?.type) {
              const typeString = inputHandle.type.type;
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

      return {
        ...edge,
        sourceHandle: normalizedSourceHandle,
        targetHandle: normalizedTargetHandle,
        className: [edge.className, ...classes].filter(Boolean).join(" "),
        style: {
          ...edge.style,
          stroke: strokeStyle,
          // A4: unselected edges use 1.5px stroke. Selected edges are
          // promoted to 2px + glow in CustomEdge (CSS controls hover/selected).
          strokeWidth: 1.5,
          transition: `stroke ${MOTION.normal}, stroke-width ${MOTION.fast}, filter ${MOTION.normal}`
        },
        data: {
          ...edge.data,
          dataTypeLabel: sourceTypeLabel,
          sourceTypeColor: sourceColor
        }
      };
    });

    const result = { processedEdges: processedResultEdges, activeGradientKeys };
    lastResultRef.current = result;
    // Reference nodesStructureKey to satisfy eslint and document it as an intentional dependency.
    void nodesStructureKey;
    return result;
  }, [edges, dataTypes, getMetadata, isSelecting, nodesStructureKey]);
}

/**
 * Processes workflow edges to add type information, styling, and status.
 * Resolves each edge's effective type (tracing through Reroute nodes), colors
 * it (solid for matching source/target types, gradient otherwise), and adds
 * execution status. Splits the expensive structural pass from the cheap,
 * frequent status pass, and caches results during selection drag.
 */
export function useProcessedEdges({
  edges,
  nodes,
  dataTypes,
  getMetadata,
  workflowId,
  focusedJobId,
  edgeStatuses,
  nodeStatuses,
  isSelecting
}: ProcessedEdgesOptions): ProcessedEdgesResult {
  // 1. Structural Pass (Heavy)
  // Calculates types, gradients, and static classes based on graph topology
  const structuralResult = useStructurallyProcessedEdges({
    edges,
    nodes,
    dataTypes,
    getMetadata,
    isSelecting
  });

  // 2. Status Pass (Light)
  // Adds execution status classes and counters based on real-time execution state.
  // Uses a ref to preserve the previous result so that when no edge actually
  // changed we return the same array reference — preventing ReactFlow from
  // diffing all edges on every status store update.
  const prevStatusResultRef = useRef<ProcessedEdgesResult | null>(null);

  // Per-edge cache: an edge whose structural identity and status/counter/
  // running inputs are unchanged since the last pass reuses the SAME output
  // object, so the whole-array bail below succeeds even when only some
  // OTHER edge's status changed.
  const statusEdgeCacheRef = useRef(
    new Map<
      string,
      {
        structural: Edge;
        status: string | undefined;
        counter: number | undefined;
        running: boolean;
        out: Edge;
      }
    >()
  );

  return useMemo(() => {
    const { processedEdges: structuralEdges, activeGradientKeys } = structuralResult;
    const nextCache = new Map<string, {
      structural: Edge;
      status: string | undefined;
      counter: number | undefined;
      running: boolean;
      out: Edge;
    }>();

    const processedEdges = structuralEdges.map((edge) => {
      if (edge.type === "control") {
        return edge;
      }

      const statusKey =
        workflowId && focusedJobId && edge.id
          ? edgeKey(workflowId, focusedJobId, edge.id)
          : undefined;
      const statusObj = statusKey ? edgeStatuses?.[statusKey] : undefined;
      const status = statusObj?.status;
      const counter = statusObj?.counter;

      const sourceNodeStatusKey =
        workflowId && focusedJobId
          ? nodeKey(workflowId, focusedJobId, edge.source)
          : undefined;
      const sourceNodeStatus = sourceNodeStatusKey ? nodeStatuses?.[sourceNodeStatusKey] : undefined;
      const isSourceRunning = sourceNodeStatus === "running" || sourceNodeStatus === "starting" || sourceNodeStatus === "booting";

      const hasMessageSent = status === "message_sent" || isSourceRunning;

      if (!hasMessageSent && !status && !counter) {
        return edge;
      }

      const cached = statusEdgeCacheRef.current.get(edge.id);
      if (
        cached &&
        cached.structural === edge &&
        cached.status === status &&
        cached.counter === counter &&
        cached.running === isSourceRunning
      ) {
        nextCache.set(edge.id, cached);
        return cached.out;
      }

      const out = {
        ...edge,
        className: hasMessageSent
          ? [edge.className, "message-sent"].filter(Boolean).join(" ")
          : edge.className,
        data: {
          ...edge.data,
          status: status || null,
          counter: counter || null
        }
      };
      nextCache.set(edge.id, {
        structural: edge,
        status,
        counter,
        running: isSourceRunning,
        out
      });
      return out;
    });

    statusEdgeCacheRef.current = nextCache;

    const prev = prevStatusResultRef.current;
    if (
      prev &&
      prev.activeGradientKeys === activeGradientKeys &&
      prev.processedEdges.length === processedEdges.length &&
      prev.processedEdges.every((e, i) => e === processedEdges[i])
    ) {
      return prev;
    }

    const result = { processedEdges, activeGradientKeys };
    prevStatusResultRef.current = result;
    return result;
  }, [structuralResult, workflowId, focusedJobId, edgeStatuses, nodeStatuses]);
}
