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

  it("blocks a symlink under the root that points outside it", async () => {
    // A symlink living inside the sandbox but resolving to an external target
    // passes a lexical prefix check yet must be rejected after realpath.
    const secret = path.join(os.tmpdir(), "file-api-secret.txt");
    await fs.writeFile(secret, "top secret");
    const link = path.join(tmpDir, "escape.txt");
    await fs.symlink(secret, link);

    const res = await handleFileRequest(
      makeRequest("/api/files/download?path=escape.txt"),
      { rootDir: tmpDir }
    );
    await fs.rm(secret, { force: true });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.detail).toContain("traversal");
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
// /api/files/local (streaming by absolute path)
// ---------------------------------------------------------------------------

describe("/api/files/local", () => {
  function localRequest(
    absPath: string,
    init?: { method?: string; headers?: Record<string, string> }
  ): Request {
    const url = `http://localhost/api/files/local?path=${encodeURIComponent(
      absPath
    )}`;
    return new Request(url, {
      method: init?.method ?? "GET",
      headers: init?.headers
    });
  }

  it("streams the full file with an inferred content type", async () => {
    const file = path.join(tmpDir, "clip.mp4");
    await fs.writeFile(file, "video-bytes");

    const res = await handleFileRequest(localRequest(file));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Length")).toBe("11");
    expect(await res.text()).toBe("video-bytes");
  });

  it("serves a byte range as 206 Partial Content", async () => {
    const file = path.join(tmpDir, "song.mp3");
    await fs.writeFile(file, "0123456789");

    const res = await handleFileRequest(
      localRequest(file, { headers: { Range: "bytes=2-5" } })
    );
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(res.headers.get("Content-Length")).toBe("4");
    expect(await res.text()).toBe("2345");
  });

  it("returns 416 for an unsatisfiable range", async () => {
    const file = path.join(tmpDir, "song.mp3");
    await fs.writeFile(file, "0123456789");

    const res = await handleFileRequest(
      localRequest(file, { headers: { Range: "bytes=999-1000" } })
    );
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */10");
  });

  it("answers HEAD with metadata and no body", async () => {
    const file = path.join(tmpDir, "clip.mp4");
    await fs.writeFile(file, "video-bytes");

    const res = await handleFileRequest(localRequest(file, { method: "HEAD" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("11");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(await res.text()).toBe("");
  });

  it("returns 404 for a missing file", async () => {
    const res = await handleFileRequest(
      localRequest(path.join(tmpDir, "nope.mp4"))
    );
    expect(res.status).toBe(404);
  });

  it("rejects a directory", async () => {
    const dir = path.join(tmpDir, "adir");
    await fs.mkdir(dir);
    const res = await handleFileRequest(localRequest(dir));
    expect(res.status).toBe(400);
  });

  it("denies sensitive home paths (e.g. ~/.ssh)", async () => {
    const sshKey = path.join(os.homedir(), ".ssh", "id_rsa");
    const res = await handleFileRequest(localRequest(sshKey));
    expect(res.status).toBe(403);
  });

  it("rejects non-GET/HEAD methods", async () => {
    const file = path.join(tmpDir, "clip.mp4");
    await fs.writeFile(file, "x");
    const res = await handleFileRequest(
      localRequest(file, { method: "POST" })
    );
    expect(res.status).toBe(405);
  });

  it("is disabled in production", async () => {
    process.env["NODETOOL_ENV"] = "production";
    const res = await handleFileRequest(
      localRequest(path.join(tmpDir, "clip.mp4"))
    );
    expect(res.status).toBe(403);
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
