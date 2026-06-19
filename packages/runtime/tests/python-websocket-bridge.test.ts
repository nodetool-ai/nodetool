/**
 * Tests for WebsocketPythonBridge — the connect-to-remote-URL Python worker
 * bridge with auto-reconnect. Stands up an in-process fake worker that speaks
 * the msgpack-over-WebSocket protocol (one WS binary message == one msgpack
 * frame, no length prefix).
 */

import { describe, it, expect, afterEach } from "vitest";
import * as net from "node:net";
import { AddressInfo } from "node:net";

import { WebsocketPythonBridge } from "../src/python-websocket-bridge.js";
import { createPythonBridge } from "../src/python-bridge-factory.js";
import { BRIDGE_PROTOCOL_VERSION } from "@nodetool-ai/protocol/bridge-protocol";
import { startFakeWorker, type FakeWorkerHandle } from "./python-websocket-bridge.test-helpers.js";

/**
 * Start a raw TCP server that accepts the connection but never performs the
 * WebSocket upgrade handshake — simulating a half-open port that stalls the WS
 * upgrade. Used to reproduce the CONNECTING-state teardown crash.
 */
function startStallingTcpServer(): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    // Intentionally read nothing and never reply — the WS upgrade stalls.
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        port: addr.port,
        close: () =>
          new Promise<void>((res) => {
            for (const s of sockets) s.destroy();
            sockets.clear();
            server.close(() => res());
          })
      });
    });
  });
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5000,
  intervalMs = 10
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timed out");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

