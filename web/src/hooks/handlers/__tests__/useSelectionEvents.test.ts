import { renderHook } from "@testing-library/react";
import { MouseEvent as ReactMouseEvent } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import { useSelectionEvents } from "../useSelectionEvents";
import useContextMenu from "../../../stores/ContextMenuStore";
import { useNodes } from "../../../contexts/NodeContext";
import useDragHandlers from "../useDragHandlers";
import { NodeData } from "../../../stores/NodeData";

jest.mock("@xyflow/react");
jest.mock("../../../stores/ContextMenuStore");
jest.mock("../../../contexts/NodeContext");
jest.mock("../useDragHandlers");

describe("useSelectionEvents", () => {
  const mockScreenToFlowPosition = jest.fn().mockReturnValue({ x: 100, y: 200 });
  const mockReactFlowInstance = {
    screenToFlowPosition: mockScreenToFlowPosition,
    flowToScreenPosition: jest.fn().mockImplementation((pos: any) => pos),
    getIntersectingNodes: jest.fn().mockReturnValue([]),
    getNodes: jest.fn().mockReturnValue([]),
    getEdges: jest.fn().mockReturnValue([])
  };

  const mockOpenContextMenu = jest.fn();
  const mockUpdateNode = jest.fn();
  const mockSetEdgeSelectionState = jest.fn();
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
    // Use mockImplementation to properly call the selector function
    mockedUseNodes.mockImplementation((selector: any) =>
      selector({
        updateNode: mockUpdateNode,
        setEdgeSelectionState: mockSetEdgeSelectionState
      })
    );
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
    expect(result.current.selectEdgesWithinSelection).toBeDefined();
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

    it("selects edges inside the marquee rectangle", () => {
      mockReactFlowInstance.flowToScreenPosition = jest
        .fn()
        .mockImplementation((pos) => pos);
      mockReactFlowInstance.getEdges = jest.fn().mockReturnValue([
        { id: "edge-1" },
        { id: "edge-2" }
      ]);

      const { result } = renderHook(() =>
        useSelectionEvents({
          reactFlowInstance: mockReactFlowInstance as any,
          onSelectionStartBase: mockOnSelectionStart,
          onSelectionEndBase: mockOnSelectionEnd,
          onSelectionDragStartBase: mockOnSelectionDragStart,
          onSelectionDragStopBase: mockOnSelectionDragStop
        })
      );

      result.current.selectionStartRef.current = { x: 0, y: 0 };
      const mockEvent = {
        clientX: 100,
        clientY: 100
      } as unknown as ReactMouseEvent;

      const edgeIn = document.createElementNS("http://www.w3.org/2000/svg", "g");
      edgeIn.setAttribute("class", "react-flow__edge");
      edgeIn.setAttribute("data-id", "edge-1");
      const edgeInPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      edgeInPath.setAttribute("class", "react-flow__edge-path");
      Object.defineProperty(edgeInPath, "getBoundingClientRect", {
        value: () =>
          ({
            left: 10,
            top: 10,
            right: 20,
            bottom: 20
          }) as DOMRect
      });
      edgeIn.appendChild(edgeInPath);
      document.body.appendChild(edgeIn);

      const edgeOut = document.createElementNS("http://www.w3.org/2000/svg", "g");
      edgeOut.setAttribute("class", "react-flow__edge");
      edgeOut.setAttribute("data-id", "edge-2");
      const edgeOutPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      edgeOutPath.setAttribute("class", "react-flow__edge-path");
      Object.defineProperty(edgeOutPath, "getBoundingClientRect", {
        value: () =>
          ({
            left: 200,
            top: 200,
            right: 220,
            bottom: 220
          }) as DOMRect
      });
      edgeOut.appendChild(edgeOutPath);
      document.body.appendChild(edgeOut);

      const rafSpy = jest
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation((cb: FrameRequestCallback) => {
          cb(0);
          return 1;
        });

      result.current.handleSelectionEnd(mockEvent);

      expect(mockSetEdgeSelectionState).toHaveBeenCalledWith({
        "edge-1": true,
        "edge-2": false
      });

      rafSpy.mockRestore();
      edgeIn.remove();
      edgeOut.remove();
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

      const event = {} as ReactMouseEvent;
      const nodes: Node<NodeData>[] = [
        { id: "node-1", position: { x: 0, y: 0 }, data: {} as NodeData },
        { id: "node-2", position: { x: 0, y: 0 }, data: {} as NodeData }
      ];

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

      const event = {} as ReactMouseEvent;
      const nodes: Node<NodeData>[] = [
        { id: "node-1", position: { x: 0, y: 0 }, data: {} as NodeData }
      ];

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

    it("deselects groups that are selected but not fully enclosed", () => {
      // Node extends beyond rect boundary (80 + 50 = 130 > 100)
      const mockGroupNode = {
        id: "group-1",
        type: "nodetool.workflows.base_node.Group",
        selected: true,
        position: { x: 80, y: 80 },
        measured: { width: 50, height: 50 }
      };
      
      // Group is in getNodes but NOT fully enclosed (extends past selection rect)
      mockReactFlowInstance.getNodes = jest.fn().mockReturnValue([mockGroupNode]);

      const { result } = renderHook(() =>
        useSelectionEvents({
          reactFlowInstance: mockReactFlowInstance as any,
          onSelectionStartBase: mockOnSelectionStart,
          onSelectionEndBase: mockOnSelectionEnd,
          onSelectionDragStartBase: mockOnSelectionDragStart,
          onSelectionDragStopBase: mockOnSelectionDragStop
        })
      );

      result.current.selectionStartRef.current = { x: 0, y: 0 };
      result.current.selectionEndRef.current = { x: 100, y: 100 };

      result.current.selectGroupsWithinSelection();

      expect(mockUpdateNode).toHaveBeenCalledWith("group-1", { selected: false });
    });

    it("selects groups that are fully enclosed", () => {
      // Node is fully within rect boundary (10 + 20 = 30 < 100)
      const mockGroupNode = {
        id: "group-1",
        type: "nodetool.workflows.base_node.Group",
        selected: false,
        position: { x: 10, y: 10 },
        measured: { width: 20, height: 20 }
      };
      
      // Group is in getNodes and IS fully enclosed
      mockReactFlowInstance.getNodes = jest.fn().mockReturnValue([mockGroupNode]);

      const { result } = renderHook(() =>
        useSelectionEvents({
          reactFlowInstance: mockReactFlowInstance as any,
          onSelectionStartBase: mockOnSelectionStart,
          onSelectionEndBase: mockOnSelectionEnd,
          onSelectionDragStartBase: mockOnSelectionDragStart,
          onSelectionDragStopBase: mockOnSelectionDragStop
        })
      );

      result.current.selectionStartRef.current = { x: 0, y: 0 };
      result.current.selectionEndRef.current = { x: 100, y: 100 };

      result.current.selectGroupsWithinSelection();

      expect(mockUpdateNode).toHaveBeenCalledWith("group-1", { selected: true });
    });

    it("does not update already correctly selected groups", () => {
      // Node is fully within rect boundary (10 + 20 = 30 < 100)
      const mockGroupNode = {
        id: "group-1",
        type: "nodetool.workflows.base_node.Group",
        selected: true,
        position: { x: 10, y: 10 },
        measured: { width: 20, height: 20 }
      };
      
      // Group is fully enclosed and already selected
      mockReactFlowInstance.getNodes = jest.fn().mockReturnValue([mockGroupNode]);

      const { result } = renderHook(() =>
        useSelectionEvents({
          reactFlowInstance: mockReactFlowInstance as any,
          onSelectionStartBase: mockOnSelectionStart,
          onSelectionEndBase: mockOnSelectionEnd,
          onSelectionDragStartBase: mockOnSelectionDragStart,
          onSelectionDragStopBase: mockOnSelectionDragStop
        })
      );

      result.current.selectionStartRef.current = { x: 0, y: 0 };
      result.current.selectionEndRef.current = { x: 100, y: 100 };

      result.current.selectGroupsWithinSelection();

      // Should not be called since the group is already in the correct state
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
