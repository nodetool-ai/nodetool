import { Edge } from "@xyflow/react";
import { reactFlowEdgeToGraphEdge } from "../reactFlowEdgeToGraphEdge";

describe("reactFlowEdgeToGraphEdge", () => {
  it("converts basic ReactFlow edge to graph edge", () => {
    const reactFlowEdge: Edge = {
      id: "edge-1",
      source: "node-a",
      target: "node-b",
      sourceHandle: "output-1",
      targetHandle: "input-1"
    };

    const result = reactFlowEdgeToGraphEdge(reactFlowEdge);

    expect(result.id).toBe("edge-1");
    expect(result.source).toBe("node-a");
    expect(result.target).toBe("node-b");
    expect(result.sourceHandle).toBe("output-1");
    expect(result.targetHandle).toBe("input-1");
  });

  it("converts null handles to empty strings", () => {
    const reactFlowEdge: Edge = {
      id: "edge-1",
      source: "node-a",
      target: "node-b",
      sourceHandle: null,
      targetHandle: null
    };

    const result = reactFlowEdgeToGraphEdge(reactFlowEdge);

    expect(result.sourceHandle).toBe("");
    expect(result.targetHandle).toBe("");
  });

  it("converts undefined handles to empty strings", () => {
    const reactFlowEdge: Edge = {
      id: "edge-1",
      source: "node-a",
      target: "node-b"
    };

    const result = reactFlowEdgeToGraphEdge(reactFlowEdge);

    expect(result.sourceHandle).toBe("");
    expect(result.targetHandle).toBe("");
  });

  it("creates ui_properties when className is present", () => {
    const reactFlowEdge: Edge = {
      id: "edge-1",
      source: "node-a",
      target: "node-b",
      className: "custom-edge"
    };

    const result = reactFlowEdgeToGraphEdge(reactFlowEdge);

    expect(result.ui_properties).toEqual({ className: "custom-edge" });
  });

  it("does not create ui_properties when className is undefined", () => {
    const reactFlowEdge: Edge = {
      id: "edge-1",
      source: "node-a",
      target: "node-b"
    };

    const result = reactFlowEdgeToGraphEdge(reactFlowEdge);

    expect(result.ui_properties).toBeUndefined();
  });

  it("does not create ui_properties when className is empty string", () => {
    const reactFlowEdge: Edge = {
      id: "edge-1",
      source: "node-a",
      target: "node-b",
      className: ""
    };

    const result = reactFlowEdgeToGraphEdge(reactFlowEdge);

    expect(result.ui_properties).toBeUndefined();
  });

  it("preserves all edge properties", () => {
    const reactFlowEdge: Edge = {
      id: "edge-1",
      source: "node-a",
      sourceHandle: "out",
      target: "node-b",
      targetHandle: "in",
      className: "test-class"
    };

    const result = reactFlowEdgeToGraphEdge(reactFlowEdge);

    expect(result).toEqual({
      id: "edge-1",
      source: "node-a",
      sourceHandle: "out",
      target: "node-b",
      targetHandle: "in",
      ui_properties: { className: "test-class" }
    });
  });

  it("handles edge with only id, source, and target", () => {
    const reactFlowEdge: Edge = {
      id: "edge-1",
      source: "node-a",
      target: "node-b"
    };

    const result = reactFlowEdgeToGraphEdge(reactFlowEdge);

    expect(result).toEqual({
      id: "edge-1",
      source: "node-a",
      sourceHandle: "",
      target: "node-b",
      targetHandle: ""
    });
  });
});
