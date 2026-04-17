/**
 * Tests for file-api.ts — binary download only.
 *
 * JSON ops (list, info) have been migrated to the tRPC `files` router.
 * See trpc-files.test.ts for the tRPC unit tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { handleFileRequest } from "../src/file-api.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-api-test-"));
  // Remove production flag
  delete process.env["NODETOOL_ENV"];
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeRequest(urlPath: string, method = "GET"): Request {
  return new Request(`http://localhost${urlPath}`, { method });
}

// ---------------------------------------------------------------------------
// Production guard
// ---------------------------------------------------------------------------

describe("production guard", () => {
  it("returns 403 in production", async () => {
    process.env["NODETOOL_ENV"] = "production";
    const res = await handleFileRequest(
      makeRequest("/api/files/download?path=test.txt")
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.detail).toContain("production");
  });
});

// ---------------------------------------------------------------------------
// Method restriction
// ---------------------------------------------------------------------------

describe("method restriction", () => {
  it("rejects non-GET methods", async () => {
    const res = await handleFileRequest(
      makeRequest("/api/files/download?path=test.txt", "POST"),
      { rootDir: tmpDir }
    );
    expect(res.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// Path traversal protection (for download)
// ---------------------------------------------------------------------------

describe("path traversal protection", () => {
  it("blocks ../../../etc/passwd traversal", async () => {
    const res = await handleFileRequest(
      makeRequest("/api/files/download?path=../../../etc/passwd"),
      { rootDir: tmpDir }
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.detail).toContain("traversal");
  });

  it("blocks absolute path outside root", async () => {
    const res = await handleFileRequest(
      makeRequest("/api/files/download?path=/etc/passwd"),
      { rootDir: tmpDir }
    );
    // The sandbox resolution should catch this
    expect([403, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// /api/files/download (binary)
// ---------------------------------------------------------------------------

describe("/api/files/download", () => {
  it("downloads file content", async () => {
    await fs.writeFile(path.join(tmpDir, "hello.txt"), "hello world");

    const res = await handleFileRequest(
      makeRequest("/api/files/download?path=hello.txt"),
      { rootDir: tmpDir }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    const text = await res.text();
    expect(text).toBe("hello world");
  });

  it("rejects directory download", async () => {
    await fs.mkdir(path.join(tmpDir, "adir"));

    const res = await handleFileRequest(
      makeRequest("/api/files/download?path=adir"),
      { rootDir: tmpDir }
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent file", async () => {
    const res = await handleFileRequest(
      makeRequest("/api/files/download?path=missing.txt"),
      { rootDir: tmpDir }
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Unknown route
// ---------------------------------------------------------------------------

describe("unknown route", () => {
  it("returns 404 for /api/files/list (now tRPC only)", async () => {
    const res = await handleFileRequest(
      makeRequest("/api/files/list?path=."),
      { rootDir: tmpDir }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for /api/files/info (now tRPC only)", async () => {
    const res = await handleFileRequest(
      makeRequest("/api/files/info?path=test.txt"),
      { rootDir: tmpDir }
    );
    expect(res.status).toBe(404);
  });
});
