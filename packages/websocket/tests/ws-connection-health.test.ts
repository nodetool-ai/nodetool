/**
 * Per-connection health limits: the half-open peer the OS never reports, the
 * slow reader whose backlog would otherwise live in the server's heap, and the
 * inbound backlog a stalled runner leaves behind.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  getWsConnectionHealthConfig,
  type WsConnectionHealthConfig
} from "../src/lib/ws-connection-health.js";
import { WsAdapter } from "../src/ws-adapter.js";
import { WsMessageRateLimiter } from "../src/lib/ws-rate-limit.js";

const HEALTH_ENV_VARS = [
  "NODETOOL_WS_HEALTH_DISABLED",
  "NODETOOL_WS_PING_INTERVAL_MS",
  "NODETOOL_WS_IDLE_TIMEOUT_MS",
  "NODETOOL_WS_MAX_BUFFERED_BYTES",
  "NODETOOL_WS_DRAIN_TIMEOUT_MS",
  "NODETOOL_WS_MAX_QUEUED_FRAMES"
] as const;

function clearHealthEnv(): void {
  for (const key of HEALTH_ENV_VARS) delete process.env[key];
}

const health = (
  overrides: Partial<WsConnectionHealthConfig> = {}
): WsConnectionHealthConfig => ({
  enabled: true,
  pingIntervalMs: 1000,
  idleTimeoutMs: 5000,
  maxBufferedBytes: 1024,
  drainTimeoutMs: 2000,
  maxQueuedFrames: 3,
  ...overrides
});

function makeSocket() {
  const emitter = new EventEmitter() as EventEmitter & {
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    ping: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    bufferedAmount: number;
  };
  emitter.send = vi.fn();
  emitter.close = vi.fn();
  emitter.ping = vi.fn();
  emitter.terminate = vi.fn();
  emitter.bufferedAmount = 0;
  return emitter;
}

const noLimit = () =>
  new WsMessageRateLimiter({
    enabled: false,
    maxMessages: 0,
    windowMs: 1000
  });

describe("getWsConnectionHealthConfig", () => {
  afterEach(clearHealthEnv);

  it("returns sane defaults", () => {
    clearHealthEnv();
    expect(getWsConnectionHealthConfig()).toEqual({
      enabled: true,
      pingIntervalMs: 20_000,
      idleTimeoutMs: 70_000,
      maxBufferedBytes: 8 * 1024 * 1024,
      drainTimeoutMs: 30_000,
      maxQueuedFrames: 2000
    });
  });

  it("reads overrides from the environment", () => {
    process.env.NODETOOL_WS_HEALTH_DISABLED = "true";
    process.env.NODETOOL_WS_PING_INTERVAL_MS = "500";
    process.env.NODETOOL_WS_IDLE_TIMEOUT_MS = "1500";
    process.env.NODETOOL_WS_MAX_BUFFERED_BYTES = "2048";
    process.env.NODETOOL_WS_DRAIN_TIMEOUT_MS = "100";
    process.env.NODETOOL_WS_MAX_QUEUED_FRAMES = "7";
    expect(getWsConnectionHealthConfig()).toEqual({
      enabled: false,
      pingIntervalMs: 500,
      idleTimeoutMs: 1500,
      maxBufferedBytes: 2048,
      drainTimeoutMs: 100,
      maxQueuedFrames: 7
    });
  });
});

describe("WsAdapter half-open peer detection", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("pings the peer on the configured cadence", () => {
    vi.useFakeTimers();
    const socket = makeSocket();
    new WsAdapter(socket as never, noLimit(), health());

    vi.advanceTimersByTime(3500);

    expect(socket.ping).toHaveBeenCalledTimes(3);
    expect(socket.terminate).not.toHaveBeenCalled();
  });

  it("terminates a peer that has gone silent past the idle deadline", async () => {
    vi.useFakeTimers();
    const socket = makeSocket();
    const adapter = new WsAdapter(socket as never, noLimit(), health());

    vi.advanceTimersByTime(6000);

    expect(socket.terminate).toHaveBeenCalled();
    expect(adapter.clientState).toBe("disconnected");
    expect((await adapter.receive()).type).toBe("websocket.disconnect");
  });

  it("treats a protocol pong as proof of life", () => {
    vi.useFakeTimers();
    const socket = makeSocket();
    const adapter = new WsAdapter(socket as never, noLimit(), health());

    // Answer every probe just before the deadline would expire.
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(4000);
      socket.emit("pong");
    }

    expect(socket.terminate).not.toHaveBeenCalled();
    expect(adapter.clientState).toBe("connected");
  });

  it("treats inbound data as proof of life", async () => {
    vi.useFakeTimers();
    const socket = makeSocket();
    const adapter = new WsAdapter(socket as never, noLimit(), health());

    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(4000);
      socket.emit("message", Buffer.from("hi"), false);
      await adapter.receive();
    }

    expect(socket.terminate).not.toHaveBeenCalled();
    expect(adapter.clientState).toBe("connected");
  });

  it("stops probing once the socket is gone", () => {
    vi.useFakeTimers();
    const socket = makeSocket();
    new WsAdapter(socket as never, noLimit(), health());

    socket.emit("close");
    vi.advanceTimersByTime(10_000);

    expect(socket.ping).not.toHaveBeenCalled();
    expect(socket.terminate).not.toHaveBeenCalled();
  });

  it("does not probe when health checks are disabled", () => {
    vi.useFakeTimers();
    const socket = makeSocket();
    new WsAdapter(socket as never, noLimit(), health({ enabled: false }));

    vi.advanceTimersByTime(60_000);

    expect(socket.ping).not.toHaveBeenCalled();
    expect(socket.terminate).not.toHaveBeenCalled();
  });
});

describe("WsAdapter outbound backpressure", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends straight through while the peer keeps up", async () => {
    const socket = makeSocket();
    const adapter = new WsAdapter(socket as never, noLimit(), health());

    await adapter.sendBytes(new Uint8Array([1, 2, 3]));
    await adapter.sendText("hello");

    expect(socket.send).toHaveBeenCalledTimes(2);
  });

  it("waits for a full buffer to drain before writing", async () => {
    vi.useFakeTimers();
    const socket = makeSocket();
    const adapter = new WsAdapter(socket as never, noLimit(), health());
    socket.bufferedAmount = 4096;

    const pending = adapter.sendText("blocked");
    await vi.advanceTimersByTimeAsync(500);
    expect(socket.send).not.toHaveBeenCalled();

    socket.bufferedAmount = 0;
    await vi.advanceTimersByTimeAsync(100);
    await pending;

    expect(socket.send).toHaveBeenCalledWith("blocked");
  });

  it("drops a peer that never drains, with a code the client reconnects from", async () => {
    vi.useFakeTimers();
    const socket = makeSocket();
    const adapter = new WsAdapter(socket as never, noLimit(), health());
    socket.bufferedAmount = 4096;

    const pending = adapter.sendText("blocked");
    await vi.advanceTimersByTimeAsync(2500);
    await pending;

    expect(socket.close).toHaveBeenCalledWith(1001, "Client too slow to receive");
    expect(socket.send).not.toHaveBeenCalled();
    expect(adapter.clientState).toBe("disconnected");
  });

  it("swallows a write that races the peer going away", async () => {
    const socket = makeSocket();
    const adapter = new WsAdapter(socket as never, noLimit(), health());
    socket.send.mockImplementation(() => {
      throw new Error("WebSocket is not open");
    });

    await expect(adapter.sendText("doomed")).resolves.toBeUndefined();
    expect(adapter.clientState).toBe("disconnected");
  });
});

describe("WsAdapter inbound queue cap", () => {
  it("closes the connection when undelivered frames pile up", async () => {
    const socket = makeSocket();
    const adapter = new WsAdapter(socket as never, noLimit(), health());

    // Nothing is calling receive(), so every frame queues.
    for (let i = 0; i < 4; i++) {
      socket.emit("message", Buffer.from(String(i)), false);
    }

    expect(socket.close).toHaveBeenCalledWith(1008, "Inbound queue overflow");
    expect(adapter.clientState).toBe("disconnected");
  });

  it("does not count frames a reader has already taken", async () => {
    const socket = makeSocket();
    const adapter = new WsAdapter(socket as never, noLimit(), health());

    for (let i = 0; i < 8; i++) {
      socket.emit("message", Buffer.from(String(i)), false);
      expect((await adapter.receive()).type).toBe("websocket.message");
    }

    expect(socket.close).not.toHaveBeenCalled();
    expect(adapter.clientState).toBe("connected");
  });
});
