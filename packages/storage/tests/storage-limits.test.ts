/**
 * Tests for the shared upload-size guard and its enforcement across backends.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  getMaxUploadBytes,
  assertUploadWithinLimit
} from "../src/storage-limits.js";
import { FileStorage } from "../src/file-storage.js";
import { FileStorageAdapter } from "../src/file-storage-adapter.js";

const KEY = "NODETOOL_MAX_UPLOAD_BYTES";

describe("storage upload limit", () => {
  beforeEach(() => {
    delete process.env[KEY];
  });
  afterEach(() => {
    delete process.env[KEY];
  });

  it("defaults to 1 GiB", () => {
    expect(getMaxUploadBytes()).toBe(1024 * 1024 * 1024);
  });

  it("honours NODETOOL_MAX_UPLOAD_BYTES override", () => {
    process.env[KEY] = "16";
    expect(getMaxUploadBytes()).toBe(16);
  });

  it("falls back to default for a malformed override", () => {
    process.env[KEY] = "huge";
    expect(getMaxUploadBytes()).toBe(1024 * 1024 * 1024);
  });

  it("assertUploadWithinLimit passes at the limit, throws above it", () => {
    process.env[KEY] = "8";
    expect(() => assertUploadWithinLimit("k", 8)).not.toThrow();
    expect(() => assertUploadWithinLimit("k", 9)).toThrow(/exceeds maximum/);
  });
});

describe("backend enforcement", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storage-limit-test-"));
    process.env[KEY] = "10";
  });

  afterEach(async () => {
    delete process.env[KEY];
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("FileStorage.upload rejects oversized data", async () => {
    const storage = new FileStorage(tmpDir);
    await expect(
      storage.upload("big.bin", Buffer.alloc(11))
    ).rejects.toThrow(/exceeds maximum/);
    await expect(storage.upload("ok.bin", Buffer.alloc(10))).resolves.toBeUndefined();
  });

  it("FileStorageAdapter.store rejects oversized data", async () => {
    const adapter = new FileStorageAdapter(tmpDir);
    await expect(
      adapter.store("big.bin", new Uint8Array(11))
    ).rejects.toThrow(/exceeds maximum/);
    await expect(
      adapter.store("ok.bin", new Uint8Array(10))
    ).resolves.toContain("ok.bin");
  });
});
