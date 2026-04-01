/**
 * stream-runner-base.ts
 *
 * 1:1 TypeScript port of Python StreamRunnerBase from runtime_base.py.
 * Core base class for all code runners supporting Docker containers and local subprocesses.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve as pathResolve } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import Dockerode from "dockerode";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/**
 * Raised when a container or subprocess execution fails.
 */
export class ContainerFailureError extends Error {
  public readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "ContainerFailureError";
    this.exitCode = exitCode;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Slot = "stdout" | "stderr";

export interface StreamRunnerOptions {
  timeoutSeconds?: number;
  image?: string;
  memLimit?: string;
  nanoCpus?: number;
  networkDisabled?: boolean;
  ipcMode?: string | null;
  mode?: "docker" | "subprocess";
  workspaceMountPath?: string | "host" | null;
  dockerWorkdir?: string | null;
}

export interface StreamOptions {
  stdinStream?: AsyncIterable<string>;
  workspaceDir?: string;
}

// ---------------------------------------------------------------------------
// StreamRunnerBase
// ---------------------------------------------------------------------------

/**
 * Base class for streaming code runners with explicit execution modes.
 *
 * Supports two mutually exclusive modes:
 * - "docker": run inside a Docker container
 * - "subprocess": run as a local subprocess on the host
 *
 * The public entrypoint is `stream`, which yields `[slot, value]` tuples
 * where `slot` is either "stdout" or "stderr" and `value` is a
 * newline-terminated string.
 */
export class StreamRunnerBase {
  public readonly image: string;
  public readonly timeoutSeconds: number;
  public readonly memLimit: string;
  public readonly nanoCpus: number;
  public readonly networkDisabled: boolean;
  public readonly ipcMode: string | null;
  public readonly mode: "docker" | "subprocess";
  public readonly workspaceMountPath: string | "host" | null;
  public readonly dockerWorkdir: string | null;

  private _stopped = false;
  private _activeContainerId: string | null = null;
  private _activeChild: ChildProcess | null = null;
  private _resolveInterleaveWait: (() => void) | null = null;

  constructor(options?: StreamRunnerOptions) {
    this.image = options?.image ?? "bash:5.2";
    this.timeoutSeconds = options?.timeoutSeconds ?? 10;
    this.memLimit = options?.memLimit ?? "256m";
    this.nanoCpus = options?.nanoCpus ?? 1_000_000_000;
    this.networkDisabled = options?.networkDisabled ?? true;
    this.ipcMode = options?.ipcMode === undefined ? "host" : options.ipcMode;
    this.mode = options?.mode ?? "docker";
    this.workspaceMountPath =
      options?.workspaceMountPath === undefined
        ? "/workspace"
        : options.workspaceMountPath;
    this.dockerWorkdir =
      options?.dockerWorkdir === undefined
        ? "/workspace"
        : options.dockerWorkdir;
  }

  // ---- Public API --------------------------------------------------------

  /**
   * Run code and stream output lines.
   *
   * Delegates to Docker or subprocess execution based on `mode`.
   *
   * @param userCode   Source code or command string to execute.
   * @param envLocals  Mapping of local variables or parameters exposed to the runner.
   * @param options    Optional stdin stream and workspace directory.
   *
   * @yields `[slot, value]` tuples where `slot` is "stdout"|"stderr".
   */
  async *stream(
    userCode: string,
    envLocals: Record<string, unknown>,
    options?: StreamOptions,
  ): AsyncGenerator<[Slot, string], void> {
    this._stopped = false;

    if (this.mode === "docker") {
      yield* this._dockerRun(userCode, envLocals, options);
    } else {
      yield* this._localRun(userCode, envLocals, options);
    }
  }

