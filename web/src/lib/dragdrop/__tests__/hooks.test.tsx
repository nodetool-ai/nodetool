import { renderHook, act } from "@testing-library/react";
import { useDraggable } from "../useDraggable";
import { useDragDropStore } from "../store";
import type { DragData } from "../types";

// Reset store between tests
beforeEach(() => {
  useDragDropStore.setState({ activeDrag: null, isDragging: false });
});

describe("useDraggable", () => {
  it("should return draggable props", () => {
    const { result } = renderHook(() =>
      useDraggable({
        type: "create-node",
        payload: { node_type: "test.Node" } as any
      })
    );

    expect(result.current.draggable).toBe(true);
    expect(result.current["data-drag-type"]).toBe("create-node");
    expect(typeof result.current.onDragStart).toBe("function");
    expect(typeof result.current.onDragEnd).toBe("function");
  });

  it("should set draggable to false when disabled", () => {
    const { result } = renderHook(() =>
      useDraggable(
        { type: "asset", payload: { id: "123" } as any },
        { disabled: true }
      )
    );

    expect(result.current.draggable).toBe(false);
  });

  it("should update store on drag start", () => {
    const { result } = renderHook(() =>
      useDraggable({
        type: "asset",
        payload: { id: "123", name: "test" } as any
      })
    );

    const mockEvent = {
      dataTransfer: {
        setData: jest.fn(),
        effectAllowed: ""
      },
      preventDefault: jest.fn()
    } as unknown as React.DragEvent;

    act(() => {
      result.current.onDragStart(mockEvent);
    });

    expect(useDragDropStore.getState().isDragging).toBe(true);
    expect(useDragDropStore.getState().activeDrag?.type).toBe("asset");
  });

  it("should clear store on drag end", () => {
    const { result } = renderHook(() =>
      useDraggable({
        type: "create-node",
        payload: { node_type: "test.Node" } as any
      })
    );

    // First, start dragging
    const mockStartEvent = {
      dataTransfer: {
        setData: jest.fn(),
        effectAllowed: ""
      },
      preventDefault: jest.fn()
    } as unknown as React.DragEvent;

    act(() => {
      result.current.onDragStart(mockStartEvent);
    });

    expect(useDragDropStore.getState().isDragging).toBe(true);

    // Then, end dragging
    const mockEndEvent = {} as React.DragEvent;

    act(() => {
      result.current.onDragEnd(mockEndEvent);
    });

    expect(useDragDropStore.getState().isDragging).toBe(false);
    expect(useDragDropStore.getState().activeDrag).toBeNull();
  });

  it("should prevent drag start when disabled", () => {
    const { result } = renderHook(() =>
      useDraggable(
        { type: "asset", payload: { id: "123" } as any },
        { disabled: true }
      )
    );

    const mockEvent = {
      dataTransfer: {
        setData: jest.fn(),
        effectAllowed: ""
      },
      preventDefault: jest.fn()
    } as unknown as React.DragEvent;

    act(() => {
      result.current.onDragStart(mockEvent);
    });

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(useDragDropStore.getState().isDragging).toBe(false);
  });

  it("should call user callbacks", () => {
    const onDragStart = jest.fn();
    const onDragEnd = jest.fn();

    const { result } = renderHook(() =>
      useDraggable(
        { type: "asset", payload: { id: "123" } as any },
        { onDragStart, onDragEnd }
      )
    );

    const mockStartEvent = {
      dataTransfer: {
        setData: jest.fn(),
        effectAllowed: ""
      },
      preventDefault: jest.fn()
    } as unknown as React.DragEvent;

    act(() => {
      result.current.onDragStart(mockStartEvent);
    });

    expect(onDragStart).toHaveBeenCalledWith(mockStartEvent);

    const mockEndEvent = {} as React.DragEvent;

    act(() => {
      result.current.onDragEnd(mockEndEvent);
    });

    expect(onDragEnd).toHaveBeenCalledWith(mockEndEvent);
  });

  it("should serialize data to dataTransfer", () => {
    const { result } = renderHook(() =>
      useDraggable({
        type: "create-node",
        payload: { node_type: "test.Node", title: "Test" } as any
      })
    );

    const setDataMock = jest.fn();
    const mockEvent = {
      dataTransfer: {
        setData: setDataMock,
        effectAllowed: ""
      },
      preventDefault: jest.fn()
    } as unknown as React.DragEvent;

    act(() => {
      result.current.onDragStart(mockEvent);
    });

    // Should have set both unified and legacy formats
    expect(setDataMock).toHaveBeenCalledTimes(2);
    expect(setDataMock).toHaveBeenCalledWith(
      "application/x-nodetool-drag",
      expect.any(String)
    );
    expect(setDataMock).toHaveBeenCalledWith("create-node", expect.any(String));
  });
});

describe("useDragDropStore", () => {
  beforeEach(() => {
    useDragDropStore.setState({ activeDrag: null, isDragging: false });
  });

  it("should set active drag", () => {
    const dragData: DragData = {
      type: "asset",
      payload: { id: "123" } as any
    };

    act(() => {
      useDragDropStore.getState().setActiveDrag(dragData);
    });

    expect(useDragDropStore.getState().activeDrag).toEqual(dragData);
    expect(useDragDropStore.getState().isDragging).toBe(true);
  });

  it("should clear drag", () => {
    const dragData: DragData = {
      type: "asset",
      payload: { id: "123" } as any
    };

    act(() => {
      useDragDropStore.getState().setActiveDrag(dragData);
    });

    expect(useDragDropStore.getState().isDragging).toBe(true);

    act(() => {
      useDragDropStore.getState().clearDrag();
    });

    expect(useDragDropStore.getState().activeDrag).toBeNull();
    expect(useDragDropStore.getState().isDragging).toBe(false);
  });
});
