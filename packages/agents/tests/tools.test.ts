import { describe, it, expect } from "vitest";
import { extractJSON } from "../src/utils/json-parser.js";

// Minimal mock context for tool process calls
const mockContext = {} as any;

describe("extractJSON", () => {
  it("parses plain JSON string", () => {
    expect(extractJSON('{"a": 1}')).toEqual({ a: 1 });
  });

  it("extracts from fenced code block", () => {
    const text = 'Here is the result:\n```json\n{"key": "value"}\n```\nDone.';
    expect(extractJSON(text)).toEqual({ key: "value" });
  });

  it("extracts balanced braces from text", () => {
    const text = 'The answer is {"x": 42} and more text.';
    expect(extractJSON(text)).toEqual({ x: 42 });
  });

  it("returns null for non-JSON text", () => {
    expect(extractJSON("Hello, world!")).toBeNull();
  });

  it("handles nested objects", () => {
    const text = '{"outer": {"inner": true}}';
    expect(extractJSON(text)).toEqual({ outer: { inner: true } });
  });

  it("handles strings with braces inside", () => {
    const text = '{"msg": "hello {world}"}';
    expect(extractJSON(text)).toEqual({ msg: "hello {world}" });
  });
});
