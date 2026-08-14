/**
 * Tests for storage-api.ts — key validation, MIME types, range parsing,
 * and full request handling via createStorageHandler.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// Reads are scoped to assets the caller owns. These tests exercise the binary
// surface, so ownership is stubbed; `ownsAsset` is re-pointed per test to cover
// the scoping rules themselves.
let ownsAsset: (userId: string, assetId: string) => boolean;
vi.mock("@nodetool-ai/models", () => ({
  Asset: {
    find: async (userId: string, assetId: string) =>
      ownsAsset(userId, assetId) ? { id: assetId, user_id: userId } : null
  }
}));

import { createStorageHandler } from "../src/storage-api.js";
import { resetCorsConfig } from "../src/cors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storage-api-test-"));
  // Default: the anonymous/local caller ("1") owns everything it asks for.
  ownsAsset = (userId) => userId === "1";
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeHandler() {
  return createStorageHandler({ storagePath: tmpDir });
}

function makeRequest(
  urlPath: string,
  method = "GET",
  headers?: Record<string, string>,
  body?: BodyInit
): Request {
  return new Request(`http://localhost${urlPath}`, {
    method,
    headers,
    body
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
    const res = await handler(
      makeRequest("/api/storage/foo%2F..%2F..%2Fetc%2Fpasswd")
    );
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

  it("serves a legacy .bin 3D object when the request asks for .glb", async () => {
    const handler = makeHandler();
    const ownerDir = path.join(tmpDir, "1");
    await fs.mkdir(ownerDir, { recursive: true });
    await fs.writeFile(path.join(ownerDir, "mesh.bin"), "glTF-bytes");
    const res = await handler(
      makeRequest("/api/storage/1/mesh.glb", "GET")
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("glTF-bytes");
  });

  it.each([
    ["clip.webm", "video/webm"],
    ["sound.ogg", "audio/ogg"],
    ["model.glb", "model/gltf-binary"],
    ["pic.bmp", "image/bmp"],
    ["track.flac", "audio/flac"],
    ["voice.aac", "audio/aac"]
  ])(
    "serves %s inline with the right Content-Type (%s)",
    async (name, expected) => {
      const handler = makeHandler();
      await fs.writeFile(path.join(tmpDir, name), "data");
      const res = await handler(makeRequest(`/api/storage/${name}`, "HEAD"));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe(expected);
    }
  );

  it("serves user HTML as text/plain, not text/html (no XSS)", async () => {
    const handler = makeHandler();
    await fs.writeFile(path.join(tmpDir, "page.html"), "<script>alert(1)</script>");
    const res = await handler(makeRequest("/api/storage/page.html", "HEAD"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain");
  });

  it("serves SVG as image/svg+xml with a sandbox CSP", async () => {
    const handler = makeHandler();
    await fs.writeFile(path.join(tmpDir, "vec.svg"), "<svg/>");
    const res = await handler(makeRequest("/api/storage/vec.svg", "HEAD"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("sandbox");
    expect(csp).toContain("default-src 'none'");
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
        Range: "bytes=0-4"
      })
    );
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(
      `bytes 0-4/${content.length}`
    );
    expect(res.headers.get("Content-Length")).toBe("5");
  });

  it("returns 206 for suffix range", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/range-test.txt", "GET", {
        Range: "bytes=-5"
      })
    );
    expect(res.status).toBe(206);
    const expectedStart = content.length - 5;
    expect(res.headers.get("Content-Range")).toBe(
      `bytes ${expectedStart}-${content.length - 1}/${content.length}`
    );
  });

  it("returns 206 for open-ended range", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/range-test.txt", "GET", {
        Range: "bytes=10-"
      })
    );
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(
      `bytes 10-${content.length - 1}/${content.length}`
    );
  });

  it("returns 416 for invalid range", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/range-test.txt", "GET", {
        Range: "bytes=999-1000"
      })
    );
    expect(res.status).toBe(416);
  });

  it("ignores a malformed/unsupported range header and serves the full file (RFC 7233)", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/range-test.txt", "GET", {
        Range: "invalid-range"
      })
    );
    // A Range header the server can't parse must be ignored (full 200), not 416.
    expect(res.status).toBe(200);
  });

  it("ignores a multi-range header and serves the full file", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/range-test.txt", "GET", {
        Range: "bytes=0-2,5-7"
      })
    );
    expect(res.status).toBe(200);
  });

  it("clamps an end past EOF instead of rejecting (RFC 7233)", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/range-test.txt", "GET", {
        Range: "bytes=0-999999"
      })
    );
    expect(res.status).toBe(206);
    // Content-Range end is clamped to the last byte, not the requested value.
    expect(res.headers.get("Content-Range")).toMatch(/^bytes 0-\d+\/\d+$/);
  });
});

// ---------------------------------------------------------------------------
// Read-only surface (writes and deletes are not exposed over REST)
// ---------------------------------------------------------------------------

describe("read-only surface", () => {
  it("retrieves a stored file", async () => {
    const handler = makeHandler();
    const data = "test file content";
    // Keys are owner-prefixed: `<userId>/<assetId>.<ext>`.
    await fs.mkdir(path.join(tmpDir, "1"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "1", "test.txt"), data);

    const getRes = await handler(makeRequest("/api/storage/1/test.txt"));
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("Content-Type")).toBe("text/plain");
    expect(await getRes.text()).toBe(data);
  });

  it.each(["PUT", "POST", "PATCH", "DELETE"])(
    "%s returns 405",
    async (method) => {
      const handler = makeHandler();
      const res = await handler(
        makeRequest("/api/storage/test.txt", method, {}, "payload")
      );
      expect(res.status).toBe(405);
    }
  );

  it("PUT never writes the file it was pointed at", async () => {
    const handler = makeHandler();
    const target = path.join(tmpDir, "victim.png");
    await fs.writeFile(target, "original");

    const res = await handler(
      makeRequest("/api/storage/victim.png", "PUT", {}, "overwritten")
    );
    expect(res.status).toBe(405);
    expect(await fs.readFile(target, "utf8")).toBe("original");
  });
});

// ---------------------------------------------------------------------------
// Per-user scoping
// ---------------------------------------------------------------------------

describe("ownership scoping", () => {
  beforeEach(async () => {
    await fs.writeFile(path.join(tmpDir, "asset-a.png"), "a-bytes");
    await fs.writeFile(path.join(tmpDir, "asset-a_thumb.jpg"), "a-thumb");
    await fs.mkdir(path.join(tmpDir, "temp"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "temp", "scratch.png"), "t-bytes");
    // Only user-a owns asset-a.
    ownsAsset = (userId, assetId) => userId === "user-a" && assetId === "asset-a";
  });

  it("serves the owner's asset", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/asset-a.png", "GET", { "x-user-id": "user-a" })
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("a-bytes");
  });

  it("serves the owner's thumbnail", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/asset-a_thumb.jpg", "GET", {
        "x-user-id": "user-a"
      })
    );
    expect(res.status).toBe(200);
  });

  it("hides another user's asset behind a 404", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/asset-a.png", "GET", { "x-user-id": "user-b" })
    );
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("a-bytes");
  });

  it("hides another user's thumbnail too", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/asset-a_thumb.jpg", "HEAD", {
        "x-user-id": "user-b"
      })
    );
    expect(res.status).toBe(404);
  });

  it("404s a key that maps to no asset at all", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/orphan.png", "GET", { "x-user-id": "user-a" })
    );
    expect(res.status).toBe(404);
  });

  it("serves runtime scratch keys, which have no asset row", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/temp/scratch.png", "GET", {
        "x-user-id": "user-b"
      })
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("t-bytes");
  });

  it("serves an owner-prefixed key without consulting the asset row", async () => {
    const handler = makeHandler();
    await fs.mkdir(path.join(tmpDir, "user-a"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "user-a", "new.png"), "new-bytes");
    ownsAsset = () => false; // prefix alone must be enough

    const res = await handler(
      makeRequest("/api/storage/user-a/new.png", "GET", {
        "x-user-id": "user-a"
      })
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("new-bytes");
  });

  it("denies a key under another owner's prefix", async () => {
    const handler = makeHandler();
    await fs.mkdir(path.join(tmpDir, "user-a"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "user-a", "new.png"), "new-bytes");

    const res = await handler(
      makeRequest("/api/storage/user-a/new.png", "GET", {
        "x-user-id": "user-b"
      })
    );
    expect(res.status).toBe(404);
  });

  it("falls back to the legacy flat object when the prefixed one is missing", async () => {
    // Pre-migration deployments still have flat objects on disk; the owner is
    // re-established from the asset row before serving one.
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/user-a/asset-a.png", "GET", {
        "x-user-id": "user-a"
      })
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("a-bytes");
  });

  it("does not serve a legacy object the caller does not own", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeRequest("/api/storage/user-b/asset-a.png", "GET", {
        "x-user-id": "user-b"
      })
    );
    expect(res.status).toBe(404);
  });

  it("does not treat a missing x-user-id as a bypass", async () => {
    // No header → the local single-user id "1", which still has to own the key.
    const handler = makeHandler();
    const res = await handler(makeRequest("/api/storage/asset-a.png"));
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
      makeRequest("/api/storage/head-test.txt", "HEAD")
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe(String(content.length));
    expect(res.headers.get("Content-Type")).toBe("text/plain");
    expect(res.headers.get("Last-Modified")).toBeTruthy();
  });

  it("returns 404 for missing file", async () => {
    const handler = makeHandler();
    const res = await handler(makeRequest("/api/storage/missing.txt", "HEAD"));
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
        "If-Modified-Since": futureDate
      })
    );
    expect(res2.status).toBe(304);
  });
});

// ---------------------------------------------------------------------------
// Temp storage routing
// ---------------------------------------------------------------------------

describe("temp storage routing", () => {
  it("serves /api/storage/temp/ from the temp subdirectory of the root", async () => {
    const handler = makeHandler();
    const data = "temp data";
    await fs.mkdir(path.join(tmpDir, "temp"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "temp", "tmp-file.txt"), data);

    const res = await handler(makeRequest("/api/storage/temp/tmp-file.txt"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(data);
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
      makeRequest("/api/storage/patch-test.txt", "PATCH")
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

// ---------------------------------------------------------------------------
// Cross-origin headers
// ---------------------------------------------------------------------------

describe("CORS headers", () => {
  afterEach(() => {
    delete process.env.NODETOOL_ALLOWED_ORIGINS;
    resetCorsConfig();
  });

  it("always sets Cross-Origin-Resource-Policy so assets embed under COEP", async () => {
    const handler = makeHandler();
    await fs.writeFile(path.join(tmpDir, "asset.png"), "x");
    const res = await handler(makeRequest("/api/storage/asset.png"));
    expect(res.headers.get("Cross-Origin-Resource-Policy")).toBe(
      "cross-origin"
    );
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("reflects an allow-listed origin instead of returning *", async () => {
    const handler = makeHandler();
    await fs.writeFile(path.join(tmpDir, "asset.png"), "x");
    const res = await handler(
      makeRequest("/api/storage/asset.png", "GET", {
        Origin: "http://localhost:3000"
      })
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000"
    );
    expect(res.headers.get("Timing-Allow-Origin")).toBe(
      "http://localhost:3000"
    );
  });

  it("omits Access-Control-Allow-Origin for a disallowed origin", async () => {
    const handler = makeHandler();
    await fs.writeFile(path.join(tmpDir, "asset.png"), "x");
    const res = await handler(
      makeRequest("/api/storage/asset.png", "GET", {
        Origin: "https://evil.example.com"
      })
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    // CORP still present — `<img>`/`<video>` embedding does not need ACAO.
    expect(res.headers.get("Cross-Origin-Resource-Policy")).toBe(
      "cross-origin"
    );
  });
});
