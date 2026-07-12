/**
 * Coverage tests for FileStorageAdapter.
 *
 * Exercises store/retrieve/exists/list/delete/stat plus the URI parsing
 * (keyFromUri) branches and missing-file / invalid-key error paths using a
 * real temp directory.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { FileStorageAdapter } from "../src/file-storage-adapter.js";

describe("FileStorageAdapter", () => {
  let tmpDir: string;
  let adapter: FileStorageAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fsa-cov-"));
    // realpath so uriForKey / rootDir comparisons match on macOS symlinked tmp
    tmpDir = await fs.realpath(tmpDir);
    adapter = new FileStorageAdapter(tmpDir);
  });

  afterEach(async () => {
    delete process.env.NODETOOL_MAX_UPLOAD_BYTES;
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("constructor", () => {
    it("creates the root directory and exposes rootDir", async () => {
      const nested = path.join(tmpDir, "created", "deep");
      const a = new FileStorageAdapter(nested);
      const st = await fs.stat(nested);
      expect(st.isDirectory()).toBe(true);
      expect(a.rootDir).toBe(await fs.realpath(nested));
    });
  });

  describe("store", () => {
    it("writes bytes and returns a file:// URL that round-trips", async () => {
      const uri = await adapter.store("hello.txt", Buffer.from("hi"));
      expect(uri.startsWith("file://")).toBe(true);
      const got = await adapter.retrieve(uri);
      expect(Buffer.from(got!).toString()).toBe("hi");
    });

    it("creates nested directories on write", async () => {
      await adapter.store("a/b/c.txt", Buffer.from("nested"));
      const got = await adapter.retrieve(adapter.uriForKey("a/b/c.txt"));
      expect(Buffer.from(got!).toString()).toBe("nested");
    });

    it("overwrites an existing key", async () => {
      await adapter.store("dup.txt", Buffer.from("v1"));
      await adapter.store("dup.txt", Buffer.from("v2"));
      const got = await adapter.retrieve(adapter.uriForKey("dup.txt"));
      expect(Buffer.from(got!).toString()).toBe("v2");
    });

    it("rejects an upload exceeding the configured limit", async () => {
      process.env.NODETOOL_MAX_UPLOAD_BYTES = "4";
      await expect(
        adapter.store("big.bin", Buffer.from("toolong"))
      ).rejects.toThrow(/exceeds maximum size/);
    });
  });

  describe("keyFromUri via retrieve", () => {
    beforeEach(async () => {
      await adapter.store("dir/file.txt", Buffer.from("payload"));
    });

    it("resolves a /api/storage/<key> path", async () => {
      const got = await adapter.retrieve("/api/storage/dir/file.txt");
      expect(Buffer.from(got!).toString()).toBe("payload");
    });

    it("resolves a relative api/storage/<key> path", async () => {
      const got = await adapter.retrieve("api/storage/dir/file.txt");
      expect(Buffer.from(got!).toString()).toBe("payload");
    });

    it("resolves an https URL with /api/storage/ pathname", async () => {
      const got = await adapter.retrieve(
        "https://example.com/api/storage/dir/file.txt"
      );
      expect(Buffer.from(got!).toString()).toBe("payload");
    });

    it("returns null for an http URL with a non-storage pathname", async () => {
      expect(await adapter.retrieve("http://example.com/other/x")).toBeNull();
    });

    it("returns null for an unrecognized URI scheme", async () => {
      expect(await adapter.retrieve("gopher://weird")).toBeNull();
    });

    it("returns null for a file:// URI outside the root", async () => {
      const outside = pathToFileURL(path.join(os.tmpdir(), "elsewhere.txt")).toString();
      expect(await adapter.retrieve(outside)).toBeNull();
    });

    it("returns null when the key normalizes out of bounds", async () => {
      expect(await adapter.retrieve("/api/storage/../escape")).toBeNull();
    });

    it("returns null for a missing file", async () => {
      expect(await adapter.retrieve("/api/storage/nope.txt")).toBeNull();
    });
  });

  describe("exists", () => {
    it("true for a stored key, false for a missing one", async () => {
      await adapter.store("e.txt", Buffer.from("x"));
      expect(await adapter.exists(adapter.uriForKey("e.txt"))).toBe(true);
      expect(await adapter.exists(adapter.uriForKey("missing.txt"))).toBe(false);
    });

    it("false for an unparseable URI", async () => {
      expect(await adapter.exists("not-a-uri")).toBe(false);
    });

    it("false when the key normalizes out of bounds", async () => {
      expect(await adapter.exists("/api/storage/../escape")).toBe(false);
    });
  });

  describe("uriForKey", () => {
    it("builds a file:// URL under the root", () => {
      const uri = adapter.uriForKey("sub/x.txt");
      expect(uri.startsWith("file://")).toBe(true);
      expect(decodeURIComponent(uri)).toContain("sub/x.txt");
    });

    it("throws on an invalid (traversal) key", () => {
      expect(() => adapter.uriForKey("../evil")).toThrow(/Invalid storage key/);
    });
  });

  describe("list flat", () => {
    beforeEach(async () => {
      await adapter.store("root.txt", Buffer.from("r"));
      await adapter.store("a/one.txt", Buffer.from("1"));
      await adapter.store("a/b/two.txt", Buffer.from("22"));
    });

    it("recursively lists all keys under empty prefix", async () => {
      const res = await adapter.list("");
      const keys = res.entries.map((e) => e.key);
      expect(keys).toEqual(["a/b/two.txt", "a/one.txt", "root.txt"]);
      expect(res.commonPrefixes).toEqual([]);
      const two = res.entries.find((e) => e.key === "a/b/two.txt")!;
      expect(two.size).toBe(2);
      expect(typeof two.modifiedAt).toBe("number");
    });

    it("treats '/' prefix as the whole root", async () => {
      const res = await adapter.list("/");
      expect(res.entries.map((e) => e.key)).toContain("root.txt");
    });

    it("lists only keys under a subtree prefix", async () => {
      const res = await adapter.list("a");
      expect(res.entries.map((e) => e.key)).toEqual([
        "a/b/two.txt",
        "a/one.txt"
      ]);
    });

    it("returns empty on an invalid prefix", async () => {
      const res = await adapter.list("../etc");
      expect(res.entries).toEqual([]);
      expect(res.commonPrefixes).toEqual([]);
    });

    it("returns empty for a non-existent prefix directory", async () => {
      const res = await adapter.list("does/not/exist");
      expect(res.entries).toEqual([]);
    });
  });

  describe("list hierarchical (delimiter '/')", () => {
    beforeEach(async () => {
      await adapter.store("top.txt", Buffer.from("t"));
      await adapter.store("sub/inner.txt", Buffer.from("i"));
      await adapter.store("sub/deeper/x.txt", Buffer.from("x"));
    });

    it("returns direct file entries and subdir common prefixes", async () => {
      const res = await adapter.list("", { delimiter: "/" });
      expect(res.entries.map((e) => e.key)).toEqual(["top.txt"]);
      expect(res.commonPrefixes).toEqual(["sub/"]);
    });

    it("descends into a named prefix", async () => {
      const res = await adapter.list("sub", { delimiter: "/" });
      expect(res.entries.map((e) => e.key)).toEqual(["sub/inner.txt"]);
      expect(res.commonPrefixes).toEqual(["sub/deeper/"]);
    });

    it("returns empty when the prefix directory is missing", async () => {
      const res = await adapter.list("ghost", { delimiter: "/" });
      expect(res.entries).toEqual([]);
      expect(res.commonPrefixes).toEqual([]);
    });

    it("returns empty on an invalid prefix", async () => {
      const res = await adapter.list("../x", { delimiter: "/" });
      expect(res.entries).toEqual([]);
    });
  });

  describe("delete", () => {
    it("removes an existing file and reports true", async () => {
      await adapter.store("del.txt", Buffer.from("bye"));
      const uri = adapter.uriForKey("del.txt");
      expect(await adapter.delete(uri)).toBe(true);
      expect(await adapter.exists(uri)).toBe(false);
    });

    it("returns false for a missing file", async () => {
      expect(await adapter.delete(adapter.uriForKey("gone.txt"))).toBe(false);
    });

    it("returns false for an unparseable URI", async () => {
      expect(await adapter.delete("not-a-uri")).toBe(false);
    });

    it("returns false when the key normalizes out of bounds", async () => {
      expect(await adapter.delete("/api/storage/../escape")).toBe(false);
    });
  });

  describe("stat", () => {
    it("returns size and modifiedAt for a file", async () => {
      await adapter.store("s.txt", Buffer.from("abcde"));
      const st = await adapter.stat(adapter.uriForKey("s.txt"));
      expect(st).not.toBeNull();
      expect(st!.key).toBe("s.txt");
      expect(st!.size).toBe(5);
      expect(typeof st!.modifiedAt).toBe("number");
    });

    it("returns null for a directory", async () => {
      await adapter.store("d/child.txt", Buffer.from("c"));
      const st = await adapter.stat(adapter.uriForKey("d"));
      expect(st).toBeNull();
    });

    it("returns null for a missing file", async () => {
      expect(await adapter.stat(adapter.uriForKey("absent.txt"))).toBeNull();
    });

    it("returns null for an unparseable URI", async () => {
      expect(await adapter.stat("not-a-uri")).toBeNull();
    });

    it("returns null when the key normalizes out of bounds", async () => {
      expect(await adapter.stat("/api/storage/../escape")).toBeNull();
    });
  });
});
