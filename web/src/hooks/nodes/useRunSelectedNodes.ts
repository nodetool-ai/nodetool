import { useCallback } from "react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useNotificationStore } from "../../stores/NotificationStore";
import useResultsStore from "../../stores/ResultsStore";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { resolveExternalEdgeValue } from "../../utils/edgeValue";
import { useNodeStoreRef } from "../../contexts/NodeContext";
import log from "loglevel";

interface UseRunSelectedNodesReturn {
  runSelectedNodes: () => void;
  isWorkflowRunning: boolean;
}

export function useRunSelectedNodes(): UseRunSelectedNodesReturn {
  const nodeStore = useNodeStoreRef();

  const run = useWebsocketRunner((state) => state.run);
  const isWorkflowRunning = useWebsocketRunner((state) => state.state === "running");
  const getResult = useResultsStore((state) => state.getResult);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const runSelectedNodes = useCallback(() => {
    if (isWorkflowRunning) {
      return;
    }

    const { edges, workflow, findNode, getSelectedNodes } =
      nodeStore.getState();

    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length === 0) {
      return;
    }

    const selectedNodeIds = new Set(selectedNodes.map((n: Node<NodeData>) => n.id));

    // Only include edges where both source and target are selected
    const selectedEdges = edges.filter(
      (edge: Edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
    );

    // Find edges coming into selected nodes from non-selected nodes
    const externalInputEdges = edges.filter(
      (edge: Edge) =>
        selectedNodeIds.has(edge.target) && !selectedNodeIds.has(edge.source)
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

      log.info(
        `Run selected nodes: Caching property ${targetHandle} on node ${targetNodeId} from upstream node ${sourceNodeId}`,
        {
          sourceHandle,
          valueSource: isFallback ? "node" : "cached_result"
        }
      );
    }

    const nodesWithCachedValues = selectedNodes.map((n: Node<NodeData>) => {
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

    log.info("Running workflow from selected nodes", {
      startNodeIds: selectedNodes.map((n: Node<NodeData>) => n.id),
      nodeCount: nodesWithCachedValues.length,
      edgeCount: selectedEdges.length
    });

    run({}, workflow, nodesWithCachedValues, selectedEdges, undefined, selectedNodeIds);

    addNotification({
      type: "info",
      alert: false,
      content: `Running workflow from ${selectedNodes.length} selected node${selectedNodes.length > 1 ? "s" : ""}`
    });
  }, [
    isWorkflowRunning,
    nodeStore,
    getResult,
    run,
    addNotification
  ]);

  return {
    runSelectedNodes,
    isWorkflowRunning
  };
}
