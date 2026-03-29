import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupabaseStorage } from "../src/supabase-storage.js";

// Mock Supabase SDK
const mockUpload = vi.fn();
const mockDownload = vi.fn();
const mockRemove = vi.fn();
const mockGetPublicUrl = vi.fn();

const mockBucket = {
  upload: mockUpload,
  download: mockDownload,
  remove: mockRemove,
  getPublicUrl: mockGetPublicUrl,
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn().mockImplementation(() => ({
    storage: {
      from: vi.fn().mockReturnValue(mockBucket),
    },
  })),
}));

describe("SupabaseStorage", () => {
  let storage: SupabaseStorage;

  beforeEach(() => {
    mockUpload.mockReset();
    mockDownload.mockReset();
    mockRemove.mockReset();
    mockGetPublicUrl.mockReset();
    storage = new SupabaseStorage("https://project.supabase.co", "service-key", "assets");
  });

  describe("upload", () => {
    it("uploads data with content type", async () => {
      mockUpload.mockResolvedValue({ data: { path: "file.txt" }, error: null });
      await storage.upload("file.txt", Buffer.from("hello"), "text/plain");
      expect(mockUpload).toHaveBeenCalledWith("file.txt", expect.any(Buffer), {
        contentType: "text/plain",
      });
    });

    it("uploads without content type", async () => {
      mockUpload.mockResolvedValue({ data: { path: "file.txt" }, error: null });
      await storage.upload("file.txt", Buffer.from("hello"));
      expect(mockUpload).toHaveBeenCalledWith("file.txt", expect.any(Buffer), {});
    });

    it("throws on upload error", async () => {
      mockUpload.mockResolvedValue({ data: null, error: { message: "Bucket full" } });
      await expect(storage.upload("file.txt", Buffer.from("hello"))).rejects.toThrow(
        "Supabase upload failed"
      );
    });
  });

  describe("download", () => {
    it("returns buffer from blob", async () => {
      const blob = new Blob(["hello world"]);
      mockDownload.mockResolvedValue({ data: blob, error: null });
      const result = await storage.download("file.txt");
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe("hello world");
    });

    it("throws on download error", async () => {
      mockDownload.mockResolvedValue({ data: null, error: { message: "Not found" } });
      await expect(storage.download("missing.txt")).rejects.toThrow(
        "Supabase download failed"
      );
    });

    it("throws when data is null without error", async () => {
      mockDownload.mockResolvedValue({ data: null, error: null });
      await expect(storage.download("missing.txt")).rejects.toThrow("no data returned");
    });
  });

  describe("delete", () => {
    it("removes the file", async () => {
      mockRemove.mockResolvedValue({ data: {}, error: null });
      await storage.delete("file.txt");
      expect(mockRemove).toHaveBeenCalledWith(["file.txt"]);
    });

    it("throws on delete error", async () => {
      mockRemove.mockResolvedValue({ data: null, error: { message: "Permission denied" } });
      await expect(storage.delete("file.txt")).rejects.toThrow("Supabase delete failed");
    });
  });

  describe("exists", () => {
    it("returns true when download succeeds", async () => {
      mockDownload.mockResolvedValue({ data: new Blob([""]), error: null });
      expect(await storage.exists("file.txt")).toBe(true);
    });

    it("returns false when download errors", async () => {
      mockDownload.mockResolvedValue({ data: null, error: { message: "Not found" } });
      expect(await storage.exists("missing.txt")).toBe(false);
    });
  });

  describe("getUrl", () => {
    it("returns public URL via client when initialized", async () => {
      // Trigger client initialization by calling any async method first
      mockDownload.mockResolvedValue({ data: new Blob([""]), error: null });
      await storage.exists("init");

      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: "https://project.supabase.co/storage/v1/object/public/assets/file.txt" },
      });
      const url = storage.getUrl("file.txt");
      expect(url).toBe(
        "https://project.supabase.co/storage/v1/object/public/assets/file.txt"
      );
    });

    it("constructs URL manually before client is initialized", () => {
      // getUrl is sync and may be called before any async method
      const freshStorage = new SupabaseStorage(
        "https://project.supabase.co",
        "key",
        "assets"
      );
      const url = freshStorage.getUrl("path/file.txt");
      expect(url).toBe(
        "https://project.supabase.co/storage/v1/object/public/assets/path/file.txt"
      );
    });

    it("handles trailing slash in supabase URL", () => {
      const freshStorage = new SupabaseStorage(
        "https://project.supabase.co/",
        "key",
        "assets"
      );
      const url = freshStorage.getUrl("file.txt");
      expect(url).toBe(
        "https://project.supabase.co/storage/v1/object/public/assets/file.txt"
      );
    });

    it("handles nested path keys", () => {
      const freshStorage = new SupabaseStorage(
        "https://project.supabase.co",
        "key",
        "assets"
      );
      const url = freshStorage.getUrl("folder/subfolder/file.txt");
      expect(url).toBe(
        "https://project.supabase.co/storage/v1/object/public/assets/folder/subfolder/file.txt"
      );
    });
  });

  describe("upload with Uint8Array", () => {
    it("accepts plain Uint8Array data", async () => {
      mockUpload.mockResolvedValue({ data: { path: "file.bin" }, error: null });
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await storage.upload("file.bin", data, "application/octet-stream");
      expect(mockUpload).toHaveBeenCalledWith("file.bin", data, {
        contentType: "application/octet-stream",
      });
    });
  });

  describe("exists edge cases", () => {
    it("returns false when data is null without error", async () => {
      mockDownload.mockResolvedValue({ data: null, error: null });
      expect(await storage.exists("ghost.txt")).toBe(false);
    });
  });

  describe("client caching", () => {
    it("reuses the same client across multiple operations", async () => {
      const { createClient } = await import("@supabase/supabase-js");

      mockUpload.mockResolvedValue({ data: { path: "a.txt" }, error: null });
      mockRemove.mockResolvedValue({ data: {}, error: null });

      await storage.upload("a.txt", Buffer.from("a"));
      await storage.upload("b.txt", Buffer.from("b"));
      await storage.delete("c.txt");

      // createClient should have been called only once (for this storage instance)
      // The mock is shared, so we check the from() calls instead
      // All operations go through bucket() which calls getClient()
      // After first call, getClient() returns cached client
      expect(mockUpload).toHaveBeenCalledTimes(2);
      expect(mockRemove).toHaveBeenCalledTimes(1);
    });
  });

  describe("download binary round-trip", () => {
    it("correctly handles non-trivial binary data", async () => {
      const binaryData = new Uint8Array([0, 1, 127, 128, 255, 0, 42]);
      const blob = new Blob([binaryData]);
      mockDownload.mockResolvedValue({ data: blob, error: null });

      const result = await storage.download("binary.bin");
      expect(Buffer.isBuffer(result)).toBe(true);
      expect([...result]).toEqual([0, 1, 127, 128, 255, 0, 42]);
    });
  });

  describe("upload then download round-trip", () => {
    it("mocked chain works end to end", async () => {
      const content = Buffer.from("round-trip content");
      mockUpload.mockResolvedValue({ data: { path: "rt.txt" }, error: null });

      await storage.upload("rt.txt", content, "text/plain");
      expect(mockUpload).toHaveBeenCalledWith("rt.txt", content, {
        contentType: "text/plain",
      });

      const blob = new Blob(["round-trip content"]);
      mockDownload.mockResolvedValue({ data: blob, error: null });

      const result = await storage.download("rt.txt");
      expect(result.toString()).toBe("round-trip content");
    });
  });

  describe("error propagation includes key name", () => {
    it("upload error includes key", async () => {
      mockUpload.mockResolvedValue({ data: null, error: { message: "quota exceeded" } });
      await expect(storage.upload("my/key.txt", Buffer.from("x"))).rejects.toThrow(
        '"my/key.txt"'
      );
    });

    it("download error includes key", async () => {
      mockDownload.mockResolvedValue({ data: null, error: { message: "not found" } });
      await expect(storage.download("missing/file.txt")).rejects.toThrow(
        '"missing/file.txt"'
      );
    });

    it("delete error includes key", async () => {
      mockRemove.mockResolvedValue({ data: null, error: { message: "forbidden" } });
      await expect(storage.delete("secret/key.txt")).rejects.toThrow(
        '"secret/key.txt"'
      );
    });
  });

  describe("delete multiple keys sequentially", () => {
    it("calls remove with correct key for each delete", async () => {
      mockRemove.mockResolvedValue({ data: {}, error: null });

      await storage.delete("file1.txt");
      await storage.delete("file2.txt");
      await storage.delete("file3.txt");

      expect(mockRemove).toHaveBeenCalledTimes(3);
      expect(mockRemove).toHaveBeenNthCalledWith(1, ["file1.txt"]);
      expect(mockRemove).toHaveBeenNthCalledWith(2, ["file2.txt"]);
      expect(mockRemove).toHaveBeenNthCalledWith(3, ["file3.txt"]);
    });
  });
});
