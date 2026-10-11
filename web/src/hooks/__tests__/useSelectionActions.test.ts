import { renderHook } from "@testing-library/react";
import { asMock, selectorOver } from "../../test-utils/doubles";
import { useSelectionActions } from "../useSelectionActions";

/** The node members these tests place, position and read back. */
interface PositionedNode {
  id: string;
  position: { x: number; y: number };
  selected?: boolean;
  measured?: { width: number; height: number };
}

const mockSetNodes = jest.fn<void, [PositionedNode[]]>();
const mockSetEdges = jest.fn();
const mockSurroundWithGroup = jest.fn();

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn(),
  useNodeStoreRef: jest.fn(),
  useTemporalNodes: jest.fn(() => ({
    pause: jest.fn(),
    resume: jest.fn()
  }))
}));

jest.mock("../nodes/useSurroundWithGroup", () => ({
  useSurroundWithGroup: jest.fn(() => mockSurroundWithGroup)
}));

import { useNodes, useNodeStoreRef } from "../../contexts/NodeContext";

describe("useSelectionActions", () => {
  const defaultNodes = [
    {
      id: "1",
      position: { x: 0, y: 0 },
      selected: true,
      measured: { width: 100, height: 50 }
    },
    {
      id: "2",
      position: { x: 200, y: 0 },
      selected: true,
      measured: { width: 100, height: 50 }
    },
    {
      id: "3",
      position: { x: 400, y: 0 },
      selected: true,
      measured: { width: 100, height: 50 }
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    asMock(useNodes).mockImplementation(
      selectorOver({
        nodes: defaultNodes,
        edges: [],
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
        getSelectedNodes: jest.fn(() => defaultNodes),
        deleteNodes: jest.fn(),
        deleteEdges: jest.fn(),
        updateNodeData: jest.fn(),
        toggleBypassSelected: jest.fn()
      })
    );
    
    // Mock useNodeStoreRef to return a store with getState
    asMock(useNodeStoreRef).mockReturnValue({
      getState: () => ({
        nodes: defaultNodes,
        edges: []
      })
    });
  });

  describe("alignLeft", () => {
    it("aligns selected nodes to the leftmost position", () => {
      const { result } = renderHook(() => useSelectionActions());
      result.current.alignLeft();
      expect(mockSetNodes).toHaveBeenCalled();
    });

    it("does nothing with fewer than 2 nodes", () => {
      asMock(useNodes).mockImplementation(
        selectorOver({
          getSelectedNodes: () => [
            { id: "1", position: { x: 0, y: 0 }, selected: true }
          ]
        })
      );

      const { result } = renderHook(() => useSelectionActions());
      result.current.alignLeft();
      expect(mockSetNodes).not.toHaveBeenCalled();
    });
  });

  describe("group children", () => {
    // Group at (1000, 1000) holding A at relative (20, 40); B on the canvas.
    const groupNodes = [
      { id: "group", position: { x: 1000, y: 1000 }, selected: false },
      {
        id: "A",
        parentId: "group",
        position: { x: 20, y: 40 },
        selected: true,
        measured: { width: 100, height: 50 }
      },
      {
        id: "B",
        position: { x: 500, y: 0 },
        selected: true,
        measured: { width: 100, height: 50 }
      }
    ];

    const useGraph = (nodes: Array<PositionedNode & { parentId?: string }>) => {
      asMock(useNodes).mockImplementation(
        selectorOver({
          setNodes: mockSetNodes,
          getSelectedNodes: () => nodes.filter((n) => n.selected)
        })
      );
      asMock(useNodeStoreRef).mockReturnValue({
        getState: () => ({ nodes, edges: [] })
      });
    };

    it("aligns in canvas coordinates and writes a child back relative to its group", () => {
      useGraph(groupNodes);
      const { result } = renderHook(() => useSelectionActions());
      result.current.alignLeft();

      const written = new Map(
        mockSetNodes.mock.calls[0][0].map((n) => [n.id, n.position])
      );
      expect(written.get("B")).toEqual({ x: 500, y: 0 });
      expect(written.get("A")).toEqual({ x: -500, y: 40 });
      expect(written.get("group")).toEqual({ x: 1000, y: 1000 });
    });

    it("leaves a child of a selected group where the group puts it", () => {
      useGraph(
        groupNodes.map((n) => (n.id === "group" ? { ...n, selected: true } : n))
      );
      const { result } = renderHook(() => useSelectionActions());
      result.current.alignTop();

      const written = new Map(
        mockSetNodes.mock.calls[0][0].map((n) => [n.id, n.position])
      );
      expect(written.get("group")).toEqual({ x: 1000, y: 0 });
      expect(written.get("A")).toEqual({ x: 20, y: 40 });
      expect(written.get("B")).toEqual({ x: 500, y: 0 });
    });
  });

  describe("alignCenter", () => {
    it("aligns selected nodes by their horizontal centers", () => {
      const testNodes = [
        {
          id: "1",
          position: { x: 0, y: 0 },
          selected: true,
          measured: { width: 100, height: 50 }
        },
        {
          id: "2",
          position: { x: 200, y: 0 },
          selected: true,
          measured: { width: 100, height: 50 }
        }
      ];
      asMock(useNodes).mockImplementation(
        selectorOver({
          nodes: testNodes,
          edges: [],
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
          getSelectedNodes: () => testNodes
        })
      );

      const { result } = renderHook(() => useSelectionActions());
      result.current.alignCenter();
      expect(mockSetNodes).toHaveBeenCalled();

      // Get the nodes array passed directly to setNodes
      const updatedNodes = mockSetNodes.mock.calls[0][0];

      // Both nodes should have their centers aligned
      // Node 1 center: 0 + 100/2 = 50
      // Node 2 center: 200 + 100/2 = 250
      // Average center: (50 + 250) / 2 = 150
      // Node 1 new x: 150 - 100/2 = 100
      // Node 2 new x: 150 - 100/2 = 100
      expect(updatedNodes[0].position.x).toBe(100);
      expect(updatedNodes[1].position.x).toBe(100);
    });
  });

  describe("alignMiddle", () => {
    it("aligns selected nodes by their vertical centers", () => {
      const testNodes = [
        {
          id: "1",
          position: { x: 0, y: 0 },
          selected: true,
          measured: { width: 100, height: 50 }
        },
        {
          id: "2",
          position: { x: 0, y: 100 },
          selected: true,
          measured: { width: 100, height: 50 }
        }
      ];
      asMock(useNodes).mockImplementation(
        selectorOver({
          nodes: testNodes,
          edges: [],
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
          getSelectedNodes: () => testNodes
        })
      );

      const { result } = renderHook(() => useSelectionActions());
      result.current.alignMiddle();
      expect(mockSetNodes).toHaveBeenCalled();

      // Get the nodes array passed directly to setNodes
      const updatedNodes = mockSetNodes.mock.calls[0][0];

      // Both nodes should have their vertical centers aligned
      // Node 1 center: 0 + 50/2 = 25
      // Node 2 center: 100 + 50/2 = 125
      // Average center: (25 + 125) / 2 = 75
      // Node 1 new y: 75 - 50/2 = 50
      // Node 2 new y: 75 - 50/2 = 50
      expect(updatedNodes[0].position.y).toBe(50);
      expect(updatedNodes[1].position.y).toBe(50);
    });
  });

  describe("distributeHorizontal", () => {
    it("distributes nodes with minimum spacing", () => {
      const { result } = renderHook(() => useSelectionActions());
      result.current.distributeHorizontal();
      expect(mockSetNodes).toHaveBeenCalled();
    });

    it("distributes nodes in x-order, independent of getSelectedNodes() ordering", () => {
      const testNodes = [
        // Intentionally not in x-order (simulates input nodes being returned last)
        {
          id: "A",
          position: { x: 200, y: 0 },
          selected: true,
          measured: { width: 100, height: 50 }
        },
        {
          id: "B",
          position: { x: 400, y: 0 },
          selected: true,
          measured: { width: 100, height: 50 }
        },
        {
          id: "input",
          position: { x: 0, y: 0 },
          selected: true,
          measured: { width: 100, height: 50 }
        }
      ];
      asMock(useNodes).mockImplementation(
        selectorOver({
          nodes: testNodes,
          edges: [],
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
          getSelectedNodes: () => testNodes
        })
      );
      
      // Update the store mock for this test
      asMock(useNodeStoreRef).mockReturnValue({
        getState: () => ({
          nodes: testNodes,
          edges: []
        })
      });

      const { result } = renderHook(() => useSelectionActions());
      result.current.distributeHorizontal();

      // Get the nodes array passed directly to setNodes
      const updatedNodes = mockSetNodes.mock.calls[0][0];
      const byId = Object.fromEntries(updatedNodes.map((n) => [n.id, n]));

      // Sequential placement with spacing from leftMostX:
      // Formula: leftMostX + (index * (nodeWidth + HORIZONTAL_SPACING))
      // nodeWidth=100, HORIZONTAL_SPACING=40
      // Positions: 0 + (0 * 140) = 0, 0 + (1 * 140) = 140, 0 + (2 * 140) = 280
      expect(byId.input.position.x).toBe(0);
      expect(byId.A.position.x).toBe(140);
      expect(byId.B.position.x).toBe(280);
    });

    it("distributes with 2 nodes", () => {
      const testNodes = [
        {
          id: "1",
          position: { x: 0, y: 0 },
          selected: true,
          measured: { width: 100, height: 50 }
        },
        {
          id: "2",
          position: { x: 120, y: 0 },
          selected: true,
          measured: { width: 100, height: 50 }
        }
      ];
      asMock(useNodes).mockImplementation(
        selectorOver({
          nodes: testNodes,
          edges: [],
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
          getSelectedNodes: () => testNodes
        })
      );

      const { result } = renderHook(() => useSelectionActions());
      result.current.distributeHorizontal();
      expect(mockSetNodes).toHaveBeenCalled();
    });

    it("does nothing with fewer than 2 nodes", () => {
      asMock(useNodes).mockImplementation(
        selectorOver({
          getSelectedNodes: () => [
            { id: "1", position: { x: 0, y: 0 }, selected: true }
          ]
        })
      );

      const { result } = renderHook(() => useSelectionActions());
      result.current.distributeHorizontal();
      expect(mockSetNodes).not.toHaveBeenCalled();
    });
  });

  describe("distributeVertical", () => {
    it("distributes nodes in y-order, independent of getSelectedNodes() ordering", () => {
      const testNodes = [
        // Intentionally not in y-order (simulates input nodes being returned last)
        {
          id: "A",
          position: { x: 0, y: 200 },
          selected: true,
          measured: { width: 100, height: 50 }
        },
        {
          id: "B",
          position: { x: 0, y: 400 },
          selected: true,
          measured: { width: 100, height: 50 }
        },
        {
          id: "input",
          position: { x: 0, y: 0 },
          selected: true,
          measured: { width: 100, height: 50 }
        }
      ];
      asMock(useNodes).mockImplementation(
        selectorOver({
          nodes: testNodes,
          edges: [],
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
          getSelectedNodes: () => testNodes
        })
      );
      
      // Update the store mock for this test
      asMock(useNodeStoreRef).mockReturnValue({
        getState: () => ({
          nodes: testNodes,
          edges: []
        })
      });

      const { result } = renderHook(() => useSelectionActions());
      result.current.distributeVertical();

      // Get the nodes array passed directly to setNodes
      const updatedNodes = mockSetNodes.mock.calls[0][0];
      const byId = Object.fromEntries(updatedNodes.map((n) => [n.id, n]));

      // Sequential placement with spacing from topMostY:
      // Formula: topMostY + (index * (nodeHeight + VERTICAL_SPACING))
      // nodeHeight=50, VERTICAL_SPACING=20
      // Positions: 0 + (0 * 70) = 0, 0 + (1 * 70) = 70, 0 + (2 * 70) = 140
      expect(byId.input.position.y).toBe(0);
      expect(byId.A.position.y).toBe(70);
      expect(byId.B.position.y).toBe(140);
    });

    it("distributes with 2 nodes", () => {
      const testNodes = [
        {
          id: "1",
          position: { x: 0, y: 0 },
          selected: true,
          measured: { width: 100, height: 50 }
        },
        {
          id: "2",
          position: { x: 0, y: 120 },
          selected: true,
          measured: { width: 100, height: 50 }
        }
      ];
      asMock(useNodes).mockImplementation(
        selectorOver({
          nodes: testNodes,
          edges: [],
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
          getSelectedNodes: () => testNodes
        })
      );

      const { result } = renderHook(() => useSelectionActions());
      result.current.distributeVertical();
      expect(mockSetNodes).toHaveBeenCalled();
    });
  });

  describe("duplicateSelected", () => {
    it("duplicates nodes with offset and deselects originals", () => {
      const testNodes = [
        { id: "1", position: { x: 0, y: 0 }, selected: true, data: {} }
      ];
      asMock(useNodes).mockImplementation(
        selectorOver({
          nodes: testNodes,
          edges: [],
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
          getSelectedNodes: () => testNodes
        })
      );
      
      // Update the store mock for this test
      asMock(useNodeStoreRef).mockReturnValue({
        getState: () => ({
          nodes: testNodes,
          edges: []
        })
      });

      const { result } = renderHook(() => useSelectionActions());
      result.current.duplicateSelected();
      expect(mockSetNodes).toHaveBeenCalled();

      // Get the nodes array passed to setNodes
      const updatedNodes = mockSetNodes.mock.calls[0][0];

      // Should have original + duplicate
      expect(updatedNodes.length).toBe(2);
      // Original should be deselected
      expect(updatedNodes[0].selected).toBe(false);
      // Duplicate should be selected with 50px offset
      expect(updatedNodes[1].selected).toBe(true);
      expect(updatedNodes[1].position.x).toBe(50);
      expect(updatedNodes[1].position.y).toBe(50);
    });
  });

  describe("deleteSelected", () => {
    it("deletes all selected nodes", () => {
      const mockDeleteNodes = jest.fn();
      const mockDeleteEdges = jest.fn();
      const testNodes = [
        { id: "1", position: { x: 0, y: 0 }, selected: true },
        { id: "2", position: { x: 200, y: 0 }, selected: true }
      ];
      asMock(useNodes).mockImplementation(
        selectorOver({
          nodes: testNodes,
          edges: [],
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
          getSelectedNodes: () => testNodes,
          deleteNodes: mockDeleteNodes,
          deleteEdges: mockDeleteEdges
        })
      );
      asMock(useNodeStoreRef).mockReturnValue({
        getState: () => ({
          nodes: testNodes,
          edges: []
        })
      });

      const { result } = renderHook(() => useSelectionActions());
      result.current.deleteSelected();
      expect(mockDeleteNodes).toHaveBeenCalledTimes(1);
      expect(mockDeleteNodes).toHaveBeenCalledWith(["1", "2"]);
      expect(mockDeleteEdges).toHaveBeenCalledWith([]);
    });

    it("deletes selected edges when no nodes are selected", () => {
      const mockDeleteNodes = jest.fn();
      const mockDeleteEdges = jest.fn();
      const edges = [
        { id: "e-1", selected: true },
        { id: "e-2", selected: false },
        { id: "e-3", selected: true }
      ];
      asMock(useNodes).mockImplementation(
        selectorOver({
          nodes: [],
          edges,
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
          getSelectedNodes: () => [],
          deleteNodes: mockDeleteNodes,
          deleteEdges: mockDeleteEdges,
          toggleBypassSelected: jest.fn()
        })
      );
      asMock(useNodeStoreRef).mockReturnValue({
        getState: () => ({
          nodes: [],
          edges
        })
      });

      const { result } = renderHook(() => useSelectionActions());
      result.current.deleteSelected();

      expect(mockDeleteNodes).toHaveBeenCalledWith([]);
      expect(mockDeleteEdges).toHaveBeenCalledTimes(1);
      expect(mockDeleteEdges).toHaveBeenCalledWith(["e-1", "e-3"]);
    });
  });

  describe("bypassSelected", () => {
    it("toggles bypass on selected nodes", () => {
      const mockToggleBypass = jest.fn();
      const testNodes = [{ id: "1", position: { x: 0, y: 0 }, selected: true }];
      asMock(useNodes).mockImplementation(
        selectorOver({
          nodes: testNodes,
          edges: [],
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
          getSelectedNodes: () => testNodes,
          toggleBypassSelected: mockToggleBypass
        })
      );

      const { result } = renderHook(() => useSelectionActions());
      result.current.bypassSelected();
      expect(mockToggleBypass).toHaveBeenCalledTimes(1);
    });
  });

  describe("stackSelected and arrangeGrid", () => {
    const node = (id: string, x: number, y: number, width = 100, height = 50) => ({
      id,
      position: { x, y },
      selected: true,
      measured: { width, height }
    });

    const arrange = (
      testNodes: PositionedNode[],
      action: "stackSelected" | "arrangeGrid"
    ) => {
      asMock(useNodes).mockImplementation(
        selectorOver({
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
          getSelectedNodes: () => testNodes
        })
      );
      asMock(useNodeStoreRef).mockReturnValue({
        getState: () => ({ nodes: testNodes, edges: [] })
      });
      const { result } = renderHook(() => useSelectionActions());
      result.current[action]();
      return Object.fromEntries(
        mockSetNodes.mock.calls[0][0].map((n) => [n.id, n.position])
      );
    };

    it("stacks nodes in one column in reading order", () => {
      const positions = arrange(
        [node("b", 300, 100, 100, 80), node("a", 50, 10, 100, 60), node("c", 0, 200)],
        "stackSelected"
      );
      expect(positions).toEqual({
        a: { x: 0, y: 10 },
        b: { x: 0, y: 90 },
        c: { x: 0, y: 190 }
      });
    });

    it("arranges nodes in a near-square grid sized by the largest cells", () => {
      const positions = arrange(
        [
          node("1", 0, 0, 200, 100),
          node("2", 500, 0),
          node("3", 0, 400),
          node("4", 500, 400, 100, 150),
          node("5", 900, 900)
        ],
        "arrangeGrid"
      );
      // 5 nodes -> 3 columns. Column widths 200, 100, 100; row heights 100, 150.
      expect(positions).toEqual({
        "1": { x: 0, y: 0 },
        "2": { x: 240, y: 0 },
        "3": { x: 380, y: 0 },
        "4": { x: 0, y: 120 },
        "5": { x: 240, y: 120 }
      });
    });

    it("does nothing with fewer than 2 nodes", () => {
      asMock(useNodes).mockImplementation(
        selectorOver({ getSelectedNodes: () => [node("1", 0, 0)] })
      );
      const { result } = renderHook(() => useSelectionActions());
      result.current.stackSelected();
      result.current.arrangeGrid();
      expect(mockSetNodes).not.toHaveBeenCalled();
    });
  });
});
