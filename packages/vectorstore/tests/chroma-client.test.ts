import { describe, it, expect } from "vitest";
import { splitDocument } from "../src/chroma-client.js";

describe("splitDocument", () => {
  it("returns single chunk for short text", () => {
    const chunks = splitDocument("hello world", "src1");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("hello world");
    expect(chunks[0].source_id).toBe("src1");
    expect(chunks[0].start_index).toBe(0);
  });

  it("splits on double newlines by default", () => {
    const text = "paragraph one\n\nparagraph two\n\nparagraph three";
    const chunks = splitDocument(text, "doc", 40, 0);
    // Each paragraph is short enough to be its own chunk
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(40);
    }
  });

  it("respects custom chunkSize", () => {
    const text = "abcdefghij".repeat(20); // 200 chars
    const chunks = splitDocument(text, "src", 50, 0);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(50);
    }
  });

  it("includes overlap between consecutive chunks", () => {
    const text = "x".repeat(100);
    const chunks = splitDocument(text, "src", 60, 20, []);
    // With chunkSize=60 and overlap=20, there should be more than one chunk
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("assigns correct source_id to all chunks", () => {
    const text = "a\n\nb\n\nc\n\nd\n\ne";
    const chunks = splitDocument(text, "my-source", 5, 0);
    for (const c of chunks) {
      expect(c.source_id).toBe("my-source");
    }
  });

  it("returns empty array for empty text", () => {
    const chunks = splitDocument("", "src");
    expect(chunks).toHaveLength(0);
  });

  it("falls back to character splitting when no separator matches", () => {
    const text = "a".repeat(100);
    // No separators present, forces character-level split
    const chunks = splitDocument(text, "src", 30, 0, ["|||"]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(30);
    }
  });

  it("start_index tracks position in original text", () => {
    const text = "hello world\n\ngoodbye world";
    const chunks = splitDocument(text, "src", 15, 0);
    // First chunk should start at 0
    expect(chunks[0].start_index).toBe(0);
    // Subsequent chunks have non-zero start indices
    if (chunks.length > 1) {
      expect(chunks[chunks.length - 1].start_index).toBeGreaterThan(0);
    }
  });

  it("handles text shorter than chunkSize without splitting", () => {
    const text = "short";
    const chunks = splitDocument(text, "s", 1000, 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("short");
  });

  it("uses custom separators when provided", () => {
    const text = "part1|part2|part3";
    const chunks = splitDocument(text, "src", 10, 0, ["|"]);
    expect(chunks.length).toBeGreaterThan(1);
  });
});
