import { renderHook } from "@testing-library/react";
import type { Edge } from "@xyflow/react";
import { MouseEvent as ReactMouseEvent } from "react";
import useEdgeHandlers from "../useEdgeHandlers";
import { useNodes } from "../../../contexts/NodeContext";
import useContextMenuStore from "../../../stores/ContextMenuStore";
import useConnectionStore from "../../../stores/ConnectionStore";

jest.mock("../../../contexts/NodeContext");
jest.mock("../../../stores/ContextMenuStore");
jest.mock("../../../stores/ConnectionStore");

describe("useEdgeHandlers", () => {
  const mockFindEdge = jest.fn();
  const mockUpdateEdge = jest.fn();
  const mockDeleteEdge = jest.fn();
  const mockSetEdgeUpdateSuccessful = jest.fn();
  const mockOpenContextMenu = jest.fn();
  const mockSetIsReconnecting = jest.fn();

  const mockedUseNodes = useNodes as unknown as jest.Mock;
  const mockedUseContextMenuStore = useContextMenuStore as unknown as jest.Mock;
  const mockedUseConnectionStore = useConnectionStore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseNodes.mockImplementation((selector: any) => {
      const state = {
        findEdge: mockFindEdge,
        updateEdge: mockUpdateEdge,
        deleteEdge: mockDeleteEdge,
        edgeUpdateSuccessful: true,
        setEdgeUpdateSuccessful: mockSetEdgeUpdateSuccessful
      };
      return selector ? selector(state) : state;
    });
    mockedUseContextMenuStore.mockImplementation((selector: any) => {
      const state = {
        openContextMenu: mockOpenContextMenu
      };
      return selector ? selector(state) : state;
    });
    mockedUseConnectionStore.mockImplementation((selector: any) => {
      const state = {
        setIsReconnecting: mockSetIsReconnecting
      };
      return selector ? selector(state) : state;
    });
  });

  describe("onEdgeClick", () => {
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

  describe("onEdgeMouseEnter", () => {
    it("sets edge label and adds hovered class name", () => {
      const { result } = renderHook(() => useEdgeHandlers());
      const edge = { id: "edge-3", className: "custom-edge" } as Edge;
      const mockHoveredEdge = {
        id: "edge-3",
        className: "custom-edge",
        selected: false,
        animated: false,
        label: ""
      };

      mockFindEdge.mockReturnValue(mockHoveredEdge);

      result.current.onEdgeMouseEnter(
        {} as React.MouseEvent,
        edge
      );

      expect(mockFindEdge).toHaveBeenCalledWith("edge-3");
      expect(mockHoveredEdge.label).toBe("CUSTOM-EDGE");
      expect(mockHoveredEdge.className).toBe("custom-edge hovered");
      expect(mockUpdateEdge).toHaveBeenCalledWith(mockHoveredEdge);
    });

    it("sets animated flag for selected edges on hover", () => {
      const { result } = renderHook(() => useEdgeHandlers());
      const edge = { id: "edge-4", className: "selected-edge" } as Edge;
      const mockHoveredEdge = {
        id: "edge-4",
        className: "selected-edge",
        selected: true,
        animated: false,
        label: ""
      };

      mockFindEdge.mockReturnValue(mockHoveredEdge);

      result.current.onEdgeMouseEnter(
        {} as React.MouseEvent,
        edge
      );

      expect(mockHoveredEdge.animated).toBe(true);
      expect(mockUpdateEdge).toHaveBeenCalledWith(mockHoveredEdge);
    });

    it("does not duplicate hovered class name", () => {
      const { result } = renderHook(() => useEdgeHandlers());
      const edge = { id: "edge-5", className: "custom-edge hovered" } as Edge;
      const mockHoveredEdge = {
        id: "edge-5",
        className: "custom-edge hovered",
        selected: false,
        animated: false,
        label: ""
      };

      mockFindEdge.mockReturnValue(mockHoveredEdge);

      result.current.onEdgeMouseEnter(
        {} as React.MouseEvent,
        edge
      );

      expect(mockHoveredEdge.className).toBe("custom-edge hovered");
      expect(mockUpdateEdge).toHaveBeenCalledWith(mockHoveredEdge);
    });

    it("handles edge without className", () => {
      const { result } = renderHook(() => useEdgeHandlers());
      const edge = { id: "edge-6" } as Edge;
      const mockHoveredEdge = {
        id: "edge-6",
        selected: false,
        animated: false,
        label: ""
      };

      mockFindEdge.mockReturnValue(mockHoveredEdge);

      result.current.onEdgeMouseEnter(
        {} as React.MouseEvent,
        edge
      );

      expect(mockUpdateEdge).toHaveBeenCalledWith(mockHoveredEdge);
    });
  });

  describe("onEdgeMouseLeave", () => {
    it("removes hovered class and clears animation", () => {
      const { result } = renderHook(() => useEdgeHandlers());
      const edge = { id: "edge-7", className: "custom-edge hovered" } as Edge;
      const mockHoveredEdge = {
        id: "edge-7",
        className: "custom-edge hovered",
        selected: true,
        animated: true,
        label: "TEST-LABEL"
      };

      mockFindEdge.mockReturnValue(mockHoveredEdge);

      result.current.onEdgeMouseLeave(
        {} as React.MouseEvent,
        edge
      );

      expect(mockHoveredEdge.animated).toBe(false);
      expect(mockHoveredEdge.label).toBe("");
      expect(mockHoveredEdge.className).toBe("custom-edge");
      expect(mockUpdateEdge).toHaveBeenCalledWith(mockHoveredEdge);
    });

    it("handles edge without hovered class", () => {
      const { result } = renderHook(() => useEdgeHandlers());
      const edge = { id: "edge-8", className: "custom-edge" } as Edge;
      const mockHoveredEdge = {
        id: "edge-8",
        className: "custom-edge",
        selected: false,
        animated: true,
        label: "LABEL"
      };

      mockFindEdge.mockReturnValue(mockHoveredEdge);

      result.current.onEdgeMouseLeave(
        {} as React.MouseEvent,
        edge
      );

      expect(mockHoveredEdge.animated).toBe(false);
      expect(mockHoveredEdge.label).toBe("");
      expect(mockUpdateEdge).toHaveBeenCalledWith(mockHoveredEdge);
    });
  });

  describe("onEdgeContextMenu", () => {
    it("opens context menu at correct position", () => {
      const { result } = renderHook(() => useEdgeHandlers());
      const edge = { id: "edge-9" } as Edge;
      const preventDefault = jest.fn();

      result.current.onEdgeContextMenu(
        {
          clientX: 100,
          clientY: 200,
          preventDefault
        } as unknown as ReactMouseEvent,
        edge
      );

      expect(preventDefault).toHaveBeenCalled();
      expect(mockOpenContextMenu).toHaveBeenCalledWith(
        "edge-context-menu",
        "edge-9",
        100,
        200
      );
    });
  });

  describe("onEdgeUpdateStart", () => {
    it("sets reconnection state and resets update successful flag", () => {
      const { result } = renderHook(() => useEdgeHandlers());

      result.current.onEdgeUpdateStart();

      expect(mockSetEdgeUpdateSuccessful).toHaveBeenCalledWith(false);
      expect(mockSetIsReconnecting).toHaveBeenCalledWith(true);
    });
  });

  describe("onEdgeUpdateEnd", () => {
    it("deletes edge when update was not successful", () => {
      mockedUseNodes.mockImplementation((selector: any) => {
        const state = {
          findEdge: mockFindEdge,
          updateEdge: mockUpdateEdge,
          deleteEdge: mockDeleteEdge,
          edgeUpdateSuccessful: false,
          setEdgeUpdateSuccessful: mockSetEdgeUpdateSuccessful
        };
        return selector ? selector(state) : state;
      });

      const { result } = renderHook(() => useEdgeHandlers());
      const edge = { id: "edge-10" } as Edge;

      result.current.onEdgeUpdateEnd(
        {} as MouseEvent,
        edge
      );

      expect(mockDeleteEdge).toHaveBeenCalledWith("edge-10");
      expect(mockSetEdgeUpdateSuccessful).toHaveBeenCalledWith(true);
      expect(mockSetIsReconnecting).toHaveBeenCalledWith(false);
    });

    it("keeps edge when update was successful", () => {
      const { result } = renderHook(() => useEdgeHandlers());
      const edge = { id: "edge-11" } as Edge;

      result.current.onEdgeUpdateEnd(
        {} as MouseEvent,
        edge
      );

      expect(mockDeleteEdge).not.toHaveBeenCalled();
      expect(mockSetEdgeUpdateSuccessful).toHaveBeenCalledWith(true);
      expect(mockSetIsReconnecting).toHaveBeenCalledWith(false);
    });
  });
});

