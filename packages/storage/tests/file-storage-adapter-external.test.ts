/**
 * In-place file references: a key with no object under the root resolves
 * through the injected lookup for reads, and never for writes or deletes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { FileStorageAdapter } from "../src/file-storage-adapter.js";
import { InMemoryStorageAdapter } from "../src/memory-storage-adapter.js";
import { S3StorageAdapter } from "../src/s3-storage-adapter.js";

describe("FileStorageAdapter external path lookup", () => {
  let tmpDir: string;
  let rootDir: string;
  let externalFile: string;
  const key = "user-1/a1.mp4";

  beforeEach(async () => {
    tmpDir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "fsa-external-"))
    );
    rootDir = path.join(tmpDir, "root");
    externalFile = path.join(tmpDir, "outside", "clip.mp4");
    await fs.mkdir(path.dirname(externalFile), { recursive: true });
    await fs.writeFile(externalFile, Buffer.from("external-bytes"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function adapterWith(map: Record<string, string>): FileStorageAdapter {
    return new FileStorageAdapter(rootDir, {
      externalPathLookup: async (k) => map[k] ?? null
    });
  }

  it("retrieves, stats, and reports existence through the lookup", async () => {
    const adapter = adapterWith({ [key]: externalFile });
    const uri = adapter.uriForKey(key);

    expect(Buffer.from((await adapter.retrieve(uri))!).toString()).toBe(
      "external-bytes"
    );
    expect(
      Buffer.from(
        (await adapter.retrieve(`/api/storage/${key}`))!
      ).toString()
    ).toBe("external-bytes");
    expect(await adapter.exists(uri)).toBe(true);
    const stat = await adapter.stat(uri);
    expect(stat).toMatchObject({ key, size: "external-bytes".length });
  });

  it("prefers an object under the root over the lookup", async () => {
    const lookup = vi.fn(async () => externalFile);
    const adapter = new FileStorageAdapter(rootDir, {
      externalPathLookup: lookup
    });
    const uri = await adapter.store(key, Buffer.from("managed"));
    expect(Buffer.from((await adapter.retrieve(uri))!).toString()).toBe(
      "managed"
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it("reports a key as missing when the lookup has no path or the file is gone", async () => {
    const adapter = adapterWith({ [key]: path.join(tmpDir, "missing.mp4") });
    const uri = adapter.uriForKey(key);
    expect(await adapter.retrieve(uri)).toBeNull();
    expect(await adapter.exists(uri)).toBe(false);
    expect(await adapter.stat(uri)).toBeNull();
    expect(await adapter.retrieve(adapter.uriForKey("user-1/other.mp4"))).toBeNull();
  });

  it("treats a throwing lookup as a miss", async () => {
    const adapter = new FileStorageAdapter(rootDir, {
      externalPathLookup: async () => {
        throw new Error("db down");
      }
    });
    expect(await adapter.retrieve(adapter.uriForKey(key))).toBeNull();
  });

  it("never deletes the external file", async () => {
    const adapter = adapterWith({ [key]: externalFile });
    const uri = adapter.uriForKey(key);
    expect(await adapter.delete(uri)).toBe(false);
    expect((await fs.readFile(externalFile)).toString()).toBe("external-bytes");
  });

  it("writes a stored object under the root, leaving the external file alone", async () => {
    const adapter = adapterWith({ [key]: externalFile });
    await adapter.store(key, Buffer.from("replacement"));
    expect((await fs.readFile(externalFile)).toString()).toBe("external-bytes");
    expect((await fs.readFile(path.join(rootDir, key))).toString()).toBe(
      "replacement"
    );
  });

  describe("localPath", () => {
    it("returns the managed file under the root without consulting the lookup", async () => {
      const lookup = vi.fn(async () => externalFile);
      const adapter = new FileStorageAdapter(rootDir, {
        externalPathLookup: lookup
      });
      const uri = await adapter.store(key, Buffer.from("managed"));
      expect(await adapter.localPath(uri)).toBe(path.join(rootDir, key));
      expect(await adapter.localPath(`/api/storage/${key}`)).toBe(
        path.join(rootDir, key)
      );
      expect(lookup).not.toHaveBeenCalled();
    });

    it("returns the external file when the root has no object", async () => {
      const adapter = adapterWith({ [key]: externalFile });
      expect(await adapter.localPath(adapter.uriForKey(key))).toBe(externalFile);
    });

    it("returns null for a missing key or a vanished external file", async () => {
      const adapter = adapterWith({
        [key]: path.join(tmpDir, "missing.mp4")
      });
      expect(await adapter.localPath(adapter.uriForKey(key))).toBeNull();
      expect(
        await adapter.localPath(adapter.uriForKey("user-1/other.mp4"))
      ).toBeNull();
      expect(await adapter.localPath("s3://bucket/user-1/a1.mp4")).toBeNull();
    });

    it("does not hand out a symlink under the root that points outside it", async () => {
      const adapter = new FileStorageAdapter(rootDir);
      await fs.mkdir(path.join(rootDir, "user-1"), { recursive: true });
      await fs.symlink(externalFile, path.join(rootDir, key));
      expect(await adapter.localPath(adapter.uriForKey(key))).toBeNull();
    });
  });
});

describe("localPath on backends with no local files", () => {
  it("returns null for the in-memory and S3 adapters", async () => {
    const memory = new InMemoryStorageAdapter();
    const uri = await memory.store("user-1/a1.mp4", Buffer.from("bytes"));
    expect(await memory.localPath(uri)).toBeNull();
    const s3 = new S3StorageAdapter({ bucket: "b" });
    expect(await s3.localPath(s3.uriForKey("user-1/a1.mp4"))).toBeNull();
  });
});
