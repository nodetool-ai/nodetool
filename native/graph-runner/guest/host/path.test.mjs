import assert from "node:assert/strict";
import { posix } from "node:path";
import { test } from "node:test";
import path from "./path.mjs";

test("guest paths preserve Windows workspace drives", () => {
  const previous = globalThis.__host;
  globalThis.__host = { process: { platform: "win32" }, files: { cwd: () => "M:/workspace" } };
  try {
    assert.equal(path.resolve("M:/workspace", "output.png"), "M:/workspace/output.png");
    assert.equal(path.resolve("output.png"), "M:/workspace/output.png");
    assert.equal(path.resolve("C:\\inputs\\image.png"), "C:/inputs/image.png");
    assert.equal(path.normalize("M:/../../image.png"), "M:/image.png");
    assert.equal(path.dirname("M:/image.png"), "M:/");
    assert.equal(path.basename("M:/"), "");
    assert.equal(path.isAbsolute("M:\\workspace"), true);
    assert.equal(path.relative("M:/workspace", "M:/workspace/a"), "a");
    assert.equal(path.relative("M:/workspace", "C:/a"), "C:/a");
    assert.deepEqual(path.parse("M:/workspace/a.png"), { root: "M:/", dir: "M:/workspace", base: "a.png", ext: ".png", name: "a" });
  } finally {
    globalThis.__host = previous;
  }
});

test("POSIX host paths retain their existing behavior", () => {
  const previous = globalThis.__host;
  globalThis.__host = { process: { platform: "linux" }, files: { cwd: () => "/workspace" } };
  try {
    for (const value of ["/", "/a/b", "/a/../b/", "a/../b", "C:/a/../b", "/../../b"]) {
      for (const operation of ["normalize", "dirname", "basename", "isAbsolute", "parse"]) {
        assert.deepEqual(path[operation](value), posix[operation](value), `${operation}(${value})`);
      }
    }
    assert.equal(path.resolve("a", "../b"), "/workspace/b");
  } finally {
    globalThis.__host = previous;
  }
});
