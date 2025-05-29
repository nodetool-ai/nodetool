import { Edge } from "@xyflow/react";
import { Edge as GraphEdge } from "./ApiTypes";
import { uuidv4 } from "./uuidv4";

export const graphEdgeToReactFlowEdge = (edge: GraphEdge): Edge => {
  return {
    id: edge.id || uuidv4(),
    source: edge.source,
    sourceHandle: edge.sourceHandle || null,
    target: edge.target,
    targetHandle: edge.targetHandle || null,
    className: edge.ui_properties?.className
  };
};
