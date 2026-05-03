import { describe, it, expect, vi, beforeEach } from "vitest";
import { S3Storage } from "../src/s3-storage.js";

// Mock the AWS SDK
const mockSend = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: vi.fn().mockImplementation(function (this: any) {
      this.send = mockSend;
    }),
    PutObjectCommand: vi.fn().mockImplementation(function (
      this: any,
      input: any
    ) {
      Object.assign(this, { _type: "put", ...input });
    }),
    GetObjectCommand: vi.fn().mockImplementation(function (
      this: any,
      input: any
    ) {
      Object.assign(this, { _type: "get", ...input });
    }),
    DeleteObjectCommand: vi.fn().mockImplementation(function (
      this: any,
      input: any
    ) {
      Object.assign(this, { _type: "delete", ...input });
    }),
    HeadObjectCommand: vi.fn().mockImplementation(function (
      this: any,
      input: any
    ) {
      Object.assign(this, { _type: "head", ...input });
    })
  };
});

describe("S3Storage", () => {
  let storage: S3Storage;

  beforeEach(() => {
    mockSend.mockReset();
    storage = new S3Storage("my-bucket", "http://localhost:9000", "us-west-2");
  });

  describe("upload", () => {
    it("sends a PutObjectCommand", async () => {
      mockSend.mockResolvedValue({});
      const data = Buffer.from("hello");
      await storage.upload("test.txt", data, "text/plain");
      expect(mockSend).toHaveBeenCalledOnce();
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.Bucket).toBe("my-bucket");
      expect(cmd.Key).toBe("test.txt");
      expect(cmd.ContentType).toBe("text/plain");
    });

    it("omits ContentType when not provided", async () => {
      mockSend.mockResolvedValue({});
      await storage.upload("test.txt", Buffer.from("hello"));
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.ContentType).toBeUndefined();
    });
  });

  describe("download", () => {
    it("returns buffer from transformToByteArray", async () => {
      const content = Buffer.from("file content");
      mockSend.mockResolvedValue({
        Body: {
          transformToByteArray: async () => new Uint8Array(content)
        }
      });
      const result = await storage.download("test.txt");
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe("file content");
    });

    it("throws on empty body", async () => {
      mockSend.mockResolvedValue({ Body: null });
      await expect(storage.download("missing.txt")).rejects.toThrow(
        "Empty response body"
      );
    });

    it("falls back to async iterable when transformToByteArray is missing", async () => {
      const chunks = [Buffer.from("chunk1"), Buffer.from("chunk2")];
      const asyncIter = {
        async *[Symbol.asyncIterator]() {
          for (const c of chunks) yield c;
        }
      };
      mockSend.mockResolvedValue({ Body: asyncIter });
      const result = await storage.download("test.txt");
      expect(result.toString()).toBe("chunk1chunk2");
    });
  });

  describe("delete", () => {
    it("sends a DeleteObjectCommand", async () => {
      mockSend.mockResolvedValue({});
      await storage.delete("test.txt");
      expect(mockSend).toHaveBeenCalledOnce();
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.Bucket).toBe("my-bucket");
      expect(cmd.Key).toBe("test.txt");
    });
  });

  describe("exists", () => {
    it("returns true when HeadObject succeeds", async () => {
      mockSend.mockResolvedValue({});
      expect(await storage.exists("test.txt")).toBe(true);
    });

    it("returns false when HeadObject throws", async () => {
      mockSend.mockRejectedValue(new Error("NotFound"));
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

  describe("client caching", () => {
    it("reuses the same S3Client across multiple operations", async () => {
      const { S3Client } = await import("@aws-sdk/client-s3");
      (S3Client as any).mockClear();

      const s = new S3Storage("bucket", "http://localhost:9000");
      mockSend.mockResolvedValue({});

      await s.upload("a.txt", Buffer.from("a"));
      await s.upload("b.txt", Buffer.from("b"));
      await s.delete("c.txt");

      // S3Client constructor should have been called only once
      expect(S3Client).toHaveBeenCalledTimes(1);
    });
  });

  describe("custom endpoint with forcePathStyle", () => {
    it("configures forcePathStyle when endpointUrl is provided", async () => {
      const { S3Client } = await import("@aws-sdk/client-s3");
      (S3Client as any).mockClear();

      const s = new S3Storage("bucket", "http://minio:9000");
      mockSend.mockResolvedValue({});
      await s.upload("x.txt", Buffer.from("x"));

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: "http://minio:9000",
          forcePathStyle: true
        })
      );
    });

    it("does not set forcePathStyle when no endpointUrl", async () => {
      const { S3Client } = await import("@aws-sdk/client-s3");
      (S3Client as any).mockClear();

      const s = new S3Storage("bucket");
      mockSend.mockResolvedValue({});
      await s.upload("x.txt", Buffer.from("x"));

      const config = (S3Client as any).mock.calls[0][0];
      expect(config.forcePathStyle).toBeUndefined();
      expect(config.endpoint).toBeUndefined();
    });
  });

  describe("upload with Uint8Array", () => {
    it("accepts plain Uint8Array data", async () => {
      mockSend.mockResolvedValue({});
      const data = new Uint8Array([72, 101, 108, 108, 111]);
      await storage.upload("test.bin", data, "application/octet-stream");
      expect(mockSend).toHaveBeenCalledOnce();
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.Body).toBe(data);
    });
  });

  describe("contentType passthrough", () => {
    it("sets ContentType to the exact string provided", async () => {
      mockSend.mockResolvedValue({});
      await storage.upload("img.webp", Buffer.from("img"), "image/webp");
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.ContentType).toBe("image/webp");
    });

    it("passes custom content types verbatim", async () => {
      mockSend.mockResolvedValue({});
      await storage.upload(
        "data.bin",
        Buffer.from("x"),
        "application/x-custom+json"
      );
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.ContentType).toBe("application/x-custom+json");
    });
  });

  describe("download with multi-chunk async iterable", () => {
    it("preserves chunk order across many chunks", async () => {
      const chunkData = ["alpha", "beta", "gamma", "delta"];
      const asyncIter = {
        async *[Symbol.asyncIterator]() {
          for (const c of chunkData) yield Buffer.from(c);
        }
      };
      mockSend.mockResolvedValue({ Body: asyncIter });
      const result = await storage.download("multi.txt");
      expect(result.toString()).toBe("alphabetagammadelta");
    });

    it("handles single-byte chunks correctly", async () => {
      const bytes = [0x01, 0x02, 0x03, 0xff];
      const asyncIter = {
        async *[Symbol.asyncIterator]() {
          for (const b of bytes) yield new Uint8Array([b]);
        }
      };
      mockSend.mockResolvedValue({ Body: asyncIter });
      const result = await storage.download("bytes.bin");
      expect([...result]).toEqual(bytes);
    });
  });

  describe("exists → delete → exists lifecycle", () => {
    it("returns true then false after delete", async () => {
      // exists returns true
      mockSend.mockResolvedValueOnce({});
      expect(await storage.exists("lifecycle.txt")).toBe(true);

      // delete succeeds
      mockSend.mockResolvedValueOnce({});
      await storage.delete("lifecycle.txt");

      // exists returns false (HeadObject throws)
      mockSend.mockRejectedValueOnce(new Error("NotFound"));
      expect(await storage.exists("lifecycle.txt")).toBe(false);
    });
  });

  describe("SDK loading caching", () => {
    it("returns the same SDK module reference on repeated loads", async () => {
      const s1 = new S3Storage("bucket-a");
      const s2 = new S3Storage("bucket-b");

      mockSend.mockResolvedValue({});
      await s1.upload("a.txt", Buffer.from("a"));
      await s2.upload("b.txt", Buffer.from("b"));

      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe("default region", () => {
    it("uses us-east-1 when no region is specified", async () => {
      const { S3Client } = await import("@aws-sdk/client-s3");
      (S3Client as any).mockClear();

      const s = new S3Storage("bucket");
      mockSend.mockResolvedValue({});
      await s.upload("x.txt", Buffer.from("x"));

      const config = (S3Client as any).mock.calls[0][0];
      expect(config.region).toBe("us-east-1");
    });
  });
});
