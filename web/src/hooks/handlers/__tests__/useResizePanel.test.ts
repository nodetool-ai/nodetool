import { renderHook, act } from "@testing-library/react";
import { useResizePanel } from "../useResizePanel";
import { usePanelStore } from "../../../stores/PanelStore";

beforeEach(() => {
  usePanelStore.setState(usePanelStore.getInitialState());
});

describe("useResizePanel", () => {
  it("returns initial state from store", () => {
    const { result } = renderHook(() => useResizePanel());

    expect(result.current.size).toBe(500);
    expect(result.current.isVisible).toBe(false);
    expect(result.current.isDragging).toBe(false);
    expect(result.current.ref).toBeDefined();
    expect(typeof result.current.handleMouseDown).toBe("function");
    expect(typeof result.current.handlePanelToggle).toBe("function");
  });

  it("reflects custom store state", () => {
    usePanelStore.setState({
      panel: {
        ...usePanelStore.getState().panel,
        panelSize: 600,
        isVisible: true,
        isDragging: true
      }
    });

    const { result } = renderHook(() => useResizePanel());

    expect(result.current.size).toBe(600);
    expect(result.current.isVisible).toBe(true);
    expect(result.current.isDragging).toBe(true);
  });

  it("handleMouseDown sets isDragging to true", () => {
    const { result } = renderHook(() => useResizePanel());
    const mockMouseEvent = {
      clientX: 100,
      preventDefault: jest.fn()
    } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleMouseDown(mockMouseEvent);
    });

    expect(usePanelStore.getState().panel.isDragging).toBe(true);
    expect(mockMouseEvent.preventDefault).toHaveBeenCalled();

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
  });

  it("mousemove during drag updates panel size for left panel", () => {
    usePanelStore.setState({
      panel: {
        ...usePanelStore.getState().panel,
        panelSize: 400
      }
    });

    const { result } = renderHook(() => useResizePanel("left"));
    const mockMouseEvent = {
      clientX: 300,
      preventDefault: jest.fn()
    } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleMouseDown(mockMouseEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 450 }));
    });

    expect(usePanelStore.getState().panel.panelSize).toBe(550);

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
  });

  it("mousemove during drag updates panel size for right panel", () => {
    usePanelStore.setState({
      panel: {
        ...usePanelStore.getState().panel,
        panelSize: 400
      }
    });

    const { result } = renderHook(() => useResizePanel("right"));
    const mockMouseEvent = {
      clientX: 300,
      preventDefault: jest.fn()
    } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleMouseDown(mockMouseEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 200 }));
    });

    expect(usePanelStore.getState().panel.panelSize).toBe(500);

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
  });

  it("clamps size to MAX_PANEL_SIZE", () => {
    usePanelStore.setState({
      panel: {
        ...usePanelStore.getState().panel,
        panelSize: 700
      }
    });

    const { result } = renderHook(() => useResizePanel("left"));
    const mockMouseEvent = {
      clientX: 100,
      preventDefault: jest.fn()
    } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleMouseDown(mockMouseEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 500 }));
    });

    expect(usePanelStore.getState().panel.panelSize).toBe(800);

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
  });

  it("clamps size to MIN_DRAG_SIZE", () => {
    usePanelStore.setState({
      panel: {
        ...usePanelStore.getState().panel,
        panelSize: 200
      }
    });

    const { result } = renderHook(() => useResizePanel("left"));
    const mockMouseEvent = {
      clientX: 300,
      preventDefault: jest.fn()
    } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleMouseDown(mockMouseEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 0 }));
    });

    expect(usePanelStore.getState().panel.panelSize).toBe(60);

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
  });

  it("mouseup without movement toggles view via handleViewChange", () => {
    usePanelStore.setState({
      panel: {
        ...usePanelStore.getState().panel,
        panelSize: 500,
        isVisible: true,
        activeView: "workflows"
      }
    });

    const { result } = renderHook(() => useResizePanel());
    const mockMouseEvent = {
      clientX: 300,
      preventDefault: jest.fn()
    } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleMouseDown(mockMouseEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(usePanelStore.getState().panel.isVisible).toBe(false);
  });

  it("mouseup after drag below MIN_PANEL_SIZE collapses and hides panel", () => {
    usePanelStore.setState({
      panel: {
        ...usePanelStore.getState().panel,
        panelSize: 500,
        isVisible: true
      }
    });

    const { result } = renderHook(() => useResizePanel("left"));
    const mockMouseEvent = {
      clientX: 500,
      preventDefault: jest.fn()
    } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleMouseDown(mockMouseEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 100 }));
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(usePanelStore.getState().panel.panelSize).toBe(60);
    expect(usePanelStore.getState().panel.isVisible).toBe(false);
  });

  it("mouseup after drag sets isDragging to false", () => {
    const { result } = renderHook(() => useResizePanel());
    const mockMouseEvent = {
      clientX: 100,
      preventDefault: jest.fn()
    } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleMouseDown(mockMouseEvent);
    });

    expect(usePanelStore.getState().panel.isDragging).toBe(true);

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 200 }));
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(usePanelStore.getState().panel.isDragging).toBe(false);
  });

  it("handlePanelToggle delegates to store handleViewChange", () => {
    usePanelStore.setState({
      panel: {
        ...usePanelStore.getState().panel,
        activeView: "workflows",
        isVisible: false
      }
    });

    const { result } = renderHook(() => useResizePanel());

    act(() => {
      result.current.handlePanelToggle("assets");
    });

    const state = usePanelStore.getState().panel;
    expect(state.activeView).toBe("assets");
    expect(state.isVisible).toBe(true);
  });

  it("defaults panelPosition to left", () => {
    usePanelStore.setState({
      panel: {
        ...usePanelStore.getState().panel,
        panelSize: 400
      }
    });

    const { result } = renderHook(() => useResizePanel());
    const mockMouseEvent = {
      clientX: 200,
      preventDefault: jest.fn()
    } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleMouseDown(mockMouseEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 300 }));
    });

    expect(usePanelStore.getState().panel.panelSize).toBe(500);

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
  });

  it("cleanup removes event listeners on unmount", () => {
    const addSpy = jest.spyOn(document, "addEventListener");
    const removeSpy = jest.spyOn(document, "removeEventListener");

    const { result, unmount } = renderHook(() => useResizePanel());
    const mockMouseEvent = {
      clientX: 100,
      preventDefault: jest.fn()
    } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleMouseDown(mockMouseEvent);
    });

    const mousemoveCalls = addSpy.mock.calls.filter(
      ([event]) => event === "mousemove"
    );
    const mouseupCalls = addSpy.mock.calls.filter(
      ([event]) => event === "mouseup"
    );
    expect(mousemoveCalls.length).toBeGreaterThan(0);
    expect(mouseupCalls.length).toBeGreaterThan(0);

    unmount();

    const removeMoveCalls = removeSpy.mock.calls.filter(
      ([event]) => event === "mousemove"
    );
    const removeUpCalls = removeSpy.mock.calls.filter(
      ([event]) => event === "mouseup"
    );
    expect(removeMoveCalls.length).toBeGreaterThan(0);
    expect(removeUpCalls.length).toBeGreaterThan(0);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
