import { ChildProcess, spawn } from "child_process";
import { utilityProcess, UtilityProcess } from "electron";
import { promises as fs } from "fs";
import path from "path";
import net from "net";
import { logMessage } from "./logger";
import { probeHttpOk } from "./httpProbe";

interface WatchdogOptionsBase {
  name: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  pidFilePath: string;
  healthUrl: string; // HTTP endpoint for health checks (e.g., "http://127.0.0.1:7777/health")
  healthPort?: number; // Port to check for TCP connectivity during startup (optional, extracted from healthUrl if not provided)
  healthHost?: string; // Host to check for TCP connectivity (defaults to '127.0.0.1')
  healthCheckIntervalMs?: number;
  gracefulStopTimeoutMs?: number;
  onOutput?: (line: string) => void;
  logOutput?: boolean;
}

/** Spawn an external command (e.g. ollama, llama-server) via child_process. */
export interface SpawnWatchdogOptions extends WatchdogOptionsBase {
  command: string;
  args: string[];
  modulePath?: never;
}

/** Fork a Node.js module inside Electron's utilityProcess. */
export interface ForkWatchdogOptions extends WatchdogOptionsBase {
  modulePath: string;
  args?: string[];
  command?: never;
}

export type WatchdogOptions = SpawnWatchdogOptions | ForkWatchdogOptions;

export class Watchdog {
  private opts: WatchdogOptions;
  private childProcess: ChildProcess | null = null;
  private utilProcess: UtilityProcess | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private stopped = false;

  private healthPort: number;
  private healthHost: string;

  private get isForkMode(): boolean {
    return "modulePath" in this.opts && !!this.opts.modulePath;
  }

  private get processPid(): number | undefined {
    return this.childProcess?.pid ?? this.utilProcess?.pid ?? undefined;
  }

  constructor(options: WatchdogOptions) {
    // Extract port and host from healthUrl if not explicitly provided
    let healthPort = options.healthPort;
    let healthHost = options.healthHost || "127.0.0.1";

    if (!healthPort) {
      try {
        const url = new URL(options.healthUrl);
        healthPort = parseInt(url.port, 10);
        if (isNaN(healthPort)) {
          // Default ports based on protocol
          healthPort = url.protocol === "https:" ? 443 : 80;
        }
        healthHost = url.hostname;
      } catch {
        // If URL parsing fails, try to extract port from common patterns
        const portMatch = options.healthUrl.match(/:(\d+)/);
        if (portMatch) {
          healthPort = parseInt(portMatch[1], 10);
        } else {
          throw new Error(
            `${options.name} watchdog: Could not extract port from healthUrl: ${options.healthUrl}`
          );
        }
      }
    }

    this.healthPort = healthPort;
    this.healthHost = healthHost;

    this.opts = {
      healthCheckIntervalMs: 30000, // 30 seconds - reasonable frequency for health checks
      gracefulStopTimeoutMs: 30000,
      ...options,
    };
  }

  async start(): Promise<void> {
    this.stopped = false;
    logMessage(`${this.opts.name} watchdog: spawning process...`);
    await this.spawnProcess();
    logMessage(`${this.opts.name} watchdog: process spawned, waiting for health check...`);
    await this.waitUntilHealthy();
    logMessage(`${this.opts.name} watchdog: health check passed, starting monitor loop...`);
    this.startMonitorLoop();
    logMessage(`${this.opts.name} watchdog: started successfully`);
  }

  async restart(): Promise<void> {
    await this.stopGracefully();
    await this.start();
  }

