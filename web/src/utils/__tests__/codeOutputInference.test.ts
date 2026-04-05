import { inferOutputKeysFromCode, inferInputKeysFromCode } from "../codeOutputInference";

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
});

describe("inferInputKeysFromCode", () => {
  it("returns null for empty code", () => {
    expect(inferInputKeysFromCode("")).toBeNull();
  });

  it("returns null when all variables are declared", () => {
    expect(inferInputKeysFromCode("const x = 1;\nreturn { output: x };")).toBeNull();
  });

  it("detects undeclared variables as inputs", () => {
    const result = inferInputKeysFromCode("return { output: a + b };");
    expect(result).toContain("a");
    expect(result).toContain("b");
  });

  it("ignores sandbox globals", () => {
    const code = `const result = Math.sqrt(x);
const data = JSON.parse(text);
return { result, data };`;
    const result = inferInputKeysFromCode(code);
    expect(result).toContain("x");
    expect(result).toContain("text");
    expect(result).not.toContain("Math");
    expect(result).not.toContain("JSON");
  });

  it("ignores declared variables", () => {
    const code = `const x = 10;
let y = 20;
return { output: x + y + z };`;
    const result = inferInputKeysFromCode(code);
    expect(result).toContain("z");
    expect(result).not.toContain("x");
    expect(result).not.toContain("y");
  });

  it("ignores library globals (_, dayjs, etc.)", () => {
    const code = `const upper = _.toUpper(text);
const now = dayjs();
return { upper };`;
    const result = inferInputKeysFromCode(code);
    expect(result).toContain("text");
    expect(result).not.toContain("_");
    expect(result).not.toContain("dayjs");
  });

  it("ignores identifiers in comments and strings", () => {
    const code = `// use myVar here
const x = "hello world";
return { output: input };`;
    const result = inferInputKeysFromCode(code);
    expect(result).toContain("input");
    expect(result).not.toContain("myVar");
    expect(result).not.toContain("hello");
  });

  it("handles function parameters as declared", () => {
    const code = `const fn = (a, b) => a + b;
return { output: fn(x, y) };`;
    const result = inferInputKeysFromCode(code);
    expect(result).toContain("x");
    expect(result).toContain("y");
    expect(result).not.toContain("a");
    expect(result).not.toContain("b");
  });

  it("handles destructuring declarations", () => {
    const code = `const { name, age } = person;
return { output: name };`;
    const result = inferInputKeysFromCode(code);
    expect(result).toContain("person");
    expect(result).not.toContain("name");
    expect(result).not.toContain("age");
  });

  it("ignores workspace and state", () => {
    const code = `const data = await workspace.read("file.txt");
state.count = (state.count || 0) + 1;
return { data };`;
    const result = inferInputKeysFromCode(code);
    expect(result).toBeNull();
  });
});
