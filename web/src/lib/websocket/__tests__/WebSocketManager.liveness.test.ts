/**
 * The liveness watchdog covers the failure `onclose` never reports: a
 * half-open socket the browser still calls OPEN while nothing arrives.
 */
import { WebSocketManager } from "../WebSocketManager";
import { installGlobal } from "../../../test-utils/doubles";
import type { WebSocketConfig } from "../WebSocketManager";

jest.mock("msgpackr", () => ({
  pack: jest.fn((msg: unknown) => msg),
  unpack: jest.fn((buf: unknown) => buf)
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
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: FakeCloseEvent) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(message: unknown): void {
    this.sent.push(message as Record<string, unknown>);
  }

  close(code = 1000, reason = ""): void {
    if (this.readyState === FakeWebSocket.CLOSED) {
      return;
    }
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: code === 1000 });
  }

  /** Close the underlying transport without notifying the client. */
  goHalfOpen(): void {
    this.onclose = null;
  }

  triggerOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  deliver(message: unknown): void {
    this.onmessage?.({ data: message });
  }

  get pings(): Array<Record<string, unknown>> {
    return this.sent.filter((m) => m.type === "ping");
  }
}

const latestSocket = (): FakeWebSocket =>
  FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

const HEARTBEAT_INTERVAL = 4000;
const HEARTBEAT_TIMEOUT = 1000;

const createManager = (
  overrides: Partial<WebSocketConfig> = {}
): WebSocketManager =>
  new WebSocketManager({
    url: "ws://localhost:7777/ws",
    reconnect: false,
    heartbeatInterval: HEARTBEAT_INTERVAL,
    heartbeatTimeout: HEARTBEAT_TIMEOUT,
    ...overrides
  });

const connect = async (mgr: WebSocketManager): Promise<void> => {
  const pending = mgr.connect();
  latestSocket().triggerOpen();
  await pending;
};

describe("WebSocketManager liveness watchdog", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    installGlobal("WebSocket", FakeWebSocket);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("stays quiet while the server keeps sending", async () => {
    const mgr = createManager();
    await connect(mgr);

    for (let i = 0; i < 4; i++) {
      jest.advanceTimersByTime(HEARTBEAT_INTERVAL - 500);
      latestSocket().deliver({ type: "node_update" });
    }

    expect(latestSocket().pings).toHaveLength(0);
    expect(mgr.getState()).toBe("connected");

    mgr.destroy();
  });

  it("probes with a ping once inbound traffic goes silent", async () => {
    const mgr = createManager();
    await connect(mgr);

    jest.advanceTimersByTime(HEARTBEAT_INTERVAL);

    expect(latestSocket().pings).toHaveLength(1);
    expect(mgr.getState()).toBe("connected");

    mgr.destroy();
  });

  it("tears the socket down when the probe goes unanswered", async () => {
    const mgr = createManager();
    const closed = jest.fn();
    mgr.on("close", closed);
    await connect(mgr);

    latestSocket().goHalfOpen();
    jest.advanceTimersByTime(HEARTBEAT_INTERVAL + HEARTBEAT_TIMEOUT + 100);

    expect(closed).toHaveBeenCalledWith(1006, "Heartbeat timeout", false);
    expect(mgr.getState()).toBe("failed");

    mgr.destroy();
  });

  it("keeps the connection when the probe is answered", async () => {
    const mgr = createManager();
    const closed = jest.fn();
    mgr.on("close", closed);
    await connect(mgr);

    jest.advanceTimersByTime(HEARTBEAT_INTERVAL);
    latestSocket().deliver({ type: "pong" });
    jest.advanceTimersByTime(HEARTBEAT_TIMEOUT + 100);

    expect(closed).not.toHaveBeenCalled();
    expect(mgr.getState()).toBe("connected");

    mgr.destroy();
  });

  it("reconnects after a dead connection when reconnect is enabled", async () => {
    const mgr = createManager({ reconnect: true, reconnectInterval: 100 });
    await connect(mgr);
    expect(FakeWebSocket.instances).toHaveLength(1);

    latestSocket().goHalfOpen();
    jest.advanceTimersByTime(HEARTBEAT_INTERVAL + HEARTBEAT_TIMEOUT + 100);
    jest.advanceTimersByTime(200);

    expect(FakeWebSocket.instances).toHaveLength(2);

    mgr.destroy();
  });

  it("answers server pings and does not surface them to subscribers", async () => {
    const mgr = createManager();
    const onMessage = jest.fn();
    mgr.on("message", onMessage);
    await connect(mgr);

    latestSocket().deliver({ type: "ping", ts: 1 });
    latestSocket().deliver({ type: "pong", ts: 2 });

    expect(onMessage).not.toHaveBeenCalled();
    expect(latestSocket().sent.filter((m) => m.type === "pong")).toHaveLength(1);

    mgr.destroy();
  });

  it("checkLiveness probes on demand", async () => {
    const mgr = createManager();
    await connect(mgr);

    mgr.checkLiveness();

    expect(latestSocket().pings).toHaveLength(1);

    mgr.destroy();
  });

  it("checkLiveness drops a socket the browser no longer reports as open", async () => {
    const mgr = createManager();
    const closed = jest.fn();
    mgr.on("close", closed);
    await connect(mgr);

    latestSocket().readyState = FakeWebSocket.CLOSED;
    mgr.checkLiveness();

    expect(closed).toHaveBeenCalledWith(1006, "Heartbeat timeout", false);

    mgr.destroy();
  });
});

describe("WebSocketManager outbound queue", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    installGlobal("WebSocket", FakeWebSocket);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("drops the oldest messages past maxQueueSize", async () => {
    const mgr = createManager({ reconnect: true, maxQueueSize: 3 });
    mgr.connect().catch(() => {});

    for (let i = 0; i < 6; i++) {
      mgr.send({ type: "test", i });
    }

    latestSocket().triggerOpen();

    expect(latestSocket().sent.map((m) => m.i)).toEqual([3, 4, 5]);

    mgr.destroy();
  });
});
