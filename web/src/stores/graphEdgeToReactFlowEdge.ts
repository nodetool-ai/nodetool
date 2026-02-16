import { Edge } from "@xyflow/react";
import { Edge as GraphEdge } from "./ApiTypes";
import { uuidv4 } from "./uuidv4";

export const CONTROL_HANDLE_ID = "__control__";

export const graphEdgeToReactFlowEdge = (edge: GraphEdge): Edge => {
  const isControl = edge.edge_type === "control";
  return {
    id: edge.id || uuidv4(),
    source: edge.source,
    sourceHandle: edge.sourceHandle || null,
    target: edge.target,
    targetHandle: edge.targetHandle || null,
    className: edge.ui_properties?.className,
    ...(isControl ? { type: "control", data: { edge_type: "control" } } : {})
  };
};
