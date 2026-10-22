import { renderHook } from "@testing-library/react";
import { stub } from "../../../test-utils/doubles";
import { act } from "react";

import {
  useCanvasDockResize,
  useCanvasDockEdgeResize
} from "../useCanvasDockResize";
import useCanvasChatDockStore, {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MAX_WINDOW_WIDTH,
  MIN_WINDOW_WIDTH
} from "../../../stores/CanvasChatDockStore";

const makeWindow = (width: number, height: number) => {
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

const resetSize = () =>
  useCanvasChatDockStore.setState({
    windowWidth: DEFAULT_WINDOW_WIDTH,
    windowHeight: DEFAULT_WINDOW_HEIGHT
  });

describe("useCanvasDockResize", () => {
  beforeEach(resetSize);

  it("grows both axes when dragging the bottom-left corner out", () => {
    const ref = { current: makeWindow(400, 500) };
    const { result } = renderHook(() => useCanvasDockResize(ref));

    act(() => {
      result.current("bottom-left")(mouseEvent(100, 300));
    });
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 70, clientY: 350 })
      );
    });

    // Top-right anchored: moving left 30px widens, moving down 50px heightens.
    expect(useCanvasChatDockStore.getState().windowWidth).toBe(430);
    expect(useCanvasChatDockStore.getState().windowHeight).toBe(550);

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
  });

  it("changes only the width from the left edge", () => {
    const ref = { current: makeWindow(400, 500) };
    const { result } = renderHook(() => useCanvasDockResize(ref));

    act(() => {
      result.current("left")(mouseEvent(100, 0));
    });
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 140, clientY: 90 })
      );
    });

    expect(useCanvasChatDockStore.getState().windowWidth).toBe(360);
    expect(useCanvasChatDockStore.getState().windowHeight).toBe(
      DEFAULT_WINDOW_HEIGHT
    );

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
  });
});

describe("useCanvasDockEdgeResize", () => {
  beforeEach(resetSize);

  it("grows the height by the reported delta from the measured start", () => {
    const ref = { current: makeWindow(400, 500) };
    const { result } = renderHook(() => useCanvasDockEdgeResize(ref));

    act(() => {
      result.current.bottom.onResizeStart();
      result.current.bottom.onResize(30);
      result.current.bottom.onResize(20);
      result.current.bottom.onResizeEnd();
    });

    expect(useCanvasChatDockStore.getState().windowHeight).toBe(550);
  });

  it("grows the width by the delta from the left edge", () => {
    const ref = { current: makeWindow(400, 500) };
    const { result } = renderHook(() => useCanvasDockEdgeResize(ref));

    expect(result.current.left.getValue()).toBe(400);
    expect(result.current.left.min).toBe(MIN_WINDOW_WIDTH);
    expect(result.current.left.max).toBe(MAX_WINDOW_WIDTH);

    act(() => {
      result.current.left.onResizeStart();
      result.current.left.onResize(60);
      result.current.left.onResizeEnd();
    });

    expect(useCanvasChatDockStore.getState().windowWidth).toBe(460);
  });
});