  /**
   * Cooperatively stop any active execution.
   * Safe to call multiple times.
   */
  stop(): void {
    this._stopped = true;

    // Wake up the interleave loop so it can exit
    if (this._resolveInterleaveWait) {
      const r = this._resolveInterleaveWait;
      this._resolveInterleaveWait = null;
      r();
    }

    // Kill local subprocess if active
    const child = this._activeChild;
    if (child && child.exitCode === null) {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    }

    // Force-remove Docker container if active
    const containerId = this._activeContainerId;
    if (containerId) {
      try {
        const docker = new Dockerode();
        const container = docker.getContainer(containerId);
        container.remove({ force: true }).catch(() => {
          // Intentional: best-effort container removal during abort
        });
      } catch {
        // Intentional: container may already be removed or inaccessible
      }
    }
  }

  // ---- Abstract / hook methods -------------------------------------------

  /**
   * Return the command list to run inside the container / subprocess.
   *
   * Subclasses MUST override this method.
   */
  buildContainerCommand(
    _userCode: string,
    _envLocals: Record<string, unknown>,
  ): string[] {
    throw new Error(
      "buildContainerCommand must be implemented by subclasses",
    );
  }

  /**
   * Hook to wrap the subprocess command (e.g., with sandbox-exec).
   *
   * Subclasses can override to wrap the command with sandboxing, resource
   * limiting, etc.
   *
   * @returns `[wrappedCommand, cleanupData]`
   */
  wrapSubprocessCommand(
    command: string[],
  ): [string[], unknown] {
    return [command, null];
  }

  /**
   * Hook to clean up resources from `wrapSubprocessCommand`.
   */
  cleanupSubprocessWrapper(_cleanupData: unknown): void {
    // Default: no-op
  }

  /**
   * Build the environment dict for Docker or subprocess.
   *
   * Converts values to strings; unconvertible values become empty strings.
   */
  buildContainerEnvironment(
    env: Record<string, unknown>,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(env ?? {})) {
      try {
        out[String(k)] = String(v);
      } catch {
        out[String(k)] = "";
      }
    }
    return out;
  }

  /**
   * Return the Docker image used by this runner.
   */
  dockerImage(): string {
    return this.image;
  }

  /**
   * Return the host workspace path, creating it if necessary.
   */
  getWorkspaceHostPath(workspaceDir?: string): string | null {
    if (!workspaceDir) {
      return null;
    }
    try {
      const hostPath = pathResolve(workspaceDir);
      if (!existsSync(hostPath)) {
        mkdirSync(hostPath, { recursive: true });
      }
      return hostPath;
    } catch {
      return null;
    }
  }

  /**
   * Return the path user code should treat as the workspace.
   */
  resolveExecutionWorkspacePath(workspaceDir?: string): string | null {
    if (this.mode === "docker") {
      const mount = this._resolveWorkspaceMount(workspaceDir);
      if (mount) {
        return mount[1];
      }
      return this.dockerWorkdir;
    }
    return this.getWorkspaceHostPath(workspaceDir);
  }

  // ---- Private: workspace helpers ----------------------------------------

  private _resolveWorkspaceMount(
    workspaceDir?: string,
  ): [string, string] | null {
    if (this.workspaceMountPath === null) {
      return null;
    }
    const hostPath = this.getWorkspaceHostPath(workspaceDir);
    if (!hostPath) {
      return null;
    }
    const containerPath =
      this.workspaceMountPath === "host"
        ? hostPath
        : this.workspaceMountPath;
    return [hostPath, containerPath];
  }

  private _determineContainerWorkdir(
    workspaceMount: [string, string] | null,
  ): string | undefined {
    if (workspaceMount) {
      return workspaceMount[1];
    }
    return this.dockerWorkdir ?? undefined;
  }

  // ---- Private: command formatting ---------------------------------------

  private _formatCommandStr(command: string[] | null): string | null {
    if (!command) return null;
    try {
      return command.map((p) => this._shellQuote(p)).join(" ");
    } catch {
      return String(command);
    }
  }

  /**
   * Minimal shell quoting for logging purposes.
   */
  private _shellQuote(s: string): string {
    if (/^[a-zA-Z0-9_./:=@-]+$/.test(s)) {
      return s;
    }
    return `'${s.replace(/'/g, "'\\''")}'`;
  }

  // ---- Private: memory-limit parsing for Docker --------------------------

