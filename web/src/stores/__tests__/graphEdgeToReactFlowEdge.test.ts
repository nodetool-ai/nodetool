import { graphEdgeToReactFlowEdge } from "../graphEdgeToReactFlowEdge";
import { Edge as GraphEdge } from "../ApiTypes";

describe("graphEdgeToReactFlowEdge", () => {
  it("converts basic graph edge to ReactFlow edge", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-a",
      target: "node-b",
      sourceHandle: "output-1",
      targetHandle: "input-1"
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.id).toBe("edge-1");
    expect(result.source).toBe("node-a");
    expect(result.target).toBe("node-b");
    expect(result.sourceHandle).toBe("output-1");
    expect(result.targetHandle).toBe("input-1");
  });

  it("generates UUID when id is not provided", () => {
    const graphEdge: GraphEdge = {
      source: "node-a",
      sourceHandle: "",
      target: "node-b",
      targetHandle: ""
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.id).toBeDefined();
    expect(result.id.length).toBe(36);
  });

  it("converts empty string handles to null", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-a",
      target: "node-b",
      sourceHandle: "",
      targetHandle: ""
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.sourceHandle).toBeNull();
    expect(result.targetHandle).toBeNull();
  });

  it("handles undefined handles", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-a",
      sourceHandle: "",
      target: "node-b",
      targetHandle: ""
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.sourceHandle).toBeNull();
    expect(result.targetHandle).toBeNull();
  });

  it("applies className from ui_properties", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-a",
      target: "node-b",
      sourceHandle: "out",
      targetHandle: "in",
      ui_properties: {
        className: "custom-edge-class"
      }
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.className).toBe("custom-edge-class");
  });

  it("does not set className when ui_properties is undefined", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-a",
      target: "node-b",
      sourceHandle: "out",
      targetHandle: "in"
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.className).toBeUndefined();
  });

  it("does not set className when ui_properties.className is undefined", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-a",
      target: "node-b",
      sourceHandle: "out",
      targetHandle: "in",
      ui_properties: {}
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.className).toBeUndefined();
  });

  it("preserves all edge properties", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-a",
      sourceHandle: "out",
      target: "node-b",
      targetHandle: "in",
      ui_properties: { className: "test-class" }
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result).toEqual({
      id: "edge-1",
      source: "node-a",
      sourceHandle: "out",
      target: "node-b",
      targetHandle: "in",
      className: "test-class"
    });
  });
});
