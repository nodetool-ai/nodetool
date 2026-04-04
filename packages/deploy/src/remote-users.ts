/**
 * Remote user management for self-hosted deployments.
 *
 * This module provides SSH-based user management for Docker and SSH deployments.
 * Operations are performed remotely via SSH, never transmitting plaintext tokens.
 */

import { createHash, randomUUID } from "node:crypto";
import { posix as posixPath } from "node:path";
import * as yaml from "js-yaml";

/** Shell-escape a string for safe interpolation in single-quoted POSIX contexts. */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
import type { DockerDeployment } from "./deployment-config.js";

// ============================================================================
// UserInfo type (mirrors Python's multi_user.UserInfo)
// ============================================================================

export interface UserInfo {
  user_id: string;
  username: string;
  role: "admin" | "user";
  token_hash: string;
  created_at: string;
}

interface UsersFileData {
  users: Record<string, UserInfo>;
  version: string;
}

// ============================================================================
// SSH execution helper types
// ============================================================================

export interface SSHConnectionHandle {
  /**
   * Execute a command on the remote host.
   * @returns [exitCode, stdout, stderr]
   */
  execute(
    command: string,
    options?: { check?: boolean }
  ): Promise<[number, string, string]>;
}

/**
 * Minimal SSH connection wrapper.
 *
 * Accepts a connected ssh2 `Client` instance and provides the `execute`
 * helper needed by `RemoteUserManager`. The client type is kept generic
 * (duck-typed) so that consumers can pass any ssh2-compatible client
 * without requiring the `@types/ssh2` package at compile time.
 */
export class SimpleSSHConnection implements SSHConnectionHandle {
  private readonly client: {
    exec(
      command: string,
      callback: (
        err: Error | undefined,
        stream: NodeJS.EventEmitter & { stderr: NodeJS.EventEmitter }
      ) => void
    ): void;
  };

  constructor(client: SimpleSSHConnection["client"]) {
    this.client = client;
  }

  async execute(
    command: string,
    options?: { check?: boolean }
  ): Promise<[number, string, string]> {
    const check = options?.check ?? true;

    return new Promise<[number, string, string]>((resolve, reject) => {
      this.client.exec(
        command,
        (
          err: Error | undefined,
          stream: NodeJS.EventEmitter & { stderr: NodeJS.EventEmitter }
        ) => {
          if (err) {
            reject(err);
            return;
          }

          let stdout = "";
          let stderr = "";

          stream.on("data", (data: Buffer) => {
            stdout += data.toString("utf-8");
          });
          stream.stderr.on("data", (data: Buffer) => {
            stderr += data.toString("utf-8");
          });
          stream.on("close", (code: number) => {
            if (check && code !== 0) {
              reject(
                new Error(
                  `Command failed (exit ${code}): ${command}\nSTDERR: ${stderr}`
                )
              );
              return;
            }
            resolve([code, stdout, stderr]);
          });
        }
      );
    });
  }
}

// ============================================================================
// RemoteUserManager
// ============================================================================

/**
 * Manages users on remote deployments via SSH.
 */
export class RemoteUserManager {
  private readonly usersFile: string;
  private readonly ssh: SSHConnectionHandle;

  constructor(
    deployment: DockerDeployment,
    usersFile: string,
    ssh: SSHConnectionHandle
  ) {
    void deployment; // retained for context; SSH handle passed explicitly
    this.usersFile = usersFile;
    this.ssh = ssh;
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private hashToken(token: string): string {
    return createHash("sha256").update(token, "utf-8").digest("hex");
  }

  private generateUserId(username: string): string {
    const shortId = randomUUID().replace(/-/g, "").slice(0, 8);
    return `user_${username}_${shortId}`;
  }

  private async loadRemoteUsers(): Promise<Record<string, UserInfo>> {
    try {
      const [exitCode, stdout] = await this.ssh.execute(
        `cat ${shellQuote(this.usersFile)} 2>/dev/null || echo '{}'`,
        { check: false }
      );

      if (exitCode !== 0) {
        return {};
      }

      const data = yaml.load(stdout, {
        schema: yaml.JSON_SCHEMA
      }) as Partial<UsersFileData> | null;
      return (data?.users as Record<string, UserInfo>) ?? {};
    } catch (e) {
      console.warn(`Warning: Could not load remote users: ${e}`);
      return {};
    }
  }

  private async saveRemoteUsers(
    users: Record<string, UserInfo>
  ): Promise<void> {
    // Ensure directory exists
    const usersDir = posixPath.dirname(this.usersFile);
    await this.ssh.execute(`mkdir -p ${shellQuote(usersDir)}`);

    // Prepare file content
    const content = yaml.dump(
      { users, version: "1.0" } satisfies UsersFileData,
      { flowLevel: -1 }
    );

    // Write via SSH using base64 to avoid escaping issues
    const b64Content = Buffer.from(content, "utf-8").toString("base64");
    await this.ssh.execute(
      `echo ${b64Content} | base64 -d > ${shellQuote(this.usersFile)}`
    );

    // Set restrictive permissions
    await this.ssh.execute(`chmod 0600 ${shellQuote(this.usersFile)}`);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Add a user to the remote deployment.
   *
   * @param username - Username to add.
   * @param role - User role ("admin" or "user").
   * @param token - Plaintext bearer token (generated locally, hashed before storage).
   */
  async addUser(
    username: string,
    role: "admin" | "user",
    token: string
  ): Promise<void> {
    const users = await this.loadRemoteUsers();

    if (username in users) {
      throw new Error(`User '${username}' already exists on remote`);
    }

    const userId = this.generateUserId(username);
    const createdAt = new Date().toISOString();

    users[username] = {
      user_id: userId,
      username,
      role,
      token_hash: this.hashToken(token),
      created_at: createdAt
    };

    await this.saveRemoteUsers(users);
  }

  /**
   * Remove a user from the remote deployment.
   */
  async removeUser(username: string): Promise<void> {
    const users = await this.loadRemoteUsers();

    if (!(username in users)) {
      throw new Error(`User '${username}' not found on remote`);
    }

    delete users[username];
    await this.saveRemoteUsers(users);
  }

  /**
   * Reset a user's token on the remote deployment.
   *
   * @param username - Username to reset.
   * @param newToken - New plaintext token (generated locally).
   */
  async resetToken(username: string, newToken: string): Promise<void> {
    const users = await this.loadRemoteUsers();

    if (!(username in users)) {
      throw new Error(`User '${username}' not found on remote`);
    }

    const existingUser = users[username]!;
    const createdAt = new Date().toISOString();

    users[username] = {
      user_id: existingUser.user_id,
      username,
      role: existingUser.role,
      token_hash: this.hashToken(newToken),
      created_at: createdAt
    };

    await this.saveRemoteUsers(users);
  }

  /**
   * List all users from the remote deployment.
   */
  async listUsers(): Promise<Record<string, UserInfo>> {
    return this.loadRemoteUsers();
  }
}
