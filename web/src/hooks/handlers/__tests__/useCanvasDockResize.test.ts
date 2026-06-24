import { renderHook } from "@testing-library/react";
import { act } from "react";

import { useCanvasDockResize } from "../useCanvasDockResize";
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
  ({
    clientX,
    clientY,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn()
  }) as unknown as React.MouseEvent;

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
