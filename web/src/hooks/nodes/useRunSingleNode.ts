import { useCallback } from "react";

import { useNotificationStore } from "../../stores/NotificationStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { buildRunSubgraph } from "../../utils/runSubgraph";
import { makeUpstreamResultGetter } from "../../utils/upstreamResult";
import { useNodeStoreRef } from "../../contexts/NodeContext";

interface UseRunSingleNodeReturn {
  runSingleNode: () => void;
  isWorkflowRunning: boolean;
}

/**
 * Run a single node by id. The node's upstream closure is resolved into the
 * smallest runnable subgraph (see {@link buildRunSubgraph}): cached results and
 * constant/input values are injected as overrides, deterministic upstream nodes
 * are submitted alongside the target so they run and feed it, and uncached
 * *generative* upstreams (auto-saving asset nodes) block the run with a message
 * telling the user to execute them first.
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
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const runSingleNode = useCallback(() => {
    if (isWorkflowRunning) {
      console.info("useRunSingleNode: workflow already running, skipping");
      return;
    }

    const { edges, nodes, workflow, findNode } = nodeStore.getState();
    const node = findNode(nodeId);
    if (!node) {
      return;
    }

    const subgraph = buildRunSubgraph({
      targetId: nodeId,
      nodes,
      edges,
      workflowId: workflow.id,
      // Seed inputs from the workflow's runs (focused first, then newest, then
      // the hydrated baseline), checking the output bucket before the envelope.
      getResult: makeUpstreamResultGetter(workflow.id),
      getMetadata: useMetadataStore.getState().getMetadata
    });

    if (subgraph.blocked.length > 0) {
      const names = subgraph.blocked.map((b) => `"${b.title}"`).join(", ");
      addNotification({
        type: "warning",
        alert: true,
        content: `Run ${names} first — this node depends on ${
          subgraph.blocked.length > 1 ? "generative nodes" : "a generative node"
        } that ${
          subgraph.blocked.length > 1 ? "have" : "has"
        } not been executed yet.`
      });
      return;
    }

    run(
      {},
      workflow,
      subgraph.nodes,
      subgraph.edges,
      undefined,
      subgraph.nodeIds,
      true
    );

    addNotification({
      type: "info",
      alert: false,
      content: "Running node"
    });
  }, [nodeId, isWorkflowRunning, nodeStore, run, addNotification]);

  return {
    runSingleNode,
    isWorkflowRunning
  };
}
