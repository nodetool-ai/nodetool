/**
 * @jest-environment node
 */
import { EventEmitter } from '../EventEmitter';

describe("EventEmitter", () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  describe("on / emit", () => {
    it("calls listener with correct arguments when event is emitted", () => {
      const listener = jest.fn();
      emitter.on("test", listener);
      emitter.emit("test", "arg1", 42);
      expect(listener).toHaveBeenCalledWith("arg1", 42);
    });

    it("does not call listener for a different event", () => {
      const listener = jest.fn();
      emitter.on("test", listener);
      emitter.emit("other");
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("multiple listeners on same event", () => {
    it("calls all listeners registered for the same event", () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();
      emitter.on("test", listener1);
      emitter.on("test", listener2);
      emitter.on("test", listener3);
      emitter.emit("test", "payload");
      expect(listener1).toHaveBeenCalledWith("payload");
      expect(listener2).toHaveBeenCalledWith("payload");
      expect(listener3).toHaveBeenCalledWith("payload");
    });
  });

  describe("off", () => {
    it("removes a specific listener so it is no longer called", () => {
      const listener = jest.fn();
      emitter.on("test", listener);
      emitter.off("test", listener);
      emitter.emit("test");
      expect(listener).not.toHaveBeenCalled();
    });

    it("does not affect other listeners on the same event", () => {
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
      expect(() => emitter.off("test", jest.fn())).not.toThrow();
    });
  });

  describe("once", () => {
    it("fires exactly once then is automatically removed", () => {
      const listener = jest.fn();
      emitter.once("test", listener);
      emitter.emit("test", "first");
      emitter.emit("test", "second");
      emitter.emit("test", "third");
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith("first");
    });

    it("decrements listenerCount to 0 after firing", () => {
      emitter.once("test", jest.fn());
      expect(emitter.listenerCount("test")).toBe(1);
      emitter.emit("test");
      expect(emitter.listenerCount("test")).toBe(0);
    });
  });

  describe("emit return value", () => {
    it("returns true when there are listeners for the event", () => {
      emitter.on("test", jest.fn());
      expect(emitter.emit("test")).toBe(true);
    });

    it("returns false when there are no listeners for the event", () => {
      expect(emitter.emit("test")).toBe(false);
    });

    it("returns false after all listeners have been removed", () => {
      const listener = jest.fn();
      emitter.on("test", listener);
      emitter.off("test", listener);
      expect(emitter.emit("test")).toBe(false);
    });
  });

  describe("listenerCount", () => {
    it("returns 0 for an event with no listeners", () => {
      expect(emitter.listenerCount("test")).toBe(0);
    });

    it("increments as listeners are added with on", () => {
      emitter.on("test", jest.fn());
      expect(emitter.listenerCount("test")).toBe(1);
      emitter.on("test", jest.fn());
      expect(emitter.listenerCount("test")).toBe(2);
      emitter.on("test", jest.fn());
      expect(emitter.listenerCount("test")).toBe(3);
    });

    it("decrements as listeners are removed with off", () => {
      const l1 = jest.fn();
      const l2 = jest.fn();
      emitter.on("test", l1);
      emitter.on("test", l2);
      expect(emitter.listenerCount("test")).toBe(2);
      emitter.off("test", l1);
      expect(emitter.listenerCount("test")).toBe(1);
      emitter.off("test", l2);
      expect(emitter.listenerCount("test")).toBe(0);
    });
  });

  describe("removeAllListeners with event name", () => {
    it("removes only that event's listeners", () => {
      emitter.on("a", jest.fn());
      emitter.on("a", jest.fn());
      emitter.on("b", jest.fn());
      emitter.removeAllListeners("a");
      expect(emitter.listenerCount("a")).toBe(0);
      expect(emitter.listenerCount("b")).toBe(1);
    });

    it("does not throw when called for an event with no listeners", () => {
      expect(() => emitter.removeAllListeners("nonexistent")).not.toThrow();
    });
  });

  describe("removeAllListeners without args", () => {
    it("clears listeners for all events", () => {
      emitter.on("a", jest.fn());
      emitter.on("b", jest.fn());
      emitter.on("c", jest.fn());
      emitter.removeAllListeners();
      expect(emitter.listenerCount("a")).toBe(0);
      expect(emitter.listenerCount("b")).toBe(0);
      expect(emitter.listenerCount("c")).toBe(0);
    });

    it("returns this for chaining", () => {
      expect(emitter.removeAllListeners()).toBe(emitter);
    });
  });

  describe("addListener / removeListener aliases", () => {
    it("addListener registers a listener the same as on", () => {
      const listener = jest.fn();
      emitter.addListener("test", listener);
      emitter.emit("test", "hello");
      expect(listener).toHaveBeenCalledWith("hello");
      expect(emitter.listenerCount("test")).toBe(1);
    });

    it("removeListener removes a listener the same as off", () => {
      const listener = jest.fn();
      emitter.addListener("test", listener);
      emitter.removeListener("test", listener);
      emitter.emit("test");
      expect(listener).not.toHaveBeenCalled();
      expect(emitter.listenerCount("test")).toBe(0);
    });

    it("addListener returns this for chaining", () => {
      expect(emitter.addListener("test", jest.fn())).toBe(emitter);
    });

    it("removeListener returns this for chaining", () => {
      expect(emitter.removeListener("test", jest.fn())).toBe(emitter);
    });
  });

  describe("chaining", () => {
    it("on() returns this so on().on() works", () => {
      const l1 = jest.fn();
      const l2 = jest.fn();
      const result = emitter.on("a", l1).on("b", l2);
      expect(result).toBe(emitter);
      emitter.emit("a");
      emitter.emit("b");
      expect(l1).toHaveBeenCalledTimes(1);
      expect(l2).toHaveBeenCalledTimes(1);
    });

    it("off() returns this for chaining", () => {
      const l1 = jest.fn();
      const l2 = jest.fn();
      emitter.on("a", l1).on("b", l2);
      const result = emitter.off("a", l1).off("b", l2);
      expect(result).toBe(emitter);
    });

    it("supports mixed chaining of on, off, and removeAllListeners", () => {
      const listener = jest.fn();
      const result = emitter
        .on("a", listener)
        .on("b", jest.fn())
        .off("a", listener)
        .removeAllListeners("b");
      expect(result).toBe(emitter);
      expect(emitter.listenerCount("a")).toBe(0);
      expect(emitter.listenerCount("b")).toBe(0);
    });
  });

  describe("emitting with multiple arguments", () => {
    it("passes all arguments to the listener", () => {
      const listener = jest.fn();
      emitter.on("test", listener);
      emitter.emit("test", 1, "two", { three: 3 }, [4], true);
      expect(listener).toHaveBeenCalledWith(1, "two", { three: 3 }, [4], true);
    });

    it("passes zero arguments when none are provided", () => {
      const listener = jest.fn();
      emitter.on("test", listener);
      emitter.emit("test");
      expect(listener).toHaveBeenCalledWith();
    });
  });

  describe("removing a listener during emit", () => {
    it("does not prevent other listeners from being called", () => {
      const listener2 = jest.fn();
      const listener3 = jest.fn();
      const selfRemover = jest.fn(() => {
        emitter.off("test", selfRemover);
      });
      emitter.on("test", selfRemover);
      emitter.on("test", listener2);
      emitter.on("test", listener3);
      emitter.emit("test");
      expect(selfRemover).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);
    });

    it("does not call a listener added by another listener during emit", () => {
      const laterListener = jest.fn();
      const adder = jest.fn(() => {
        emitter.on("test", laterListener);
      });
      emitter.on("test", adder);
      emitter.emit("test");
      expect(adder).toHaveBeenCalledTimes(1);
      expect(laterListener).not.toHaveBeenCalled();
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

    it("supports multiple typed events independently", () => {
      const typed = new EventEmitter<MyEvents>();
      const dataListener = jest.fn();
      const countListener = jest.fn();
      typed.on("data", dataListener);
      typed.on("count", countListener);
      typed.emit("data", "test");
      typed.emit("count", 42);
      expect(dataListener).toHaveBeenCalledWith("test");
      expect(countListener).toHaveBeenCalledWith(42);
    });
  });
});
