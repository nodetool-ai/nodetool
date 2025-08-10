import { ChildProcess, spawn } from "child_process";
import { promises as fs } from "fs";
import { logMessage } from "./logger";

export interface WatchdogOptions {
  name: string;
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  pidFilePath: string;
  healthUrl: string;
  healthCheckIntervalMs?: number;
  gracefulStopTimeoutMs?: number;
  onOutput?: (line: string) => void;
}

export class Watchdog {
  private opts: WatchdogOptions;
  private process: ChildProcess | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(options: WatchdogOptions) {
    this.opts = {
      healthCheckIntervalMs: 10000,
      gracefulStopTimeoutMs: 30000,
      ...options,
    };
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.spawnProcess();
    await this.waitUntilHealthy();
    this.startMonitorLoop();
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
        `${this.opts.name} watchdog: error sending SIGTERM: ${(error as Error).message}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, this.opts.gracefulStopTimeoutMs));

    if (this.process && !this.process.killed) {
      try {
        this.process.kill("SIGKILL");
      } catch (error) {
        logMessage(
          `${this.opts.name} watchdog: error sending SIGKILL: ${(error as Error).message}`
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
          `${this.opts.name} watchdog: error sending SIGKILL: ${(error as Error).message}`
        );
      }
    }
    this.process = null;
    await this.removePidFile();
  }

  async waitUntilHealthy(timeoutMs: number = 60000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this.isHealthy()) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`${this.opts.name} watchdog: health check timed out`);
  }

  private async spawnProcess(): Promise<void> {
    logMessage(
      `${this.opts.name} watchdog: starting: ${this.opts.command} ${this.opts.args.join(
        " "
      )}`
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
      throw new Error(
        `${this.opts.name} watchdog: failed to spawn: ${(error as Error).message}`
      );
    }

    this.process.on("spawn", () => {
      logMessage(`${this.opts.name} watchdog: process spawned (pid=${this.process?.pid})`);
      if (this.process?.pid) {
        this.writePidFile(this.process.pid).catch(() => {});
      }
    });

    this.process.stdout?.on("data", (buf) => this.handleOutput(buf));
    this.process.stderr?.on("data", (buf) => this.handleOutput(buf));

    this.process.on("exit", (code, signal) => {
      logMessage(`${this.opts.name} watchdog: process exited (code=${code}, signal=${signal})`);
      // If not intentionally stopped, monitor loop will trigger restart on next tick
    });

    this.process.on("error", (error) => {
      logMessage(`${this.opts.name} watchdog: process error: ${error.message}`, "error");
    });
  }

  private handleOutput(buf: Buffer) {
    const out = buf.toString().trim();
    if (out) {
      logMessage(out);
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
            `${this.opts.name} watchdog: restart failed: ${(error as Error).message}`,
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

  private async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(this.opts.healthUrl, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async writePidFile(pid: number): Promise<void> {
    try {
      await fs.writeFile(this.opts.pidFilePath, String(pid));
      logMessage(`${this.opts.name} watchdog: wrote PID ${pid} to ${this.opts.pidFilePath}`);
    } catch (error) {
      logMessage(
        `${this.opts.name} watchdog: failed to write PID file: ${(error as Error).message}`,
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


