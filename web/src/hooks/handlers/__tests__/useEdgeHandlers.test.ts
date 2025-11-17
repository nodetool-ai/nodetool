import { renderHook } from "@testing-library/react";
import { Edge } from "@xyflow/react";
import { MouseEvent as ReactMouseEvent } from "react";
import useEdgeHandlers from "../useEdgeHandlers";
import { useNodes } from "../../../contexts/NodeContext";
import useContextMenuStore from "../../../stores/ContextMenuStore";

jest.mock("../../../contexts/NodeContext");
jest.mock("../../../stores/ContextMenuStore");

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
});

