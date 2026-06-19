import { describe, it, expect } from "vitest";
import {
  truncateToolResult,
  MAX_TOOL_RESULT_CHARS
} from "../src/index.js";

describe("truncateToolResult", () => {
  it("returns short results unchanged", () => {
    const text = "small result";
    expect(truncateToolResult(text)).toBe(text);
  });

  it("returns a result exactly at the cap unchanged", () => {
    const text = "x".repeat(MAX_TOOL_RESULT_CHARS);
    expect(truncateToolResult(text)).toBe(text);
  });

  it("caps an oversized result and appends a notice", () => {
    const huge = "y".repeat(MAX_TOOL_RESULT_CHARS * 100);
    const out = truncateToolResult(huge);

    // The kept body is exactly the cap; the notice is extra, but the total
    // stays a tiny, bounded amount over the cap (never near the original).
    expect(out.startsWith("y".repeat(MAX_TOOL_RESULT_CHARS))).toBe(true);
    expect(out.length).toBeLessThan(MAX_TOOL_RESULT_CHARS + 500);
    expect(out).toContain("truncated");
  });

  it("respects a custom cap", () => {
    const out = truncateToolResult("z".repeat(100), 10);
    expect(out.startsWith("z".repeat(10))).toBe(true);
    expect(out).toContain("truncated");
  });

  it("does not split a surrogate pair at the cut", () => {
    // Cap lands exactly between the two halves of the emoji at index 10-11.
    const text = "abcdefghij" + "😀" + "z".repeat(100);
    const out = truncateToolResult(text, 11);
    // The kept prefix pulls back to the full emoji boundary (10 chars),
    // never leaving the lone high surrogate at index 10.
    const lastBodyCode = out.charCodeAt(9);
    expect(lastBodyCode).toBe("j".charCodeAt(0));
    expect(out.startsWith("abcdefghij\n\n")).toBe(true);
    expect(out).not.toContain("\uD83D\n");
  });

  it("keeps a whole emoji when it fits before the cut", () => {
    const text = "ab" + "😀" + "z".repeat(100);
    // Cut at 4 keeps "ab😀" (4 UTF-16 units) intact.
    const out = truncateToolResult(text, 4);
    expect(out.startsWith("ab😀\n\n")).toBe(true);
  });
});
