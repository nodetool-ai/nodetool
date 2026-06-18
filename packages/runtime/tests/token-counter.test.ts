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

  it("counts a long, whitespace-broken input without pathological slowdown", () => {
    // A long but natural string stays close to the exact (single-shot) count;
    // the chunking only ever adds a small boundary over-count.
    const text = "The quick brown fox jumps over the lazy dog. ".repeat(200);
    const start = Date.now();
    const count = countTokens(text);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(count).toBeGreaterThan(1500);
  });

  it("handles a long unbroken run of identical characters quickly", () => {
    // The degenerate case that makes js-tiktoken's BPE O(n²) — chunking keeps
    // it bounded. Guards against regressing back to a multi-second encode.
    const start = Date.now();
    const count = countTokens("x".repeat(20000));
    expect(Date.now() - start).toBeLessThan(10000);
    expect(count).toBeGreaterThan(0);
  });
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
});
