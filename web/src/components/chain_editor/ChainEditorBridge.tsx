/**
 * Bridge that syncs the NodeStore (ReactFlow graph) into the chain editor store.
 * Used when the chain editor is shown inside the main editor route.
 */

import React, { useEffect, useRef } from "react";
import { useNodes } from "../../contexts/NodeContext";
import { useChainEditorStore } from "./useChainEditorStore";
import { ChainEditor } from "./ChainEditor";
import { reactFlowNodeToGraphNode } from "../../stores/reactFlowNodeToGraphNode";
import type { Workflow, Edge as GraphEdge } from "../../stores/ApiTypes";

const ChainEditorBridge: React.FC = () => {
  const workflow = useNodes((s) => s.workflow);
  const nodes = useNodes((s) => s.nodes);
  const edges = useNodes((s) => s.edges);
  const loadWorkflow = useChainEditorStore((s) => s.loadWorkflow);
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workflow || loadedRef.current === workflow.id) return;
    loadedRef.current = workflow.id;

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
  }, [workflow, nodes, edges, loadWorkflow]);

  return <ChainEditor />;
};

export default ChainEditorBridge;
