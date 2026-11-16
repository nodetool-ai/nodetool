/**
 * The lexical half of `assertLocalPathIsOwn`: where a path written by a
 * caller sits in the folder, before any link is resolved. Windows has
 * spellings of a drive path that `path.win32.relative` reads as another
 * root. They are checked here with `path.win32`, so the test needs no
 * Windows host. The real-path half runs on the host in
 * `packages/runtime/tests/storage-workspace.test.ts`.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";

import { lexicalKeyWithin } from "../src/storage-workspace.js";

describe("lexicalKeyWithin on Windows", () => {
  const root = "C:\\Users\\ana\\Project";
  const key = (target: string): string | null =>
    lexicalKeyWithin(root, target, path.win32, "ANA-PC");

  it.each([
    ["a drive path", "C:\\Users\\ana\\Project\\.nodetool\\x"],
    ["another case", "c:\\users\\ANA\\project\\.nodetool\\x"],
    ["forward slashes", "C:/Users/ana/Project/.nodetool/x"],
    ["a long path prefix", "\\\\?\\C:\\Users\\ana\\Project\\.nodetool\\x"],
    ["a device prefix", "\\\\.\\C:\\Users\\ana\\Project\\.nodetool\\x"],
    ["the administrative share on localhost", "\\\\localhost\\C$\\Users\\ana\\Project\\.nodetool\\x"],
    ["the administrative share on the loopback address", "\\\\127.0.0.1\\c$\\Users\\ana\\Project\\.nodetool\\x"],
    ["the administrative share on the host's own name", "\\\\ana-pc\\C$\\Users\\ana\\Project\\.nodetool\\x"],
    ["a long path prefix to the administrative share", "\\\\?\\UNC\\localhost\\C$\\Users\\ana\\Project\\.nodetool\\x"]
  ])("reads %s as the folder", (_label, target) => {
    expect(key(target)).toBe(".nodetool/x");
  });

  it("reads the root itself as the empty key", () => {
    expect(key("\\\\?\\C:\\Users\\ana\\Project")).toBe("");
  });

  it.each([
    ["another drive", "D:\\Users\\ana\\Project\\.nodetool\\x"],
    ["a share on another host", "\\\\files\\C$\\Users\\ana\\Project\\.nodetool\\x"],
    ["a sibling", "C:\\Users\\ana\\Project2\\x"],
    ["a parent", "\\\\?\\C:\\Users\\ana"]
  ])("reads %s as outside", (_label, target) => {
    expect(key(target)).toBeNull();
  });
});

describe("lexicalKeyWithin on POSIX", () => {
  const key = (target: string): string | null =>
    lexicalKeyWithin("/home/ana/project", target, path.posix, "ana-pc");

  it("reads paths in, at and out of the folder", () => {
    expect(key("/home/ana/project/.nodetool/x")).toBe(".nodetool/x");
    expect(key("/home/ana/project/a/../b")).toBe("b");
    expect(key("/home/ana/project")).toBe("");
    expect(key("/home/ana/project2/x")).toBeNull();
    expect(key("/home/ana/project/../x")).toBeNull();
  });

  it("keeps a name that only starts with two dots inside", () => {
    expect(key("/home/ana/project/..cache/x")).toBe("..cache/x");
  });
});
