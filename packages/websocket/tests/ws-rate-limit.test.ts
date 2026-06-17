import { describe, it, expect, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  WsMessageRateLimiter,
  getWsRateLimitConfig
} from "../src/lib/ws-rate-limit.js";
import { WsAdapter } from "../src/ws-adapter.js";

const WS_ENV_VARS = [
  "NODETOOL_WS_RATE_LIMIT_DISABLED",
  "NODETOOL_WS_RATE_LIMIT_MAX",
  "NODETOOL_WS_RATE_LIMIT_WINDOW_MS"
] as const;

function clearWsEnv(): void {
  for (const key of WS_ENV_VARS) delete process.env[key];
}

describe("getWsRateLimitConfig", () => {
  afterEach(clearWsEnv);

  it("returns sane defaults", () => {
    clearWsEnv();
    expect(getWsRateLimitConfig()).toEqual({
      enabled: true,
      maxMessages: 200,
      windowMs: 1000
    });
  });

  it("reads overrides from the environment", () => {
    process.env.NODETOOL_WS_RATE_LIMIT_DISABLED = "yes";
    process.env.NODETOOL_WS_RATE_LIMIT_MAX = "3";
    process.env.NODETOOL_WS_RATE_LIMIT_WINDOW_MS = "500";
    expect(getWsRateLimitConfig()).toEqual({
      enabled: false,
      maxMessages: 3,
      windowMs: 500
    });
  });
});

describe("WsMessageRateLimiter", () => {
  it("allows up to the cap then rejects within a window", () => {
    const limiter = new WsMessageRateLimiter({
      enabled: true,
      maxMessages: 3,
      windowMs: 1000
    });
    expect(limiter.allow(0)).toBe(true);
    expect(limiter.allow(10)).toBe(true);
    expect(limiter.allow(20)).toBe(true);
    expect(limiter.allow(30)).toBe(false);
    expect(limiter.allow(40)).toBe(false);
  });

  it("resets the counter when the window rolls over", () => {
    const limiter = new WsMessageRateLimiter({
      enabled: true,
      maxMessages: 2,
      windowMs: 1000
    });
    expect(limiter.allow(0)).toBe(true);
    expect(limiter.allow(100)).toBe(true);
    expect(limiter.allow(200)).toBe(false);
    // New window starts at 1000ms.
    expect(limiter.allow(1000)).toBe(true);
    expect(limiter.allow(1100)).toBe(true);
    expect(limiter.allow(1200)).toBe(false);
  });

  it("never blocks when disabled", () => {
    const limiter = new WsMessageRateLimiter({
      enabled: false,
      maxMessages: 1,
      windowMs: 1000
    });
    for (let i = 0; i < 100; i++) {
      expect(limiter.allow(i)).toBe(true);
    }
  });
});

describe("WsAdapter rate limiting", () => {
  function makeSocket() {
    const emitter = new EventEmitter() as EventEmitter & {
      send: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    };
    emitter.send = vi.fn();
    emitter.close = vi.fn();
    return emitter;
  }

  it("closes the socket with 1008 when the inbound cap is exceeded", async () => {
    const socket = makeSocket();
    const limiter = new WsMessageRateLimiter({
      enabled: true,
      maxMessages: 2,
      windowMs: 1000
    });
    const adapter = new WsAdapter(socket as never, limiter);

    socket.emit("message", Buffer.from("a"), false);
    socket.emit("message", Buffer.from("b"), false);
    socket.emit("message", Buffer.from("c"), false); // exceeds cap

    expect(socket.close).toHaveBeenCalledWith(
      1008,
      "Message rate limit exceeded"
    );
    expect(adapter.clientState).toBe("disconnected");

    // The two allowed frames were queued before the cap was hit; the over-cap
    // frame was dropped rather than serviced.
    expect((await adapter.receive()).type).toBe("websocket.message");
    expect((await adapter.receive()).type).toBe("websocket.message");
  });

  it("wakes pending waiters with a disconnect frame on rate-limit close", async () => {
    const socket = makeSocket();
    const limiter = new WsMessageRateLimiter({
      enabled: true,
      maxMessages: 1,
      windowMs: 1000
    });
    const adapter = new WsAdapter(socket as never, limiter);

    socket.emit("message", Buffer.from("a"), false); // allowed, queued
    await adapter.receive(); // drain it

    const pending = adapter.receive(); // now waiting
    socket.emit("message", Buffer.from("b"), false); // exceeds cap → disconnect
    expect((await pending).type).toBe("websocket.disconnect");
  });
});
