import { renderHook, act } from "@testing-library/react";
import { useRightPanelStore } from "../../../stores/RightPanelStore";
import { useResizeRightPanel } from "../useResizeRightPanel";
import { stub } from "../../../test-utils/doubles";

const DEFAULT_PANEL_SIZE = 350;
const MIN_PANEL_SIZE = 130;
const MAX_PANEL_SIZE = 600;

const createMouseEvent = (clientX: number) =>
  stub<React.MouseEvent<HTMLElement>>({
    clientX,
    preventDefault: jest.fn()
  });

beforeEach(() => {
  useRightPanelStore.setState(useRightPanelStore.getInitialState());
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe("useResizeRightPanel", () => {
  it("returns initial state from store", () => {
    const { result } = renderHook(() => useResizeRightPanel());

    expect(result.current.size).toBe(DEFAULT_PANEL_SIZE);
    expect(result.current.isVisible).toBe(false);
    expect(result.current.isDragging).toBe(false);
    expect(result.current.ref).toBeDefined();
    expect(typeof result.current.handleMouseDown).toBe("function");
    expect(typeof result.current.handlePanelToggle).toBe("function");
  });

  it("defaults panelPosition to right", () => {
    const { result } = renderHook(() => useResizeRightPanel());

    act(() => result.current.handleMouseDown(createMouseEvent(500)));
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 400 }));
    });

    expect(useRightPanelStore.getState().panel.panelSize).toBe(
      DEFAULT_PANEL_SIZE + 100
    );

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
    act(() => {
      jest.runAllTimers();
    });
  });

  it("right position: dragging left increases panel size", () => {
    const { result } = renderHook(() => useResizeRightPanel("right"));

    act(() => result.current.handleMouseDown(createMouseEvent(500)));
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 400 }));
    });

    expect(useRightPanelStore.getState().panel.panelSize).toBe(
      DEFAULT_PANEL_SIZE + 100
    );

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
    act(() => {
      jest.runAllTimers();
    });
  });

  it("left position: dragging right increases panel size", () => {
    const { result } = renderHook(() => useResizeRightPanel("left"));

    act(() => result.current.handleMouseDown(createMouseEvent(200)));
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 350 }));
    });

    expect(useRightPanelStore.getState().panel.panelSize).toBe(
      DEFAULT_PANEL_SIZE + 150
    );

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
    act(() => {
      jest.runAllTimers();
    });
  });

  it("click without move toggles view", () => {
    useRightPanelStore.setState({
      panel: {
        ...useRightPanelStore.getState().panel,
        isVisible: false
      }
    });

    const { result } = renderHook(() => useResizeRightPanel());

    act(() => result.current.handleMouseDown(createMouseEvent(500)));
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
    act(() => {
      jest.runAllTimers();
    });

    expect(useRightPanelStore.getState().panel.isVisible).toBe(true);

    act(() => result.current.handleMouseDown(createMouseEvent(500)));
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
    act(() => {
      jest.runAllTimers();
    });

    expect(useRightPanelStore.getState().panel.isVisible).toBe(false);
  });

  it("dragging below minimum clamps size and stays open", () => {
    const { result } = renderHook(() => useResizeRightPanel("right"));

    act(() => {
      useRightPanelStore.setState({
        panel: {
          ...useRightPanelStore.getState().panel,
          isVisible: true,
          panelSize: DEFAULT_PANEL_SIZE
        }
      });
    });

    act(() => result.current.handleMouseDown(createMouseEvent(300)));
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 600 }));
    });
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
    act(() => {
      jest.runAllTimers();
    });

    const state = useRightPanelStore.getState().panel;
    expect(state.panelSize).toBe(MIN_PANEL_SIZE);
    expect(state.isVisible).toBe(true);
  });

  it("clamps size at MAX_PANEL_SIZE", () => {
    const { result } = renderHook(() => useResizeRightPanel("right"));

    act(() => result.current.handleMouseDown(createMouseEvent(800)));
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 0 }));
    });

    expect(useRightPanelStore.getState().panel.panelSize).toBe(MAX_PANEL_SIZE);

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
    act(() => {
      jest.runAllTimers();
    });
  });

  it("cleans up event listeners on unmount", () => {
    const removeSpy = jest.spyOn(document, "removeEventListener");
    const { result, unmount } = renderHook(() => useResizeRightPanel());

    act(() => result.current.handleMouseDown(createMouseEvent(500)));

    unmount();

    const removedTypes = removeSpy.mock.calls.map((call) => call[0]);
    expect(removedTypes).toContain("mousemove");
    expect(removedTypes).toContain("mouseup");

    removeSpy.mockRestore();
  });
});
