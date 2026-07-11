import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SupabaseStorageAdapter } from "../src/supabase-storage-adapter.js";
import type {
  SupabaseBucketApi,
  SupabaseObjectEntry,
  SupabaseStorageApi
} from "../src/supabase-rest.js";

// A configurable fake Supabase client. Each op is a vi.fn so calls can be
// asserted; `from()` returns a single stable bucket object so spies survive.
function makeClient(
  overrides: Partial<SupabaseBucketApi> = {}
): { client: SupabaseStorageApi; bucket: SupabaseBucketApi } {
  const bucket: SupabaseBucketApi = {
    upload: vi.fn(async () => ({ error: null })),
    download: vi.fn(async () => ({ data: null, error: null })),
    remove: vi.fn(async () => ({ error: null })),
    list: vi.fn(async () => ({ data: [], error: null })),
    createSignedUrl: vi.fn(async () => ({ data: null, error: null })),
    getPublicUrl: (key: string) => ({
      data: { publicUrl: `https://x.supabase.co/pub/${key}` }
    }),
    ...overrides
  };
  const client: SupabaseStorageApi = {
    storage: { from: () => bucket }
  };
  return { client, bucket };
}

function makeAdapter(overrides: Partial<SupabaseBucketApi> = {}) {
  const { client, bucket } = makeClient(overrides);
  const adapter = new SupabaseStorageAdapter({
    url: "https://x.supabase.co",
    apiKey: "k",
    bucket: "uploads",
    client
  });
  return { adapter, bucket };
}

describe("SupabaseStorageAdapter store", () => {
  it("passes contentType and upsert to upload and returns the uri", async () => {
    const { adapter, bucket } = makeAdapter();
    const uri = await adapter.store(
      "dir/file.png",
      new Uint8Array([1, 2, 3]),
      "image/png"
    );
    expect(uri).toBe("supabase://uploads/dir/file.png");
    expect(bucket.upload).toHaveBeenCalledWith(
      "dir/file.png",
      expect.any(Uint8Array),
      { upsert: true, contentType: "image/png" }
    );
  });

  it("omits contentType when not provided", async () => {
    const { adapter, bucket } = makeAdapter();
    await adapter.store("file.bin", new Uint8Array([9]));
    expect(bucket.upload).toHaveBeenCalledWith("file.bin", expect.any(Uint8Array), {
      upsert: true
    });
  });

  it("throws with the mapped error message when upload fails", async () => {
    const { adapter } = makeAdapter({
      upload: vi.fn(async () => ({ error: { message: "Bucket full" } }))
    });
    await expect(
      adapter.store("k.txt", new Uint8Array([1]))
    ).rejects.toThrow('Supabase upload failed for "k.txt": Bucket full');
  });
});

describe("SupabaseStorageAdapter uriForKey", () => {
  it("builds a supabase uri from a key", () => {
    const { adapter } = makeAdapter();
    expect(adapter.uriForKey("a/b.txt")).toBe("supabase://uploads/a/b.txt");
  });
});

describe("SupabaseStorageAdapter retrieve", () => {
  it("returns bytes for a valid uri", async () => {
    const bytes = new Uint8Array([4, 5, 6]);
    const { adapter } = makeAdapter({
      download: vi.fn(async () => ({
        data: { arrayBuffer: async () => bytes.buffer.slice(0) },
        error: null
      }))
    });
    expect(await adapter.retrieve("supabase://uploads/a.bin")).toEqual(bytes);
  });

  it("returns null for a non-supabase uri", async () => {
    const { adapter } = makeAdapter();
    expect(await adapter.retrieve("file:///x")).toBeNull();
  });

  it("returns null for a foreign bucket", async () => {
    const { adapter } = makeAdapter();
    expect(await adapter.retrieve("supabase://other/a.bin")).toBeNull();
  });

  it("returns null for a malformed uri (no key)", async () => {
    const { adapter } = makeAdapter();
    expect(await adapter.retrieve("supabase://uploads/")).toBeNull();
    expect(await adapter.retrieve("supabase:///key")).toBeNull();
  });

  it("returns null when download reports an error", async () => {
    const { adapter } = makeAdapter({
      download: vi.fn(async () => ({ data: null, error: { message: "nope" } }))
    });
    expect(await adapter.retrieve("supabase://uploads/a.bin")).toBeNull();
  });

  it("returns null when download data is missing", async () => {
    const { adapter } = makeAdapter({
      download: vi.fn(async () => ({ data: null, error: null }))
    });
    expect(await adapter.retrieve("supabase://uploads/a.bin")).toBeNull();
  });
});

