import { describe, it, expect, vi } from "vitest";
import { S3Client, S3Error } from "../src/s3/client.js";

const credentials = {
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "secret"
};

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetch(
  response: { status?: number; body?: string | Uint8Array; headers?: Record<string, string> } = {}
): FetchMock {
  return vi.fn(async () => {
    const status = response.status ?? 200;
    return new Response(
      response.body !== undefined
        ? typeof response.body === "string"
          ? response.body
          : new Uint8Array(response.body)
        : null,
      { status, headers: response.headers ?? {} }
    );
  });
}

function client(fetchFn: FetchMock, opts: Record<string, unknown> = {}): S3Client {
  return new S3Client({
    region: "us-east-1",
    credentials,
    fetchFn: fetchFn as unknown as typeof fetch,
    ...opts
  });
}

function requestOf(fetchFn: FetchMock): { url: string; init: RequestInit } {
  const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
  return { url, init };
}

describe("S3Client addressing", () => {
  it("uses virtual-hosted URLs for AWS endpoints", async () => {
    const fetchFn = mockFetch();
    await client(fetchFn).putObject({
      bucket: "my-bucket",
      key: "a/b c.txt",
      body: new Uint8Array([1]),
      contentType: "text/plain"
    });
    const { url, init } = requestOf(fetchFn);
    expect(url).toBe(
      "https://my-bucket.s3.us-east-1.amazonaws.com/a/b%20c.txt"
    );
    expect(init.method).toBe("PUT");
    const headers = init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("text/plain");
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/
    );
    // SHA-256 of [1]
    expect(headers["x-amz-content-sha256"]).toBe(
      "4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a"
    );
  });

  it("uses path-style URLs for endpoint overrides (MinIO)", async () => {
    const fetchFn = mockFetch();
    await client(fetchFn, { endpoint: "http://minio:9000" }).getObject({
      bucket: "bucket",
      key: "dir/file.bin"
    });
    const { url } = requestOf(fetchFn);
    expect(url).toBe("http://minio:9000/bucket/dir/file.bin");
  });

  it("supports virtual-hosted addressing on custom endpoints when forcePathStyle is false", async () => {
    const fetchFn = mockFetch();
    await client(fetchFn, {
      endpoint: "https://r2.example.com",
      forcePathStyle: false
    }).getObject({ bucket: "b", key: "k" });
    const { url } = requestOf(fetchFn);
    expect(url).toBe("https://b.r2.example.com/k");
  });
});

