import { renderHook } from "@testing-library/react";
import { useFitView, getNodesBounds } from "../useFitView";

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(() => ({
    fitView: jest.fn(),
    fitBounds: jest.fn(),
    getViewport: jest.fn().mockReturnValue({ x: 0, y: 0, zoom: 1 })
  }))
}));

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn((selector) => {
    const mockState = {
      nodes: [],
      selectedNodes: [],
      setSelectedNodes: jest.fn(),
      setViewport: jest.fn(),
      getSelectedNodes: jest.fn().mockReturnValue([])
    };
    if (typeof selector === "function") {
      return selector(mockState);
    }
    return mockState;
  })
}));

describe("useFitView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("useFitView hook", () => {
    it("returns a function", () => {
      const { result } = renderHook(() => useFitView());
      expect(typeof result.current).toBe("function");
    });
  });

  describe("getNodesBounds", () => {
    it("returns null for empty nodes array", () => {
      const result = getNodesBounds([], {});
      expect(result).toBeNull();
    });

    it("calculates bounds for single node", () => {
      const nodes: any[] = [{
        id: "node1",
        position: { x: 100, y: 200 },
        measured: { width: 150, height: 80 }
      }];
      const nodesById: Record<string, any> = {
        node1: { x: 100, y: 200 }
      };

      const result = getNodesBounds(nodes, nodesById);

      expect(result).toBeDefined();
      expect(result?.xMin).toBe(100);
      expect(result?.xMax).toBe(250);
      expect(result?.yMin).toBe(200);
      expect(result?.yMax).toBe(280);
    });

    it("calculates bounds for multiple nodes", () => {
      const nodes: any[] = [
        { id: "node1", position: { x: 0, y: 0 }, measured: { width: 100, height: 50 } },
        { id: "node2", position: { x: 200, y: 150 }, measured: { width: 100, height: 50 } }
      ];
      const nodesById: Record<string, any> = {
        node1: { x: 0, y: 0 },
        node2: { x: 200, y: 150 }
      };

      const result = getNodesBounds(nodes, nodesById);

      expect(result).toBeDefined();
      expect(result?.xMin).toBe(0);
      expect(result?.xMax).toBe(300);
      expect(result?.yMin).toBe(0);
      expect(result?.yMax).toBe(200);
    });

    it("handles nodes without measured dimensions", () => {
      const nodes: any[] = [{
        id: "node1",
        position: { x: 100, y: 200 }
      }];
      const nodesById: Record<string, any> = {
        node1: { x: 100, y: 200 }
      };

      const result = getNodesBounds(nodes, nodesById);

      expect(result).toBeDefined();
      expect(result?.xMin).toBe(100);
      expect(result?.xMax).toBe(100);
      expect(result?.yMin).toBe(200);
      expect(result?.yMax).toBe(200);
    });

    it("calculates bounds for nested nodes with parent positions", () => {
      const nodes: any[] = [{
        id: "child1",
        position: { x: 50, y: 50 },
        parentId: "parent1",
        measured: { width: 100, height: 50 }
      }];
      const nodesById: Record<string, any> = {
        parent1: { x: 100, y: 100 },
        child1: { x: 50, y: 50 }
      };

      const result = getNodesBounds(nodes, nodesById);

      expect(result).toBeDefined();
      expect(result?.xMin).toBe(150);
      expect(result?.xMax).toBe(250);
      expect(result?.yMin).toBe(150);
      expect(result?.yMax).toBe(200);
    });
  });
});
