/**
 * Python worker bridge using stdio transport.
 *
 * Communicates over stdin/stdout
 * with length-prefixed msgpack framing instead of WebSocket.
 * This eliminates WebSocket connection instability.
 *
 * Protocol: [4 bytes big-endian length][msgpack payload]
 * Readiness: "NODETOOL_STDIO_READY" on stderr
 * Logs: all Python output goes to stderr
 */

import * as msgpack from "@msgpack/msgpack";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import {
  BRIDGE_PROTOCOL_VERSION,
  MIN_NODETOOL_CORE_VERSION
} from "./bridge-protocol.js";
import type {
  PythonNodeMetadata,
  ExecuteResult,
  ExecuteInputBlobs,
  ProgressEvent,
  StreamCallback,
  PythonProviderInfo,
  PythonBridgeOptions,
  PythonWorkerLoadError,
  PythonWorkerStatus
} from "./python-bridge-types.js";

export type {
  PythonNodeMetadata,
  ExecuteResult,
  ExecuteInputBlobs,
  ProgressEvent,
  StreamCallback,
  PythonProviderInfo,
  PythonBridgeOptions,
  PythonWorkerLoadError,
  PythonWorkerStatus
};

interface PendingRequest {
  resolve: (value: ExecuteResult) => void;
  reject: (error: Error) => void;
  onProgress?: (event: ProgressEvent) => void;
}

interface PendingStreamRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  onChunk: StreamCallback;
}

type PythonLaunchCandidate = {
  command: string;
  argsPrefix?: string[];
  source: string;
};

const MAX_BRIDGE_FRAME_SIZE = Number(
  process.env["NODETOOL_BRIDGE_MAX_FRAME_SIZE"] ?? 256 * 1024 * 1024
);
const PYTHON_BRIDGE_ALLOWED_IN_PRODUCTION =
  process.env["NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION"] === "1";

function isProductionMode(): boolean {
  return process.env["NODETOOL_ENV"] === "production";
}

export class PythonStdioBridge extends EventEmitter {
  private _process: ChildProcess | null = null;
  private _nodeMetadata: PythonNodeMetadata[] = [];
  private _loadErrors: PythonWorkerLoadError[] = [];
  private _workerStatus: PythonWorkerStatus | null = null;
  private _pending = new Map<string, PendingRequest>();
  private _pendingStream = new Map<string, PendingStreamRequest>();
  private _options: PythonBridgeOptions;
  private _connected = false;
  private _connectPromise: Promise<void> | null = null;
  /** Buffered stdout data waiting to be parsed into frames. */
  private _readBuffer = Buffer.alloc(0);
  /** Recent stderr lines from the worker for diagnostics. */
  private _recentStderr: string[] = [];

  constructor(options: PythonBridgeOptions = {}) {
    super();
    this._options = options;
  }

  // ── Connection lifecycle ───────────────────────────────────────────

  async connect(): Promise<void> {
    if (isProductionMode() && !PYTHON_BRIDGE_ALLOWED_IN_PRODUCTION) {
      throw new Error(
        "Python bridge is disabled in production. Python workers are a local-only feature."
      );
    }
    await this._spawnAndConnect();
    await this._discover();
    await this.getWorkerStatus().catch(() => null);
  }

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

