/**
 * SSH connection management for remote deployment operations.
 *
 * This module provides a high-level interface for SSH operations including:
 * - Connection management with automatic retry
 * - Remote command execution
 * - File transfer (SFTP)
 * - Connection pooling for efficiency
 *
 * Requires the `ssh2` npm package at runtime.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// ssh2 types — we define minimal interfaces so the module compiles even when
// @types/ssh2 is not installed. At runtime the real ssh2 package is required.
// ---------------------------------------------------------------------------

interface SSH2ConnectConfig {
  host: string;
  port: number;
  username: string;
  readyTimeout: number;
  privateKey?: Buffer;
  password?: string;
  agent?: string;
}

interface SSH2Channel {
  on(event: "data", listener: (data: Buffer) => void): this;
  on(event: "close", listener: (code: number) => void): this;
  stderr: {
    on(event: "data", listener: (data: Buffer) => void): void;
  };
  close(): void;
}

interface SSH2SFTPWrapper {
  fastPut(
    localPath: string,
    remotePath: string,
    callback: (err: Error | undefined) => void
  ): void;
  fastGet(
    remotePath: string,
    localPath: string,
    callback: (err: Error | undefined) => void
  ): void;
  createWriteStream(remotePath: string): NodeJS.WritableStream;
  stat(remotePath: string, callback: (err: Error | undefined) => void): void;
  chmod(
    remotePath: string,
    mode: number,
    callback: (err: Error | undefined) => void
  ): void;
  mkdir(
    remotePath: string,
    attrs: { mode: number },
    callback: (err: Error | undefined) => void
  ): void;
  rmdir(remotePath: string, callback: (err: Error | undefined) => void): void;
  end(): void;
}

interface SSH2Client {
  on(event: "ready", listener: () => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  connect(config: SSH2ConnectConfig): void;
  exec(
    command: string,
    callback: (err: Error | undefined, channel: SSH2Channel) => void
  ): void;
  sftp(callback: (err: Error | undefined, sftp: SSH2SFTPWrapper) => void): void;
  end(): void;
}

export interface SSH2ClientConstructor {
  new (): SSH2Client;
}

// Lazy-load ssh2 so the module can be imported even if ssh2 isn't installed.
let _ClientCtor: SSH2ClientConstructor | null = null;

/**
 * Override the ssh2 Client constructor — for use in tests only.
 * Calling this bypasses the lazy require("ssh2") lookup entirely.
 */
export function _setClientCtorForTest(
  ctor: SSH2ClientConstructor | null
): void {
  _ClientCtor = ctor;
}

function getClientCtor(): SSH2ClientConstructor {
  if (!_ClientCtor) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ssh2 = require("ssh2") as { Client: SSH2ClientConstructor };
      _ClientCtor = ssh2.Client;
    } catch {
      throw new Error(
        "ssh2 is required for SSH operations. Install it with: npm install ssh2"
      );
    }
  }
  return _ClientCtor;
}

// ---------------------------------------------------------------------------
// Custom Error Classes
// ---------------------------------------------------------------------------

export class SSHConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SSHConnectionError";
  }
}

export class SSHCommandError extends Error {
  public readonly exitCode: number;
  public readonly stdout: string;
  public readonly stderr: string;

