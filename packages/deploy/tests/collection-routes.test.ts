import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleCollectionIndex,
  type IndexFileToCollectionFn,
  type IndexResult,
  type CollectionHttpError
} from "../src/collection-routes.js";

describe("handleCollectionIndex", () => {
  let indexFn: IndexFileToCollectionFn;

  beforeEach(() => {
    indexFn = vi.fn(async () => null);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // ---- Success cases ----

  it("returns success result when indexFn returns null", async () => {
    const result = await handleCollectionIndex(
      "my-collection",
      "/tmp/file.pdf",
      "document.pdf",
      "application/pdf",
      "Bearer token123",
      indexFn
    );
    expect(result).toEqual({ path: "document.pdf", error: null });
  });

  it("passes correct arguments to indexFn", async () => {
    await handleCollectionIndex(
      "docs",
      "/tmp/upload.txt",
      "readme.txt",
      "text/plain",
      "Bearer abc",
      indexFn
    );
    expect(indexFn).toHaveBeenCalledWith(
      "docs",
      "/tmp/upload.txt",
      "text/plain",
      "Bearer abc"
    );
  });

  it("uses local_token as default when authorization is undefined", async () => {
    await handleCollectionIndex(
      "col",
      "/tmp/f",
      "f.txt",
      "text/plain",
      undefined,
      indexFn
    );
    expect(indexFn).toHaveBeenCalledWith(
      "col",
      "/tmp/f",
      "text/plain",
      "local_token"
    );
  });

  it("uses local_token when authorization is empty string", async () => {
    await handleCollectionIndex(
      "col",
      "/tmp/f",
      "f.txt",
      "text/plain",
      "",
      indexFn
    );
    expect(indexFn).toHaveBeenCalledWith(
      "col",
      "/tmp/f",
      "text/plain",
      "local_token"
    );
  });

  it("returns error result when indexFn returns an error string", async () => {
    const failFn: IndexFileToCollectionFn = vi.fn(
      async () => "Unsupported format"
    );
    const result = await handleCollectionIndex(
      "col",
      "/tmp/f",
      "bad.exe",
      "application/octet-stream",
      "token",
      failFn
    );
    expect(result).toEqual({ path: "bad.exe", error: "Unsupported format" });
  });

  it("uses 'unknown' as path when fileName is empty and indexFn succeeds", async () => {
    const result = await handleCollectionIndex(
      "col",
      "/tmp/f",
      "",
      "text/plain",
      "token",
      indexFn
    );
    expect(result.path).toBe("unknown");
    expect(result.error).toBeNull();
  });

  it("uses 'unknown' as path when fileName is empty and indexFn returns error", async () => {
    const failFn: IndexFileToCollectionFn = vi.fn(async () => "bad file");
    const result = await handleCollectionIndex(
      "col",
      "/tmp/f",
      "",
      "text/plain",
      "token",
      failFn
    );
    expect(result.path).toBe("unknown");
    expect(result.error).toBe("bad file");
  });

  // ---- Error / exception cases ----

  it("throws CollectionHttpError when indexFn throws an Error", async () => {
    const throwFn: IndexFileToCollectionFn = vi.fn(async () => {
      throw new Error("Connection refused");
    });
    try {
      await handleCollectionIndex(
        "col",
        "/tmp/f",
        "file.txt",
        "text/plain",
        "token",
        throwFn
      );
      expect.fail("should have thrown");
    } catch (e) {
      const httpErr = e as CollectionHttpError;
      expect(httpErr.statusCode).toBe(500);
      expect(httpErr.detail).toBe("Connection refused");
    }
  });

  it("throws CollectionHttpError when indexFn throws a string", async () => {
    const throwFn: IndexFileToCollectionFn = vi.fn(async () => {
      throw "raw string error";
    });
    try {
      await handleCollectionIndex(
        "col",
        "/tmp/f",
        "file.txt",
        "text/plain",
        "token",
        throwFn
      );
      expect.fail("should have thrown");
    } catch (e) {
      const httpErr = e as CollectionHttpError;
      expect(httpErr.statusCode).toBe(500);
      expect(httpErr.detail).toBe("raw string error");
    }
  });

  it("logs the error to console.error when indexFn throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const throwFn: IndexFileToCollectionFn = vi.fn(async () => {
      throw new Error("disk full");
    });
    try {
      await handleCollectionIndex(
        "col",
        "/tmp/f",
        "report.pdf",
        "application/pdf",
        "token",
        throwFn
      );
    } catch {
      // expected
    }
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error indexing file report.pdf: disk full")
    );
  });

  it("thrown error has correct shape (statusCode and detail)", async () => {
    const throwFn: IndexFileToCollectionFn = vi.fn(async () => {
      throw new Error("timeout");
    });
    try {
      await handleCollectionIndex(
        "col",
        "/tmp/f",
        "f.txt",
        "text/plain",
        "token",
        throwFn
      );
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toHaveProperty("statusCode", 500);
      expect(e).toHaveProperty("detail", "timeout");
    }
  });

  // ---- Various input combinations ----

  it("handles different mime types correctly", async () => {
    const types = [
      "image/png",
      "audio/mpeg",
      "video/mp4",
      "application/json",
      "text/csv"
    ];
    for (const mime of types) {
      const fn: IndexFileToCollectionFn = vi.fn(async () => null);
      await handleCollectionIndex("col", "/tmp/f", "file", mime, "tok", fn);
      expect(fn).toHaveBeenCalledWith("col", "/tmp/f", mime, "tok");
    }
  });

  it("handles special characters in collection name", async () => {
    const result = await handleCollectionIndex(
      "my-collection_v2.0",
      "/tmp/f",
      "file.txt",
      "text/plain",
      "token",
      indexFn
    );
    expect(result.error).toBeNull();
    expect(indexFn).toHaveBeenCalledWith(
      "my-collection_v2.0",
      "/tmp/f",
      "text/plain",
      "token"
    );
  });

  it("handles very long file names", async () => {
    const longName = "a".repeat(500) + ".txt";
    const result = await handleCollectionIndex(
      "col",
      "/tmp/" + longName,
      longName,
      "text/plain",
      "token",
      indexFn
    );
    expect(result.path).toBe(longName);
  });

  it("handles concurrent calls independently", async () => {
    let callCount = 0;
    const countFn: IndexFileToCollectionFn = vi.fn(async () => {
      callCount++;
      return callCount === 2 ? "error on second" : null;
    });

    const [r1, r2, r3] = await Promise.all([
      handleCollectionIndex(
        "c1",
        "/tmp/a",
        "a.txt",
        "text/plain",
        "t",
        countFn
      ),
      handleCollectionIndex(
        "c2",
        "/tmp/b",
        "b.txt",
        "text/plain",
        "t",
        countFn
      ),
      handleCollectionIndex("c3", "/tmp/c", "c.txt", "text/plain", "t", countFn)
    ]);

    expect(countFn).toHaveBeenCalledTimes(3);
    // One of them should have the error
    const results = [r1, r2, r3];
    const errors = results.filter((r) => r.error !== null);
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toBe("error on second");
  });

  it("does not throw when indexFn returns null (no error)", async () => {
    await expect(
      handleCollectionIndex(
        "col",
        "/tmp/f",
        "file.txt",
        "text/plain",
        "token",
        indexFn
      )
    ).resolves.not.toThrow();
  });

  it("preserves authorization token as-is", async () => {
    const token = "Bearer eyJhbGciOiJIUzI1NiJ9.test.signature";
    await handleCollectionIndex(
      "col",
      "/tmp/f",
      "f.txt",
      "text/plain",
      token,
      indexFn
    );
    expect(indexFn).toHaveBeenCalledWith("col", "/tmp/f", "text/plain", token);
  });
});
