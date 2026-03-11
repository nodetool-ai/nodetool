import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AbstractStorage } from "./abstract-storage.js";

export class FileStorage implements AbstractStorage {
  constructor(private readonly baseDir: string) {}

  private resolvePath(key: string): string {
    const resolved = path.resolve(this.baseDir, key);
    if (!resolved.startsWith(path.resolve(this.baseDir))) {
      throw new Error(`Path traversal detected: ${key}`);
    }
    return resolved;
  }

  async upload(key: string, data: Buffer | Uint8Array): Promise<void> {
    const filePath = this.resolvePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
  }

  async download(key: string): Promise<Buffer> {
    const filePath = this.resolvePath(key);
    try {
      return await fs.readFile(filePath);
    } catch (err: any) {
      if (err.code === "ENOENT") {
        throw new Error(`Key not found: ${key}`, { cause: err });
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    await fs.unlink(filePath);
  }

  getUrl(key: string): string {
    const filePath = this.resolvePath(key);
    return `file://${filePath}`;
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.resolvePath(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
