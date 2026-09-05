/**
 * The gesture-coalescing invariants five inspector controls relied on when
 * each of them spelled this state machine out inline.
 */
import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";

import { useBatchedGesture, useWheelBatch } from "../useBatchedGesture";

let frames: (() => void)[] = [];
let realRaf: typeof requestAnimationFrame;
let realCancel: typeof cancelAnimationFrame;

const runFrame = () => {
  const queued = frames;
  frames = [];
  for (const fn of queued) fn();
};

beforeEach(() => {
  frames = [];
  realRaf = globalThis.requestAnimationFrame;
  realCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = ((fn: FrameRequestCallback) => {
    frames.push(() => fn(0));
    return frames.length;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => {
    frames[id - 1] = () => {};
  }) as typeof cancelAnimationFrame;
});

afterEach(() => {
  globalThis.requestAnimationFrame = realRaf;
  globalThis.cancelAnimationFrame = realCancel;
});

describe("useBatchedGesture", () => {
  it("writes at most once per animation frame", () => {
    const apply = jest.fn();
    const { result } = renderHook(() => useBatchedGesture<number>(apply));

    act(() => {
      result.current.schedule(1);
      result.current.schedule(2);
      result.current.schedule(3);
    });
    expect(apply).not.toHaveBeenCalled();

    act(runFrame);
    expect(apply.mock.calls).toEqual([[3]]);
  });

  it("flushes the committed value synchronously and drops the pending frame", () => {
    const apply = jest.fn();
    const { result } = renderHook(() => useBatchedGesture<number>(apply));

    act(() => {
      result.current.schedule(1);
      result.current.commit(9);
    });
    expect(apply.mock.calls).toEqual([[9]]);

    act(runFrame);
    expect(apply.mock.calls).toEqual([[9]]);
  });

  it("commits the queued value when commit is given none", () => {
    const apply = jest.fn();
    const { result } = renderHook(() => useBatchedGesture<number>(apply));

    act(() => {
      result.current.schedule(4);
      result.current.commit();
    });
    expect(apply.mock.calls).toEqual([[4]]);
  });

  it("does nothing on a commit with no gesture open", () => {
    const apply = jest.fn();
    const { result } = renderHook(() => useBatchedGesture<number>(apply));

    act(() => result.current.commit(7));
    expect(apply).not.toHaveBeenCalled();
  });

  it("applies nothing on cancel", () => {
    const apply = jest.fn();
    const { result } = renderHook(() => useBatchedGesture<number>(apply));

    act(() => {
      result.current.schedule(5);
      result.current.cancel();
    });
    act(runFrame);
    expect(apply).not.toHaveBeenCalled();
  });

  it("reopens after a commit", () => {
    const apply = jest.fn();
    const { result } = renderHook(() => useBatchedGesture<number>(apply));

    act(() => {
      result.current.schedule(1);
      result.current.commit();
      result.current.schedule(2);
      result.current.commit();
    });
    expect(apply.mock.calls).toEqual([[1], [2]]);
  });

  it("drops the pending frame on unmount", () => {
    const apply = jest.fn();
    const { result, unmount } = renderHook(() =>
      useBatchedGesture<number>(apply)
    );

    act(() => result.current.schedule(1));
    unmount();
    act(runFrame);
    expect(apply).not.toHaveBeenCalled();
  });

  it("calls the latest apply without re-creating the callbacks", () => {
    const first = jest.fn();
    const second = jest.fn();
    const { result, rerender } = renderHook(
      ({ apply }) => useBatchedGesture<number>(apply),
      { initialProps: { apply: first } }
    );
    const scheduleBefore = result.current.schedule;

    rerender({ apply: second });
    expect(result.current.schedule).toBe(scheduleBefore);

    act(() => result.current.schedule(1));
    act(runFrame);
    expect(first).not.toHaveBeenCalled();
    expect(second.mock.calls).toEqual([[1]]);
  });
});

const useWheelTarget = (
  onTick: (d: 1 | -1) => void,
  disabled = false
): { ref: React.RefObject<HTMLDivElement | null> } => {
  const ref = useRef<HTMLDivElement | null>(null);
  useWheelBatch(ref, onTick, disabled);
  return { ref };
};

describe("useWheelBatch", () => {
  const mount = (onTick: (d: 1 | -1) => void, disabled = false) => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const hook = renderHook(() => useWheelTarget(onTick, disabled));
    act(() => {
      hook.result.current.ref.current = el;
    });
    hook.rerender();
    return { el, hook };
  };

  it("signs the tick by wheel direction", () => {
    const onTick = jest.fn();
    const { el } = mount(onTick);
    act(() => {
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: 1, cancelable: true }));
      el.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -1, cancelable: true })
      );
    });
    expect(onTick.mock.calls).toEqual([[-1], [1]]);
  });

  it("stays silent while disabled", () => {
    const onTick = jest.fn();
    const { el } = mount(onTick, true);
    act(() => {
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: 1, cancelable: true }));
    });
    expect(onTick).not.toHaveBeenCalled();
  });

  it("stops preventing scroll once unmounted", () => {
    const onTick = jest.fn();
    const { el, hook } = mount(onTick);
    hook.unmount();
    act(() => {
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: 1, cancelable: true }));
    });
    expect(onTick).not.toHaveBeenCalled();
  });
});
