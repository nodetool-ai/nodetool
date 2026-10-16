import { renderHook, act } from "@testing-library/react";
import {
  useResizePanel,
  PANEL_MIN_SIZE,
  PANEL_MAX_SIZE
} from "../useResizePanel";
import { usePanelStore } from "../../../stores/PanelStore";

beforeEach(() => {
  usePanelStore.setState(usePanelStore.getInitialState());
});

const setPanel = (patch: Partial<ReturnType<typeof getPanel>>) =>
  usePanelStore.setState({ panel: { ...getPanel(), ...patch } });
const getPanel = () => usePanelStore.getState().panel;

describe("useResizePanel", () => {
  it("returns initial state from store", () => {
    const { result } = renderHook(() => useResizePanel());

    expect(result.current.size).toBe(500);
    expect(result.current.isVisible).toBe(false);
    expect(result.current.isDragging).toBe(false);
    expect(result.current.ref).toBeDefined();
    expect(result.current.handleResizeStart).toEqual(expect.any(Function));
    expect(result.current.handleResize).toEqual(expect.any(Function));
    expect(result.current.handleResizeEnd).toEqual(expect.any(Function));
    expect(result.current.handlePanelToggle).toEqual(expect.any(Function));
  });

  it("reflects custom store state", () => {
    setPanel({ panelSize: 600, isVisible: true, isDragging: true });

    const { result } = renderHook(() => useResizePanel());

    expect(result.current.size).toBe(600);
    expect(result.current.isVisible).toBe(true);
    expect(result.current.isDragging).toBe(true);
  });

  it("exposes the drag bounds", () => {
    expect(PANEL_MIN_SIZE).toBe(160);
    expect(PANEL_MAX_SIZE).toBe(800);
  });

  it("handleResizeStart sets isDragging to true", () => {
    const { result } = renderHook(() => useResizePanel());

    act(() => {
      result.current.handleResizeStart();
    });

    expect(getPanel().isDragging).toBe(true);
  });

  it("handleResize applies the delta to the stored size", () => {
    setPanel({ panelSize: 400 });
    const { result } = renderHook(() => useResizePanel());

    act(() => {
      result.current.handleResizeStart();
      result.current.handleResize(150);
    });

    expect(getPanel().panelSize).toBe(550);
  });

  it("clamps size to MAX_PANEL_SIZE", () => {
    setPanel({ panelSize: 700 });
    const { result } = renderHook(() => useResizePanel());

    act(() => {
      result.current.handleResizeStart();
      result.current.handleResize(400);
    });

    expect(getPanel().panelSize).toBe(800);
  });

  it("clamps size to MIN_PANEL_SIZE", () => {
    setPanel({ panelSize: 200 });
    const { result } = renderHook(() => useResizePanel());

    act(() => {
      result.current.handleResizeStart();
      result.current.handleResize(-300);
    });

    // 160px minimum; the panel clamps rather than collapsing.
    expect(getPanel().panelSize).toBe(160);
  });

  it("flags hasDragged once the drag passes the threshold", () => {
    setPanel({ panelSize: 400 });
    const { result } = renderHook(() => useResizePanel());

    act(() => {
      result.current.handleResizeStart();
      result.current.handleResize(10);
    });
    expect(getPanel().hasDragged).toBe(false);

    act(() => {
      result.current.handleResize(30);
    });
    expect(getPanel().hasDragged).toBe(true);
  });

  it("release without movement toggles view via handleViewChange", () => {
    setPanel({ panelSize: 500, isVisible: true, activeView: "workflows" });
    const { result } = renderHook(() => useResizePanel());

    act(() => {
      result.current.handleResizeStart();
      result.current.handleResizeEnd();
    });

    expect(getPanel().isVisible).toBe(false);
  });

  it("release after a drag keeps the panel open", () => {
    setPanel({ panelSize: 500, isVisible: true });
    const { result } = renderHook(() => useResizePanel());

    act(() => {
      result.current.handleResizeStart();
      result.current.handleResize(-400);
      result.current.handleResizeEnd();
    });

    expect(getPanel().panelSize).toBe(160);
    expect(getPanel().isVisible).toBe(true);
  });

  it("release sets isDragging to false", () => {
    const { result } = renderHook(() => useResizePanel());

    act(() => {
      result.current.handleResizeStart();
    });
    expect(getPanel().isDragging).toBe(true);

    act(() => {
      result.current.handleResize(100);
      result.current.handleResizeEnd();
    });

    expect(getPanel().isDragging).toBe(false);
  });

  it("handlePanelToggle delegates to store handleViewChange", () => {
    setPanel({ activeView: "workflows", isVisible: false });
    const { result } = renderHook(() => useResizePanel());

    act(() => {
      result.current.handlePanelToggle("assets");
    });

    expect(getPanel().activeView).toBe("assets");
    expect(getPanel().isVisible).toBe(true);
  });
});
