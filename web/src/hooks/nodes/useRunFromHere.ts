import { useCallback } from "react";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useNotificationStore } from "../../stores/NotificationStore";
import useResultsStore from "../../stores/ResultsStore";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import useMetadataStore from "../../stores/MetadataStore";
import { subgraph } from "../../core/graph";
import { resolveExternalEdgeValue } from "../../utils/edgeValue";
import { useNodes } from "../../contexts/NodeContext";
import log from "loglevel";

interface UseRunFromHereReturn {
  runFromHere: () => void;
  isWorkflowRunning: boolean;
}

/**
 * Hook to run a workflow starting from a specific node.
 * Extracts the downstream subgraph and injects cached values from upstream nodes.
 *
 * @param node - The node to start execution from
 * @returns Object with runFromHere handler and workflow running state
 */
export function useRunFromHere(
  node: Node<NodeData> | null | undefined
): UseRunFromHereReturn {
  const { nodes, edges, workflow, findNode } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    workflow: state.workflow,
    findNode: state.findNode
  }));

  const run = useWebsocketRunner((state) => state.run);
  const isWorkflowRunning = useWebsocketRunner(
    (state) => state.state === "running"
  );
  const getResult = useResultsStore((state) => state.getResult);
  const metadata = useMetadataStore((state) =>
    state.getMetadata(node?.type ?? "")
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const runFromHere = useCallback(() => {
    if (!node || isWorkflowRunning) {
      return;
    }

    const nodeId = node.id;
    const downstream = subgraph(edges, nodes, node);
    const subgraphNodeIds = new Set(downstream.nodes.map((n) => n.id));

    const externalInputEdges = edges.filter(
      (edge) =>
        subgraphNodeIds.has(edge.target) && !subgraphNodeIds.has(edge.source)
    );

    const nodePropertyOverrides = new Map<string, Record<string, any>>();

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

    const nodesWithOverrides = nodePropertyOverrides.size;
    const totalPropertiesInjected = Array.from(
      nodePropertyOverrides.values()
    ).reduce((sum, props) => sum + Object.keys(props).length, 0);

    log.info("Running downstream subgraph from node", {
      startNodeId: nodeId,
      nodeCount: nodesWithCachedValues.length,
      edgeCount: downstream.edges.length,
      nodesWithCachedDependencies: nodesWithOverrides,
      totalCachedPropertiesInjected: totalPropertiesInjected
    });

    run({}, workflow, nodesWithCachedValues, downstream.edges);

    addNotification({
      type: "info",
      alert: false,
      content: `Running workflow from ${
        metadata?.title || node?.type || "node"
      }`
    });
  }, [
    node,
    isWorkflowRunning,
    edges,
    nodes,
    workflow,
    getResult,
    run,
    addNotification,
    metadata,
    findNode
  ]);

  return {
    runFromHere,
    isWorkflowRunning
  };
}
