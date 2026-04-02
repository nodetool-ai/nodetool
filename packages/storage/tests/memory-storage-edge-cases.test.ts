/**
 * Edge-case tests for MemoryStorage.
 *
 * Covers: empty buffer, multiple keys, delete non-existent key, getUrl for various keys,
 * large data, and concurrent operations.
 */

import { describe, it, expect } from "vitest";
import { MemoryStorage } from "../src/memory-storage.js";

describe("MemoryStorage edge cases", () => {
  it("handles empty buffer upload/download", async () => {
    const storage = new MemoryStorage();
    await storage.upload("empty", Buffer.alloc(0));
    const result = await storage.download("empty");
    expect(result.length).toBe(0);
  });

  it("handles multiple keys independently", async () => {
    const storage = new MemoryStorage();
    await storage.upload("a", Buffer.from("alpha"));
    await storage.upload("b", Buffer.from("beta"));
    await storage.upload("c", Buffer.from("gamma"));

    expect((await storage.download("a")).toString()).toBe("alpha");
    expect((await storage.download("b")).toString()).toBe("beta");
    expect((await storage.download("c")).toString()).toBe("gamma");
  });

  it("delete of non-existent key does not throw", async () => {
    const storage = new MemoryStorage();
    await expect(storage.delete("nonexistent")).resolves.not.toThrow();
  });

  it("exists returns false after deleting non-existent key", async () => {
    const storage = new MemoryStorage();
    await storage.delete("nope");
    expect(await storage.exists("nope")).toBe(false);
  });

  it("getUrl handles keys with special characters", () => {
    const storage = new MemoryStorage();
    expect(storage.getUrl("a/b/c")).toBe("memory://a/b/c");
    expect(storage.getUrl("key with spaces")).toBe("memory://key with spaces");
  });

  it("upload creates a copy via Buffer.from", async () => {
    const storage = new MemoryStorage();
    const data = Buffer.from("original");
    await storage.upload("key", data);

    // Mutate original buffer
    data[0] = 0xff;

    // Downloaded data should be unaffected (Buffer.from creates a copy)
    const result = await storage.download("key");
    expect(result[0]).toBe("o".charCodeAt(0));
  });

  it("handles large data (1MB)", async () => {
    const storage = new MemoryStorage();
    const data = Buffer.alloc(1024 * 1024, 0xcd);
    await storage.upload("large", data);
    const result = await storage.download("large");
    expect(result.length).toBe(data.length);
  });

  it("concurrent uploads to different keys work", async () => {
    const storage = new MemoryStorage();
    await Promise.all([
      storage.upload("k1", Buffer.from("v1")),
      storage.upload("k2", Buffer.from("v2")),
      storage.upload("k3", Buffer.from("v3"))
    ]);

    expect(await storage.exists("k1")).toBe(true);
    expect(await storage.exists("k2")).toBe(true);
    expect(await storage.exists("k3")).toBe(true);
  });

  it("download returns Buffer instance", async () => {
    const storage = new MemoryStorage();
    await storage.upload("key", new Uint8Array([1, 2, 3]));
    const result = await storage.download("key");
    expect(Buffer.isBuffer(result)).toBe(true);
  });
});
