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
