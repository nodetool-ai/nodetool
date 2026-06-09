/**
 * Shared in-process fake Python worker for the WebSocket bridge tests.
 *
 * Speaks the msgpack-over-WebSocket protocol (one WS binary message == one
 * msgpack frame, no length prefix). Used by both python-websocket-bridge.test.ts
 * and python-bridge-models.test.ts.
 */

import { WebSocketServer, type WebSocket as WsServerSocket } from "ws";
import { AddressInfo } from "node:net";
import * as msgpack from "@msgpack/msgpack";

import { BRIDGE_PROTOCOL_VERSION } from "@nodetool-ai/protocol/bridge-protocol";

export const FAKE_NODE = {
  node_type: "fake.TestNode",
  title: "Fake Test Node",
  description: "A fake node for testing",
  properties: [],
  outputs: [{ name: "out", type: { type: "string" } }],
  required_settings: []
};

export interface FakeWorkerOptions {
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
  /**
   * Protocol version the worker announces in both its discover and
   * worker.status responses. Defaults to {@link BRIDGE_PROTOCOL_VERSION} so the
   * shared worker always satisfies the bridge's discover version gate. Pass a
   * lower value (e.g. 1) to simulate an old worker.
   */
  protocolVersion?: number;
  /**
   * models.download behavior:
   *  - "progress": one start frame, one progress frame, then a completed result
   *    (default)
   *  - "error": emit an error-status progress frame then a terminal error frame
   */
  downloadMode?: "progress" | "error";
}

export interface FakeWorkerHandle {
  port: number;
  /** Forcibly drop all currently-connected client sockets. */
  dropConnections: () => void;
  /** Close the server entirely. */
  close: () => Promise<void>;
  /** Number of discover requests the worker has answered. */
  discoverCount: () => number;
  /** Total number of client connections accepted over the worker's lifetime. */
  connectionCount: () => number;
  /**
   * The `Authorization` header from each accepted handshake, in connection
   * order. `undefined` when the client sent no such header. One entry per
   * connection (so reconnects append further entries).
   */
  authHeaders: () => Array<string | undefined>;
  /** Currently connected sockets. */
  sockets: () => Set<WsServerSocket>;
  /** Mutate behavior at runtime (e.g. start answering discover after a drop). */
  setOptions: (opts: FakeWorkerOptions) => void;
  /** The raw frames received for a given message type (for assertion). */
  received: (type: string) => Array<Record<string, unknown>>;
}

/**
 * Start a fake worker on a specific port (or ephemeral when port === 0).
 * Returns once the server is listening.
 */
export function startFakeWorker(
  port = 0,
  initialOptions: FakeWorkerOptions = {}
): Promise<FakeWorkerHandle> {
  const wss = new WebSocketServer({ port });
  const sockets = new Set<WsServerSocket>();
  const authHeaders: Array<string | undefined> = [];
  const receivedByType = new Map<string, Array<Record<string, unknown>>>();
  let discovers = 0;
  let connections = 0;
  const opts: Required<FakeWorkerOptions> = {
    answerDiscover: initialOptions.answerDiscover ?? true,
    answerStatus: initialOptions.answerStatus ?? true,
    answerExecute: initialOptions.answerExecute ?? true,
    streamMode: initialOptions.streamMode ?? "chunks",
    protocolVersion: initialOptions.protocolVersion ?? BRIDGE_PROTOCOL_VERSION,
    downloadMode: initialOptions.downloadMode ?? "progress"
  };

  wss.on("connection", (ws, request) => {
    connections += 1;
    // Record the handshake Authorization header (one entry per connection, so
    // reconnects append). The header survives the WS upgrade on request.headers.
    authHeaders.push(request.headers["authorization"]);
    sockets.add(ws);
    ws.binaryType = "nodebuffer";
    ws.on("close", () => sockets.delete(ws));
    ws.on("message", (raw: Buffer) => {
      const msg = msgpack.decode(raw as Uint8Array) as Record<string, unknown>;
      const type = msg.type as string;
      const requestId = msg.request_id as string;
      const list = receivedByType.get(type) ?? [];
      list.push(msg);
      receivedByType.set(type, list);
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
              protocol_version: opts.protocolVersion,
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
              protocol_version: opts.protocolVersion,
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
        case "models.list_cached":
          send({
            type: "result",
            request_id: requestId,
            data: {
              models: [
                {
                  id: "org/m",
                  name: "org/m",
                  repo_id: "org/m",
                  downloaded: true,
                  size_on_disk: 123
                }
              ]
            }
          });
          break;
        case "models.delete":
          send({
            type: "result",
            request_id: requestId,
            data: { deleted: true }
          });
          break;
        case "models.download": {
          if (opts.downloadMode === "error") {
            send({
              type: "progress",
              request_id: requestId,
              data: {
                status: "error",
                repo_id: "org/m",
                path: null,
                model_type: null,
                downloaded_bytes: 0,
                total_bytes: 0,
                downloaded_files: 0,
                current_files: [],
                total_files: 0,
                error: "boom"
              }
            });
            send({
              type: "error",
              request_id: requestId,
              data: { error: "boom", traceback: "Traceback ..." }
            });
            break;
          }
          send({
            type: "progress",
            request_id: requestId,
            data: {
              status: "start",
              repo_id: "org/m",
              path: null,
              model_type: null,
              downloaded_bytes: 0,
              total_bytes: 100,
              downloaded_files: 0,
              current_files: [],
              total_files: 1
            }
          });
          send({
            type: "progress",
            request_id: requestId,
            data: {
              status: "progress",
              repo_id: "org/m",
              path: null,
              model_type: null,
              downloaded_bytes: 100,
              total_bytes: 100,
              downloaded_files: 0,
              current_files: ["model.bin"],
              total_files: 1
            }
          });
          send({
            type: "result",
            request_id: requestId,
            data: { repo_id: "org/m", status: "completed" }
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
        authHeaders: () => authHeaders,
        sockets: () => sockets,
        setOptions: (next: FakeWorkerOptions) => {
          Object.assign(opts, next);
        },
        received: (t: string) => receivedByType.get(t) ?? []
      });
    });
  });
}
