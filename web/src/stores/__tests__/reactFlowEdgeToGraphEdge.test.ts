import { reactFlowEdgeToGraphEdge } from "../reactFlowEdgeToGraphEdge";
import { Edge } from "@xyflow/react";

describe("reactFlowEdgeToGraphEdge", () => {
  const createMockReactFlowEdge = (overrides: Partial<Edge> = {}): Edge => ({
    id: "edge-1",
    source: "node-a",
    sourceHandle: "output-1",
    target: "node-b",
    targetHandle: "input-1",
    ...overrides
  });

  it("converts a basic ReactFlow edge to graph edge", () => {
    const rfEdge = createMockReactFlowEdge();

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.id).toBe("edge-1");
    expect(result.source).toBe("node-a");
    expect(result.sourceHandle).toBe("output-1");
    expect(result.target).toBe("node-b");
    expect(result.targetHandle).toBe("input-1");
  });

  it("preserves edge id", () => {
    const rfEdge = createMockReactFlowEdge({ id: "custom-edge-id" });

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.id).toBe("custom-edge-id");
  });

  it("preserves source node id", () => {
    const rfEdge = createMockReactFlowEdge({ source: "source-node" });

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.source).toBe("source-node");
  });

  it("preserves target node id", () => {
    const rfEdge = createMockReactFlowEdge({ target: "target-node" });

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.target).toBe("target-node");
  });

  it("converts undefined sourceHandle to empty string", () => {
    const rfEdge = createMockReactFlowEdge({ sourceHandle: undefined });

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.sourceHandle).toBe("");
  });

  it("converts undefined targetHandle to empty string", () => {
    const rfEdge = createMockReactFlowEdge({ targetHandle: undefined });

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.targetHandle).toBe("");
  });

  it("converts null sourceHandle to empty string", () => {
    const rfEdge = createMockReactFlowEdge({ sourceHandle: null });

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.sourceHandle).toBe("");
  });

  it("converts null targetHandle to empty string", () => {
    const rfEdge = createMockReactFlowEdge({ targetHandle: null });

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.targetHandle).toBe("");
  });

  it("preserves empty string sourceHandle", () => {
    const rfEdge = createMockReactFlowEdge({ sourceHandle: "" });

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.sourceHandle).toBe("");
  });

  it("preserves empty string targetHandle", () => {
    const rfEdge = createMockReactFlowEdge({ targetHandle: "" });

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.targetHandle).toBe("");
  });

  it("creates ui_properties with className when className is provided", () => {
    const rfEdge = createMockReactFlowEdge({ className: "custom-edge" });

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.ui_properties).toEqual({ className: "custom-edge" });
  });

  it("does not create ui_properties when className is not provided", () => {
    const rfEdge = createMockReactFlowEdge({ className: undefined });

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.ui_properties).toBeUndefined();
  });

  it("does not create ui_properties when className is empty string", () => {
    const rfEdge = createMockReactFlowEdge({ className: "" });

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.ui_properties).toBeUndefined();
  });

  it("handles edge with all handles specified", () => {
    const rfEdge = createMockReactFlowEdge({
      sourceHandle: "out-0",
      targetHandle: "in-0"
    });

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.sourceHandle).toBe("out-0");
    expect(result.targetHandle).toBe("in-0");
  });

  it("handles edge without handles (using null)", () => {
    const rfEdge = createMockReactFlowEdge({
      sourceHandle: null,
      targetHandle: null
    });

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result.sourceHandle).toBe("");
    expect(result.targetHandle).toBe("");
  });

  it("preserves complete edge structure", () => {
    const rfEdge: Edge = {
      id: "edge-complete",
      source: "node1",
      sourceHandle: "out",
      target: "node2",
      targetHandle: "in",
      className: "highlighted"
    };

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result).toEqual({
      id: "edge-complete",
      source: "node1",
      sourceHandle: "out",
      target: "node2",
      targetHandle: "in",
      ui_properties: { className: "highlighted" }
    });
  });

  it("handles edge without className", () => {
    const rfEdge: Edge = {
      id: "edge-simple",
      source: "node1",
      sourceHandle: "out",
      target: "node2",
      targetHandle: "in"
    };

    const result = reactFlowEdgeToGraphEdge(rfEdge);

    expect(result).toEqual({
      id: "edge-simple",
      source: "node1",
      sourceHandle: "out",
      target: "node2",
      targetHandle: "in"
    });
  });
});
