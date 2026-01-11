import { computeMaxDepth, computeComplexityScore } from "../useWorkflowStats";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

describe("useWorkflowStats", () => {
  describe("computeMaxDepth", () => {
    it("returns 0 for empty graph", () => {
      const nodes: Node<NodeData>[] = [];
      const edges: Edge[] = [];
      expect(computeMaxDepth(nodes, edges)).toBe(0);
    });

    it("returns 0 for single node", () => {
      const nodes: Node<NodeData>[] = [
        { id: "n1", position: { x: 0, y: 0 }, data: { properties: {}, selectable: false, dynamic_properties: {}, workflow_id: "test" }, type: "input" }
      ];
      const edges: Edge[] = [];
      expect(computeMaxDepth(nodes, edges)).toBe(0);
    });

    it("returns 1 for two connected nodes", () => {
      const nodes: Node<NodeData>[] = [
        { id: "n1", position: { x: 0, y: 0 }, data: { properties: {}, selectable: false, dynamic_properties: {}, workflow_id: "test" }, type: "input" },
        { id: "n2", position: { x: 100, y: 0 }, data: { properties: {}, selectable: false, dynamic_properties: {}, workflow_id: "test" }, type: "output" }
      ];
      const edges: Edge[] = [
        { id: "e1", source: "n1", target: "n2", sourceHandle: "out", targetHandle: "in" }
      ];
      expect(computeMaxDepth(nodes, edges)).toBe(1);
    });

    it("returns correct depth for chain", () => {
      const nodes: Node<NodeData>[] = [
        { id: "n1", position: { x: 0, y: 0 }, data: { properties: {}, selectable: false, dynamic_properties: {}, workflow_id: "test" }, type: "input" },
        { id: "n2", position: { x: 100, y: 0 }, data: { properties: {}, selectable: false, dynamic_properties: {}, workflow_id: "test" }, type: "processing" },
        { id: "n3", position: { x: 200, y: 0 }, data: { properties: {}, selectable: false, dynamic_properties: {}, workflow_id: "test" }, type: "processing" },
        { id: "n4", position: { x: 300, y: 0 }, data: { properties: {}, selectable: false, dynamic_properties: {}, workflow_id: "test" }, type: "output" }
      ];
      const edges: Edge[] = [
        { id: "e1", source: "n1", target: "n2", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "n2", target: "n3", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "n3", target: "n4", sourceHandle: "out", targetHandle: "in" }
      ];
      expect(computeMaxDepth(nodes, edges)).toBe(3);
    });

    it("handles diamond pattern", () => {
      const nodes: Node<NodeData>[] = [
        { id: "n1", position: { x: 0, y: 0 }, data: { properties: {}, selectable: false, dynamic_properties: {}, workflow_id: "test" }, type: "input" },
        { id: "n2", position: { x: 100, y: 0 }, data: { properties: {}, selectable: false, dynamic_properties: {}, workflow_id: "test" }, type: "processing" },
        { id: "n3", position: { x: 100, y: 100 }, data: { properties: {}, selectable: false, dynamic_properties: {}, workflow_id: "test" }, type: "processing" },
        { id: "n4", position: { x: 200, y: 50 }, data: { properties: {}, selectable: false, dynamic_properties: {}, workflow_id: "test" }, type: "output" }
      ];
      const edges: Edge[] = [
        { id: "e1", source: "n1", target: "n2", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "n1", target: "n3", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "n2", target: "n4", sourceHandle: "out", targetHandle: "in" },
        { id: "e4", source: "n3", target: "n4", sourceHandle: "out", targetHandle: "in" }
      ];
      expect(computeMaxDepth(nodes, edges)).toBe(2);
    });
  });

  describe("computeComplexityScore", () => {
    it("returns 0 for empty workflow", () => {
      expect(computeComplexityScore(0, 0, 0, 0)).toBe(0);
    });

    it("calculates score correctly", () => {
      const score = computeComplexityScore(10, 15, 3, 8);
      expect(score).toBeGreaterThan(0);
    });

    it("considers all factors", () => {
      const baseScore = computeComplexityScore(5, 5, 1, 3);
      const higherScore = computeComplexityScore(10, 10, 5, 8);
      expect(higherScore).toBeGreaterThan(baseScore);
    });
  });
});
