import { useCallback, useEffect, useRef, useState } from "react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  getWorkflowRunnerStore,
  useWebsocketRunner
} from "../../stores/WorkflowRunner";
import { getNodeGenerations } from "../../stores/nodeGenerationAccessor";
import { useNodeStoreRef } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import { buildReplayForEach } from "../../utils/replayStream";
import { createRunResolver } from "../../utils/runResolver";
import { computeRunSignatures } from "../../utils/computeRunSignatures";
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

      const { nodes, edges, workflow, findNode, getSelectedNodes } =
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

      // The shared run-resolver over the LIVE FULL graph: it classifies each
      // external source (constant/generative/computed), checks cache freshness
      // and multi-select state, and decides reuse / replay / run / block —
      // identically to "Run Node" / "Run from here".
      const getMetadata = useMetadataStore.getState().getMetadata;
      const resolver = createRunResolver({
        nodes,
        edges,
        workflowId: workflow.id,
        getMetadata,
        // Merged generation history (durable assets + live buffer) per upstream.
        getGenerations: getNodeGenerations,
        now: Date.now()
      });

      // Seed each selected node's inputs from its external (non-selected)
      // upstreams. The collector aggregates multiple edges into one list/collect
      // handle — see EdgeOverrideCollector — so two images wired to a single
      // list[image] handle aren't collapsed to one (last-write-wins).
      const collector = new EdgeOverrideCollector();
      // Synthetic ForEach replay nodes (and edges) injected for multi-select
      // external sources; appended to the run graph below. Keyed by id to dedup.
      const replayNodesById = new Map<string, Node<NodeData>>();
      const replayEdges: Edge[] = [];
      // External sources that cannot satisfy an input without first running.
      // Deliberate difference from "Run Node": "Run selected" runs exactly the
      // selected set — it does NOT recurse into or include external
      // deterministic upstreams. So any external input that resolves to "run"
      // (cache-missed / stale computed) or "block" (uncached generative) blocks
      // the run instead of pulling the upstream in. Dedup by source id.
      const blocked: { nodeId: string; title: string }[] = [];
      const blockedSeen = new Set<string>();

      for (const edge of externalInputEdges) {
        const targetHandle = edge.targetHandle;
        if (!targetHandle) {
          continue;
        }

        const source = edge.source;
        const decision = resolver.decide(source);

        // Multi-select STREAM: a generative source with 2+ selected generations
        // is pruned and replaced by a ForEach replay node (input_list = the
        // selected values) that streams the N values into this target handle as
        // N iteration-correlated emissions — identical to a live generation.
        if (decision === "replay") {
          const { node, edge: replayEdge } = buildReplayForEach({
            sourceId: source,
            sourceHandle: edge.sourceHandle,
            targetId: edge.target,
            targetHandle,
            values: resolver.replayValues(source, edge.sourceHandle),
            workflowId: workflow.id
          });
          if (!replayNodesById.has(node.id)) {
            replayNodesById.set(node.id, node);
            replayEdges.push(replayEdge);
          }
          continue;
        }

        if (decision === "reuse") {
          const { value, hasValue } = resolver.reuseValue(source, edge);
          if (hasValue) {
            collector.add(edge.target, targetHandle, value);
            continue;
          }
          // Constant with an undefined live value: not satisfiable without
          // running it, and we don't pull external upstreams in → block.
        }

        // "run", "block", or a reuse with no value: the external input is not
        // satisfiable without running an upstream that "Run selected" won't
        // include → record the source as blocked.
        if (!blockedSeen.has(source)) {
          blockedSeen.add(source);
          blocked.push({ nodeId: source, title: resolver.nodeTitle(source) });
        }
      }

      if (blocked.length > 0) {
        const names = blocked.map((b) => `"${b.title}"`).join(", ");
        addNotification({
          type: "warning",
          alert: true,
          content: `Run ${names} first — the selection depends on ${
            blocked.length > 1 ? "nodes" : "a node"
          } outside it that ${
            blocked.length > 1 ? "have" : "has"
          } no reusable output yet.`
        });
        return;
      }

      const nodePropertyOverrides = collector.resolve(findNode, getMetadata);

      const nodesWithCachedValues = [
        ...selectedNodes.map((n: Node<NodeData>) =>
          applyNodeOverrides(n, nodePropertyOverrides.get(n.id))
        ),
        ...replayNodesById.values()
      ];

      // The injected ForEach replay edges aren't in the original graph; append
      // them so the runner wires each replay node into its target.
      const edgesForRun = [...selectedEdges, ...replayEdges];

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

      // Stamp generations with the FULL-graph signature (not the pruned subgraph
      // run() would otherwise hash) so Run-selected outputs are reusable by later
      // runs — mirrors useRunSingleNode / useRunFromHere. Stable across the loop.
      const inputSignatures = computeRunSignatures(selectedNodeIds, {
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
            nodesWithCachedValues,
            edgesForRun,
            undefined,
            selectedNodeIds,
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
