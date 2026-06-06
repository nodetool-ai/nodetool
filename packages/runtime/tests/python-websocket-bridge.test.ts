/**
 * Tests for WebsocketPythonBridge — the connect-to-remote-URL Python worker
 * bridge with auto-reconnect. Stands up an in-process fake worker that speaks
 * the msgpack-over-WebSocket protocol (one WS binary message == one msgpack
 * frame, no length prefix).
 */

import { describe, it, expect, afterEach } from "vitest";
import { WebSocketServer, type WebSocket as WsServerSocket } from "ws";
import * as net from "node:net";
import { AddressInfo } from "node:net";
import * as msgpack from "@msgpack/msgpack";

import { WebsocketPythonBridge } from "../src/python-websocket-bridge.js";

const FAKE_NODE = {
  node_type: "fake.TestNode",
  title: "Fake Test Node",
  description: "A fake node for testing",
  properties: [],
  outputs: [{ name: "out", type: { type: "string" } }],
  required_settings: []
};

interface FakeWorkerOptions {
  /** When false, discover requests are silently ignored (no reply). */
  answerDiscover?: boolean;
  /** When false, worker.status requests are silently ignored (no reply). */
  answerStatus?: boolean;
  /** When false, execute requests are silently ignored (no reply). */
  answerExecute?: boolean;
  /**
   * execute.stream behavior:
   *  - "chunks": emit two chunks then the empty result terminator (default)
   *  - "empty": emit only the empty result terminator (zero chunks)
   */
  streamMode?: "chunks" | "empty";
}

interface FakeWorkerHandle {
  port: number;
  /** Forcibly drop all currently-connected client sockets. */
  dropConnections: () => void;
  /** Close the server entirely. */
  close: () => Promise<void>;
  /** Number of discover requests the worker has answered. */
  discoverCount: () => number;
  /** Total number of client connections accepted over the worker's lifetime. */
  connectionCount: () => number;
  /** Currently connected sockets. */
  sockets: () => Set<WsServerSocket>;
  /** Mutate behavior at runtime (e.g. start answering discover after a drop). */
  setOptions: (opts: FakeWorkerOptions) => void;
}

/**
 * Start a fake worker on a specific port (or ephemeral when port === 0).
 * Returns once the server is listening.
 */
function startFakeWorker(
  port = 0,
  initialOptions: FakeWorkerOptions = {}
): Promise<FakeWorkerHandle> {
  const wss = new WebSocketServer({ port });
  const sockets = new Set<WsServerSocket>();
  let discovers = 0;
  let connections = 0;
  const opts: Required<FakeWorkerOptions> = {
    answerDiscover: initialOptions.answerDiscover ?? true,
    answerStatus: initialOptions.answerStatus ?? true,
    answerExecute: initialOptions.answerExecute ?? true,
    streamMode: initialOptions.streamMode ?? "chunks"
  };

  wss.on("connection", (ws) => {
    connections += 1;
    sockets.add(ws);
    ws.binaryType = "nodebuffer";
    ws.on("close", () => sockets.delete(ws));
    ws.on("message", (raw: Buffer) => {
      const msg = msgpack.decode(raw as Uint8Array) as Record<string, unknown>;
      const type = msg.type as string;
      const requestId = msg.request_id as string;
      const send = (m: Record<string, unknown>) => {
        ws.send(msgpack.encode(m));
      };

      switch (type) {
        case "discover":
          if (!opts.answerDiscover) break;
          discovers += 1;
          send({
            type: "discover",
            request_id: requestId,
            data: {
              nodes: [FAKE_NODE],
              protocol_version: 1,
              load_errors: []
            }
          });
          break;
        case "worker.status":
          if (!opts.answerStatus) break;
          send({
            type: "result",
            request_id: requestId,
            data: {
              transport: "websocket",
              protocol_version: 1,
              node_count: 1,
              provider_count: 1,
              namespaces: ["fake"],
              load_errors: [],
              max_frame_size: 256 * 1024 * 1024
            }
          });
          break;
        case "execute": {
          if (!opts.answerExecute) break;
          const data = msg.data as { fields?: Record<string, unknown> };
          send({
            type: "result",
            request_id: requestId,
            data: {
              outputs: { out: (data.fields?.value as string) ?? "executed" },
              blobs: {}
            }
          });
          break;
        }
        case "execute.stream": {
          if (opts.streamMode === "chunks") {
            send({
              type: "chunk",
              request_id: requestId,
              data: { outputs: { out: "chunk-1" }, blobs: {} }
            });
            send({
              type: "chunk",
              request_id: requestId,
              data: { outputs: { out: "chunk-2" }, blobs: {} }
            });
          }
          // Real worker contract: the stream terminates with an empty result
          // frame ({outputs:{}, blobs:{}}), not a payload-bearing one.
          send({
            type: "result",
            request_id: requestId,
            data: { outputs: {}, blobs: {} }
          });
          break;
        }
        case "provider.list":
          send({
            type: "result",
            request_id: requestId,
            data: {
              providers: [
                { id: "fake-provider", capabilities: ["chat"], required_secrets: [] }
              ]
            }
          });
          break;
        case "provider.stream": {
          send({
            type: "chunk",
            request_id: requestId,
            data: { content: "p-chunk-1" }
          });
          send({
            type: "chunk",
            request_id: requestId,
            data: { content: "p-chunk-2" }
          });
          send({
            type: "result",
            request_id: requestId,
            data: {}
          });
          break;
        }
        case "cancel":
          // no-op
          break;
        default:
          break;
      }
    });
  });

  return new Promise<FakeWorkerHandle>((resolve) => {
    wss.on("listening", () => {
      const addr = wss.address() as AddressInfo;
      resolve({
        port: addr.port,
        dropConnections: () => {
          for (const ws of sockets) {
            // terminate() abruptly drops the TCP connection.
            ws.terminate();
          }
          sockets.clear();
        },
        close: () =>
          new Promise<void>((res) => {
            for (const ws of sockets) ws.terminate();
            sockets.clear();
            wss.close(() => res());
          }),
        discoverCount: () => discovers,
        connectionCount: () => connections,
        sockets: () => sockets,
        setOptions: (next: FakeWorkerOptions) => {
          Object.assign(opts, next);
        }
      });
    });
  });
}

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
    expect(status.protocol_version).toBe(1);
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
});