describe("WebsocketPythonBridge", () => {
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

  it("requires a wsUrl", () => {
    expect(() => new WebsocketPythonBridge({})).toThrow(/wsUrl/i);
  });

  it("connect() populates node metadata", async () => {
    worker = await startFakeWorker();
    bridge = new WebsocketPythonBridge({ wsUrl: `ws://127.0.0.1:${worker.port}` });

    await bridge.connect();

    const meta = bridge.getNodeMetadata();
    expect(meta).toHaveLength(1);
    expect(meta[0]!.node_type).toBe("fake.TestNode");
    expect(bridge.isConnected).toBe(true);
  });

  it("execute() round-trips outputs", async () => {
    worker = await startFakeWorker();
    bridge = new WebsocketPythonBridge({ wsUrl: `ws://127.0.0.1:${worker.port}` });
    await bridge.connect();

    const result = await bridge.execute(
      "fake.TestNode",
      { value: "hello" },
      {},
      {}
    );
    expect(result.outputs).toEqual({ out: "hello" });
    expect(result.blobs).toEqual({});
  });

  it("emits 'activity' on each outbound RPC so the cost guard can keep last_activity_at fresh", async () => {
    // The reaper measures idle time from last_activity_at; the bridge is the
    // designated source of activity heartbeats. Every frame sent to the remote
    // worker (execute, in particular) must surface as an "activity" event so the
    // server can touch the attached worker instance and the idle window resets.
    worker = await startFakeWorker();
    bridge = new WebsocketPythonBridge({ wsUrl: `ws://127.0.0.1:${worker.port}` });
    await bridge.connect();

    let activity = 0;
    bridge.on("activity", () => {
      activity += 1;
    });

    await bridge.execute("fake.TestNode", { value: "hello" }, {}, {});

    expect(activity).toBeGreaterThan(0);
  });

  it("executeStream() yields streamed chunks", async () => {
    worker = await startFakeWorker();
    bridge = new WebsocketPythonBridge({ wsUrl: `ws://127.0.0.1:${worker.port}` });
    await bridge.connect();

    const seen: unknown[] = [];
    for await (const chunk of bridge.executeStream(
      "fake.TestNode",
      {},
      {},
      {}
    )) {
      seen.push(chunk.outputs);
    }
    expect(seen).toEqual([{ out: "chunk-1" }, { out: "chunk-2" }]);
  });

  it("a provider call works", async () => {
    worker = await startFakeWorker();
    bridge = new WebsocketPythonBridge({ wsUrl: `ws://127.0.0.1:${worker.port}` });
    await bridge.connect();

    const providers = await bridge.listProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0]!.id).toBe("fake-provider");
  });

  it("getWorkerStatus() reports transport websocket", async () => {
    worker = await startFakeWorker();
    bridge = new WebsocketPythonBridge({ wsUrl: `ws://127.0.0.1:${worker.port}` });
    await bridge.connect();

    const status = await bridge.getWorkerStatus();
    expect(status.transport).toBe("websocket");
    expect(status.protocol_version).toBe(BRIDGE_PROTOCOL_VERSION);
  });

  it("_send throws when not connected", () => {
    bridge = new WebsocketPythonBridge({ wsUrl: "ws://127.0.0.1:1" });
    expect(() => bridge!.cancel("nope")).toThrow(/not connected/i);
  });

  it("auto-reconnects after the socket is dropped server-side", async () => {
    // Worker answers connect (discover/status) but deliberately never answers
    // execute, so the in-flight request is still pending when we drop the LIVE
    // socket. This proves _rejectAllPending — the request must reject with the
    // unexpected-close error, NOT bounce off the _send "Not connected" guard.
    worker = await startFakeWorker(0, { answerExecute: false });
    const port = worker.port;
    bridge = new WebsocketPythonBridge({
      wsUrl: `ws://127.0.0.1:${port}`,
      // keep reconnect fast for the test
      maxReconnectDelayMs: 50
    });
    await bridge.connect();
    expect(worker.discoverCount()).toBe(1);

    let exited = false;
    let reconnected = false;
    bridge.on("exit", () => {
      exited = true;
    });
    bridge.on("reconnected", () => {
      reconnected = true;
    });

    // Issue an execute while fully connected; the worker never replies, so the
    // pending entry is live in the bridge.
    let inflightError: Error | null = null;
    const inflight = bridge
      .execute("fake.TestNode", { value: "x" }, {}, {})
      .catch((err: Error) => {
        inflightError = err;
      });

    // Let the execute frame reach the worker (which ignores it) so the request
    // is genuinely in flight before we tear the socket down.
    await new Promise((r) => setTimeout(r, 50));

    // Drop the live socket from the server side — this is the unexpected close.
    await worker.close();

    await waitFor(() => exited, 5000);
    await inflight;
    expect(inflightError).not.toBeNull();
    // Must be the close-path rejection, not the send-guard path.
    expect((inflightError as unknown as Error).message).toContain(
      "closed unexpectedly"
    );
    expect((inflightError as unknown as Error).message).not.toContain(
      "Not connected"
    );

    // Bring the worker back up on the same port (now answering execute too).
    worker = await startFakeWorker(port);

    // Bridge should reconnect on its own (re-running discover) and emit
    // "reconnected".
    await waitFor(() => reconnected, 10000);
    expect(bridge.isConnected).toBe(true);
    expect(worker.discoverCount()).toBe(1); // fresh server, discover re-run

    // A subsequent execute should now succeed against the new worker.
    const result = await bridge.execute(
      "fake.TestNode",
      { value: "again" },
      {},
      {}
    );
    expect(result.outputs).toEqual({ out: "again" });
  });

  it("does NOT reconnect after explicit close()", async () => {
    worker = await startFakeWorker();
    const port = worker.port;
    bridge = new WebsocketPythonBridge({
      wsUrl: `ws://127.0.0.1:${port}`,
      maxReconnectDelayMs: 50
    });
    await bridge.connect();

    let reconnected = false;
    bridge.on("reconnected", () => {
      reconnected = true;
    });

    bridge.close();
    expect(bridge.isConnected).toBe(false);

    // Drop and bring back the worker; bridge must stay closed.
    await worker.close();
    worker = await startFakeWorker(port);

    // Give it ample time to (incorrectly) reconnect.
    await new Promise((r) => setTimeout(r, 300));
    expect(reconnected).toBe(false);
    expect(bridge.isConnected).toBe(false);
  });

  it("does not crash when the WS upgrade stalls past the startup timeout", async () => {
    // CRASH REPRO: a raw TCP server accepts the connection but never performs
    // the WS upgrade. The handshake startup timer fires and tears down a still-
    // CONNECTING socket. Before the fix this terminated a socket whose error
    // listener had just been removed, so Node escalated the late
    // "WebSocket was closed before the connection was established" error into an
    // uncaught exception and crashed the process. The test merely completing
    // (no unhandledRejection / uncaughtException) is the proof.
    const stall = await startStallingTcpServer();
    try {
      bridge = new WebsocketPythonBridge({
        wsUrl: `ws://127.0.0.1:${stall.port}`,
        startupTimeoutMs: 100,
        autoRestart: false
      });

      let rejected = false;
      await bridge.connect().catch(() => {
        rejected = true;
      });
      expect(rejected).toBe(true);

      // Give any late CONNECTING-state error a chance to surface; if the sink
      // were missing the process would have already crashed.
      await new Promise((r) => setTimeout(r, 150));
      bridge.close();
      bridge = null;
    } finally {
      await stall.close();
    }
  });

  it("does not crash when close() is called before the socket opens", async () => {
    // close-before-open variant: connect() is racing the handshake; we close
    // the bridge while the socket is still CONNECTING. close() detaches the
    // error listener then terminates, which would crash without the no-op sink.
    const stall = await startStallingTcpServer();
    try {
      bridge = new WebsocketPythonBridge({
        wsUrl: `ws://127.0.0.1:${stall.port}`,
        startupTimeoutMs: 5000,
        autoRestart: false
      });

      const connectPromise = bridge.connect().catch(() => {
        /* expected: closed before open */
      });
      // Tear down mid-handshake.
      await new Promise((r) => setTimeout(r, 20));
      bridge.close();
      await connectPromise;

      // Let any late CONNECTING-state error fire.
      await new Promise((r) => setTimeout(r, 100));
      bridge = null;
    } finally {
      await stall.close();
    }
  });

  it("times out a half-open reconnect and keeps retrying", async () => {
    // RECONNECT RPC TIMEOUT: after a drop, the worker accepts the new socket
    // but never answers discover. Without an RPC-phase timeout the reconnect
    // would await forever with _reconnecting stuck true, wedging self-healing.
    worker = await startFakeWorker();
    const port = worker.port;
    bridge = new WebsocketPythonBridge({
      wsUrl: `ws://127.0.0.1:${port}`,
      maxReconnectDelayMs: 50,
      reconnectRpcTimeoutMs: 150
    });
    await bridge.connect();

    let reconnected = false;
    bridge.on("reconnected", () => {
      reconnected = true;
    });

    // Bring the worker back up on the same port but as a half-open worker that
    // accepts sockets yet never answers discover.
    await worker.close();
    worker = await startFakeWorker(port, { answerDiscover: false });

    // Give the bridge several reconnect cycles. Each accepts the socket, hangs
    // on discover, times out, tears down, and retries — it must NOT wedge. With
    // discover unanswered it can never finish a reconnect, so "reconnected"
    // must not fire. (isConnected is intentionally not asserted here: the socket
    // is briefly open during each RPC window, so that flag races the cycle.)
    await new Promise((r) => setTimeout(r, 600));
    expect(reconnected).toBe(false);
    // Multiple half-open cycles must have been attempted (the worker has seen
    // more than one connection), proving the loop is alive, not stuck.
    expect(worker.connectionCount()).toBeGreaterThan(1);

    // Now let the worker answer discover again; the next reconnect cycle must
    // succeed — proving the loop never got stuck with reconnect disabled.
    worker.setOptions({ answerDiscover: true });
    await waitFor(() => reconnected, 10000);
    expect(bridge.isConnected).toBe(true);

    const result = await bridge.execute(
      "fake.TestNode",
      { value: "healed" },
      {},
      {}
    );
    expect(result.outputs).toEqual({ out: "healed" });
  });

  it("connect() resolves even if worker.status never answers", async () => {
    // STATUS TIMEOUT: discover succeeds but worker.status hangs. connect()
    // tolerates a status timeout (load_errors simply unavailable) and resolves.
    worker = await startFakeWorker(0, { answerStatus: false });
    bridge = new WebsocketPythonBridge({
      wsUrl: `ws://127.0.0.1:${worker.port}`,
      statusTimeoutMs: 150,
      // Keep the overall RPC bound comfortably above the status timeout so the
      // status timeout (not the RPC timeout) is what we exercise.
      reconnectRpcTimeoutMs: 5000
    });

    await bridge.connect();
    expect(bridge.isConnected).toBe(true);
    expect(bridge.getNodeMetadata()).toHaveLength(1);
  });

  it("executeStream() yields the single final result for a zero-chunk stream", async () => {
    // EMPTY-TERMINATOR PARITY: the worker emits only the empty result
    // terminator ({outputs:{}, blobs:{}}) and no chunks. The bridge's
    // emittedCount===0 && finalResult branch must yield exactly that one frame.
    worker = await startFakeWorker(0, { streamMode: "empty" });
    bridge = new WebsocketPythonBridge({
      wsUrl: `ws://127.0.0.1:${worker.port}`
    });
    await bridge.connect();

    const seen: Array<{ outputs: Record<string, unknown> }> = [];
    for await (const chunk of bridge.executeStream(
      "fake.TestNode",
      {},
      {},
      {}
    )) {
      seen.push(chunk);
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]!.outputs).toEqual({});
  });

  it("providerStream() yields chunks in order then terminates", async () => {
    worker = await startFakeWorker();
    bridge = new WebsocketPythonBridge({
      wsUrl: `ws://127.0.0.1:${worker.port}`
    });
    await bridge.connect();

    const seen: unknown[] = [];
    for await (const chunk of bridge.providerStream(
      "fake-provider",
      [{ role: "user", content: "hi" }],
      "fake-model"
    )) {
      seen.push(chunk.content);
    }
    expect(seen).toEqual(["p-chunk-1", "p-chunk-2"]);
  });

  it("sends Authorization: Bearer on connect when a workerToken is set", async () => {
    worker = await startFakeWorker();
    bridge = new WebsocketPythonBridge({
      wsUrl: `ws://127.0.0.1:${worker.port}`,
      workerToken: "s3cret-token"
    });
    await bridge.connect();

    // Non-vacuous: assert the worker actually saw exactly one handshake and that
    // it carried the bearer header. Guards against a header that is silently
    // dropped (which would leave authHeaders[0] === undefined).
    expect(worker.authHeaders()).toEqual(["Bearer s3cret-token"]);
  });

  it("re-sends Authorization: Bearer on every reconnect", async () => {
    // The reconnect path builds a fresh socket; the header must be applied there
    // too, not just on the initial connect.
    worker = await startFakeWorker();
    const port = worker.port;
    bridge = new WebsocketPythonBridge({
      wsUrl: `ws://127.0.0.1:${port}`,
      workerToken: "reconnect-token",
      maxReconnectDelayMs: 50
    });
    await bridge.connect();
    expect(worker.authHeaders()).toEqual(["Bearer reconnect-token"]);

    let reconnected = false;
    bridge.on("reconnected", () => {
      reconnected = true;
    });

    // Drop the worker and bring it back on the same port; the bridge reconnects
    // on its own, opening a second socket that must also carry the bearer header.
    await worker.close();
    worker = await startFakeWorker(port);

    await waitFor(() => reconnected, 10000);
    expect(bridge.isConnected).toBe(true);
    // The fresh worker only saw the reconnect handshake — it too is authed.
    expect(worker.authHeaders()).toEqual(["Bearer reconnect-token"]);
  });

  it("sends no Authorization header when no workerToken is configured", async () => {
    worker = await startFakeWorker();
    bridge = new WebsocketPythonBridge({
      wsUrl: `ws://127.0.0.1:${worker.port}`
    });
    await bridge.connect();

    expect(worker.authHeaders()).toEqual([undefined]);
  });

  it("treats an empty-string workerToken as unset (no header)", async () => {
    worker = await startFakeWorker();
    bridge = new WebsocketPythonBridge({
      wsUrl: `ws://127.0.0.1:${worker.port}`,
      workerToken: ""
    });
    await bridge.connect();

    expect(worker.authHeaders()).toEqual([undefined]);
  });

  it("createPythonBridge threads NODETOOL_WORKER_TOKEN into the handshake", async () => {
    // End-to-end through the factory: with only the env vars set, the bridge it
    // builds must carry the bearer header on the handshake. Proves the factory
    // sources the token from NODETOOL_WORKER_TOKEN (not just the constructor).
    worker = await startFakeWorker();
    const savedUrl = process.env["NODETOOL_WORKER_URL"];
    const savedToken = process.env["NODETOOL_WORKER_TOKEN"];
    process.env["NODETOOL_WORKER_URL"] = `ws://127.0.0.1:${worker.port}`;
    process.env["NODETOOL_WORKER_TOKEN"] = "env-token";
    try {
      bridge = createPythonBridge() as WebsocketPythonBridge;
      expect(bridge).toBeInstanceOf(WebsocketPythonBridge);
      await bridge.connect();
      expect(worker.authHeaders()).toEqual(["Bearer env-token"]);
    } finally {
      if (savedUrl === undefined) delete process.env["NODETOOL_WORKER_URL"];
      else process.env["NODETOOL_WORKER_URL"] = savedUrl;
      if (savedToken === undefined) delete process.env["NODETOOL_WORKER_TOKEN"];
      else process.env["NODETOOL_WORKER_TOKEN"] = savedToken;
    }
  });

  describe("setTarget", () => {
    it("reconnects against the new url with a bearer header", async () => {
      // Start on worker A, then re-point at worker B with a token. The bridge
      // must close the A socket and open a fresh socket against B carrying the
      // Authorization: Bearer header on the handshake.
      worker = await startFakeWorker();
      bridge = new WebsocketPythonBridge({
        wsUrl: `ws://127.0.0.1:${worker.port}`,
        maxReconnectDelayMs: 50
      });
      await bridge.connect();
      expect(bridge.wsUrl).toBe(`ws://127.0.0.1:${worker.port}`);

      const workerB = await startFakeWorker();
      try {
        let reconnected = false;
        bridge.on("reconnected", () => {
          reconnected = true;
        });

        bridge.setTarget(`ws://127.0.0.1:${workerB.port}`, "b-token");

        await waitFor(() => reconnected, 10000);
        expect(bridge.isConnected).toBe(true);
        expect(bridge.wsUrl).toBe(`ws://127.0.0.1:${workerB.port}`);
        // The new worker saw exactly one handshake, carrying the bearer header.
        expect(workerB.authHeaders()).toEqual(["Bearer b-token"]);

        // RPC now flows to worker B.
        const result = await bridge.execute(
          "fake.TestNode",
          { value: "on-b" },
          {},
          {}
        );
        expect(result.outputs).toEqual({ out: "on-b" });
      } finally {
        await workerB.close();
      }
    });

    it("is a no-op when the url is unchanged (no reconnect)", async () => {
      worker = await startFakeWorker();
      bridge = new WebsocketPythonBridge({
        wsUrl: `ws://127.0.0.1:${worker.port}`,
        maxReconnectDelayMs: 50
      });
      await bridge.connect();
      expect(worker.connectionCount()).toBe(1);

      let reconnected = false;
      bridge.on("reconnected", () => {
        reconnected = true;
      });

      bridge.setTarget(`ws://127.0.0.1:${worker.port}`, undefined);

      // Give a reconnect ample time to (incorrectly) fire.
      await new Promise((r) => setTimeout(r, 200));
      expect(reconnected).toBe(false);
      // No second handshake — the original socket was never torn down.
      expect(worker.connectionCount()).toBe(1);
      expect(bridge.isConnected).toBe(true);
    });

    it("sends no Authorization header when re-pointed with an empty token", async () => {
      // Start authed against worker A, then re-point at worker B with an empty
      // token: the new handshake must carry NO Authorization header.
      worker = await startFakeWorker();
      bridge = new WebsocketPythonBridge({
        wsUrl: `ws://127.0.0.1:${worker.port}`,
        workerToken: "a-token",
        maxReconnectDelayMs: 50
      });
      await bridge.connect();
      expect(worker.authHeaders()).toEqual(["Bearer a-token"]);

      const workerB = await startFakeWorker();
      try {
        let reconnected = false;
        bridge.on("reconnected", () => {
          reconnected = true;
        });

        bridge.setTarget(`ws://127.0.0.1:${workerB.port}`, "");

        await waitFor(() => reconnected, 10000);
        expect(workerB.authHeaders()).toEqual([undefined]);
      } finally {
        await workerB.close();
      }
    });

    it("a late-resolving initial handshake cannot clobber the new target (provision→attach→setTarget)", async () => {
      // Reproduce the provision→attach→setTarget race: the initial connect() to
      // worker A is still mid-handshake (CONNECTING) when setTarget re-points at
      // worker B. The A handshake's socket lives only in the _openTransport
      // closure, so if setTarget fails to abort it, A's eventual finishSuccess
      // sets this._ws and clobbers the B socket — leaving the bridge silently
      // attached to the OLD worker. setTarget must abort that handshake.
      const workerA = await startFakeWorker(0, { gateUpgrade: true });
      const workerB = await startFakeWorker();
      try {
        bridge = new WebsocketPythonBridge({
          wsUrl: `ws://127.0.0.1:${workerA.port}`,
          workerToken: "a-token",
          maxReconnectDelayMs: 50
        });

        // Kick off the initial connect; it hangs on A's gated upgrade. Swallow
        // its rejection — setTarget aborts the handshake, which rejects connect().
        const connectErr: { e: Error | null } = { e: null };
        const connecting = bridge.connect().catch((e: Error) => {
          connectErr.e = e;
        });
        // Let the bridge reach the CONNECTING state against worker A.
        await new Promise((r) => setTimeout(r, 50));

        let reconnected = false;
        bridge.on("reconnected", () => {
          reconnected = true;
        });

        // Re-point at B while A's handshake is still in flight.
        bridge.setTarget(`ws://127.0.0.1:${workerB.port}`, "b-token");
        await waitFor(() => reconnected, 10000);

        // Now release A's long-stalled upgrade. A late finishSuccess on the old
        // closure must NOT overwrite the live B socket.
        workerA.releaseUpgrade();
        await new Promise((r) => setTimeout(r, 100));
        await connecting;

        // The bridge is on B: url, token header, and the actual socket.
        expect(bridge.isConnected).toBe(true);
        expect(bridge.wsUrl).toBe(`ws://127.0.0.1:${workerB.port}`);
        expect(workerB.authHeaders()).toEqual(["Bearer b-token"]);

        const result = await bridge.execute(
          "fake.TestNode",
          { value: "on-b" },
          {},
          {}
        );
        expect(result.outputs).toEqual({ out: "on-b" });
        // The execute reached worker B, never the clobbering worker A.
        expect(workerB.received("execute")).toHaveLength(1);
        expect(workerA.received("execute")).toHaveLength(0);
      } finally {
        await workerA.close();
        await workerB.close();
      }
    });

    it("rejects in-flight requests on the forced reconnect", async () => {
      // Worker A accepts the socket and answers connect, but never answers
      // execute, so the request stays pending. setTarget must reject it (the
      // socket is torn down) rather than leaving it hung.
      worker = await startFakeWorker(0, { answerExecute: false });
      bridge = new WebsocketPythonBridge({
        wsUrl: `ws://127.0.0.1:${worker.port}`,
        maxReconnectDelayMs: 50
      });
      await bridge.connect();

      let inflightError: Error | null = null;
      const inflight = bridge
        .execute("fake.TestNode", { value: "x" }, {}, {})
        .catch((err: Error) => {
          inflightError = err;
        });
      // Let the execute frame reach the worker before re-pointing.
      await new Promise((r) => setTimeout(r, 50));

      const workerB = await startFakeWorker();
      try {
        bridge.setTarget(`ws://127.0.0.1:${workerB.port}`, undefined);
        await inflight;
        expect(inflightError).not.toBeNull();
        expect((inflightError as unknown as Error).message).not.toContain(
          "Not connected"
        );
      } finally {
        await workerB.close();
      }
    });
  });
});
