import { renderHook } from "@testing-library/react";
import { Node, Position } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useCanvasBounds, CanvasBounds } from "../useCanvasBounds";

const mockUseNodes = jest.fn();

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: (selector: any) => mockUseNodes(selector)
}));

const createMockNode = (
  id: string,
  x: number,
  y: number,
  width: number = 280,
  height: number = 100,
  selected: boolean = false
): Node<NodeData> => ({
  id,
  type: "test",
  position: { x, y },
  targetPosition: Position.Left,
  sourcePosition: Position.Right,
  measured: width && height ? { width, height } : undefined,
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "test-workflow"
  },
  selected
});

describe("useCanvasBounds", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("bounds calculation", () => {
    it("returns null when no nodes exist", () => {
      mockUseNodes.mockImplementation(() => ({ nodes: [] }));

      const { result } = renderHook(() => useCanvasBounds());

      expect(result.current.bounds).toBeNull();
      expect(result.current.nodeCount).toBe(0);
      expect(result.current.selectedNodeCount).toBe(0);
    });

    it("calculates correct bounds for single node", () => {
      const nodes = [createMockNode("node1", 100, 200, 280, 100)];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());

      expect(result.current.bounds).not.toBeNull();
      expect(result.current.bounds!.xMin).toBe(0);
      expect(result.current.bounds!.xMax).toBe(480);
      expect(result.current.bounds!.yMin).toBe(150);
      expect(result.current.bounds!.yMax).toBe(350);
      expect(result.current.bounds!.width).toBeGreaterThan(0);
      expect(result.current.bounds!.height).toBeGreaterThan(0);
    });

    it("calculates correct bounds for multiple nodes", () => {
      const nodes = [
        createMockNode("node1", 100, 200, 280, 100),
        createMockNode("node2", 500, 300, 280, 100),
        createMockNode("node3", 200, 500, 280, 100)
      ];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());

      expect(result.current.bounds).not.toBeNull();
      expect(result.current.bounds!.xMin).toBe(0);
      expect(result.current.bounds!.xMax).toBe(880);
      expect(result.current.bounds!.yMin).toBe(150);
      expect(result.current.bounds!.yMax).toBe(650);
    });

    it("includes padding in bounds calculation by default", () => {
      const nodes = [createMockNode("node1", 200, 200, 280, 100)];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());

      expect(result.current.bounds).not.toBeNull();
      expect(result.current.bounds!.xMin).toBe(100);
      expect(result.current.bounds!.xMax).toBe(580);
    });

    it("excludes padding when includePadding is false", () => {
      const nodes = [createMockNode("node1", 200, 200, 280, 100)];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() =>
        useCanvasBounds({ includePadding: false })
      );

      expect(result.current.bounds).not.toBeNull();
      expect(result.current.bounds!.xMin).toBe(200);
      expect(result.current.bounds!.xMax).toBe(480);
    });

    it("uses custom padding value", () => {
      const nodes = [createMockNode("node1", 200, 200, 280, 100)];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() =>
        useCanvasBounds({ padding: 50 })
      );

      expect(result.current.bounds).not.toBeNull();
      expect(result.current.bounds!.xMin).toBe(150);
      expect(result.current.bounds!.xMax).toBe(530);
    });
  });

  describe("getBoundsForNodes", () => {
    it("returns bounds for specific node IDs", () => {
      const nodes = [
        createMockNode("node1", 100, 200, 280, 100),
        createMockNode("node2", 500, 300, 280, 100),
        createMockNode("node3", 200, 500, 280, 100)
      ];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());
      const bounds = result.current.getBoundsForNodes(["node1", "node3"]);

      expect(bounds).not.toBeNull();
      expect(bounds!.xMin).toBe(0);
      expect(bounds!.xMax).toBe(580);
      expect(bounds!.yMin).toBe(150);
      expect(bounds!.yMax).toBe(650);
    });

    it("returns null for non-existent node IDs", () => {
      const nodes = [createMockNode("node1", 100, 200, 280, 100)];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());
      const bounds = result.current.getBoundsForNodes(["nonexistent"]);

      expect(bounds).toBeNull();
    });

    it("returns null for empty node IDs array", () => {
      const nodes = [createMockNode("node1", 100, 200, 280, 100)];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());
      const bounds = result.current.getBoundsForNodes([]);

      expect(bounds).toBeNull();
    });
  });

  describe("getBoundsForSelectedNodes", () => {
    it("returns bounds for only selected nodes", () => {
      const nodes = [
        createMockNode("node1", 100, 200, 280, 100, true),
        createMockNode("node2", 500, 300, 280, 100, false),
        createMockNode("node3", 200, 500, 280, 100, true)
      ];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());
      const bounds = result.current.getBoundsForSelectedNodes();

      expect(bounds).not.toBeNull();
      expect(bounds!.xMin).toBe(0);
      expect(bounds!.xMax).toBe(580);
      expect(result.current.selectedNodeCount).toBe(2);
    });

    it("returns null when no nodes are selected", () => {
      const nodes = [
        createMockNode("node1", 100, 200, 280, 100, false),
        createMockNode("node2", 500, 300, 280, 100, false)
      ];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());
      const bounds = result.current.getBoundsForSelectedNodes();

      expect(bounds).toBeNull();
    });
  });

  describe("getBoundsForNodeType", () => {
    it("returns bounds for nodes of specific type", () => {
      const nodes: Node<NodeData>[] = [
        {
          ...createMockNode("node1", 100, 200, 280, 100),
          type: "input"
        },
        {
          ...createMockNode("node2", 500, 300, 280, 100),
          type: "output"
        },
        {
          ...createMockNode("node3", 200, 500, 280, 100),
          type: "input"
        }
      ];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());
      const bounds = result.current.getBoundsForNodeType("input");

      expect(bounds).not.toBeNull();
      expect(bounds!.xMin).toBe(0);
      expect(bounds!.xMax).toBe(580);
    });

    it("returns null when no nodes match the type", () => {
      const nodes = [createMockNode("node1", 100, 200, 280, 100)];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());
      const bounds = result.current.getBoundsForNodeType("nonexistent");

      expect(bounds).toBeNull();
    });
  });

  describe("isNodeInView", () => {
    const mockGetBoundingClientRect = jest.fn().mockReturnValue({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080
    });

    beforeEach(() => {
      jest.spyOn(document, "querySelector").mockImplementation((selector) => {
        if (selector === ".react-flow") {
          return {
            getBoundingClientRect: mockGetBoundingClientRect
          } as unknown as Element;
        }
        return null;
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("returns true when node is in viewport", () => {
      const nodes = [createMockNode("node1", 100, 200, 280, 100)];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());
      const isInView = result.current.isNodeInView("node1", { x: 0, y: 0, zoom: 1 });

      expect(isInView).toBe(true);
    });

    it("returns false when node is not in viewport", () => {
      const nodes = [createMockNode("node1", 100, 200, 280, 100)];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());
      const isInView = result.current.isNodeInView("node1", { x: -1000, y: 0, zoom: 1 });

      expect(isInView).toBe(false);
    });

    it("returns false for non-existent node", () => {
      const nodes = [createMockNode("node1", 100, 200, 280, 100)];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());
      const isInView = result.current.isNodeInView("nonexistent", { x: 0, y: 0, zoom: 1 });

      expect(isInView).toBe(false);
    });

    it("returns false when react-flow wrapper not found", () => {
      jest.spyOn(document, "querySelector").mockReturnValue(null);
      const nodes = [createMockNode("node1", 100, 200, 280, 100)];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());
      const isInView = result.current.isNodeInView("node1", { x: 0, y: 0, zoom: 1 });

      expect(isInView).toBe(false);
    });
  });

  describe("center calculation", () => {
    it("calculates correct center point", () => {
      const nodes = [
        createMockNode("node1", 100, 100, 200, 100),
        createMockNode("node2", 300, 300, 200, 100)
      ];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());

      expect(result.current.bounds).not.toBeNull();
      expect(result.current.bounds!.center.x).toBe(300);
      expect(result.current.bounds!.center.y).toBe(250);
    });
  });

  describe("node count tracking", () => {
    it("tracks total node count", () => {
      const nodes = [
        createMockNode("node1", 100, 200),
        createMockNode("node2", 500, 300),
        createMockNode("node3", 200, 500)
      ];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());

      expect(result.current.nodeCount).toBe(3);
    });

    it("tracks selected node count", () => {
      const nodes = [
        createMockNode("node1", 100, 200, 280, 100, true),
        createMockNode("node2", 500, 300, 280, 100, false),
        createMockNode("node3", 200, 500, 280, 100, true)
      ];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());

      expect(result.current.selectedNodeCount).toBe(2);
    });
  });

  describe("bounds state", () => {
    it("hasNodes reflects whether nodes exist", () => {
      mockUseNodes.mockImplementation(() => ({ nodes: [] }));

      const { result: emptyResult } = renderHook(() => useCanvasBounds());
      expect(emptyResult.current.bounds).toBeNull();

      const nodes = [createMockNode("node1", 100, 200)];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result: filledResult } = renderHook(() => useCanvasBounds());
      expect(filledResult.current.bounds?.hasNodes).toBe(true);
    });

    it("provides consistent bounds object structure", () => {
      const nodes = [createMockNode("node1", 100, 200, 280, 100)];
      mockUseNodes.mockImplementation(() => ({ nodes }));

      const { result } = renderHook(() => useCanvasBounds());
      const bounds = result.current.bounds as CanvasBounds;

      expect(bounds).toHaveProperty("xMin");
      expect(bounds).toHaveProperty("xMax");
      expect(bounds).toHaveProperty("yMin");
      expect(bounds).toHaveProperty("yMax");
      expect(bounds).toHaveProperty("width");
      expect(bounds).toHaveProperty("height");
      expect(bounds).toHaveProperty("center");
      expect(bounds).toHaveProperty("hasNodes");
      expect(typeof bounds.center.x).toBe("number");
      expect(typeof bounds.center.y).toBe("number");
    });
  });
});
