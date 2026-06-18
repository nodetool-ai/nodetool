/**
 * Unit tests for the shared js-tiktoken token counter.
 */
import { describe, it, expect } from "vitest";
import { countTokens, truncateToTokens } from "../src/token-counter.js";

describe("countTokens", () => {
  it("returns 0 for empty/nullish input", () => {
    expect(countTokens("")).toBe(0);
    expect(countTokens(null)).toBe(0);
    expect(countTokens(undefined)).toBe(0);
  });

  it("returns a positive count for non-empty text", () => {
    expect(countTokens("hello world")).toBeGreaterThan(0);
  });

  it("scales with text length", () => {
    expect(countTokens("hello world this is a longer sentence")).toBeGreaterThan(
      countTokens("hello")
    );
  });

  it("is additive when split at a whitespace boundary", () => {
    // The splitter breaks *before* whitespace so each piece keeps its leading
    // space, matching cl100k's own regex-piece boundaries. Splitting the text
    // before a space (so the second half keeps the leading space) is therefore
    // exactly additive — the property the implementation relies on.
    const a = "The quick brown fox";
    const b = " jumps over the lazy dog.";
    expect(countTokens(a + b)).toBe(countTokens(a) + countTokens(b));
  });

  it("counts a long, whitespace-broken input", () => {
    const text = "The quick brown fox jumps over the lazy dog. ".repeat(500);
    expect(countTokens(text)).toBeGreaterThan(4000);
  });

  it(
    "handles a long unbroken run of identical characters without pathological slowdown",
    () => {
      // js-tiktoken's per-piece BPE is O(n²), so a boundary-free run used to
      // take ~55s to encode; the hard-split keeps it bounded. The guard is the
      // generous per-test timeout rather than a wall-clock assertion (which
      // flakes on shared CI) — a regression back to O(n²) blows past 15s while
      // the bounded path finishes in well under a second of real compute.
      expect(countTokens("x".repeat(20000))).toBeGreaterThan(0);
    },
    15000
  );
});

describe("truncateToTokens", () => {
  it("returns the input unchanged when within the limit", () => {
    const text = "hello world";
    expect(truncateToTokens(text, 100)).toBe(text);
  });

  it("returns an empty string for a non-positive limit", () => {
    expect(truncateToTokens("hello world", 0)).toBe("");
    expect(truncateToTokens("hello world", -5)).toBe("");
  });

  it("truncates to at most maxTokens tokens", () => {
    const text = "one two three four five six seven eight nine ten";
    const truncated = truncateToTokens(text, 3);
    expect(truncated.length).toBeLessThan(text.length);
    expect(countTokens(truncated)).toBeLessThanOrEqual(3);
  });

  it(
    "truncates a long unbroken run without pathological slowdown",
    () => {
      // Must not feed the whole boundary-free run to encode() in one shot.
      const truncated = truncateToTokens("x".repeat(20000), 50);
      expect(countTokens(truncated)).toBeLessThanOrEqual(50);
    },
    15000
  );
});
