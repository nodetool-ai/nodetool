import { inferOutputKeysFromCode, inferInputKeysFromCode } from "./codeOutputInference";

describe("inferOutputKeysFromCode", () => {
  it("returns null for empty string", () => {
    expect(inferOutputKeysFromCode("")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(inferOutputKeysFromCode(null)).toBeNull();
    expect(inferOutputKeysFromCode(undefined)).toBeNull();
  });

  it("extracts keys from a simple return object", () => {
    const code = `return { foo: 1, bar: "hello" }`;
    expect(inferOutputKeysFromCode(code)).toEqual(["foo", "bar"]);
  });

  it("extracts keys from the last return statement", () => {
    const code = `
      if (true) {
        return { first: 1 }
      }
      return { second: 2, third: 3 }
    `;
    expect(inferOutputKeysFromCode(code)).toEqual(["second", "third"]);
  });

  it("keeps outer return keys when its value contains a nested return", () => {
    const code = `return { outer: (() => { return { inner: 1 }; })() }`;
    expect(inferOutputKeysFromCode(code)).toEqual(["outer"]);
  });

  it("returns null when return does not have an object literal", () => {
    const code = `return 42`;
    expect(inferOutputKeysFromCode(code)).toBeNull();
  });

  it("handles string-literal keys", () => {
    const code = `return { "quoted-key": 1, normal: 2 }`;
    expect(inferOutputKeysFromCode(code)).toEqual(["quoted-key", "normal"]);
  });

  it("skips spread elements", () => {
    const code = `return { ...other, added: true }`;
    expect(inferOutputKeysFromCode(code)).toEqual(["added"]);
  });

  it("returns null for invalid JavaScript", () => {
    const code = `this is not valid javascript {{{`;
    expect(inferOutputKeysFromCode(code)).toBeNull();
  });

  it("handles async function body with return", () => {
    const code = `
      const data = await fetch("https://example.com");
      return { result: data }
    `;
    expect(inferOutputKeysFromCode(code)).toEqual(["result"]);
  });

  it("handles shorthand property syntax", () => {
    const code = `
      const name = "test";
      const value = 42;
      return { name, value }
    `;
    expect(inferOutputKeysFromCode(code)).toEqual(["name", "value"]);
  });

  it("returns null when return object is empty", () => {
    const code = `return {}`;
    expect(inferOutputKeysFromCode(code)).toBeNull();
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
});