  private _parseMemLimit(mem: string): number {
    const match = mem.match(/^(\d+)([kmgt]?)b?$/i);
    if (!match) return 256 * 1024 * 1024; // fallback 256m
    const num = parseInt(match[1], 10);
    const unit = (match[2] || "").toLowerCase();
    switch (unit) {
      case "k":
        return num * 1024;
      case "m":
        return num * 1024 * 1024;
      case "g":
        return num * 1024 * 1024 * 1024;
      case "t":
        return num * 1024 * 1024 * 1024 * 1024;
      default:
        return num;
    }
  }

  // ---- Private: Docker execution -----------------------------------------

  private async *_dockerRun(
    userCode: string,
    envLocals: Record<string, unknown>,
    options?: StreamOptions,
  ): AsyncGenerator<[Slot, string], void> {
    const env: Record<string, unknown> = {};
    const command = this.buildContainerCommand(userCode, envLocals);
    const commandStr = this._formatCommandStr(command);
    const environment = this.buildContainerEnvironment(env);
    const stdinStream = options?.stdinStream ?? null;

    const docker = new Dockerode();

    // Ensure Docker daemon is reachable
    try {
      await docker.ping();
    } catch (e) {
      throw new Error(
        `Docker daemon is not available. Please start Docker and try again. (${e})`,
      );
    }

    // Ensure image exists locally; pull if needed
    const imageName = this.image;
    try {
      await docker.getImage(imageName).inspect();
    } catch {
      const pullStream = await docker.pull(imageName);
      // Wait for pull to complete
      await new Promise<void>((resolve, reject) => {
        docker.modem.followProgress(
          pullStream,
          (err: Error | null) => (err ? reject(err) : resolve()),
        );
      });
    }

    // Resolve workspace volumes
    const workspaceMount = this._resolveWorkspaceMount(options?.workspaceDir);
    const binds: string[] = [];
    if (workspaceMount) {
      binds.push(`${workspaceMount[0]}:${workspaceMount[1]}:rw`);
    }
    const workingDir = this._determineContainerWorkdir(workspaceMount);

    // Create container
    const hostConfig: Dockerode.HostConfig = {
      Memory: this._parseMemLimit(this.memLimit),
      NanoCpus: this.nanoCpus,
      NetworkMode: this.networkDisabled ? "none" : undefined,
      Binds: binds.length > 0 ? binds : undefined,
      IpcMode: this.ipcMode ?? undefined,
    };

    const container = await docker.createContainer({
      Image: imageName,
      Cmd: command,
      Env: Object.entries(environment).map(([k, v]) => `${k}=${v}`),
      WorkingDir: workingDir,
      OpenStdin: stdinStream !== null,
      Tty: false,
      HostConfig: hostConfig,
    });

    this._activeContainerId = container.id;

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    try {
      // Attach before start to not miss early output
      const attachStream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
        stdin: stdinStream !== null,
      });

      await container.start();

      // Feed stdin if provided
      if (stdinStream !== null) {
        // Fire-and-forget stdin feeder
        void (async () => {
          try {
            for await (const data of stdinStream) {
              const chunk = data.endsWith("\n") ? data : data + "\n";
              attachStream.write(chunk, "utf-8");
            }
            // Signal EOF
            attachStream.end();
          } catch {
            // stdin feed error - ignore
          }
        })();
      }

      // Set up timeout
      if (this.timeoutSeconds > 0) {
        timeoutHandle = setTimeout(() => {
          container.remove({ force: true }).catch(() => {
            // Intentional: best-effort container cleanup on timeout
          });
        }, this.timeoutSeconds * 1000);
      }

      // Demux the multiplexed Docker stream
      yield* this._demuxDockerStream(attachStream);

      // Wait for container exit
      const waitResult = await container.wait().catch(() => ({
        StatusCode: -1,
      }));
      const exitCode =
        typeof waitResult === "object" && waitResult !== null
          ? (waitResult as { StatusCode: number }).StatusCode ?? 0
          : 0;

