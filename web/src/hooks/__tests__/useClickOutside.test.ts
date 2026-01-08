import { renderHook, act } from "@testing-library/react";
import { useClickOutside, useClickOutsideMultiple } from "../useClickOutside";

describe("useClickOutside", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("basic functionality", () => {
    it("calls callback when clicking outside the element", () => {
      const callback = jest.fn();
      const ref = { current: null as HTMLElement | null };

      renderHook(() =>
        useClickOutside({
          ref,
          onClickOutside: callback,
        })
      );

      const div = document.createElement("div");
      document.body.appendChild(div);
      ref.current = div;

      const outsideDiv = document.createElement("div");
      document.body.appendChild(outsideDiv);

      act(() => {
        outsideDiv.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("does not call callback when clicking inside the element", () => {
      const callback = jest.fn();
      const ref = { current: null as HTMLElement | null };

      renderHook(() =>
        useClickOutside({
          ref,
          onClickOutside: callback,
        })
      );

      const div = document.createElement("div");
      const innerDiv = document.createElement("div");
      div.appendChild(innerDiv);
      document.body.appendChild(div);
      ref.current = div;

      act(() => {
        innerDiv.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("enabled option", () => {
    it("does not call callback when enabled is false", () => {
      const callback = jest.fn();
      const ref = { current: null as HTMLElement | null };

      const { rerender } = renderHook(
        ({ enabled }) =>
          useClickOutside({
            ref,
            onClickOutside: callback,
            enabled,
          }),
        { initialProps: { enabled: true } }
      );

      const div = document.createElement("div");
      document.body.appendChild(div);
      ref.current = div;

      const outsideDiv = document.createElement("div");
      document.body.appendChild(outsideDiv);

      act(() => {
        outsideDiv.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
      expect(callback).toHaveBeenCalledTimes(1);

      callback.mockClear();
      rerender({ enabled: false });

      act(() => {
        outsideDiv.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
      expect(callback).not.toHaveBeenCalled();
    });

    it("works with enabled: true by default", () => {
      const callback = jest.fn();
      const ref = { current: null as HTMLElement | null };

      renderHook(() =>
        useClickOutside({
          ref,
          onClickOutside: callback,
        })
      );

      const div = document.createElement("div");
      document.body.appendChild(div);
      ref.current = div;

      const outsideDiv = document.createElement("div");
      document.body.appendChild(outsideDiv);

      act(() => {
        outsideDiv.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("event types", () => {
    it("handles mouse events", () => {
      const callback = jest.fn();
      const ref = { current: null as HTMLElement | null };

      renderHook(() =>
        useClickOutside({
          ref,
          onClickOutside: callback,
        })
      );

      const div = document.createElement("div");
      document.body.appendChild(div);
      ref.current = div;

      const outsideDiv = document.createElement("div");
      document.body.appendChild(outsideDiv);

      act(() => {
        outsideDiv.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.any(MouseEvent));
    });

    it("handles touch events", () => {
      const callback = jest.fn();
      const ref = { current: null as HTMLElement | null };

      renderHook(() =>
        useClickOutside({
          ref,
          onClickOutside: callback,
        })
      );

      const div = document.createElement("div");
      document.body.appendChild(div);
      ref.current = div;

      const outsideDiv = document.createElement("div");
      document.body.appendChild(outsideDiv);

      act(() => {
        outsideDiv.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.any(TouchEvent));
    });
  });

  describe("with actual DOM element", () => {
    it("detects clicks outside when ref has an element", () => {
      const callback = jest.fn();
      const ref = { current: null as HTMLElement | null };

      renderHook(() =>
        useClickOutside({
          ref,
          onClickOutside: callback,
        })
      );

      const container = document.createElement("div");
      const innerElement = document.createElement("button");
      container.appendChild(innerElement);
      document.body.appendChild(container);

      ref.current = container;

      const outsideElement = document.createElement("div");
      document.body.appendChild(outsideElement);

      act(() => {
        outsideElement.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("does not detect clicks inside when ref has an element", () => {
      const callback = jest.fn();
      const ref = { current: null as HTMLElement | null };

      renderHook(() =>
        useClickOutside({
          ref,
          onClickOutside: callback,
        })
      );

      const container = document.createElement("div");
      const innerElement = document.createElement("button");
      container.appendChild(innerElement);
      document.body.appendChild(container);

      ref.current = container;

      act(() => {
        innerElement.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("removes event listeners on unmount", () => {
      const callback = jest.fn();
      const ref = { current: null as HTMLElement | null };

      const { unmount } = renderHook(() =>
        useClickOutside({
          ref,
          onClickOutside: callback,
        })
      );

      const div = document.createElement("div");
      document.body.appendChild(div);
      ref.current = div;

      const outsideDiv = document.createElement("div");
      document.body.appendChild(outsideDiv);

      unmount();

      act(() => {
        outsideDiv.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("multiple calls", () => {
    it("can be called multiple times with different refs", () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const ref1 = { current: null as HTMLElement | null };
      const ref2 = { current: null as HTMLElement | null };

      renderHook(() =>
        useClickOutside({
          ref: ref1,
          onClickOutside: callback1,
        })
      );

      renderHook(() =>
        useClickOutside({
          ref: ref2,
          onClickOutside: callback2,
        })
      );

      const div1 = document.createElement("div");
      const div2 = document.createElement("div");
      document.body.appendChild(div1);
      document.body.appendChild(div2);

      ref1.current = div1;
      ref2.current = div2;

      const outsideDiv = document.createElement("div");
      document.body.appendChild(outsideDiv);

      act(() => {
        outsideDiv.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });
});

describe("useClickOutsideMultiple", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("calls callback when clicking outside all elements", () => {
    const callback = jest.fn();
    const ref1 = { current: null as HTMLElement | null };
    const ref2 = { current: null as HTMLElement | null };

    renderHook(() =>
      useClickOutsideMultiple({
        refs: [ref1, ref2],
        onClickOutside: callback,
      })
    );

    const outsideDiv = document.createElement("div");
    document.body.appendChild(outsideDiv);

    act(() => {
      outsideDiv.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not call callback when clicking inside any element", () => {
    const callback = jest.fn();
    const ref1 = { current: null as HTMLElement | null };
    const ref2 = { current: null as HTMLElement | null };

    renderHook(() =>
      useClickOutsideMultiple({
        refs: [ref1, ref2],
        onClickOutside: callback,
      })
    );

    const container1 = document.createElement("div");
    const inner1 = document.createElement("span");
    container1.appendChild(inner1);

    const container2 = document.createElement("div");
    const inner2 = document.createElement("span");
    container2.appendChild(inner2);

    document.body.appendChild(container1);
    document.body.appendChild(container2);

    ref1.current = container1;
    ref2.current = container2;

    act(() => {
      inner1.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      inner2.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("handles empty refs array", () => {
    const callback = jest.fn();

    renderHook(() =>
      useClickOutsideMultiple({
        refs: [],
        onClickOutside: callback,
      })
    );

    const div = document.createElement("div");
    document.body.appendChild(div);

    act(() => {
      div.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("handles mixed ref types", () => {
    const callback = jest.fn();
    const refObject = { current: null as HTMLElement | null };
    const refCallback = jest.fn();

    renderHook(() =>
      useClickOutsideMultiple({
        refs: [refObject, refCallback],
        onClickOutside: callback,
      })
    );

    const div = document.createElement("div");
    document.body.appendChild(div);

    act(() => {
      div.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("respects enabled option", () => {
    const callback = jest.fn();
    const ref = { current: null as HTMLElement | null };

    const { rerender } = renderHook(
      ({ enabled }) =>
        useClickOutsideMultiple({
          refs: [ref],
          onClickOutside: callback,
          enabled,
        }),
      { initialProps: { enabled: true } }
    );

    const div = document.createElement("div");
    document.body.appendChild(div);

    act(() => {
      div.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(callback).toHaveBeenCalledTimes(1);

    callback.mockClear();
    rerender({ enabled: false });

    act(() => {
      div.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it("handles null refs in array", () => {
    const callback = jest.fn();

    renderHook(() =>
      useClickOutsideMultiple({
        refs: [null, null, { current: null }],
        onClickOutside: callback,
      })
    );

    const div = document.createElement("div");
    document.body.appendChild(div);

    act(() => {
      div.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
