import { describe, expect, it } from "vitest";
import {
  isAtOrUnder,
  isIgnoredProjectPath,
  isInSkippedDirectory,
  isSkippedDirectory
} from "../src/project-folder-scan.js";

describe("isSkippedDirectory", () => {
  it.each([
    ["node_modules", true],
    [".git", true],
    [".nodetool", true],
    ["a", false],
    ["x.hidden", false],
    ["Node_Modules", false]
  ])("%s -> %s", (name, expected) => {
    expect(isSkippedDirectory(name)).toBe(expected);
  });
});

describe("isInSkippedDirectory", () => {
  it.each([
    ["a", false],
    [".git", false],
    ["node_modules", false],
    [".git/config", true],
    ["a/node_modules/x", true],
    ["a/.hidden/b/c.txt", true],
    ["a/b/.env", false],
    ["a/b", false]
  ])("%s -> %s", (path, expected) => {
    expect(isInSkippedDirectory(path)).toBe(expected);
  });
});

describe("isIgnoredProjectPath", () => {
  it.each([
    [".nodetool", true],
    [".NodeTool/x", true],
    ["projects/a/.nodetool/x", true],
    [".nodetool.md", false],
    ["x.nodetool/y", false],
    [".nodetool-old", false],
    ["a/node_modules/x", true],
    ["a/b.txt", false]
  ])("%s -> %s", (path, expected) => {
    expect(isIgnoredProjectPath(path)).toBe(expected);
  });
});

describe("isAtOrUnder", () => {
  const cases: [string, string[], boolean][] = [
    ["a", [], false],
    ["a", ["a"], true],
    ["a/b", ["a"], true],
    ["a/b/c", ["a/b"], true],
    ["a/b", ["a/b/c"], false],
    ["ab/c", ["a"], false],
    ["a/b", ["b"], false],
    ["a/b/c", ["x", "a"], true]
  ];
  it.each(cases)("%s in %j -> %s", (path, dirs, expected) => {
    expect(isAtOrUnder(path, new Set(dirs))).toBe(expected);
  });

  it("agrees with a segment-prefix model over every short path", () => {
    const segs = ["a", "b", "c"];
    const paths: string[] = [];
    const walk = (parts: string[]): void => {
      if (parts.length > 0) paths.push(parts.join("/"));
      if (parts.length < 3) segs.forEach((s) => walk([...parts, s]));
    };
    walk([]);
    for (const path of paths) {
      for (const dir of paths) {
        const model = path === dir || path.startsWith(dir + "/");
        expect(isAtOrUnder(path, new Set([dir]))).toBe(model);
      }
    }
  });
});
