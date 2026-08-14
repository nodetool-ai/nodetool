import {
  inferOutputKeysFromCode,
  inferInputKeysFromCode,
  deriveCodeIOUpdates
} from "../codeOutputInference";

describe("inferOutputKeysFromCode", () => {
  it("returns null for empty code", () => {
    expect(inferOutputKeysFromCode("")).toBeNull();
    expect(inferOutputKeysFromCode("const x = 1;")).toBeNull();
  });

  it("extracts keys from return { key: value }", () => {
    expect(inferOutputKeysFromCode("return { output: x + 1 };")).toEqual([
      "output"
    ]);
  });

  it("extracts multiple keys", () => {
    expect(
      inferOutputKeysFromCode("return { sum: a + b, upper: text.toUpperCase() };")
    ).toEqual(["sum", "upper"]);
  });

  it("handles shorthand properties", () => {
    expect(inferOutputKeysFromCode("return { sum, upper };")).toEqual([
      "sum",
      "upper"
    ]);
  });

  it("handles mixed shorthand and key-value", () => {
    expect(
      inferOutputKeysFromCode("return { name, age: 25 };")
    ).toEqual(["name", "age"]);
  });

  it("handles multi-line return", () => {
    const code = `const sum = a + b;
return {
  sum: sum,
  diff: a - b
};`;
    expect(inferOutputKeysFromCode(code)).toEqual(["sum", "diff"]);
  });

  it("uses the last return statement", () => {
    const code = `if (false) return { unused: 1 };
return { output: 42 };`;
    expect(inferOutputKeysFromCode(code)).toEqual(["output"]);
  });

  it("returns null for return without object", () => {
    expect(inferOutputKeysFromCode("return 42;")).toBeNull();
  });

  it("returns null for empty return object", () => {
    expect(inferOutputKeysFromCode("return {};")).toBeNull();
  });

  it("ignores commented return statements", () => {
    const code = `// return { old: 1 };
return { current: 2 };`;
    expect(inferOutputKeysFromCode(code)).toEqual(["current"]);
  });

  it("reads emit and output handle names", () => {
    expect(
      inferOutputKeysFromCode('await output("sum", 1);\nawait emit("word", "a");')
    ).toEqual(expect.arrayContaining(["sum", "word"]));
  });

  it("prefers emit names over a return object", () => {
    expect(
      inferOutputKeysFromCode('await output("sum", 1);\nreturn { ignored: 2 };')
    ).toEqual(["sum"]);
  });
});

describe("inferInputKeysFromCode", () => {
  it("returns null for empty code", () => {
    expect(inferInputKeysFromCode("")).toBeNull();
  });

  it("returns null when the code reads no inputs", () => {
    expect(inferInputKeysFromCode("return { out: 1 + 2 };")).toBeNull();
  });

  it("reads names off the inputs object", () => {
    const result = inferInputKeysFromCode(
      "return { out: inputs.a + inputs.b };"
    );
    expect(result).toEqual(expect.arrayContaining(["a", "b"]));
    expect(result).toHaveLength(2);
  });

  it("reads a bracketed string key", () => {
    expect(inferInputKeysFromCode('return { out: inputs["a-b"] };')).toEqual([
      "a-b"
    ]);
  });

  it("ignores a bare identifier — inputs are not globals", () => {
    // The old inference guessed that every undeclared name was an input, which
    // is what let a stale sandbox-global list invent phantom slots.
    expect(inferInputKeysFromCode("return { out: text + lodash };")).toBeNull();
  });

  it("ignores a property named inputs on something else", () => {
    expect(inferInputKeysFromCode("return { out: opts.inputs.a };")).toBeNull();
  });

  it("yields nothing when the body binds its own inputs", () => {
    const code = "const inputs = { a: 1 };\nreturn { out: inputs.a };";
    expect(inferInputKeysFromCode(code)).toBeNull();
  });

  it("yields nothing for a dynamic read it cannot enumerate", () => {
    const code = "const k = 'a';\nreturn { out: inputs[k] };";
    expect(inferInputKeysFromCode(code)).toBeNull();
  });

  it("ignores names in comments and strings", () => {
    const code =
      '// inputs.ghost is not read\nconst s = "inputs.other";\nreturn { out: inputs.real + s };';
    expect(inferInputKeysFromCode(code)).toEqual(["real"]);
  });

  it("includes stream handle names", () => {
    const result = inferInputKeysFromCode(
      'for await (const x of stream("items")) { await emit("out", x * inputs.factor); }'
    );
    expect(result).toEqual(expect.arrayContaining(["items", "factor"]));
  });

  it("skips Code node property names", () => {
    expect(inferInputKeysFromCode("return { out: inputs.code };")).toBeNull();
  });
});

describe("deriveCodeIOUpdates", () => {
  it("adds inferred inputs and outputs from a complete body", () => {
    expect(
      deriveCodeIOUpdates("return { sum: inputs.a + inputs.b };")
    ).toEqual({
      dynamic_outputs: {
        sum: { type: "any", type_args: [], optional: false }
      },
      dynamic_properties: { a: "", b: "" }
    });
  });

  it("keeps a button-added input that the body does not read yet", () => {
    expect(
      deriveCodeIOUpdates("return { out: 1 };", { prompt: "hi" })
    ).toEqual({
      dynamic_outputs: {
        out: { type: "any", type_args: [], optional: false }
      },
      dynamic_properties: { prompt: "hi" }
    });
  });

  it("adds a newly referenced input without dropping existing ones", () => {
    expect(
      deriveCodeIOUpdates("return { out: inputs.b };", { a: 1 })
    ).toEqual({
      dynamic_outputs: {
        out: { type: "any", type_args: [], optional: false }
      },
      dynamic_properties: { a: 1, b: "" }
    });
  });

  it("does not wipe existing IO when the body does not parse", () => {
    const existingOutputs = {
      result: { type: "str", type_args: [], optional: false }
    };
    expect(
      deriveCodeIOUpdates("return { result: inputs.a +", { a: 2 }, existingOutputs)
    ).toEqual({
      dynamic_outputs: existingOutputs,
      dynamic_properties: { a: 2 }
    });
  });

  it("keeps existing outputs when the body has no object return", () => {
    const existingOutputs = {
      result: { type: "str", type_args: [], optional: false }
    };
    expect(
      deriveCodeIOUpdates("const x = inputs.a;", { a: "" }, existingOutputs)
    ).toEqual({
      dynamic_outputs: existingOutputs,
      dynamic_properties: { a: "" }
    });
  });

  it("adds a stream handle as an input", () => {
    expect(
      deriveCodeIOUpdates(
        'for await (const x of stream("items")) { await emit("out", x); }'
      )
    ).toEqual({
      dynamic_outputs: {
        out: { type: "any", type_args: [], optional: false }
      },
      dynamic_properties: { items: "" }
    });
  });
});