  // ── Spawn & stdio setup ────────────────────────────────────────────

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
          : "Failed to start Python worker (stdio)"
      )
    );
  }

  private async _spawnCandidate(
    candidate: PythonLaunchCandidate
  ): Promise<void> {
    const args = [
      ...(candidate.argsPrefix ?? []),
      "-m",
      "nodetool.worker",
      "--stdio",
      ...(this._options.workerArgs ?? [])
    ];

    return new Promise<void>((resolve, reject) => {
      const proc = spawn(candidate.command, args, {
        stdio: ["pipe", "pipe", "pipe"]
      });
      this._process = proc;

      let ready = false;
      let stderrOutput = "";
      let settled = false;
      const startupTimeoutMs = this._options.startupTimeoutMs ?? 20000;

      const startupTimer = setTimeout(() => {
        settleError(
          new Error(
            `Python worker did not become ready within ${startupTimeoutMs}ms.` +
              (stderrOutput.trim() ? ` Recent stderr: ${stderrOutput.trim()}` : "")
          )
        );
      }, startupTimeoutMs);

      const settleError = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(startupTimer);
        reject(error);
      };

      const settleSuccess = () => {
        if (settled) return;
        settled = true;
        clearTimeout(startupTimer);
        resolve();
      };

      // Stdout is binary protocol data — accumulate and parse frames.
      proc.stdout!.on("data", (chunk: Buffer) => {
        this._readBuffer = Buffer.concat([this._readBuffer, chunk]);
        this._drainFrames();
      });

      // Stderr carries logs and the readiness signal.
      proc.stderr!.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderrOutput += text;
        this._rememberStderr(text);
        this.emit("stderr", text);

        if (!ready && text.includes("NODETOOL_STDIO_READY")) {
          ready = true;
          this._connected = true;
          settleSuccess();
        }
      });

      proc.on("error", (err) => {
        if (!ready) settleError(err);
      });

      proc.on("exit", (code) => {
        this._connected = false;

        if (!ready) {
          const detail = stderrOutput.trim();
          // The most common cause of this failure in shipped builds is that
          // the JS side was published ahead of the matching nodetool-core
          // Python wheel, so the older worker doesn't know `--stdio`. Give
          // users an actionable message instead of raw argparse output.
          if (/unrecognized arguments:.*--stdio/.test(detail)) {
            settleError(
              new Error(
                "The bundled Python environment is outdated and does not " +
                  "support the new stdio worker protocol. Please reinstall " +
                  "the Python environment from Settings → Packages " +
                  "(Reinstall environment) to update nodetool-core. " +
                  `Worker source: ${candidate.source} (${candidate.command}).`
              )
            );
            return;
          }
          settleError(
            new Error(
              detail ||
                `Python worker (${candidate.source}: ${candidate.command}) exited before startup with code ${code}`
            )
          );
          return;
        }

        this.emit("exit", code);
        const exitErr = new Error(`Python worker exited with code ${code}`);
        for (const [, req] of this._pending) {
          req.reject(exitErr);
        }
        this._pending.clear();
        for (const [, req] of this._pendingStream) {
          req.reject(exitErr);
        }
        this._pendingStream.clear();
      });
    });
  }

  // ── Frame reader ───────────────────────────────────────────────────

  /** Extract complete length-prefixed frames from _readBuffer. */
  private _drainFrames(): void {
    while (this._readBuffer.length >= 4) {
      const length = this._readBuffer.readUInt32BE(0);
      if (length > MAX_BRIDGE_FRAME_SIZE) {
        this.emit(
          "error",
          new Error(
            `Incoming Python bridge frame exceeds max size (${length} > ${MAX_BRIDGE_FRAME_SIZE})`
          )
        );
        this.close();
        return;
      }
      if (this._readBuffer.length < 4 + length) break; // incomplete frame
      const payload = this._readBuffer.subarray(4, 4 + length);
      this._readBuffer = this._readBuffer.subarray(4 + length);
      try {
        const msg = msgpack.decode(payload) as Record<string, unknown>;
        this._handleMessage(msg);
      } catch (err) {
        this.emit("error", new Error(`Failed to decode msgpack frame: ${err}`));
      }
    }
  }

  // ── Send ───────────────────────────────────────────────────────────

  private _send(msg: Record<string, unknown>): void {
    if (!this._process?.stdin || !this._connected) {
      throw new Error("Not connected to Python worker");
    }
    const payload = Buffer.from(msgpack.encode(msg));
    if (payload.length > MAX_BRIDGE_FRAME_SIZE) {
      throw new Error(
        `Outgoing Python bridge frame exceeds max size (${payload.length} > ${MAX_BRIDGE_FRAME_SIZE})`
      );
    }
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length, 0);
    this._process.stdin.write(header);
    this._process.stdin.write(payload);
  }

  // ── Message dispatch ────────────────────────────────────────────────

  private _handleMessage(msg: Record<string, unknown>): void {
    const type = msg.type as string;
    const requestId = msg.request_id as string | null;

    if (type === "discover" && requestId) {
      const pending = this._pending.get(requestId);
      if (pending) {
        const data = msg.data as {
          nodes: PythonNodeMetadata[];
          protocol_version?: number;
          load_errors?: PythonWorkerLoadError[];
        };
        // Reject the discover promise if the worker's protocol is older
        // than what this build of the JS runtime requires. Workers that
        // pre-date the protocol_version field are treated as version 1
        // (the initial protocol release) — they speak the same wire
        // format as v1, they just don't announce it.
        const workerVersion =
          typeof data.protocol_version === "number"
            ? data.protocol_version
            : 1;
        if (workerVersion < BRIDGE_PROTOCOL_VERSION) {
          this._pending.delete(requestId);
          pending.reject(
            new Error(
              `The installed nodetool-core speaks bridge protocol v${workerVersion}, ` +
                `but this Nodetool build requires v${BRIDGE_PROTOCOL_VERSION}. ` +
                `Please reinstall the Python environment from Settings → Packages ` +
                `(Reinstall environment) — it will fetch nodetool-core>=${MIN_NODETOOL_CORE_VERSION}.`
            )
          );
          return;
        }
        if (workerVersion > BRIDGE_PROTOCOL_VERSION) {
          // Forward-compat: a newer worker is expected to keep speaking
          // older protocols, so we proceed with a warning.
          this.emit(
            "stderr",
            `[python-bridge] Worker protocol v${workerVersion} is newer than ` +
              `JS runtime v${BRIDGE_PROTOCOL_VERSION}; assuming backward compatibility.\n`
          );
        }
        this._nodeMetadata = data.nodes;
        this._loadErrors = data.load_errors ?? [];
        pending.resolve({ outputs: {}, blobs: {} });
      }
    } else if (type === "result" && requestId) {
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

  // ── Discover ───────────────────────────────────────────────────────

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
      this._send({ type: "discover", request_id: requestId, data: {} });
    });
  }

  // ── Node execution ─────────────────────────────────────────────────

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
        data: { node_type: nodeType, fields, secrets, blobs }
      });
    });
  }

  cancel(requestId: string): void {
    this._send({ type: "cancel", request_id: requestId, data: {} });
  }

  getNodeMetadata(): PythonNodeMetadata[] {
    return this._nodeMetadata;
  }

  getLoadErrors() {
    return this._loadErrors;
  }

  async getWorkerStatus() {
    const requestId = randomUUID();
    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      this._pendingStream.set(requestId, {
        resolve,
        reject,
        onChunk: () => {}
      });
      this._send({ type: "worker.status", request_id: requestId, data: {} });
    });
    this._workerStatus =
      result as unknown as PythonWorkerStatus;
    this._loadErrors = this._workerStatus.load_errors ?? this._loadErrors;
    return this._workerStatus;
  }

  hasNodeType(nodeType: string): boolean {
    return this._nodeMetadata.some((n) => n.node_type === nodeType);
  }

  get isConnected(): boolean {
    return this._connected;
  }

  // ── Provider bridge methods ────────────────────────────────────────

  async listProviders(): Promise<PythonProviderInfo[]> {
    const result = await this._providerCall("provider.list", {});
    return (result as { providers: PythonProviderInfo[] }).providers;
  }

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
      data: { provider: providerId, messages, model, ...options }
    });

    while (true) {
      while (chunks.length > 0) yield chunks.shift()!;
      if (done) break;
      if (error) throw error;
      await new Promise<void>((resolve) => {
        resolveWait = resolve;
      });
    }
    if (error) throw error;
  }

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
    return (result as { blobs: Record<string, Uint8Array> }).blobs.image;
  }

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
    return (result as { blobs: Record<string, Uint8Array> }).blobs.image;
  }

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
      if (blobs?.audio) chunks.push(blobs.audio);
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
      data: { provider: providerId, text, model, ...options }
    });

    while (true) {
      while (chunks.length > 0) yield chunks.shift()!;
      if (done) break;
      if (error) throw error;
      await new Promise<void>((resolve) => {
        resolveWait = resolve;
      });
    }
    if (error) throw error;
  }

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
    return {
      text: r.text,
      chunks: r.chunks
    };
  }

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

  // ── Shutdown ───────────────────────────────────────────────────────

  close(): void {
    if (this._process) {
      // Close stdin — the Python side will exit cleanly.
      this._process.stdin?.end();
      this._process.kill();
      this._process = null;
    }
    this._connected = false;
  }

  /** Check if a Python interpreter can be found (without spawning). */
  hasPython(): boolean {
    if (isProductionMode() && !PYTHON_BRIDGE_ALLOWED_IN_PRODUCTION) {
      return false;
    }
    return this._getPythonLaunchCandidates().length > 0;
  }

  getRecentStderrLines(limit = 12): string[] {
    return this._recentStderr.slice(-limit);
  }

  getRecentStderrSummary(limit = 12): string | null {
    const lines = this.getRecentStderrLines(limit)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => line !== "NODETOOL_STDIO_READY");
    if (lines.length === 0) return null;
    return lines.join(" | ");
  }

  private _rememberStderr(text: string): void {
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      this._recentStderr.push(line);
    }
    if (this._recentStderr.length > 200) {
      this._recentStderr.splice(0, this._recentStderr.length - 200);
    }
  }

  // ── Python path detection ───────────────────────────────────────────

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

    return this._getManagedPythonPaths().map((command) => ({
      command,
      source: "NodeTool-managed env"
    }));
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
      ].filter((c, i, a) => existsSync(c) && a.indexOf(c) === i);
    }
    if (process.platform === "darwin") {
      return [
        join(home, "nodetool_env", "bin", "python"),
        join(home, "miniconda3", "envs", "nodetool", "bin", "python"),
        join(home, "anaconda3", "envs", "nodetool", "bin", "python")
      ].filter((c, i, a) => existsSync(c) && a.indexOf(c) === i);
    }
    return [
      join(home, ".local", "share", "nodetool", "conda_env", "bin", "python"),
      "/opt/nodetool/conda_env/bin/python",
      join(home, "miniconda3", "envs", "nodetool", "bin", "python"),
      join(home, "anaconda3", "envs", "nodetool", "bin", "python")
    ].filter((c, i, a) => existsSync(c) && a.indexOf(c) === i);
  }
}
