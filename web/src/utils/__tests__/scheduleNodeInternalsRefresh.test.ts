/**
 * @jest-environment node
 */
import { scheduleNodeInternalsRefresh } from "../scheduleNodeInternalsRefresh";

describe("scheduleNodeInternalsRefresh", () => {
  let rafCallbacks: Array<() => void>;
  let timeoutCallbacks: Array<{ fn: () => void; delay: number }>;

  beforeEach(() => {
    rafCallbacks = [];
    timeoutCallbacks = [];

    (globalThis as Record<string, unknown>).requestAnimationFrame = (
      cb: () => void
    ) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    };

    jest.spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: () => void,
      delay: number
    ) => {
      timeoutCallbacks.push({ fn, delay });
      return timeoutCallbacks.length as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).requestAnimationFrame;
  });

  function flushRaf(): void {
    const pending = rafCallbacks.splice(0, rafCallbacks.length);
    for (const cb of pending) cb();
  }

  function flushTimeouts(): void {
    const pending = timeoutCallbacks.splice(0, timeoutCallbacks.length);
    for (const { fn } of pending) fn();
  }

  it("calls updateNodeInternals multiple times after scheduling", () => {
    const update = jest.fn();
    scheduleNodeInternalsRefresh(update, "node-1");

    expect(update).not.toHaveBeenCalled();

    // First rAF
    flushRaf();
    expect(update).not.toHaveBeenCalled();

    // Second rAF (nested)
    flushRaf();
    expect(update).toHaveBeenCalledWith("node-1");
    expect(update).toHaveBeenCalledTimes(1);

    // Third rAF (inner nested)
    flushRaf();
    expect(update).toHaveBeenCalledTimes(2);

    // Flush all timeouts (0ms, 24ms, 72ms, 160ms)
    flushTimeouts();
    expect(update).toHaveBeenCalledTimes(6);
  });

  it("accepts an array of node IDs", () => {
    const update = jest.fn();
    scheduleNodeInternalsRefresh(update, ["a", "b", "c"]);

    flushRaf();
    flushRaf();

    expect(update).toHaveBeenCalledWith(["a", "b", "c"]);
  });

  it("schedules timeouts at expected delays", () => {
    const update = jest.fn();
    scheduleNodeInternalsRefresh(update, "x");

    flushRaf();
    flushRaf();

    const delays = timeoutCallbacks.map((t) => t.delay).sort((a, b) => a - b);
    expect(delays).toEqual([0, 24, 72, 160]);
  });
});
