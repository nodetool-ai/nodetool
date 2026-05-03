import { describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createStorageAdapter,
  FileStorageAdapter,
  InMemoryStorageAdapter,
  S3StorageAdapter,
  SupabaseStorageAdapter
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
  function fakeClient(store: Map<string, Uint8Array>) {
    return {
      send: vi.fn(async (cmd: any) => {
        const key = `${cmd.input.Bucket}/${cmd.input.Key}`;
        if (cmd.constructor.name === "PutObjectCommand") {
          store.set(key, new Uint8Array(cmd.input.Body));
          return {};
        }
        if (cmd.constructor.name === "GetObjectCommand") {
          const body = store.get(key);
          if (!body) throw new Error("NoSuchKey");
          return { Body: { transformToByteArray: async () => body } };
        }
        if (cmd.constructor.name === "HeadObjectCommand") {
          if (!store.has(key)) throw new Error("NotFound");
          return {};
        }
        throw new Error(`unknown command ${cmd.constructor.name}`);
      })
    } as any;
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
      () => new S3StorageAdapter({ bucket: "", client: {} as any })
    ).toThrow(/bucket is required/);
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
