import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { debounce, throttle, omit } from "../lodashAlternatives";

describe("lodashAlternatives", () => {
  describe("debounce", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("delays invocation until after the wait period", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced();
      expect(fn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("only fires once for multiple rapid calls, using the last arguments", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced("a");
      debounced("b");
      debounced("c");
      expect(fn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("c");
    });

    it("resets the timer when called again within the wait period", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced();
      jest.advanceTimersByTime(50);
      debounced(); // resets the timer
      jest.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("passes all arguments to the underlying function", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced(1, "two", { three: 3 });
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledWith(1, "two", { three: 3 });
    });

    it("cancel() prevents a pending invocation", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced();
      debounced.cancel();
      jest.advanceTimersByTime(200);
      expect(fn).not.toHaveBeenCalled();
    });

    it("cancel() is safe to call when nothing is pending", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);
      expect(() => debounced.cancel()).not.toThrow();
    });

    it("can be called again after cancel()", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced("first");
      debounced.cancel();
      debounced("second");
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("second");
    });
  });

  describe("throttle", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("invokes the function immediately on the first call", () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 100);

      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("suppresses calls that fall within the throttle window", () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 100);

      throttled("a");
      throttled("b"); // within window, saved as trailing
      throttled("c"); // within window, overrides trailing

      // Only the immediate first call has fired
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("a");
    });

    it("fires a trailing call at the end of the window using the latest arguments", () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 100);

      throttled("first");
      throttled("second"); // trailing

      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenNthCalledWith(1, "first");
      expect(fn).toHaveBeenNthCalledWith(2, "second");
    });

    it("allows a new immediate call after the throttle window expires with no trailing args", () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 100);

      throttled("first");
      jest.advanceTimersByTime(200); // window ends fully, no trailing args
      throttled("second"); // fires immediately
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenNthCalledWith(1, "first");
      expect(fn).toHaveBeenNthCalledWith(2, "second");
    });

    it("cancel() clears any pending trailing call", () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 100);

      throttled("first");
      throttled("second"); // trailing
      throttled.cancel();

      jest.advanceTimersByTime(200);
      // Only the immediate first call should have fired
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("first");
    });

    it("cancel() is safe to call when nothing is pending", () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 100);
      expect(() => throttled.cancel()).not.toThrow();
    });

    it("passes arguments to the underlying function", () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 100);

      throttled(42, "hello");
      expect(fn).toHaveBeenCalledWith(42, "hello");
    });
  });

  describe("omit", () => {
    it("removes a single specified key", () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(omit(obj, "b")).toEqual({ a: 1, c: 3 });
    });

    it("removes multiple specified keys given as an array", () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(omit(obj, ["a", "c"])).toEqual({ b: 2 });
    });

    it("returns a shallow copy and does not mutate the original object", () => {
      const obj = { x: 1, y: 2 };
      const result = omit(obj, "x");
      expect(obj).toEqual({ x: 1, y: 2 });
      expect(result).toEqual({ y: 2 });
    });

    it("returns an empty object when all keys are omitted", () => {
      const obj = { a: 1, b: 2 };
      expect(omit(obj, ["a", "b"])).toEqual({});
    });

    it("handles an empty keys array and returns a copy of the original", () => {
      const obj = { a: 1, b: 2 };
      expect(omit(obj, [])).toEqual({ a: 1, b: 2 });
    });

    it("preserves keys not in the omit list", () => {
      const obj = { a: 1, b: 2, c: 3, d: 4 };
      expect(omit(obj, ["b", "d"])).toEqual({ a: 1, c: 3 });
    });
  });
});
