/**
 * Unit tests for the local-file path policy shared by `GET /api/files/local`
 * and the tRPC `files.list` browser. The handler tests cover how the verdicts
 * are turned into responses; these cover the policy itself.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  LOCAL_FILE_ROOTS_ENV,
  UNRESTRICTED_ROOT,
  getLocalFileRoots,
  isUnrestricted,
  localPathDenialMessage,
  resolveLocalPath
} from "../src/lib/local-file-access.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-file-access-"));
  delete process.env[LOCAL_FILE_ROOTS_ENV];
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env[LOCAL_FILE_ROOTS_ENV];
});

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

describe("getLocalFileRoots", () => {
  it("defaults to the home directory", () => {
    expect(getLocalFileRoots()).toEqual([path.resolve(os.homedir())]);
  });

  it("reads a delimited list from the environment", () => {
    process.env[LOCAL_FILE_ROOTS_ENV] = [tmpDir, "/srv/media"].join(
      path.delimiter
    );
    expect(getLocalFileRoots()).toEqual([
      path.resolve(tmpDir),
      path.resolve("/srv/media")
    ]);
  });

  it("expands a leading tilde in a configured root", () => {
    process.env[LOCAL_FILE_ROOTS_ENV] = "~/media";
    expect(getLocalFileRoots()).toEqual([path.join(os.homedir(), "media")]);
  });

  it("falls back to home when the variable holds only separators", () => {
    process.env[LOCAL_FILE_ROOTS_ENV] = path.delimiter + " ";
    expect(getLocalFileRoots()).toEqual([path.resolve(os.homedir())]);
  });
});

describe("resolveLocalPath", () => {
  it("accepts an absolute path inside a root", async () => {
    const file = path.join(tmpDir, "clip.mp4");
    await fs.writeFile(file, "x");
    const result = await resolveLocalPath(file, [tmpDir]);
    expect(result).toEqual({ ok: true, path: file });
  });

  it("resolves a relative path against the first root", async () => {
    const result = await resolveLocalPath("sub/clip.mp4", [tmpDir]);
    expect(result).toEqual({
      ok: true,
      path: path.join(tmpDir, "sub", "clip.mp4")
    });
  });

  it("accepts a path that does not exist yet, inside a root", async () => {
    const result = await resolveLocalPath(
      path.join(tmpDir, "not", "created", "yet.png"),
      [tmpDir]
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a path outside every root", async () => {
    const result = await resolveLocalPath("/etc/passwd", [tmpDir]);
    expect(result).toEqual({ ok: false, reason: "outside_roots" });
  });

  it("rejects traversal out of a root", async () => {
    const result = await resolveLocalPath("../../etc/passwd", [tmpDir]);
    expect(result).toEqual({ ok: false, reason: "outside_roots" });
  });

  it("rejects a NUL byte", async () => {
    const result = await resolveLocalPath("/tmp/a\0b", [tmpDir]);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects an empty path", async () => {
    const result = await resolveLocalPath("", [tmpDir]);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a symlink pointing outside the roots", async (ctx) => {
    const link = path.join(tmpDir, "escape");
    if (!(await trySymlink("/etc/passwd", link))) return ctx.skip();
    const result = await resolveLocalPath(link, [tmpDir]);
    expect(result).toEqual({ ok: false, reason: "outside_roots" });
  });

  it("rejects a leaf reached through a symlinked parent", async (ctx) => {
    if (!(await trySymlink("/etc", path.join(tmpDir, "outside")))) {
      return ctx.skip();
    }
    const result = await resolveLocalPath(
      path.join(tmpDir, "outside", "passwd"),
      [tmpDir]
    );
    expect(result).toEqual({ ok: false, reason: "outside_roots" });
  });

  it("allows a symlink that stays inside the roots", async (ctx) => {
    const target = path.join(tmpDir, "real.txt");
    await fs.writeFile(target, "x");
    const link = path.join(tmpDir, "alias.txt");
    if (!(await trySymlink(target, link))) return ctx.skip();
    const result = await resolveLocalPath(link, [tmpDir]);
    expect(result).toEqual({ ok: true, path: link });
  });

  it("rejects sensitive home entries even inside a root", async () => {
    const home = os.homedir();
    for (const entry of [".ssh/id_rsa", ".aws/credentials", ".npmrc"]) {
      const result = await resolveLocalPath(path.join(home, entry), [home]);
      expect(result).toEqual({ ok: false, reason: "sensitive" });
    }
  });

  it("expands a leading tilde", async () => {
    const home = os.homedir();
    const result = await resolveLocalPath("~/Documents", [home]);
    expect(result).toEqual({ ok: true, path: path.join(home, "Documents") });
  });

  it("treats a root's own path as inside it", async () => {
    const result = await resolveLocalPath(tmpDir, [tmpDir]);
    expect(result).toEqual({ ok: true, path: tmpDir });
  });

  it("does not treat a sibling with a shared prefix as inside a root", async () => {
    const result = await resolveLocalPath(`${tmpDir}-sibling/file.txt`, [
      tmpDir
    ]);
    expect(result).toEqual({ ok: false, reason: "outside_roots" });
  });
});

/**
 * The desktop app runs the server as the user's own process and lets them drag
 * a file onto the canvas from anywhere. Home-only roots refused the preview of
 * a file kept outside home while the runner read it happily —
 * nodetool-ai/nodetool#4999.
 */
describe("resolveLocalPath with unrestricted roots", () => {
  it("refuses a file outside home under the default roots", async () => {
    const outside = path.join(tmpDir, "projects", "playingTag.png");
    expect(await resolveLocalPath(outside, [os.homedir()])).toEqual({
      ok: false,
      reason: "outside_roots"
    });
  });

  it("accepts that same file when the roots are unrestricted", async () => {
    const outside = path.join(tmpDir, "projects", "playingTag.png");
    expect(await resolveLocalPath(outside, [UNRESTRICTED_ROOT])).toEqual({
      ok: true,
      path: outside
    });
  });

  it("still refuses sensitive home entries", async () => {
    const result = await resolveLocalPath(
      path.join(os.homedir(), ".ssh", "id_rsa"),
      [UNRESTRICTED_ROOT]
    );
    expect(result).toEqual({ ok: false, reason: "sensitive" });
  });

  it("still refuses a NUL byte", async () => {
    expect(await resolveLocalPath("/tmp/a\0b", [UNRESTRICTED_ROOT])).toEqual({
      ok: false,
      reason: "invalid"
    });
  });

  it("resolves a relative path against home", async () => {
    const result = await resolveLocalPath("Documents/a.png", [
      UNRESTRICTED_ROOT
    ]);
    expect(result).toEqual({
      ok: true,
      path: path.join(os.homedir(), "Documents", "a.png")
    });
  });

  it("reads the marker off the environment", () => {
    process.env[LOCAL_FILE_ROOTS_ENV] = UNRESTRICTED_ROOT;
    const roots = getLocalFileRoots();
    expect(roots).toEqual([UNRESTRICTED_ROOT]);
    expect(isUnrestricted(roots)).toBe(true);
    expect(isUnrestricted([os.homedir()])).toBe(false);
  });
});

describe("localPathDenialMessage", () => {
  it("names the override variable when a path is out of bounds", () => {
    expect(localPathDenialMessage("outside_roots")).toContain(
      LOCAL_FILE_ROOTS_ENV
    );
  });

  it("returns a message for every reason", () => {
    for (const reason of ["invalid", "outside_roots", "sensitive"] as const) {
      expect(localPathDenialMessage(reason)).toBeTruthy();
    }
  });
});
