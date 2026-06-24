import { WebSocketManager } from "../WebSocketManager";
import type { ConnectionState, WebSocketConfig } from "../WebSocketManager";

jest.mock("msgpackr", () => ({
  pack: jest.fn((msg: unknown) => new Uint8Array([1])),
  unpack: jest.fn((buf: Uint8Array) => ({ type: "test" }))
}));

const createManager = (
  overrides: Partial<WebSocketConfig> = {}
): WebSocketManager =>
  new WebSocketManager({
    url: "ws://localhost:7777/ws",
    reconnect: false,
    ...overrides
  });

describe("WebSocketManager", () => {
  describe("initial state", () => {
    it("starts in disconnected state", () => {
      const mgr = createManager();
      expect(mgr.getState()).toBe("disconnected");
    });

    it("reports not connected", () => {
      const mgr = createManager();
      expect(mgr.isConnected()).toBe(false);
    });
  });

  describe("send without connection", () => {
    it("throws when sending in disconnected state", () => {
      const mgr = createManager();
      expect(() => mgr.send({ type: "test" })).toThrow(
        "Cannot send message in state: disconnected"
      );
    });
  });

  describe("disconnect from disconnected", () => {
    it("is a no-op when already disconnected", () => {
      const mgr = createManager();
      mgr.disconnect();
      expect(mgr.getState()).toBe("disconnected");
    });
  });

  describe("state change events", () => {
    it("emits stateChange on connect attempt", () => {
      const mgr = createManager();
      const transitions: Array<{
        newState: ConnectionState;
        previousState: ConnectionState;
      }> = [];
      mgr.on("stateChange", (newState, previousState) => {
        transitions.push({ newState, previousState });
      });

      mgr.connect().catch(() => {});
      expect(transitions).toContainEqual({
        newState: "connecting",
        previousState: "disconnected"
      });

      mgr.destroy();
    });
  });

  describe("destroy", () => {
    it("resets to disconnected and removes listeners", () => {
      const mgr = createManager();
      const listener = jest.fn();
      mgr.on("open", listener);

      mgr.destroy();

      expect(mgr.getState()).toBe("disconnected");
      expect(mgr.listenerCount("open")).toBe(0);
    });
  });

  describe("event emitter integration", () => {
    it("supports on/off/emit pattern", () => {
      const mgr = createManager();
      const handler = jest.fn();

      mgr.on("error", handler);
      expect(mgr.listenerCount("error")).toBe(1);

      mgr.off("error", handler);
      expect(mgr.listenerCount("error")).toBe(0);
    });

    it("supports once", () => {
      const mgr = createManager();
      const handler = jest.fn();

      mgr.once("error", handler);
      mgr["emit"]("error", new Error("test"));
      mgr["emit"]("error", new Error("test2"));

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
