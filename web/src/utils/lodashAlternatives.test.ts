import { debounce, throttle, omit } from "./lodashAlternatives";

describe("lodashAlternatives", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("debounce", () => {
    it("delays invocation until after the wait period", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced();
      expect(fn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("resets the timer on subsequent calls", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced();
      jest.advanceTimersByTime(50);
      debounced();
      jest.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("passes arguments to the original function", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced("a", "b");
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledWith("a", "b");
    });

    it("uses the latest arguments", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced("first");
      debounced("second");
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledWith("second");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("cancel prevents pending invocation", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced();
      debounced.cancel();
      jest.advanceTimersByTime(200);
      expect(fn).not.toHaveBeenCalled();
    });

    it("cancel is safe to call when nothing is pending", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);
      expect(() => debounced.cancel()).not.toThrow();
    });
  });

  describe("throttle", () => {
    it("fires immediately on first call", () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 100);

      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("suppresses calls within the throttle window", () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 100);

      throttled();
      throttled();
      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("fires trailing call with latest args after the window", () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 100);

      throttled("first");
      throttled("second");
      throttled("third");

      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith("third");
    });

    it("cancel prevents trailing invocation", () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 100);

      throttled("first");
      throttled("second");
      throttled.cancel();
      jest.advanceTimersByTime(200);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("first");
    });

    it("cancel is safe to call when nothing is pending", () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 100);
      expect(() => throttled.cancel()).not.toThrow();
    });
  });

  describe("omit", () => {
    it("removes a single key", () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = omit(obj, "b");
      expect(result).toEqual({ a: 1, c: 3 });
    });

    it("removes multiple keys", () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = omit(obj, ["a", "c"]);
      expect(result).toEqual({ b: 2 });
    });

    it("does not mutate the original object", () => {
      const obj = { a: 1, b: 2 };
      omit(obj, "a");
      expect(obj).toEqual({ a: 1, b: 2 });
    });

    it("handles empty keys array", () => {
      const obj = { a: 1, b: 2 };
      const result = omit(obj, [] as never[]);
      expect(result).toEqual({ a: 1, b: 2 });
    });
  });
});
