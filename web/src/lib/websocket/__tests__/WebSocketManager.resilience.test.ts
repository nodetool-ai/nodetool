/**
 * Outage behaviour: what the manager does between a drop and the socket coming
 * back — how long it keeps trying, what happens to messages sent meanwhile, and
 * how it responds when the environment says the wait is over.
 */
import { WebSocketManager } from "../WebSocketManager";
import { installGlobal } from "../../../test-utils/doubles";
import type { WebSocketConfig } from "../WebSocketManager";

jest.mock("msgpackr", () => ({
  pack: jest.fn(<T,>(msg: T) => msg),
  unpack: jest.fn(<T,>(buf: T) => buf)
}));

interface FakeCloseEvent {
  code: number;
  reason: string;
  wasClean: boolean;
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readyState = 0;
  binaryType = "arraybuffer";
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: FakeCloseEvent) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(message: unknown): void {
    this.sent.push(message);
  }

  close(code = 1000, reason = ""): void {
    if (this.readyState === FakeWebSocket.CLOSED) {
      return;
    }
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: code === 1000 });
  }

  triggerOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  /** Drop the transport the way a network failure does. */
  drop(): void {
    this.close(1006, "Abnormal closure");
  }
}

const latestSocket = (): FakeWebSocket =>
  FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

const createManager = (
  overrides: Partial<WebSocketConfig> = {}
): WebSocketManager =>
  new WebSocketManager({
    url: "ws://localhost:7777/ws",
    reconnect: true,
    reconnectInterval: 100,
    heartbeatInterval: 0,
    ...overrides
  });

const connect = async (mgr: WebSocketManager): Promise<void> => {
  const pending = mgr.connect();
  latestSocket().triggerOpen();
  await pending;
};

describe("WebSocketManager outage resilience", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    installGlobal("WebSocket", FakeWebSocket);
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(1);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("keeps retrying past the old ten-attempt cap", async () => {
    const mgr = createManager();
    await connect(mgr);

    for (let attempt = 0; attempt < 15; attempt++) {
      latestSocket().drop();
      // Backoff is capped at 30s; one full ceiling covers every attempt.
      jest.advanceTimersByTime(31_000);
    }

    expect(mgr.getState()).toBe("reconnecting");
    expect(FakeWebSocket.instances.length).toBeGreaterThan(15);

    mgr.destroy();
  });

  it("caps the backoff at maxReconnectInterval", async () => {
    const mgr = createManager({ maxReconnectInterval: 5000 });
    await connect(mgr);

    for (let attempt = 0; attempt < 12; attempt++) {
      latestSocket().drop();
      jest.advanceTimersByTime(5000);
    }

    expect(FakeWebSocket.instances.length).toBe(13);

    mgr.destroy();
  });

  it("still gives up when reconnect is disabled", async () => {
    const mgr = createManager({ reconnect: false });
    await connect(mgr);

    latestSocket().drop();
    jest.advanceTimersByTime(60_000);

    expect(mgr.getState()).toBe("failed");

    mgr.destroy();
  });

  it("reconnects after the server reports an internal error", async () => {
    const mgr = createManager();
    await connect(mgr);

    latestSocket().close(1011, "Internal server error");
    jest.advanceTimersByTime(200);

    expect(mgr.getState()).toBe("reconnecting");
    expect(FakeWebSocket.instances).toHaveLength(2);

    mgr.destroy();
  });

  it("does not reconnect after a policy close", async () => {
    const mgr = createManager();
    await connect(mgr);

    latestSocket().close(1008, "Message rate limit exceeded");
    jest.advanceTimersByTime(60_000);

    expect(mgr.getState()).toBe("failed");
    expect(FakeWebSocket.instances).toHaveLength(1);

    mgr.destroy();
  });

  describe("sending during the backoff window", () => {
    it("queues and flushes on reconnect instead of throwing", async () => {
      const mgr = createManager();
      await connect(mgr);

      latestSocket().drop();
      expect(mgr.getState()).toBe("disconnected");

      expect(() => mgr.send({ type: "run_job" })).not.toThrow();

      jest.advanceTimersByTime(200);
      latestSocket().triggerOpen();

      expect(latestSocket().sent).toContainEqual({ type: "run_job" });

      mgr.destroy();
    });

    it("drops heartbeat frames rather than replaying them", async () => {
      const mgr = createManager();
      await connect(mgr);

      latestSocket().drop();

      expect(() => mgr.send({ type: "ping", ts: 1 })).toThrow(
        "Cannot send message in state: disconnected"
      );

      jest.advanceTimersByTime(200);
      latestSocket().triggerOpen();

      expect(latestSocket().sent).toHaveLength(0);

      mgr.destroy();
    });

    it("throws once the manager has given up for good", async () => {
      const mgr = createManager({ reconnect: false });
      await connect(mgr);

      latestSocket().drop();

      expect(() => mgr.send({ type: "run_job" })).toThrow(
        "Cannot send message in state: failed"
      );

      mgr.destroy();
    });

    it("drops the queue on an intentional disconnect", async () => {
      const mgr = createManager();
      await connect(mgr);

      latestSocket().drop();
      mgr.send({ type: "run_job" });
      mgr.disconnect();

      expect(() => mgr.send({ type: "run_job" })).toThrow();

      mgr.destroy();
    });
  });

  describe("retryNow", () => {
    it("connects immediately instead of waiting out the backoff", async () => {
      const mgr = createManager({ reconnectInterval: 30_000 });
      await connect(mgr);

      latestSocket().drop();
      expect(FakeWebSocket.instances).toHaveLength(1);

      mgr.retryNow();

      expect(FakeWebSocket.instances).toHaveLength(2);
      expect(mgr.getState()).toBe("reconnecting");

      mgr.destroy();
    });

    it("is a no-op when no reconnect is pending", async () => {
      const mgr = createManager();
      await connect(mgr);

      mgr.retryNow();

      expect(FakeWebSocket.instances).toHaveLength(1);
      expect(mgr.getState()).toBe("connected");

      mgr.destroy();
    });

    it("restarts the backoff ladder from the bottom", async () => {
      const mgr = createManager({ reconnectInterval: 1000, maxReconnectInterval: 30_000 });
      await connect(mgr);

      // Climb the ladder until the delay is pinned at the ceiling.
      for (let attempt = 0; attempt < 10; attempt++) {
        latestSocket().drop();
        jest.advanceTimersByTime(31_000);
      }
      const beforeRetry = FakeWebSocket.instances.length;

      latestSocket().drop();
      mgr.retryNow();
      latestSocket().drop();

      // Back at the bottom of the ladder: the next attempt lands in ~1.5s,
      // not the 30s the pre-retry counter would have asked for.
      jest.advanceTimersByTime(2000);
      expect(FakeWebSocket.instances.length).toBe(beforeRetry + 2);

      mgr.destroy();
    });
  });
});
