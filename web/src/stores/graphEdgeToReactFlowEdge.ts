import { Edge } from "@xyflow/react";
import { Edge as GraphEdge } from "./ApiTypes";

export const CONTROL_HANDLE_ID = "__control__";

export const isAgentNodeType = (nodeType: string | undefined): boolean => {
  if (!nodeType) {
    return false;
  }
  return nodeType.startsWith("nodetool.agents.");
};

export const graphEdgeToReactFlowEdge = (edge: GraphEdge): Edge => {
  const isControl = edge.edge_type === "control";
  const rfEdge: Edge = {
    id: edge.id || crypto.randomUUID(),
    source: edge.source,
    sourceHandle: edge.sourceHandle || null,
    target: edge.target,
    targetHandle: edge.targetHandle || null,
    className: edge.ui_properties?.className
  };
  if (isControl) {
    rfEdge.type = "control";
    rfEdge.data = { edge_type: "control" };
  }
  return rfEdge;
};
