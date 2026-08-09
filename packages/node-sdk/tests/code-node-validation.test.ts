import { describe, it, expect } from "vitest";
import { validateCodeNodeBody } from "../src/code-node-validation.js";
import { collectBoundNames, freeIdentifiers, parseCodeBody } from "../src/code-analysis.js";

/** Codes of the issues a body produces, for terse assertions. */
function codes(
  input: Parameters<typeof validateCodeNodeBody>[0]
): string[] {
  return validateCodeNodeBody(input).map((issue) => issue.code);
}

const body = (
  code: string,
  availableInputs: string[] = [],
  declaredOutputs: string[] = [],
  connectedOutputs: string[] = []
) => ({ code, availableInputs, declaredOutputs, connectedOutputs });

describe("validateCodeNodeBody", () => {
  it("accepts a body that reads its inputs and returns its outputs", () => {
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

  it("reports a syntax error and stops there", () => {
    const issues = validateCodeNodeBody(
      body("const x = ;\nreturn { out: x };", [], ["out"])
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("code_syntax");
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toMatch(/does not parse/);
  });

  it("rejects module declarations the async body cannot contain", () => {
    expect(
      codes(body("import fs from 'fs';\nreturn { out: 1 };", [], ["out"]))
    ).toContain("code_module");
  });

  it("flags a name that is neither a sandbox API nor an input", () => {
    const issues = validateCodeNodeBody(
      body("return { out: lodash.sum(inputs.values) };", ["values"], ["out"])
    );
    const undefinedName = issues.find((i) => i.code === "code_undefined_name");
    expect(undefinedName?.severity).toBe("error");
    expect(undefinedName?.message).toContain('"lodash"');
  });

  it("accepts sandbox bridges, inputs, and the persistent state object", () => {
    expect(
      codes(
        body(
          `const res = await fetch(inputs.url);
           state.seen = (state.seen ?? 0) + 1;
           console.log(format.number(state.seen));
           return { body: res.json, seen: state.seen };`,
          ["url"],
          ["body", "seen"]
        )
      )
    ).toEqual([]);
  });

  it("accepts the tool bridge names `nodetool` and `tools`", () => {
    expect(
      codes(
        body(
          `const caps = nodetool.capabilities();
           const wfs = await tools.list_workflows({});
           return { caps, count: wfs.length };`,
          [],
          ["caps", "count"]
        )
      )
    ).toEqual([]);
  });

  it("tells a body reading a removed guest name what replaced it", () => {
    const issues = validateCodeNodeBody(
      body("return { id: uuid(), bytes: utf8Encode(inputs.text) };", ["text"], [
        "id",
        "bytes"
      ])
    );
    const absent = issues.find((i) => i.code === "code_undefined_name");
    expect(absent?.severity).toBe("error");
    expect(absent?.message).toContain("crypto.randomUUID()");
    expect(absent?.message).toContain("TextEncoder");
  });

  it("flags the deleted quickjs stubs (Buffer, process, Headers)", () => {
    const issues = validateCodeNodeBody(
      body(
        "return { b: Buffer.from(inputs.text), e: process.env.HOME, h: new Headers() };",
        ["text"],
        ["b", "e", "h"]
      )
    );
    const absent = issues.find((i) => i.code === "code_undefined_name");
    expect(absent?.severity).toBe("error");
    expect(absent?.message).toContain('"Buffer"');
    expect(absent?.message).toContain('"process"');
    expect(absent?.message).toContain('"Headers"');
  });

  it("does not flag a typeof guard or an implicit global", () => {
    expect(
      codes(
        body(
          `if (typeof maybe === "undefined") { total = 0; } else { total = maybe; }
           return { total };`,
          [],
          ["total"]
        )
      )
    ).toEqual([]);
  });

  it("flags a body that never returns while outputs are declared", () => {
    const issues = validateCodeNodeBody(
      body("const x = 1;", [], ["out"])
    );
    expect(issues[0].code).toBe("code_no_return");
    expect(issues[0].severity).toBe("error");
  });

  it("warns when a body with no outputs never returns", () => {
    const issues = validateCodeNodeBody(body("const x = 1;"));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
  });

  it("flags an empty body feeding a connected output", () => {
    expect(codes(body("   ", [], [], ["out"]))).toEqual(["code_no_return"]);
  });

  it("warns on a return path that omits a declared output", () => {
    const issues = validateCodeNodeBody(
      body("if (a) return { x: 1, y: 2 };\nreturn { x: 1 };", ["a"], ["x", "y"])
    );
    const missing = issues.find((i) => i.code === "code_missing_output");
    expect(missing?.message).toContain('"y"');
  });

  it("splits a ternary into one shape per branch", () => {
    expect(
      codes(body("return a ? { x: 1, y: 2 } : { x: 1 };", ["a"], ["x", "y"]))
    ).toContain("code_missing_output");
  });

  it("stays quiet when a spread hides the returned keys", () => {
    expect(
      codes(body("const rest = { y: 2 };\nreturn { x: 1, ...rest };", [], ["x", "y"]))
    ).toEqual([]);
  });

  it("flags a return that cannot be an object of outputs", () => {
    expect(codes(body("return 5;", [], ["out"]))).toContain("code_return_shape");
  });

  it("warns on a returned key that is not a declared handle", () => {
    const issues = validateCodeNodeBody(
      body("return { x: 1, stray: 2 };", [], ["x"])
    );
    const undeclared = issues.find((i) => i.code === "code_undeclared_output");
    expect(undeclared?.message).toContain('"stray"');
  });

  it("warns when control can fall past every return", () => {
    expect(
      codes(body("if (a) { return { x: 1 }; }", ["a"], ["x"]))
    ).toContain("code_no_return");
  });

  it("ignores a return that belongs to a helper function", () => {
    expect(
      codes(
        body(
          "function helper() { return 1; }\nreturn { x: helper() };",
          [],
          ["x"]
        )
      )
    ).toEqual([]);
  });

  it("warns about an input the code never reads", () => {
    const issues = validateCodeNodeBody(
      body("return { x: 1 };", ["unused"], ["x"])
    );
    expect(issues.map((i) => i.code)).toEqual(["code_unused_input"]);
    expect(issues[0].message).toContain('"unused"');
  });

  it("accepts top-level await, which a bare parse rejects", () => {
    expect(
      codes(body("const v = await sleep(1);\nreturn { v };", [], ["v"]))
    ).toEqual([]);
  });
});

describe("code AST helpers", () => {
  it("collects bound names including implicit globals", () => {
    const names = collectBoundNames(
      "const { a, b: [c] } = x; function f(p) {} implicit = 1;"
    );
    expect(names).toEqual(expect.arrayContaining(["a", "c", "f", "p", "implicit"]));
  });

  it("leaves property names and object keys out of free identifiers", () => {
    const parsed = parseCodeBody("return { key: obj.prop };");
    if ("error" in parsed) throw new Error(parsed.error);
    expect(freeIdentifiers(parsed.statements)).toEqual(["obj"]);
  });
});