describe("SupabaseStorageAdapter exists", () => {
  it("returns true when a matching entry is listed (nested key)", async () => {
    const { adapter, bucket } = makeAdapter({
      list: vi.fn(async () => ({
        data: [{ name: "file.txt", id: "1" }],
        error: null
      }))
    });
    expect(await adapter.exists("supabase://uploads/dir/file.txt")).toBe(true);
    expect(bucket.list).toHaveBeenCalledWith("dir", {
      search: "file.txt",
      limit: 1
    });
  });

  it("returns true for a top-level key (empty dir)", async () => {
    const { adapter, bucket } = makeAdapter({
      list: vi.fn(async () => ({ data: [{ name: "top.txt", id: "1" }], error: null }))
    });
    expect(await adapter.exists("supabase://uploads/top.txt")).toBe(true);
    expect(bucket.list).toHaveBeenCalledWith("", { search: "top.txt", limit: 1 });
  });

  it("returns false when no entry matches", async () => {
    const { adapter } = makeAdapter({
      list: vi.fn(async () => ({ data: [{ name: "other.txt", id: "1" }], error: null }))
    });
    expect(await adapter.exists("supabase://uploads/file.txt")).toBe(false);
  });

  it("returns false when list errors", async () => {
    const { adapter } = makeAdapter({
      list: vi.fn(async () => ({ data: null, error: { message: "boom" } }))
    });
    expect(await adapter.exists("supabase://uploads/file.txt")).toBe(false);
  });

  it("returns false for a non-supabase / foreign uri", async () => {
    const { adapter } = makeAdapter();
    expect(await adapter.exists("file:///x")).toBe(false);
    expect(await adapter.exists("supabase://other/file.txt")).toBe(false);
  });
});

