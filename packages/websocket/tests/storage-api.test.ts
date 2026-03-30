/**
 * Tests for storage-api.ts — key validation, MIME types, range parsing,
 * and full request handling via createStorageHandler.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createStorageHandler } from "../src/storage-api.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storage-api-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeHandler() {
  return createStorageHandler({
    storagePath: tmpDir,
    tempStoragePath: path.join(tmpDir, "temp"),
  });
}

function makeRequest(
  urlPath: string,
  method = "GET",
  headers?: Record<string, string>,
  body?: BodyInit,
): Request {
  return new Request(`http://localhost${urlPath}`, {
    method,
    headers,
    body,
  });
}

// ---------------------------------------------------------------------------
// Key validation (via 400 responses)
// ---------------------------------------------------------------------------

describe("storage key validation", () => {
  it("rejects empty key", async () => {
    const handler = makeHandler();
    const res = await handler(makeRequest("/api/storage/"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("Key is required");
  });

  it("rejects absolute path key", async () => {
    const handler = makeHandler();
    const res = await handler(makeRequest("/api/storage/%2Fetc%2Fpasswd"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("absolute path");
  });

  it("rejects path traversal", async () => {
    const handler = makeHandler();
    const res = await handler(makeRequest("/api/storage/foo%2F..%2F..%2Fetc%2Fpasswd"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("path traversal");
  });

  it("accepts valid key with subdirectory", async () => {
    const handler = makeHandler();
    // File doesn't exist, so expect 404 not 400
    const res = await handler(makeRequest("/api/storage/images/photo.jpg"));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// MIME type detection
// ---------------------------------------------------------------------------

describe("MIME type detection", () => {
  it("returns correct MIME for known extensions", async () => {
    const handler = makeHandler();
    const filePath = path.join(tmpDir, "test.jpg");
    await fs.writeFile(filePath, "fake-image-data");

    const res = await handler(makeRequest("/api/storage/test.jpg", "HEAD"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("returns octet-stream for unknown extensions", async () => {
    const handler = makeHandler();
    const filePath = path.join(tmpDir, "data.xyz");
    await fs.writeFile(filePath, "some data");

    const res = await handler(makeRequest("/api/storage/data.xyz", "HEAD"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });
});

// ---------------------------------------------------------------------------
// Range header parsing (via GET with Range)
// ---------------------------------------------------------------------------

describe("range requests", () => {
  const content = "Hello, World! This is test content for range requests.";

  beforeEach(async () => {
    await fs.writeFile(path.join(tmpDir, "range-test.txt"), content);
  });

  it("returns 206 for valid byte range", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/range-test.txt", "GET", {
        Range: "bytes=0-4",
      }),
    );
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(
      `bytes 0-4/${content.length}`,
    );
    expect(res.headers.get("Content-Length")).toBe("5");
  });

  it("returns 206 for suffix range", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/range-test.txt", "GET", {
        Range: "bytes=-5",
      }),
    );
    expect(res.status).toBe(206);
    const expectedStart = content.length - 5;
    expect(res.headers.get("Content-Range")).toBe(
      `bytes ${expectedStart}-${content.length - 1}/${content.length}`,
    );
  });

  it("returns 206 for open-ended range", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/range-test.txt", "GET", {
        Range: "bytes=10-",
      }),
    );
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(
      `bytes 10-${content.length - 1}/${content.length}`,
    );
  });

  it("returns 416 for invalid range", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/range-test.txt", "GET", {
        Range: "bytes=999-1000",
      }),
    );
    expect(res.status).toBe(416);
  });

  it("returns 416 for malformed range header", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/range-test.txt", "GET", {
        Range: "invalid-range",
      }),
    );
    expect(res.status).toBe(416);
  });
});

// ---------------------------------------------------------------------------
// PUT / GET / DELETE lifecycle
// ---------------------------------------------------------------------------

describe("PUT / GET / DELETE lifecycle", () => {
  it("uploads, retrieves, and deletes a file", async () => {
    const handler = makeHandler();
    const data = "test file content";

    // PUT
    const putRes = await handler(
      makeRequest("/api/storage/lifecycle/test.txt", "PUT", {}, data),
    );
    expect(putRes.status).toBe(200);

    // GET
    const getRes = await handler(
      makeRequest("/api/storage/lifecycle/test.txt"),
    );
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("Content-Type")).toBe("text/plain");
    const body = await getRes.text();
    expect(body).toBe(data);

    // DELETE
    const delRes = await handler(
      makeRequest("/api/storage/lifecycle/test.txt", "DELETE"),
    );
    expect(delRes.status).toBe(200);

    // GET after delete -> 404
    const getRes2 = await handler(
      makeRequest("/api/storage/lifecycle/test.txt"),
    );
    expect(getRes2.status).toBe(404);
  });

  it("DELETE returns 404 for non-existent file", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/nonexistent.txt", "DELETE"),
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// HEAD request
// ---------------------------------------------------------------------------

describe("HEAD request", () => {
  it("returns file metadata without body", async () => {
    const handler = makeHandler();
    const content = "hello world";
    await fs.writeFile(path.join(tmpDir, "head-test.txt"), content);

    const res = await handler(
      makeRequest("/api/storage/head-test.txt", "HEAD"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe(String(content.length));
    expect(res.headers.get("Content-Type")).toBe("text/plain");
    expect(res.headers.get("Last-Modified")).toBeTruthy();
  });

  it("returns 404 for missing file", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/missing.txt", "HEAD"),
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// If-Modified-Since caching
// ---------------------------------------------------------------------------

describe("If-Modified-Since", () => {
  it("returns 304 when file is not modified", async () => {
    const handler = makeHandler();
    await fs.writeFile(path.join(tmpDir, "cache-test.txt"), "data");

    // First request to get Last-Modified
    const res1 = await handler(makeRequest("/api/storage/cache-test.txt"));
    expect(res1.status).toBe(200);
    const lastModified = res1.headers.get("Last-Modified")!;

    // Second request with If-Modified-Since set to the future
    const futureDate = new Date(Date.now() + 60000).toUTCString();
    const res2 = await handler(
      makeRequest("/api/storage/cache-test.txt", "GET", {
        "If-Modified-Since": futureDate,
      }),
    );
    expect(res2.status).toBe(304);
  });
});

// ---------------------------------------------------------------------------
// Temp storage routing
// ---------------------------------------------------------------------------

describe("temp storage routing", () => {
  it("routes /api/storage/temp/ to temp storage path", async () => {
    const handler = makeHandler();
    const data = "temp data";

    const putRes = await handler(
      makeRequest("/api/storage/temp/tmp-file.txt", "PUT", {}, data),
    );
    expect(putRes.status).toBe(200);

    // Verify file exists in temp dir
    const filePath = path.join(tmpDir, "temp", "tmp-file.txt");
    const exists = await fs.stat(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Method not allowed
// ---------------------------------------------------------------------------

describe("method not allowed", () => {
  it("returns 405 for unsupported methods", async () => {
    const handler = makeHandler();
    await fs.writeFile(path.join(tmpDir, "patch-test.txt"), "data");
    const res = await handler(
      makeRequest("/api/storage/patch-test.txt", "PATCH"),
    );
    expect(res.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// Unknown routes
// ---------------------------------------------------------------------------

describe("unknown routes", () => {
  it("returns 404 for non-storage routes", async () => {
    const handler = makeHandler();
    const res = await handler(makeRequest("/api/other/thing"));
    expect(res.status).toBe(404);
  });
});
