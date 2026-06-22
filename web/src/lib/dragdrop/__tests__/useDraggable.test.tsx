import React from "react";
import { renderHook } from "@testing-library/react";
import { useDraggable } from "../useDraggable";
import { useDragDropStore } from "../store";
import type { DragData } from "../types";

jest.mock("../serialization", () => ({
  serializeDragData: jest.fn(),
  createDragCountBadge: jest.fn(() => {
    const el = document.createElement("div");
    el.style.cssText = "position: absolute; top: -99999px;";
    return el;
  })
}));

describe("useDraggable", () => {
  const dragData: DragData<"tab"> = {
    type: "tab",
    payload: "workflow-123"
  };

  beforeEach(() => {
    useDragDropStore.getState().clearDrag();
  });

  it("returns draggable props with correct data-drag-type", () => {
    const { result } = renderHook(() => useDraggable(dragData));
    expect(result.current.draggable).toBe(true);
    expect(result.current["data-drag-type"]).toBe("tab");
    expect(typeof result.current.onDragStart).toBe("function");
    expect(typeof result.current.onDragEnd).toBe("function");
  });

  it("sets draggable to false when disabled", () => {
    const { result } = renderHook(() =>
      useDraggable(dragData, { disabled: true })
    );
    expect(result.current.draggable).toBe(false);
  });

  it("updates global drag state on drag start", () => {
    const { result } = renderHook(() => useDraggable(dragData));

    const mockDataTransfer = {
      setData: jest.fn(),
      effectAllowed: "none",
      setDragImage: jest.fn()
    };
    const mockEvent = {
      dataTransfer: mockDataTransfer,
      currentTarget: document.createElement("div"),
      preventDefault: jest.fn()
    } as unknown as React.DragEvent;

    result.current.onDragStart(mockEvent);

    const state = useDragDropStore.getState();
    expect(state.activeDrag).toEqual(dragData);
    expect(state.isDragging).toBe(true);
  });

  it("clears global drag state on drag end", () => {
    const { result } = renderHook(() => useDraggable(dragData));

    useDragDropStore.getState().setActiveDrag(dragData);

    const mockEvent = {
      dataTransfer: {}
    } as unknown as React.DragEvent;

    result.current.onDragEnd(mockEvent);

    const state = useDragDropStore.getState();
    expect(state.activeDrag).toBeNull();
    expect(state.isDragging).toBe(false);
  });

  it("prevents drag start when disabled", () => {
    const { result } = renderHook(() =>
      useDraggable(dragData, { disabled: true })
    );

    const preventDefault = jest.fn();
    const mockEvent = {
      dataTransfer: { setData: jest.fn(), effectAllowed: "none" },
      preventDefault,
      currentTarget: document.createElement("div")
    } as unknown as React.DragEvent;

    result.current.onDragStart(mockEvent);
    expect(preventDefault).toHaveBeenCalled();
    expect(useDragDropStore.getState().isDragging).toBe(false);
  });

  it("calls onDragStart callback from options", () => {
    const onDragStart = jest.fn();
    const { result } = renderHook(() =>
      useDraggable(dragData, { onDragStart })
    );

    const mockDataTransfer = {
      setData: jest.fn(),
      effectAllowed: "none",
      setDragImage: jest.fn()
    };
    const mockEvent = {
      dataTransfer: mockDataTransfer,
      currentTarget: document.createElement("div"),
      preventDefault: jest.fn()
    } as unknown as React.DragEvent;

    result.current.onDragStart(mockEvent);
    expect(onDragStart).toHaveBeenCalledWith(mockEvent);
  });

  it("calls onDragEnd callback from options", () => {
    const onDragEnd = jest.fn();
    const { result } = renderHook(() =>
      useDraggable(dragData, { onDragEnd })
    );

    const mockEvent = {
      dataTransfer: {}
    } as unknown as React.DragEvent;

    result.current.onDragEnd(mockEvent);
    expect(onDragEnd).toHaveBeenCalledWith(mockEvent);
  });

  it("sets effectAllowed from options", () => {
    const { result } = renderHook(() =>
      useDraggable(dragData, { effectAllowed: "copy" })
    );

    const mockDataTransfer = {
      setData: jest.fn(),
      effectAllowed: "none" as string,
      setDragImage: jest.fn()
    };
    const mockEvent = {
      dataTransfer: mockDataTransfer,
      currentTarget: document.createElement("div"),
      preventDefault: jest.fn()
    } as unknown as React.DragEvent;

    result.current.onDragStart(mockEvent);
    expect(mockDataTransfer.effectAllowed).toBe("copy");
  });
});
