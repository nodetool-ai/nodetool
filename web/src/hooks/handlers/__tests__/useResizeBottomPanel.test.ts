import { renderHook, act } from "@testing-library/react";
import { useBottomPanelStore } from "../../../stores/BottomPanelStore";
import {
  useResizeBottomPanel,
  BOTTOM_PANEL_MIN_DRAG_SIZE,
  BOTTOM_PANEL_MAX_SIZE
} from "../useResizeBottomPanel";

beforeEach(() => {
  jest.useFakeTimers();
  useBottomPanelStore.setState(useBottomPanelStore.getInitialState());
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe("useResizeBottomPanel", () => {
  it("returns initial state from store", () => {
    const { result } = renderHook(() => useResizeBottomPanel());

    expect(result.current.size).toBe(320);
    expect(result.current.isVisible).toBe(false);
    expect(result.current.isDragging).toBe(false);
    expect(result.current.ref).toBeDefined();
    expect(result.current.handleResizeStart).toEqual(expect.any(Function));
    expect(result.current.handleResize).toEqual(expect.any(Function));
    expect(result.current.handleResizeEnd).toEqual(expect.any(Function));
    expect(result.current.handlePanelToggle).toEqual(expect.any(Function));
  });

  it("exposes the drag bounds", () => {
    expect(BOTTOM_PANEL_MIN_DRAG_SIZE).toBe(40);
    expect(BOTTOM_PANEL_MAX_SIZE).toBe(600);
  });

  it("handleResizeStart sets isDragging to true", () => {
    const { result } = renderHook(() => useResizeBottomPanel());

    act(() => {
      result.current.handleResizeStart();
    });

    expect(result.current.isDragging).toBe(true);
  });

  it("handleResize applies the delta to the stored size", () => {
    const { result } = renderHook(() => useResizeBottomPanel());

    act(() => {
      result.current.handleResizeStart();
      result.current.handleResize(200);
    });

    expect(result.current.size).toBe(520);

    act(() => {
      result.current.handleResizeEnd();
      jest.runAllTimers();
    });
  });

  it("release without movement toggles the current view (click behavior)", () => {
    useBottomPanelStore.getState().setVisibility(true);
    const { result } = renderHook(() => useResizeBottomPanel());

    expect(result.current.isVisible).toBe(true);

    act(() => {
      result.current.handleResizeStart();
      result.current.handleResizeEnd();
      jest.runAllTimers();
    });

    expect(result.current.isVisible).toBe(false);
  });

  it("dragging below MIN_PANEL_SIZE collapses panel", () => {
    useBottomPanelStore.getState().setSize(300);
    useBottomPanelStore.getState().setVisibility(true);
    const { result } = renderHook(() => useResizeBottomPanel());

    act(() => {
      result.current.handleResizeStart();
      result.current.handleResize(-150);
      result.current.handleResizeEnd();
      jest.runAllTimers();
    });

    expect(result.current.size).toBe(40);
    expect(result.current.isVisible).toBe(false);
  });

  it("size is clamped to MAX_PANEL_SIZE during drag", () => {
    useBottomPanelStore.getState().setSize(400);
    const { result } = renderHook(() => useResizeBottomPanel());

    act(() => {
      result.current.handleResizeStart();
      result.current.handleResize(500);
    });

    expect(result.current.size).toBe(600);

    act(() => {
      result.current.handleResizeEnd();
      jest.runAllTimers();
    });
  });

  it("clears the hasDragged reset timer on unmount", () => {
    const clearSpy = jest.spyOn(global, "clearTimeout");
    const { result, unmount } = renderHook(() => useResizeBottomPanel());

    act(() => {
      result.current.handleResizeStart();
      result.current.handleResize(50);
      result.current.handleResizeEnd();
    });

    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
