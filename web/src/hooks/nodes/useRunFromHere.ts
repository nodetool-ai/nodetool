import { useCallback } from "react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useNotificationStore } from "../../stores/NotificationStore";
import useResultsStore from "../../stores/ResultsStore";
import useMetadataStore from "../../stores/MetadataStore";
import { resolveExternalEdgeValue } from "../../utils/edgeValue";
import { useNodes } from "../../contexts/NodeContext";
import { shallow } from "zustand/shallow";
import { runInlineGraphJob } from "../../lib/workflow/runInlineGraphJob";
import { reactFlowNodeToGraphNode } from "../../stores/reactFlowNodeToGraphNode";

interface UseRunFromHereReturn {
  /** Run just this node as its own job (the "Run Node" action). */
  runFromHere: () => void;
  /**
   * Always false: each "Run Node" click dispatches an independent job, so the
   * button is never disabled — the backend caps concurrency and queues a run
   * when a running job already contains this node id. Kept for the consumers
   * that read it (NodeToolButtons, the context menu label).
   */
  isWorkflowRunning: boolean;
}

/**
 * Run a single node as its own job (the "Run Node" action). Inbound edges from
 * upstream nodes are resolved to their last cached result, so the node executes
 * with realistic inputs even though only this one node is sent.
 *
 * The run is dispatched as an independent job (not the shared per-workflow
 * runner), so different nodes run in tandem; the backend queues a run when a
 * job already contains this node id, so the same node never runs twice at once.
 */
export function useRunFromHere(
  node: Node<NodeData> | null | undefined
): UseRunFromHereReturn {
  const { edges, workflow, findNode } = useNodes(
    (state) => ({
      edges: state.edges,
      workflow: state.workflow,
      findNode: state.findNode
    }),
    shallow
  );
  const getResult = useResultsStore((state) => state.getResult);
  const metadata = useMetadataStore((state) =>
    state.getMetadata(node?.type ?? "")
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const runFromHere = useCallback(() => {
    if (!node || !workflow) {
      return;
    }

    const inbound = edges.filter((edge: Edge) => edge.target === node.id);
    const overrides: Record<string, unknown> = {};
    for (const edge of inbound) {
      if (!edge.targetHandle) {
        continue;
      }
      const { value, hasValue } = resolveExternalEdgeValue(
        edge,
        workflow.id,
        getResult,
        findNode
      );
      if (hasValue) {
        overrides[edge.targetHandle] = value;
      }
    }

    const dynamicProps = node.data?.dynamic_properties || {};
    const staticProps = node.data?.properties || {};
    const updatedDynamic = { ...dynamicProps };
    const updatedStatic = { ...staticProps };
    for (const [key, value] of Object.entries(overrides)) {
      if (Object.prototype.hasOwnProperty.call(dynamicProps, key)) {
        updatedDynamic[key] = value;
      } else {
        updatedStatic[key] = value;
      }
    }

    const nodeWithOverrides: Node<NodeData> = {
      ...node,
      data: {
        ...node.data,
        properties: updatedStatic,
        dynamic_properties: updatedDynamic
      }
    };

    const graph = {
      nodes: [reactFlowNodeToGraphNode(nodeWithOverrides)],
      edges: []
    };

    // Independent job; the backend queues it if a running job already contains
    // this node id, so the same node never executes twice concurrently.
    void runInlineGraphJob({ graph, workflowId: workflow.id });

    addNotification({
      type: "info",
      alert: false,
      content: `Running ${metadata?.title || node.type || "node"}`
    });
  }, [node, edges, workflow, getResult, findNode, metadata, addNotification]);

  return { runFromHere, isWorkflowRunning: false };
}
