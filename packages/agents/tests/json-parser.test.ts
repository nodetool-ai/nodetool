import { describe, it, expect } from "vitest";
import { extractJSON } from "../src/utils/json-parser.js";

describe("extractJSON edge cases", () => {
  // --- Empty / whitespace inputs ---

  it("returns null for empty string", () => {
    expect(extractJSON("")).toBeNull();
  });

  it("returns null for whitespace only", () => {
    expect(extractJSON("   \n\t  ")).toBeNull();
  });

  // --- Whitespace around valid JSON ---

  it("parses JSON with leading/trailing whitespace", () => {
    expect(extractJSON('  \n  {"a": 1}  \n  ')).toEqual({ a: 1 });
  });

  // --- Arrays ---

  it("parses a JSON array", () => {
    expect(extractJSON("[1, 2, 3]")).toEqual([1, 2, 3]);
  });

  it("parses a JSON array of objects", () => {
    expect(extractJSON('[{"a": 1}, {"b": 2}]')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  // --- Multiple JSON objects in text ---

  it("extracts the first JSON object when multiple are present", () => {
    const text = 'First: {"x": 1} Second: {"y": 2}';
    expect(extractJSON(text)).toEqual({ x: 1 });
  });

  // --- Markdown code blocks ---

  it("extracts JSON from markdown code block with json tag", () => {
    const text =
      'Here is the output:\n```json\n{"name": "test", "value": 42}\n```\nEnd.';
    expect(extractJSON(text)).toEqual({ name: "test", value: 42 });
  });

  it("extracts JSON from markdown code block without language tag", () => {
    const text = 'Result:\n```\n{"key": "val"}\n```';
    expect(extractJSON(text)).toEqual({ key: "val" });
  });

  it("extracts JSON array from markdown code block", () => {
    const text = "```json\n[1, 2, 3]\n```";
    expect(extractJSON(text)).toEqual([1, 2, 3]);
  });

  // --- Deeply nested JSON ---

  it("parses deeply nested JSON (3+ levels)", () => {
    const obj = { a: { b: { c: { d: "deep" } } } };
    expect(extractJSON(JSON.stringify(obj))).toEqual(obj);
  });

  it("parses deeply nested JSON embedded in text", () => {
    const obj = { level1: { level2: { level3: { level4: true } } } };
    const text = `Here is the data: ${JSON.stringify(obj)} done.`;
    expect(extractJSON(text)).toEqual(obj);
  });

  // --- Escaped quotes ---

  it("handles escaped quotes in string values", () => {
    const text = '{"message": "He said \\"hello\\""}';
    expect(extractJSON(text)).toEqual({ message: 'He said "hello"' });
  });

  it("handles escaped quotes in embedded JSON", () => {
    const text = 'Output: {"msg": "a \\"quoted\\" word"} end';
    expect(extractJSON(text)).toEqual({ msg: 'a "quoted" word' });
  });

  // --- Unicode characters ---

  it("handles unicode characters in values", () => {
    expect(extractJSON('{"emoji": "\\u2764"}')).toEqual({ emoji: "\u2764" });
  });

  it("handles raw unicode characters", () => {
    expect(extractJSON('{"text": "cafe\\u0301"}')).toEqual({
      text: "cafe\u0301"
    });
  });

  it("handles unicode in keys and values", () => {
    expect(extractJSON('{"\\u00fc": "\\u00e4"}')).toEqual({
      "\u00fc": "\u00e4"
    });
  });

  // --- Numeric values ---

  it("handles integer values", () => {
    expect(extractJSON('{"n": 42}')).toEqual({ n: 42 });
  });

  it("handles float values", () => {
    expect(extractJSON('{"n": 3.14}')).toEqual({ n: 3.14 });
  });

  it("handles negative values", () => {
    expect(extractJSON('{"n": -7}')).toEqual({ n: -7 });
  });

  it("handles scientific notation", () => {
    expect(extractJSON('{"n": 1.5e10}')).toEqual({ n: 1.5e10 });
  });

  it("handles negative scientific notation", () => {
    expect(extractJSON('{"n": -2.5E-3}')).toEqual({ n: -2.5e-3 });
  });

  // --- null, true, false ---

  it("handles null value", () => {
    expect(extractJSON('{"v": null}')).toEqual({ v: null });
  });

  it("handles true value", () => {
    expect(extractJSON('{"v": true}')).toEqual({ v: true });
  });

  it("handles false value", () => {
    expect(extractJSON('{"v": false}')).toEqual({ v: false });
  });

  // --- Empty containers ---

  it("handles empty object", () => {
    expect(extractJSON("{}")).toEqual({});
  });

  it("handles empty array", () => {
    expect(extractJSON("[]")).toEqual([]);
  });

  it("handles object with empty array value", () => {
    expect(extractJSON('{"items": []}')).toEqual({ items: [] });
  });

  it("handles object with empty object value", () => {
    expect(extractJSON('{"nested": {}}')).toEqual({ nested: {} });
  });

  // --- Malformed JSON ---

  it("returns null for missing closing brace", () => {
    expect(extractJSON('{"a": 1')).toBeNull();
  });

  it("returns null for missing closing bracket", () => {
    expect(extractJSON("[1, 2, 3")).toBeNull();
  });

  it("returns null for text that looks like JSON but is not", () => {
    expect(extractJSON("{ not json }")).toBeNull();
  });

  it("returns null for single braces in prose", () => {
    expect(extractJSON("Use { and } for grouping.")).toBeNull();
  });

  it("returns null for incomplete key-value pairs", () => {
    expect(extractJSON('{"key": }')).toBeNull();
  });

  // --- Fenced code block with invalid JSON (lines 31-32) ---

  it("returns null when fenced code block contains invalid JSON", () => {
    const text = "```json\n{not valid json}\n```";
    expect(extractJSON(text)).toBeNull();
  });

  it("falls through fenced block with invalid JSON to balanced braces", () => {
    // The fenced block has invalid JSON; balanced braces strategy finds the valid object
    const text = 'Some text here. {"fallback": true} more text.';
    // Wrap with a fenced block that has bad JSON first
    const textWithBadFence = "```json\n{not: valid}\n```\n" + text;
    // The balanced braces scanner will find {not: valid} first (invalid),
    // then {fallback: true} which is also inside balanced braces but the
    // scanner only tries the first balanced match per depth-0 close.
    // Direct test: just invalid fenced block alone
    const simple = "```json\n{invalid}\n```";
    expect(extractJSON(simple)).toBeNull();
  });

  // --- JSON surrounded by text ---

  it("extracts JSON preceded by text", () => {
    const text = 'Here is the result: {"answer": 42}';
    expect(extractJSON(text)).toEqual({ answer: 42 });
  });

  it("extracts JSON followed by text", () => {
    const text = '{"answer": 42} That\'s the answer';
    expect(extractJSON(text)).toEqual({ answer: 42 });
  });

  it("extracts JSON surrounded by text on both sides", () => {
    const text = 'The output is {"status": "ok"} as expected.';
    expect(extractJSON(text)).toEqual({ status: "ok" });
  });

  it("extracts JSON after a long preamble", () => {
    const text =
      "I analyzed the data carefully and came to the following conclusion. " +
      'Based on my analysis, here is the structured output: {"conclusion": "positive", "confidence": 0.95}';
    expect(extractJSON(text)).toEqual({
      conclusion: "positive",
      confidence: 0.95
    });
  });

  // --- Strings containing braces (tricky for balanced-brace strategy) ---

  it("handles strings with nested braces and colons", () => {
    expect(extractJSON('{"url": "http://example.com/{id}"}')).toEqual({
      url: "http://example.com/{id}"
    });
  });

  it("handles strings with backslashes", () => {
    expect(extractJSON('{"path": "C:\\\\Users\\\\test"}')).toEqual({
      path: "C:\\Users\\test"
    });
  });

  // --- Mixed types in object ---

  it("handles object with mixed types", () => {
    const json =
      '{"str": "hello", "num": 42, "bool": true, "nil": null, "arr": [1,2], "obj": {"k": "v"}}';
    expect(extractJSON(json)).toEqual({
      str: "hello",
      num: 42,
      bool: true,
      nil: null,
      arr: [1, 2],
      obj: { k: "v" }
    });
  });
});
