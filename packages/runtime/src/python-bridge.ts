import { WebSocket } from "ws";
import * as msgpack from "@msgpack/msgpack";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

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

export type ExecuteInputBlobs = Record<string, Uint8Array | Uint8Array[]>;

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

/** Callback for streaming responses (provider.stream, provider.tts). */
export type StreamCallback = (chunk: Record<string, unknown>) => void;

interface PendingStreamRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  onChunk: StreamCallback;
}

export interface PythonProviderInfo {
  id: string;
  capabilities: string[];
  required_secrets: string[];
}

type PythonLaunchCandidate = {
  command: string;
  argsPrefix?: string[];
  source: string;
};

export class PythonBridge extends EventEmitter {
  private _ws: WebSocket | null = null;
  private _process: ChildProcess | null = null;
  private _nodeMetadata: PythonNodeMetadata[] = [];
  private _pending = new Map<string, PendingRequest>();
  private _pendingStream = new Map<string, PendingStreamRequest>();
  private _options: PythonBridgeOptions;
  private _connected = false;
  private _connectPromise: Promise<void> | null = null;

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

  /**
   * Lazily connect to the Python worker. Returns a cached promise so
   * multiple callers share the same connection attempt.
   */
  ensureConnected(): Promise<void> {
    if (this._connected) return Promise.resolve();
    if (!this._connectPromise) {
      this._connectPromise = this.connect().then(
        () => {
          this._connectPromise = null;
        },
        (err) => {
          this._connectPromise = null;
          throw err;
        }
      );
    }
    return this._connectPromise;
  }

