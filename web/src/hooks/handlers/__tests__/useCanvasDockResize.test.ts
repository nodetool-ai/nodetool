import { renderHook } from "@testing-library/react";
import { stub } from "../../../test-utils/doubles";
import { act } from "react";

import {
  useCanvasDockResize,
  useCanvasDockEdgeResize
} from "../useCanvasDockResize";
import useCanvasChatDockStore, {
  DEFAULT_OVERLAY_HEIGHT
} from "../../../stores/CanvasChatDockStore";

const makeOverlay = (width: number, height: number) => {
  const el = document.createElement("div");
  Object.defineProperty(el, "offsetWidth", { value: width, configurable: true });
  Object.defineProperty(el, "offsetHeight", {
    value: height,
    configurable: true
  });
  return el;
};

const mouseEvent = (clientX: number, clientY: number) =>
  stub<React.MouseEvent>({
    clientX,
    clientY,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn()
  });

describe("useCanvasDockResize", () => {
  beforeEach(() => {
    useCanvasChatDockStore.setState({
      overlayHeight: DEFAULT_OVERLAY_HEIGHT,
      dockWidth: null
    });
  });

  it("grows the overlay height when dragging the top edge up", () => {
    const ref = { current: makeOverlay(600, 400) };
    const { result } = renderHook(() => useCanvasDockResize(ref));

    act(() => {
      result.current("top")(mouseEvent(0, 300));
    });
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 0, clientY: 250 })
      );
    });

    // Dragging up by 50px makes the bottom-anchored overlay 50px taller.
    expect(useCanvasChatDockStore.getState().overlayHeight).toBe(450);

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
  });

  it("widens the dock by twice the pointer delta from a side edge", () => {
    const ref = { current: makeOverlay(600, 400) };
    const { result } = renderHook(() => useCanvasDockResize(ref));

    act(() => {
      result.current("right")(mouseEvent(100, 0));
    });
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 130, clientY: 0 })
      );
    });

    // Centre-anchored: the width grows by 2× the 30px the cursor moved.
    expect(useCanvasChatDockStore.getState().dockWidth).toBe(660);

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
  });
});

describe("useCanvasDockEdgeResize", () => {
  beforeEach(() => {
    useCanvasChatDockStore.setState({
      overlayHeight: DEFAULT_OVERLAY_HEIGHT,
      dockWidth: null
    });
  });

  it("grows the height by the reported delta from the measured start", () => {
    const ref = { current: makeOverlay(600, 400) };
    const { result } = renderHook(() => useCanvasDockEdgeResize(ref));

    act(() => {
      result.current.top.onResizeStart();
      result.current.top.onResize(30);
      result.current.top.onResize(20);
      result.current.top.onResizeEnd();
    });

    expect(useCanvasChatDockStore.getState().overlayHeight).toBe(450);
  });

  it("changes the width by twice the delta and works in half-widths", () => {
    const ref = { current: makeOverlay(600, 400) };
    const { result } = renderHook(() => useCanvasDockEdgeResize(ref));

    expect(result.current.side.getValue()).toBe(300);
    expect(result.current.side.min).toBe(180);
    expect(result.current.side.max).toBe(600);

    act(() => {
      result.current.side.onResizeStart();
      result.current.side.onResize(30);
      result.current.side.onResizeEnd();
    });

    expect(useCanvasChatDockStore.getState().dockWidth).toBe(660);
  });
});
