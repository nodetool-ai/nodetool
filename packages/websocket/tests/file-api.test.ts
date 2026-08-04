/**
 * Tests for file-api.ts — local-file streaming.
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
  // The endpoint only serves paths inside the configured roots (home by
  // default); point them at the fixture dir for these tests.
  process.env["NODETOOL_LOCAL_FILE_ROOTS"] = tmpDir;
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env["NODETOOL_LOCAL_FILE_ROOTS"];
  vi.restoreAllMocks();
});

function makeRequest(urlPath: string, method = "GET"): Request {
  return new Request(`http://localhost${urlPath}`, { method });
}

/**
 * Creating symlinks on Windows needs Developer Mode or elevation; when the
 * environment can't, the caller skips the test instead of failing on EPERM.
 */
async function trySymlink(target: string, link: string): Promise<boolean> {
  try {
    await fs.symlink(target, link);
    return true;
  } catch (error) {
    if (
      process.platform === "win32" &&
      (error as NodeJS.ErrnoException).code === "EPERM"
    ) {
      return false;
    }
    throw error;
  }
}

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
    // Sensitive entries are refused even when home is an allowed root.
    process.env["NODETOOL_LOCAL_FILE_ROOTS"] = os.homedir();
    const sshKey = path.join(os.homedir(), ".ssh", "id_rsa");
    const res = await handleFileRequest(localRequest(sshKey));
    expect(res.status).toBe(403);
  });

  it("denies a path outside the allowed roots", async () => {
    const res = await handleFileRequest(localRequest("/etc/passwd"));
    expect(res.status).toBe(403);
    expect((await res.json()).detail).toContain("outside the allowed roots");
  });

  it("defaults the root to the home directory", async () => {
    delete process.env["NODETOOL_LOCAL_FILE_ROOTS"];
    // A path guaranteed to be outside home on every platform (the Windows
    // tmpdir lives *inside* home, so tmpDir won't do). The policy check runs
    // before the existence check, so the file doesn't have to exist.
    const outside = path.join(
      path.parse(os.homedir()).root,
      "nodetool-file-api-outside",
      "clip.mp4"
    );
    const res = await handleFileRequest(localRequest(outside));
    expect(res.status).toBe(403);
  });

  it("denies a symlink that escapes the roots", async (ctx) => {
    const link = path.join(tmpDir, "escape.txt");
    if (!(await trySymlink("/etc/passwd", link))) return ctx.skip();
    const res = await handleFileRequest(localRequest(link));
    expect(res.status).toBe(403);
  });

  it("denies a path that escapes through a symlinked parent", async (ctx) => {
    const linkDir = path.join(tmpDir, "outside");
    if (!(await trySymlink("/etc", linkDir))) return ctx.skip();
    const res = await handleFileRequest(
      localRequest(path.join(linkDir, "passwd"))
    );
    expect(res.status).toBe(403);
  });

  it("allows multiple configured roots", async () => {
    const otherDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-api-alt-"));
    try {
      process.env["NODETOOL_LOCAL_FILE_ROOTS"] = [tmpDir, otherDir].join(
        path.delimiter
      );
      const file = path.join(otherDir, "clip.mp4");
      await fs.writeFile(file, "video-bytes");
      const res = await handleFileRequest(localRequest(file));
      expect(res.status).toBe(200);
    } finally {
      await fs.rm(otherDir, { recursive: true, force: true });
    }
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
    const res = await handleFileRequest(makeRequest("/api/files/list?path=."));
    expect(res.status).toBe(404);
  });

  it("returns 404 for /api/files/info (now tRPC only)", async () => {
    const res = await handleFileRequest(
      makeRequest("/api/files/info?path=test.txt")
    );
    expect(res.status).toBe(404);
  });
});
