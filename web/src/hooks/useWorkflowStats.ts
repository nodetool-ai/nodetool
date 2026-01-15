import { useEffect, useCallback } from "react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import useWorkflowStatsStore from "../stores/WorkflowStatsStore";
import { useNodes } from "../contexts/NodeContext";

interface UseWorkflowStatsOptions {
  workflowId: string;
  enabled?: boolean;
}

export const useWorkflowStats = ({
  workflowId,
  enabled = true
}: UseWorkflowStatsOptions): void => {
  const updateStats = useWorkflowStatsStore(
    (state: { updateStats: (workflowId: string, nodes: Node<NodeData>[], edges: Edge[], selectedNodeIds: string[], selectedEdgeIds: string[]) => void }) => state.updateStats
  );

  const nodes = useNodes((state: { nodes: Node<NodeData>[] }) => state.nodes);
  const edges = useNodes((state: { edges: Edge[] }) => state.edges);
  const getSelectedNodes = useNodes((state: { getSelectedNodes: () => Node<NodeData>[] }) => state.getSelectedNodes);

  const updateStatsCallback = useCallback(() => {
    if (!enabled) {
      return;
    }

    const selectedNodes = getSelectedNodes();
    const selectedEdges = edges.filter((edge: Edge) => edge.selected);

    updateStats(
      workflowId,
      nodes,
      edges,
      selectedNodes.map((n: Node<NodeData>) => n.id),
      selectedEdges.map((e: Edge) => e.id)
    );
  }, [workflowId, enabled, nodes, edges, getSelectedNodes, updateStats]);

  useEffect(() => {
    updateStatsCallback();
  }, [updateStatsCallback]);

  useEffect(() => {
    if (!enabled || !workflowId) {
      return undefined;
    }

    return () => {
      useWorkflowStatsStore.getState().clearStats(workflowId);
    };
  }, [workflowId, enabled]);
};

export default useWorkflowStats;
