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

  it("still offers `env` as an input, since a dynamic input shadows the stub", () => {
    // The guest has an `env` stub, but user globals are exposed after it, so a
    // Code node with an input named `env` reads the input. Treating the stub as
    // reserved would drop the handle here and leave the code reading `{}`.
    const result = inferInputKeysFromCode("return { output: env.API_HOST };");
    expect(result).toContain("env");
  });

  it("ignores the sandbox stubs a dynamic input cannot usefully replace", () => {
    const code = `return { output: process.cwd() + Buffer.from(x).length };`;
    const result = inferInputKeysFromCode(code);
    expect(result).toContain("x");
    expect(result).not.toContain("process");
    expect(result).not.toContain("Buffer");
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

  it("ignores sandbox bridges and guest helpers", () => {
    const code = `const rows = await data.parseCsv(text);
const when = await format.date(Date.now());
const hash = toHex(await crypto.digest("SHA-256", text));
progress(50);
return { rows, when, hash };`;
    const result = inferInputKeysFromCode(code);
    expect(result).toContain("text");
    for (const bridge of [
      "data",
      "format",
      "crypto",
      "progress",
      "toHex",
      "Date"
    ]) {
      expect(result).not.toContain(bridge);
    }
  });

  it("treats names the sandbox does not provide as inputs", () => {
    // `_` and `dayjs` were never bridged into the guest; they are ordinary
    // undefined variables and must surface as input handles.
    const code = `const upper = _.toUpper(text);
const now = dayjs();
return { upper, now };`;
    const result = inferInputKeysFromCode(code);
    expect(result).toEqual(expect.arrayContaining(["_", "dayjs", "text"]));
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
