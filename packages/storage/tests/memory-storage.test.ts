import { describe, it, expect } from "vitest";
import { MemoryStorage } from "../src/memory-storage.js";

describe("MemoryStorage", () => {
  it("upload + download returns same bytes", async () => {
    const storage = new MemoryStorage();
    const data = Buffer.from("hello world");
    await storage.upload("test.txt", data);
    const result = await storage.download("test.txt");
    expect(result).toEqual(data);
  });

  it("upload with Uint8Array works", async () => {
    const storage = new MemoryStorage();
    const data = new Uint8Array([1, 2, 3, 4]);
    await storage.upload("binary.bin", data);
    const result = await storage.download("binary.bin");
    expect(Buffer.from(data)).toEqual(result);
  });

  it("delete + exists returns false", async () => {
    const storage = new MemoryStorage();
    await storage.upload("file.txt", Buffer.from("data"));
    expect(await storage.exists("file.txt")).toBe(true);
    await storage.delete("file.txt");
    expect(await storage.exists("file.txt")).toBe(false);
  });

  it("getUrl returns memory:// scheme", () => {
    const storage = new MemoryStorage();
    expect(storage.getUrl("path/to/file.txt")).toBe(
      "memory://path/to/file.txt"
    );
  });

  it("download of non-existent key throws", async () => {
    const storage = new MemoryStorage();
    await expect(storage.download("nonexistent")).rejects.toThrow(
      "Key not found: nonexistent"
    );
  });

  it("exists returns false for non-existent key", async () => {
    const storage = new MemoryStorage();
    expect(await storage.exists("nope")).toBe(false);
  });

  it("upload overwrites existing key", async () => {
    const storage = new MemoryStorage();
    await storage.upload("key", Buffer.from("v1"));
    await storage.upload("key", Buffer.from("v2"));
    const result = await storage.download("key");
    expect(result.toString()).toBe("v2");
  });
});
