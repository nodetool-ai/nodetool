import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { S3StorageAdapter } from "../src/s3-storage-adapter.js";
import { S3Error, type S3Api } from "../src/s3/client.js";

// A fully spyable in-memory S3 fake. Each method is a vi.fn so calls can be
// inspected; individual tests override methods to drive error branches.
function makeClient(overrides: Partial<S3Api> = {}): S3Api {
  const store = new Map<string, Uint8Array>();
  const base: S3Api = {
    putObject: vi.fn(async (input) => {
      store.set(`${input.bucket}/${input.key}`, new Uint8Array(input.body));
      return {};
    }),
    getObject: vi.fn(async (input) => {
      const body = store.get(`${input.bucket}/${input.key}`);
      if (!body) throw new S3Error("NoSuchKey", "missing", 404);
      return { body };
    }),
    headObject: vi.fn(async (input) => {
      const body = store.get(`${input.bucket}/${input.key}`);
      if (!body) throw new S3Error("NotFound", "Not Found", 404);
      return { contentLength: body.byteLength };
    }),
    deleteObject: vi.fn(async (input) => {
      store.delete(`${input.bucket}/${input.key}`);
    }),
    listObjectsV2: vi.fn(async () => ({
      contents: [],
      commonPrefixes: [],
      isTruncated: false
    }))
  };
  return { ...base, ...overrides };
}

describe("S3StorageAdapter constructor", () => {
  it("throws for an empty bucket", () => {
    expect(() => new S3StorageAdapter({ bucket: "" })).toThrow(/bucket is required/);
  });

  it("normalizes a supplied prefix", () => {
    const adapter = new S3StorageAdapter({ bucket: "b", prefix: "runs//r1" });
    expect(adapter.prefix).toBe("runs/r1");
  });

  it("leaves prefix null when not supplied", () => {
    const adapter = new S3StorageAdapter({ bucket: "b" });
    expect(adapter.prefix).toBeNull();
  });
});

describe("S3StorageAdapter store", () => {
  it("uploads under the joined prefix and returns the s3 uri", async () => {
    const client = makeClient();
    const adapter = new S3StorageAdapter({ bucket: "b", prefix: "runs/r1", client });
    const uri = await adapter.store("out.bin", new Uint8Array([1, 2]), "image/png");
    expect(uri).toBe("s3://b/runs/r1/out.bin");
    expect(client.putObject).toHaveBeenCalledWith({
      bucket: "b",
      key: "runs/r1/out.bin",
      body: expect.any(Uint8Array),
      contentType: "image/png"
    });
  });

  it("omits contentType when not provided and works without a prefix", async () => {
    const client = makeClient();
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    const uri = await adapter.store("k.bin", new Uint8Array([1]));
    expect(uri).toBe("s3://b/k.bin");
    expect(client.putObject).toHaveBeenCalledWith({
      bucket: "b",
      key: "k.bin",
      body: expect.any(Uint8Array)
    });
  });

  it("wraps upload failures with the s3 target and cause", async () => {
    const client = makeClient({
      putObject: vi.fn(async () => {
        throw new S3Error("AccessDenied", "denied", 403);
      })
    });
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    await expect(adapter.store("k.bin", new Uint8Array([1]))).rejects.toThrow(
      /S3 upload failed for s3:\/\/b\/k\.bin: denied/
    );
  });

  it("stringifies a non-Error throw in the failure message", async () => {
    const client = makeClient({
      putObject: vi.fn(async () => {
        throw "raw string failure";
      })
    });
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    await expect(adapter.store("k.bin", new Uint8Array([1]))).rejects.toThrow(
      /raw string failure/
    );
  });
});

describe("S3StorageAdapter uriForKey", () => {
  it("joins the prefix into the uri", () => {
    const adapter = new S3StorageAdapter({ bucket: "b", prefix: "p" });
    expect(adapter.uriForKey("a.txt")).toBe("s3://b/p/a.txt");
  });

  it("omits the prefix when none is set", () => {
    const adapter = new S3StorageAdapter({ bucket: "b" });
    expect(adapter.uriForKey("a.txt")).toBe("s3://b/a.txt");
  });
});

