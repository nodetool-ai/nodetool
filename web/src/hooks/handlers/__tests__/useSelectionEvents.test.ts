import { renderHook } from "@testing-library/react";
import { MouseEvent as ReactMouseEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import { useSelectionEvents } from "../useSelectionEvents";
import useContextMenu from "../../../stores/ContextMenuStore";
import { useNodes } from "../../../contexts/NodeContext";
import useDragHandlers from "../useDragHandlers";

jest.mock("@xyflow/react");
jest.mock("../../../stores/ContextMenuStore");
jest.mock("../../../contexts/NodeContext");
jest.mock("../useDragHandlers");

describe("useSelectionEvents", () => {
  const mockScreenToFlowPosition = jest.fn().mockReturnValue({ x: 100, y: 200 });
  const mockReactFlowInstance = {
    screenToFlowPosition: mockScreenToFlowPosition,
    getIntersectingNodes: jest.fn().mockReturnValue([])
  };

  const mockOpenContextMenu = jest.fn();
  const mockUpdateNode = jest.fn();
  const mockOnSelectionStart = jest.fn();
  const mockOnSelectionEnd = jest.fn();
  const mockOnSelectionDragStart = jest.fn();
  const mockOnSelectionDragStop = jest.fn();

  const mockedUseContextMenu = useContextMenu as unknown as jest.Mock;
  const mockedUseNodes = useNodes as unknown as jest.Mock;
  const mockedUseReactFlow = useReactFlow as unknown as jest.Mock;
  const mockedUseDragHandlers = useDragHandlers as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseContextMenu.mockReturnValue({
      openContextMenu: mockOpenContextMenu
    });
    mockedUseNodes.mockReturnValue({
      updateNode: mockUpdateNode
    });
    mockedUseReactFlow.mockReturnValue(mockReactFlowInstance);
    mockedUseDragHandlers.mockReturnValue({
      onSelectionStart: mockOnSelectionStart,
      onSelectionEnd: mockOnSelectionEnd,
      onSelectionDragStart: mockOnSelectionDragStart,
      onSelectionDragStop: mockOnSelectionDragStop
    });
  });

  it("returns all event handlers and refs", () => {
    const { result } = renderHook(() =>
      useSelectionEvents({
        reactFlowInstance: mockReactFlowInstance as any,
        onSelectionStartBase: mockOnSelectionStart,
        onSelectionEndBase: mockOnSelectionEnd,
        onSelectionDragStartBase: mockOnSelectionDragStart,
        onSelectionDragStopBase: mockOnSelectionDragStop
      })
    );

    expect(result.current.handleSelectionContextMenu).toBeDefined();
    expect(result.current.handleSelectionStart).toBeDefined();
    expect(result.current.handleSelectionEnd).toBeDefined();
    expect(result.current.handleSelectionDragStart).toBeDefined();
    expect(result.current.handleSelectionDragStop).toBeDefined();
    expect(result.current.resetSelectionTracking).toBeDefined();
    expect(result.current.selectGroupsWithinSelection).toBeDefined();
    expect(result.current.projectMouseEventToFlow).toBeDefined();
    expect(result.current.selectionStartRef).toBeDefined();
    expect(result.current.selectionEndRef).toBeDefined();
  });

  describe("handleSelectionContextMenu", () => {
    it("opens context menu at event coordinates", () => {
      const { result } = renderHook(() =>
        useSelectionEvents({
          reactFlowInstance: mockReactFlowInstance as any,
          onSelectionStartBase: mockOnSelectionStart,
          onSelectionEndBase: mockOnSelectionEnd,
          onSelectionDragStartBase: mockOnSelectionDragStart,
          onSelectionDragStopBase: mockOnSelectionDragStop
        })
      );

      const mockEvent = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        clientX: 300,
        clientY: 400
      } as unknown as ReactMouseEvent;

      result.current.handleSelectionContextMenu(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(mockOpenContextMenu).toHaveBeenCalledWith(
        "selection-context-menu",
        "",
        300,
        400,
        "react-flow__nodesselection"
      );
    });
  });

  describe("handleSelectionStart", () => {
    it("sets selection refs and calls base handler", () => {
      const { result } = renderHook(() =>
        useSelectionEvents({
          reactFlowInstance: mockReactFlowInstance as any,
          onSelectionStartBase: mockOnSelectionStart,
          onSelectionEndBase: mockOnSelectionEnd,
          onSelectionDragStartBase: mockOnSelectionDragStart,
          onSelectionDragStopBase: mockOnSelectionDragStop
        })
      );

      const mockEvent = {
        clientX: 150,
        clientY: 200
      } as unknown as ReactMouseEvent;

      result.current.handleSelectionStart(mockEvent);

      expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 150, y: 200 });
      expect(result.current.selectionStartRef.current).toEqual({ x: 100, y: 200 });
      expect(result.current.selectionEndRef.current).toEqual({ x: 100, y: 200 });
      expect(mockOnSelectionStart).toHaveBeenCalledWith(mockEvent);
    });
  });

  describe("handleSelectionEnd", () => {
    it("updates selection end ref and calls base handler", () => {
      const { result } = renderHook(() =>
        useSelectionEvents({
          reactFlowInstance: mockReactFlowInstance as any,
          onSelectionStartBase: mockOnSelectionStart,
          onSelectionEndBase: mockOnSelectionEnd,
          onSelectionDragStartBase: mockOnSelectionDragStart,
          onSelectionDragStopBase: mockOnSelectionDragStop
        })
      );

      const mockEvent = {
        clientX: 250,
        clientY: 300
      } as unknown as ReactMouseEvent;

      result.current.handleSelectionEnd(mockEvent);

      expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 250, y: 300 });
      expect(mockOnSelectionEnd).toHaveBeenCalledWith(mockEvent);
    });
  });

  describe("handleSelectionDragStart", () => {
    it("delegates to base handler", () => {
      const { result } = renderHook(() =>
        useSelectionEvents({
          reactFlowInstance: mockReactFlowInstance as any,
          onSelectionStartBase: mockOnSelectionStart,
          onSelectionEndBase: mockOnSelectionEnd,
          onSelectionDragStartBase: mockOnSelectionDragStart,
          onSelectionDragStopBase: mockOnSelectionDragStop
        })
      );

      const event = {} as any;
      const nodes = [{ id: "node-1" }, { id: "node-2" }];

      result.current.handleSelectionDragStart(event, nodes);

      expect(mockOnSelectionDragStart).toHaveBeenCalledWith(event, nodes);
    });
  });

  describe("handleSelectionDragStop", () => {
    it("delegates to base handler", () => {
      const { result } = renderHook(() =>
        useSelectionEvents({
          reactFlowInstance: mockReactFlowInstance as any,
          onSelectionStartBase: mockOnSelectionStart,
          onSelectionEndBase: mockOnSelectionEnd,
          onSelectionDragStartBase: mockOnSelectionDragStart,
          onSelectionDragStopBase: mockOnSelectionDragStop
        })
      );

      const event = {} as any;
      const nodes = [{ id: "node-1" }];

      result.current.handleSelectionDragStop(event, nodes);

      expect(mockOnSelectionDragStop).toHaveBeenCalledWith(event, nodes);
    });
  });

  describe("resetSelectionTracking", () => {
    it("clears selection refs", () => {
      const { result } = renderHook(() =>
        useSelectionEvents({
          reactFlowInstance: mockReactFlowInstance as any,
          onSelectionStartBase: mockOnSelectionStart,
          onSelectionEndBase: mockOnSelectionEnd,
          onSelectionDragStartBase: mockOnSelectionDragStart,
          onSelectionDragStopBase: mockOnSelectionDragStop
        })
      );

      result.current.selectionStartRef.current = { x: 50, y: 50 };
      result.current.selectionEndRef.current = { x: 100, y: 100 };

      result.current.resetSelectionTracking();

      expect(result.current.selectionStartRef.current).toBeNull();
      expect(result.current.selectionEndRef.current).toBeNull();
    });
  });

  describe("selectGroupsWithinSelection", () => {
    it("does nothing when selection refs are null", () => {
      const { result } = renderHook(() =>
        useSelectionEvents({
          reactFlowInstance: mockReactFlowInstance as any,
          onSelectionStartBase: mockOnSelectionStart,
          onSelectionEndBase: mockOnSelectionEnd,
          onSelectionDragStartBase: mockOnSelectionDragStart,
          onSelectionDragStopBase: mockOnSelectionDragStop
        })
      );

      result.current.selectionStartRef.current = null;
      result.current.selectionEndRef.current = null;

      result.current.selectGroupsWithinSelection();

      expect(mockUpdateNode).not.toHaveBeenCalled();
    });
  });

  describe("projectMouseEventToFlow", () => {
    it("converts mouse event to flow coordinates", () => {
      const { result } = renderHook(() =>
        useSelectionEvents({
          reactFlowInstance: mockReactFlowInstance as any,
          onSelectionStartBase: mockOnSelectionStart,
          onSelectionEndBase: mockOnSelectionEnd,
          onSelectionDragStartBase: mockOnSelectionDragStart,
          onSelectionDragStopBase: mockOnSelectionDragStop
        })
      );

      const flowPosition = result.current.projectMouseEventToFlow({
        clientX: 150,
        clientY: 200
      });

      expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 150, y: 200 });
      expect(flowPosition).toEqual({ x: 100, y: 200 });
    });

    it("uses fallback coordinates when event is null", () => {
      const { result } = renderHook(() =>
        useSelectionEvents({
          reactFlowInstance: mockReactFlowInstance as any,
          onSelectionStartBase: mockOnSelectionStart,
          onSelectionEndBase: mockOnSelectionEnd,
          onSelectionDragStartBase: mockOnSelectionDragStart,
          onSelectionDragStopBase: mockOnSelectionDragStop
        })
      );

      const flowPosition = result.current.projectMouseEventToFlow(null);

      expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 0, y: 0 });
      expect(flowPosition).toEqual({ x: 100, y: 200 });
    });

    it("handles partial event coordinates", () => {
      const { result } = renderHook(() =>
        useSelectionEvents({
          reactFlowInstance: mockReactFlowInstance as any,
          onSelectionStartBase: mockOnSelectionStart,
          onSelectionEndBase: mockOnSelectionEnd,
          onSelectionDragStartBase: mockOnSelectionDragStart,
          onSelectionDragStopBase: mockOnSelectionDragStop
        })
      );

      result.current.projectMouseEventToFlow({
        clientX: 300
      });

      expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 300, y: 0 });
    });
  });
});
