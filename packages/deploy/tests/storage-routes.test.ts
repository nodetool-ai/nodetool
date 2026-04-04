import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateKey,
  headFile,
  getFile,
  putFile,
  deleteFile,
  type StorageBackend,
  type HandlerRequest
} from "../src/storage-routes.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockStorage(
  overrides: Partial<StorageBackend> = {}
): StorageBackend {
  return {
    fileExists: vi.fn(async () => true),
    getMtime: vi.fn(async () => new Date("2025-01-15T12:00:00Z")),
    getSize: vi.fn(async () => 1024),
    download: vi.fn(
      async () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    ),
    downloadStream: vi.fn(async function* () {
      yield new Uint8Array([1, 2, 3]);
    }),
    upload: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    ...overrides
  };
}

function makeRequest(
  headers: Record<string, string | undefined> = {}
): HandlerRequest {
  return { headers };
}

// ---------------------------------------------------------------------------
// validateKey
// ---------------------------------------------------------------------------

describe("validateKey", () => {
  it("accepts a simple filename", () => {
    expect(validateKey("file.txt")).toBe("file.txt");
  });

  it("accepts a nested path", () => {
    expect(validateKey("folder/subfolder/file.png")).toBe(
      "folder/subfolder/file.png"
    );
  });

  it("normalizes backslashes to forward slashes", () => {
    expect(validateKey("folder\\file.txt")).toBe("folder/file.txt");
  });

  it("strips leading dot segments", () => {
    expect(validateKey("./folder/file.txt")).toBe("folder/file.txt");
  });

  it("strips redundant slashes", () => {
    expect(validateKey("folder//file.txt")).toBe("folder/file.txt");
  });

  it("throws on empty key", () => {
    expect(() => validateKey("")).toThrow("key must not be empty");
  });

  it("throws on key that is only slashes", () => {
    expect(() => validateKey("///")).toThrow("key must not be empty");
  });

  it("throws on key that is only dots", () => {
    expect(() => validateKey("./././")).toThrow("key must not be empty");
  });

  it("throws on absolute path", () => {
    expect(() => validateKey("/etc/passwd")).toThrow(
      "absolute paths are not allowed"
    );
  });

  it("throws on path traversal with ..", () => {
    expect(() => validateKey("../secret")).toThrow(
      "path traversal is not allowed"
    );
  });

  it("throws on nested path traversal", () => {
    expect(() => validateKey("folder/../../etc/passwd")).toThrow(
      "path traversal is not allowed"
    );
  });

  it("throws on backslash path traversal", () => {
    expect(() => validateKey("folder\\..\\..\\etc\\passwd")).toThrow(
      "path traversal is not allowed"
    );
  });

  it("allows filenames containing dots", () => {
    expect(validateKey("archive.tar.gz")).toBe("archive.tar.gz");
  });

  it("allows filenames starting with dot (hidden files)", () => {
    expect(validateKey(".gitignore")).toBe(".gitignore");
  });

  it("allows deeply nested paths", () => {
    expect(validateKey("a/b/c/d/e/f.txt")).toBe("a/b/c/d/e/f.txt");
  });
});

// ---------------------------------------------------------------------------
// headFile
// ---------------------------------------------------------------------------

describe("headFile", () => {
  it("returns 200 with Last-Modified for existing file", async () => {
    const storage = makeMockStorage();
    const result = await headFile(storage, "file.txt");
    expect(result.status).toBe(200);
    expect(result.headers["Last-Modified"]).toBe(
      new Date("2025-01-15T12:00:00Z").toUTCString()
    );
  });

  it("returns 404 when file does not exist", async () => {
    const storage = makeMockStorage({
      fileExists: vi.fn(async () => false)
    });
    const result = await headFile(storage, "missing.txt");
    expect(result.status).toBe(404);
  });

  it("returns 404 when getMtime returns null", async () => {
    const storage = makeMockStorage({
      getMtime: vi.fn(async () => null)
    });
    const result = await headFile(storage, "file.txt");
    expect(result.status).toBe(404);
  });

  it("validates the key (rejects traversal)", async () => {
    const storage = makeMockStorage();
    await expect(headFile(storage, "../secret")).rejects.toThrow(
      "path traversal"
    );
  });

  it("calls storage with normalized key", async () => {
    const storage = makeMockStorage();
    await headFile(storage, "folder//file.txt");
    expect(storage.fileExists).toHaveBeenCalledWith("folder/file.txt");
  });
});

