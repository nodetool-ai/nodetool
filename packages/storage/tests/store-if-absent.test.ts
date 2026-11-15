/**
 * `storeIfAbsent`: an exclusive create. An object under the key is never
 * replaced, and of two writers racing for one key exactly one succeeds.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStorageAdapter } from "../src/file-storage-adapter.js";
import { InMemoryStorageAdapter } from "../src/memory-storage-adapter.js";
import { S3StorageAdapter } from "../src/s3-storage-adapter.js";
import { S3Error, type S3Api, type S3PutObjectInput } from "../src/s3/client.js";
import { SupabaseStorageAdapter } from "../src/supabase-storage-adapter.js";
import type { StorageAdapter } from "../src/storage-adapter.js";
import type {
  SupabaseBucketApi,
  SupabaseStorageApi,
  SupabaseUploadOptions
} from "../src/supabase-rest.js";

const FIRST = new Uint8Array([1, 1, 1]);
const SECOND = new Uint8Array([2, 2]);

/** An S3 fake that honors `If-None-Match: *` the way S3 does. */
function conditionalS3(): { client: S3Api; puts: S3PutObjectInput[] } {
  const store = new Map<string, Uint8Array>();
  const puts: S3PutObjectInput[] = [];
  const client: S3Api = {
    putObject: async (input) => {
      puts.push(input);
      const key = `${input.bucket}/${input.key}`;
      if (input.ifNoneMatch === "*" && store.has(key)) {
        throw new S3Error("PreconditionFailed", "precondition failed", 412);
      }
      store.set(key, new Uint8Array(input.body));
      return {};
    },
    getObject: async (input) => {
      const body = store.get(`${input.bucket}/${input.key}`);
      if (!body) throw new S3Error("NoSuchKey", "missing", 404);
      return { body };
    },
    headObject: async (input) => {
      const body = store.get(`${input.bucket}/${input.key}`);
      if (!body) throw new S3Error("NotFound", "Not Found", 404);
      return { contentLength: body.byteLength };
    },
    deleteObject: async (input) => {
      store.delete(`${input.bucket}/${input.key}`);
    },
    listObjectsV2: async () => ({
      contents: [],
      commonPrefixes: [],
      isTruncated: false
    })
  };
  return { client, puts };
}

/** A Supabase fake that refuses a non-upsert upload over an object. */
function conditionalSupabase(): {
  client: SupabaseStorageApi;
  uploads: SupabaseUploadOptions[];
} {
  const store = new Map<string, Uint8Array>();
  const uploads: SupabaseUploadOptions[] = [];
  const bucket: SupabaseBucketApi = {
    upload: async (key, data, options = {}) => {
      uploads.push(options);
      if (!options.upsert && store.has(key)) {
        return {
          error: { message: "The resource already exists", status: 409 }
        };
      }
      store.set(key, new Uint8Array(data));
      return { error: null };
    },
    download: async (key) => {
      const body = store.get(key);
      return body
        ? { data: new Blob([body as BlobPart]), error: null }
        : { data: null, error: { message: "not found", status: 404 } };
    },
    remove: async () => ({ error: null }),
    list: async () => ({ data: [], error: null }),
    info: async () => ({ data: null, error: { message: "not found" } }),
    createSignedUrl: async () => ({ data: null, error: null }),
    getPublicUrl: (key: string) => ({
      data: { publicUrl: `https://x.supabase.co/pub/${key}` }
    })
  } as SupabaseBucketApi;
  return { client: { storage: { from: () => bucket } }, uploads };
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "nodetool-store-if-absent-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const backends: Record<string, () => StorageAdapter> = {
  file: () => new FileStorageAdapter(join(root, "store")),
  memory: () => new InMemoryStorageAdapter(),
  s3: () =>
    new S3StorageAdapter({
      bucket: "b",
      prefix: "runs",
      client: conditionalS3().client
    }),
  supabase: () =>
    new SupabaseStorageAdapter({
      url: "https://x.supabase.co",
      apiKey: "k",
      bucket: "uploads",
      client: conditionalSupabase().client
    })
};

describe.each(Object.keys(backends))("storeIfAbsent on the %s adapter", (name) => {
  it("creates the object and answers with its uri", async () => {
    const adapter = backends[name]!();

    const uri = await adapter.storeIfAbsent?.("dir/fox.png", FIRST, "image/png");

    expect(uri).toBe(adapter.uriForKey("dir/fox.png"));
    const stored = await adapter.retrieve(uri!);
    expect(stored && new Uint8Array(stored)).toEqual(FIRST);
  });

  it("answers null for a taken key and leaves the object as it was", async () => {
    const adapter = backends[name]!();
    await adapter.storeIfAbsent?.("dir/fox.png", FIRST);

    expect(await adapter.storeIfAbsent?.("dir/fox.png", SECOND)).toBeNull();

    const stored = await adapter.retrieve(adapter.uriForKey("dir/fox.png"));
    expect(stored && new Uint8Array(stored)).toEqual(FIRST);
  });

  it("does not replace an object `store` wrote", async () => {
    const adapter = backends[name]!();
    await adapter.store("fox.png", FIRST);

    expect(await adapter.storeIfAbsent?.("fox.png", SECOND)).toBeNull();

    const stored = await adapter.retrieve(adapter.uriForKey("fox.png"));
    expect(stored && new Uint8Array(stored)).toEqual(FIRST);
  });

  it("lets exactly one of many racing writers have the key", async () => {
    const adapter = backends[name]!();

    const results = await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        adapter.storeIfAbsent?.("race.bin", new Uint8Array([i]))
      )
    );

    const winners = results.flatMap((uri, i) => (uri ? [i] : []));
    expect(winners).toHaveLength(1);
    const stored = await adapter.retrieve(adapter.uriForKey("race.bin"));
    expect(stored && new Uint8Array(stored)).toEqual(
      new Uint8Array([winners[0]!])
    );
  });
});

