import { graphEdgeToReactFlowEdge } from "../graphEdgeToReactFlowEdge";
import { Edge as GraphEdge } from "../ApiTypes";
import { Edge } from "@xyflow/react";

describe("graphEdgeToReactFlowEdge", () => {
  describe("basic edge conversion", () => {
    it("converts a basic edge with all required fields", () => {
      const graphEdge: GraphEdge = {
        id: "edge-1",
        source: "node-1",
        sourceHandle: "output",
        target: "node-2",
        targetHandle: "input"
      };

      const result = graphEdgeToReactFlowEdge(graphEdge);

      expect(result.id).toBe("edge-1");
      expect(result.source).toBe("node-1");
      expect(result.sourceHandle).toBe("output");
      expect(result.target).toBe("node-2");
      expect(result.targetHandle).toBe("input");
    });

    it("generates id using uuidv4 when id is not provided", () => {
      const graphEdge: GraphEdge = {
        source: "node-1",
        sourceHandle: "output",
        target: "node-2",
        targetHandle: "input"
      };

      const result = graphEdgeToReactFlowEdge(graphEdge);

      expect(result.id).toBeDefined();
      expect(result.id.length).toBe(36); // UUID format
    });

    it("converts null handles to null", () => {
      const graphEdge: GraphEdge = {
        id: "edge-1",
        source: "node-1",
        sourceHandle: null as any,
        target: "node-2",
        targetHandle: null as any
      };

      const result = graphEdgeToReactFlowEdge(graphEdge);

      expect(result.sourceHandle).toBeNull();
      expect(result.targetHandle).toBeNull();
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

  describe("ui_properties handling", () => {
    it("applies className from ui_properties", () => {
      const graphEdge: GraphEdge = {
        id: "edge-1",
        source: "node-1",
        sourceHandle: "output",
        target: "node-2",
        targetHandle: "input",
        ui_properties: { className: "custom-edge" }
      };

      const result = graphEdgeToReactFlowEdge(graphEdge);

      expect(result.className).toBe("custom-edge");
    });

    it("does not set className when ui_properties is undefined", () => {
      const graphEdge: GraphEdge = {
        id: "edge-1",
        source: "node-1",
        sourceHandle: "output",
        target: "node-2",
        targetHandle: "input"
      };

      const result = graphEdgeToReactFlowEdge(graphEdge);

      expect(result.className).toBeUndefined();
    });

    it("does not set className when ui_properties has no className", () => {
      const graphEdge: GraphEdge = {
        id: "edge-1",
        source: "node-1",
        sourceHandle: "output",
        target: "node-2",
        targetHandle: "input",
        ui_properties: { otherProperty: "value" }
      };

      const result = graphEdgeToReactFlowEdge(graphEdge);

      expect(result.className).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("handles edge with undefined sourceHandle", () => {
      const graphEdge: GraphEdge = {
        id: "edge-1",
        source: "node-1",
        sourceHandle: undefined as unknown as string,
        target: "node-2",
        targetHandle: undefined as unknown as string
      };

      const result = graphEdgeToReactFlowEdge(graphEdge);

      expect(result.sourceHandle).toBeNull();
      expect(result.targetHandle).toBeNull();
    });

    it("preserves handle values that are valid strings", () => {
      const graphEdge: GraphEdge = {
        id: "edge-1",
        source: "node-1",
        sourceHandle: "out-1",
        target: "node-2",
        targetHandle: "in-1"
      };

      const result = graphEdgeToReactFlowEdge(graphEdge);

      expect(result.sourceHandle).toBe("out-1");
      expect(result.targetHandle).toBe("in-1");
    });
  });
});
