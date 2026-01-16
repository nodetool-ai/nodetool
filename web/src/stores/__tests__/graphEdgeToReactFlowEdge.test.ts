import { graphEdgeToReactFlowEdge } from "../graphEdgeToReactFlowEdge";
import { Edge as GraphEdge } from "../ApiTypes";

describe("graphEdgeToReactFlowEdge", () => {
  it("converts a basic graph edge to ReactFlow edge", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-a",
      sourceHandle: "output-1",
      target: "node-b",
      targetHandle: "input-1"
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.id).toBe("edge-1");
    expect(result.source).toBe("node-a");
    expect(result.sourceHandle).toBe("output-1");
    expect(result.target).toBe("node-b");
    expect(result.targetHandle).toBe("input-1");
  });

  it("generates UUID when id is not provided", () => {
    const graphEdge: GraphEdge = {
      source: "node-a",
      sourceHandle: "output-1",
      target: "node-b",
      targetHandle: "input-1"
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.id).toBeDefined();
    expect(result.id.length).toBeGreaterThan(0);
  });

  it("sets sourceHandle to null when not provided", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-a",
      sourceHandle: null as any,
      target: "node-b",
      targetHandle: "input-1"
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.sourceHandle).toBeNull();
  });

  it("sets targetHandle to null when not provided", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-a",
      sourceHandle: "output-1",
      target: "node-b",
      targetHandle: null as any
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.targetHandle).toBeNull();
  });

  it("sets both handles to null when not provided", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-a",
      sourceHandle: null as any,
      target: "node-b",
      targetHandle: null as any
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
      ui_properties: {
        className: "custom-edge-class"
      }
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.className).toBe("custom-edge-class");
  });

  it("does not set className when ui_properties is not provided", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-a",
      sourceHandle: null as any,
      target: "node-b",
      targetHandle: null as any
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.className).toBeUndefined();
  });

  it("does not set className when ui_properties.className is not provided", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-a",
      sourceHandle: null as any,
      target: "node-b",
      targetHandle: null as any,
      ui_properties: {} as any
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.className).toBeUndefined();
  });

  it("handles edge with all handles specified", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-a",
      sourceHandle: "out-0",
      target: "node-b",
      targetHandle: "in-0"
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.sourceHandle).toBe("out-0");
    expect(result.targetHandle).toBe("in-0");
  });

  it("generates consistent UUIDs for the same edge (not really testable, but verifies UUID is generated)", () => {
    const graphEdge: GraphEdge = {
      source: "node-a",
      sourceHandle: null as any,
      target: "node-b",
      targetHandle: null as any
    };

    const result1 = graphEdgeToReactFlowEdge(graphEdge);
    const result2 = graphEdgeToReactFlowEdge(graphEdge);

    expect(result1.id).not.toBe(result2.id);
  });

  it("preserves all edge properties", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-a",
      sourceHandle: "output",
      target: "node-b",
      targetHandle: "input",
      ui_properties: {
        className: "test-class"
      }
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.id).toBe("edge-1");
    expect(result.source).toBe("node-a");
    expect(result.sourceHandle).toBe("output");
    expect(result.target).toBe("node-b");
    expect(result.targetHandle).toBe("input");
    expect(result.className).toBe("test-class");
  });

  it("converts empty string sourceHandle to null (falsy check)", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-a",
      sourceHandle: "",
      target: "node-b",
      targetHandle: "input"
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.sourceHandle).toBeNull();
  });

  it("converts empty string targetHandle to null (falsy check)", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-a",
      sourceHandle: "output",
      target: "node-b",
      targetHandle: ""
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.targetHandle).toBeNull();
  });
});
