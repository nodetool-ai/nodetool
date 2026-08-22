/**
 * Unit tests for the CodeAct action error diagnostics: the entry-module line
 * offset and the stack rewrite that turns prelude-offset `user-code` frames
 * into action-relative frames with a source excerpt.
 */
import { describe, it, expect } from "vitest";
import { entryBodyLineOffset } from "../src/js-sandbox-worker/interpreter.js";
import { annotateActionStack } from "../src/codeact/action-diagnostics.js";

describe("entryBodyLineOffset", () => {
  it("is 2 for import-free code (the plain wrapper)", () => {
    expect(entryBodyLineOffset("const a = 1;\nreturn a;")).toBe(2);
  });

  it("is 3 when static imports are hoisted to their own line", () => {
    expect(
      entryBodyLineOffset('import { x } from "pack";\nreturn x;')
    ).toBe(3);
  });

  it("is 2 for code that does not parse — its error is reported against the plain wrapper", () => {
    expect(entryBodyLineOffset("const x = {;")).toBe(2);
  });
});

describe("annotateActionStack", () => {
  // The combined module an executor builds: `${prelude}\n${code}`.
  // prelude.split("\n").length = 4; the wrapper adds 2 lines, so action line 1
  // sits at module line 7 and action line 2 at module line 8.
  const prelude = "// p1\n// p2\n// p3\n// p4";
  const code = "const a = 1;\nthrow new Error('boom');";

  it("rewinds user-code frames into action coordinates and quotes the line", () => {
    const result = annotateActionStack(
      "Error: boom\n    at user-code:8:9",
      prelude,
      code
    );
    expect(result.stack).toContain("at action:2:9");
    expect(result.stack).toContain("your code, line 2");
    expect(result.stack).toContain("throw new Error('boom');");
  });

  it("rewinds named frames too (`at fn (user-code:L:C)`)", () => {
    const result = annotateActionStack(
      "Error: boom\n    at <anonymous> (user-code:8:9)",
      prelude,
      code
    );
    expect(result.stack).toContain("(action:2:9)");
    expect(result.stack).toContain("your code, line 2");
  });

  it("adds a caret under the quoted line when the column resolves", () => {
    const result = annotateActionStack(
      "SyntaxError: expecting '('\n    at user-code:8:7",
      prelude,
      code
    );
    expect(result.stack).toMatch(
      /line 2: throw new Error\('boom'\);\n\s+\^$/
    );
  });

  it("leaves frames above the action's first line untouched (prelude-internal)", () => {
    const result = annotateActionStack(
      "Error: prelude\n    at user-code:3:1",
      prelude,
      code
    );
    expect(result.stack).toContain("at user-code:3:1");
    expect(result.stack).not.toContain("your code");
  });

  it("maps every user-code frame, not just the first", () => {
    const result = annotateActionStack(
      "Error: deep\n    at inner (user-code:8:9)\n    at user-code:9:1",
      prelude,
      "const a = 1;\nthrow new Error('boom');\nconst tail = true;"
    );
    expect(result.stack).toContain("at inner (action:2:9)");
    expect(result.stack).toContain("at action:3:1");
    // The excerpt comes from the innermost frame that landed in user code.
    expect(result.stack).toContain("your code, line 2");
  });

  it("answers empty for a missing stack", () => {
    expect(annotateActionStack(undefined, prelude, code)).toEqual({});
  });

  it("keeps the stack unchanged when no user-code frame appears", () => {
    const stack = "Error: host\n    at somewhere-else:1:1";
    expect(annotateActionStack(stack, prelude, code)).toEqual({ stack });
  });
});
