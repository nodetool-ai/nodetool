import { renderHook, act } from "@testing-library/react";
import { stub } from "../../test-utils/doubles";
import { useResizable, useResizableEdges } from "../useResizable";
import type React from "react";
import type { RefObject } from "react";

describe("useResizable", () => {
  const createMockRef = (
    element: Record<string, unknown> | null = null
  ): RefObject<HTMLElement | null> => ({
    current: element as HTMLElement | null
  });

  it("returns a function", () => {
    const ref = createMockRef(null);
    const { result } = renderHook(() =>
      useResizable(ref, { minWidth: 100, minHeight: 100 })
    );
    expect(result.current).toEqual(expect.any(Function));
  });

  it("returns a stable reference when options change but ref stays the same", () => {
    const ref = createMockRef(null);
    const { result, rerender } = renderHook(
      ({ opts }) => useResizable(ref, opts),
      { initialProps: { opts: { minWidth: 100 } } }
    );
    const first = result.current;
    rerender({ opts: { minWidth: 200 } });
    expect(result.current).toBe(first);
  });

  it("returns a new reference when the target ref changes", () => {
    const ref1 = createMockRef(null);
    const ref2 = createMockRef(null);
    const { result, rerender } = renderHook(
      ({ r }) => useResizable(r, {}),
      { initialProps: { r: ref1 } }
    );
    const first = result.current;
    rerender({ r: ref2 });
    expect(result.current).not.toBe(first);
  });

  it("calling startResize returns a pointer-down handler", () => {
    const ref = createMockRef(null);
    const { result } = renderHook(() => useResizable(ref, {}));
    const handler = result.current("right");
    expect(handler).toEqual(expect.any(Function));
  });

  describe("pointer-down handler", () => {
    it("ignores non-primary button clicks", () => {
      const mockElement = {
        getBoundingClientRect: jest.fn(() => ({
          width: 200,
          height: 150,
          x: 0,
          y: 0,
          top: 0,
          right: 200,
          bottom: 150,
          left: 0,
          toJSON: jest.fn()
        })),
        style: { width: "", height: "" },
        offsetWidth: 200,
        offsetHeight: 150
      };
      const ref = createMockRef(mockElement);
      const { result } = renderHook(() => useResizable(ref, {}));
      const handler = result.current("right");

      const mockEvent = stub<React.PointerEvent>({
        button: 2,
        clientX: 200,
        clientY: 150,
        pointerId: 1,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        currentTarget: document.createElement("div")
      });

      handler(mockEvent);
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    });

    it("does nothing when ref.current is null", () => {
      const ref = createMockRef(null);
      const { result } = renderHook(() => useResizable(ref, {}));
      const handler = result.current("right");

      const mockEvent = stub<React.PointerEvent>({
        button: 0,
        clientX: 200,
        clientY: 150,
        pointerId: 1,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        currentTarget: document.createElement("div")
      });

      handler(mockEvent);
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    });

    it("captures pointer and attaches listeners on primary button", () => {
      const mockElement = {
        getBoundingClientRect: jest.fn(() => ({
          width: 200,
          height: 150,
          x: 0,
          y: 0,
          top: 0,
          right: 200,
          bottom: 150,
          left: 0,
          toJSON: jest.fn()
        })),
        style: { width: "", height: "" },
        offsetWidth: 200,
        offsetHeight: 150
      };
      const ref = createMockRef(mockElement);
      const { result } = renderHook(() => useResizable(ref, {}));
      const handler = result.current("right");

      const handle = document.createElement("div");
      const setPointerCapture = jest.fn();
      handle.setPointerCapture = setPointerCapture;
      const addEventListener = jest.spyOn(handle, "addEventListener");

      const mockEvent = stub<React.PointerEvent>({
        button: 0,
        clientX: 200,
        clientY: 150,
        pointerId: 42,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        currentTarget: handle
      });

      handler(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(setPointerCapture).toHaveBeenCalledWith(42);
      expect(addEventListener).toHaveBeenCalledWith(
        "pointermove",
        expect.any(Function)
      );
      expect(addEventListener).toHaveBeenCalledWith(
        "pointerup",
        expect.any(Function)
      );
      expect(addEventListener).toHaveBeenCalledWith(
        "pointercancel",
        expect.any(Function)
      );
    });
  });
});

describe("useResizableEdges", () => {
  const makeTarget = (width: number, height: number) => {
    const node = document.createElement("div");
    node.getBoundingClientRect = () =>
      ({ width, height }) as DOMRect;
    Object.defineProperty(node, "offsetWidth", { value: width });
    Object.defineProperty(node, "offsetHeight", { value: height });
    return node;
  };

  it("applies deltas to the element and reports once at the end", () => {
    const node = makeTarget(600, 400);
    const onResizeEnd = jest.fn();
    const { result } = renderHook(() =>
      useResizableEdges({ current: node }, { minWidth: 560, onResizeEnd })
    );

    expect(result.current.right.getValue()).toBe(600);
    expect(result.current.right.min).toBe(560);

    act(() => {
      result.current.right.onResizeStart();
      result.current.right.onResize(40);
    });
    expect(node.style.width).toBe("640px");
    expect(onResizeEnd).not.toHaveBeenCalled();

    act(() => {
      result.current.right.onResizeEnd();
    });
    expect(onResizeEnd).toHaveBeenCalledTimes(1);
  });

  it("reports straight away for a keyboard step", () => {
    const node = makeTarget(600, 400);
    const onResizeEnd = jest.fn();
    const { result } = renderHook(() =>
      useResizableEdges({ current: node }, { onResizeEnd })
    );

    act(() => {
      result.current.bottom.onResize(16);
    });
    expect(node.style.height).toBe("416px");
    expect(onResizeEnd).toHaveBeenCalledTimes(1);
  });
});
