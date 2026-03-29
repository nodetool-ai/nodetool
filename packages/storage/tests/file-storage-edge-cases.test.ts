/**
 * Edge-case tests for FileStorage.
 *
 * Covers: path traversal on upload/download/delete/exists, overwriting files,
 * special characters in keys, empty file handling, and delete of non-existent files.
 */

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { FileStorage } from "../src/file-storage.js";

describe("FileStorage edge cases", () => {
  let tmpDir: string;
  let storage: FileStorage;

  const setup = async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-edge-test-"));
    storage = new FileStorage(tmpDir);
  };

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  describe("path traversal prevention", () => {
    it("rejects traversal on upload", async () => {
      await setup();
      await expect(
        storage.upload("../../etc/passwd", Buffer.from("bad"))
      ).rejects.toThrow("Path traversal detected");
    });

    it("rejects traversal on download", async () => {
      await setup();
      await expect(storage.download("../secret")).rejects.toThrow(
        "Path traversal detected"
      );
    });

    it("rejects traversal on delete", async () => {
      await setup();
      await expect(storage.delete("../../file")).rejects.toThrow(
        "Path traversal detected"
      );
    });

    it("rejects traversal on exists", async () => {
      await setup();
      await expect(storage.exists("../../file")).rejects.toThrow(
        "Path traversal detected"
      );
    });

    it("allows absolute-looking paths within base dir", async () => {
      await setup();
      // A key like "a/b/c" is fine
      await storage.upload("a/b/c.txt", Buffer.from("ok"));
      expect(await storage.exists("a/b/c.txt")).toBe(true);
    });
  });

  describe("overwriting files", () => {
    it("upload overwrites existing file", async () => {
      await setup();
      await storage.upload("overwrite.txt", Buffer.from("version1"));
      await storage.upload("overwrite.txt", Buffer.from("version2"));
      const result = await storage.download("overwrite.txt");
      expect(result.toString()).toBe("version2");
    });
  });

  describe("empty data handling", () => {
    it("upload and download empty buffer", async () => {
      await setup();
      await storage.upload("empty.bin", Buffer.alloc(0));
      const result = await storage.download("empty.bin");
      expect(result.length).toBe(0);
    });
  });

  describe("special characters in keys", () => {
    it("handles keys with spaces", async () => {
      await setup();
      await storage.upload("file with spaces.txt", Buffer.from("content"));
      const result = await storage.download("file with spaces.txt");
      expect(result.toString()).toBe("content");
    });

    it("handles deeply nested directories", async () => {
      await setup();
      const key = "a/b/c/d/e/f/deep.txt";
      await storage.upload(key, Buffer.from("deep"));
      expect(await storage.exists(key)).toBe(true);
      const result = await storage.download(key);
      expect(result.toString()).toBe("deep");
    });
  });

  describe("delete edge cases", () => {
    it("delete of non-existent file throws", async () => {
      await setup();
      await expect(storage.delete("nonexistent.txt")).rejects.toThrow();
    });

    it("upload, delete, then download throws", async () => {
      await setup();
      await storage.upload("temp.txt", Buffer.from("data"));
      await storage.delete("temp.txt");
      await expect(storage.download("temp.txt")).rejects.toThrow(
        "Key not found: temp.txt"
      );
    });
  });

  describe("getUrl", () => {
    it("returns consistent URL for same key", async () => {
      await setup();
      const url1 = storage.getUrl("file.txt");
      const url2 = storage.getUrl("file.txt");
      expect(url1).toBe(url2);
    });

    it("includes nested path in URL", async () => {
      await setup();
      const url = storage.getUrl("sub/dir/file.txt");
      expect(url).toContain("sub/dir/file.txt");
    });
  });

  describe("large data", () => {
    it("handles 1MB file upload and download", async () => {
      await setup();
      const data = Buffer.alloc(1024 * 1024, 0xab);
      await storage.upload("large.bin", data);
      const result = await storage.download("large.bin");
      expect(result.length).toBe(data.length);
      expect(result.equals(data)).toBe(true);
    });
  });
});
