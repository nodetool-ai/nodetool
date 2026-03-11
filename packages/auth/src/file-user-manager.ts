/**
 * FileUserManager — file-based persistent user management.
 *
 * Port of Python's `nodetool.security.user_manager.UserManager`.
 * Stores users in a JSON file at `~/.config/nodetool/users.json` by default.
 */

import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface UserRecord {
  id: string;
  username: string;
  role: string;
  tokenHash: string;
  createdAt: string;
}

export interface UsersFile {
  version: string;
  users: Record<string, UserRecord>;
}

export interface CreateUserResult {
  username: string;
  userId: string;
  role: string;
  token: string;
  createdAt: string;
}

function defaultUsersFilePath(): string {
  const envPath = process.env.USERS_FILE;
  if (envPath) return envPath;
  const platform = process.platform;
  if (platform === "win32") {
    const appdata = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(appdata, "nodetool", "users.json");
  }
  return join(homedir(), ".config", "nodetool", "users.json");
}

export class FileUserManager {
  private usersFile: string;

  constructor(usersFile?: string) {
    this.usersFile = usersFile ?? defaultUsersFilePath();
  }

  private async load(): Promise<UsersFile> {
    try {
      const data = await readFile(this.usersFile, "utf8");
      return JSON.parse(data) as UsersFile;
    } catch {
      return { version: "1.0", users: {} };
    }
  }

  private async save(data: UsersFile): Promise<void> {
    await mkdir(dirname(this.usersFile), { recursive: true });
    await writeFile(this.usersFile, JSON.stringify(data, null, 2), "utf8");
  }

  private generateToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private generateUserId(username: string): string {
    return `user_${username}_${randomBytes(4).toString("hex")}`;
  }

  async addUser(username: string, role = "user"): Promise<CreateUserResult> {
    const data = await this.load();
    if (data.users[username]) {
      throw new Error(`User '${username}' already exists`);
    }
    const token = this.generateToken();
    const userId = this.generateUserId(username);
    const createdAt = new Date().toISOString();
    data.users[username] = { id: userId, username, role, tokenHash: this.hashToken(token), createdAt };
    await this.save(data);
    return { username, userId, role, token, createdAt };
  }

  async removeUser(username: string): Promise<void> {
    const data = await this.load();
    if (!data.users[username]) {
      throw new Error(`User '${username}' not found`);
    }
    delete data.users[username];
    await this.save(data);
  }

  async resetToken(username: string): Promise<CreateUserResult> {
    const data = await this.load();
    const existing = data.users[username];
    if (!existing) {
      throw new Error(`User '${username}' not found`);
    }
    const token = this.generateToken();
    const createdAt = new Date().toISOString();
    data.users[username] = { ...existing, tokenHash: this.hashToken(token), createdAt };
    await this.save(data);
    return { username, userId: existing.id, role: existing.role, token, createdAt };
  }

  async listUsers(): Promise<Record<string, UserRecord>> {
    const data = await this.load();
    return data.users;
  }

  async getUser(username: string): Promise<UserRecord | null> {
    const data = await this.load();
    return data.users[username] ?? null;
  }
}
