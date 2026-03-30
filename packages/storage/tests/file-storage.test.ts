import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { FileStorage } from "../src/file-storage.js";

describe("FileStorage", () => {
  let tmpDir: string;
  let storage: FileStorage;

  const setup = async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-storage-test-"));
    storage = new FileStorage(tmpDir);
  };

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("upload + download round-trip", async () => {
    await setup();
    const data = Buffer.from("hello file storage");
    await storage.upload("test.txt", data);
    const result = await storage.download("test.txt");
    expect(result).toEqual(data);
  });

  it("delete removes file, exists returns false", async () => {
    await setup();
    await storage.upload("file.txt", Buffer.from("data"));
    expect(await storage.exists("file.txt")).toBe(true);
    await storage.delete("file.txt");
    expect(await storage.exists("file.txt")).toBe(false);
  });

  it("getUrl returns file:// scheme with absolute path", async () => {
    await setup();
    const url = storage.getUrl("file.txt");
    expect(url.startsWith("file://")).toBe(true);
    expect(url).toContain(tmpDir);
  });

  it("upload creates nested directories automatically", async () => {
    await setup();
    const data = Buffer.from("nested content");
    await storage.upload("sub/dir/file.txt", data);
    const result = await storage.download("sub/dir/file.txt");
    expect(result).toEqual(data);
  });

  it("download of non-existent key throws", async () => {
    await setup();
    await expect(storage.download("nonexistent")).rejects.toThrow("Key not found: nonexistent");
  });

  it("exists returns false for non-existent key", async () => {
    await setup();
    expect(await storage.exists("nope")).toBe(false);
  });

  it("rejects path traversal", async () => {
    await setup();
    expect(() => storage.getUrl("../../etc/passwd")).toThrow("Path traversal detected");
  });

  it("upload with Uint8Array works", async () => {
    await setup();
    const data = new Uint8Array([10, 20, 30]);
    await storage.upload("binary.bin", data);
    const result = await storage.download("binary.bin");
    expect(Buffer.from(data)).toEqual(result);
  });
});
