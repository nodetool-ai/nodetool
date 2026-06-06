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
 *
 * Transport-agnostic protocol logic lives in PythonBridgeBase; this subclass
 * supplies the stdio transport (subprocess spawn + length-prefixed framing).
 */

import * as msgpack from "@msgpack/msgpack";
import { importNodeBuiltin } from "@nodetool-ai/config";

// Python bridge is fundamentally Node-only (subprocess + raw FDs).
// Lazy-load the builtins so the module *graph* loads off-Node;
// instantiating PythonStdioBridge there throws at construction.
const nodeCp = await importNodeBuiltin<typeof import("node:child_process")>(
  "node:child_process"
);
const nodeFs = await importNodeBuiltin<typeof import("node:fs")>("node:fs");
const nodeOs = await importNodeBuiltin<typeof import("node:os")>("node:os");
const nodePath = await importNodeBuiltin<typeof import("node:path")>(
  "node:path"
);

function notOnNode(api: string): never {
  throw new Error(`${api} requires Node — PythonStdioBridge is Node-only`);
}
type ChildProcess = ReturnType<typeof import("node:child_process").spawn>;
const spawn = (
  ...args: Parameters<typeof import("node:child_process").spawn>
): ChildProcess => (nodeCp ? nodeCp.spawn(...args) : notOnNode("node:child_process.spawn"));
const existsSync = (p: string): boolean =>
  nodeFs ? nodeFs.existsSync(p) : notOnNode("node:fs.existsSync");
const homedir = (): string =>
  nodeOs ? nodeOs.homedir() : notOnNode("node:os.homedir");
const basename = (p: string): string =>
  nodePath ? nodePath.basename(p) : notOnNode("node:path.basename");
const join = (...parts: string[]): string =>
  nodePath ? nodePath.join(...parts) : notOnNode("node:path.join");

import { createLogger } from "@nodetool-ai/config";

import { PythonBridgeBase } from "./python-bridge-base.js";

const log = createLogger("nodetool.runtime.python-stdio-bridge");
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

export class PythonStdioBridge extends PythonBridgeBase {
  private _process: ChildProcess | null = null;
  /** Buffered stdout data waiting to be parsed into frames. */
  private _readBuffer = Buffer.alloc(0);
  /** Recent stderr lines from the worker for diagnostics. */
  private _recentStderr: string[] = [];

  constructor(options: PythonBridgeOptions = {}) {
    super(options);
  }

  // ── Connection guard ───────────────────────────────────────────────

  protected override _assertCanConnect(): void {
    if (isProductionMode() && !PYTHON_BRIDGE_ALLOWED_IN_PRODUCTION) {
      throw new Error(
        "Python bridge is disabled in production. Python workers are a local-only feature."
      );
    }
  }

  // ── Transport: spawn & stdio setup ─────────────────────────────────

  protected override async _openTransport(): Promise<void> {
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
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          TQDM_DISABLE: "1",
          HF_HUB_DISABLE_PROGRESS_BARS: "1",
          TRANSFORMERS_VERBOSITY: "error",
        },
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
        const stderrHint = this.getRecentStderrSummary(6);
        const desyncHint =
          "This usually means the Python worker wrote non-protocol data to stdout " +
          "(for example a library print/progress bar), desynchronizing the msgpack frame stream.";
        this._failProtocol(
          new Error(
            `Incoming Python bridge frame exceeds max size (${length} > ${MAX_BRIDGE_FRAME_SIZE}). ` +
              desyncHint +
              (stderrHint ? ` Recent stderr: ${stderrHint}` : "")
          )
        );
        return;
      }
      if (this._readBuffer.length < 4 + length) break; // incomplete frame
      const payload = this._readBuffer.subarray(4, 4 + length);
      this._readBuffer = this._readBuffer.subarray(4 + length);
      try {
        const msg = msgpack.decode(payload) as Record<string, unknown>;
        this._handleMessage(msg);
      } catch (err) {
        this._failProtocol(
          new Error(`Failed to decode msgpack frame: ${err}`)
        );
        return;
      }
    }
  }

  private _failProtocol(error: Error): void {
    log.error(error.message);
    this._rejectAllPending(error);
    this.close();
  }

  // ── Send ───────────────────────────────────────────────────────────

  protected override _send(msg: Record<string, unknown>): void {
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

  // ── Shutdown ───────────────────────────────────────────────────────

  override close(): void {
    if (this._pending.size > 0 || this._pendingStream.size > 0) {
      this._rejectAllPending(new Error("Python bridge closed"));
    }
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

  /**
   * For the stdio transport, availability means a local Python interpreter was
   * found (and the bridge is permitted to run in this environment). Delegates to
   * {@link hasPython}.
   */
  override isAvailable(): boolean {
    return this.hasPython();
  }

  getRecentStderrLines(limit = 12): string[] {
    return this._recentStderr.slice(-limit);
  }

  override getRecentStderrSummary(limit = 12): string | null {
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