  /** Spawn Python child process and connect to its WebSocket. */
  private async _spawnAndConnect(): Promise<void> {
    const candidates = this._getPythonLaunchCandidates();
    let lastError: Error | null = null;

    for (const candidate of candidates) {
      try {
        await this._spawnCandidate(candidate);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw (
      lastError ??
      new Error(
        candidates.length === 0
          ? "No Python interpreter found — Python nodes will not be available"
          : "Failed to start Python worker"
      )
    );
  }

  private _getPythonLaunchCandidates(): PythonLaunchCandidate[] {
    const explicitPythonPath =
      this._options.pythonPath ?? process.env.NODETOOL_PYTHON;
    if (explicitPythonPath) {
      return [{ command: explicitPythonPath, source: "NODETOOL_PYTHON" }];
    }

    const condaPrefix = process.env.CONDA_PREFIX;
    if (condaPrefix && this._looksLikeNodeToolEnv(condaPrefix)) {
      const activeEnvPython =
        process.platform === "win32"
          ? join(condaPrefix, "python.exe")
          : join(condaPrefix, "bin", "python");
      if (existsSync(activeEnvPython)) {
        return [{ command: activeEnvPython, source: "active CONDA_PREFIX" }];
      }
    }

    const candidates = this._getManagedPythonPaths().map((command) => ({
      command,
      source: "NodeTool-managed env"
    }));

    return candidates;
  }

  private _looksLikeNodeToolEnv(envPath: string): boolean {
    const normalized = envPath.replaceAll("\\", "/").toLowerCase();
    const envName = basename(envPath).toLowerCase();
    return (
      envName === "nodetool" ||
      envName === "conda_env" ||
      normalized.includes("/nodetool/conda_env")
    );
  }

  private _getManagedPythonPaths(): string[] {
    const home = homedir();

    if (process.platform === "win32") {
      return [
        process.env.ALLUSERSPROFILE
          ? join(
              process.env.ALLUSERSPROFILE,
              "nodetool",
              "conda_env",
              "python.exe"
            )
          : join(
              process.env.APPDATA ?? join(home, "AppData", "Roaming"),
              "nodetool",
              "conda_env",
              "python.exe"
            ),
        join(home, "Miniconda3", "envs", "nodetool", "python.exe"),
        join(home, "miniconda3", "envs", "nodetool", "python.exe"),
        join(home, "Anaconda3", "envs", "nodetool", "python.exe"),
        join(home, "anaconda3", "envs", "nodetool", "python.exe"),
        String.raw`C:\ProgramData\nodetool\conda_env\python.exe`
      ].filter(
        (candidate, index, arr) =>
          existsSync(candidate) && arr.indexOf(candidate) === index
      );
    }

    if (process.platform === "darwin") {
      return [
        join(home, "nodetool_env", "bin", "python"),
        join(home, "miniconda3", "envs", "nodetool", "bin", "python"),
        join(home, "anaconda3", "envs", "nodetool", "bin", "python")
      ].filter(
        (candidate, index, arr) =>
          existsSync(candidate) && arr.indexOf(candidate) === index
      );
    }

    return [
      join(home, ".local", "share", "nodetool", "conda_env", "bin", "python"),
      "/opt/nodetool/conda_env/bin/python",
      join(home, "miniconda3", "envs", "nodetool", "bin", "python"),
      join(home, "anaconda3", "envs", "nodetool", "bin", "python")
    ].filter(
      (candidate, index, arr) =>
        existsSync(candidate) && arr.indexOf(candidate) === index
    );
  }

  private async _spawnCandidate(
    candidate: PythonLaunchCandidate
  ): Promise<void> {
    const args = [
      ...(candidate.argsPrefix ?? []),
      "-m",
      "nodetool.worker",
      ...(this._options.workerArgs ?? [])
    ];

    return new Promise<void>((resolve, reject) => {
      const proc = spawn(candidate.command, args, {
        stdio: ["pipe", "pipe", "pipe"]
      });
      this._process = proc;

      let portFound = false;
      let stderrOutput = "";
      let startupSettled = false;

      const settleError = (error: Error) => {
        if (startupSettled) return;
        startupSettled = true;
        reject(error);
      };

      const settleSuccess = () => {
        if (startupSettled) return;
        startupSettled = true;
        resolve();
      };

      proc.stdout!.on("data", (chunk: Buffer) => {
        if (portFound) return;
        const lines = chunk.toString().split("\n");
        for (const line of lines) {
          const match = line.match(/^NODETOOL_WORKER_PORT=(\d+)/);
          if (match) {
            portFound = true;
            const port = parseInt(match[1], 10);
            this._connectWs(`ws://127.0.0.1:${port}`)
              .then(settleSuccess)
              .catch((error) => {
                settleError(
                  error instanceof Error ? error : new Error(String(error))
                );
              });
            return;
          }
        }
      });

      proc.stderr!.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderrOutput += text;
        this.emit("stderr", text);
      });

      proc.on("error", (err) => {
        if (!portFound) {
          settleError(err);
        }
      });

      proc.on("exit", (code) => {
        this._connected = false;

        if (!portFound) {
          const detail = stderrOutput.trim();
          settleError(
            new Error(
              detail ||
                `Python worker (${candidate.source}: ${candidate.command}) exited before startup with code ${code}`
            )
          );
          return;
        }

        this.emit("exit", code);
        for (const [, req] of this._pending) {
          req.reject(new Error(`Python worker exited with code ${code}`));
        }
        this._pending.clear();
        for (const [, req] of this._pendingStream) {
          req.reject(new Error(`Python worker exited with code ${code}`));
        }
        this._pendingStream.clear();
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
        for (const [, req] of this._pendingStream) {
          req.reject(new Error("WebSocket connection closed"));
        }
        this._pendingStream.clear();
      });

      ws.on("message", (data: ArrayBuffer | Buffer) => {
        const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
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
      // Check streaming requests first
      const streamReq = this._pendingStream.get(requestId);
      if (streamReq) {
        this._pendingStream.delete(requestId);
        streamReq.resolve(msg.data as Record<string, unknown>);
        return;
      }
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
      // Check streaming requests first
      const streamReq = this._pendingStream.get(requestId);
      if (streamReq) {
        this._pendingStream.delete(requestId);
        const data = msg.data as { error: string; traceback?: string };
        const err = new Error(data.error);
        (err as unknown as Record<string, unknown>).traceback = data.traceback;
        streamReq.reject(err);
        return;
      }
      const pending = this._pending.get(requestId);
      if (pending) {
        this._pending.delete(requestId);
        const data = msg.data as { error: string; traceback?: string };
        const err = new Error(data.error);
        (err as unknown as Record<string, unknown>).traceback = data.traceback;
        pending.reject(err);
      }
    } else if (type === "chunk" && requestId) {
      const streamReq = this._pendingStream.get(requestId);
      if (streamReq) {
        streamReq.onChunk(msg.data as Record<string, unknown>);
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
        }
      });
      this._send({
        type: "discover",
        request_id: requestId,
        data: {}
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
    blobs: ExecuteInputBlobs,
    onProgress?: (event: ProgressEvent) => void
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
          blobs
        }
      });
    });
  }

  /** Cancel an in-flight request. */
  cancel(requestId: string): void {
    this._send({
      type: "cancel",
      request_id: requestId,
      data: {}
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

  // ── Provider bridge methods ─────────────────────────────────────────

  /** List available Python providers and their capabilities. */
  async listProviders(): Promise<PythonProviderInfo[]> {
    const result = await this._providerCall("provider.list", {});
    return (result as { providers: PythonProviderInfo[] }).providers;
  }

  /** Get available models for a provider. */
  async getProviderModels(
    providerId: string,
    modelType: string,
    secrets?: Record<string, string>
  ): Promise<Record<string, unknown>[]> {
    const result = await this._providerCall("provider.models", {
      provider: providerId,
      model_type: modelType,
      secrets: secrets ?? {}
    });
    return (result as { models: Record<string, unknown>[] }).models;
  }

  /** Generate a single message (non-streaming). */
  async providerGenerate(
    providerId: string,
    messages: Record<string, unknown>[],
    model: string,
    options?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const result = await this._providerCall("provider.generate", {
      provider: providerId,
      messages,
      model,
      ...options
    });
    return (result as { message: Record<string, unknown> }).message;
  }

  /**
   * Stream message generation from a Python provider.
   * Returns an async generator yielding chunk/tool_call objects.
   */
  async *providerStream(
    providerId: string,
    messages: Record<string, unknown>[],
    model: string,
    options?: Record<string, unknown>
  ): AsyncGenerator<Record<string, unknown>> {
    const requestId = randomUUID();
    const chunks: Record<string, unknown>[] = [];
    let done = false;
    let error: Error | null = null;
    let resolveWait: (() => void) | null = null;

    const onChunk = (chunk: Record<string, unknown>) => {
      chunks.push(chunk);
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    };

    const streamPromise = new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        this._pendingStream.set(requestId, { resolve, reject, onChunk });
      }
    );

    streamPromise
      .then(() => {
        done = true;
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      })
      .catch((err) => {
        error = err;
        done = true;
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      });

    this._send({
      type: "provider.stream",
      request_id: requestId,
      data: {
        provider: providerId,
        messages,
        model,
        ...options
      }
    });

    while (true) {
      while (chunks.length > 0) {
        yield chunks.shift()!;
      }
      if (done) break;
      if (error) throw error;
      await new Promise<void>((resolve) => {
        resolveWait = resolve;
      });
    }
    if (error) throw error;
  }

  /** Text-to-image via Python provider. */
  async providerTextToImage(
    providerId: string,
    params: Record<string, unknown>,
    secrets?: Record<string, string>
  ): Promise<Uint8Array> {
    const result = await this._providerCall("provider.text_to_image", {
      provider: providerId,
      params,
      secrets: secrets ?? {}
    });
    const blobs = (result as { blobs: Record<string, Uint8Array> }).blobs;
    return blobs.image;
  }

  /** Image-to-image via Python provider. */
  async providerImageToImage(
    providerId: string,
    image: Uint8Array,
    params: Record<string, unknown>,
    secrets?: Record<string, string>
  ): Promise<Uint8Array> {
    const result = await this._providerCall("provider.image_to_image", {
      provider: providerId,
      image,
      params,
      secrets: secrets ?? {}
    });
    const blobs = (result as { blobs: Record<string, Uint8Array> }).blobs;
    return blobs.image;
  }

  /**
   * Streaming text-to-speech via Python provider.
   * Yields raw audio chunk bytes (Int16 PCM).
   */
  async *providerTTS(
    providerId: string,
    text: string,
    model: string,
    options?: Record<string, unknown>
  ): AsyncGenerator<Uint8Array> {
    const requestId = randomUUID();
    const chunks: Uint8Array[] = [];
    let done = false;
    let error: Error | null = null;
    let resolveWait: (() => void) | null = null;

    const onChunk = (chunk: Record<string, unknown>) => {
      const blobs = chunk.blobs as Record<string, Uint8Array> | undefined;
      if (blobs?.audio) {
        chunks.push(blobs.audio);
      }
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    };

    const streamPromise = new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        this._pendingStream.set(requestId, { resolve, reject, onChunk });
      }
    );

    streamPromise
      .then(() => {
        done = true;
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      })
      .catch((err) => {
        error = err;
        done = true;
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      });

    this._send({
      type: "provider.tts",
      request_id: requestId,
      data: {
        provider: providerId,
        text,
        model,
        ...options
      }
    });

    while (true) {
      while (chunks.length > 0) {
        yield chunks.shift()!;
      }
      if (done) break;
      if (error) throw error;
      await new Promise<void>((resolve) => {
        resolveWait = resolve;
      });
    }
    if (error) throw error;
  }

  /** Automatic speech recognition via Python provider. */
  async providerASR(
    providerId: string,
    audio: Uint8Array,
    model: string,
    options?: Record<string, unknown>
  ): Promise<import("./providers/types.js").ASRResult> {
    const result = await this._providerCall("provider.asr", {
      provider: providerId,
      audio,
      model,
      ...options
    });
    const r = result as {
      text: string;
      chunks?: Array<{ timestamp: [number, number]; text: string }>;
    };
    return { text: r.text, chunks: r.chunks };
  }

  /** Generate embeddings via Python provider. */
  async providerEmbedding(
    providerId: string,
    text: string | string[],
    model: string,
    dimensions?: number
  ): Promise<number[][]> {
    const result = await this._providerCall("provider.embedding", {
      provider: providerId,
      text,
      model,
      dimensions
    });
    return (result as { embeddings: number[][] }).embeddings;
  }

  /** Send a non-streaming provider request and wait for the result. */
  private async _providerCall(
    type: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const requestId = randomUUID();
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      this._pendingStream.set(requestId, {
        resolve,
        reject,
        onChunk: () => {}
      });
      this._send({ type, request_id: requestId, data });
    });
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