describe("S3Client operations", () => {
  it("getObject returns body and metadata", async () => {
    const fetchFn = mockFetch({
      body: new Uint8Array([104, 105]),
      headers: {
        "content-type": "text/plain",
        "content-length": "2",
        "last-modified": "Fri, 24 May 2013 00:00:00 GMT",
        etag: '"abc123"'
      }
    });
    const result = await client(fetchFn).getObject({ bucket: "b", key: "k" });
    expect(Buffer.from(result.body).toString()).toBe("hi");
    expect(result.contentType).toBe("text/plain");
    expect(result.contentLength).toBe(2);
    expect(result.lastModified?.toISOString()).toBe("2013-05-24T00:00:00.000Z");
    expect(result.etag).toBe('"abc123"');
  });

  it("putObject returns the ETag response header", async () => {
    const fetchFn = mockFetch({ headers: { etag: '"d41d8cd9"' } });
    const result = await client(fetchFn).putObject({
      bucket: "b",
      key: "k",
      body: new Uint8Array()
    });
    expect(result.etag).toBe('"d41d8cd9"');
  });

  it("headObject sends HEAD and parses metadata", async () => {
    const fetchFn = mockFetch({
      headers: { "content-length": "42", "content-type": "image/png" }
    });
    const result = await client(fetchFn).headObject({ bucket: "b", key: "k" });
    expect(requestOf(fetchFn).init.method).toBe("HEAD");
    expect(result.contentLength).toBe(42);
    expect(result.contentType).toBe("image/png");
  });

  it("deleteObject sends DELETE", async () => {
    const fetchFn = mockFetch({ status: 204 });
    await client(fetchFn).deleteObject({ bucket: "b", key: "k" });
    expect(requestOf(fetchFn).init.method).toBe("DELETE");
  });

  it("copyObject sends x-amz-copy-source and surfaces in-body errors", async () => {
    const fetchFn = mockFetch({ body: "<CopyObjectResult><ETag>x</ETag></CopyObjectResult>" });
    await client(fetchFn).copyObject({
      sourceBucket: "src",
      sourceKey: "dir/old name.txt",
      bucket: "dst",
      key: "new.txt"
    });
    const headers = requestOf(fetchFn).init.headers as Record<string, string>;
    expect(headers["x-amz-copy-source"]).toBe("/src/dir/old%20name.txt");

    const failing = mockFetch({
      body: "<Error><Code>InternalError</Code><Message>oops</Message></Error>"
    });
    await expect(
      client(failing).copyObject({
        sourceBucket: "src",
        sourceKey: "a",
        bucket: "dst",
        key: "b"
      })
    ).rejects.toMatchObject({ code: "InternalError", message: "oops" });
  });

  it("listObjectsV2 sends list-type=2 and parses the XML response", async () => {
    const fetchFn = mockFetch({
      body: `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>b</Name>
  <IsTruncated>true</IsTruncated>
  <NextContinuationToken>tok+1/2=</NextContinuationToken>
  <Contents>
    <Key>photos/a &amp; b.png</Key>
    <LastModified>2013-05-24T00:00:00.000Z</LastModified>
    <ETag>&quot;etag1&quot;</ETag>
    <Size>1234</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>
  <Contents>
    <Key>photos/c.png</Key>
    <Size>7</Size>
  </Contents>
  <CommonPrefixes><Prefix>photos/albums/</Prefix></CommonPrefixes>
</ListBucketResult>`
    });
    const result = await client(fetchFn).listObjectsV2({
      bucket: "b",
      prefix: "photos/",
      delimiter: "/",
      maxKeys: 100
    });
    const { url } = requestOf(fetchFn);
    expect(url).toBe(
      "https://b.s3.us-east-1.amazonaws.com/?delimiter=%2F&list-type=2&max-keys=100&prefix=photos%2F"
    );
    expect(result.contents).toEqual([
      {
        key: "photos/a & b.png",
        size: 1234,
        lastModified: new Date("2013-05-24T00:00:00.000Z"),
        etag: '"etag1"',
        storageClass: "STANDARD"
      },
      { key: "photos/c.png", size: 7 }
    ]);
    expect(result.commonPrefixes).toEqual(["photos/albums/"]);
    expect(result.isTruncated).toBe(true);
    expect(result.nextContinuationToken).toBe("tok+1/2=");
  });

  it("listBuckets parses ListAllMyBucketsResult", async () => {
    const fetchFn = mockFetch({
      body: `<ListAllMyBucketsResult><Buckets>
  <Bucket><Name>alpha</Name><CreationDate>2020-01-01T00:00:00.000Z</CreationDate></Bucket>
  <Bucket><Name>beta</Name></Bucket>
</Buckets></ListAllMyBucketsResult>`
    });
    const buckets = await client(fetchFn).listBuckets();
    expect(requestOf(fetchFn).url).toBe("https://s3.us-east-1.amazonaws.com/");
    expect(buckets).toEqual([
      { name: "alpha", creationDate: new Date("2020-01-01T00:00:00.000Z") },
      { name: "beta" }
    ]);
  });

  it("presignGetObject builds a presigned URL with the X-Amz-* params", () => {
    const url = client(mockFetch()).presignGetObject({
      bucket: "b",
      key: "dir/f.txt",
      expiresIn: 900
    });
    const parsed = new URL(url);
    expect(parsed.host).toBe("b.s3.us-east-1.amazonaws.com");
    expect(parsed.pathname).toBe("/dir/f.txt");
    expect(parsed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(parsed.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(parsed.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("S3Client error mapping", () => {
  it("maps a 404 NoSuchKey XML body to an S3Error with that code", async () => {
    const fetchFn = mockFetch({
      status: 404,
      body: "<?xml version=\"1.0\"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>"
    });
    const error = await client(fetchFn)
      .getObject({ bucket: "b", key: "missing" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(S3Error);
    const s3Error = error as S3Error;
    expect(s3Error.code).toBe("NoSuchKey");
    expect(s3Error.name).toBe("NoSuchKey");
    expect(s3Error.statusCode).toBe(404);
    expect(s3Error.message).toBe("The specified key does not exist.");
  });

  it("maps a bodyless 404 (HEAD) to NotFound", async () => {
    const fetchFn = mockFetch({ status: 404 });
    await expect(
      client(fetchFn).headObject({ bucket: "b", key: "missing" })
    ).rejects.toMatchObject({ code: "NotFound", statusCode: 404 });
  });

  it("maps AccessDenied to an S3Error with status 403", async () => {
    const fetchFn = mockFetch({
      status: 403,
      body: "<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>"
    });
    await expect(
      client(fetchFn).putObject({ bucket: "b", key: "k", body: new Uint8Array([1]) })
    ).rejects.toMatchObject({ code: "AccessDenied", statusCode: 403 });
  });

  it("throws a clear error when no credentials are available", async () => {
    const fetchFn = mockFetch();
    const prevKey = process.env.AWS_ACCESS_KEY_ID;
    const prevSecret = process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    try {
      const bare = new S3Client({ fetchFn: fetchFn as unknown as typeof fetch });
      await expect(
        bare.getObject({ bucket: "b", key: "k" })
      ).rejects.toThrow(/AWS credentials not found/);
    } finally {
      if (prevKey !== undefined) process.env.AWS_ACCESS_KEY_ID = prevKey;
      if (prevSecret !== undefined) process.env.AWS_SECRET_ACCESS_KEY = prevSecret;
    }
  });
});
