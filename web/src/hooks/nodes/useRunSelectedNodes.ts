import { useCallback, useEffect, useRef, useState } from "react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  getWorkflowRunnerStore,
  useWebsocketRunner
} from "../../stores/WorkflowRunner";
import { resolveExternalEdgeValue } from "../../utils/edgeValue";
import { getNodeGenerations } from "../../stores/nodeGenerationAccessor";
import { getCurrentGeneration } from "../../utils/nodeGenerations";
import { useNodeStoreRef } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import {
  EdgeOverrideCollector,
  applyNodeOverrides
} from "../../utils/edgeOverrides";

export const MIN_RUNS = 1;
export const MAX_RUNS = 32;

export interface RunProgress {
  current: number;
  total: number;
}

interface UseRunSelectedNodesReturn {
  runSelectedNodes: (runs?: number) => Promise<void>;
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
    async (runs = 1) => {
      if (isWorkflowRunning) {
        return;
      }

      const totalRuns = Math.max(MIN_RUNS, Math.min(MAX_RUNS, Math.floor(runs)));

      const { edges, workflow, findNode, getSelectedNodes } =
        nodeStore.getState();

      const selectedNodes = getSelectedNodes();
      if (selectedNodes.length === 0) {
        return;
      }

      const selectedNodeIds = new Set(
        selectedNodes.map((n: Node<NodeData>) => n.id)
      );

      // Only include edges where both source and target are selected
      const selectedEdges = edges.filter(
        (edge: Edge) =>
          selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
      );

      // Find edges coming into selected nodes from non-selected nodes
      const externalInputEdges = edges.filter(
        (edge: Edge) =>
          selectedNodeIds.has(edge.target) && !selectedNodeIds.has(edge.source)
      );

      // Seed external inputs from each upstream's selected generation (durable
      // assets merged with the live buffer); resolveExternalEdgeValue unwraps
      // the returned outputs record by source handle.
      const getResultForFocusedJob = (
        wf: string,
        sourceId: string
      ): unknown => {
        const current = getCurrentGeneration(
          getNodeGenerations(wf, sourceId),
          findNode(sourceId)?.data?.selected_generation
        );
        return current?.outputs;
      };

      // Seed each selected node's inputs from its external (non-selected)
      // upstreams. The collector aggregates multiple edges into one list/collect
      // handle — see EdgeOverrideCollector — so two images wired to a single
      // list[image] handle aren't collapsed to one (last-write-wins).
      const collector = new EdgeOverrideCollector();
      for (const edge of externalInputEdges) {
        const targetHandle = edge.targetHandle;
        if (!targetHandle) {
          continue;
        }

        const { value, hasValue } = resolveExternalEdgeValue(
          edge,
          workflow.id,
          getResultForFocusedJob,
          findNode
        );
        if (!hasValue) {
          continue;
        }

        collector.add(edge.target, targetHandle, value);
      }

      const nodePropertyOverrides = collector.resolve(
        findNode,
        useMetadataStore.getState().getMetadata
      );

      const nodesWithCachedValues = selectedNodes.map((n: Node<NodeData>) =>
        applyNodeOverrides(n, nodePropertyOverrides.get(n.id))
      );

      console.info(
        `Running workflow from ${selectedNodes.length} selected node(s) × ${totalRuns} run(s)`,
        {
          startNodeIds: selectedNodes.map((n: Node<NodeData>) => n.id),
          nodeCount: nodesWithCachedValues.length,
          edgeCount: selectedEdges.length,
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

      const myToken = ++sequenceTokenRef.current;

      try {
        for (let i = 1; i <= totalRuns; i++) {
          if (myToken !== sequenceTokenRef.current) return;

          setRunProgress({ current: i, total: totalRuns });

          await run(
            {},
            workflow,
            nodesWithCachedValues,
            selectedEdges,
            undefined,
            selectedNodeIds,
            true
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
