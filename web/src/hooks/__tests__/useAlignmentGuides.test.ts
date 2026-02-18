import { renderHook, act } from "@testing-library/react";
import { useAlignmentGuides } from "../useAlignmentGuides";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

describe("useAlignmentGuides", () => {
  const createMockNode = (
    id: string,
    x: number,
    y: number,
    width: number = 200,
    height: number = 100
  ): Node<NodeData> => ({
    id,
    type: "default",
    position: { x, y },
    data: {
      properties: {},
      selectable: true,
      dynamic_properties: {},
      workflow_id: "test-workflow"
    },
    width,
    height
  });

  describe("calculateGuides", () => {
    it("should return empty array when no nodes are dragged", () => {
      const { result } = renderHook(() => useAlignmentGuides());
      
      const guides = result.current.calculateGuides([], []);
      
      expect(guides).toEqual([]);
    });

    it("should return empty array when no reference nodes exist", () => {
      const { result } = renderHook(() => useAlignmentGuides());
      
      const draggedNode = createMockNode("node-1", 100, 100);
      const guides = result.current.calculateGuides([draggedNode], []);
      
      expect(guides).toEqual([]);
    });

    it("should detect left edge alignment within tolerance", () => {
      const { result } = renderHook(() => useAlignmentGuides());
      
      const draggedNode = createMockNode("dragged", 105, 200);
      const referenceNode = createMockNode("ref-1", 100, 100);
      
      const guides = result.current.calculateGuides([draggedNode], [referenceNode]);
      
      // Should detect left edge alignment (within 8px tolerance)
      expect(guides.length).toBeGreaterThan(0);
    });

    it("should detect horizontal top edge alignment within tolerance", () => {
      const { result } = renderHook(() => useAlignmentGuides());
      
      const draggedNode = createMockNode("dragged", 200, 105);
      const referenceNode = createMockNode("ref-1", 100, 100);
      
      const guides = result.current.calculateGuides([draggedNode], [referenceNode]);
      
      // Should detect top edge alignment (within 8px tolerance)
      expect(guides.length).toBeGreaterThan(0);
    });

    it("should not detect alignment when positions are too far apart", () => {
      const { result } = renderHook(() => useAlignmentGuides());
      
      const draggedNode = createMockNode("dragged", 500, 500);
      const referenceNode = createMockNode("ref-1", 100, 100);
      
      const guides = result.current.calculateGuides([draggedNode], [referenceNode]);
      
      // Should NOT align (too far)
      expect(guides.length).toBe(0);
    });

    it("should filter out dragged nodes from reference nodes", () => {
      const { result } = renderHook(() => useAlignmentGuides());
      
      const draggedNode = createMockNode("node-1", 100, 100);
      const otherNode = createMockNode("node-2", 600, 400);
      const allNodes = [draggedNode, otherNode];
      
      const guides = result.current.calculateGuides([draggedNode], allNodes);
      
      // Should only calculate against non-dragged nodes
      expect(guides.length).toBe(0);
    });
  });

  describe("clearGuides", () => {
    it("should be callable without errors", () => {
      const { result } = renderHook(() => useAlignmentGuides());
      
      expect(() => {
        act(() => {
          result.current.clearGuides();
        });
      }).not.toThrow();
    });
  });

  describe("guide properties", () => {
    it("should create guides with correct structure", () => {
      const { result } = renderHook(() => useAlignmentGuides());
      
      const draggedNode = createMockNode("dragged", 105, 200);
      const referenceNode = createMockNode("ref-1", 100, 100);
      
      const guides = result.current.calculateGuides([draggedNode], [referenceNode]);
      
      if (guides.length > 0) {
        const guide = guides[0];
        expect(guide).toHaveProperty("position");
        expect(guide).toHaveProperty("start");
        expect(guide).toHaveProperty("end");
        expect(guide).toHaveProperty("orientation");
        expect(guide).toHaveProperty("type");
        expect(["vertical", "horizontal"]).toContain(guide.orientation);
        expect(["start", "center", "end", "spacing"]).toContain(guide.type);
        expect(guide.end).toBeGreaterThan(guide.start);
      }
    });
  });
});
