/**
 * `storeIfAbsent`: an exclusive create. An object under the key is never
 * replaced, and of two writers racing for one key exactly one succeeds.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A `link` that fails the way a file system fails it, when a test sets one. */
const fsFaults = vi.hoisted(() => ({
  link: null as null | ((from: string, to: string) => Promise<void>)
}));

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return {
    ...actual,
    link: (from: string, to: string): Promise<void> =>
      fsFaults.link ? fsFaults.link(from, to) : actual.link(from, to)
  };
});

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

describe("storeIfAbsent with a staging name on the file adapter", () => {
  const STAGING = ".asset1.nodetool-move.tmp";
  const dir = (): string => join(root, "store", "Shots");
  const adapter = (): FileStorageAdapter =>
    new FileStorageAdapter(join(root, "store"));

  it("gives the key the whole file and leaves no staging file", async () => {
    const uri = await adapter().storeIfAbsent("Shots/fox.png", FIRST, undefined, {
      stagingName: STAGING
    });

    expect(uri).not.toBeNull();
    expect(await readdir(dir())).toEqual(["fox.png"]);
    expect(await readFile(join(dir(), "fox.png"))).toEqual(Buffer.from(FIRST));
    // One name for the file: a second link would make it unreadable here.
    expect((await stat(join(dir(), "fox.png"))).nlink).toBe(1);
    expect(await adapter().retrieve(uri ?? "")).toEqual(Buffer.from(FIRST));
  });

  it.each([
    ["an empty file", new Uint8Array()],
    ["a file that holds the beginning of the bytes", FIRST.subarray(0, 2)],
    ["a file with other bytes", SECOND]
  ])("never replaces or removes %s at the key", async (_what, existing) => {
    await mkdir(dir(), { recursive: true });
    await writeFile(join(dir(), "fox.png"), existing);

    const uri = await adapter().storeIfAbsent("Shots/fox.png", FIRST, undefined, {
      stagingName: STAGING
    });

    expect(uri).toBeNull();
    expect(await readdir(dir())).toEqual(["fox.png"]);
    expect(await readFile(join(dir(), "fox.png"))).toEqual(Buffer.from(existing));
  });

  it("treats a symlink at the key as taken, and never writes through it", async () => {
    await mkdir(dir(), { recursive: true });
    const outside = join(root, "outside.txt");
    await writeFile(outside, "outside");
    await symlink(outside, join(dir(), "fox.png"));

    const uri = await adapter().storeIfAbsent("Shots/fox.png", FIRST, undefined, {
      stagingName: STAGING
    });

    expect(uri).toBeNull();
    expect(await readFile(outside, "utf8")).toBe("outside");
    expect(await readdir(dir())).toEqual(["fox.png"]);
  });

  it("replaces what a writer that died left under the staging name", async () => {
    await mkdir(dir(), { recursive: true });
    // The process died while it wrote the staging file.
    await writeFile(join(dir(), STAGING), FIRST.subarray(0, 1));

    const uri = await adapter().storeIfAbsent("Shots/fox.png", FIRST, undefined, {
      stagingName: STAGING
    });

    expect(uri).not.toBeNull();
    expect(await readdir(dir())).toEqual(["fox.png"]);
    expect(await readFile(join(dir(), "fox.png"))).toEqual(Buffer.from(FIRST));
  });

  it("removes the staging name a writer left linked to the file it published", async () => {
    await mkdir(dir(), { recursive: true });
    // The process died after the key got the file and before the staging
    // name was removed.
    await writeFile(join(dir(), STAGING), FIRST);
    await link(join(dir(), STAGING), join(dir(), "fox.png"));

    const uri = await adapter().storeIfAbsent("Shots/fox.png", SECOND, undefined, {
      stagingName: STAGING
    });

    expect(uri).toBeNull();
    expect(await readdir(dir())).toEqual(["fox.png"]);
    expect(await readFile(join(dir(), "fox.png"))).toEqual(Buffer.from(FIRST));
    expect((await stat(join(dir(), "fox.png"))).nlink).toBe(1);
  });

  it("lets exactly one of many racing writers have the key", async () => {
    const store = adapter();
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        store.storeIfAbsent("Shots/race.png", new Uint8Array([i]), undefined, {
          stagingName: `.writer${i}.nodetool-move.tmp`
        })
      )
    );

    const winners = results.flatMap((uri, i) => (uri ? [i] : []));
    expect(winners).toHaveLength(1);
    expect(await readdir(dir())).toEqual(["race.png"]);
    expect(await readFile(join(dir(), "race.png"))).toEqual(
      Buffer.from([winners[0] ?? -1])
    );
  });

  it.each(["", ".", "..", "fox.png", "sub/x.tmp", "..\\x.tmp"])(
    "refuses the staging name %j",
    async (stagingName) => {
      await expect(
        adapter().storeIfAbsent("Shots/fox.png", FIRST, undefined, { stagingName })
      ).rejects.toThrow(/staging name/);
      await expect(readdir(dir())).resolves.toEqual([]);
    }
  );
});

