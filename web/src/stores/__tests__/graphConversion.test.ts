import { graphEdgeToReactFlowEdge } from "../graphEdgeToReactFlowEdge";
import { reactFlowEdgeToGraphEdge } from "../reactFlowEdgeToGraphEdge";
import { Edge as GraphEdge } from "../ApiTypes";

const createMockGraphEdge = (overrides?: Partial<GraphEdge>): GraphEdge => ({
  id: "edge-1",
  source: "node-1",
  sourceHandle: "output-1",
  target: "node-2",
  targetHandle: "input-1",
  ...overrides
});

describe("graphEdgeToReactFlowEdge", () => {
  it("converts a basic graph edge to ReactFlow edge", () => {
    const graphEdge = createMockGraphEdge();
    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.id).toBe("edge-1");
    expect(result.source).toBe("node-1");
    expect(result.target).toBe("node-2");
    expect(result.sourceHandle).toBe("output-1");
    expect(result.targetHandle).toBe("input-1");
  });

  it("generates id using uuidv4 when id is not provided", () => {
    const graphEdge = createMockGraphEdge({ id: undefined });
    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.id).toBeDefined();
    expect(result.id.length).toBe(36); // UUID format
  });

  it("uses provided id when available", () => {
    const graphEdge = createMockGraphEdge({ id: "custom-id" });
    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.id).toBe("custom-id");
  });

  it("defaults handles to null when not provided", () => {
    const graphEdge = createMockGraphEdge({
      sourceHandle: undefined,
      targetHandle: undefined
    });
    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.sourceHandle).toBeNull();
    expect(result.targetHandle).toBeNull();
  });

  it("applies className from ui_properties", () => {
    const graphEdge = createMockGraphEdge({
      ui_properties: { className: "custom-edge" }
    });
    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.className).toBe("custom-edge");
  });

  it("does not set className when ui_properties is undefined", () => {
    const graphEdge = createMockGraphEdge({
      ui_properties: undefined
    });
    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.className).toBeUndefined();
  });

  it("handles edge with all optional fields undefined", () => {
    const graphEdge = createMockGraphEdge({
      id: undefined,
      ui_properties: undefined,
      sourceHandle: undefined,
      targetHandle: undefined
    });
    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.id).toBeDefined();
    expect(result.sourceHandle).toBeNull();
    expect(result.targetHandle).toBeNull();
    expect(result.className).toBeUndefined();
  });

  it("preserves source and target node ids", () => {
    const graphEdge = createMockGraphEdge({
      source: "source-node",
      target: "target-node"
    });
    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.source).toBe("source-node");
    expect(result.target).toBe("target-node");
  });

  it("preserves handle identifiers", () => {
    const graphEdge = createMockGraphEdge({
      sourceHandle: "custom-output",
      targetHandle: "custom-input"
    });
    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.sourceHandle).toBe("custom-output");
    expect(result.targetHandle).toBe("custom-input");
  });
});

describe("reactFlowEdgeToGraphEdge", () => {
  it("converts a ReactFlow edge to graph edge", () => {
    const edge = {
      id: "edge-1",
      source: "node-1",
      sourceHandle: "output-1",
      target: "node-2",
      targetHandle: "input-1"
    };
    const result = reactFlowEdgeToGraphEdge(edge);

    expect(result.id).toBe("edge-1");
    expect(result.source).toBe("node-1");
    expect(result.sourceHandle).toBe("output-1");
    expect(result.target).toBe("node-2");
    expect(result.targetHandle).toBe("input-1");
  });

  it("converts empty handles to empty strings", () => {
    const edge = {
      id: "edge-1",
      source: "node-1",
      sourceHandle: null as any,
      target: "node-2",
      targetHandle: null as any
    };
    const result = reactFlowEdgeToGraphEdge(edge);

    expect(result.sourceHandle).toBe("");
    expect(result.targetHandle).toBe("");
  });

  it("creates ui_properties with className when className is present", () => {
    const edge = {
      id: "edge-1",
      source: "node-1",
      sourceHandle: "output-1",
      target: "node-2",
      targetHandle: "input-1",
      className: "custom-edge"
    };
    const result = reactFlowEdgeToGraphEdge(edge);

    expect(result.ui_properties).toEqual({ className: "custom-edge" });
  });

  it("does not set ui_properties when className is undefined", () => {
    const edge = {
      id: "edge-1",
      source: "node-1",
      sourceHandle: "output-1",
      target: "node-2",
      targetHandle: "input-1"
    };
    const result = reactFlowEdgeToGraphEdge(edge);

    expect(result.ui_properties).toBeUndefined();
  });

  it("round trips edge conversion correctly", () => {
    const originalGraphEdge = createMockGraphEdge({
      ui_properties: { className: "test-class" }
    });

    const reactFlowEdge = graphEdgeToReactFlowEdge(originalGraphEdge);
    const roundTrippedGraphEdge = reactFlowEdgeToGraphEdge(reactFlowEdge);

    expect(roundTrippedGraphEdge.id).toBe(originalGraphEdge.id);
    expect(roundTrippedGraphEdge.source).toBe(originalGraphEdge.source);
    expect(roundTrippedGraphEdge.target).toBe(originalGraphEdge.target);
    expect(roundTrippedGraphEdge.sourceHandle).toBe(originalGraphEdge.sourceHandle);
    expect(roundTrippedGraphEdge.targetHandle).toBe(originalGraphEdge.targetHandle);
    expect(roundTrippedGraphEdge.ui_properties).toEqual(originalGraphEdge.ui_properties);
  });

  it("handles edge with undefined className", () => {
    const edge = {
      id: "edge-1",
      source: "node-1",
      sourceHandle: "output-1",
      target: "node-2",
      targetHandle: "input-1",
      className: undefined
    };
    const result = reactFlowEdgeToGraphEdge(edge);

    expect(result.ui_properties).toBeUndefined();
  });

  it("preserves source and target node ids", () => {
    const edge = {
      id: "edge-1",
      source: "source-node",
      target: "target-node"
    };
    const result = reactFlowEdgeToGraphEdge(edge);

    expect(result.source).toBe("source-node");
    expect(result.target).toBe("target-node");
  });

  it("preserves handle identifiers", () => {
    const edge = {
      id: "edge-1",
      source: "node-1",
      sourceHandle: "custom-output",
      target: "node-2",
      targetHandle: "custom-input"
    };
    const result = reactFlowEdgeToGraphEdge(edge);

    expect(result.sourceHandle).toBe("custom-output");
    expect(result.targetHandle).toBe("custom-input");
  });

  it("handles undefined handles by converting to empty strings", () => {
    const edge = {
      id: "edge-1",
      source: "node-1",
      sourceHandle: undefined,
      target: "node-2",
      targetHandle: undefined
    };
    const result = reactFlowEdgeToGraphEdge(edge);

    expect(result.sourceHandle).toBe("");
    expect(result.targetHandle).toBe("");
  });
});
