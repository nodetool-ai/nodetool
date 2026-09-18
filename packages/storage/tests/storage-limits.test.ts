/**
 * Tests for the shared upload-size guard and its enforcement across backends.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  getMaxUploadBytes,
  getMaxLocalUploadBytes,
  assertUploadWithinLimit
} from "../src/storage-limits.js";
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

  it("allows 2 GiB for streamed local uploads and respects an explicit cap", () => {
    expect(getMaxLocalUploadBytes()).toBe(2 * 1024 * 1024 * 1024);
    process.env[KEY] = "16";
    expect(getMaxLocalUploadBytes()).toBe(16);
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

  it("FileStorageAdapter.store rejects oversized data", async () => {
    const adapter = new FileStorageAdapter(tmpDir);
    await expect(
      adapter.store("big.bin", new Uint8Array(11))
    ).rejects.toThrow(/exceeds maximum/);
    await expect(
      adapter.store("ok.bin", new Uint8Array(10))
    ).resolves.toContain("ok.bin");
  });

  it("publishes staged files atomically and leaves an existing object intact on limit failure", async () => {
    const adapter = new FileStorageAdapter(path.join(tmpDir, "assets"));
    const source = path.join(tmpDir, "upload");
    await fs.writeFile(source, "original");
    const uri = await adapter.storeFile("owner/clip.mp4", source);
    expect(Buffer.from(await adapter.retrieve(uri) ?? []).toString()).toBe("original");
    await fs.writeFile(source, "too many bytes");
    await expect(adapter.storeFile("owner/clip.mp4", source)).rejects.toThrow(/exceeds limit/);
    expect(Buffer.from(await adapter.retrieve(uri) ?? []).toString()).toBe("original");
    await expect(adapter.storeFile("../escape", source)).rejects.toThrow();
  });
});
