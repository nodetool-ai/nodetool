import { graphEdgeToReactFlowEdge } from "../graphEdgeToReactFlowEdge";
import { Edge as GraphEdge } from "../ApiTypes";

describe("graphEdgeToReactFlowEdge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("converts a basic graph edge to ReactFlow edge", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-1",
      sourceHandle: "output-1",
      target: "node-2",
      targetHandle: "input-1"
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.id).toBe("edge-1");
    expect(result.source).toBe("node-1");
    expect(result.sourceHandle).toBe("output-1");
    expect(result.target).toBe("node-2");
    expect(result.targetHandle).toBe("input-1");
  });

  it("generates UUID when edge id is undefined", () => {
    const graphEdge: GraphEdge = {
      source: "node-1",
      sourceHandle: "output-1",
      target: "node-2",
      targetHandle: "input-1"
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.id).toBeDefined();
    expect(result.id.length).toBe(36);
    expect(result.source).toBe("node-1");
    expect(result.target).toBe("node-2");
  });

  it("uses null for missing sourceHandle", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-1",
      target: "node-2"
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.sourceHandle).toBeNull();
    expect(result.targetHandle).toBeNull();
  });

  it("applies className from ui_properties", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-1",
      target: "node-2",
      ui_properties: {
        className: "custom-edge-class"
      }
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.className).toBe("custom-edge-class");
  });

  it("does not include className when ui_properties is undefined", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-1",
      target: "node-2"
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.className).toBeUndefined();
  });

  it("converts empty string handles to null", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-1",
      sourceHandle: "",
      target: "node-2",
      targetHandle: ""
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.sourceHandle).toBeNull();
    expect(result.targetHandle).toBeNull();
  });
});
