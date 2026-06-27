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
import {
  getNodeGenerations,
  getNodeSelectedOutputs
} from "../../stores/nodeGenerationAccessor";
import { getCurrentGeneration } from "../../utils/nodeGenerations";

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
 * {@link buildRunSubgraph}): cached results and constant/input values are
 * inlined as overrides, deterministic upstream nodes are submitted alongside
 * the target so they run and feed it, and uncached *generative* upstreams
 * (auto-saving asset nodes) block the run with a message telling the user to
 * run them first. Cached values are read from the focused run's output and
 * result buckets — the same precedence the node bodies use to display them, so
 * a reopened workflow's hydrated assets are picked up.
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
    const findCurrentNode = (id: string): Node<NodeData> | undefined =>
      findNode(id) ?? nodes.find((n) => n.id === id);
    const targetMetadata = targetNode.type
      ? useMetadataStore.getState().getMetadata(targetNode.type)
      : undefined;

    const subgraph = buildRunSubgraph({
      targetId: targetNode.id,
      nodes,
      edges,
      workflowId: workflow.id,
      // Seed inputs from each upstream's selected generation (durable assets
      // merged with the live buffer); resolveExternalEdgeValue unwraps the
      // returned outputs record by source handle.
      getResult: (wf, sourceId) => {
        const current = getCurrentGeneration(
          getNodeGenerations(wf, sourceId),
          findCurrentNode(sourceId)?.data?.selected_generation
        );
        return current?.outputs;
      },
      // Multi-select: the source's chosen generations stream into the target via
      // an injected ForEach replay node (input_list = the selected values), and
      // the source is pruned. No list-type gate — see buildRunSubgraph.
      getSelectedOutputs: (wf, sourceId, sourceHandle) =>
        getNodeSelectedOutputs(
          wf,
          sourceId,
          sourceHandle,
          findCurrentNode(sourceId)?.data?.selected_generations
        ),
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

    const graph = {
      nodes: subgraph.nodes.map(reactFlowNodeToGraphNode),
      edges: subgraph.edges.map(reactFlowEdgeToGraphEdge)
    };

    // Independent job; the backend runs it immediately when under the
    // per-client concurrency cap (MAX_CONCURRENT_JOBS), otherwise queues it.
    const jobName =
      targetNode.data?.title?.trim() ||
      targetMetadata?.title ||
      targetNode.type ||
      undefined;
    void runInlineGraphJob({ graph, workflowId: workflow.id, jobName });

    addNotification({
      type: "info",
      alert: false,
      content: `Running ${targetMetadata?.title || targetNode.type || "node"}`
    });
  }, [node, nodeStore, addNotification]);

  return { runFromHere, isWorkflowRunning: false };
}
