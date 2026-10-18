import { useCallback, useEffect, useRef, useState } from "react";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  getWorkflowRunnerStore,
  useWebsocketRunner
} from "../../stores/WorkflowRunner";
import { getNodeGenerations } from "../../stores/nodeGenerationAccessor";
import { useNodeStoreRef } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import { buildRunSubgraph } from "../../utils/runSubgraph";
import { computeRunSignatures } from "../../utils/computeRunSignatures";

export const MIN_RUNS = 1;
export const MAX_RUNS = 32;

interface RunProgress {
  current: number;
  total: number;
}

interface UseRunSelectedNodesReturn {
  /**
   * Runs the selected nodes, or the nodes in `nodeIds` when given (Run
   * Group). Inputs wired from outside the set reuse cached values, and
   * upstream nodes without one run first in the same job.
   */
  runSelectedNodes: (runs?: number, nodeIds?: readonly string[]) => Promise<void>;
  isWorkflowRunning: boolean;
  runProgress: RunProgress | null;
}

export function useRunSelectedNodes(): UseRunSelectedNodesReturn {
  const nodeStore = useNodeStoreRef();

  const run = useWebsocketRunner((state) => state.run);
  const isWorkflowRunning = useWebsocketRunner(
    (state) => state.state === "running"
  );
  const addNotification = useNotificationStore((state) => state.addNotification);

  const [runProgress, setRunProgress] = useState<RunProgress | null>(null);

  // Track the active sequence so a cancel/unmount can abort cleanly.
  const sequenceTokenRef = useRef(0);

  useEffect(() => {
    return () => {
      sequenceTokenRef.current += 1;
    };
  }, []);

  const runSelectedNodes = useCallback(
    async (runs = 1, nodeIds?: readonly string[]) => {
      if (isWorkflowRunning) {
        return;
      }

      const totalRuns = Math.max(MIN_RUNS, Math.min(MAX_RUNS, Math.floor(runs)));

      const { nodes, edges, workflow, getSelectedNodes } =
        nodeStore.getState();

      const requested = nodeIds ? new Set(nodeIds) : null;
      const selectedNodes = requested
        ? nodes.filter((n: Node<NodeData>) => requested.has(n.id))
        : getSelectedNodes();
      if (selectedNodes.length === 0) {
        return;
      }

      const selectedNodeIds = new Set(
        selectedNodes.map((n: Node<NodeData>) => n.id)
      );

      // The same subgraph builder as "Run Node": inputs wired from outside the
      // selection reuse a cached or constant value where one is valid, missing
      // deterministic upstreams join the run, and an uncached generative
      // upstream blocks it.
      const getMetadata = useMetadataStore.getState().getMetadata;
      const subgraph = buildRunSubgraph({
        targetIds: selectedNodeIds,
        nodes,
        edges,
        workflowId: workflow.id,
        getMetadata,
        // Merged generation history (durable assets + live buffer) per upstream.
        getGenerations: getNodeGenerations,
        now: Date.now()
      });

      if (subgraph.blocked.length > 0) {
        const names = subgraph.blocked.map((b) => `"${b.title}"`).join(", ");
        addNotification({
          type: "warning",
          alert: true,
          content: `Run ${names} first — the selection depends on ${
            subgraph.blocked.length > 1 ? "generative nodes" : "a generative node"
          } that ${
            subgraph.blocked.length > 1 ? "have" : "has"
          } not been executed yet.`
        });
        return;
      }

      console.info(
        `Running workflow from ${selectedNodes.length} selected node(s) × ${totalRuns} run(s)`,
        {
          startNodeIds: selectedNodes.map((n: Node<NodeData>) => n.id),
          nodeCount: subgraph.nodes.length,
          edgeCount: subgraph.edges.length,
          totalRuns
        }
      );

      addNotification({
        type: "info",
        alert: false,
        content:
          totalRuns > 1
            ? `Running workflow from ${selectedNodes.length} selected node${
                selectedNodes.length > 1 ? "s" : ""
              } × ${totalRuns}`
            : `Running workflow from ${selectedNodes.length} selected node${
                selectedNodes.length > 1 ? "s" : ""
              }`
      });

      const runnerStore = getWorkflowRunnerStore(workflow.id);

      // Wait until the runner reaches a terminal state. Returns the final
      // state so the caller can stop the sequence on error/cancel.
      const waitForCompletion = (): Promise<
        "idle" | "error" | "cancelled"
      > =>
        new Promise((resolve) => {
          const unsub = runnerStore.subscribe((s) => {
            if (
              s.state === "idle" ||
              s.state === "error" ||
              s.state === "cancelled"
            ) {
              unsub();
              resolve(s.state);
            }
          });
        });

      // Stamp generations with the FULL-graph signature (not the pruned subgraph
      // run() would otherwise hash) so Run-selected outputs are reusable by later
      // runs — mirrors useRunSingleNode / useRunFromHere. Stable across the loop.
      const inputSignatures = computeRunSignatures(subgraph.nodeIds, {
        nodes,
        edges,
        workflowId: workflow.id,
        getMetadata,
        getGenerations: getNodeGenerations
      });

      const myToken = ++sequenceTokenRef.current;

      try {
        for (let i = 1; i <= totalRuns; i++) {
          if (myToken !== sequenceTokenRef.current) return;

          setRunProgress({ current: i, total: totalRuns });

          await run(
            {},
            workflow,
            subgraph.nodes,
            subgraph.edges,
            undefined,
            subgraph.nodeIds,
            true,
            inputSignatures
          );

          if (i < totalRuns) {
            const finalState = await waitForCompletion();
            if (finalState !== "idle") {
              break;
            }
          }
        }
      } finally {
        if (myToken === sequenceTokenRef.current) {
          setRunProgress(null);
        }
      }
    },
    [isWorkflowRunning, nodeStore, run, addNotification]
  );

  return {
    runSelectedNodes,
    isWorkflowRunning,
    runProgress
  };
}
