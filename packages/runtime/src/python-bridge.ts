import { WebSocket } from "ws";
import * as msgpack from "@msgpack/msgpack";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

export interface NodeMetadataProperty {
  name: string;
  type: { type: string; type_args?: Array<{ type: string }> };
  default?: unknown;
  description?: string;
}

export interface NodeMetadataOutput {
  name: string;
  type: { type: string; type_args?: Array<{ type: string }> };
}

export interface PythonNodeMetadata {
  node_type: string;
  title: string;
  description: string;
  properties: NodeMetadataProperty[];
  outputs: NodeMetadataOutput[];
  required_settings: string[];
  is_streaming_output?: boolean;
  is_streaming_input?: boolean;
  is_dynamic?: boolean;
}

export interface ExecuteResult {
  outputs: Record<string, unknown>;
  blobs: Record<string, Uint8Array>;
}

export interface ProgressEvent {
  request_id: string;
  progress: number;
  total: number;
}

export interface PythonBridgeOptions {
  /** Direct WebSocket URL (skips child process). For testing. */
  wsUrl?: string;
  /** Python interpreter path. Default: NODETOOL_PYTHON env or "python". */
  pythonPath?: string;
  /** Extra args for the worker. */
  workerArgs?: string[];
  /** Auto-restart on crash. Default: true. */
  autoRestart?: boolean;
}

interface PendingRequest {
  resolve: (value: ExecuteResult) => void;
  reject: (error: Error) => void;
  onProgress?: (event: ProgressEvent) => void;
}

export class PythonBridge extends EventEmitter {
  private _ws: WebSocket | null = null;
  private _process: ChildProcess | null = null;
  private _nodeMetadata: PythonNodeMetadata[] = [];
  private _pending = new Map<string, PendingRequest>();
  private _options: PythonBridgeOptions;
  private _connected = false;

  constructor(options: PythonBridgeOptions = {}) {
    super();
    this._options = options;
  }

  /** Connect to an existing WebSocket URL (test mode) or spawn process. */
  async connect(): Promise<void> {
    if (this._options.wsUrl) {
      await this._connectWs(this._options.wsUrl);
    } else {
      await this._spawnAndConnect();
    }
    await this._discover();
  }

  /** Spawn Python child process and connect to its WebSocket. */
  private async _spawnAndConnect(): Promise<void> {
    const pythonPath =
      this._options.pythonPath ??
      process.env.NODETOOL_PYTHON ??
      "python";

    const args = ["-m", "nodetool.worker", ...(this._options.workerArgs ?? [])];

    return new Promise<void>((resolve, reject) => {
      const proc = spawn(pythonPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });
      this._process = proc;

      let portFound = false;

      proc.stdout!.on("data", (chunk: Buffer) => {
        if (portFound) return;
        const lines = chunk.toString().split("\n");
        for (const line of lines) {
          const match = line.match(/^NODETOOL_WORKER_PORT=(\d+)/);
          if (match) {
            portFound = true;
            const port = parseInt(match[1], 10);
            this._connectWs(`ws://127.0.0.1:${port}`)
              .then(resolve)
              .catch(reject);
            return;
          }
        }
      });

      proc.stderr!.on("data", (chunk: Buffer) => {
        this.emit("stderr", chunk.toString());
      });

      proc.on("error", (err) => {
        if (!portFound) reject(err);
      });

      proc.on("exit", (code) => {
        this._connected = false;
        this.emit("exit", code);
        for (const [, req] of this._pending) {
          req.reject(new Error(`Python worker exited with code ${code}`));
        }
        this._pending.clear();
      });
    });
  }

  private async _connectWs(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";

      ws.on("open", () => {
        this._ws = ws;
        this._connected = true;
        resolve();
      });

      ws.on("error", (err) => {
        if (!this._connected) reject(err);
        else this.emit("error", err);
      });

      ws.on("close", () => {
        this._connected = false;
        for (const [, req] of this._pending) {
          req.reject(new Error("WebSocket connection closed"));
        }
        this._pending.clear();
      });

      ws.on("message", (data: ArrayBuffer | Buffer) => {
        const buf =
          data instanceof ArrayBuffer ? new Uint8Array(data) : data;
        const msg = msgpack.decode(buf) as Record<string, unknown>;
        this._handleMessage(msg);
      });
    });
  }

  private _handleMessage(msg: Record<string, unknown>): void {
    const type = msg.type as string;
    const requestId = msg.request_id as string | null;

    if (type === "discover" && requestId) {
      const pending = this._pending.get(requestId);
      if (pending) {
        const data = msg.data as { nodes: PythonNodeMetadata[] };
        this._nodeMetadata = data.nodes;
        pending.resolve({ outputs: {}, blobs: {} });
      }
    } else if (type === "result" && requestId) {
      const pending = this._pending.get(requestId);
      if (pending) {
        this._pending.delete(requestId);
        const data = msg.data as {
          outputs: Record<string, unknown>;
          blobs: Record<string, Uint8Array>;
        };
        pending.resolve({ outputs: data.outputs, blobs: data.blobs ?? {} });
      }
    } else if (type === "error" && requestId) {
      const pending = this._pending.get(requestId);
      if (pending) {
        this._pending.delete(requestId);
        const data = msg.data as { error: string; traceback?: string };
        const err = new Error(data.error);
        (err as unknown as Record<string, unknown>).traceback = data.traceback;
        pending.reject(err);
      }
    } else if (type === "progress" && requestId) {
      const pending = this._pending.get(requestId);
      if (pending?.onProgress) {
        const data = msg.data as { progress: number; total: number };
        pending.onProgress({ request_id: requestId, ...data });
      }
      this.emit("progress", msg.data);
    }
  }

  private async _discover(): Promise<void> {
    const requestId = randomUUID();
    return new Promise<void>((resolve, reject) => {
      this._pending.set(requestId, {
        resolve: () => {
          this._pending.delete(requestId);
          resolve();
        },
        reject: (err) => {
          this._pending.delete(requestId);
          reject(err);
        },
      });
      this._send({
        type: "discover",
        request_id: requestId,
        data: {},
      });
    });
  }

  private _send(msg: Record<string, unknown>): void {
    if (!this._ws || !this._connected) {
      throw new Error("Not connected to Python worker");
    }
    this._ws.send(msgpack.encode(msg));
  }

  /** Execute a Python node. */
  async execute(
    nodeType: string,
    fields: Record<string, unknown>,
    secrets: Record<string, string>,
    blobs: Record<string, Uint8Array>,
    onProgress?: (event: ProgressEvent) => void,
  ): Promise<ExecuteResult> {
    const requestId = randomUUID();
    return new Promise<ExecuteResult>((resolve, reject) => {
      this._pending.set(requestId, { resolve, reject, onProgress });
      this._send({
        type: "execute",
        request_id: requestId,
        data: {
          node_type: nodeType,
          fields,
          secrets,
          blobs,
        },
      });
    });
  }

  /** Cancel an in-flight request. */
  cancel(requestId: string): void {
    this._send({
      type: "cancel",
      request_id: requestId,
      data: {},
    });
  }

  /** Get cached node metadata from last discover. */
  getNodeMetadata(): PythonNodeMetadata[] {
    return this._nodeMetadata;
  }

  /** Check if a node type is available on the Python side. */
  hasNodeType(nodeType: string): boolean {
    return this._nodeMetadata.some((n) => n.node_type === nodeType);
  }

  get isConnected(): boolean {
    return this._connected;
  }

  /** Shut down the bridge. */
  close(): void {
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    if (this._process) {
      this._process.kill();
      this._process = null;
    }
    this._connected = false;
  }
}
