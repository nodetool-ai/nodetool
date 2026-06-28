import { useCallback } from "react";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useNotificationStore } from "../../stores/NotificationStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodeStoreRef } from "../../contexts/NodeContext";
import { runInlineGraphJob } from "../../lib/workflow/runInlineGraphJob";
import { reactFlowNodeToGraphNode } from "../../stores/reactFlowNodeToGraphNode";
import { reactFlowEdgeToGraphEdge } from "../../stores/reactFlowEdgeToGraphEdge";
import { buildRunSubgraph } from "../../utils/runSubgraph";
import { getNodeGenerations } from "../../stores/nodeGenerationAccessor";
import { computeRunSignatures } from "../../utils/computeRunSignatures";

interface UseRunFromHereReturn {
  /** Run just this node as its own job (the "Run Node" action). */
  runFromHere: () => void;
  /**
   * Always false: each "Run Node" click dispatches an independent job, so the
   * button is never disabled — the backend caps how many jobs run concurrently
   * (MAX_CONCURRENT_JOBS) and queues the rest. Kept for the consumers that read
   * it (NodeToolButtons, the context menu label).
   */
  isWorkflowRunning: boolean;
}

/**
 * Run a single node as its own job (the "Run Node" action).
 *
 * Upstream inputs are resolved into the smallest runnable subgraph (see
 * {@link buildRunSubgraph}): constant/input nodes inline their current value,
 * cached *generative* upstreams (auto-saving asset nodes) inline their cached
 * output, deterministic upstream nodes are submitted alongside the target so
 * they re-run and feed it (their cache is ignored, so edits are always picked
 * up), and uncached generative upstreams block the run with a message telling
 * the user to run them first. Generative caches are read from the focused run's
 * output and result buckets — the same precedence the node bodies use to
 * display them, so a reopened workflow's hydrated assets are picked up.
 *
 * The run is dispatched as an independent job (not the shared per-workflow
 * runner), so different nodes run in tandem. The backend caps concurrency per
 * client (MAX_CONCURRENT_JOBS) and queues runs beyond that limit.
 */
export function useRunFromHere(
  node: Node<NodeData> | null | undefined
): UseRunFromHereReturn {
  const nodeStore = useNodeStoreRef();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const runFromHere = useCallback(() => {
    if (!node) {
      return;
    }

    const { edges, nodes, workflow, findNode } = nodeStore.getState();
    if (!workflow) {
      return;
    }

    const targetNode = findNode(node.id) ?? node;
    const targetMetadata = targetNode.type
      ? useMetadataStore.getState().getMetadata(targetNode.type)
      : undefined;

    const subgraph = buildRunSubgraph({
      targetId: targetNode.id,
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

    const graph = {
      nodes: subgraph.nodes.map(reactFlowNodeToGraphNode),
      edges: subgraph.edges.map(reactFlowEdgeToGraphEdge)
    };

    // Stamp registry (spec §3.4): signatures for the submitted nodes, computed
    // against the FULL live graph (not the pruned subgraph), so a produced
    // generation can be tagged with the same key a later resolve() looks up.
    const inputSignatures = computeRunSignatures(subgraph.nodeIds, {
      nodes,
      edges,
      workflowId: workflow.id,
      getMetadata: useMetadataStore.getState().getMetadata,
      getGenerations: getNodeGenerations
    });

    // Independent job; the backend runs it immediately when under the
    // per-client concurrency cap (MAX_CONCURRENT_JOBS), otherwise queues it.
    const jobName =
      targetNode.data?.title?.trim() ||
      targetMetadata?.title ||
      targetNode.type ||
      undefined;
    void runInlineGraphJob({
      graph,
      workflowId: workflow.id,
      jobName,
      inputSignatures
    });

    addNotification({
      type: "info",
      alert: false,
      content: `Running ${targetMetadata?.title || targetNode.type || "node"}`
    });
  }, [node, nodeStore, addNotification]);

  return { runFromHere, isWorkflowRunning: false };
}
