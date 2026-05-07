import { reactFlowEdgeToGraphEdge } from "./reactFlowEdgeToGraphEdge";
import type { Edge } from "@xyflow/react";

describe("reactFlowEdgeToGraphEdge", () => {
  it("converts a basic data edge", () => {
    const rfEdge: Edge = {
      id: "e1",
      source: "nodeA",
      sourceHandle: "output",
      target: "nodeB",
      targetHandle: "input",
    };

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result).toEqual({
      id: "e1",
      source: "nodeA",
      sourceHandle: "output",
      target: "nodeB",
      targetHandle: "input",
      ui_properties: undefined,
      edge_type: "data",
    });
  });

  it("defaults sourceHandle and targetHandle to empty string", () => {
    const rfEdge: Edge = {
      id: "e2",
      source: "nodeA",
      target: "nodeB",
    };

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.sourceHandle).toBe("");
    expect(result.targetHandle).toBe("");
  });

  it("preserves className in ui_properties", () => {
    const rfEdge: Edge = {
      id: "e3",
      source: "nodeA",
      sourceHandle: "out",
      target: "nodeB",
      targetHandle: "in",
      className: "highlighted",
    };

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.ui_properties).toEqual({ className: "highlighted" });
  });

  it("sets edge_type to control when data.edge_type is control", () => {
    const rfEdge: Edge = {
      id: "e4",
      source: "nodeA",
      sourceHandle: "out",
      target: "nodeB",
      targetHandle: "in",
      data: { edge_type: "control" },
    };

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.edge_type).toBe("control");
  });

  it("sets edge_type to control when type is control", () => {
    const rfEdge: Edge = {
      id: "e5",
      source: "nodeA",
      sourceHandle: "out",
      target: "nodeB",
      targetHandle: "in",
      type: "control",
    };

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.edge_type).toBe("control");
  });

  it("sets edge_type to data for non-control edges", () => {
    const rfEdge: Edge = {
      id: "e6",
      source: "nodeA",
      sourceHandle: "out",
      target: "nodeB",
      targetHandle: "in",
      type: "default",
      data: { edge_type: "data" },
    };

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.edge_type).toBe("data");
  });
});
