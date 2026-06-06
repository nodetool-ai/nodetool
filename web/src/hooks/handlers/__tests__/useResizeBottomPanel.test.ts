import { renderHook, act } from "@testing-library/react";
import { useBottomPanelStore } from "../../../stores/BottomPanelStore";
import { useResizeBottomPanel } from "../useResizeBottomPanel";

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
    expect(typeof result.current.handleMouseDown).toBe("function");
    expect(typeof result.current.handlePanelToggle).toBe("function");
  });

  it("handleMouseDown sets isDragging to true", () => {
    const { result } = renderHook(() => useResizeBottomPanel());

    const mockEvent = {
      clientY: 500,
      preventDefault: jest.fn()
    } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleMouseDown(mockEvent);
    });

    expect(result.current.isDragging).toBe(true);
    expect(mockEvent.preventDefault).toHaveBeenCalled();

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
  });

  it("mouse move updates panel size with inverted Y-axis", () => {
    const { result } = renderHook(() => useResizeBottomPanel());

    const mockEvent = {
      clientY: 500,
      preventDefault: jest.fn()
    } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleMouseDown(mockEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 300 }));
    });

    expect(result.current.size).toBe(520);

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
      jest.runAllTimers();
    });
  });

  it("mouse up without move toggles the current view (click behavior)", () => {
    useBottomPanelStore.getState().setVisibility(true);
    const { result } = renderHook(() => useResizeBottomPanel());

    expect(result.current.isVisible).toBe(true);

    const mockEvent = {
      clientY: 500,
      preventDefault: jest.fn()
    } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleMouseDown(mockEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
      jest.runAllTimers();
    });

    expect(result.current.isVisible).toBe(false);
  });

  it("dragging below MIN_PANEL_SIZE collapses panel", () => {
    useBottomPanelStore.getState().setSize(300);
    useBottomPanelStore.getState().setVisibility(true);
    const { result } = renderHook(() => useResizeBottomPanel());

    const mockEvent = {
      clientY: 500,
      preventDefault: jest.fn()
    } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleMouseDown(mockEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 650 }));
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
      jest.runAllTimers();
    });

    expect(result.current.size).toBe(40);
    expect(result.current.isVisible).toBe(false);
  });

  it("size is clamped to MAX_PANEL_SIZE during drag", () => {
    useBottomPanelStore.getState().setSize(400);
    const { result } = renderHook(() => useResizeBottomPanel());

    const mockEvent = {
      clientY: 500,
      preventDefault: jest.fn()
    } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleMouseDown(mockEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 0 }));
    });

    expect(result.current.size).toBe(600);

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
      jest.runAllTimers();
    });
  });

  it("cleanup on unmount removes event listeners", () => {
    const removeSpy = jest.spyOn(document, "removeEventListener");
    const { result, unmount } = renderHook(() => useResizeBottomPanel());

    const mockEvent = {
      clientY: 500,
      preventDefault: jest.fn()
    } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleMouseDown(mockEvent);
    });

    unmount();

    const removedTypes = removeSpy.mock.calls.map((call) => call[0]);
    expect(removedTypes).toContain("mousemove");
    expect(removedTypes).toContain("mouseup");

    removeSpy.mockRestore();
  });
});
