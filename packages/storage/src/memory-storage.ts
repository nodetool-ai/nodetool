import type { AbstractStorage } from "./abstract-storage.js";

export class MemoryStorage implements AbstractStorage {
  private store = new Map<string, Buffer>();

  async upload(key: string, data: Buffer | Uint8Array): Promise<void> {
    this.store.set(key, Buffer.from(data));
  }

  async download(key: string): Promise<Buffer> {
    const data = this.store.get(key);
    if (!data) {
      throw new Error(`Key not found: ${key}`);
    }
    return data;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  getUrl(key: string): string {
    return `memory://${key}`;
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }
}