describe("storeIfAbsent on the file adapter", () => {
  it("writes the file in place, with no temp file left beside it", async () => {
    const adapter = new FileStorageAdapter(join(root, "store"));

    await adapter.storeIfAbsent("Generated/fox.png", FIRST);

    expect(await readdir(join(root, "store", "Generated"))).toEqual(["fox.png"]);
    expect(await readFile(join(root, "store", "Generated", "fox.png"))).toEqual(
      Buffer.from(FIRST)
    );
  });

  it("treats a file another process put there as taken", async () => {
    const adapter = new FileStorageAdapter(join(root, "store"));
    await adapter.store("Generated/seed.png", FIRST);
    // Written behind the adapter's back, as a second process would.
    await writeFile(join(root, "store", "Generated", "fox.png"), FIRST);

    expect(await adapter.storeIfAbsent("Generated/fox.png", SECOND)).toBeNull();
    expect(await readFile(join(root, "store", "Generated", "fox.png"))).toEqual(
      Buffer.from(FIRST)
    );
  });

  it("treats a symlink at the path as taken, and never writes through it", async () => {
    const adapter = new FileStorageAdapter(join(root, "store"));
    await adapter.store("seed.png", FIRST);
    const outside = join(root, "outside.txt");
    await writeFile(outside, "outside");
    await symlink(outside, join(root, "store", "link.png"));
    await symlink(join(root, "nowhere"), join(root, "store", "dangling.png"));

    expect(await adapter.storeIfAbsent("link.png", SECOND)).toBeNull();
    expect(await adapter.storeIfAbsent("dangling.png", SECOND)).toBeNull();
    expect(await readFile(outside, "utf8")).toBe("outside");
  });

  it("refuses a path that leaves the root", async () => {
    const adapter = new FileStorageAdapter(join(root, "store"));
    await adapter.store("seed.png", FIRST);
    await symlink(root, join(root, "store", "up"));

    await expect(adapter.storeIfAbsent("up/escaped.png", FIRST)).rejects.toThrow();
    await expect(adapter.storeIfAbsent("../escaped.png", FIRST)).rejects.toThrow();
    expect(await readdir(root)).toEqual(["store"]);
  });
});

describe("storeIfAbsent on the object stores", () => {
  it("sends S3 a conditional put under the prefix", async () => {
    const { client, puts } = conditionalS3();
    const adapter = new S3StorageAdapter({ bucket: "b", prefix: "runs", client });

    expect(await adapter.storeIfAbsent("fox.png", FIRST, "image/png")).toBe(
      "s3://b/runs/fox.png"
    );

    expect(puts[0]).toMatchObject({
      bucket: "b",
      key: "runs/fox.png",
      contentType: "image/png",
      ifNoneMatch: "*"
    });
    // A plain store stays unconditional.
    await adapter.store("fox.png", SECOND);
    expect(puts[1]?.ifNoneMatch).toBeUndefined();
  });

  it("reads S3's 409 for a conflicting conditional put as taken", async () => {
    const client = conditionalS3().client;
    client.putObject = vi.fn(async () => {
      throw new S3Error("ConditionalRequestConflict", "conflict", 409);
    });
    const adapter = new S3StorageAdapter({ bucket: "b", client });

    expect(await adapter.storeIfAbsent("fox.png", FIRST)).toBeNull();
  });

  it("throws any other S3 failure instead of reporting the key as taken", async () => {
    const client = conditionalS3().client;
    client.putObject = vi.fn(async () => {
      throw new S3Error("AccessDenied", "Access Denied", 403);
    });
    const adapter = new S3StorageAdapter({ bucket: "b", client });

    await expect(adapter.storeIfAbsent("fox.png", FIRST)).rejects.toThrow(
      /S3 upload failed.*Access Denied/
    );
  });

  it("uploads to Supabase without upsert", async () => {
    const { client, uploads } = conditionalSupabase();
    const adapter = new SupabaseStorageAdapter({
      url: "https://x.supabase.co",
      apiKey: "k",
      bucket: "uploads",
      client
    });

    expect(await adapter.storeIfAbsent("fox.png", FIRST, "image/png")).toBe(
      "supabase://uploads/fox.png"
    );

    expect(uploads[0]).toMatchObject({ upsert: false, contentType: "image/png" });
    await adapter.store("fox.png", SECOND);
    expect(uploads[1]).toMatchObject({ upsert: true });
  });

  it("throws any other Supabase failure instead of reporting the key as taken", async () => {
    const { client } = conditionalSupabase();
    client.storage.from("uploads").upload = async () => ({
      error: { message: "Bucket full", status: 400 }
    });
    const adapter = new SupabaseStorageAdapter({
      url: "https://x.supabase.co",
      apiKey: "k",
      bucket: "uploads",
      client
    });

    await expect(adapter.storeIfAbsent("fox.png", FIRST)).rejects.toThrow(
      /Supabase upload failed.*Bucket full/
    );
  });
});
