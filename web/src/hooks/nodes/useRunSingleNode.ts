import { useCallback } from "react";
import { Edge, Node } from "@xyflow/react";

import { NodeData } from "../../stores/NodeData";
import { useNotificationStore } from "../../stores/NotificationStore";
import useResultsStore from "../../stores/ResultsStore";
import useWorkflowRunsStore from "../../stores/WorkflowRunsStore";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { resolveExternalEdgeValue } from "../../utils/edgeValue";
import { useNodeStoreRef } from "../../contexts/NodeContext";

interface UseRunSingleNodeReturn {
  runSingleNode: () => void;
  isWorkflowRunning: boolean;
}

/**
 * Run a single node by id. Inbound edges from non-selected upstream nodes
 * are resolved to their last cached result (same strategy as
 * `useRunSelectedNodes`), so the node executes with realistic inputs even
 * when only this one node is "in the subgraph".
 *
 * Used by bespoke editing bodies (e.g. MasksExtractorBody) that expose a
 * "Recalculate" action without requiring the user to select the node first.
 */
export function useRunSingleNode(nodeId: string): UseRunSingleNodeReturn {
  const nodeStore = useNodeStoreRef();

  const run = useWebsocketRunner((state) => state.run);
  const isWorkflowRunning = useWebsocketRunner(
    (state) => state.state === "running"
  );
  const getResult = useResultsStore((state) => state.getResult);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const runSingleNode = useCallback(() => {
    if (isWorkflowRunning) {
      console.info("useRunSingleNode: workflow already running, skipping");
      return;
    }

    const { edges, workflow, findNode } = nodeStore.getState();
    const node = findNode(nodeId);
    if (!node) {
      return;
    }

    // Seed inputs from the workflow's focused run; if nothing has run there's
    // no focused job and the store read yields undefined (literal-source
    // fallback still applies).
    const focusedJobId = useWorkflowRunsStore.getState().getFocusedJob(
      workflow.id
    );
    const getResultForFocusedJob = (wf: string, src: string): unknown =>
      focusedJobId ? getResult(wf, focusedJobId, src) : undefined;

    const inboundEdges = edges.filter((e: Edge) => e.target === nodeId);

    const overrides: Record<string, unknown> = {};
    for (const edge of inboundEdges) {
      if (!edge.targetHandle) {
        continue;
      }
      const { value, hasValue } = resolveExternalEdgeValue(
        edge,
        workflow.id,
        getResultForFocusedJob,
        findNode
      );
      if (hasValue) {
        overrides[edge.targetHandle] = value;
      }
    }

    const dynamicProps = node.data?.dynamic_properties || {};
    const staticProps = node.data?.properties || {};
    const updatedDynamicProps = { ...dynamicProps };
    const updatedStaticProps = { ...staticProps };

    for (const [key, value] of Object.entries(overrides)) {
      if (Object.prototype.hasOwnProperty.call(dynamicProps, key)) {
        updatedDynamicProps[key] = value;
      } else {
        updatedStaticProps[key] = value;
      }
    }

    const nodeWithOverrides: Node<NodeData> = {
      ...node,
      data: {
        ...node.data,
        properties: updatedStaticProps,
        dynamic_properties: updatedDynamicProps
      }
    };

    run(
      {},
      workflow,
      [nodeWithOverrides],
      [],
      undefined,
      new Set([nodeId]),
      true
    );

    addNotification({
      type: "info",
      alert: false,
      content: "Running node"
    });
  }, [nodeId, isWorkflowRunning, nodeStore, getResult, run, addNotification]);

  return {
    runSingleNode,
    isWorkflowRunning
  };
}
