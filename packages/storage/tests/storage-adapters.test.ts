import { describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createStorageAdapter,
  FileStorageAdapter,
  InMemoryStorageAdapter,
  S3Error,
  S3StorageAdapter,
  SupabaseStorageAdapter,
  type S3Api
} from "../src/index.js";

describe("InMemoryStorageAdapter", () => {
  it("stores and retrieves bytes via memory:// uri", async () => {
    const storage = new InMemoryStorageAdapter();
    const uri = await storage.store("a/b.txt", new Uint8Array([1, 2, 3]));
    expect(uri).toBe("memory://a/b.txt");
    expect(await storage.exists(uri)).toBe(true);
    expect(await storage.retrieve(uri)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("rejects non-memory URIs", async () => {
    const storage = new InMemoryStorageAdapter();
    expect(await storage.retrieve("file:///nope")).toBeNull();
    expect(await storage.exists("s3://bucket/key")).toBe(false);
  });
});

describe("FileStorageAdapter", () => {
  it("round-trips via file:// and /api/storage URIs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-storage-"));
    try {
      const storage = new FileStorageAdapter(dir);
      const uri = await storage.store("x/y.bin", new Uint8Array([7, 8]));
      expect(uri.startsWith("file://")).toBe(true);
      expect(Uint8Array.from((await storage.retrieve(uri)) ?? [])).toEqual(
        new Uint8Array([7, 8])
      );
      expect(
        Uint8Array.from((await storage.retrieve("/api/storage/x/y.bin")) ?? [])
      ).toEqual(new Uint8Array([7, 8]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects keys that escape the root", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-storage-"));
    try {
      const storage = new FileStorageAdapter(dir);
      await expect(
        storage.store("../escape.txt", new Uint8Array([1]))
      ).rejects.toThrow(/Invalid storage key/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("S3StorageAdapter", () => {
  function fakeClient(store: Map<string, Uint8Array>): S3Api {
    return {
      async putObject(input) {
        store.set(`${input.bucket}/${input.key}`, new Uint8Array(input.body));
        return {};
      },
      async getObject(input) {
        const body = store.get(`${input.bucket}/${input.key}`);
        if (!body) {
          throw new S3Error("NoSuchKey", "The specified key does not exist.", 404);
        }
        return { body };
      },
      async headObject(input) {
        if (!store.has(`${input.bucket}/${input.key}`)) {
          throw new S3Error("NotFound", "Not Found", 404);
        }
        return { contentLength: store.get(`${input.bucket}/${input.key}`)?.byteLength ?? 0 };
      },
      async deleteObject(input) {
        store.delete(`${input.bucket}/${input.key}`);
      },
      async listObjectsV2() {
        return { contents: [], commonPrefixes: [], isTruncated: false };
      }
    };
  }

  it("stores and retrieves under s3:// uri with prefix", async () => {
    const store = new Map<string, Uint8Array>();
    const storage = new S3StorageAdapter({
      bucket: "b",
      prefix: "runs/r1",
      client: fakeClient(store)
    });
    const uri = await storage.store(
      "out.bin",
      new Uint8Array([4, 5, 6]),
      "application/octet-stream"
    );
    expect(uri).toBe("s3://b/runs/r1/out.bin");
    expect(await storage.exists(uri)).toBe(true);
    expect(await storage.retrieve(uri)).toEqual(new Uint8Array([4, 5, 6]));
  });

  it("ignores foreign-bucket and non-s3 URIs", async () => {
    const storage = new S3StorageAdapter({
      bucket: "a",
      client: fakeClient(new Map())
    });
    expect(await storage.retrieve("s3://other/k")).toBeNull();
    expect(await storage.exists("s3://other/k")).toBe(false);
    expect(await storage.retrieve("file:///nope")).toBeNull();
    expect(await storage.exists("memory://k")).toBe(false);
  });

  it("rejects empty bucket", () => {
    expect(
      () => new S3StorageAdapter({ bucket: "", client: {} as unknown as S3Api })
    ).toThrow(/bucket is required/);
  });

  it("retries a transient upload error then succeeds", async () => {
    const store = new Map<string, Uint8Array>();
    let attempts = 0;
    const client: S3Api = {
      ...fakeClient(store),
      async putObject(input) {
        attempts++;
        if (attempts < 3) {
          throw new S3Error("ServiceUnavailable", "Service Unavailable", 503);
        }
        store.set(`${input.bucket}/${input.key}`, new Uint8Array(input.body));
        return {};
      }
    };
    const storage = new S3StorageAdapter({ bucket: "b", client });
    const uri = await storage.store("k.bin", new Uint8Array([1]));
    expect(uri).toBe("s3://b/k.bin");
    expect(attempts).toBe(3);
  });

  it("does not retry a permanent (4xx) upload error and surfaces it", async () => {
    let attempts = 0;
    const client: S3Api = {
      ...fakeClient(new Map()),
      async putObject() {
        attempts++;
        throw new S3Error("AccessDenied", "AccessDenied", 403);
      }
    };
    const storage = new S3StorageAdapter({ bucket: "b", client });
    await expect(storage.store("k.bin", new Uint8Array([1]))).rejects.toThrow(
      /S3 upload failed.*AccessDenied/s
    );
    expect(attempts).toBe(1);
  });

  it("lists objects across continuation tokens", async () => {
    const pages = [
      {
        contents: [
          { key: "runs/r1/files/a.txt", size: 1, lastModified: new Date(1000) }
        ],
        commonPrefixes: [],
        isTruncated: true,
        nextContinuationToken: "tok"
      },
      {
        contents: [
          { key: "runs/r1/files/b.txt", size: 2, lastModified: new Date(2000) }
        ],
        commonPrefixes: ["runs/r1/files/sub/"],
        isTruncated: false
      }
    ];
    const listCalls: Array<Record<string, unknown>> = [];
    const client: S3Api = {
      ...fakeClient(new Map()),
      async listObjectsV2(input) {
        listCalls.push({ ...input });
        return pages[listCalls.length - 1];
      }
    };
    const storage = new S3StorageAdapter({ bucket: "b", prefix: "runs/r1", client });
    const result = await storage.list("files", { delimiter: "/" });
    expect(listCalls[0]).toMatchObject({ prefix: "runs/r1/files/", delimiter: "/" });
    expect(listCalls[1]).toMatchObject({ continuationToken: "tok" });
    expect(result.entries.map((e) => e.key)).toEqual([
      "files/a.txt",
      "files/b.txt"
    ]);
    expect(result.commonPrefixes).toEqual(["files/sub/"]);
  });
});

describe("SupabaseStorageAdapter", () => {
  function fakeClient(store: Map<string, Uint8Array>) {
    return {
      storage: {
        from: (bucket: string) => ({
          upload: vi.fn(async (key: string, data: Uint8Array) => {
            store.set(`${bucket}/${key}`, new Uint8Array(data));
            return { error: null };
          }),
          download: vi.fn(async (key: string) => {
            const data = store.get(`${bucket}/${key}`);
            if (!data) return { data: null, error: { message: "not found" } };
            return {
              data: { arrayBuffer: async () => data.buffer.slice(0) },
              error: null
            };
          }),
          list: vi.fn(async (dir: string, opts: { search?: string }) => {
            const prefix = dir ? `${bucket}/${dir}/` : `${bucket}/`;
            const matches = [...store.keys()]
              .filter((k) => k.startsWith(prefix))
              .map((k) => ({ name: k.slice(prefix.length) }))
              .filter((e) => !opts.search || e.name === opts.search);
            return { data: matches, error: null };
          }),
          getPublicUrl: (key: string) => ({
            data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${key}` }
          })
        })
      }
    } as any;
  }

  it("stores under supabase:// uri and round-trips", async () => {
    const store = new Map<string, Uint8Array>();
    const storage = new SupabaseStorageAdapter({
      url: "https://x.supabase.co",
      apiKey: "k",
      bucket: "uploads",
      client: fakeClient(store)
    });
    const uri = await storage.store("a/b.png", new Uint8Array([9, 9]), "image/png");
    expect(uri).toBe("supabase://uploads/a/b.png");
    expect(await storage.exists(uri)).toBe(true);
    expect(await storage.retrieve(uri)).toEqual(new Uint8Array([9, 9]));
  });

  it("converts internal uri to public url", async () => {
    const storage = new SupabaseStorageAdapter({
      url: "https://x.supabase.co",
      apiKey: "k",
      bucket: "uploads",
      client: fakeClient(new Map())
    });
    expect(storage.getPublicUrl("supabase://uploads/foo.png")).toBe(
      "https://x.supabase.co/storage/v1/object/public/uploads/foo.png"
    );
    expect(storage.getPublicUrl("supabase://other/foo.png")).toBeNull();
    expect(storage.getPublicUrl("file:///tmp/x")).toBeNull();
  });

  // A fake client exposing a single stable `list` spy (the shared fakeClient's
  // `from()` returns a fresh object per call, so its spy can't be asserted on).
  function clientWithListSpy() {
    const list = vi.fn(async () => ({ data: [], error: null }));
    const bucket = { list };
    return { client: { storage: { from: () => bucket } } as any, list };
  }

  it("list() strips trailing slashes without a polynomial regex", async () => {
    const { client, list } = clientWithListSpy();
    const storage = new SupabaseStorageAdapter({
      url: "https://x.supabase.co",
      apiKey: "k",
      bucket: "uploads",
      client
    });
    // A long run of trailing slashes is the ReDoS trigger for /\/+$/; the
    // normalized prefix must collapse to "foo" and complete promptly.
    await storage.list(`foo${"/".repeat(50000)}`);
    expect(list).toHaveBeenCalledWith("foo", expect.anything());
  });

  it("list() rejects path-traversal prefixes with an empty result", async () => {
    const { client, list } = clientWithListSpy();
    const storage = new SupabaseStorageAdapter({
      url: "https://x.supabase.co",
      apiKey: "k",
      bucket: "uploads",
      client
    });
    const result = await storage.list("../../etc");
    expect(result).toEqual({ entries: [], commonPrefixes: [] });
    expect(list).not.toHaveBeenCalled();
  });

  it("requires url/serviceKey/bucket", () => {
    expect(
      () =>
        new SupabaseStorageAdapter({
          url: "",
          apiKey: "k",
          bucket: "b"
        })
    ).toThrow(/URL is required/);
    expect(
      () =>
        new SupabaseStorageAdapter({
          url: "u",
          apiKey: "",
          bucket: "b"
        })
    ).toThrow(/API key is required/);
    expect(
      () =>
        new SupabaseStorageAdapter({
          url: "u",
          apiKey: "k",
          bucket: ""
        })
    ).toThrow(/bucket is required/);
  });
});

describe("createStorageAdapter factory", () => {
  it("constructs file adapter", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-storage-"));
    try {
      const storage = createStorageAdapter({ kind: "file", rootDir: dir });
      expect(storage).toBeInstanceOf(FileStorageAdapter);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("constructs s3 adapter", () => {
    const storage = createStorageAdapter({ kind: "s3", bucket: "b" });
    expect(storage).toBeInstanceOf(S3StorageAdapter);
  });

  it("constructs supabase adapter", () => {
    const storage = createStorageAdapter({
      kind: "supabase",
      url: "https://x.supabase.co",
      apiKey: "k",
      bucket: "b"
    });
    expect(storage).toBeInstanceOf(SupabaseStorageAdapter);
  });
});