describe("S3StorageAdapter retrieve", () => {
  it("returns the body for an existing object", async () => {
    const client = makeClient();
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    await adapter.store("k.bin", new Uint8Array([7, 8, 9]));
    expect(await adapter.retrieve("s3://b/k.bin")).toEqual(new Uint8Array([7, 8, 9]));
  });

  it("returns null on getObject failure", async () => {
    const client = makeClient();
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    expect(await adapter.retrieve("s3://b/missing")).toBeNull();
  });

  it("returns null for foreign bucket and non-s3 uris", async () => {
    const adapter = new S3StorageAdapter({ bucket: "b", client: makeClient() });
    expect(await adapter.retrieve("s3://other/k")).toBeNull();
    expect(await adapter.retrieve("file:///x")).toBeNull();
    expect(await adapter.retrieve("s3://b/")).toBeNull();
  });
});

describe("S3StorageAdapter exists", () => {
  it("returns true when headObject succeeds", async () => {
    const client = makeClient();
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    await adapter.store("k.bin", new Uint8Array([1]));
    expect(await adapter.exists("s3://b/k.bin")).toBe(true);
  });

  it("returns false when headObject throws", async () => {
    const adapter = new S3StorageAdapter({ bucket: "b", client: makeClient() });
    expect(await adapter.exists("s3://b/missing")).toBe(false);
  });

  it("returns false for foreign / malformed uris", async () => {
    const adapter = new S3StorageAdapter({ bucket: "b", client: makeClient() });
    expect(await adapter.exists("s3://other/k")).toBe(false);
    expect(await adapter.exists("memory://k")).toBe(false);
  });
});

describe("S3StorageAdapter delete", () => {
  it("deletes an existing object and returns true", async () => {
    const client = makeClient();
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    await adapter.store("k.bin", new Uint8Array([1]));
    expect(await adapter.delete("s3://b/k.bin")).toBe(true);
    expect(client.deleteObject).toHaveBeenCalledWith({ bucket: "b", key: "k.bin" });
  });

  it("returns false when the object does not exist (no delete call)", async () => {
    const client = makeClient();
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    expect(await adapter.delete("s3://b/missing")).toBe(false);
    expect(client.deleteObject).not.toHaveBeenCalled();
  });

  it("returns false when deleteObject itself throws", async () => {
    const client = makeClient({
      headObject: vi.fn(async () => ({ contentLength: 1 })),
      deleteObject: vi.fn(async () => {
        throw new S3Error("AccessDenied", "denied", 403);
      })
    });
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    expect(await adapter.delete("s3://b/k.bin")).toBe(false);
  });

  it("returns false for foreign / malformed uris", async () => {
    const adapter = new S3StorageAdapter({ bucket: "b", client: makeClient() });
    expect(await adapter.delete("s3://other/k")).toBe(false);
    expect(await adapter.delete("nope://x")).toBe(false);
  });
});

