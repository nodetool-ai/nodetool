/**
 * Return-path analysis for generated Code node bodies: which shapes are
 * accepted, which are rejected, and what the model is told to do about it.
 */
import { describe, it, expect } from "vitest";
import { analyzeGeneratedCode } from "../src/code-gen/analyze.js";

interface Case {
  name: string;
  code: string;
  outputs: string[];
  ok: boolean;
  /** Substring the first error must carry, for the rejected cases. */
  mentions?: string;
}

const CASES: Case[] = [
  {
    name: "single return with every output",
    code: `const total = items.length;\nreturn { total, items };`,
    outputs: ["total", "items"],
    ok: true
  },
  {
    name: "ternary where both arms emit every output",
    code: `return n > 0 ? { sign: "+", n } : { sign: "-", n };`,
    outputs: ["sign", "n"],
    ok: true
  },
  {
    name: "if/else where both branches emit every output",
    code: `if (rows.length === 0) {\n  return { rows: [], count: 0 };\n} else {\n  return { rows, count: rows.length };\n}`,
    outputs: ["rows", "count"],
    ok: true
  },
  {
    name: "early return that emits every output",
    code: `if (!text) return { words: [], count: 0 };\nconst words = text.split(" ");\nreturn { words, count: words.length };`,
    outputs: ["words", "count"],
    ok: true
  },
  {
    name: "partition into always-emitted outputs",
    code: `const kept = [];\nconst dropped = [];\nfor (const row of rows) {\n  if (row.ok) kept.push(row); else dropped.push(row);\n}\nreturn { kept, dropped };`,
    outputs: ["kept", "dropped"],
    ok: true
  },
  {
    name: "string-literal keys",
    code: `return { "a-ok": 1, b: 2 };`,
    outputs: ["a-ok", "b"],
    ok: true
  },
  {
    name: "spread hides the key set, so the return is trusted",
    code: `return { ...base, count: 1 };`,
    outputs: ["count", "label"],
    ok: true
  },
  {
    name: "returning a variable is opaque, not a failure",
    code: `const result = { a: 1, b: 2 };\nreturn result;`,
    outputs: ["a", "b"],
    ok: true
  },
  {
    name: "nested helper returns are not the node's return",
    code: `function pick(row) {\n  return row.id;\n}\nreturn { ids: rows.map(pick) };`,
    outputs: ["ids"],
    ok: true
  },
  {
    name: "throw on the other branch is not a missing output",
    code: `if (!input) {\n  throw new Error("input required");\n}\nreturn { value: input };`,
    outputs: ["value"],
    ok: true
  },
  {
    name: "switch with a default where every case returns",
    code: `switch (kind) {\n  case "a":\n    return { label: "A", kind };\n  default:\n    return { label: "?", kind };\n}`,
    outputs: ["label", "kind"],
    ok: true
  },
  {
    name: "early return omitting an output",
    code: `if (!text) return { count: 0 };\nreturn { count: text.length, words: text.split(" ") };`,
    outputs: ["count", "words"],
    ok: false,
    mentions: "nodetool.control.If"
  },
  {
    name: "ternary arm omitting an output",
    code: `return ok ? { value, error: null } : { error: "bad" };`,
    outputs: ["value", "error"],
    ok: false,
    mentions: '"value"'
  },
  {
    name: "if without else falls off the end",
    code: `if (ok) {\n  return { value: 1 };\n}`,
    outputs: ["value"],
    ok: false,
    mentions: "without returning"
  },
  {
    name: "switch without a default falls off the end",
    code: `switch (kind) {\n  case "a":\n    return { label: "A" };\n}`,
    outputs: ["label"],
    ok: false,
    mentions: "without returning"
  },
  {
    name: "no return at all",
    code: `const total = 1 + 2;`,
    outputs: ["total"],
    ok: false,
    mentions: "never returns"
  },
  {
    name: "bare return",
    code: `return;`,
    outputs: ["value"],
    ok: false,
    mentions: "not an object"
  },
  {
    name: "returns a non-object literal",
    code: `return items.length > 0 ? [1, 2] : null;`,
    outputs: ["count"],
    ok: false,
    mentions: "not an object"
  },
  {
    name: "emits an undeclared key",
    code: `return { count: 1, extra: 2 };`,
    outputs: ["count"],
    ok: false,
    mentions: "not declared as an output"
  },
  {
    name: "syntax error",
    code: `return { a: };`,
    outputs: ["a"],
    ok: false,
    mentions: "Syntax error"
  }
];

describe("analyzeGeneratedCode", () => {
  for (const testCase of CASES) {
    it(testCase.name, () => {
      const result = analyzeGeneratedCode(testCase.code, testCase.outputs);
      expect(result.ok, result.errors.join(" | ")).toBe(testCase.ok);
      if (testCase.ok) {
        expect(result.errors).toEqual([]);
      } else {
        expect(result.errors.join(" | ")).toContain(testCase.mentions!);
      }
    });
  }

  it("reports each distinct problem once", () => {
    const result = analyzeGeneratedCode(
      `if (a) return { x: 1 };\nif (b) return { x: 2 };\nreturn { x: 3, y: 4 };`,
      ["x", "y"]
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it("parses a body the direct pass rejects", () => {
    // Top-level `await` inside a nested block is what forces the wrapped parse.
    const result = analyzeGeneratedCode(
      `const rows = [];\nfor (const url of urls) { rows.push(await fetch(url)); }\nreturn { rows };`,
      ["rows"]
    );
    expect(result.ok).toBe(true);
  });
});