describe("storeIfAbsent with a staging name where the file system has no hard links", () => {
  const STAGING = ".asset1.nodetool-move.tmp";
  const dir = (): string => join(root, "store", "Shots");
  const adapter = (): FileStorageAdapter =>
    new FileStorageAdapter(join(root, "store"));
  const failure = (code: string): Error =>
    Object.assign(new Error(`${code}: link`), { code });
  const staged = (data: Uint8Array): Promise<string | null> =>
    adapter().storeIfAbsent("Shots/fox.png", data, undefined, {
      stagingName: STAGING
    });

  afterEach(() => {
    fsFaults.link = null;
  });

  it.each(["EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"])(
    "creates the file with an exclusive open when link fails with %s",
    async (code) => {
      fsFaults.link = async () => {
        throw failure(code);
      };

      const uri = await staged(FIRST);

      expect(uri).not.toBeNull();
      expect(await readdir(dir())).toEqual(["fox.png"]);
      expect(await readFile(join(dir(), "fox.png"))).toEqual(Buffer.from(FIRST));
      expect(await adapter().retrieve(uri ?? "")).toEqual(Buffer.from(FIRST));
    }
  );

  it.each([
    ["an empty file", new Uint8Array()],
    ["a file with other bytes", SECOND]
  ])("never replaces or removes %s at the key", async (_what, existing) => {
    await mkdir(dir(), { recursive: true });
    await writeFile(join(dir(), "fox.png"), existing);
    fsFaults.link = async () => {
      throw failure("EPERM");
    };

    expect(await staged(FIRST)).toBeNull();
    expect(await readdir(dir())).toEqual(["fox.png"]);
    expect(await readFile(join(dir(), "fox.png"))).toEqual(Buffer.from(existing));
  });

  it("leaves a file another writer put at the key in the instant the link failed", async () => {
    // The other writer's file arrives after the staging file was written,
    // and the staging file is gone by the time the fallback runs.
    fsFaults.link = async (from, to) => {
      await writeFile(to, SECOND);
      await rm(from);
      throw failure("EPERM");
    };

    expect(await staged(FIRST)).toBeNull();
    expect(await readdir(dir())).toEqual(["fox.png"]);
    expect(await readFile(join(dir(), "fox.png"))).toEqual(Buffer.from(SECOND));
  });

  it("throws any other link failure and leaves nothing behind", async () => {
    fsFaults.link = async () => {
      throw failure("EIO");
    };

    await expect(staged(FIRST)).rejects.toThrow("EIO");
    expect(await readdir(dir())).toEqual([]);
  });
});

describe("storeIfAbsent with a staging name on the object stores", () => {
  it.each(["memory", "s3", "supabase"])(
    "creates under the key alone on the %s adapter",
    async (name) => {
      const store = backends[name]();
      const options = { stagingName: ".asset1.nodetool-move.tmp" };

      const first = await store.storeIfAbsent?.("Shots/fox.png", FIRST, undefined, options);
      const second = await store.storeIfAbsent?.("Shots/fox.png", SECOND, undefined, options);

      expect(first).toBeTruthy();
      expect(second).toBeNull();
      expect(await store.retrieve(first ?? "")).toEqual(FIRST);
    }
  );
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
