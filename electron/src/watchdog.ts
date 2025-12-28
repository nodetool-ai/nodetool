import { ChildProcess, spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import net from "net";
import { logMessage } from "./logger";

export interface WatchdogOptions {
  name: string;
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  pidFilePath: string;
  healthUrl: string; // HTTP endpoint for health checks (e.g., "http://127.0.0.1:8000/health")
  healthPort?: number; // Port to check for TCP connectivity during startup (optional, extracted from healthUrl if not provided)
  healthHost?: string; // Host to check for TCP connectivity (defaults to '127.0.0.1')
  healthCheckIntervalMs?: number;
  gracefulStopTimeoutMs?: number;
  onOutput?: (line: string) => void;
  logOutput?: boolean;
}

export class Watchdog {
  private opts: WatchdogOptions;
  private process: ChildProcess | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private stopped = false;

  private healthPort: number;
  private healthHost: string;

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
    if (!this.process) return;

    try {
      this.process.kill("SIGTERM");
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

    if (this.process && !this.process.killed) {
      try {
        this.process.kill("SIGKILL");
      } catch (error) {
        logMessage(
          `${this.opts.name} watchdog: error sending SIGKILL: ${(error as Error).message
          }`
        );
      }
    }

    this.process = null;
    await this.removePidFile();
  }

  async killImmediately(): Promise<void> {
    this.stopped = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.process) {
      try {
        this.process.kill("SIGKILL");
      } catch (error) {
        logMessage(
          `${this.opts.name} watchdog: error sending SIGKILL: ${(error as Error).message
          }`
        );
      }
    }
    this.process = null;
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
            `${this.opts.name} watchdog: process died before becoming reachable (pid=${this.process?.pid})`
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
            `${this.opts.name} watchdog: process died before health check passed (pid=${this.process?.pid})`
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
    logMessage(
      `${this.opts.name} watchdog: starting: ${this.opts.command
      } ${this.opts.args.join(" ")}`
    );
    logMessage(
      `${this.opts.name} watchdog: environment variables: ${JSON.stringify(
        Object.keys(this.opts.env || {}).slice(0, 10)
      )}...`
    );

    try {
      this.process = spawn(this.opts.command, this.opts.args, {
        stdio: "pipe",
        shell: false,
        env: this.opts.env,
        detached: false,
        windowsHide: true,
      });
    } catch (error) {
      logMessage(
        `${this.opts.name} watchdog: spawn failed with error: ${(error as Error).message}`,
        "error"
      );
      throw new Error(
        `${this.opts.name} watchdog: failed to spawn: ${(error as Error).message
        }`
      );
    }

    // Wait for spawn event or timeout
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `${this.opts.name} watchdog: spawn timeout - process did not spawn within 5 seconds`
          )
        );
      }, 5000);

      this.process!.on("spawn", () => {
        clearTimeout(timeout);
        logMessage(
          `${this.opts.name} watchdog: process spawned (pid=${this.process?.pid})`
        );
        if (this.process?.pid) {
          this.writePidFile(this.process.pid).catch((err) => {
            logMessage(
              `${this.opts.name} watchdog: failed to write PID file during spawn: ${(err as Error).message}`,
              "error"
            );
          });
        }
        resolve();
      });

      this.process!.on("error", (error) => {
        clearTimeout(timeout);
        logMessage(
          `${this.opts.name} watchdog: process error during spawn: ${error.message}`,
          "error"
        );
        reject(error);
      });
    });

    this.process.stdout?.on("data", (buf) => this.handleOutput(buf));
    this.process.stderr?.on("data", (buf) => this.handleOutput(buf));

    this.process.on("exit", (code, signal) => {
      logMessage(
        `${this.opts.name} watchdog: process exited (code=${code}, signal=${signal})`
      );
      // If not intentionally stopped, monitor loop will trigger restart on next tick
    });

    this.process.on("error", (error) => {
      logMessage(
        `${this.opts.name} watchdog: process error: ${error.message}`,
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

  private startMonitorLoop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(async () => {
      if (this.stopped) return;
      const pidAlive = await this.isPidAlive();
      const healthy = await this.isHealthy();

      if (!pidAlive || !healthy) {
        logMessage(
          `${this.opts.name} watchdog: detected unhealthy state (pidAlive=${pidAlive}, healthy=${healthy}), restarting...`
        );
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
    }, this.opts.healthCheckIntervalMs);
  }

  private async isPidAlive(): Promise<boolean> {
    const pid = this.process?.pid;
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
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    try {
      const res = await fetch(this.opts.healthUrl, {
        method: "GET",
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(id);
    }
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
