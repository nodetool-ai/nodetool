import type { Chunk } from "../../../stores/ApiTypes";
import {
  MAX_RENDERED_TEXT_CHARS,
  concatTextChunksSafely,
  documentBytes,
  formatAudioChunkTimestamp,
  groupTextChunks,
  hashBytesBounded,
  hashStringBounded,
  htmlFromData,
  isPdfBytes,
  stableKeyForOutputValue,
  withOccurrenceSuffix
} from "../outputRendererModel";

const textChunk = (content: string): Chunk =>
  ({ type: "chunk", content_type: "text", content, done: false }) as Chunk;
const toolChunk = (): Chunk =>
  ({ type: "chunk", content_type: "tool_call", content: "", done: false }) as Chunk;

describe("hashStringBounded", () => {
  it("is deterministic and includes the length", () => {
    expect(hashStringBounded("abc")).toBe(hashStringBounded("abc"));
    expect(hashStringBounded("abc")).toMatch(/-3$/);
    expect(hashStringBounded("abc")).not.toBe(hashStringBounded("abd"));
  });

  it("hashes head and tail separately for long strings", () => {
    const long = "a".repeat(5000);
    expect(hashStringBounded(long).split("-")).toHaveLength(3);
    expect(hashStringBounded(long)).not.toBe(
      hashStringBounded(`${long.slice(1)}b`)
    );
  });
});

describe("hashBytesBounded", () => {
  it("distinguishes byte arrays and covers the tail", () => {
    expect(hashBytesBounded([1, 2, 3])).not.toBe(hashBytesBounded([1, 2, 4]));
    const big = new Uint8Array(5000);
    const changedTail = new Uint8Array(5000);
    changedTail[4999] = 7;
    expect(hashBytesBounded(big)).not.toBe(hashBytesBounded(changedTail));
    expect(hashBytesBounded(big).split("-")).toHaveLength(3);
  });
});

describe("withOccurrenceSuffix", () => {
  it("suffixes repeats with their occurrence count", () => {
    const seen = new Map<string, number>();
    expect(withOccurrenceSuffix("k", seen)).toBe("k");
    expect(withOccurrenceSuffix("k", seen)).toBe("k-1");
    expect(withOccurrenceSuffix("k", seen)).toBe("k-2");
    expect(withOccurrenceSuffix("j", seen)).toBe("j");
  });
});

describe("stableKeyForOutputValue", () => {
  it.each([
    [null, "null"],
    [undefined, "undefined"],
    [3, "number:3"],
    [true, "boolean:true"],
    [BigInt(9), "bigint:9"],
    [{ id: "a1" }, "id:a1"],
    [{ id: 4 }, "id:4"],
    [{ uri: "asset://x" }, "uri:asset://x"],
    [{ type: "image", name: "cat" }, "type-name:image:cat"]
  ])("keys %p as %s", (value, expected) => {
    expect(stableKeyForOutputValue(value)).toBe(expected);
  });

  it("prefixes strings, bytes, arrays and plain objects", () => {
    expect(stableKeyForOutputValue("hi")).toMatch(/^str:/);
    expect(stableKeyForOutputValue(new Uint8Array([1]))).toMatch(/^u8:/);
    expect(stableKeyForOutputValue([1, 2])).toMatch(/^arr:/);
    expect(stableKeyForOutputValue({ type: "image", w: 1 })).toMatch(
      /^type:image:/
    );
    expect(stableKeyForOutputValue({ a: 1 })).toMatch(/^json:/);
    expect(stableKeyForOutputValue(Symbol.for("s"))).toBe(
      "other:Symbol(s)"
    );
  });

  it("falls back when an object cannot be serialized", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(stableKeyForOutputValue(cyclic)).toBe("object");
  });
});

describe("concatTextChunksSafely", () => {
  it("joins text and counts empty and missing chunks as used", () => {
    const chunks = [
      textChunk("a"),
      textChunk(""),
      undefined as unknown as Chunk,
      textChunk("b")
    ];
    expect(concatTextChunksSafely(chunks)).toEqual({
      text: "ab",
      truncated: false,
      totalChunks: 4,
      usedChunks: 3
    });
  });

  it("cuts the chunk that crosses the limit", () => {
    const big = "x".repeat(MAX_RENDERED_TEXT_CHARS - 2);
    const result = concatTextChunksSafely([
      textChunk(big),
      textChunk("abcd"),
      textChunk("never")
    ]);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBe(MAX_RENDERED_TEXT_CHARS);
    expect(result.text.endsWith("ab")).toBe(true);
    expect(result.usedChunks).toBe(2);
    expect(result.totalChunks).toBe(3);
  });

  it("stops at the next chunk once the limit is reached exactly", () => {
    const result = concatTextChunksSafely([
      textChunk("x".repeat(MAX_RENDERED_TEXT_CHARS)),
      textChunk("more")
    ]);
    expect(result.truncated).toBe(true);
    expect(result.usedChunks).toBe(1);
    expect(result.text.length).toBe(MAX_RENDERED_TEXT_CHARS);
  });
});

describe("formatAudioChunkTimestamp", () => {
  it.each([
    [0, "00:00.000"],
    [5.25, "00:05.250"],
    [65.5, "01:05.500"],
    [3725.125, "01:02:05.125"],
    [-1, "00:00.000"],
    [Number.NaN, "00:00.000"],
    [Number.POSITIVE_INFINITY, "00:00.000"]
  ])("formats %p as %s", (seconds, expected) => {
    expect(formatAudioChunkTimestamp(seconds)).toBe(expected);
  });
});

describe("documentBytes", () => {
  it("accepts bytes, number arrays and JSON-serialized byte objects", () => {
    expect(documentBytes(new Uint8Array([1, 2]))).toEqual(
      new Uint8Array([1, 2])
    );
    expect(documentBytes([3, 4])).toEqual(new Uint8Array([3, 4]));
    expect(documentBytes({ "1": 6, "0": 5, name: "x" })).toEqual(
      new Uint8Array([5, 6])
    );
  });

  it("returns null when there are no bytes", () => {
    expect(documentBytes(undefined)).toBeNull();
    expect(documentBytes("text")).toBeNull();
    expect(documentBytes([])).toBeNull();
    expect(documentBytes({ name: "x" })).toBeNull();
  });
});

describe("isPdfBytes", () => {
  it("detects the %PDF magic number", () => {
    expect(isPdfBytes(new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(isPdfBytes(new TextEncoder().encode("%PDX"))).toBe(false);
    expect(isPdfBytes(new TextEncoder().encode("%PD"))).toBe(false);
  });
});

describe("htmlFromData", () => {
  it("decodes strings, bytes and number arrays", () => {
    const bytes = new Uint8Array(Array.from(new TextEncoder().encode("<b>hi</b>")));
    expect(htmlFromData("<p>x</p>")).toBe("<p>x</p>");
    expect(htmlFromData(bytes)).toBe("<b>hi</b>");
    expect(htmlFromData(Array.from(bytes))).toBe("<b>hi</b>");
    expect(htmlFromData({})).toBe("");
  });
});

describe("groupTextChunks", () => {
  it("merges runs of text and keeps other chunks in place", () => {
    const a = textChunk("a");
    const b = textChunk("b");
    const tool = toolChunk();
    const c = textChunk("c");
    const isText = (chunk: Chunk) => chunk.content_type === "text";
    expect(groupTextChunks([a, b, tool, c], isText)).toEqual([
      { kind: "text", chunks: [a, b] },
      { kind: "other", chunk: tool },
      { kind: "text", chunks: [c] }
    ]);
    expect(groupTextChunks([], isText)).toEqual([]);
  });
});
