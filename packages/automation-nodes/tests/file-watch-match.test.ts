import { describe, expect, it } from "vitest";
import {
  matchesFileWatchPattern,
  shouldProcessFileWatchPath
} from "../src/lib/file-watch-match.js";

describe("matchesFileWatchPattern", () => {
  it("matches everything for '*'", () => {
    expect(matchesFileWatchPattern("anything.txt", "*")).toBe(true);
  });

  it("treats '*' as any run and '?' as a single character", () => {
    expect(matchesFileWatchPattern("report.csv", "*.csv")).toBe(true);
    expect(matchesFileWatchPattern("report.csv", "*.txt")).toBe(false);
    expect(matchesFileWatchPattern("a1.log", "a?.log")).toBe(true);
    expect(matchesFileWatchPattern("a12.log", "a?.log")).toBe(false);
  });

  it("treats '.' as a literal, not as any-character", () => {
    expect(matchesFileWatchPattern("axcsv", "*.csv")).toBe(false);
  });

  it("treats a backslash escape as literal text", () => {
    // "\d" must not become a digit class.
    expect(matchesFileWatchPattern("7", "\\d")).toBe(false);
    expect(matchesFileWatchPattern("\\d", "\\d")).toBe(true);
  });

  it("treats regex metacharacters as literals", () => {
    expect(matchesFileWatchPattern("a+b.txt", "a+b.txt")).toBe(true);
    expect(matchesFileWatchPattern("aab.txt", "a+b.txt")).toBe(false);
    expect(matchesFileWatchPattern("v(1).txt", "v(1).txt")).toBe(true);
    expect(matchesFileWatchPattern("data[0].json", "data[0].json")).toBe(true);
    expect(matchesFileWatchPattern("a|b", "a|b")).toBe(true);
    expect(matchesFileWatchPattern("a", "a|b")).toBe(false);
  });

  it("does not throw on a pattern with unbalanced regex syntax", () => {
    // Previously this compiled to an invalid regex and threw at watch time.
    expect(() => matchesFileWatchPattern("weird(.txt", "weird(*")).not.toThrow();
    expect(matchesFileWatchPattern("weird(.txt", "weird(*")).toBe(true);
    expect(() => matchesFileWatchPattern("x", "a{2,")).not.toThrow();
  });

  it("anchors the match to the whole filename", () => {
    expect(matchesFileWatchPattern("prefix-a.csv", "a.csv")).toBe(false);
  });

  // A POSIX filename may hold any byte but "/" and NUL. The compiled "."
  // used to skip all four line terminators, so the function contradicted
  // itself: "*" matched "a\nb.txt" (short-circuited) and "**" did not.
  describe.each([
    ["LF", "\n"],
    ["CR", "\r"],
    ["U+2028 line separator", "\u2028"],
    ["U+2029 paragraph separator", "\u2029"]
  ])("a filename containing %s", (_label, terminator) => {
    const filename = `a${terminator}b.txt`;

    it("is matched by '*'", () => {
      expect(matchesFileWatchPattern(filename, "*")).toBe(true);
      expect(matchesFileWatchPattern(filename, "**")).toBe(true);
      expect(matchesFileWatchPattern(filename, "*.txt")).toBe(true);
      expect(matchesFileWatchPattern(filename, "a*")).toBe(true);
    });

    it("is matched by '?' one character at a time", () => {
      expect(matchesFileWatchPattern(`a${terminator}b`, "a?b")).toBe(true);
    });

    it("still fails a pattern it does not match", () => {
      expect(matchesFileWatchPattern(filename, "*.csv")).toBe(false);
    });
  });

  it("counts an astral character as the single character '?' matches", () => {
    expect(matchesFileWatchPattern("a\u{1F600}.txt", "a?.txt")).toBe(true);
    expect(matchesFileWatchPattern("\u{1F600}\u{1F600}", "??")).toBe(true);
    expect(matchesFileWatchPattern("\u{1F600}", "??")).toBe(false);
  });
});

describe("shouldProcessFileWatchPath", () => {
  it("rejects an ignored file even when an include pattern matches", () => {
    expect(
      shouldProcessFileWatchPath("/tmp/w/skip.csv", {
        patterns: ["*.csv"],
        ignorePatterns: ["skip.*"]
      })
    ).toBe(false);
  });

  it("accepts a file matching an include pattern", () => {
    expect(
      shouldProcessFileWatchPath("/tmp/w/keep.csv", {
        patterns: ["*.csv"],
        ignorePatterns: []
      })
    ).toBe(true);
  });

  it("skips a file no include pattern matches", () => {
    expect(
      shouldProcessFileWatchPath("/tmp/w/keep.txt", {
        patterns: ["*.csv"],
        ignorePatterns: []
      })
    ).toBe(false);
  });
});
