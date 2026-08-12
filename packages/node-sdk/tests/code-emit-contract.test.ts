import { describe, it, expect } from "vitest";
import { usesEmitOutputContract } from "../src/code-body.js";
import { outputCallNames, parseCodeBody } from "../src/code-analysis.js";
import { validateCodeNodeBody } from "../src/code-node-validation.js";

const body = (
  code: string,
  availableInputs: string[] = [],
  declaredOutputs: string[] = [],
  connectedOutputs: string[] = []
) => ({ code, availableInputs, declaredOutputs, connectedOutputs });

const codes = (input: Parameters<typeof validateCodeNodeBody>[0]): string[] =>
  validateCodeNodeBody(input).map((issue) => issue.code);

describe("usesEmitOutputContract", () => {
  it.each([
    ['emit("a", 1);', "bare emit"],
    ['output("a", 1);', "bare output"],
    ['await output("a", 1);', "awaited output"],
    ['await emit("a", 1);', "awaited emit"],
    ['const x = 1; output("a", x);', "after a semicolon"],
    ['const x = 1;\nemit("a", x);', "after a newline"],
    ['if (x) { emit("a", 1); }', "inside a branch"],
    ['emit ("a", 1);', "space before the paren"],
    ['const p = emit("a", 1);', "as an assigned expression"]
  ])("is true for %s (%s)", (code) => {
    expect(usesEmitOutputContract(code)).toBe(true);
  });

  it.each([
    ["const r = {}; r.output(1);", "a method named output"],
    ["stream.emit(1);", "a method named emit"],
    ["myemit(1);", "a name ending in emit"],
    ["myoutput(1);", "a name ending in output"],
    ["const x = $emit(1);", "a name ending in emit after $"],
    ['const s = "call output(name, value) here";', "inside a string literal"],
    ["// call emit(\"a\", 1) here\nreturn { a: 1 };", "inside a line comment"],
    ["/* output(\"a\", 1) */\nreturn { a: 1 };", "inside a block comment"],
    ["return { total: inputs.a + inputs.b };", "no calls at all"],
    ["", "an empty body"]
  ])("is false for %s (%s)", (code) => {
    expect(usesEmitOutputContract(code)).toBe(false);
  });
});

describe("outputCallNames", () => {
  const names = (code: string) => {
    const parsed = parseCodeBody(code);
    if ("error" in parsed) throw new Error(parsed.error);
    return outputCallNames(parsed.statements);
  };

  it("collects literal handle names from both calls, anywhere in the body", () => {
    expect(
      names(
        'for (const x of inputs.items) { await emit("item", x); }\n' +
          'if (inputs.flag) { await output("count", 1); } else { await output("count", 2); }'
      )
    ).toEqual({ names: ["item", "count"], nonLiteral: false });
  });

  it("ignores same-named methods on other objects", () => {
    expect(names('bus.emit("x"); const r = {}; r.output("y");')).toEqual({
      names: [],
      nonLiteral: false
    });
  });

  it("flags a computed handle name", () => {
    expect(names('const k = "a"; await output(k, 1);')).toEqual({
      names: [],
      nonLiteral: true
    });
  });
});

