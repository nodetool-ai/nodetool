/**
 * Bridge that syncs the NodeStore (ReactFlow graph) into the chain editor store.
 * Used when the chain editor is shown inside the main editor route.
 */

import React, { useEffect } from "react";
import { useNodes, useNodeStoreRef } from "../../contexts/NodeContext";
import { useChainEditorStore } from "./useChainEditorStore";
import { ChainEditor } from "./ChainEditor";
import { reactFlowNodeToGraphNode } from "../../stores/reactFlowNodeToGraphNode";
import type { Workflow, Edge as GraphEdge } from "../../stores/ApiTypes";

interface ChainEditorBridgeProps {
  isActive: boolean;
}

const ChainEditorBridge: React.FC<ChainEditorBridgeProps> = ({ isActive }) => {
  const workflow = useNodes((s) => s.workflow);
  const store = useNodeStoreRef();
  const loadWorkflow = useChainEditorStore((s) => s.loadWorkflow);
  const currentChainWorkflowId = useChainEditorStore((s) => s.workflowId);

  useEffect(() => {
    if (!isActive || !workflow || currentChainWorkflowId === workflow.id) return;

    const { nodes, edges } = store.getState();
    const graphNodes = nodes.map(reactFlowNodeToGraphNode);
    const graphEdges: GraphEdge[] = edges.map((e) => ({
      source: e.source,
      sourceHandle: e.sourceHandle ?? "",
      target: e.target,
      targetHandle: e.targetHandle ?? "",
      edge_type: (e.data?.edgeType ?? "data") as "data" | "control",
    }));

    const fullWorkflow: Workflow = {
      ...workflow,
      graph: { nodes: graphNodes, edges: graphEdges },
    } as Workflow;

    loadWorkflow(fullWorkflow);
  }, [isActive, workflow, store, loadWorkflow, currentChainWorkflowId]);

  return <ChainEditor />;
};

export default ChainEditorBridge;
