/**
 * server-docker-runner.ts
 *
 * TypeScript port of Python ServerDockerRunner from server_runner.py.
 * Starts a long-running server process inside a Docker container, exposes a
 * container port on the host (random ephemeral by default), enables networking,
 * and streams stdout/stderr lines. Yields an initial ["endpoint", url] message
 * once the server is TCP-reachable, then continues streaming logs.
 */

import { createConnection, type Socket as NetSocket } from "node:net";
import Dockerode from "dockerode";
import {
  StreamRunnerBase,
  type StreamRunnerOptions,
  type StreamOptions,
  type Slot,
} from "./stream-runner-base.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServerDockerRunnerOptions {
  /** Docker image to run. */
  image: string;
  /** Port the server listens on inside the container. */
  containerPort: number;
  /** URL scheme for the emitted endpoint (e.g., "ws", "http"). */
  scheme?: string;
  /** Host IP for port publishing and endpoint URL (default "127.0.0.1"). */
  hostIp?: string;
  /** Max container lifetime in seconds. */
  timeoutSeconds?: number;
  /** Docker memory limit (e.g., "256m"). */
  memLimit?: string;
  /** Docker CPU quota in nano-CPUs (1e9 = 1 CPU). */
  nanoCpus?: number;
  /** Seconds to wait for the server to accept TCP connections. */
  readyTimeoutSeconds?: number;
  /** Path suffix appended to the endpoint URL. */
  endpointPath?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a Docker-style memory limit string into bytes.
 */
