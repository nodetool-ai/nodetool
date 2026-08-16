import { WebSocketManager } from "../WebSocketManager";
import { installGlobal } from "../../../test-utils/doubles";
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

  describe("teardown during URL resolution", () => {
    /**
     * A URL provider makes `establishConnection` yield before it constructs
     * the socket, and in that window `this.ws` is null — so a `destroy()` or
     * `disconnect()` has nothing to close. Opening the socket afterwards
     * would leave an orphan: unreachable by the manager, still holding a
     * runner session on the server, possibly authenticated with a token that
     * was being replaced.
     */
    class RecordingSocket {
      static instances: RecordingSocket[] = [];
      readyState = 0;
      binaryType = "arraybuffer";
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onclose: ((event: unknown) => void) | null = null;
      constructor(public url: string) {
        RecordingSocket.instances.push(this);
      }
      send(): void {
        /* no-op */
      }
      close(): void {
        this.readyState = 3;
      }
    }

    beforeEach(() => {
      RecordingSocket.instances = [];
      installGlobal("WebSocket", RecordingSocket);
    });

    it("opens no socket when destroyed while the URL is being resolved", async () => {
      let releaseUrl: (url: string) => void = () => undefined;
      const mgr = createManager({
        urlProvider: () =>
          new Promise<string>((resolve) => {
            releaseUrl = resolve;
          })
      });

      const pending = mgr.connect();
      mgr.destroy();
      releaseUrl("ws://localhost:7777/ws?api_key=stale");

      await expect(pending).rejects.toThrow("abandoned");
      expect(RecordingSocket.instances).toHaveLength(0);
      expect(mgr.getState()).toBe("disconnected");
    });

    it("opens no socket when disconnected while the URL is being resolved", async () => {
      let releaseUrl: (url: string) => void = () => undefined;
      const mgr = createManager({
        urlProvider: () =>
          new Promise<string>((resolve) => {
            releaseUrl = resolve;
          })
      });

      const pending = mgr.connect();
      mgr.disconnect();
      releaseUrl("ws://localhost:7777/ws");

      await expect(pending).rejects.toThrow("abandoned");
      expect(RecordingSocket.instances).toHaveLength(0);
    });

    it("opens the socket normally when nothing tore it down", async () => {
      const mgr = createManager({
        urlProvider: async () => "ws://localhost:7777/ws?api_key=fresh"
      });

      const pending = mgr.connect();
      await Promise.resolve();
      await Promise.resolve();
      RecordingSocket.instances[0]?.onopen?.();
      await pending;

      expect(RecordingSocket.instances).toHaveLength(1);
      expect(RecordingSocket.instances[0].url).toContain("api_key=fresh");
      mgr.destroy();
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