describe("validateCodeNodeBody — emit/output contract", () => {
  it("accepts a body that sends every declared output", () => {
    expect(
      validateCodeNodeBody(
        body(
          'await output("total", inputs.a + inputs.b);',
          ["a", "b"],
          ["total"]
        )
      )
    ).toEqual([]);
  });

  it("errors when a declared output is never sent", () => {
    const issues = validateCodeNodeBody(
      body('await output("total", inputs.a);', ["a"], ["total", "count"])
    );
    const missing = issues.find((i) => i.code === "code_missing_output");
    expect(missing?.severity).toBe("error");
    expect(missing?.message).toContain('"count"');
    expect(missing?.message).toContain('await output("count", value)');
  });

  it("errors when a call names an undeclared output", () => {
    const issues = validateCodeNodeBody(
      body('await output("total", 1);\nawait emit("typo", 2);', [], ["total"])
    );
    const undeclared = issues.find((i) => i.code === "code_undeclared_output");
    expect(undeclared?.severity).toBe("error");
    expect(undeclared?.message).toContain('"typo"');
    expect(undeclared?.message).toMatch(/is not an output of this node/);
  });

  it("treats a connected-but-undeclared handle as a real handle", () => {
    expect(
      codes(body('await output("total", 1);', [], [], ["total"]))
    ).toEqual([]);
  });

  it("warns on a computed handle name and suppresses the missing-output errors", () => {
    const issues = validateCodeNodeBody(
      body(
        'const key = inputs.which;\nawait output(key, 1);',
        ["which"],
        ["a", "b"]
      )
    );
    expect(issues.map((i) => i.code)).toEqual(["code_output_dynamic_name"]);
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].message).toMatch(/cannot be checked statically/);
  });

  it("warns on a valued return, which carries no outputs", () => {
    const issues = validateCodeNodeBody(
      body('await output("total", 1);\nreturn { total: 1 };', [], ["total"])
    );
    const ignored = issues.find((i) => i.code === "code_return_ignored");
    expect(ignored?.severity).toBe("warning");
    expect(ignored?.message).toContain("output(name, value)");
  });

  it("accepts a bare `return` as early-exit control flow", () => {
    expect(
      codes(
        body(
          'if (!inputs.ok) { await output("total", 0); return; }\nawait output("total", 1);',
          ["ok"],
          ["total"]
        )
      )
    ).toEqual([]);
  });

  it("accepts branches the return-path rule would have rejected", () => {
    // Under the legacy contract this returns `{a}` on one path and `{b}` on the
    // other, so both outputs were reported missing.
    expect(
      codes(
        body(
          'if (inputs.flag) { await output("a", 1); await output("b", 2); }\n' +
            'else { await output("b", 3); await output("a", 4); }',
          ["flag"],
          ["a", "b"]
        )
      )
    ).toEqual([]);
  });

  it("does not flag `emit`/`output` as undefined names", () => {
    expect(
      codes(body('await emit("a", 1);\nawait output("a", 2);', [], ["a"]))
    ).toEqual([]);
  });

  it("still reports inputs, imports and undefined names on an emit body", () => {
    expect(
      codes(
        body(
          'await output("a", lodash.sum(inputs.missing));',
          ["present"],
          ["a"]
        )
      ).sort()
    ).toEqual(
      ["code_undefined_input", "code_undefined_name", "code_unused_input"].sort()
    );
  });
});

describe("validateCodeNodeBody — legacy bodies are unchanged", () => {
  it("still accepts the legacy return contract", () => {
    expect(
      validateCodeNodeBody(
        body(
          "const total = inputs.a + inputs.b;\nreturn { total };",
          ["a", "b"],
          ["total"]
        )
      )
    ).toEqual([]);
  });

  it("still reports a return path that omits an output", () => {
    const issues = validateCodeNodeBody(
      body(
        "if (inputs.flag) { return { a: 1 }; }\nreturn { a: 1, b: 2 };",
        ["flag"],
        ["a", "b"]
      )
    );
    const missing = issues.find((i) => i.code === "code_missing_output");
    expect(missing?.severity).toBe("warning");
    expect(missing?.message).toContain('"b"');
  });

  it("still reports a body that never returns", () => {
    const issues = validateCodeNodeBody(
      body("const x = inputs.a;", ["a"], ["out"])
    );
    expect(issues.map((i) => i.code)).toContain("code_no_return");
  });

  it("does not warn about deprecation — the examples gate treats warnings as errors", () => {
    expect(
      validateCodeNodeBody(body("return { out: 1 };", [], ["out"]))
    ).toEqual([]);
  });
});