function parseMemLimit(mem: string): number {
  const match = mem.match(/^(\d+)([kmgt]?)b?$/i);
  if (!match) return 256 * 1024 * 1024;
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

/** @internal Exported for unit testing only. */
export { parseMemLimit as _parseMemLimit };

/**
 * Attempt a TCP connection to `host:port`. Resolves `true` if successful,
 * `false` on connection error (with a per-attempt timeout).
 */
function tcpProbe(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const sock: NetSocket = createConnection({ host, port, timeout: timeoutMs });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("timeout", () => {
      sock.destroy();
      resolve(false);
    });
    sock.once("error", () => {
      sock.destroy();
      resolve(false);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// ServerDockerRunner
// ---------------------------------------------------------------------------

/**
 * Run a server process in Docker with an exposed port and stream logs.
 *
 * Differences from `StreamRunnerBase`:
 *   - Networking is enabled by default (`networkDisabled = false`).
 *   - A container port is published to the host; the runner detects the
 *     ephemeral host port and yields a first message on slot "endpoint"
 *     with the full URL.
 *   - The rest of stdout/stderr are streamed like the base class.
 */
export class ServerDockerRunner extends StreamRunnerBase {
  public readonly containerPort: number;
  public readonly scheme: string;
  public readonly hostIp: string;
  public readonly readyTimeoutSeconds: number;
  public readonly endpointPath: string;

  constructor(options: ServerDockerRunnerOptions) {
    const baseOptions: StreamRunnerOptions = {
      image: options.image,
      timeoutSeconds: options.timeoutSeconds ?? 60,
      memLimit: options.memLimit ?? "256m",
      nanoCpus: options.nanoCpus ?? 1_000_000_000,
      networkDisabled: false,
      mode: "docker",
    };
    super(baseOptions);

    this.containerPort = options.containerPort;
    this.scheme = options.scheme ?? "ws";
    this.hostIp = options.hostIp ?? "127.0.0.1";
    this.readyTimeoutSeconds = options.readyTimeoutSeconds ?? 15;

    let ep = options.endpointPath ?? "";
    if (ep && !ep.startsWith("/")) {
      ep = "/" + ep;
    }
    this.endpointPath = ep;
  }

  // ---- Overrides ----------------------------------------------------------

  override buildContainerCommand(
    userCode: string,
    _envLocals: Record<string, unknown>,
  ): string[] {
    const cmd = userCode.trim() || "sleep infinity";
    return ["bash", "-lc", cmd];
  }

  /**
   * Override the public `stream` method to perform port-mapping, TCP
   * readiness probing, and endpoint emission before streaming logs.
   */
  // @ts-expect-error — widens yield type to include "endpoint" slot beyond Slot
  async *stream(
    userCode: string,
    envLocals: Record<string, unknown>,
    options?: StreamOptions,
  ): AsyncGenerator<[string, string], void> {
    const command = this.buildContainerCommand(userCode, envLocals);
    const environment = this.buildContainerEnvironment({});
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

    // Ensure image is available locally
    const imageName = this.image;
    try {
      await docker.getImage(imageName).inspect();
    } catch {
      const pullStream = await docker.pull(imageName);
      await new Promise<void>((resolve, reject) => {
        docker.modem.followProgress(
          pullStream,
          (err: Error | null) => (err ? reject(err) : resolve()),
        );
      });
    }

    // Resolve workspace volumes
    const workspaceDir = options?.workspaceDir;
    const binds: string[] = [];
    if (workspaceDir) {
      binds.push(`${workspaceDir}:/workspace:rw`);
    }

    // Port binding: container port -> ephemeral host port
    const portKey = `${this.containerPort}/tcp`;
    const hostConfig: Dockerode.HostConfig = {
      Memory: parseMemLimit(this.memLimit),
      NanoCpus: this.nanoCpus,
      Binds: binds.length > 0 ? binds : undefined,
      IpcMode: this.ipcMode ?? undefined,
      PortBindings: {
        [portKey]: [{ HostIp: this.hostIp, HostPort: "" }],
      },
    };

    const container = await docker.createContainer({
      Image: imageName,
      Cmd: command,
      Env: Object.entries(environment).map(([k, v]) => `${k}=${v}`),
      WorkingDir: "/workspace",
      OpenStdin: stdinStream !== null,
      Tty: false,
      ExposedPorts: { [portKey]: {} },
      HostConfig: hostConfig,
    });

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    try {
      // Attach before start so we don't miss early output
      const attachStream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
        stdin: stdinStream !== null,
      });

      await container.start();

      // Feed stdin if provided (fire-and-forget)
      if (stdinStream !== null) {
        void (async () => {
          try {
            for await (const data of stdinStream) {
              const chunk = data.endsWith("\n") ? data : data + "\n";
              attachStream.write(chunk, "utf-8");
            }
            attachStream.end();
          } catch {
            // ignore
          }
        })();
      }

      // Set up log streaming in the background; lines are pushed into a queue
      // so we can yield the endpoint first, then continue yielding logs.
      type QueueItem =
        | { type: "line"; slot: Slot; value: string }
        | { type: "end" };

      const logQueue: QueueItem[] = [];
      let resolveLog: (() => void) | null = null;
      let logDone = false;

      const pushLog = (item: QueueItem): void => {
        logQueue.push(item);
        if (resolveLog) {
          const r = resolveLog;
          resolveLog = null;
          r();
        }
      };

      // Start demuxing in the background
      void (async () => {
        try {
          let buffer = Buffer.alloc(0);
          let stdoutBuf = "";
          let stderrBuf = "";

          const chunks: Buffer[] = [];
          let resolveChunk: (() => void) | null = null;
          let streamEnded = false;

          attachStream.on("data", (chunk: Buffer) => {
            chunks.push(Buffer.from(chunk));
            if (resolveChunk) {
              const r = resolveChunk;
              resolveChunk = null;
              r();
            }
          });

          attachStream.on("end", () => {
            streamEnded = true;
            if (resolveChunk) {
              const r = resolveChunk;
              resolveChunk = null;
              r();
            }
          });

          attachStream.on("error", () => {
            streamEnded = true;
            if (resolveChunk) {
              const r = resolveChunk;
              resolveChunk = null;
              r();
            }
          });

          while (true) {
            if (chunks.length === 0 && !streamEnded) {
              await new Promise<void>((resolve) => {
                resolveChunk = resolve;
              });
            }

            if (chunks.length > 0) {
              buffer = Buffer.concat([buffer, ...chunks.splice(0)]);
            }

            while (buffer.length >= 8) {
              const streamType = buffer[0];
              const payloadLength = buffer.readUInt32BE(4);
              if (buffer.length < 8 + payloadLength) break;

              const payload = buffer.subarray(8, 8 + payloadLength);
              buffer = buffer.subarray(8 + payloadLength);
              const text = payload.toString("utf-8");

              if (streamType === 1) {
                stdoutBuf += text;
                while (stdoutBuf.includes("\n")) {
                  const nlIdx = stdoutBuf.indexOf("\n");
                  const line = stdoutBuf.substring(0, nlIdx);
                  stdoutBuf = stdoutBuf.substring(nlIdx + 1);
                  pushLog({ type: "line", slot: "stdout", value: line.endsWith("\n") ? line : line + "\n" });
                }
              } else if (streamType === 2) {
                stderrBuf += text;
                while (stderrBuf.includes("\n")) {
                  const nlIdx = stderrBuf.indexOf("\n");
                  const line = stderrBuf.substring(0, nlIdx);
                  stderrBuf = stderrBuf.substring(nlIdx + 1);
                  pushLog({ type: "line", slot: "stderr", value: line.endsWith("\n") ? line : line + "\n" });
                }
              }
            }

            if (streamEnded && chunks.length === 0) break;
          }

          // Flush remaining
          if (stdoutBuf) {
            pushLog({ type: "line", slot: "stdout", value: stdoutBuf.endsWith("\n") ? stdoutBuf : stdoutBuf + "\n" });
          }
          if (stderrBuf) {
            pushLog({ type: "line", slot: "stderr", value: stderrBuf.endsWith("\n") ? stderrBuf : stderrBuf + "\n" });
          }
        } catch {
          // demux error - ignore
        } finally {
          logDone = true;
          pushLog({ type: "end" });
        }
      })();

      // Resolve the published host port
      const hostPort = await this._waitForHostPort(container);

      // Wait for the server to become TCP-reachable
      const ready = await this._waitForServerReady(
        this.hostIp,
        hostPort,
        container,
        this.readyTimeoutSeconds,
      );
      if (!ready) {
        throw new Error(
          `Server did not become ready on ${this.hostIp}:${hostPort}`,
        );
      }

      // Yield the endpoint as the first message
      const endpoint = `${this.scheme}://${this.hostIp}:${hostPort}${this.endpointPath}`;
      yield ["endpoint", endpoint];

      // Start timeout timer
      if (this.timeoutSeconds > 0) {
        timeoutHandle = setTimeout(() => {
          container.remove({ force: true }).catch(() => {
            // Intentional: best-effort container cleanup on timeout
          });
        }, this.timeoutSeconds * 1000);
      }

      // Stream remaining log lines
      while (!logDone || logQueue.length > 0) {
        if (logQueue.length === 0 && !logDone) {
          await new Promise<void>((resolve) => {
            resolveLog = resolve;
          });
        }

        while (logQueue.length > 0) {
          const item = logQueue.shift()!;
          if (item.type === "end") {
            logDone = true;
          } else {
            yield [item.slot, item.value];
          }
        }
      }

      // Wait for container exit (best-effort)
      try {
        await container.wait();
      } catch {
        // ignore
      }
    } finally {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
      try {
        await container.remove({ force: true });
      } catch {
        // ignore - may already be removed
      }
    }
  }

  // ---- Private helpers ----------------------------------------------------

  /**
   * Poll Docker for the published host port of the container.
   */
  private async _waitForHostPort(
    container: Dockerode.Container,
    timeout = 20_000,
  ): Promise<number> {
    const deadline = Date.now() + timeout;
    const portKey = `${this.containerPort}/tcp`;

    while (Date.now() < deadline) {
      try {
        const info = await container.inspect();
        const state = info.State;
        if (state && state.Status === "exited") {
          throw new Error("Container exited before port was published");
        }

        const ports = info.NetworkSettings?.Ports;
        if (ports) {
          const bindings = ports[portKey];
          if (
            Array.isArray(bindings) &&
            bindings.length > 0 &&
            bindings[0].HostPort
          ) {
            return parseInt(bindings[0].HostPort, 10);
          }
        }
      } catch (e) {
        // If the error is our own "exited" error, re-throw it immediately
        if (e instanceof Error && e.message.includes("exited before port")) {
          throw e;
        }
        // Otherwise keep polling
      }
      await sleep(200);
    }
    throw new Error(
      "Failed to resolve published host port for server container",
    );
  }

  /**
   * TCP-probe `host:port` until the server accepts a connection or timeout.
   */
  private async _waitForServerReady(
    host: string,
    port: number,
    container: Dockerode.Container,
    timeoutSeconds: number,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutSeconds * 1000;

    while (Date.now() < deadline) {
      const ok = await tcpProbe(host, port, 1000);
      if (ok) return true;

      // If the container stopped, abort early
      try {
        const info = await container.inspect();
        const status = info.State?.Status;
        if (
          status &&
          status !== "created" &&
          status !== "restarting" &&
          status !== "running"
        ) {
          break;
        }
      } catch {
        // ignore
      }
      await sleep(200);
    }
    return false;
  }
}
