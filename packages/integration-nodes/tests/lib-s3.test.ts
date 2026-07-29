import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  S3ListBucketsLibNode,
  S3ListObjectsLibNode,
  S3GetObjectLibNode,
  S3PutObjectLibNode,
  S3DeleteObjectLibNode,
  S3CopyObjectLibNode,
  S3GetPresignedUrlLibNode
} from "../src/nodes/lib-s3.js";

const secrets = {
  AWS_ACCESS_KEY_ID: "AKIDEXAMPLE",
  AWS_SECRET_ACCESS_KEY: "secret"
};

const mockFetch = vi.fn();

function respond(
  status = 200,
  body: string | null = null,
  headers: Record<string, string> = {}
): void {
  mockFetch.mockResolvedValueOnce(new Response(body, { status, headers }));
}

function requestAt(index: number): { url: string; init: RequestInit } {
  const [url, init] = mockFetch.mock.calls[index] as [string, RequestInit];
  return { url, init };
}

// Nodes read credentials from the `_secrets` dynamic property.
function makeNode<
  T extends { setDynamic(key: string, value: unknown): void }
>(node: T): T {
  node.setDynamic("_secrets", secrets);
  return node;
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lib.s3 nodes", () => {
  it("ListBuckets parses the bucket list", async () => {
    respond(
      200,
      "<ListAllMyBucketsResult><Buckets><Bucket><Name>alpha</Name><CreationDate>2020-01-01T00:00:00.000Z</CreationDate></Bucket></Buckets></ListAllMyBucketsResult>"
    );
    const node = makeNode(new S3ListBucketsLibNode({}));
    const result = await node.process();
    expect(result.output).toEqual([
      { name: "alpha", creation_date: "2020-01-01T00:00:00.000Z" }
    ]);
    expect(requestAt(0).url).toBe("https://s3.us-east-1.amazonaws.com/");
  });

  it("ListObjects lists with prefix and max keys", async () => {
    respond(
      200,
      `<ListBucketResult><IsTruncated>false</IsTruncated>
<Contents><Key>docs/a.txt</Key><Size>3</Size><LastModified>2020-01-02T00:00:00.000Z</LastModified><ETag>&quot;e1&quot;</ETag><StorageClass>STANDARD</StorageClass></Contents>
</ListBucketResult>`
    );
    const node = makeNode(
      new S3ListObjectsLibNode({ bucket: "b", prefix: "docs/", max_keys: 5 })
    );
    const result = await node.process();
    expect(requestAt(0).url).toBe(
      "https://b.s3.us-east-1.amazonaws.com/?list-type=2&max-keys=5&prefix=docs%2F"
    );
    expect(result.objects).toEqual([
      {
        key: "docs/a.txt",
        size: 3,
        last_modified: "2020-01-02T00:00:00.000Z",
        etag: '"e1"',
        storage_class: "STANDARD"
      }
    ]);
  });

  it("GetObject returns text content and metadata", async () => {
    respond(200, "hello s3", {
      "content-type": "text/plain",
      "content-length": "8"
    });
    const node = makeNode(new S3GetObjectLibNode({ bucket: "b", key: "k.txt" }));
    const result = await node.process();
    expect(result.output).toBe("hello s3");
    expect(result.content_type).toBe("text/plain");
    expect(result.size).toBe(8);
  });

  it("GetObject surfaces NoSuchKey errors", async () => {
    respond(
      404,
      "<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>"
    );
    const node = makeNode(new S3GetObjectLibNode({ bucket: "b", key: "nope" }));
    await expect(node.process()).rejects.toThrow(
      "The specified key does not exist."
    );
  });

  it("PutObject uploads text and returns the ETag", async () => {
    respond(200, null, { etag: '"abc"' });
    const node = makeNode(
      new S3PutObjectLibNode({ bucket: "b", key: "k.txt", body: "hi" })
    );
    const result = await node.process();
    const { url, init } = requestAt(0);
    expect(url).toBe("https://b.s3.us-east-1.amazonaws.com/k.txt");
    expect(init.method).toBe("PUT");
    expect(result).toEqual({ output: true, etag: '"abc"' });
  });

  // Executor-level: secrets flow through BaseNode's requiredSettings
  // resolution, and the optional AWS_SESSION_TOKEN is looked up from the
  // context's secret store (it can't ride requiredSettings — the UI treats
  // those as mandatory).
  it("resolves and signs AWS_SESSION_TOKEN through the context secret store", async () => {
    respond(204);
    const store: Record<string, string> = {
      ...secrets,
      AWS_SESSION_TOKEN: "tok123"
    };
    const context = {
      getSecret: async (key: string) => store[key] ?? null
    } as unknown as ProcessingContext;
    const node = new S3DeleteObjectLibNode({ bucket: "b", key: "k" });
    await node.toExecutor().process({}, context);
    const { init } = requestAt(0);
    const headers = init.headers as Record<string, string>;
    expect(headers["x-amz-security-token"]).toBe("tok123");
    expect(headers.authorization).toContain("x-amz-security-token");
    expect(headers.authorization).toContain(`Credential=${secrets.AWS_ACCESS_KEY_ID}/`);
  });

  it("works without AWS_SESSION_TOKEN (long-lived credentials stay optional)", async () => {
    respond(204);
    const store: Record<string, string> = { ...secrets };
    const context = {
      getSecret: async (key: string) => store[key] ?? null
    } as unknown as ProcessingContext;
    const node = new S3DeleteObjectLibNode({ bucket: "b", key: "k" });
    await node.toExecutor().process({}, context);
    const headers = requestAt(0).init.headers as Record<string, string>;
    expect(headers["x-amz-security-token"]).toBeUndefined();
  });

  it("DeleteObject sends DELETE", async () => {
    respond(204);
    const node = makeNode(new S3DeleteObjectLibNode({ bucket: "b", key: "k" }));
    const result = await node.process();
    expect(requestAt(0).init.method).toBe("DELETE");
    expect(result).toEqual({ output: true });
  });

  it("CopyObject sends x-amz-copy-source", async () => {
    respond(200, "<CopyObjectResult><ETag>x</ETag></CopyObjectResult>");
    const node = makeNode(
      new S3CopyObjectLibNode({
        source_bucket: "src",
        source_key: "a/b.txt",
        dest_bucket: "dst",
        dest_key: "c.txt"
      })
    );
    const result = await node.process();
    const { url, init } = requestAt(0);
    expect(url).toBe("https://dst.s3.us-east-1.amazonaws.com/c.txt");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-amz-copy-source"]).toBe("/src/a/b.txt");
    expect(result).toEqual({ output: true });
  });

  it("GetPresignedUrl returns a signed URL without any request", async () => {
    const node = makeNode(
      new S3GetPresignedUrlLibNode({ bucket: "b", key: "k.txt", expires_in: 600 })
    );
    const result = await node.process();
    const url = new URL(String(result.output));
    expect(url.host).toBe("b.s3.us-east-1.amazonaws.com");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws without AWS credentials", async () => {
    const node = new S3ListBucketsLibNode({});
    await expect(node.process()).rejects.toThrow("AWS credentials are required");
  });
});
