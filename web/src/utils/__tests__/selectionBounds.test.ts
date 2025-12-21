import { getSelectionRect, getNodesWithinSelection } from "../selectionBounds";
import type { XYPosition, ReactFlowInstance, Node, Edge } from "@xyflow/react";

describe("selectionBounds", () => {
  describe("getSelectionRect", () => {
    it("returns null when start is null", () => {
      const end: XYPosition = { x: 100, y: 100 };
      const result = getSelectionRect(null, end);
      expect(result).toBeNull();
    });

    it("returns null when end is null", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const result = getSelectionRect(start, null);
      expect(result).toBeNull();
    });

    it("returns null when both positions are null", () => {
      const result = getSelectionRect(null, null);
      expect(result).toBeNull();
    });

    it("returns null when selection is too small (width)", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 2, y: 100 };
      const result = getSelectionRect(start, end);
      expect(result).toBeNull();
    });

    it("returns null when selection is too small (height)", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 100, y: 2 };
      const result = getSelectionRect(start, end);
      expect(result).toBeNull();
    });

    it("returns valid rectangle for proper selection (top-left to bottom-right)", () => {
      const start: XYPosition = { x: 10, y: 20 };
      const end: XYPosition = { x: 110, y: 120 };
      const result = getSelectionRect(start, end);
      
      expect(result).toEqual({
        x: 10,
        y: 20,
        width: 100,
        height: 100
      });
    });

    it("returns valid rectangle for proper selection (bottom-right to top-left)", () => {
      const start: XYPosition = { x: 110, y: 120 };
      const end: XYPosition = { x: 10, y: 20 };
      const result = getSelectionRect(start, end);
      
      expect(result).toEqual({
        x: 10,
        y: 20,
        width: 100,
        height: 100
      });
    });

    it("returns valid rectangle when dragging in any direction", () => {
      // Top-right to bottom-left
      const start: XYPosition = { x: 110, y: 20 };
      const end: XYPosition = { x: 10, y: 120 };
      const result = getSelectionRect(start, end);
      
      expect(result).toEqual({
        x: 10,
        y: 20,
        width: 100,
        height: 100
      });
    });

    it("respects custom minSize parameter", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 8, y: 8 };
      
      // Should return null with default minSize (4)
      const resultDefault = getSelectionRect(start, end);
      expect(resultDefault).not.toBeNull();
      
      // Should return null with custom minSize (10)
      const resultCustom = getSelectionRect(start, end, 10);
      expect(resultCustom).toBeNull();
    });

    it("handles edge case with exact minSize", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 4, y: 4 };
      const result = getSelectionRect(start, end);
      
      expect(result).toEqual({
        x: 0,
        y: 0,
        width: 4,
        height: 4
      });
    });

    it("handles negative coordinates", () => {
      const start: XYPosition = { x: -50, y: -30 };
      const end: XYPosition = { x: 50, y: 70 };
      const result = getSelectionRect(start, end);
      
      expect(result).toEqual({
        x: -50,
        y: -30,
        width: 100,
        height: 100
      });
    });
  });

  describe("getNodesWithinSelection", () => {
    const mockNode1: Node = {
      id: "1",
      type: "default",
      position: { x: 10, y: 10 },
      data: {}
    };

    const mockNode2: Node = {
      id: "2",
      type: "group",
      position: { x: 50, y: 50 },
      data: {}
    };

    const mockInstance = {
      getIntersectingNodes: jest.fn()
    } as unknown as ReactFlowInstance<Node, Edge>;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("returns empty array when instance is null", () => {
      const rect = { x: 0, y: 0, width: 100, height: 100 };
      const result = getNodesWithinSelection(null as any, rect);
      expect(result).toEqual([]);
    });

    it("returns empty array when rect is null", () => {
      const result = getNodesWithinSelection(mockInstance, null);
      expect(result).toEqual([]);
    });

    it("returns all intersecting nodes when no predicate provided", () => {
      const rect = { x: 0, y: 0, width: 100, height: 100 };
      const mockNodes = [mockNode1, mockNode2];
      (mockInstance.getIntersectingNodes as jest.Mock).mockReturnValue(mockNodes);

      const result = getNodesWithinSelection(mockInstance, rect);
      
      expect(mockInstance.getIntersectingNodes).toHaveBeenCalledWith(rect, false);
      expect(result).toEqual(mockNodes);
    });

    it("filters nodes with predicate", () => {
      const rect = { x: 0, y: 0, width: 100, height: 100 };
      const mockNodes = [mockNode1, mockNode2];
      (mockInstance.getIntersectingNodes as jest.Mock).mockReturnValue(mockNodes);

      const predicate = (node: Node) => node.type === "group";
      const result = getNodesWithinSelection(mockInstance, rect, predicate);
      
      expect(result).toEqual([mockNode2]);
    });

    it("returns empty array when no nodes match predicate", () => {
      const rect = { x: 0, y: 0, width: 100, height: 100 };
      const mockNodes = [mockNode1, mockNode2];
      (mockInstance.getIntersectingNodes as jest.Mock).mockReturnValue(mockNodes);

      const predicate = (node: Node) => node.type === "custom";
      const result = getNodesWithinSelection(mockInstance, rect, predicate);
      
      expect(result).toEqual([]);
    });

    it("handles empty intersecting nodes array", () => {
      const rect = { x: 0, y: 0, width: 100, height: 100 };
      (mockInstance.getIntersectingNodes as jest.Mock).mockReturnValue([]);

      const result = getNodesWithinSelection(mockInstance, rect);
      
      expect(result).toEqual([]);
    });
  });
});
