import { reactFlowEdgeToGraphEdge } from "../reactFlowEdgeToGraphEdge";
import { Edge as ReactFlowEdge } from "@xyflow/react";

describe("reactFlowEdgeToGraphEdge", () => {
  it("converts a basic ReactFlow edge to graph edge", () => {
    const rfEdge: ReactFlowEdge = {
      id: "edge-1",
      source: "node-1",
      sourceHandle: "output-1",
      target: "node-2",
      targetHandle: "input-1",
      type: "default"
    };

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.id).toBe("edge-1");
    expect(result.source).toBe("node-1");
    expect(result.sourceHandle).toBe("output-1");
    expect(result.target).toBe("node-2");
    expect(result.targetHandle).toBe("input-1");
  });

  it("converts null handles to empty string", () => {
    const rfEdge: ReactFlowEdge = {
      id: "edge-1",
      source: "node-1",
      sourceHandle: null,
      target: "node-2",
      targetHandle: null,
      type: "default"
    };

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.sourceHandle).toBe("");
    expect(result.targetHandle).toBe("");
  });

  it("converts undefined handles to empty string", () => {
    const rfEdge: ReactFlowEdge = {
      id: "edge-1",
      source: "node-1",
      target: "node-2",
      type: "default"
    };

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.sourceHandle).toBe("");
    expect(result.targetHandle).toBe("");
  });

  it("preserves all edge properties", () => {
    const rfEdge: ReactFlowEdge = {
      id: "edge-1",
      source: "node-1",
      sourceHandle: "out",
      target: "node-2",
      targetHandle: "in",
      type: "default",
      animated: true,
      style: { stroke: "red" }
    };

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.id).toBe("edge-1");
    expect(result.source).toBe("node-1");
    expect(result.sourceHandle).toBe("out");
    expect(result.target).toBe("node-2");
    expect(result.targetHandle).toBe("in");
  });

  it("preserves empty string handles", () => {
    const rfEdge: ReactFlowEdge = {
      id: "edge-1",
      source: "node-1",
      sourceHandle: "",
      target: "node-2",
      targetHandle: "",
      type: "default"
    };

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.sourceHandle).toBe("");
    expect(result.targetHandle).toBe("");
  });
});
