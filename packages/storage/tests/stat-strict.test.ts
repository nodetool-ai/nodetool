/**
 * `statStrict` tells a missing object from a lookup that failed (PF17 F9).
 * `stat` answers both with null, so the move of legacy asset bytes read a
 * failed lookup as an absent object.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A `stat` that fails the way a file system fails it, when a test sets one. */
const fsFaults = vi.hoisted(() => ({
  stat: null as null | (() => Promise<never>)
}));

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return {
    ...actual,
    stat: ((...args: Parameters<typeof actual.stat>) =>
      fsFaults.stat ? fsFaults.stat() : actual.stat(...args)) as typeof actual.stat
  };
});
import { FileStorageAdapter } from "../src/file-storage-adapter.js";
import { InMemoryStorageAdapter } from "../src/memory-storage-adapter.js";
import { S3StorageAdapter } from "../src/s3-storage-adapter.js";
import { S3Error, type S3Api } from "../src/s3/client.js";
import { SupabaseStorageAdapter } from "../src/supabase-storage-adapter.js";
import type { SupabaseBucketApi, SupabaseStorageApi } from "../src/supabase-rest.js";

function s3With(headObject: S3Api["headObject"]): S3StorageAdapter {
  const client = { headObject } as unknown as S3Api;
  return new S3StorageAdapter({ bucket: "b", client });
}

function supabaseWith(info: SupabaseBucketApi["info"]): SupabaseStorageAdapter {
  const bucket = { info } as unknown as SupabaseBucketApi;
  const client: SupabaseStorageApi = { storage: { from: () => bucket } };
  return new SupabaseStorageAdapter({
    url: "https://x.supabase.co",
    apiKey: "k",
    bucket: "uploads",
    client
  });
}

describe("S3StorageAdapter.statStrict", () => {
  it("answers null for a key S3 does not have", async () => {
    const adapter = s3With(async () => {
      throw new S3Error("NotFound", "Not Found", 404);
    });
    await expect(adapter.statStrict(adapter.uriForKey("a"))).resolves.toBeNull();
  });

  it("throws when S3 could not answer, where stat answers null", async () => {
    const adapter = s3With(async () => {
      throw new S3Error("InternalError", "boom", 500);
    });
    await expect(adapter.statStrict(adapter.uriForKey("a"))).rejects.toThrow(/boom/);
    await expect(adapter.stat(adapter.uriForKey("a"))).resolves.toBeNull();
  });

  it("answers the object it has", async () => {
    const adapter = s3With(async () => ({ contentLength: 3 }));
    await expect(adapter.statStrict(adapter.uriForKey("a"))).resolves.toMatchObject({
      size: 3
    });
  });
});

describe("SupabaseStorageAdapter.statStrict", () => {
  it("answers null for a key Storage does not have", async () => {
    for (const status of [400, 404]) {
      const adapter = supabaseWith(async () => ({
        data: null,
        error: { message: "Object not found", status }
      }));
      await expect(adapter.statStrict(adapter.uriForKey("a"))).resolves.toBeNull();
    }
  });

  it("throws when Storage could not answer, where stat answers null", async () => {
    const adapter = supabaseWith(async () => ({
      data: null,
      error: { message: "boom", status: 503 }
    }));
    await expect(adapter.statStrict(adapter.uriForKey("a"))).rejects.toThrow(/boom/);
    await expect(adapter.stat(adapter.uriForKey("a"))).resolves.toBeNull();
  });
});

describe("FileStorageAdapter.statStrict", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "stat-strict-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("answers null for a missing file and the file it has", async () => {
    const adapter = new FileStorageAdapter(root, { externalPathLookup: null });
    await writeFile(join(root, "a.png"), "abc");
    await expect(adapter.statStrict(adapter.uriForKey("missing.png"))).resolves.toBeNull();
    await expect(adapter.statStrict(adapter.uriForKey("a.png"))).resolves.toMatchObject({
      size: 3
    });
  });

  it("throws when the file system cannot answer, where stat answers null", async () => {
    const adapter = new FileStorageAdapter(root, { externalPathLookup: null });
    await writeFile(join(root, "a.png"), "abc");
    const uri = adapter.uriForKey("a.png");
    fsFaults.stat = () =>
      Promise.reject(Object.assign(new Error("EIO: i/o error"), { code: "EIO" }));
    try {
      await expect(adapter.statStrict(uri)).rejects.toThrow(/EIO/);
      await expect(adapter.stat(uri)).resolves.toBeNull();
    } finally {
      fsFaults.stat = null;
    }
  });
});

describe("InMemoryStorageAdapter.statStrict", () => {
  it("answers as stat does", async () => {
    const adapter = new InMemoryStorageAdapter();
    const uri = await adapter.store("a", new Uint8Array([1]));
    await expect(adapter.statStrict(uri)).resolves.toMatchObject({ size: 1 });
    await expect(adapter.statStrict(adapter.uriForKey("b"))).resolves.toBeNull();
  });
});
