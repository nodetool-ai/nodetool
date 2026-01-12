/**
 * Tests for boundary analysis
 */

import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../../../stores/NodeData";
import {
  analyzeBoundary,
  groupBoundaryInputs,
  groupBoundaryOutputs,
  validateSelection,
  calculateSelectionCenter
} from "../boundary";

describe("Boundary analysis", () => {
  describe("analyzeBoundary", () => {
    it("should categorize edges correctly", () => {
      const nodes: Node<NodeData>[] = [
        {
          id: "1",
          position: { x: 0, y: 0 },
          data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" }
        },
        {
          id: "2",
          position: { x: 100, y: 0 },
          data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" }
        }
      ];

      const allEdges: Edge[] = [
        { id: "e1", source: "0", target: "1" }, // Input: external -> selected
        { id: "e2", source: "1", target: "2" }, // Internal: selected -> selected
        { id: "e3", source: "2", target: "3" }, // Output: selected -> external
        { id: "e4", source: "0", target: "3" }  // External: external -> external
      ];

      const result = analyzeBoundary(nodes, allEdges);

      expect(result.boundaryInputLinks).toHaveLength(1);
      expect(result.boundaryInputLinks[0].id).toBe("e1");

      expect(result.boundaryOutputLinks).toHaveLength(1);
      expect(result.boundaryOutputLinks[0].id).toBe("e3");

      expect(result.internalLinks).toHaveLength(1);
      expect(result.internalLinks[0].id).toBe("e2");

      expect(result.selectedNodes).toEqual(nodes);
    });

    it("should handle empty selection", () => {
      const result = analyzeBoundary([], []);

      expect(result.boundaryInputLinks).toHaveLength(0);
      expect(result.boundaryOutputLinks).toHaveLength(0);
      expect(result.internalLinks).toHaveLength(0);
      expect(result.selectedNodes).toHaveLength(0);
    });
  });

  describe("groupBoundaryInputs", () => {
    it("should group links by target", () => {
      const links: Edge[] = [
        { id: "e1", source: "0", target: "1", targetHandle: "input_a" },
        { id: "e2", source: "0", target: "1", targetHandle: "input_a" },
        { id: "e3", source: "0", target: "2", targetHandle: "input_b" }
      ];

      const grouped = groupBoundaryInputs(links);

      expect(grouped.size).toBe(2);
      expect(grouped.get("1:input_a")).toHaveLength(2);
      expect(grouped.get("2:input_b")).toHaveLength(1);
    });
  });

  describe("groupBoundaryOutputs", () => {
    it("should group links by source", () => {
      const links: Edge[] = [
        { id: "e1", source: "1", sourceHandle: "output_a", target: "3" },
        { id: "e2", source: "1", sourceHandle: "output_a", target: "4" },
        { id: "e3", source: "2", sourceHandle: "output_b", target: "5" }
      ];

      const grouped = groupBoundaryOutputs(links);

      expect(grouped.size).toBe(2);
      expect(grouped.get("1:output_a")).toHaveLength(2);
      expect(grouped.get("2:output_b")).toHaveLength(1);
    });
  });

  describe("validateSelection", () => {
    it("should reject empty selection", () => {
      const error = validateSelection([]);
      expect(error).toBe("No nodes selected");
    });

    it("should reject single node", () => {
      const nodes: Node<NodeData>[] = [
        {
          id: "1",
          position: { x: 0, y: 0 },
          data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" }
        }
      ];

      const error = validateSelection(nodes);
      expect(error).toBe("At least 2 nodes required to create a subgraph");
    });

    it("should reject selection with I/O nodes", () => {
      const nodes: Node<NodeData>[] = [
        {
          id: "1",
          type: "nodetool.workflows.base_node.SubgraphInput",
          position: { x: 0, y: 0 },
          data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" }
        },
        {
          id: "2",
          position: { x: 100, y: 0 },
          data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" }
        }
      ];

      const error = validateSelection(nodes);
      expect(error).toContain("Cannot include");
    });

    it("should accept valid selection", () => {
      const nodes: Node<NodeData>[] = [
        {
          id: "1",
          position: { x: 0, y: 0 },
          data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" }
        },
        {
          id: "2",
          position: { x: 100, y: 0 },
          data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" }
        }
      ];

      const error = validateSelection(nodes);
      expect(error).toBeNull();
    });
  });

  describe("calculateSelectionCenter", () => {
    it("should calculate center correctly", () => {
      const nodes: Node<NodeData>[] = [
        {
          id: "1",
          position: { x: 0, y: 0 },
          width: 100,
          height: 50,
          data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" }
        },
        {
          id: "2",
          position: { x: 200, y: 100 },
          width: 100,
          height: 50,
          data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" }
        }
      ];

      const center = calculateSelectionCenter(nodes);

      // Expected: min=(0,0), max=(300,150), center=(150,75)
      expect(center.x).toBe(150);
      expect(center.y).toBe(75);
    });

    it("should handle empty selection", () => {
      const center = calculateSelectionCenter([]);
      expect(center).toEqual({ x: 0, y: 0 });
    });

    it("should use default dimensions when not specified", () => {
      const nodes: Node<NodeData>[] = [
        {
          id: "1",
          position: { x: 0, y: 0 },
          data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" }
        }
      ];

      const center = calculateSelectionCenter(nodes);

      // Default width: 280, height: 100
      // Expected: center = (140, 50)
      expect(center.x).toBe(140);
      expect(center.y).toBe(50);
    });
  });
});
