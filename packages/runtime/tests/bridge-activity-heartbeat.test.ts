/**
 * Regression: the bridge's "activity" event is the reaper's idle-clock
 * heartbeat, so it must fire on traffic in both directions.
 *
 * A model download sends one request frame and then receives progress for tens
 * of minutes. With an outbound-only heartbeat the clock stops the moment the
 * work starts, which is how a busy A40 was paused mid-download.
 */

import { describe, it, expect, afterEach } from "vitest";

import { WebsocketPythonBridge } from "../src/python-websocket-bridge.js";
import { createPythonBridge } from "../src/python-bridge-factory.js";
import type { PythonBridgeBase } from "../src/python-bridge-base.js";
import { onPythonBridgeCreated } from "../src/python-bridge-factory.js";
import {
  startFakeWorker,
  type FakeWorkerHandle
} from "./python-websocket-bridge.test-helpers.js";

describe("bridge activity heartbeat", () => {
  let worker: FakeWorkerHandle | null = null;
  let bridge: WebsocketPythonBridge | null = null;

  afterEach(async () => {
    if (bridge) {
      bridge.close();
      bridge = null;
    }
    if (worker) {
      await worker.close();
      worker = null;
    }
  });

  it("emits activity for frames the worker sends back, not only for sends", async () => {
    worker = await startFakeWorker(0, { protocolVersion: 2 });
    bridge = new WebsocketPythonBridge({
      wsUrl: `ws://127.0.0.1:${worker.port}`
    });
    await bridge.connect();

    let outbound = 0;
    let total = 0;
    bridge.on("activity", () => total++);
    const send = (
      bridge as unknown as { _send: (m: Record<string, unknown>) => void }
    )._send.bind(bridge);
    (
      bridge as unknown as { _send: (m: Record<string, unknown>) => void }
    )._send = (m) => {
      outbound++;
      send(m);
    };

    await bridge.downloadModel({ repo_id: "org/m" }, () => {});

    // One request frame goes out; start, progress and the terminal result come
    // back. An outbound-only clock would see exactly one beat for the whole
    // download.
    expect(outbound).toBe(1);
    expect(total).toBeGreaterThan(outbound);
  });

  it("hands every bridge it builds to a registered observer", () => {
    const seen: PythonBridgeBase[] = [];
    const uninstall = onPythonBridgeCreated((b) => seen.push(b));
    try {
      const created = createPythonBridge({ wsUrl: "ws://127.0.0.1:1" });
      expect(seen).toEqual([created]);
    } finally {
      uninstall();
    }
    createPythonBridge({ wsUrl: "ws://127.0.0.1:1" });
    expect(seen).toHaveLength(1);
  });

  it("survives an observer that throws", () => {
    const uninstall = onPythonBridgeCreated(() => {
      throw new Error("observer blew up");
    });
    try {
      expect(() =>
        createPythonBridge({ wsUrl: "ws://127.0.0.1:1" })
      ).not.toThrow();
    } finally {
      uninstall();
    }
  });
});
