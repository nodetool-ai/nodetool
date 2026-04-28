/**
 * @jest-environment node
 */
import { EventEmitter } from "../EventEmitter";

describe("EventEmitter", () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  describe("on / emit", () => {
    it("calls listener when event is emitted", () => {
      const listener = jest.fn();
      emitter.on("test", listener);
      emitter.emit("test", "arg1", "arg2");
      expect(listener).toHaveBeenCalledWith("arg1", "arg2");
    });

    it("supports multiple listeners for the same event", () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      emitter.on("test", listener1);
      emitter.on("test", listener2);
      emitter.emit("test");
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it("does not call listeners for other events", () => {
      const listener = jest.fn();
      emitter.on("test", listener);
      emitter.emit("other");
      expect(listener).not.toHaveBeenCalled();
    });

    it("returns true when listeners exist", () => {
      emitter.on("test", jest.fn());
      expect(emitter.emit("test")).toBe(true);
    });

    it("returns false when no listeners exist", () => {
      expect(emitter.emit("test")).toBe(false);
    });

    it("returns this for chaining", () => {
      const result = emitter.on("test", jest.fn());
      expect(result).toBe(emitter);
    });
  });

  describe("off", () => {
    it("removes a specific listener", () => {
      const listener = jest.fn();
      emitter.on("test", listener);
      emitter.off("test", listener);
      emitter.emit("test");
      expect(listener).not.toHaveBeenCalled();
    });

    it("does not affect other listeners", () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      emitter.on("test", listener1);
      emitter.on("test", listener2);
      emitter.off("test", listener1);
      emitter.emit("test");
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it("handles removing a listener that was never added", () => {
      emitter.off("test", jest.fn());
      expect(emitter.listenerCount("test")).toBe(0);
    });

    it("returns this for chaining", () => {
      const result = emitter.off("test", jest.fn());
      expect(result).toBe(emitter);
    });
  });

  describe("once", () => {
    it("calls the listener only once", () => {
      const listener = jest.fn();
      emitter.once("test", listener);
      emitter.emit("test", "first");
      emitter.emit("test", "second");
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith("first");
    });

    it("removes itself after firing", () => {
      const listener = jest.fn();
      emitter.once("test", listener);
      emitter.emit("test");
      expect(emitter.listenerCount("test")).toBe(0);
    });
  });

  describe("addListener / removeListener", () => {
    it("addListener is an alias for on", () => {
      const listener = jest.fn();
      emitter.addListener("test", listener);
      emitter.emit("test");
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("removeListener is an alias for off", () => {
      const listener = jest.fn();
      emitter.addListener("test", listener);
      emitter.removeListener("test", listener);
      emitter.emit("test");
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("removeAllListeners", () => {
    it("removes all listeners for a specific event", () => {
      emitter.on("test", jest.fn());
      emitter.on("test", jest.fn());
      emitter.on("other", jest.fn());
      emitter.removeAllListeners("test");
      expect(emitter.listenerCount("test")).toBe(0);
      expect(emitter.listenerCount("other")).toBe(1);
    });

    it("removes all listeners for all events when called without args", () => {
      emitter.on("test", jest.fn());
      emitter.on("other", jest.fn());
      emitter.removeAllListeners();
      expect(emitter.listenerCount("test")).toBe(0);
      expect(emitter.listenerCount("other")).toBe(0);
    });

    it("returns this for chaining", () => {
      const result = emitter.removeAllListeners();
      expect(result).toBe(emitter);
    });
  });

  describe("listenerCount", () => {
    it("returns 0 for events with no listeners", () => {
      expect(emitter.listenerCount("test")).toBe(0);
    });

    it("returns the correct count", () => {
      emitter.on("test", jest.fn());
      emitter.on("test", jest.fn());
      expect(emitter.listenerCount("test")).toBe(2);
    });

    it("decrements when listeners are removed", () => {
      const listener = jest.fn();
      emitter.on("test", listener);
      emitter.on("test", jest.fn());
      emitter.off("test", listener);
      expect(emitter.listenerCount("test")).toBe(1);
    });
  });

  describe("typed events", () => {
    interface MyEvents {
      data: (payload: string) => void;
      count: (n: number) => void;
    }

    it("works with typed event maps", () => {
      const typed = new EventEmitter<MyEvents>();
      const listener = jest.fn();
      typed.on("data", listener);
      typed.emit("data", "hello");
      expect(listener).toHaveBeenCalledWith("hello");
    });
  });

  describe("edge cases", () => {
    it("listener that removes itself during emit does not affect other listeners", () => {
      const listener2 = jest.fn();
      const selfRemover = () => {
        emitter.off("test", selfRemover);
      };
      emitter.on("test", selfRemover);
      emitter.on("test", listener2);
      emitter.emit("test");
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });
});
