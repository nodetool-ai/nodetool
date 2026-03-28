// nodetool/electron/src/WorkspaceDevServer.ts
import { spawn, ChildProcess } from 'child_process';
import http from 'http';
import path from 'path';
import { BrowserWindow } from 'electron';
import { IpcChannels, DevServerStatus } from './types.d';

export type { DevServerStatus };

interface DevServerEntry {
  process: ChildProcess;
  port: number;
  logs: string[];
  status: DevServerStatus;
  respawnAttempts: number;
}

const MAX_LOGS = 100;
const MAX_RESPAWN_ATTEMPTS = 3;
const RESPAWN_BACKOFF_MS = 2000;
const SPAWN_TIMEOUT_MS = 60_000;

export class WorkspaceDevServer {
  private servers = new Map<string, DevServerEntry>();

  private broadcastStatus(workspacePath: string, status: DevServerStatus, port: number | null) {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IpcChannels.WORKSPACE_SERVER_STATUS_CHANGE, { workspacePath, status, port });
    }
  }

  private killPort(port: number): Promise<void> {
    return new Promise((resolve) => {
      const cmd = process.platform === 'win32'
        ? `FOR /F "tokens=5" %a IN ('netstat -aon ^| findstr :${port}') DO taskkill /F /PID %a`
        : `lsof -ti:${port} | xargs kill -9`;
      require('child_process').exec(cmd, () => resolve());
    });
  }

  async spawn(workspacePath: string, port: number): Promise<number> {
    // Free the port before starting so stale processes from previous sessions
    // never cause EADDRINUSE.
    await this.killPort(port);

    return new Promise((resolve, reject) => {
      const respawnAttempts = this.servers.get(workspacePath)?.respawnAttempts ?? 0;

      const proc = spawn('npm', ['run', 'dev', '--', '--port', String(port)], {
        cwd: workspacePath,
        env: { ...process.env },
        shell: false,
      });

      const entry: DevServerEntry = {
        process: proc,
        port,
        logs: [],
        status: 'starting',
        respawnAttempts,
      };
      this.servers.set(workspacePath, entry);

      const appendLog = (text: string) => {
        const line = text.trim();
        if (!line) return;
        entry.logs.push(line);
        if (entry.logs.length > MAX_LOGS) entry.logs.shift();
        // Stream to all renderer windows
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send(IpcChannels.WORKSPACE_SERVER_LOG_STREAM, { workspacePath, line });
        }
      };

      const timeoutHandle = setTimeout(() => {
        if (entry.status === 'starting') {
          entry.status = 'error';
          proc.kill('SIGTERM');
          reject(new Error(`Dev server did not become ready within ${SPAWN_TIMEOUT_MS / 1000}s`));
        }
      }, SPAWN_TIMEOUT_MS);

      let pollInterval: ReturnType<typeof setInterval> | null = null;

      const settle = (fn: () => void) => {
        clearTimeout(timeoutHandle);
        if (pollInterval !== null) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
        fn();
      };

      proc.stdout!.on('data', (data: Buffer) => appendLog(data.toString()));
      proc.stderr!.on('data', (data: Buffer) => appendLog(data.toString()));

      // Poll the health endpoint instead of parsing log output — more reliable
      // across Next.js versions, Turbopack, and ANSI-coloured terminal output.
      const pingPort = (p: number): Promise<boolean> =>
        new Promise((res) => {
          const req = http.get(`http://localhost:${p}/`, (response) => {
            response.resume();
            res(true); // Any HTTP response means the server is accepting connections
          });
          req.setTimeout(800, () => { req.destroy(); res(false); });
          req.on('error', () => res(false));
        });

      const POLL_INTERVAL_MS = 500;
      pollInterval = setInterval(() => {
        if (entry.status !== 'starting') {
          clearInterval(pollInterval!);
          pollInterval = null;
          return;
        }
        pingPort(port).then((ok) => {
          if (ok && entry.status === 'starting') {
            entry.status = 'running';
            entry.respawnAttempts = 0;
            this.broadcastStatus(workspacePath, 'running', port);
            settle(() => resolve(port));
          }
        });
      }, POLL_INTERVAL_MS);

      proc.on('error', (err: Error) => {
        if (entry.status === 'starting') {
          entry.status = 'error';
          this.broadcastStatus(workspacePath, 'error', null);
          settle(() => reject(err));
        }
      });

      proc.on('exit', (code: number | null) => {
        if (entry.status === 'starting') {
          entry.status = 'error';
          settle(() => reject(new Error(`next dev exited with code ${code} before ready`)));
          return;
        }
        if (entry.status === 'running') {
          // Unexpected crash — attempt auto-respawn
          entry.status = 'error';
          if (entry.respawnAttempts < MAX_RESPAWN_ATTEMPTS) {
            entry.respawnAttempts++;
            setTimeout(() => {
              if (this.servers.get(workspacePath) === entry) {
                this.spawn(workspacePath, port).catch(() => {
                  // Exhausted retries; status stays 'error'
                });
              }
            }, RESPAWN_BACKOFF_MS);
          }
        }
      });
    });
  }

  async kill(workspacePath: string): Promise<void> {
    const entry = this.servers.get(workspacePath);
    if (!entry) return;
    entry.status = 'stopped';
    this.servers.delete(workspacePath);
    entry.process?.kill('SIGTERM');
  }

  async respawn(workspacePath: string, port: number): Promise<number> {
    await this.kill(workspacePath);
    return this.spawn(workspacePath, port);
  }

  isRunning(workspacePath: string): boolean {
    return this.servers.get(workspacePath)?.status === 'running';
  }

  getPort(workspacePath: string): number | null {
    const entry = this.servers.get(workspacePath);
    return entry && entry.status !== 'stopped' ? entry.port : null;
  }

  getStatus(workspacePath: string): DevServerStatus {
    return this.servers.get(workspacePath)?.status ?? 'stopped';
  }

  getLogs(workspacePath: string): string[] {
    return [...(this.servers.get(workspacePath)?.logs ?? [])];
  }

  async ensureInstalled(workspacePath: string): Promise<void> {
    const nodeModulesPath = path.join(workspacePath, 'node_modules');
    const fs = await import('fs/promises');
    try {
      await fs.access(nodeModulesPath);
    } catch {
      // node_modules absent — run npm install
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('npm', ['install'], {
          cwd: workspacePath,
          env: { ...process.env },
          shell: false,
        });
        proc.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`npm install failed (code ${code})`)));
        proc.on('error', reject);
      });
    }
  }

  killAll(): void {
    for (const [p] of this.servers) {
      this.kill(p);
    }
  }
}

export const workspaceDevServer = new WorkspaceDevServer();
