import { describe, it, expect, vi } from "vitest";
import { S3Client } from "../src/s3/client.js";

const credentials = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" };

function retryClient(
  fetchFn: ReturnType<typeof vi.fn>,
  sleeps: number[]
): S3Client {
  return new S3Client({
    region: "us-east-1",
    credentials,
    fetchFn: fetchFn as unknown as typeof fetch,
    retry: {
      maxAttempts: 3,
      sleepFn: async (ms) => {
        sleeps.push(ms);
      }
    }
  });
}

function errorResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(
    `<Error><Code>HTTP${status}</Code><Message>status ${status}</Message></Error>`,
    { status, headers }
  );
}

describe("S3Client retries", () => {
  it("retries a network failure with exponential backoff, then succeeds", async () => {
    const sleeps: number[] = [];
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("hi", { status: 200 }));
    const result = await retryClient(fetchFn, sleeps).getObject({
      bucket: "b",
      key: "k"
    });
    expect(Buffer.from(result.body).toString()).toBe("hi");
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([100, 200]);
  });

  it("retries 5xx responses and re-signs each attempt", async () => {
    const sleeps: number[] = [];
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await retryClient(fetchFn, sleeps).headObject({ bucket: "b", key: "k" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const authOf = (call: unknown[]): string =>
      ((call[1] as RequestInit).headers as Record<string, string>).authorization;
    expect(authOf(fetchFn.mock.calls[0])).toMatch(/^AWS4-HMAC-SHA256/);
    expect(authOf(fetchFn.mock.calls[1])).toMatch(/^AWS4-HMAC-SHA256/);
  });

  it("retries 429 and honors Retry-After seconds", async () => {
    const sleeps: number[] = [];
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429, { "retry-after": "2" }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await retryClient(fetchFn, sleeps).deleteObject({ bucket: "b", key: "k" });
    expect(sleeps).toEqual([2000]);
  });

  it("retries PutObject (idempotent full-body upload)", async () => {
    const sleeps: number[] = [];
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { etag: '"e"' } }));
    const result = await retryClient(fetchFn, sleeps).putObject({
      bucket: "b",
      key: "k",
      body: new Uint8Array([1, 2])
    });
    expect(result.etag).toBe('"e"');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("does not retry permanent 4xx errors", async () => {
    const sleeps: number[] = [];
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        "<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>",
        { status: 403 }
      )
    );
    await expect(
      retryClient(fetchFn, sleeps).getObject({ bucket: "b", key: "k" })
    ).rejects.toMatchObject({ code: "AccessDenied", statusCode: 403 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("gives up after maxAttempts and surfaces the last error", async () => {
    const sleeps: number[] = [];
    // Fresh Response per call — each attempt consumes the error body.
    const fetchFn = vi.fn().mockImplementation(async () => errorResponse(503));
    await expect(
      retryClient(fetchFn, sleeps).listObjectsV2({ bucket: "b" })
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([100, 200]);
  });

  it("does not retry CopyObject (not in the idempotent-retry set)", async () => {
    const sleeps: number[] = [];
    const fetchFn = vi.fn().mockResolvedValue(errorResponse(500));
    await expect(
      retryClient(fetchFn, sleeps).copyObject({
        sourceBucket: "s",
        sourceKey: "a",
        bucket: "d",
        key: "b"
      })
    ).rejects.toMatchObject({ statusCode: 500 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
