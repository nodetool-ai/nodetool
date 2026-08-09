import { describe, it, expect } from "vitest";
import { migrateCodeBodyToInputs } from "../src/code-analysis.js";
import { validateCodeNodeBody } from "../src/code-node-validation.js";

/**
 * Inputs used to arrive as globals of their own name. These pin the mechanical
 * half of the move to the `inputs` object: what the rewriter touches, and — the
 * part that matters — what it must not.
 */
describe("migrateCodeBodyToInputs", () => {
  it("rewrites a free read of a declared input", () => {
    const out = migrateCodeBodyToInputs(
      "return { upper: text.toUpperCase() };",
      ["text"]
    );
    expect(out.code).toBe("return { upper: inputs.text.toUpperCase() };");
    expect(out.rewritten).toEqual(["text"]);
  });

  it("expands a shorthand property instead of producing invalid syntax", () => {
    const out = migrateCodeBodyToInputs("return { text };", ["text"]);
    expect(out.code).toBe("return { text: inputs.text };");
  });

  it("leaves a name inside a string or comment alone", () => {
    const code = `// text is the input\nconst s = "text";\nreturn { out: text + s };`;
    const out = migrateCodeBodyToInputs(code, ["text"]);
    expect(out.code).toBe(
      `// text is the input\nconst s = "text";\nreturn { out: inputs.text + s };`
    );
  });

  it("leaves an object key that happens to share the name", () => {
    const out = migrateCodeBodyToInputs("return { text: text };", ["text"]);
    expect(out.code).toBe("return { text: inputs.text };");
  });

  it("leaves a property access that happens to share the name", () => {
    const out = migrateCodeBodyToInputs("return { out: row.text };", ["text"]);
    expect(out.changed).toBe(false);
  });

  it("leaves a locally bound name alone", () => {
    const code = "const text = 'local';\nreturn { out: text };";
    expect(migrateCodeBodyToInputs(code, ["text"]).changed).toBe(false);
  });

  it("refuses a body that binds `inputs` itself", () => {
    // Rewriting into a shadowed name would change which object is read.
    const code = "const inputs = {};\nreturn { out: text };";
    expect(migrateCodeBodyToInputs(code, ["text"]).changed).toBe(false);
  });

  it("leaves already-migrated code untouched", () => {
    const code = "return { out: inputs.text };";
    expect(migrateCodeBodyToInputs(code, ["text"]).changed).toBe(false);
  });

  it("does not touch a body that does not parse", () => {
    const code = "return { out: text";
    expect(migrateCodeBodyToInputs(code, ["text"]).changed).toBe(false);
  });

  it("produces a body the validator accepts", () => {
    const before = "return { out: a + b };";
    const after = migrateCodeBodyToInputs(before, ["a", "b"]).code;
    expect(
      validateCodeNodeBody({
        code: after,
        availableInputs: ["a", "b"],
        declaredOutputs: ["out"]
      })
    ).toEqual([]);
  });
});

describe("validateCodeNodeBody, inputs contract", () => {
  it("names the rewrite when an input is read as a bare name", () => {
    const issues = validateCodeNodeBody({
      code: "return { out: text };",
      availableInputs: ["text"],
      declaredOutputs: ["out"]
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("code_undefined_name");
    expect(issues[0].message).toContain("`inputs.text`");
  });

  it("flags a read of an input the node does not have", () => {
    const issues = validateCodeNodeBody({
      code: "return { out: inputs.missing };",
      availableInputs: ["text"],
      declaredOutputs: ["out"]
    });
    expect(issues.map((i) => i.code)).toContain("code_undefined_input");
  });

  it("reports an unused input from the inputs object, not free names", () => {
    const issues = validateCodeNodeBody({
      code: "return { out: inputs.a };",
      availableInputs: ["a", "b"],
      declaredOutputs: ["out"]
    });
    expect(issues.map((i) => i.code)).toContain("code_unused_input");
  });

  it("calls nothing unused when the body reads inputs dynamically", () => {
    // `inputs[key]` could touch any slot, so nothing is provably unused.
    const issues = validateCodeNodeBody({
      code: "const key = 'a';\nreturn { out: inputs[key] };",
      availableInputs: ["a", "b"],
      declaredOutputs: ["out"]
    });
    expect(issues.map((i) => i.code)).not.toContain("code_unused_input");
  });
});
