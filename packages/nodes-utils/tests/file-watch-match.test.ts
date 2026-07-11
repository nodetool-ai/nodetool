import { describe, it, expect } from "vitest";
import {
  matchesGlob,
  shouldProcessFile,
  EventDebouncer
} from "../src/file-watch-match.js";

describe("matchesGlob", () => {
  it("matches everything with '*'", () => {
    expect(matchesGlob("anything.txt", "*")).toBe(true);
  });

  it("matches an extension glob", () => {
    expect(matchesGlob("notes.txt", "*.txt")).toBe(true);
    expect(matchesGlob("notes.md", "*.txt")).toBe(false);
  });

  it("treats '?' as a single-character wildcard", () => {
    expect(matchesGlob("a.txt", "?.txt")).toBe(true);
    expect(matchesGlob("ab.txt", "?.txt")).toBe(false);
  });

  it("escapes literal dots", () => {
    expect(matchesGlob("axtxt", "*.txt")).toBe(false);
  });
});

describe("shouldProcessFile", () => {
  it("accepts a path matching an include pattern", () => {
    expect(shouldProcessFile("/tmp/a.txt", ["*.txt"], [])).toBe(true);
  });

  it("rejects a path with no matching include pattern", () => {
    expect(shouldProcessFile("/tmp/a.md", ["*.txt"], [])).toBe(false);
  });

  it("lets ignore patterns win over include patterns", () => {
    expect(shouldProcessFile("/tmp/tmp.txt", ["*"], ["tmp.*"])).toBe(false);
  });

  it("matches on the basename, not the directory", () => {
    expect(shouldProcessFile("/deep/nested/dir/file.json", ["*.json"], [])).toBe(
      true
    );
  });
});

describe("EventDebouncer", () => {
  it("skips a second event inside the window and admits it after", () => {
    let clock = 1000;
    const debouncer = new EventDebouncer(500, () => clock);

    expect(debouncer.shouldSkip("a")).toBe(false); // first event admitted
    clock = 1200; // 200ms < 500ms window
    expect(debouncer.shouldSkip("a")).toBe(true); // debounced
    clock = 1800; // 600ms after the first admit
    expect(debouncer.shouldSkip("a")).toBe(false); // window elapsed
  });

  it("tracks keys independently", () => {
    const clock = 1000;
    const debouncer = new EventDebouncer(500, () => clock);
    expect(debouncer.shouldSkip("a")).toBe(false);
    expect(debouncer.shouldSkip("b")).toBe(false);
    expect(debouncer.shouldSkip("a")).toBe(true); // "a" now within window
  });
});