      if (exitCode !== 0) {
        throw new ContainerFailureError(
          `Container exited with non-zero status: ${exitCode}`,
          exitCode,
        );
      }
    } finally {
      // Cleanup
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
      try {
        await container.remove({ force: true });
      } catch {
        // ignore - may already be removed
      }
      this._activeContainerId = null;
    }
  }

  /**
   * Demultiplex Docker's multiplexed stdout/stderr stream.
   *
   * Docker uses an 8-byte header per frame:
   *   [1 byte stream type][3 bytes padding][4 bytes payload length][payload]
   * Stream type: 1 = stdout, 2 = stderr
   */
  private async *_demuxDockerStream(
    stream: NodeJS.ReadableStream,
  ): AsyncGenerator<[Slot, string], void> {
    let buffer = Buffer.alloc(0);
    let stdoutBuf = "";
    let stderrBuf = "";

    const chunks: Buffer[] = [];
    let resolveChunk: (() => void) | null = null;
    let streamEnded = false;

    stream.on("data", (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
      if (resolveChunk) {
        const r = resolveChunk;
        resolveChunk = null;
        r();
      }
    });

    stream.on("end", () => {
      streamEnded = true;
      if (resolveChunk) {
        const r = resolveChunk;
        resolveChunk = null;
        r();
      }
    });

    stream.on("error", () => {
      streamEnded = true;
      if (resolveChunk) {
        const r = resolveChunk;
        resolveChunk = null;
        r();
      }
    });

    while (true) {
      // Wait for data if none available
      if (chunks.length === 0 && !streamEnded) {
        await new Promise<void>((resolve) => {
          resolveChunk = resolve;
        });
      }

      // Drain all pending chunks into buffer
      if (chunks.length > 0) {
        buffer = Buffer.concat([buffer, ...chunks.splice(0)]);
      }

      // Parse frames from buffer
      while (buffer.length >= 8) {
        const streamType = buffer[0];
        const payloadLength = buffer.readUInt32BE(4);

        if (buffer.length < 8 + payloadLength) {
          break; // need more data
        }

        const payload = buffer.subarray(8, 8 + payloadLength);
        buffer = buffer.subarray(8 + payloadLength);

        const text = payload.toString("utf-8");

        if (streamType === 1) {
          // stdout
          stdoutBuf += text;
          while (stdoutBuf.includes("\n")) {
            const nlIdx = stdoutBuf.indexOf("\n");
            const line = stdoutBuf.substring(0, nlIdx);
            stdoutBuf = stdoutBuf.substring(nlIdx + 1);
            yield ["stdout", line.endsWith("\n") ? line : line + "\n"];
          }
        } else if (streamType === 2) {
          // stderr
          stderrBuf += text;
          while (stderrBuf.includes("\n")) {
            const nlIdx = stderrBuf.indexOf("\n");
            const line = stderrBuf.substring(0, nlIdx);
            stderrBuf = stderrBuf.substring(nlIdx + 1);
            yield ["stderr", line.endsWith("\n") ? line : line + "\n"];
          }
        }
      }

      if (streamEnded && chunks.length === 0) {
        break;
      }
    }

    // Flush remaining buffers
    if (stdoutBuf) {
      yield ["stdout", stdoutBuf.endsWith("\n") ? stdoutBuf : stdoutBuf + "\n"];
    }
    if (stderrBuf) {
      yield ["stderr", stderrBuf.endsWith("\n") ? stderrBuf : stderrBuf + "\n"];
    }
  }

  // ---- Private: Local subprocess execution -------------------------------

  private async *_localRun(
    userCode: string,
    envLocals: Record<string, unknown>,
    options?: StreamOptions,
  ): AsyncGenerator<[Slot, string], void> {
    const env: Record<string, unknown> = {};
    let commandVec = this.buildContainerCommand(userCode, envLocals);
    const stdinStream = options?.stdinStream ?? null;

    // Allow subclass to wrap the command (e.g., sandbox-exec)
    const [wrappedCommand, cleanupData] =
      this.wrapSubprocessCommand(commandVec);
    commandVec = wrappedCommand;

    // Prepare environment and working directory
    const procEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...this.buildContainerEnvironment(env),
    };
    const cwd = options?.workspaceDir ?? process.cwd();

    const child = spawn(commandVec[0], commandVec.slice(1), {
      cwd,
      env: procEnv,
      stdio: [
        stdinStream !== null ? "pipe" : "ignore",
        "pipe",
        "pipe",
      ],
    });

    this._activeChild = child;

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    try {
      // Feed stdin if provided
      if (stdinStream !== null && child.stdin) {
        void (async () => {
          try {
            for await (const data of stdinStream) {
              const chunk = data.endsWith("\n") ? data : data + "\n";
              child.stdin!.write(chunk, "utf-8");
            }
            child.stdin!.end();
          } catch {
            // stdin feed error - ignore
          }
        })();
      }

      // Set up timeout watchdog
      if (this.timeoutSeconds > 0) {
        timeoutHandle = setTimeout(() => {
          try {
            if (child.exitCode === null) {
              child.kill("SIGTERM");
            }
          } catch {
            // ignore
          }
        }, this.timeoutSeconds * 1000);
      }

      // Create async line iterators for stdout and stderr
      yield* this._interleaveStreams(child);

      // Wait for exit — listen for both "exit" and "close" since on some
      // platforms "close" may be delayed when child processes keep stdio open.
      const exitCode = await new Promise<number>((resolve) => {
        if (child.exitCode !== null) {
          resolve(child.exitCode);
          return;
        }
        let resolved = false;
        const onDone = (code: number | null, signal: string | NodeJS.Signals | null): void => {
          if (resolved) return;
          resolved = true;
          if (signal) {
            // Killed by a signal (e.g. SIGTERM from timeout or stop()).
            // Use 128 + signal number as a conventional non-zero exit code.
            resolve(128);
          } else {
            resolve(code ?? 0);
          }
        };
        child.on("exit", onDone);
        child.on("close", onDone);
      });

      if (exitCode !== 0) {
        throw new ContainerFailureError(
          `Process exited with code ${exitCode}`,
          exitCode,
        );
      }
    } finally {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
      // Ensure child is terminated
      try {
        if (child.exitCode === null) {
          child.kill("SIGTERM");
        }
      } catch {
        // ignore
      }
      // Cleanup wrapper resources
      if (cleanupData !== null) {
        try {
          this.cleanupSubprocessWrapper(cleanupData);
        } catch {
          // ignore
        }
      }
      this._activeChild = null;
    }
  }

  /**
   * Interleave stdout and stderr lines from a child process into a single
   * async generator. Lines are yielded in the order they arrive.
   */
  private async *_interleaveStreams(
    child: ChildProcess,
  ): AsyncGenerator<[Slot, string], void> {
    type QueueItem =
      | { type: "line"; slot: Slot; value: string }
      | { type: "end" };

    const queue: QueueItem[] = [];
    let resolveWait: (() => void) | null = null;
    let endCount = 0;
    const totalStreams = 2; // stdout + stderr

    const push = (item: QueueItem): void => {
      queue.push(item);
      if (resolveWait) {
        const r = resolveWait;
        resolveWait = null;
        r();
      }
    };

    const setupStream = (
      stream: NodeJS.ReadableStream | null,
      slot: Slot,
    ): void => {
      if (!stream) {
        push({ type: "end" });
        return;
      }
      const rl = createInterface({ input: stream, crlfDelay: Infinity });
      rl.on("line", (line) => {
        push({
          type: "line",
          slot,
          value: line.endsWith("\n") ? line : line + "\n",
        });
      });
      rl.on("close", () => {
        push({ type: "end" });
      });
    };

    setupStream(child.stdout, "stdout");
    setupStream(child.stderr, "stderr");

    while (endCount < totalStreams) {
      // If stopped, break out immediately
      if (this._stopped) {
        break;
      }

      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          resolveWait = resolve;
          this._resolveInterleaveWait = resolve;
        });
        this._resolveInterleaveWait = null;
      }

      // Check again after waking up
      if (this._stopped) {
        break;
      }

      while (queue.length > 0) {
        const item = queue.shift()!;
        if (item.type === "end") {
          endCount++;
        } else {
          yield [item.slot, item.value];
        }
      }
    }
  }
}