// ---------------------------------------------------------------------------
// getFile
// ---------------------------------------------------------------------------

describe("getFile", () => {
  it("returns 200 with stream for existing file", async () => {
    const storage = makeMockStorage();
    const result = await getFile(storage, "image.png", makeRequest());
    expect(result.status).toBe(200);
    expect(result.headers["Content-Type"]).toBe("image/png");
    expect(result.headers["Content-Length"]).toBe("1024");
    expect(result.headers["Accept-Ranges"]).toBe("bytes");
    expect(result.body).toBeDefined();
  });

  it("returns 404 when file does not exist", async () => {
    const storage = makeMockStorage({
      fileExists: vi.fn(async () => false)
    });
    const result = await getFile(storage, "missing.txt", makeRequest());
    expect(result.status).toBe(404);
  });

  it("returns 404 when getMtime returns null", async () => {
    const storage = makeMockStorage({
      getMtime: vi.fn(async () => null)
    });
    const result = await getFile(storage, "file.txt", makeRequest());
    expect(result.status).toBe(404);
  });

  it("returns 304 when If-Modified-Since is >= last modified", async () => {
    const storage = makeMockStorage({
      getMtime: vi.fn(async () => new Date("2025-01-15T12:00:00Z"))
    });
    const req = makeRequest({
      "if-modified-since": new Date("2025-01-16T00:00:00Z").toUTCString()
    });
    const result = await getFile(storage, "file.txt", req);
    expect(result.status).toBe(304);
  });

  it("returns 200 when If-Modified-Since is before last modified", async () => {
    const storage = makeMockStorage({
      getMtime: vi.fn(async () => new Date("2025-01-15T12:00:00Z"))
    });
    const req = makeRequest({
      "if-modified-since": new Date("2025-01-14T00:00:00Z").toUTCString()
    });
    const result = await getFile(storage, "file.txt", req);
    expect(result.status).toBe(200);
  });

  it("ignores invalid If-Modified-Since header", async () => {
    const storage = makeMockStorage();
    const req = makeRequest({ "if-modified-since": "not-a-date" });
    const result = await getFile(storage, "file.txt", req);
    expect(result.status).toBe(200);
  });

  it("returns 206 for valid range request", async () => {
    const data = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    const storage = makeMockStorage({
      download: vi.fn(async () => data)
    });
    const req = makeRequest({ range: "bytes=2-5" });
    const result = await getFile(storage, "file.bin", req);
    expect(result.status).toBe(206);
    expect(result.headers["Content-Range"]).toBe("bytes 2-5/10");
    expect(result.headers["Content-Length"]).toBe("4");
    const body = result.body as Uint8Array;
    expect(Array.from(body)).toEqual([30, 40, 50, 60]);
  });

  it("handles range request without end", async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const storage = makeMockStorage({
      download: vi.fn(async () => data)
    });
    const req = makeRequest({ range: "bytes=3-" });
    const result = await getFile(storage, "file.bin", req);
    expect(result.status).toBe(206);
    expect(result.headers["Content-Range"]).toBe("bytes 3-4/5");
    const body = result.body as Uint8Array;
    expect(Array.from(body)).toEqual([4, 5]);
  });

  it("falls through to full content on invalid range format", async () => {
    const storage = makeMockStorage();
    const req = makeRequest({ range: "bytes=abc-def" });
    const result = await getFile(storage, "file.txt", req);
    expect(result.status).toBe(200);
  });

  it("maps known extensions to correct content types", async () => {
    const storage = makeMockStorage();
    const cases: Record<string, string> = {
      "photo.jpg": "image/jpeg",
      "audio.mp3": "audio/mpeg",
      "video.mp4": "video/mp4",
      "data.json": "application/json",
      "page.html": "text/html",
      "style.css": "text/css",
      "archive.zip": "application/zip",
      "doc.pdf": "application/pdf"
    };
    for (const [key, expectedType] of Object.entries(cases)) {
      const result = await getFile(storage, key, makeRequest());
      expect(result.headers["Content-Type"]).toBe(expectedType);
    }
  });

  it("defaults to application/octet-stream for unknown extensions", async () => {
    const storage = makeMockStorage();
    const result = await getFile(storage, "data.xyz", makeRequest());
    expect(result.headers["Content-Type"]).toBe("application/octet-stream");
  });

  it("validates the key (rejects traversal)", async () => {
    const storage = makeMockStorage();
    await expect(
      getFile(storage, "../../etc/passwd", makeRequest())
    ).rejects.toThrow("path traversal");
  });

  it("validates the key (rejects absolute path)", async () => {
    const storage = makeMockStorage();
    await expect(
      getFile(storage, "/etc/passwd", makeRequest())
    ).rejects.toThrow("absolute paths are not allowed");
  });
});

