import { EventEmitter } from "./EventEmitter";

interface TestEvents {
  message: (text: string) => void;
  count: (n: number) => void;
  empty: () => void;
}

describe("EventEmitter", () => {
  let emitter: EventEmitter<TestEvents>;

  beforeEach(() => {
    emitter = new EventEmitter<TestEvents>();
  });

  describe("on / emit", () => {
    it("calls registered listener with the emitted args", () => {
      const fn = jest.fn();
      emitter.on("message", fn);
      emitter.emit("message", "hello");
      expect(fn).toHaveBeenCalledWith("hello");
    });

    it("supports multiple listeners on the same event", () => {
      const fn1 = jest.fn();
      const fn2 = jest.fn();
      emitter.on("message", fn1);
      emitter.on("message", fn2);
      emitter.emit("message", "hi");
      expect(fn1).toHaveBeenCalledWith("hi");
      expect(fn2).toHaveBeenCalledWith("hi");
    });

    it("returns true when there are listeners", () => {
      emitter.on("empty", jest.fn());
      expect(emitter.emit("empty")).toBe(true);
    });

    it("returns false when there are no listeners", () => {
      expect(emitter.emit("empty")).toBe(false);
    });
  });

  describe("off", () => {
    it("removes a specific listener", () => {
      const fn = jest.fn();
      emitter.on("message", fn);
      emitter.off("message", fn);
      emitter.emit("message", "ignored");
      expect(fn).not.toHaveBeenCalled();
    });

    it("does not remove other listeners for the same event", () => {
      const fn1 = jest.fn();
      const fn2 = jest.fn();
      emitter.on("message", fn1);
      emitter.on("message", fn2);
      emitter.off("message", fn1);
      emitter.emit("message", "hi");
      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).toHaveBeenCalledWith("hi");
    });

    it("is a no-op for unregistered listener", () => {
      expect(() => emitter.off("message", jest.fn())).not.toThrow();
    });
  });

  describe("once", () => {
    it("fires the listener only once", () => {
      const fn = jest.fn();
      emitter.once("count", fn);
      emitter.emit("count", 1);
      emitter.emit("count", 2);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(1);
    });
  });

  describe("removeAllListeners", () => {
    it("removes all listeners for a specific event", () => {
      const fn1 = jest.fn();
      const fn2 = jest.fn();
      emitter.on("message", fn1);
      emitter.on("count", fn2);
      emitter.removeAllListeners("message");
      emitter.emit("message", "gone");
      emitter.emit("count", 42);
      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).toHaveBeenCalledWith(42);
    });

    it("removes all listeners for all events when called without args", () => {
      emitter.on("message", jest.fn());
      emitter.on("count", jest.fn());
      emitter.removeAllListeners();
      expect(emitter.listenerCount("message")).toBe(0);
      expect(emitter.listenerCount("count")).toBe(0);
    });
  });

  describe("addListener / removeListener aliases", () => {
    it("addListener works like on", () => {
      const fn = jest.fn();
      emitter.addListener("message", fn);
      emitter.emit("message", "via alias");
      expect(fn).toHaveBeenCalledWith("via alias");
    });

    it("removeListener works like off", () => {
      const fn = jest.fn();
      emitter.addListener("empty", fn);
      emitter.removeListener("empty", fn);
      emitter.emit("empty");
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("listenerCount", () => {
    it("returns 0 for events with no listeners", () => {
      expect(emitter.listenerCount("message")).toBe(0);
    });

    it("tracks additions and removals", () => {
      const fn = jest.fn();
      emitter.on("message", fn);
      expect(emitter.listenerCount("message")).toBe(1);
      emitter.off("message", fn);
      expect(emitter.listenerCount("message")).toBe(0);
    });
  });

  describe("chaining", () => {
    it("on/off/once return the emitter for chaining", () => {
      const fn = jest.fn();
      const result = emitter.on("empty", fn).off("empty", fn).once("empty", fn);
      expect(result).toBe(emitter);
    });
  });

  describe("listener mutation during emit", () => {
    it("a listener that removes itself does not skip the next listener", () => {
      const calls: string[] = [];
      const selfRemover = () => {
        calls.push("a");
        emitter.off("empty", selfRemover);
      };
      const second = () => calls.push("b");
      emitter.on("empty", selfRemover);
      emitter.on("empty", second);
      emitter.emit("empty");
      expect(calls).toEqual(["a", "b"]);
    });
  });
});
