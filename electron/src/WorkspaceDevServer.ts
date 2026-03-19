// nodetool/electron/src/WorkspaceDevServer.ts
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

export type DevServerStatus = 'starting' | 'running' | 'error' | 'stopped';

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

export class WorkspaceDevServer {
  private servers = new Map<string, DevServerEntry>();

  spawn(workspacePath: string, port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const entry: DevServerEntry = {
        process: null as any,
        port,
        logs: [],
        status: 'starting',
        respawnAttempts: this.servers.get(workspacePath)?.respawnAttempts ?? 0,
      };
      this.servers.set(workspacePath, entry);

      const proc = spawn('npm', ['run', 'dev', '--', '--port', String(port)], {
        cwd: workspacePath,
        env: { ...process.env },
        shell: false,
      });
      entry.process = proc;

      const appendLog = (text: string) => {
        const line = text.trim();
        if (!line) return;
        entry.logs.push(line);
        if (entry.logs.length > MAX_LOGS) entry.logs.shift();
      };

      proc.stdout!.on('data', (data: Buffer) => {
        const text = data.toString();
        appendLog(text);
        if (
          entry.status === 'starting' &&
          (text.includes('✓ Ready') || text.includes('ready started'))
        ) {
          entry.status = 'running';
          entry.respawnAttempts = 0;
          resolve(port);
        }
      });

      proc.stderr!.on('data', (data: Buffer) => appendLog(data.toString()));

      proc.on('error', (err: Error) => {
        if (entry.status === 'starting') {
          entry.status = 'error';
          reject(err);
        }
      });

      proc.on('exit', (code: number | null) => {
        if (entry.status === 'starting') {
          entry.status = 'error';
          reject(new Error(`next dev exited with code ${code} before ready`));
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
    entry.process.kill('SIGTERM');
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
