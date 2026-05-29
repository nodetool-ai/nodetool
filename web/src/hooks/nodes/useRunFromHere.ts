import { useCallback, useRef, useState } from "react";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useNotificationStore } from "../../stores/NotificationStore";
import useResultsStore from "../../stores/ResultsStore";
import useMetadataStore from "../../stores/MetadataStore";
import { subgraph } from "../../core/graph";
import { resolveExternalEdgeValue } from "../../utils/edgeValue";
import { useNodes } from "../../contexts/NodeContext";
import { shallow } from "zustand/shallow";
import { runInlineGraphJob } from "../../lib/workflow/runInlineGraphJob";
import { reactFlowNodeToGraphNode } from "../../stores/reactFlowNodeToGraphNode";
import { reactFlowEdgeToGraphEdge } from "../../stores/reactFlowEdgeToGraphEdge";

interface UseRunFromHereReturn {
  runFromHere: () => void;
  /**
   * True while the run started from THIS node is in flight. It does NOT reflect
   * the main workflow run or runs started from other nodes: each "Run From Here"
   * is dispatched as its own job, so they execute concurrently (capped/queued by
   * the backend's MAX_CONCURRENT_JOBS). This flag only gates re-firing the same
   * node and drives this button's "Running…" state.
   */
  isWorkflowRunning: boolean;
}

/**
 * Hook to run a workflow starting from a specific node.
 * Extracts the downstream subgraph and injects cached values from upstream nodes.
 *
 * The run is dispatched as an independent job (not the shared per-workflow
 * runner), so multiple nodes can be fired off in tandem and the backend caps
 * concurrency, queueing the overflow.
 *
 * @param node - The node to start execution from
 * @returns Object with runFromHere handler and this node's running state
 */
export function useRunFromHere(
  node: Node<NodeData> | null | undefined
): UseRunFromHereReturn {
  const { nodes, edges, workflow, findNode } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    workflow: state.workflow,
    findNode: state.findNode
  }), shallow);

  const getResult = useResultsStore((state) => state.getResult);
  const metadata = useMetadataStore((state) =>
    state.getMetadata(node?.type ?? "")
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const [isWorkflowRunning, setIsRunning] = useState(false);
  // Synchronous guard so a rapid double-click doesn't fire the same node twice.
  const inFlightRef = useRef(false);

  const runFromHere = useCallback(() => {
    if (!node || inFlightRef.current) {
      return;
    }

    const nodeId = node.id;
    const downstream = subgraph(edges, nodes, node);
    const subgraphNodeIds = new Set(downstream.nodes.map((n) => n.id));

    const externalInputEdges = edges.filter(
      (edge) =>
        subgraphNodeIds.has(edge.target) && !subgraphNodeIds.has(edge.source)
    );

    const nodePropertyOverrides = new Map<string, Record<string, unknown>>();

    for (const edge of externalInputEdges) {
      const sourceNodeId = edge.source;
      const sourceHandle = edge.sourceHandle;
      const targetNodeId = edge.target;
      const targetHandle = edge.targetHandle;

      if (!targetHandle) {
        continue;
      }

      const { value, hasValue, isFallback } = resolveExternalEdgeValue(
        edge,
        workflow.id,
        getResult,
        findNode
      );
      if (!hasValue) {
        continue;
      }

      const existing = nodePropertyOverrides.get(targetNodeId) || {};
      existing[targetHandle] = value;
      nodePropertyOverrides.set(targetNodeId, existing);

      console.info(
        `Run from here: Caching property ${targetHandle} on node ${targetNodeId} from upstream node ${sourceNodeId}`,
        {
          sourceHandle,
          valueSource: isFallback ? "node" : "cached_result"
        }
      );
    }

    const nodesWithCachedValues = downstream.nodes.map((n) => {
      const overrides = nodePropertyOverrides.get(n.id);
      if (overrides && Object.keys(overrides).length > 0) {
        const dynamicProps = n.data?.dynamic_properties || {};
        const staticProps = n.data?.properties || {};
        const updatedDynamicProps = { ...dynamicProps };
        const updatedStaticProps = { ...staticProps };

        for (const [key, value] of Object.entries(overrides)) {
          if (Object.prototype.hasOwnProperty.call(dynamicProps, key)) {
            updatedDynamicProps[key] = value;
          } else {
            updatedStaticProps[key] = value;
          }
        }

        return {
          ...n,
          data: {
            ...n.data,
            properties: {
              ...updatedStaticProps
            },
            dynamic_properties: {
              ...updatedDynamicProps
            }
          }
        };
      }
      return n;
    });

    const graph = {
      nodes: nodesWithCachedValues.map(reactFlowNodeToGraphNode),
      edges: downstream.edges.map(reactFlowEdgeToGraphEdge)
    };

    const nodesWithOverrides = nodePropertyOverrides.size;
    const totalPropertiesInjected = Array.from(
      nodePropertyOverrides.values()
    ).reduce((sum, props) => sum + Object.keys(props).length, 0);

    console.info("Running downstream subgraph from node", {
      startNodeId: nodeId,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      nodesWithCachedDependencies: nodesWithOverrides,
      totalCachedPropertiesInjected: totalPropertiesInjected
    });

    // Dispatch as an independent job so multiple nodes run in tandem; the
    // backend caps concurrency and queues the overflow.
    inFlightRef.current = true;
    setIsRunning(true);
    void runInlineGraphJob({ graph, workflowId: workflow.id }).finally(() => {
      inFlightRef.current = false;
      setIsRunning(false);
    });

    addNotification({
      type: "info",
      alert: false,
      content: `Running workflow from ${
        metadata?.title || node?.type || "node"
      }`
    });
  }, [
    node,
    edges,
    nodes,
    workflow,
    getResult,
    addNotification,
    metadata,
    findNode
  ]);

  return {
    runFromHere,
    isWorkflowRunning
  };
}
