import { renderHook } from "@testing-library/react";
import { useSelectionActions } from "../useSelectionActions";

const mockSetNodes = jest.fn();
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
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
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
    (useNodeStoreRef as unknown as jest.Mock).mockReturnValue({
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
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
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
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
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
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
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
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
          nodes: testNodes,
          edges: [],
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
          getSelectedNodes: () => testNodes
        })
      );
      
      // Update the store mock for this test
      (useNodeStoreRef as unknown as jest.Mock).mockReturnValue({
        getState: () => ({
          nodes: testNodes,
          edges: []
        })
      });

      const { result } = renderHook(() => useSelectionActions());
      result.current.distributeHorizontal();

      // Get the nodes array passed directly to setNodes
      const updatedNodes = mockSetNodes.mock.calls[0][0];
      const byId = Object.fromEntries(updatedNodes.map((n: any) => [n.id, n]));

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
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
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
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
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
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
          nodes: testNodes,
          edges: [],
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
          getSelectedNodes: () => testNodes
        })
      );
      
      // Update the store mock for this test
      (useNodeStoreRef as unknown as jest.Mock).mockReturnValue({
        getState: () => ({
          nodes: testNodes,
          edges: []
        })
      });

      const { result } = renderHook(() => useSelectionActions());
      result.current.distributeVertical();

      // Get the nodes array passed directly to setNodes
      const updatedNodes = mockSetNodes.mock.calls[0][0];
      const byId = Object.fromEntries(updatedNodes.map((n: any) => [n.id, n]));

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
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
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
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
          nodes: testNodes,
          edges: [],
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
          getSelectedNodes: () => testNodes
        })
      );
      
      // Update the store mock for this test
      (useNodeStoreRef as unknown as jest.Mock).mockReturnValue({
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
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
          nodes: testNodes,
          edges: [],
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
          getSelectedNodes: () => testNodes,
          deleteNodes: mockDeleteNodes,
          deleteEdges: mockDeleteEdges
        })
      );
      (useNodeStoreRef as unknown as jest.Mock).mockReturnValue({
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
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
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
      (useNodeStoreRef as unknown as jest.Mock).mockReturnValue({
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
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
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
});
