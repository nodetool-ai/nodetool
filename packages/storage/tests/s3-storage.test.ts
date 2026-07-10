import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { S3Storage } from "../src/s3-storage.js";

// S3Storage builds its own S3Client, so mock at the HTTP layer (global fetch).
const mockFetch = vi.fn();

function respond(
  status = 200,
  body: string | Uint8Array | null = null,
  headers: Record<string, string> = {}
): void {
  mockFetch.mockResolvedValueOnce(
    new Response(
      body === null ? null : typeof body === "string" ? body : new Uint8Array(body),
      { status, headers }
    )
  );
}

function requestAt(index: number): { url: string; init: RequestInit } {
  const [url, init] = mockFetch.mock.calls[index] as [string, RequestInit];
  return { url, init };
}

describe("S3Storage", () => {
  let storage: S3Storage;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDEXAMPLE");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "secret");
    storage = new S3Storage("my-bucket", "http://localhost:9000", "us-west-2");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe("upload", () => {
    it("PUTs the object with content type", async () => {
      respond();
      await storage.upload("test.txt", Buffer.from("hello"), "text/plain");
      const { url, init } = requestAt(0);
      expect(url).toBe("http://localhost:9000/my-bucket/test.txt");
      expect(init.method).toBe("PUT");
      const headers = init.headers as Record<string, string>;
      expect(headers["content-type"]).toBe("text/plain");
      expect(headers.authorization).toContain("AWS4-HMAC-SHA256");
    });

    it("omits content-type when not provided", async () => {
      respond();
      await storage.upload("test.txt", Buffer.from("hello"));
      const headers = requestAt(0).init.headers as Record<string, string>;
      expect(headers["content-type"]).toBeUndefined();
    });

    it("accepts plain Uint8Array data", async () => {
      respond();
      const data = new Uint8Array([72, 101, 108, 108, 111]);
      await storage.upload("test.bin", data, "application/octet-stream");
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  describe("download", () => {
    it("returns the body as a Buffer", async () => {
      respond(200, Buffer.from("file content"));
      const result = await storage.download("test.txt");
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe("file content");
      expect(requestAt(0).init.method).toBe("GET");
    });

    it("throws on NoSuchKey", async () => {
      respond(
        404,
        "<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>"
      );
      await expect(storage.download("missing.txt")).rejects.toThrow(
        "The specified key does not exist."
      );
    });
  });

  describe("delete", () => {
    it("sends DELETE for the key", async () => {
      respond(204);
      await storage.delete("test.txt");
      const { url, init } = requestAt(0);
      expect(init.method).toBe("DELETE");
      expect(url).toBe("http://localhost:9000/my-bucket/test.txt");
    });
  });

  describe("exists", () => {
    it("returns true when HEAD succeeds", async () => {
      respond();
      expect(await storage.exists("test.txt")).toBe(true);
      expect(requestAt(0).init.method).toBe("HEAD");
    });

    it("returns false when HEAD 404s", async () => {
      respond(404);
      expect(await storage.exists("missing.txt")).toBe(false);
    });
  });

  describe("getUrl", () => {
    it("returns S3 URL with bucket and region", () => {
      const s = new S3Storage("my-bucket", undefined, "eu-west-1");
      expect(s.getUrl("file.txt")).toBe(
        "https://my-bucket.s3.eu-west-1.amazonaws.com/file.txt"
      );
    });

    it("uses default region us-east-1", () => {
      const s = new S3Storage("my-bucket");
      expect(s.getUrl("file.txt")).toBe(
        "https://my-bucket.s3.us-east-1.amazonaws.com/file.txt"
      );
    });

    it("handles nested keys", () => {
      const s = new S3Storage("bucket", undefined, "us-east-1");
      expect(s.getUrl("a/b/c/d.txt")).toBe(
        "https://bucket.s3.us-east-1.amazonaws.com/a/b/c/d.txt"
      );
    });
  });

  describe("addressing", () => {
    it("uses path-style URLs when an endpoint is configured", async () => {
      respond();
      const s = new S3Storage("bucket", "http://minio:9000");
      await s.upload("x.txt", Buffer.from("x"));
      expect(requestAt(0).url).toBe("http://minio:9000/bucket/x.txt");
    });

    it("uses virtual-hosted URLs without an endpoint", async () => {
      respond();
      const s = new S3Storage("bucket");
      await s.upload("x.txt", Buffer.from("x"));
      expect(requestAt(0).url).toBe(
        "https://bucket.s3.us-east-1.amazonaws.com/x.txt"
      );
    });
  });

  describe("exists → delete → exists lifecycle", () => {
    it("returns true then false after delete", async () => {
      respond();
      expect(await storage.exists("lifecycle.txt")).toBe(true);
      respond(204);
      await storage.delete("lifecycle.txt");
      respond(404);
      expect(await storage.exists("lifecycle.txt")).toBe(false);
    });
  });
});