describe("S3StorageAdapter list", () => {
  it("returns sorted entries and strips the adapter prefix from keys", async () => {
    const client = makeClient({
      listObjectsV2: vi.fn(async () => ({
        contents: [
          { key: "runs/r1/files/z.txt", size: 2, lastModified: new Date(2000) },
          { key: "runs/r1/files/a.txt", size: 1, lastModified: new Date(1000) },
          { key: "", size: 0 } // dropped: empty key
        ],
        commonPrefixes: ["runs/r1/files/sub/", ""],
        isTruncated: false
      }))
    });
    const adapter = new S3StorageAdapter({ bucket: "b", prefix: "runs/r1", client });
    const result = await adapter.list("files", { delimiter: "/" });
    expect(result.entries.map((e) => e.key)).toEqual(["files/a.txt", "files/z.txt"]);
    expect(result.entries[0]).toMatchObject({
      key: "files/a.txt",
      uri: "s3://b/runs/r1/files/a.txt",
      size: 1,
      modifiedAt: new Date(1000).getTime()
    });
    // Empty commonPrefix dropped, the real one stripped of the adapter prefix.
    expect(result.commonPrefixes).toEqual(["files/sub/"]);
    expect(client.listObjectsV2).toHaveBeenCalledWith({
      bucket: "b",
      prefix: "runs/r1/files/",
      delimiter: "/"
    });
  });

  it("strips a prefix containing regex metacharacters literally", async () => {
    // A prefix like `my.data+v1` must be stripped as a literal string, not as a
    // regex where `.` and `+` are wildcards.
    const client = makeClient({
      listObjectsV2: vi.fn(async () => ({
        contents: [
          { key: "my.data+v1/a.txt", size: 1, lastModified: new Date(1) },
          // A key that a `.`/`+`-as-wildcard regex would mis-strip: `myXdataYv1`
          // is not under the prefix and must be left untouched.
          { key: "myXdataYv1z/b.txt", size: 2, lastModified: new Date(2) }
        ],
        commonPrefixes: ["my.data+v1/sub/"],
        isTruncated: false
      }))
    });
    const adapter = new S3StorageAdapter({
      bucket: "b",
      prefix: "my.data+v1",
      client
    });
    const result = await adapter.list("files", { delimiter: "/" });
    expect(result.entries.map((e) => e.key)).toEqual([
      "a.txt",
      "myXdataYv1z/b.txt"
    ]);
    expect(result.commonPrefixes).toEqual(["sub/"]);
  });

  it("paginates across continuation tokens", async () => {
    const pages = [
      {
        contents: [{ key: "a.txt", size: 1, lastModified: new Date(1) }],
        commonPrefixes: [],
        isTruncated: true,
        nextContinuationToken: "tok"
      },
      {
        contents: [{ key: "b.txt", size: 2, lastModified: new Date(2) }],
        commonPrefixes: [],
        isTruncated: false
      }
    ];
    const calls: Array<Record<string, unknown>> = [];
    const client = makeClient({
      listObjectsV2: vi.fn(async (input) => {
        calls.push({ ...input });
        return pages[calls.length - 1];
      })
    });
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    const result = await adapter.list("files");
    expect(result.entries.map((e) => e.key)).toEqual(["a.txt", "b.txt"]);
    expect(calls[0]).toMatchObject({ prefix: "files" });
    expect(calls[1]).toMatchObject({ continuationToken: "tok" });
  });

  it("stops paginating when truncated but no next token is returned", async () => {
    const client = makeClient({
      listObjectsV2: vi.fn(async () => ({
        contents: [{ key: "only.txt", size: 1 }],
        commonPrefixes: [],
        isTruncated: true
      }))
    });
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    const result = await adapter.list("dir");
    expect(result.entries.map((e) => e.key)).toEqual(["only.txt"]);
    expect(client.listObjectsV2).toHaveBeenCalledTimes(1);
  });

  it("defaults modifiedAt to 0 when lastModified is absent", async () => {
    const client = makeClient({
      listObjectsV2: vi.fn(async () => ({
        contents: [{ key: "x.txt", size: 5 }],
        commonPrefixes: [],
        isTruncated: false
      }))
    });
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    const result = await adapter.list("dir");
    expect(result.entries[0].modifiedAt).toBe(0);
  });

  it("passes a bare prefix (no trailing slash) without a delimiter", async () => {
    const client = makeClient();
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    await adapter.list("dir");
    expect(client.listObjectsV2).toHaveBeenCalledWith({ bucket: "b", prefix: "dir" });
  });
});

describe("S3StorageAdapter stat", () => {
  it("returns stat with contentType and strips the prefix", async () => {
    const client = makeClient({
      headObject: vi.fn(async () => ({
        contentLength: 99,
        lastModified: new Date(5000),
        contentType: "image/png"
      }))
    });
    const adapter = new S3StorageAdapter({ bucket: "b", prefix: "runs/r1", client });
    const stat = await adapter.stat("s3://b/runs/r1/dir/file.png");
    expect(stat).toEqual({
      key: "dir/file.png",
      size: 99,
      modifiedAt: new Date(5000).getTime(),
      contentType: "image/png"
    });
  });

  it("defaults modifiedAt to 0 and omits contentType when absent", async () => {
    const client = makeClient({
      headObject: vi.fn(async () => ({ contentLength: 3 }))
    });
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    const stat = await adapter.stat("s3://b/k.bin");
    expect(stat).toEqual({ key: "k.bin", size: 3, modifiedAt: 0 });
  });

  it("returns null when headObject throws", async () => {
    const adapter = new S3StorageAdapter({ bucket: "b", client: makeClient() });
    expect(await adapter.stat("s3://b/missing")).toBeNull();
  });

  it("returns null for foreign / malformed uris", async () => {
    const adapter = new S3StorageAdapter({ bucket: "b", client: makeClient() });
    expect(await adapter.stat("s3://other/k")).toBeNull();
    expect(await adapter.stat("http://x/y")).toBeNull();
  });
});

describe("S3StorageAdapter lazy client", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDEXAMPLE");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "secret");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("builds a real S3Client (path-style) when none is injected", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    const adapter = new S3StorageAdapter({
      bucket: "b",
      endpoint: "http://localhost:9000",
      region: "us-west-2"
    });
    await adapter.store("k.bin", new Uint8Array([1]));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:9000/b/k.bin");
  });
});
