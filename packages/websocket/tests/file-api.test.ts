/**
 * Tests for file-api.ts — path sandboxing, file listing, info, and download.
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
    const res = await handleFileRequest(makeRequest("/api/files/list?path=."));
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
      makeRequest("/api/files/list?path=.", "POST"),
      { rootDir: tmpDir },
    );
    expect(res.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// Path traversal protection
// ---------------------------------------------------------------------------

describe("path traversal protection", () => {
  it("blocks ../../../etc/passwd traversal", async () => {
    const res = await handleFileRequest(
      makeRequest("/api/files/list?path=../../../etc/passwd"),
      { rootDir: tmpDir },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.detail).toContain("traversal");
  });

  it("blocks absolute path outside root", async () => {
    const res = await handleFileRequest(
      makeRequest("/api/files/info?path=/etc/passwd"),
      { rootDir: tmpDir },
    );
    // The sandbox resolution should catch this
    expect([403, 404]).toContain(res.status);
  });

  it("allows paths within the sandbox", async () => {
    await fs.mkdir(path.join(tmpDir, "subdir"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "subdir", "file.txt"), "hello");

    const res = await handleFileRequest(
      makeRequest("/api/files/info?path=subdir/file.txt"),
      { rootDir: tmpDir },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("file.txt");
    expect(body.is_dir).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// /api/files/list
// ---------------------------------------------------------------------------

describe("/api/files/list", () => {
  it("requires path parameter", async () => {
    const res = await handleFileRequest(
      makeRequest("/api/files/list"),
      { rootDir: tmpDir },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("path parameter");
  });

  it("lists directory contents with metadata", async () => {
    await fs.writeFile(path.join(tmpDir, "a.txt"), "hello");
    await fs.mkdir(path.join(tmpDir, "subdir"));

    const res = await handleFileRequest(
      makeRequest("/api/files/list?path=."),
      { rootDir: tmpDir },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);

    const names = body.map((e: { name: string }) => e.name);
    expect(names).toContain("a.txt");
    expect(names).toContain("subdir");

    const dir = body.find((e: { name: string }) => e.name === "subdir");
    expect(dir.is_dir).toBe(true);

    const file = body.find((e: { name: string }) => e.name === "a.txt");
    expect(file.is_dir).toBe(false);
    expect(file.size).toBe(5);
  });

  it("returns 404 for non-existent directory", async () => {
    const res = await handleFileRequest(
      makeRequest("/api/files/list?path=nonexistent"),
      { rootDir: tmpDir },
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// /api/files/info
// ---------------------------------------------------------------------------

describe("/api/files/info", () => {
  it("returns file info", async () => {
    await fs.writeFile(path.join(tmpDir, "info-test.txt"), "data");

    const res = await handleFileRequest(
      makeRequest("/api/files/info?path=info-test.txt"),
      { rootDir: tmpDir },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("info-test.txt");
    expect(body.size).toBe(4);
    expect(body.is_dir).toBe(false);
    expect(body.modified_at).toBeTruthy();
  });

  it("returns 404 for missing file", async () => {
    const res = await handleFileRequest(
      makeRequest("/api/files/info?path=nope.txt"),
      { rootDir: tmpDir },
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// /api/files/download
// ---------------------------------------------------------------------------

describe("/api/files/download", () => {
  it("downloads file content", async () => {
    const content = "download me";
    await fs.writeFile(path.join(tmpDir, "dl.txt"), content);

    const res = await handleFileRequest(
      makeRequest("/api/files/download?path=dl.txt"),
      { rootDir: tmpDir },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    const body = await res.text();
    expect(body).toBe(content);
  });

  it("rejects directory download", async () => {
    await fs.mkdir(path.join(tmpDir, "mydir"));

    const res = await handleFileRequest(
      makeRequest("/api/files/download?path=mydir"),
      { rootDir: tmpDir },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("directory");
  });
});

// ---------------------------------------------------------------------------
// Unknown route
// ---------------------------------------------------------------------------

describe("unknown route", () => {
  it("returns 404 for unknown file API route", async () => {
    const res = await handleFileRequest(
      makeRequest("/api/files/unknown"),
      { rootDir: tmpDir },
    );
    expect(res.status).toBe(404);
  });
});