  async stopGracefully(): Promise<void> {
    this.stopped = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (!this.childProcess && !this.utilProcess) return;

    try {
      if (this.utilProcess) {
        this.utilProcess.kill();
      } else if (this.childProcess) {
        this.childProcess.kill("SIGTERM");
      }
    } catch (error) {
      logMessage(
        `${this.opts.name} watchdog: error sending SIGTERM: ${(error as Error).message
        }`
      );
    }
    // Wait until the process exits, but don't wait longer than the graceful timeout
    const start = Date.now();
    const timeoutMs = this.opts.gracefulStopTimeoutMs as number;
    while (Date.now() - start < timeoutMs) {
      const stillAlive = await this.isPidAlive();
      if (!stillAlive) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    if (this.childProcess && !this.childProcess.killed) {
      try {
        this.childProcess.kill("SIGKILL");
      } catch (error) {
        logMessage(
          `${this.opts.name} watchdog: error sending SIGKILL: ${(error as Error).message
          }`
        );
      }
    }
    // utilityProcess.kill() already sends SIGTERM; if still alive, force-kill via pid
    if (this.utilProcess && this.utilProcess.pid) {
      try {
        process.kill(this.utilProcess.pid, "SIGKILL");
      } catch {
        // already dead
      }
    }

    this.childProcess = null;
    this.utilProcess = null;
    await this.removePidFile();
  }

  async killImmediately(): Promise<void> {
    this.stopped = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    const pid = this.processPid;
    if (pid) {
      try {
        process.kill(pid, "SIGKILL");
      } catch (error) {
        logMessage(
          `${this.opts.name} watchdog: error sending SIGKILL: ${(error as Error).message
          }`
        );
      }
    }
    this.childProcess = null;
    this.utilProcess = null;
    await this.removePidFile();
  }

  async waitUntilHealthy(timeoutMs: number = 300000): Promise<void> {
    const start = Date.now();
    let checkCount = 0;
    let reachableCheckCount = 0;
    const logInterval = 5000; // Log every 5 seconds
    let lastLogTime = start;
    let isReachable = false;

    // Phase 1: Wait for TCP connectivity (server is starting to listen)
    while (Date.now() - start < timeoutMs) {
      reachableCheckCount++;
      const reachable = await this.isReachable();
      if (reachable) {
        isReachable = true;
        logMessage(
          `${this.opts.name} watchdog: TCP connectivity established after ${reachableCheckCount} attempts (${Date.now() - start}ms)`
        );
        break;
      }

      // Log progress every 5 seconds
      const now = Date.now();
      if (now - lastLogTime >= logInterval) {
        const elapsed = Math.round((now - start) / 1000);
        const remaining = Math.round((timeoutMs - (now - start)) / 1000);
        logMessage(
          `${this.opts.name} watchdog: waiting for TCP connectivity... (${elapsed}s elapsed, ${remaining}s remaining, ${reachableCheckCount} attempts)`
        );
        lastLogTime = now;

        // Check if process is still alive
        const pidAlive = await this.isPidAlive();
        if (!pidAlive) {
          throw new Error(
            `${this.opts.name} watchdog: process died before becoming reachable (pid=${this.processPid})`
          );
        }
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    if (!isReachable) {
      const pidAlive = await this.isPidAlive();
      throw new Error(
        `${this.opts.name} watchdog: TCP connectivity check timed out after ${timeoutMs}ms (pidAlive=${pidAlive}, checkCount=${reachableCheckCount})`
      );
    }

    // Phase 2: Wait for HTTP health endpoint to respond (server is fully ready)
    lastLogTime = Date.now();
    while (Date.now() - start < timeoutMs) {
      checkCount++;
      const healthy = await this.isHealthy();
      if (healthy) {
        logMessage(
          `${this.opts.name} watchdog: health check passed after ${checkCount} attempts (${Date.now() - start}ms total)`
        );
        return;
      }

      // Log progress every 5 seconds
      const now = Date.now();
      if (now - lastLogTime >= logInterval) {
        const elapsed = Math.round((now - start) / 1000);
        const remaining = Math.round((timeoutMs - (now - start)) / 1000);
        logMessage(
          `${this.opts.name} watchdog: waiting for health endpoint... (${elapsed}s elapsed, ${remaining}s remaining, ${checkCount} attempts)`
        );
        lastLogTime = now;

        // Check if process is still alive
        const pidAlive = await this.isPidAlive();
        if (!pidAlive) {
          throw new Error(
            `${this.opts.name} watchdog: process died before health check passed (pid=${this.processPid})`
          );
        }
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    const pidAlive = await this.isPidAlive();
    throw new Error(
      `${this.opts.name} watchdog: health check timed out after ${timeoutMs}ms (pidAlive=${pidAlive}, checkCount=${checkCount})`
    );
  }

  private async spawnProcess(): Promise<void> {
    if (this.isForkMode) {
      await this.forkUtilityProcess();
    } else {
      await this.spawnChildProcess();
    }
  }

  /** Fork the backend via Electron's utilityProcess (uses Electron's Node.js). */
  private async forkUtilityProcess(): Promise<void> {
    const opts = this.opts as ForkWatchdogOptions;
    logMessage(
      `${opts.name} watchdog: forking utilityProcess: ${opts.modulePath} ${(opts.args ?? []).join(" ")}`
    );
    logMessage(
      `${opts.name} watchdog: environment variables: ${JSON.stringify(
        Object.keys(opts.env || {}).slice(0, 10)
      )}...`
    );

    try {
      this.utilProcess = utilityProcess.fork(opts.modulePath, opts.args ?? [], {
        stdio: "pipe",
        env: opts.env as Record<string, string>,
        cwd: opts.cwd,
        serviceName: opts.name,
      });
    } catch (error) {
      logMessage(
        `${opts.name} watchdog: fork failed with error: ${(error as Error).message}`,
        "error"
      );
      throw new Error(
        `${opts.name} watchdog: failed to fork: ${(error as Error).message}`
      );
    }

    // Wait for spawn event or timeout
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `${opts.name} watchdog: spawn timeout - utilityProcess did not spawn within 5 seconds`
          )
        );
      }, 5000);

      this.utilProcess!.on("spawn", () => {
        clearTimeout(timeout);
        logMessage(
          `${opts.name} watchdog: utilityProcess spawned (pid=${this.utilProcess?.pid})`
        );
        if (this.utilProcess?.pid) {
          this.writePidFile(this.utilProcess.pid).catch((err) => {
            logMessage(
              `${opts.name} watchdog: failed to write PID file during spawn: ${(err as Error).message}`,
              "error"
            );
          });
        }
        resolve();
      });
    });

