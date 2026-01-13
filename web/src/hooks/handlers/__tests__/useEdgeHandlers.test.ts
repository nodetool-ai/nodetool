import { renderHook } from "@testing-library/react";
import { Edge } from "@xyflow/react";
import { MouseEvent as ReactMouseEvent } from "react";
import useEdgeHandlers from "../useEdgeHandlers";
import { useNodes } from "../../../contexts/NodeContext";
import useContextMenuStore from "../../../stores/ContextMenuStore";

jest.mock("../../../contexts/NodeContext");
jest.mock("../../../stores/ContextMenuStore");

jest.mock("../../../stores/EdgeInsertionStore", () => ({
  __esModule: true,
  default: jest.fn((selector) => {
    if (selector) {
      return selector({ startInsertion: jest.fn() });
    }
    return { startInsertion: jest.fn() };
  })
}));

jest.mock("../../../stores/NodeMenuStore", () => ({
  __esModule: true,
  default: jest.fn((selector) => {
    if (selector) {
      return selector({ openNodeMenu: jest.fn() });
    }
    return { openNodeMenu: jest.fn() };
  })
}));

describe("useEdgeHandlers", () => {
  const mockFindEdge = jest.fn();
  const mockUpdateEdge = jest.fn();
  const mockDeleteEdge = jest.fn();
  const mockSetEdgeUpdateSuccessful = jest.fn();
  const mockOpenContextMenu = jest.fn();

  const mockedUseNodes = useNodes as jest.Mock;
  const mockedUseContextMenuStore = useContextMenuStore as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseNodes.mockReturnValue({
      findEdge: mockFindEdge,
      updateEdge: mockUpdateEdge,
      deleteEdge: mockDeleteEdge,
      edgeUpdateSuccessful: true,
      setEdgeUpdateSuccessful: mockSetEdgeUpdateSuccessful
    });
    mockedUseContextMenuStore.mockReturnValue({
      openContextMenu: mockOpenContextMenu
    });
  });

  it("deletes the edge when middle mouse button is pressed", () => {
    const { result } = renderHook(() => useEdgeHandlers());
    const edge = { id: "edge-1" } as Edge;
    const preventDefault = jest.fn();
    const stopPropagation = jest.fn();

    result.current.onEdgeClick(
      {
        button: 1,
        preventDefault,
        stopPropagation
      } as unknown as ReactMouseEvent,
      edge
    );

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(mockDeleteEdge).toHaveBeenCalledWith("edge-1");
  });

  it("ignores non-middle mouse buttons", () => {
    const { result } = renderHook(() => useEdgeHandlers());
    const edge = { id: "edge-2" } as Edge;

    result.current.onEdgeClick(
      {
        button: 0,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      } as unknown as ReactMouseEvent,
      edge
    );

    expect(mockDeleteEdge).not.toHaveBeenCalled();
  });

  describe("onEdgeDoubleClick", () => {
    it("opens insertion mode and node menu when edge is double-clicked", () => {
      const { result } = renderHook(() => useEdgeHandlers());
      const edge: Edge = {
        id: "edge-1",
        source: "node-a",
        target: "node-b",
        sourceHandle: "output",
        targetHandle: "input"
      };
      const preventDefault = jest.fn();
      const stopPropagation = jest.fn();

      expect(() => {
        result.current.onEdgeDoubleClick(
          {
            button: 0,
            preventDefault,
            stopPropagation,
            clientX: 150,
            clientY: 200
          } as unknown as ReactMouseEvent,
          edge
        );
      }).not.toThrow();

      expect(preventDefault).toHaveBeenCalled();
      expect(stopPropagation).toHaveBeenCalled();
    });

    it("handles double-click with all edge properties", () => {
      const { result } = renderHook(() => useEdgeHandlers());
      const edge: Edge = {
        id: "test-edge",
        source: "source-node",
        target: "target-node",
        sourceHandle: "out-1",
        targetHandle: "in-1",
        label: "test connection",
        animated: true
      };

      expect(() => {
        result.current.onEdgeDoubleClick(
          {
            button: 0,
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
            clientX: 300,
            clientY: 400
          } as unknown as ReactMouseEvent,
          edge
        );
      }).not.toThrow();
    });
  });
});

