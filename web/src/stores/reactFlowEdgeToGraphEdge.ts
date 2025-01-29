import { Edge } from "@xyflow/react";
import { Edge as GraphEdge } from "./ApiTypes";

export function reactFlowEdgeToGraphEdge(edge: Edge): GraphEdge {
  const ui_properties = edge.className
    ? { className: edge.className }
    : undefined;
  return {
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle || "",
    target: edge.target,
    targetHandle: edge.targetHandle || "",
    ui_properties: ui_properties
  };
}
