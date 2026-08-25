import { describe, expect, it } from "vitest";
import {
  FileWatchDebouncer,
  matchesFileWatchPattern,
  shouldEmitFileWatchEvent,
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

describe("FileWatchDebouncer", () => {
  // The clock is injectable, so a test clock or a monotonic source can read a
  // value below debounceMs. Nothing has fired yet, so nothing is a repeat.
  it.each([0, 1, 250, 499])(
    "does not suppress a path's first event on a clock starting at %i",
    (start) => {
      const debouncer = new FileWatchDebouncer(500, () => start);
      expect(debouncer.shouldSuppress("/w/a.txt")).toBe(false);
    }
  );

  it("debounces from the first fire, not from the clock's origin", () => {
    let now = 250;
    const debouncer = new FileWatchDebouncer(500, () => now);

    expect(debouncer.shouldSuppress("/w/a.txt")).toBe(false);
    now = 749; // 499ms after the fire, but 749ms after the clock's origin
    expect(debouncer.shouldSuppress("/w/a.txt")).toBe(true);
    now = 750;
    expect(debouncer.shouldSuppress("/w/a.txt")).toBe(false);
  });

  it("suppresses a repeat inside the window and allows one at the boundary", () => {
    let now = 1_000_000;
    const debouncer = new FileWatchDebouncer(500, () => now);

    expect(debouncer.shouldSuppress("/w/a.txt")).toBe(false);
    now += 499;
    expect(debouncer.shouldSuppress("/w/a.txt")).toBe(true);
    now += 1; // exactly debounceMs since the fire
    expect(debouncer.shouldSuppress("/w/a.txt")).toBe(false);
  });

  it("keeps one window per path", () => {
    let now = 0;
    const debouncer = new FileWatchDebouncer(500, () => now);

    expect(debouncer.shouldSuppress("/w/a.txt")).toBe(false);
    expect(debouncer.shouldSuppress("/w/b.txt")).toBe(false);
    now = 400;
    expect(debouncer.shouldSuppress("/w/a.txt")).toBe(true);
    expect(debouncer.shouldSuppress("/w/b.txt")).toBe(true);
  });

  it("never suppresses when the debounce window is zero", () => {
    const debouncer = new FileWatchDebouncer(0, () => 0);
    expect(debouncer.shouldSuppress("/w/a.txt")).toBe(false);
    expect(debouncer.shouldSuppress("/w/a.txt")).toBe(false);
  });
});

describe("shouldEmitFileWatchEvent", () => {
  const filter = {
    patterns: ["*.csv"],
    ignorePatterns: ["skip.*"],
    events: ["created", "modified", "deleted", "moved"]
  };
  const emit = (eventType: string, filePath: string, deb: FileWatchDebouncer) =>
    shouldEmitFileWatchEvent(eventType, filePath, filter, deb);

  it.each([
    ["emits a watched event on an included file", "modified", "/w/a.csv", true],
    ["drops an unwatched event type", "renamed", "/w/a.csv", false],
    ["drops an event type differing only in case", "MODIFIED", "/w/a.csv", false],
    ["drops an empty event type", "", "/w/a.csv", false],
    ["drops a file no include pattern matches", "modified", "/w/a.txt", false],
    ["drops an ignored file", "modified", "/w/skip.csv", false],
    ["matches on the basename, not the directory", "modified", "/skip.csv/a.csv", true]
  ])("%s", (_label, eventType, filePath, expected) => {
    const debouncer = new FileWatchDebouncer(500, () => 1_000_000);
    expect(emit(eventType, filePath, debouncer)).toBe(expected);
  });

  it("does not start a debounce window for an event it rejected", () => {
    let now = 1_000_000;
    const debouncer = new FileWatchDebouncer(500, () => now);

    // Rejected by event type, then by the pattern filter: neither may record a
    // fire time, or the first event that does pass gets swallowed.
    expect(emit("renamed", "/w/a.csv", debouncer)).toBe(false);
    expect(emit("modified", "/w/skip.csv", debouncer)).toBe(false);
    expect(emit("modified", "/w/a.csv", debouncer)).toBe(true);
    now += 100;
    expect(emit("modified", "/w/a.csv", debouncer)).toBe(false);
  });

  it("emits the first event of a watch started at clock zero", () => {
    const debouncer = new FileWatchDebouncer(500, () => 0);
    expect(emit("created", "/w/a.csv", debouncer)).toBe(true);
  });
});
