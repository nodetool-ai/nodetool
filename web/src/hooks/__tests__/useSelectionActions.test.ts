import { renderHook } from "@testing-library/react";
import { useSelectionActions } from "../useSelectionActions";

const mockSetNodes = jest.fn();
const mockSetEdges = jest.fn();

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(() => ({
    setNodes: mockSetNodes,
    setEdges: mockSetEdges,
    getEdges: jest.fn(() => [])
  }))
}));

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

import { useNodes } from "../../contexts/NodeContext";

describe("useSelectionActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        getSelectedNodes: jest.fn(() => [
          { id: "1", position: { x: 0, y: 0 }, selected: true, measured: { width: 100, height: 50 } },
          { id: "2", position: { x: 200, y: 0 }, selected: true, measured: { width: 100, height: 50 } },
          { id: "3", position: { x: 400, y: 0 }, selected: true, measured: { width: 100, height: 50 } }
        ]),
        deleteNode: jest.fn(),
        updateNodeData: jest.fn(),
        toggleBypassSelected: jest.fn()
      })
    );
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
          getSelectedNodes: () => [{ id: "1", position: { x: 0, y: 0 }, selected: true }]
        })
      );

      const { result } = renderHook(() => useSelectionActions());
      result.current.alignLeft();
      expect(mockSetNodes).not.toHaveBeenCalled();
    });
  });

  describe("alignCenter", () => {
    it("aligns selected nodes by their horizontal centers", () => {
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
          getSelectedNodes: () => [
            { id: "1", position: { x: 0, y: 0 }, selected: true, measured: { width: 100, height: 50 } },
            { id: "2", position: { x: 200, y: 0 }, selected: true, measured: { width: 100, height: 50 } }
          ]
        })
      );

      const { result } = renderHook(() => useSelectionActions());
      result.current.alignCenter();
      expect(mockSetNodes).toHaveBeenCalled();
      
      // Get the update function passed to setNodes
      const updateFn = mockSetNodes.mock.calls[0][0];
      const currentNodes = [
        { id: "1", position: { x: 0, y: 0 }, selected: true, measured: { width: 100, height: 50 } },
        { id: "2", position: { x: 200, y: 0 }, selected: true, measured: { width: 100, height: 50 } }
      ];
      const updatedNodes = updateFn(currentNodes);
      
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
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
          getSelectedNodes: () => [
            { id: "1", position: { x: 0, y: 0 }, selected: true, measured: { width: 100, height: 50 } },
            { id: "2", position: { x: 0, y: 100 }, selected: true, measured: { width: 100, height: 50 } }
          ]
        })
      );

      const { result } = renderHook(() => useSelectionActions());
      result.current.alignMiddle();
      expect(mockSetNodes).toHaveBeenCalled();
      
      // Get the update function passed to setNodes
      const updateFn = mockSetNodes.mock.calls[0][0];
      const currentNodes = [
        { id: "1", position: { x: 0, y: 0 }, selected: true, measured: { width: 100, height: 50 } },
        { id: "2", position: { x: 0, y: 100 }, selected: true, measured: { width: 100, height: 50 } }
      ];
      const updatedNodes = updateFn(currentNodes);
      
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

    it("does nothing with fewer than 3 nodes", () => {
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
          getSelectedNodes: () => [
            { id: "1", position: { x: 0, y: 0 }, selected: true },
            { id: "2", position: { x: 200, y: 0 }, selected: true }
          ]
        })
      );

      const { result } = renderHook(() => useSelectionActions());
      result.current.distributeHorizontal();
      expect(mockSetNodes).not.toHaveBeenCalled();
    });
  });

  describe("duplicateSelected", () => {
    it("duplicates nodes with offset and deselects originals", () => {
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
          getSelectedNodes: () => [
            { id: "1", position: { x: 0, y: 0 }, selected: true, data: {} }
          ]
        })
      );

      const { result } = renderHook(() => useSelectionActions());
      result.current.duplicateSelected();
      expect(mockSetNodes).toHaveBeenCalled();
      
      // Get the update function passed to setNodes
      const updateFn = mockSetNodes.mock.calls[0][0];
      const currentNodes = [
        { id: "1", position: { x: 0, y: 0 }, selected: true, data: {} }
      ];
      const updatedNodes = updateFn(currentNodes);
      
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
      const mockDeleteNode = jest.fn();
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
          getSelectedNodes: () => [
            { id: "1", position: { x: 0, y: 0 }, selected: true },
            { id: "2", position: { x: 200, y: 0 }, selected: true }
          ],
          deleteNode: mockDeleteNode
        })
      );

      const { result } = renderHook(() => useSelectionActions());
      result.current.deleteSelected();
      expect(mockDeleteNode).toHaveBeenCalledTimes(2);
      expect(mockDeleteNode).toHaveBeenCalledWith("1");
      expect(mockDeleteNode).toHaveBeenCalledWith("2");
    });
  });

  describe("bypassSelected", () => {
    it("toggles bypass on selected nodes", () => {
      const mockToggleBypass = jest.fn();
      (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
          getSelectedNodes: () => [{ id: "1", position: { x: 0, y: 0 }, selected: true }],
          toggleBypassSelected: mockToggleBypass
        })
      );

      const { result } = renderHook(() => useSelectionActions());
      result.current.bypassSelected();
      expect(mockToggleBypass).toHaveBeenCalledTimes(1);
    });
  });
});
