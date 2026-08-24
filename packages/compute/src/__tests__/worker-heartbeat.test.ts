/**
 * Tests for the worker idle-clock heartbeat — the shared listener every
 * DB-having host attaches to its Python bridge so the reaper measures idle
 * time from real traffic instead of the creation timestamp.
 */

import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";

import {
  attachWorkerActivityHeartbeat,
  installWorkerActivityHeartbeat,
  type WorkerActivitySource,
} from "../worker-heartbeat.js";

const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

describe("attachWorkerActivityHeartbeat", () => {
  it("touches the resolved instance on activity", async () => {
    const touched: string[] = [];
    const bridge = new EventEmitter();
    attachWorkerActivityHeartbeat(bridge, {
      resolveInstanceId: async () => "w-1",
      touch: async (id) => {
        touched.push(id);
      },
    });

    bridge.emit("activity");
    await flush();

    expect(touched).toEqual(["w-1"]);
  });

  it("collapses a burst into one write and beats again after the window", async () => {
    const touched: string[] = [];
    let nowMs = 0;
    const bridge = new EventEmitter();
    attachWorkerActivityHeartbeat(bridge, {
      resolveInstanceId: async () => "w-1",
      touch: async (id) => {
        touched.push(id);
      },
      now: () => nowMs,
      throttleMs: 10_000,
    });

    for (let i = 0; i < 100; i++) bridge.emit("activity");
    await flush();
    expect(touched).toHaveLength(1);

    nowMs = 9_999;
    bridge.emit("activity");
    await flush();
    expect(touched).toHaveLength(1);

    nowMs = 10_000;
    bridge.emit("activity");
    await flush();
    expect(touched).toHaveLength(2);
  });

  it("writes nothing when no worker is attached", async () => {
    let calls = 0;
    const bridge = new EventEmitter();
    attachWorkerActivityHeartbeat(bridge, {
      resolveInstanceId: async () => null,
      touch: async () => {
        calls++;
      },
    });

    bridge.emit("activity");
    await flush();

    expect(calls).toBe(0);
  });

  it("swallows a failed touch — the clock must not break the run", async () => {
    const bridge = new EventEmitter();
    attachWorkerActivityHeartbeat(bridge, {
      resolveInstanceId: async () => {
        throw new Error("db not initialized");
      },
      touch: async () => {},
    });

    expect(() => bridge.emit("activity")).not.toThrow();
    await flush();
  });

  it("detaches on request", async () => {
    let calls = 0;
    const bridge = new EventEmitter();
    const detach = attachWorkerActivityHeartbeat(bridge, {
      resolveInstanceId: async () => "w-1",
      touch: async () => {
        calls++;
      },
    });

    detach();
    bridge.emit("activity");
    await flush();

    expect(calls).toBe(0);
    expect(bridge.listenerCount("activity")).toBe(0);
  });
});

describe("installWorkerActivityHeartbeat", () => {
  it("heartbeats every bridge the host creates after installing", async () => {
    const touched: string[] = [];
    const observers: Array<(bridge: WorkerActivitySource) => void> = [];
    const uninstall = installWorkerActivityHeartbeat(
      (observer) => {
        observers.push(observer);
        return () => {
          observers.length = 0;
        };
      },
      {
        resolveInstanceId: async () => "w-1",
        touch: async (id) => {
          touched.push(id);
        },
      }
    );

    expect(observers).toHaveLength(1);
    const first = new EventEmitter();
    const second = new EventEmitter();
    for (const bridge of [first, second]) observers[0]!(bridge);

    first.emit("activity");
    second.emit("activity");
    await flush();
    expect(touched).toEqual(["w-1", "w-1"]);

    uninstall();
    expect(observers).toHaveLength(0);
  });
});