describe("SupabaseStorageAdapter delete", () => {
  it("removes the key when it exists and returns true", async () => {
    const { adapter, bucket } = makeAdapter({
      list: vi.fn(async () => ({ data: [{ name: "file.txt", id: "1" }], error: null })),
      remove: vi.fn(async () => ({ error: null }))
    });
    expect(await adapter.delete("supabase://uploads/dir/file.txt")).toBe(true);
    expect(bucket.remove).toHaveBeenCalledWith(["dir/file.txt"]);
  });

  it("returns false when the key does not exist (no remove call)", async () => {
    const { adapter, bucket } = makeAdapter({
      list: vi.fn(async () => ({ data: [], error: null }))
    });
    expect(await adapter.delete("supabase://uploads/gone.txt")).toBe(false);
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("returns false when remove reports an error", async () => {
    const { adapter } = makeAdapter({
      list: vi.fn(async () => ({ data: [{ name: "file.txt", id: "1" }], error: null })),
      remove: vi.fn(async () => ({ error: { message: "denied" } }))
    });
    expect(await adapter.delete("supabase://uploads/file.txt")).toBe(false);
  });

  it("returns false for a foreign / malformed uri", async () => {
    const { adapter } = makeAdapter();
    expect(await adapter.delete("supabase://other/file.txt")).toBe(false);
    expect(await adapter.delete("nope://x")).toBe(false);
  });
});

describe("SupabaseStorageAdapter list", () => {
  it("returns sorted file entries with size/contentType/modifiedAt", async () => {
    const entries: SupabaseObjectEntry[] = [
      {
        name: "z.txt",
        id: "2",
        updated_at: "2021-01-01T00:00:00.000Z",
        metadata: { size: 20, mimetype: "text/plain" }
      },
      {
        name: "a.txt",
        id: "1",
        updated_at: "2020-01-01T00:00:00.000Z",
        metadata: { size: 10, mimetype: "text/plain" }
      }
    ];
    const { adapter, bucket } = makeAdapter({
      list: vi.fn(async () => ({ data: entries, error: null }))
    });
    const result = await adapter.list("dir");
    expect(bucket.list).toHaveBeenCalledWith("dir", { limit: 1000 });
    expect(result.entries.map((e) => e.key)).toEqual(["dir/a.txt", "dir/z.txt"]);
    expect(result.entries[0]).toMatchObject({
      key: "dir/a.txt",
      uri: "supabase://uploads/dir/a.txt",
      size: 10,
      contentType: "text/plain",
      modifiedAt: new Date("2020-01-01T00:00:00.000Z").getTime()
    });
    expect(result.commonPrefixes).toEqual([]);
  });

  it("collects pseudo-directories as commonPrefixes only with a '/' delimiter", async () => {
    const entries: SupabaseObjectEntry[] = [
      { name: "sub", id: null },
      { name: "file.txt", id: "1", metadata: { size: 3 } }
    ];
    const { adapter } = makeAdapter({
      list: vi.fn(async () => ({ data: entries, error: null }))
    });
    const withDelim = await adapter.list("root", { delimiter: "/" });
    expect(withDelim.commonPrefixes).toEqual(["root/sub/"]);
    expect(withDelim.entries.map((e) => e.key)).toEqual(["root/file.txt"]);

    const noDelim = await adapter.list("root");
    expect(noDelim.commonPrefixes).toEqual([]);
  });

  it("defaults size to 0 and omits contentType when metadata absent", async () => {
    const { adapter } = makeAdapter({
      list: vi.fn(async () => ({
        data: [{ name: "x", id: "1" }],
        error: null
      }))
    });
    const before = Date.now();
    const result = await adapter.list("");
    expect(result.entries[0].key).toBe("x");
    expect(result.entries[0].size).toBe(0);
    expect(result.entries[0].contentType).toBeUndefined();
    expect(result.entries[0].modifiedAt).toBeGreaterThanOrEqual(before);
  });

  it("lists at the bucket root for empty prefix and '/'", async () => {
    const { adapter, bucket } = makeAdapter();
    await adapter.list("");
    await adapter.list("/");
    expect(bucket.list).toHaveBeenNthCalledWith(1, "", { limit: 1000 });
    expect(bucket.list).toHaveBeenNthCalledWith(2, "", { limit: 1000 });
  });

  it("strips a trailing slash left by normalization", async () => {
    const { adapter, bucket } = makeAdapter();
    await adapter.list("foo/");
    expect(bucket.list).toHaveBeenCalledWith("foo", { limit: 1000 });
  });

  it("returns empty result for path-traversal prefixes", async () => {
    const { adapter, bucket } = makeAdapter();
    const result = await adapter.list("../../etc");
    expect(result).toEqual({ entries: [], commonPrefixes: [] });
    expect(bucket.list).not.toHaveBeenCalled();
  });

  it("returns empty result when list errors", async () => {
    const { adapter } = makeAdapter({
      list: vi.fn(async () => ({ data: null, error: { message: "boom" } }))
    });
    expect(await adapter.list("dir")).toEqual({ entries: [], commonPrefixes: [] });
  });
});

describe("SupabaseStorageAdapter stat", () => {
  it("returns stat for a matching nested key", async () => {
    const { adapter, bucket } = makeAdapter({
      list: vi.fn(async () => ({
        data: [
          {
            name: "file.txt",
            id: "1",
            updated_at: "2022-06-01T00:00:00.000Z",
            metadata: { size: 42, mimetype: "text/plain" }
          }
        ],
        error: null
      }))
    });
    const stat = await adapter.stat("supabase://uploads/dir/file.txt");
    expect(bucket.list).toHaveBeenCalledWith("dir", { search: "file.txt", limit: 1 });
    expect(stat).toEqual({
      key: "dir/file.txt",
      size: 42,
      modifiedAt: new Date("2022-06-01T00:00:00.000Z").getTime(),
      contentType: "text/plain"
    });
  });

  it("defaults size and modifiedAt when metadata / updated_at missing", async () => {
    const { adapter } = makeAdapter({
      list: vi.fn(async () => ({ data: [{ name: "top.txt", id: "1" }], error: null }))
    });
    const before = Date.now();
    const stat = await adapter.stat("supabase://uploads/top.txt");
    expect(stat?.key).toBe("top.txt");
    expect(stat?.size).toBe(0);
    expect(stat?.contentType).toBeUndefined();
    expect(stat?.modifiedAt).toBeGreaterThanOrEqual(before);
  });

  it("returns null when no entry matches the name", async () => {
    const { adapter } = makeAdapter({
      list: vi.fn(async () => ({ data: [{ name: "other.txt", id: "1" }], error: null }))
    });
    expect(await adapter.stat("supabase://uploads/file.txt")).toBeNull();
  });

  it("returns null when list errors", async () => {
    const { adapter } = makeAdapter({
      list: vi.fn(async () => ({ data: null, error: { message: "x" } }))
    });
    expect(await adapter.stat("supabase://uploads/file.txt")).toBeNull();
  });

  it("returns null for foreign / malformed uris", async () => {
    const { adapter } = makeAdapter();
    expect(await adapter.stat("supabase://other/file.txt")).toBeNull();
    expect(await adapter.stat("http://x/y")).toBeNull();
  });
});

describe("SupabaseStorageAdapter getPublicUrl", () => {
  it("returns the client public url for a valid uri", () => {
    const { adapter } = makeAdapter();
    expect(adapter.getPublicUrl("supabase://uploads/foo.png")).toBe(
      "https://x.supabase.co/pub/foo.png"
    );
  });

  it("returns null for foreign / non-supabase uris", () => {
    const { adapter } = makeAdapter();
    expect(adapter.getPublicUrl("supabase://other/foo.png")).toBeNull();
    expect(adapter.getPublicUrl("file:///x")).toBeNull();
  });
});

describe("SupabaseStorageAdapter constructor validation", () => {
  it("requires url, apiKey, bucket", () => {
    expect(
      () => new SupabaseStorageAdapter({ url: "", apiKey: "k", bucket: "b" })
    ).toThrow(/URL is required/);
    expect(
      () => new SupabaseStorageAdapter({ url: "u", apiKey: "", bucket: "b" })
    ).toThrow(/API key is required/);
    expect(
      () => new SupabaseStorageAdapter({ url: "u", apiKey: "k", bucket: "" })
    ).toThrow(/bucket is required/);
  });
});

describe("SupabaseStorageAdapter lazy client (fetch-backed)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a real fetch-backed client when none is injected", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    // No `client` option → getClient() lazily builds one via createSupabaseStorageClient.
    const adapter = new SupabaseStorageAdapter({
      url: "https://proj.supabase.co/",
      apiKey: "svc",
      bucket: "assets"
    });
    const uri = await adapter.store("f.txt", new Uint8Array([1]), "text/plain");
    expect(uri).toBe("supabase://assets/f.txt");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://proj.supabase.co/storage/v1/object/assets/f.txt");
  });
});