// ---------------------------------------------------------------------------
// putFile
// ---------------------------------------------------------------------------

describe("putFile", () => {
  it("uploads data and returns 200", async () => {
    const storage = makeMockStorage();
    const data = new Uint8Array([1, 2, 3]);
    const result = await putFile(storage, "upload.bin", data);
    expect(result.status).toBe(200);
    expect(storage.upload).toHaveBeenCalledWith("upload.bin", data);
  });

  it("returns null body", async () => {
    const storage = makeMockStorage();
    const result = await putFile(storage, "file.txt", new Uint8Array());
    expect(result.body).toBeNull();
  });

  it("validates the key (rejects traversal)", async () => {
    const storage = makeMockStorage();
    await expect(
      putFile(storage, "../evil.txt", new Uint8Array())
    ).rejects.toThrow("path traversal");
  });

  it("validates the key (rejects empty)", async () => {
    const storage = makeMockStorage();
    await expect(putFile(storage, "", new Uint8Array())).rejects.toThrow(
      "key must not be empty"
    );
  });

  it("normalizes the key before upload", async () => {
    const storage = makeMockStorage();
    await putFile(storage, "folder//file.txt", new Uint8Array([1]));
    expect(storage.upload).toHaveBeenCalledWith(
      "folder/file.txt",
      expect.any(Uint8Array)
    );
  });

  it("handles Buffer input", async () => {
    const storage = makeMockStorage();
    const buf = Buffer.from([10, 20, 30]);
    const result = await putFile(storage, "buf.bin", buf);
    expect(result.status).toBe(200);
    expect(storage.upload).toHaveBeenCalledWith("buf.bin", buf);
  });
});

// ---------------------------------------------------------------------------
// deleteFile
// ---------------------------------------------------------------------------

describe("deleteFile", () => {
  it("returns 204 after successful deletion", async () => {
    const storage = makeMockStorage();
    const result = await deleteFile(storage, "file.txt");
    expect(result.status).toBe(204);
    expect(storage.delete).toHaveBeenCalledWith("file.txt");
  });

  it("returns 404 when file does not exist", async () => {
    const storage = makeMockStorage({
      fileExists: vi.fn(async () => false)
    });
    const result = await deleteFile(storage, "missing.txt");
    expect(result.status).toBe(404);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("validates the key (rejects traversal)", async () => {
    const storage = makeMockStorage();
    await expect(deleteFile(storage, "../secret")).rejects.toThrow(
      "path traversal"
    );
  });

  it("validates the key (rejects absolute path)", async () => {
    const storage = makeMockStorage();
    await expect(deleteFile(storage, "/root/file")).rejects.toThrow(
      "absolute paths are not allowed"
    );
  });

  it("normalizes key before checking existence", async () => {
    const storage = makeMockStorage();
    await deleteFile(storage, "folder\\file.txt");
    expect(storage.fileExists).toHaveBeenCalledWith("folder/file.txt");
    expect(storage.delete).toHaveBeenCalledWith("folder/file.txt");
  });
});
