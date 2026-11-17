/**
 * An S3-compatible endpoint that ignores `If-None-Match` overwrites on a
 * conditional put. `storeIfAbsent` probes the endpoint once, and refuses to
 * write when the endpoint does not honor the header.
 */
import { describe, expect, it } from "vitest";
import { S3StorageAdapter } from "../src/s3-storage-adapter.js";
import {
  ConditionalWriteUnsupportedError
} from "../src/s3-storage-adapter.js";
import { S3Error, type S3Api, type S3PutObjectInput } from "../src/s3/client.js";

interface FakeOptions {
  /** True when the endpoint ignores `If-None-Match`, as an old MinIO does. */
  ignoresIfNoneMatch?: boolean;
  /** Fail every delete, as a policy without `s3:DeleteObject` does. */
  deniesDelete?: boolean;
  /** Fail the first put with this status. */
  failFirstPut?: number;
}

function fakeS3(options: FakeOptions = {}): {
  client: S3Api;
  store: Map<string, Uint8Array>;
  puts: S3PutObjectInput[];
} {
  const store = new Map<string, Uint8Array>();
  const puts: S3PutObjectInput[] = [];
  let failed = false;
  const client: S3Api = {
    putObject: async (input) => {
      puts.push(input);
      if (options.failFirstPut && !failed) {
        failed = true;
        throw new S3Error("InternalError", "try later", options.failFirstPut);
      }
      const key = `${input.bucket}/${input.key}`;
      if (
        input.ifNoneMatch === "*" &&
        !options.ignoresIfNoneMatch &&
        store.has(key)
      ) {
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
      if (options.deniesDelete) {
        throw new S3Error("AccessDenied", "denied", 403);
      }
      store.delete(`${input.bucket}/${input.key}`);
    },
    listObjectsV2: async () => ({
      contents: [],
      commonPrefixes: [],
      isTruncated: false
    })
  };
  return { client, store, puts };
}

const FIRST = new Uint8Array([1, 1, 1]);
const SECOND = new Uint8Array([2, 2]);

describe("S3StorageAdapter.storeIfAbsent capability probe", () => {
  it("refuses, and writes nothing, when the endpoint ignores If-None-Match", async () => {
    const { client, store } = fakeS3({ ignoresIfNoneMatch: true });
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    await expect(adapter.storeIfAbsent("a/x.bin", FIRST)).rejects.toBeInstanceOf(
      ConditionalWriteUnsupportedError
    );
    await expect(adapter.storeIfAbsent("a/x.bin", FIRST)).rejects.toThrow(
      /If-None-Match/
    );
    // The caller's key was never written, and the probe object is gone.
    expect([...store.keys()]).toEqual([]);
  });

  it("never replaces an object, even through an endpoint that ignores the header", async () => {
    const { client, store } = fakeS3({ ignoresIfNoneMatch: true });
    store.set("b/a/x.bin", FIRST);
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    await expect(adapter.storeIfAbsent("a/x.bin", SECOND)).rejects.toThrow();
    expect(store.get("b/a/x.bin")).toEqual(FIRST);
  });

  it("probes once, then writes through when the endpoint honors the header", async () => {
    const { client, store, puts } = fakeS3();
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    expect(await adapter.storeIfAbsent("a/x.bin", FIRST)).toBe("s3://b/a/x.bin");
    expect(await adapter.storeIfAbsent("a/x.bin", SECOND)).toBeNull();
    expect(await adapter.storeIfAbsent("a/y.bin", SECOND)).toBe("s3://b/a/y.bin");
    expect(store.get("b/a/x.bin")).toEqual(FIRST);
    // Two probe puts, then the three caller puts.
    expect(puts).toHaveLength(5);
    expect([...store.keys()].sort()).toEqual(["b/a/x.bin", "b/a/y.bin"]);
  });

  it("probes under the adapter prefix", async () => {
    const { client, puts } = fakeS3();
    const adapter = new S3StorageAdapter({ bucket: "b", prefix: "p", client });
    await adapter.storeIfAbsent("x.bin", FIRST);
    expect(puts[0].key.startsWith("p/")).toBe(true);
  });

  it("shares one probe between concurrent first writes", async () => {
    const { client, puts } = fakeS3();
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    const results = await Promise.all([
      adapter.storeIfAbsent("a.bin", FIRST),
      adapter.storeIfAbsent("b.bin", FIRST),
      adapter.storeIfAbsent("c.bin", FIRST)
    ]);
    expect(results.every((uri) => uri !== null)).toBe(true);
    expect(puts).toHaveLength(5);
  });

  it("still reports support when the probe object cannot be deleted", async () => {
    const { client } = fakeS3({ deniesDelete: true });
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    expect(await adapter.storeIfAbsent("a.bin", FIRST)).toBe("s3://b/a.bin");
  });

  it("does not remember a probe that failed for another reason", async () => {
    const { client } = fakeS3({ failFirstPut: 500 });
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    await expect(adapter.storeIfAbsent("a.bin", FIRST)).rejects.not.toBeInstanceOf(
      ConditionalWriteUnsupportedError
    );
    expect(await adapter.storeIfAbsent("a.bin", FIRST)).toBe("s3://b/a.bin");
  });

  it("leaves plain store untouched on an endpoint that ignores the header", async () => {
    const { client, store } = fakeS3({ ignoresIfNoneMatch: true });
    const adapter = new S3StorageAdapter({ bucket: "b", client });
    await adapter.store("a.bin", FIRST);
    expect(store.get("b/a.bin")).toEqual(FIRST);
  });
});
