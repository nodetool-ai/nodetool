/**
 * SafeRoot confines reads and writes to one directory. Each case builds a
 * real tree under a temp dir with a sibling `outside/` directory that a
 * symlink or `..` key could try to reach.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { openSafeRoot, type SafeRoot } from "../src/safe-root.js";

// Creating symlinks on Windows needs Developer Mode or admin rights.
const itSymlink = process.platform === "win32" ? it.skip : it;

describe("SafeRoot", () => {
  let base: string;
  let rootDir: string;
  let outside: string;
  let root: SafeRoot;

  beforeEach(async () => {
    base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "safe-root-")));
    rootDir = path.join(base, "root");
    outside = path.join(base, "outside");
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "secret.txt"), "secret");
    root = await openSafeRoot(rootDir);
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  const code = async (promise: Promise<unknown>): Promise<string> => {
    try {
      await promise;
    } catch (error) {
      return (error as { code?: string }).code ?? "no-code";
    }
    return "resolved";
  };

  describe("normal operations", () => {
    it("creates the root and exposes its realpath", async () => {
      expect(root.dir).toBe(rootDir);
      expect((await fs.stat(rootDir)).isDirectory()).toBe(true);
    });

    it("writes, reads, and reports existence", async () => {
      await root.write("a/b/c.txt", Buffer.from("hello"));
      expect((await root.readBytes("a/b/c.txt", { maxBytes: 100 })).toString()).toBe("hello");
      expect(await root.exists("a/b/c.txt")).toBe(true);
      expect(await root.exists("a/b")).toBe(true);
      expect(await root.exists("a/missing.txt")).toBe(false);
      expect(await root.exists("a/b/c.txt/below")).toBe(false);
    });

    it("overwrites atomically, keeps the existing mode, and leaves no temp files", async () => {
      await root.write("f.txt", Buffer.from("one"));
      if (process.platform !== "win32") {
        expect((await fs.stat(path.join(rootDir, "f.txt"))).mode & 0o777).toBe(0o600);
        await fs.chmod(path.join(rootDir, "f.txt"), 0o644);
      }
      await root.write("f.txt", Buffer.from("two"));
      expect(await fs.readFile(path.join(rootDir, "f.txt"), "utf8")).toBe("two");
      if (process.platform !== "win32") {
        expect((await fs.stat(path.join(rootDir, "f.txt"))).mode & 0o777).toBe(0o644);
      }
      expect(await fs.readdir(rootDir)).toEqual(["f.txt"]);
    });

    it("enforces maxBytes on read", async () => {
      await root.write("big.bin", Buffer.alloc(10));
      expect(await code(root.readBytes("big.bin", { maxBytes: 9 }))).toBe("too-large");
      expect(await root.readBytes("big.bin", { maxBytes: 10 })).toHaveLength(10);
    });

    it("reports a missing file and a directory distinctly", async () => {
      await fs.mkdir(path.join(rootDir, "dir"));
      expect(await code(root.readBytes("nope.txt", { maxBytes: 10 }))).toBe("not-found");
      expect(await code(root.readBytes("dir", { maxBytes: 10 }))).toBe("not-file");
      expect(await code(root.write("dir", Buffer.from("x")))).toBe("not-file");
    });

    it("copies a file in and enforces maxBytes on the source", async () => {
      await fs.writeFile(path.join(outside, "src.txt"), "source");
      await root.copyIn("copied/src.txt", path.join(outside, "src.txt"), { maxBytes: 100 });
      expect(await fs.readFile(path.join(rootDir, "copied", "src.txt"), "utf8")).toBe("source");
      expect(
        await code(root.copyIn("too-big.txt", path.join(outside, "src.txt"), { maxBytes: 3 }))
      ).toBe("too-large");
      expect(await root.exists("too-big.txt")).toBe(false);
      expect(await fs.readdir(rootDir)).toEqual(["copied"]);
    });
  });

  describe("path traversal", () => {
    it.each([
      ["../outside/secret.txt"],
      ["a/../../outside/secret.txt"],
      [".."],
      ["."],
      [""]
    ])("rejects %j for every operation", async (key) => {
      expect(await code(root.readBytes(key, { maxBytes: 100 }))).toMatch(/outside-root/);
      expect(await code(root.exists(key))).toMatch(/outside-root/);
      expect(await code(root.write(key, Buffer.from("x")))).toMatch(/outside-root/);
      expect(await fs.readdir(outside)).toEqual(["secret.txt"]);
    });

    it("allows `..` that stays inside the root", async () => {
      await root.write("a/../b.txt", Buffer.from("ok"));
      expect(await fs.readFile(path.join(rootDir, "b.txt"), "utf8")).toBe("ok");
    });

    it("rejects absolute paths, even ones inside the root", async () => {
      const inside = path.join(rootDir, "x.txt");
      await root.write("x.txt", Buffer.from("x"));
      for (const key of [path.join(outside, "secret.txt"), inside]) {
        expect(await code(root.readBytes(key, { maxBytes: 100 }))).toBe("invalid-path");
        expect(await code(root.exists(key))).toBe("invalid-path");
        expect(await code(root.write(key, Buffer.from("x")))).toBe("invalid-path");
      }
      expect(await fs.readFile(path.join(outside, "secret.txt"), "utf8")).toBe("secret");
    });

    it("rejects NUL bytes and drive-letter prefixes", async () => {
      expect(await code(root.readBytes("a\0b", { maxBytes: 100 }))).toBe("invalid-path");
      expect(await code(root.write("a\0b", Buffer.from("x")))).toBe("invalid-path");
      expect(await code(root.exists("C:secret.txt"))).toBe("invalid-path");
    });
  });

  describe("symlinks", () => {
    itSymlink("refuses a file symlink that escapes the root", async () => {
      await fs.symlink(path.join(outside, "secret.txt"), path.join(rootDir, "link"));
      expect(await code(root.readBytes("link", { maxBytes: 100 }))).toBe("symlink");
      expect(await code(root.exists("link"))).toBe("outside-root");
      expect(await code(root.write("link", Buffer.from("pwned")))).toBe("outside-root");
      expect(await fs.readFile(path.join(outside, "secret.txt"), "utf8")).toBe("secret");
    });

    itSymlink("refuses a directory symlink that escapes the root", async () => {
      await fs.symlink(outside, path.join(rootDir, "dir"));
      expect(await code(root.readBytes("dir/secret.txt", { maxBytes: 100 }))).toBe("symlink");
      expect(await code(root.exists("dir/secret.txt"))).toBe("outside-root");
      expect(await code(root.write("dir/new.txt", Buffer.from("x")))).toBe("symlink");
      await fs.writeFile(path.join(outside, "src.txt"), "src");
      expect(
        await code(root.copyIn("dir/c.txt", path.join(outside, "src.txt"), { maxBytes: 100 }))
      ).toBe("symlink");
      expect((await fs.readdir(outside)).sort()).toEqual(["secret.txt", "src.txt"]);
    });

    itSymlink("refuses a dangling symlink", async () => {
      await fs.symlink(path.join(outside, "gone.txt"), path.join(rootDir, "dangling"));
      expect(await code(root.exists("dangling"))).toBe("symlink");
      expect(await code(root.write("dangling", Buffer.from("x")))).toBe("symlink");
      await expect(fs.access(path.join(outside, "gone.txt"))).rejects.toThrow();
    });

    // fs-safe behavior: `exists` follows in-root links, reads refuse every
    // symlink, and a write replaces an in-root link instead of writing
    // through it. A symlinked parent directory is refused for writes.
    itSymlink("treats symlinks inside the root like fs-safe did", async () => {
      await root.write("real/f.txt", Buffer.from("real"));
      await fs.symlink(path.join(rootDir, "real", "f.txt"), path.join(rootDir, "in-file"));
      await fs.symlink(path.join(rootDir, "real"), path.join(rootDir, "in-dir"));

      expect(await root.exists("in-file")).toBe(true);
      expect(await root.exists("in-dir/f.txt")).toBe(true);
      expect(await code(root.readBytes("in-file", { maxBytes: 100 }))).toBe("symlink");
      expect(await code(root.readBytes("in-dir/f.txt", { maxBytes: 100 }))).toBe("symlink");
      expect(await code(root.write("in-dir/new.txt", Buffer.from("x")))).toBe("symlink");

      await root.write("in-file", Buffer.from("replaced"));
      expect((await fs.lstat(path.join(rootDir, "in-file"))).isSymbolicLink()).toBe(false);
      expect(await fs.readFile(path.join(rootDir, "in-file"), "utf8")).toBe("replaced");
      expect(await fs.readFile(path.join(rootDir, "real", "f.txt"), "utf8")).toBe("real");
    });

    itSymlink("refuses a symlinked copy source", async () => {
      await fs.writeFile(path.join(outside, "src.txt"), "src");
      await fs.symlink(path.join(outside, "src.txt"), path.join(outside, "src-link"));
      expect(
        await code(root.copyIn("c.txt", path.join(outside, "src-link"), { maxBytes: 100 }))
      ).toBe("symlink");
      expect(await root.exists("c.txt")).toBe(false);
    });
  });

  describe("hardlinks", () => {
    it("refuses to read or overwrite a hardlinked file, and to copy one in", async () => {
      await root.write("a.txt", Buffer.from("a"));
      await fs.link(path.join(rootDir, "a.txt"), path.join(outside, "alias.txt"));
      expect(await code(root.readBytes("a.txt", { maxBytes: 100 }))).toBe("hardlink");
      expect(await code(root.write("a.txt", Buffer.from("b")))).toBe("hardlink");
      expect(await fs.readFile(path.join(outside, "alias.txt"), "utf8")).toBe("a");
      expect(await root.exists("a.txt")).toBe(true);
      expect(
        await code(root.copyIn("c.txt", path.join(outside, "alias.txt"), { maxBytes: 100 }))
      ).toBe("hardlink");
    });
  });
});