  constructor(
    message: string,
    exitCode: number,
    stdout: string,
    stderr: string
  ) {
    super(message);
    this.name = "SSHCommandError";
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

// ---------------------------------------------------------------------------
// SSH Connection Options
// ---------------------------------------------------------------------------

export interface SSHConnectionOptions {
  host: string;
  user: string;
  keyPath?: string;
  password?: string;
  port?: number;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

// ---------------------------------------------------------------------------
// SSHConnection Class
// ---------------------------------------------------------------------------

/**
 * Manages SSH connections to remote hosts with automatic retry and connection pooling.
 *
 * This class provides a high-level interface for SSH operations including
 * command execution and file transfer.
 */
export class SSHConnection {
  public readonly host: string;
  public readonly user: string;
  public readonly keyPath: string | undefined;
  public readonly password: string | undefined;
  public readonly port: number;
  public readonly timeout: number;
  public readonly retryAttempts: number;
  public readonly retryDelay: number;

  private client: SSH2Client | null = null;
  private sftp: SSH2SFTPWrapper | null = null;

  constructor(options: SSHConnectionOptions) {
    this.host = options.host;
    this.user = options.user;
    this.keyPath = options.keyPath;
    this.password = options.password;
    this.port = options.port ?? 22;
    this.timeout = options.timeout ?? 30;
    this.retryAttempts = options.retryAttempts ?? 3;
    this.retryDelay = options.retryDelay ?? 2.0;
  }

  /**
   * Establish SSH connection to the remote host.
   * Retries based on retryAttempts setting.
   */
  async connect(): Promise<void> {
    const ClientCtor = getClientCtor();

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        this.client = new ClientCtor();

        await new Promise<void>((resolve, reject) => {
          const connectConfig: SSH2ConnectConfig = {
            host: this.host,
            port: this.port,
            username: this.user,
            readyTimeout: this.timeout * 1000
          };

          if (this.keyPath) {
            const expandedPath = this.keyPath.startsWith("~")
              ? path.join(os.homedir(), this.keyPath.slice(1))
              : this.keyPath;

            if (!fs.existsSync(expandedPath)) {
              reject(
                new SSHConnectionError(`SSH key not found at ${expandedPath}`)
              );
              return;
            }
            connectConfig.privateKey = fs.readFileSync(expandedPath);
          } else if (this.password) {
            connectConfig.password = this.password;
          } else {
            // Try to use SSH agent
            connectConfig.agent = process.env.SSH_AUTH_SOCK;
          }

          this.client!.on("ready", () => resolve());
          this.client!.on("error", (err: Error) => reject(err));
          this.client!.connect(connectConfig);
        });

        return; // Connection successful
      } catch (err) {
        if (attempt < this.retryAttempts - 1) {
          await sleep(this.retryDelay * 1000);
          continue;
        }
        throw new SSHConnectionError(
          `Failed to connect to ${this.user}@${this.host}:${this.port} ` +
            `after ${this.retryAttempts} attempts: ${err}`
        );
      }
    }
  }

  /** Close SSH and SFTP connections. */
  disconnect(): void {
    if (this.sftp) {
      try {
        this.sftp.end();
      } catch {
        // ignore
      }
      this.sftp = null;
    }

    if (this.client) {
      try {
        this.client.end();
      } catch {
        // ignore
      }
      this.client = null;
    }
  }

  /** Check if SSH connection is active. */
  isConnected(): boolean {
    if (!this.client) return false;
    // Heuristic: check whether the underlying socket is writable.
    const sock = (this.client as unknown as Record<string, unknown>)._sock as
      | { writable?: boolean }
      | undefined;
    return sock?.writable === true;
  }

  /** Ensure connection is active, reconnect if necessary. */
  async ensureConnected(): Promise<void> {
    if (!this.isConnected()) {
      await this.connect();
    }
  }

  /**
   * Execute a command on the remote host.
   *
   * @returns Tuple of [exitCode, stdout, stderr]
   */
  async execute(
    command: string,
    options?: { check?: boolean; timeout?: number }
  ): Promise<[number, string, string]> {
    const check = options?.check ?? true;
    const timeout = options?.timeout ?? this.timeout;

    await this.ensureConnected();

    if (!this.client) {
      throw new SSHConnectionError("Not connected to remote host");
    }

    return new Promise<[number, string, string]>((resolve, reject) => {
      this.client!.exec(
        command,
        (err: Error | undefined, channel: SSH2Channel) => {
          if (err) {
            reject(new SSHConnectionError(`exec error: ${err.message}`));
            return;
          }

          let stdoutData = "";
          let stderrData = "";
          let timer: ReturnType<typeof setTimeout> | undefined;

          if (timeout > 0) {
            timer = setTimeout(() => {
              channel.close();
              reject(
                new SSHCommandError(
                  `Command timed out after ${timeout}s: ${command}`,
                  -1,
                  stdoutData,
                  stderrData
                )
              );
            }, timeout * 1000);
          }

          channel.on("data", (data: Buffer) => {
            stdoutData += data.toString("utf-8");
          });

          channel.stderr.on("data", (data: Buffer) => {
            stderrData += data.toString("utf-8");
          });

          channel.on("close", (exitCode: number) => {
            if (timer) clearTimeout(timer);
            const code = exitCode ?? -1;

            if (check && code !== 0) {
              const errorMsg = `Command failed with exit code ${code}: ${command}\nSTDERR:\n${stderrData}`;
              reject(
                new SSHCommandError(errorMsg, code, stdoutData, stderrData)
              );
              return;
            }

            resolve([code, stdoutData, stderrData]);
          });
        }
      );
    });
  }

  /**
   * Execute a multi-line shell script on the remote host.
   *
   * @returns Tuple of [exitCode, stdout, stderr]
   */
  async executeScript(
    script: string,
    options?: { check?: boolean; timeout?: number }
  ): Promise<[number, string, string]> {
    // Wrap script in bash with proper quoting
    const escaped = script.replace(/'/g, "'\\''");
    const command = `bash -c '${escaped}'`;
    return this.execute(command, options);
  }

  // -----------------------------------------------------------------------
  // SFTP operations
  // -----------------------------------------------------------------------

  private async getSftp(): Promise<SSH2SFTPWrapper> {
    await this.ensureConnected();

    if (!this.sftp) {
      if (!this.client) {
        throw new SSHConnectionError("Not connected to remote host");
      }

      this.sftp = await new Promise<SSH2SFTPWrapper>((resolve, reject) => {
        this.client!.sftp((err: Error | undefined, sftp: SSH2SFTPWrapper) => {
          if (err) reject(new SSHConnectionError(`SFTP error: ${err.message}`));
          else resolve(sftp);
        });
      });
    }

    return this.sftp;
  }

  /**
   * Upload a file to the remote host.
   */
  async uploadFile(
    localPath: string,
    remotePath: string,
    mode?: number
  ): Promise<void> {
    if (!fs.existsSync(localPath)) {
      throw new Error(`Local file not found: ${localPath}`);
    }

    const sftp = await this.getSftp();

    await new Promise<void>((resolve, reject) => {
      sftp.fastPut(localPath, remotePath, (err: Error | undefined) => {
        if (err) reject(err);
        else resolve();
      });
    });

    if (mode !== undefined) {
      await new Promise<void>((resolve, reject) => {
        sftp.chmod(remotePath, mode, (err: Error | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  /**
   * Upload string content as a file to the remote host.
   */
  async uploadString(
    content: string,
    remotePath: string,
    mode?: number
  ): Promise<void> {
    const sftp = await this.getSftp();

    await new Promise<void>((resolve, reject) => {
      const stream = sftp.createWriteStream(remotePath);
      stream.on("error", reject);
      stream.on("close", () => resolve());
      stream.end(content, "utf-8");
    });

    if (mode !== undefined) {
      await new Promise<void>((resolve, reject) => {
        sftp.chmod(remotePath, mode, (err: Error | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  /**
   * Download a file from the remote host.
   */
  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const sftp = await this.getSftp();

    // Ensure local directory exists
    const localDir = path.dirname(localPath);
    fs.mkdirSync(localDir, { recursive: true });

    await new Promise<void>((resolve, reject) => {
      sftp.fastGet(remotePath, localPath, (err: Error | undefined) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Check if a file exists on the remote host.
   */
  async fileExists(remotePath: string): Promise<boolean> {
    try {
      const sftp = await this.getSftp();
      await new Promise<void>((resolve, reject) => {
        sftp.stat(remotePath, (err: Error | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a directory on the remote host.
   */
  async mkdir(
    remotePath: string,
    mode: number = 0o755,
    parents: boolean = true
  ): Promise<void> {
    if (parents) {
      const parts = remotePath.split("/").filter(Boolean);
      let current = remotePath.startsWith("/") ? "/" : "";
      const sftp = await this.getSftp();

      for (const part of parts) {
        current = current ? path.posix.join(current, part) : part;
        try {
          await new Promise<void>((resolve, reject) => {
            sftp.mkdir(current, { mode }, (err: Error | undefined) => {
              if (err) reject(err);
              else resolve();
            });
          });
        } catch {
          // Directory might already exist
        }
      }
    } else {
      const sftp = await this.getSftp();
      await new Promise<void>((resolve, reject) => {
        sftp.mkdir(remotePath, { mode }, (err: Error | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  /**
   * Remove a directory on the remote host.
   */
  async rmdir(remotePath: string, recursive: boolean = false): Promise<void> {
    if (recursive) {
      const escaped = remotePath.replace(/'/g, "'\\''");
      await this.execute(`rm -rf '${escaped}'`);
    } else {
      const sftp = await this.getSftp();
      await new Promise<void>((resolve, reject) => {
        sftp.rmdir(remotePath, (err: Error | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: create an SSHConnection, connect, run a callback, then disconnect
// ---------------------------------------------------------------------------

/**
 * Convenience function: creates an SSHConnection, connects, invokes the
 * callback, and ensures disconnection afterwards.
 *
 * @example
 * ```ts
 * await withSSHConnection(
 *   { host: "192.168.1.100", user: "ubuntu", keyPath: "~/.ssh/id_rsa" },
 *   async (ssh) => {
 *     const [code, stdout, stderr] = await ssh.execute("ls -la");
 *     console.log(stdout);
 *   }
 * );
 * ```
 */
export async function withSSHConnection<T>(
  options: SSHConnectionOptions,
  fn: (conn: SSHConnection) => Promise<T>
): Promise<T> {
  const conn = new SSHConnection(options);
  try {
    await conn.connect();
    return await fn(conn);
  } finally {
    conn.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