    this.utilProcess.stdout?.on("data", (buf: Buffer) => this.handleOutput(buf));
    this.utilProcess.stderr?.on("data", (buf: Buffer) => this.handleOutput(buf));

    this.utilProcess.on("exit", (code: number) => {
      logMessage(
        `${opts.name} watchdog: utilityProcess exited (code=${code})`
      );
    });
  }

  /** Spawn an external command via child_process (e.g. ollama, llama-server). */
  private async spawnChildProcess(): Promise<void> {
    const opts = this.opts as SpawnWatchdogOptions;
    logMessage(
      `${opts.name} watchdog: starting: ${opts.command} ${opts.args.join(" ")}`
    );
    logMessage(
      `${opts.name} watchdog: environment variables: ${JSON.stringify(
        Object.keys(opts.env || {}).slice(0, 10)
      )}...`
    );

    try {
      this.childProcess = spawn(opts.command, opts.args, {
        stdio: "pipe",
        shell: false,
        env: opts.env,
        cwd: opts.cwd,
        detached: false,
        windowsHide: true,
      });
    } catch (error) {
      logMessage(
        `${opts.name} watchdog: spawn failed with error: ${(error as Error).message}`,
        "error"
      );
      throw new Error(
        `${opts.name} watchdog: failed to spawn: ${(error as Error).message}`
      );
    }

    // Wait for spawn event or timeout
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `${opts.name} watchdog: spawn timeout - process did not spawn within 5 seconds`
          )
        );
      }, 5000);

      this.childProcess!.on("spawn", () => {
        clearTimeout(timeout);
        logMessage(
          `${opts.name} watchdog: process spawned (pid=${this.childProcess?.pid})`
        );
        if (this.childProcess?.pid) {
          this.writePidFile(this.childProcess.pid).catch((err) => {
            logMessage(
              `${opts.name} watchdog: failed to write PID file during spawn: ${(err as Error).message}`,
              "error"
            );
          });
        }
        resolve();
      });

      this.childProcess!.on("error", (error) => {
        clearTimeout(timeout);
        logMessage(
          `${opts.name} watchdog: process error during spawn: ${error.message}`,
          "error"
        );
        reject(error);
      });
    });

    this.childProcess.stdout?.on("data", (buf) => this.handleOutput(buf));
    this.childProcess.stderr?.on("data", (buf) => this.handleOutput(buf));

    this.childProcess.on("exit", (code, signal) => {
      logMessage(
        `${opts.name} watchdog: process exited (code=${code}, signal=${signal})`
      );
    });

    this.childProcess.on("error", (error) => {
      logMessage(
        `${opts.name} watchdog: process error: ${error.message}`,
        "error"
      );
    });
  }

  private handleOutput(buf: Buffer) {
    const out = buf.toString().trim();
    if (out) {
      if (this.opts.logOutput !== false) {
        logMessage(out);
      }
      if (this.opts.onOutput) this.opts.onOutput(out);
    }
  }

  private _checkInProgress = false;
  private _consecutiveFailures = 0;
  private static readonly MAX_CONSECUTIVE_FAILURES = 3;

  private startMonitorLoop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(async () => {
      if (this.stopped || this._checkInProgress) return;
      this._checkInProgress = true;
      try {
        const pidAlive = await this.isPidAlive();
        const healthy = await this.isHealthy();

        if (!pidAlive) {
          this._consecutiveFailures = 0;
          logMessage(
            `${this.opts.name} watchdog: process died (pidAlive=false), restarting...`
          );
        } else if (!healthy) {
          this._consecutiveFailures++;
          if (this._consecutiveFailures < Watchdog.MAX_CONSECUTIVE_FAILURES) {
            logMessage(
              `${this.opts.name} watchdog: health check failed (${this._consecutiveFailures}/${Watchdog.MAX_CONSECUTIVE_FAILURES}), will retry...`
            );
            return;
          }
          logMessage(
            `${this.opts.name} watchdog: detected unhealthy state after ${this._consecutiveFailures} consecutive failures, restarting...`
          );
        }

        if (pidAlive && healthy) {
          this._consecutiveFailures = 0;
        } else if (!pidAlive || (this._consecutiveFailures >= Watchdog.MAX_CONSECUTIVE_FAILURES)) {
          this._consecutiveFailures = 0;
          try {
            await this.restart();
          } catch (error) {
            logMessage(
              `${this.opts.name} watchdog: restart failed: ${(error as Error).message
              }`,
              "error"
            );
          }
        }
      } finally {
        this._checkInProgress = false;
      }
    }, this.opts.healthCheckIntervalMs);
  }

  private async isPidAlive(): Promise<boolean> {
    const pid = this.processPid;
    if (!pid) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks TCP connectivity to the server port.
   * Used during startup to detect when the server becomes reachable.
   */
  private async isReachable(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      const timeout = 2000; // 2 second timeout for TCP connection
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
        }
      };

      socket.setTimeout(timeout);
      socket.once("timeout", () => {
        cleanup();
        resolve(false);
      });

      socket.once("error", () => {
        cleanup();
        resolve(false);
      });

      socket.once("connect", () => {
        cleanup();
        resolve(true);
      });

      socket.connect(this.healthPort, this.healthHost);
    });
  }

  /**
   * Checks HTTP health endpoint to verify the server is fully operational.
   * Used for ongoing health monitoring.
   */
  private async isHealthy(): Promise<boolean> {
    return probeHttpOk(this.opts.healthUrl, { timeoutMs: 15000 });
  }

  private async writePidFile(pid: number): Promise<void> {
    try {
      const pidDir = path.dirname(this.opts.pidFilePath);
      await fs.mkdir(pidDir, { recursive: true });
      await fs.writeFile(this.opts.pidFilePath, String(pid));
      logMessage(
        `${this.opts.name} watchdog: wrote PID ${pid} to ${this.opts.pidFilePath}`
      );
    } catch (error) {
      logMessage(
        `${this.opts.name} watchdog: failed to write PID file: ${(error as Error).message
        }`,
        "error"
      );
    }
  }

  private async removePidFile(): Promise<void> {
    try {
      await fs.unlink(this.opts.pidFilePath);
    } catch {
      // ignore
    }
  }
}
