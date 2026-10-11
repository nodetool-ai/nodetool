import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { istanbulLines, parseLcov, readCoverageDir } from "../src/coverage.js";

describe("parseLcov", () => {
  it("collects hit lines and resolves relative paths", () => {
    const map = parseLcov("SF:src/a.ts\nDA:1,1\nDA:2,0\nDA:3,5\nend_of_record\n", "/pkg");
    expect([...(map.get("/pkg/src/a.ts") ?? [])]).toEqual([1, 3]);
  });
});

describe("istanbulLines", () => {
  it("lets the smallest statement decide a line", () => {
    const lines = istanbulLines({
      statementMap: {
        "0": { start: { line: 1 }, end: { line: 5 } },
        "1": { start: { line: 3 }, end: { line: 3 } }
      },
      s: { "0": 1, "1": 0 }
    });
    expect([...lines].sort()).toEqual([1, 2, 4, 5]);
  });
});

describe("readCoverageDir", () => {
  it("prefers coverage-final.json and returns null without a report", () => {
    const dir = mkdtempSync(join(tmpdir(), "mutator-cov-"));
    expect(readCoverageDir(join(dir, "coverage"), dir)).toBeNull();
    mkdirSync(join(dir, "coverage"));
    const file = join(dir, "src", "a.ts");
    writeFileSync(
      join(dir, "coverage", "coverage-final.json"),
      JSON.stringify({ [file]: { path: file, statementMap: { "0": { start: { line: 2 }, end: { line: 2 } } }, s: { "0": 3 } } })
    );
    expect([...(readCoverageDir(join(dir, "coverage"), dir)?.get(file) ?? [])]).toEqual([2]);
  });
});
