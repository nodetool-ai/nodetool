import { useCallback } from "react";

import { useNotificationStore } from "../../stores/NotificationStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { buildRunSubgraph } from "../../utils/runSubgraph";
import { getNodeGenerations } from "../../stores/nodeGenerationAccessor";
import { computeRunSignatures } from "../../utils/computeRunSignatures";
import { useNodeStoreRef } from "../../contexts/NodeContext";

interface UseRunSingleNodeReturn {
  runSingleNode: () => void;
  isWorkflowRunning: boolean;
}

/**
 * Run a single node by id. The node's upstream closure is resolved into the
 * smallest runnable subgraph (see {@link buildRunSubgraph}): constant/input
 * values and cached *generative* outputs are injected as overrides, deterministic
 * upstream nodes are submitted alongside the target so they re-run and feed it
 * (their cache is ignored, so edits are picked up), and uncached generative
 * upstreams (auto-saving asset nodes) block the run with a message telling the
 * user to execute them first.
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
      getMetadata: useMetadataStore.getState().getMetadata,
      // Merged generation history (durable assets + live buffer) per upstream:
      // the resolver classifies/caches/blocks each external input from it.
      getGenerations: getNodeGenerations,
      now: Date.now()
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

    // Stamp registry (spec §3.4): signatures for the submitted nodes, computed
    // against the FULL live graph (not the pruned subgraph that run() receives),
    // so a produced generation can be tagged with the same key a later
    // resolve() looks up. Passed through run() because run() keys them by the
    // jobId it generates.
    const inputSignatures = computeRunSignatures(subgraph.nodeIds, {
      nodes,
      edges,
      workflowId: workflow.id,
      getMetadata: useMetadataStore.getState().getMetadata,
      getGenerations: getNodeGenerations
    });

    run(
      {},
      workflow,
      subgraph.nodes,
      subgraph.edges,
      undefined,
      subgraph.nodeIds,
      true,
      inputSignatures
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
