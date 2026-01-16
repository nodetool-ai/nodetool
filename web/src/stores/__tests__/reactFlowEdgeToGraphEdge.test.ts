import { reactFlowEdgeToGraphEdge } from "../reactFlowEdgeToGraphEdge";
import { Edge } from "@xyflow/react";
import { Edge as GraphEdge } from "../ApiTypes";

describe("reactFlowEdgeToGraphEdge", () => {
  describe("basic edge conversion", () => {
    it("converts a basic edge with all required fields", () => {
      const reactFlowEdge: Edge = {
        id: "edge-1",
        source: "node-1",
        sourceHandle: "output",
        target: "node-2",
        targetHandle: "input"
      };

      const result = reactFlowEdgeToGraphEdge(reactFlowEdge);

      expect(result.id).toBe("edge-1");
      expect(result.source).toBe("node-1");
      expect(result.sourceHandle).toBe("output");
      expect(result.target).toBe("node-2");
      expect(result.targetHandle).toBe("input");
    });

    it("converts null handles to empty strings", () => {
      const reactFlowEdge: Edge = {
        id: "edge-1",
        source: "node-1",
        sourceHandle: null,
        target: "node-2",
        targetHandle: null
      };

      const result = reactFlowEdgeToGraphEdge(reactFlowEdge);

      expect(result.sourceHandle).toBe("");
      expect(result.targetHandle).toBe("");
    });

    it("converts undefined handles to empty strings", () => {
      const reactFlowEdge: Edge = {
        id: "edge-1",
        source: "node-1",
        sourceHandle: undefined,
        target: "node-2",
        targetHandle: undefined
      };

      const result = reactFlowEdgeToGraphEdge(reactFlowEdge);

      expect(result.sourceHandle).toBe("");
      expect(result.targetHandle).toBe("");
    });
  });

  describe("className handling", () => {
    it("creates ui_properties with className when className is present", () => {
      const reactFlowEdge: Edge = {
        id: "edge-1",
        source: "node-1",
        target: "node-2",
        className: "custom-edge"
      };

      const result = reactFlowEdgeToGraphEdge(reactFlowEdge);

      expect(result.ui_properties).toEqual({ className: "custom-edge" });
    });

    it("does not set ui_properties when className is undefined", () => {
      const reactFlowEdge: Edge = {
        id: "edge-1",
        source: "node-1",
        target: "node-2"
      };

      const result = reactFlowEdgeToGraphEdge(reactFlowEdge);

      expect(result.ui_properties).toBeUndefined();
    });

    it("does not set ui_properties when className is empty string", () => {
      const reactFlowEdge: Edge = {
        id: "edge-1",
        source: "node-1",
        target: "node-2",
        className: ""
      };

      const result = reactFlowEdgeToGraphEdge(reactFlowEdge);

      expect(result.ui_properties).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("handles edge with numeric handles", () => {
      const reactFlowEdge: Edge = {
        id: "edge-1",
        source: "node-1",
        sourceHandle: "0" as any,
        target: "node-2",
        targetHandle: "0" as any
      };

      const result = reactFlowEdgeToGraphEdge(reactFlowEdge);

      expect(result.sourceHandle).toBe("0");
      expect(result.targetHandle).toBe("0");
    });

    it("preserves special characters in handles", () => {
      const reactFlowEdge: Edge = {
        id: "edge-1",
        source: "node-1",
        sourceHandle: "out_port_1",
        target: "node-2",
        targetHandle: "in-port-2"
      };

      const result = reactFlowEdgeToGraphEdge(reactFlowEdge);

      expect(result.sourceHandle).toBe("out_port_1");
      expect(result.targetHandle).toBe("in-port-2");
    });
  });
});
