import { inferOutputKeysFromCode, inferInputKeysFromCode } from "./codeOutputInference";

describe("inferOutputKeysFromCode", () => {
  it("returns null for empty string", () => {
    expect(inferOutputKeysFromCode("")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(inferOutputKeysFromCode(null as unknown as string)).toBeNull();
    expect(inferOutputKeysFromCode(undefined as unknown as string)).toBeNull();
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
  it("returns null for empty string", () => {
    expect(inferInputKeysFromCode("")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(inferInputKeysFromCode(null as unknown as string)).toBeNull();
  });

  it("detects undeclared identifiers as inputs", () => {
    const code = `return { result: inputData + 1 }`;
    expect(inferInputKeysFromCode(code)).toEqual(["inputData"]);
  });

  it("excludes declared variables", () => {
    const code = `
      const x = 10;
      let y = 20;
      return { result: x + y }
    `;
    expect(inferInputKeysFromCode(code)).toBeNull();
  });

  it("excludes sandbox globals", () => {
    const code = `
      const result = JSON.parse(Math.random().toString());
      console.log(result);
      return { result }
    `;
    expect(inferInputKeysFromCode(code)).toBeNull();
  });

  it("excludes function declarations", () => {
    const code = `
      function helper(a, b) { return a + b; }
      return { sum: helper(1, 2) }
    `;
    expect(inferInputKeysFromCode(code)).toBeNull();
  });

  it("excludes function expression names and params", () => {
    const code = `
      const fn = function process(item) { return item; };
      return { out: fn(1) }
    `;
    expect(inferInputKeysFromCode(code)).toBeNull();
  });

  it("excludes arrow function params", () => {
    const code = `
      const fn = (item) => item * 2;
      return { out: fn(1) }
    `;
    expect(inferInputKeysFromCode(code)).toBeNull();
  });

  it("does not count property accesses as inputs", () => {
    const code = `return { result: myObj.someProp }`;
    const inputs = inferInputKeysFromCode(code);
    expect(inputs).toContain("myObj");
    expect(inputs).not.toContain("someProp");
  });

  it("does not count object keys as inputs", () => {
    const code = `return { foo: 123 }`;
    expect(inferInputKeysFromCode(code)).toBeNull();
  });

  it("handles destructuring declarations", () => {
    const code = `
      const { a, b } = someInput;
      return { sum: a + b }
    `;
    const inputs = inferInputKeysFromCode(code);
    expect(inputs).toContain("someInput");
    expect(inputs).not.toContain("a");
    expect(inputs).not.toContain("b");
  });

  it("handles array destructuring", () => {
    const code = `
      const [first, ...rest] = items;
      return { first, count: rest.length }
    `;
    const inputs = inferInputKeysFromCode(code);
    expect(inputs).toContain("items");
    expect(inputs).not.toContain("first");
    expect(inputs).not.toContain("rest");
  });

  it("excludes class declarations", () => {
    const code = `
      class MyClass {}
      return { instance: new MyClass() }
    `;
    expect(inferInputKeysFromCode(code)).toBeNull();
  });

  it("excludes catch clause params", () => {
    const code = `
      try { throw inputVal } catch (err) { return { error: err.message } }
    `;
    const inputs = inferInputKeysFromCode(code);
    expect(inputs).toContain("inputVal");
    expect(inputs).not.toContain("err");
  });

  it("returns null for invalid code", () => {
    expect(inferInputKeysFromCode("{{{{ not valid")).toBeNull();
  });

  it("excludes import declarations", () => {
    const code = `
      import { foo } from "bar";
      return { result: foo() }
    `;
    expect(inferInputKeysFromCode(code)).toBeNull();
  });

  it("detects multiple undeclared inputs", () => {
    const code = `return { sum: a + b + c }`;
    const inputs = inferInputKeysFromCode(code);
    expect(inputs).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(inputs).toHaveLength(3);
  });

  it("excludes sandbox-provided utility libs", () => {
    const code = `
      const result = _.map(data, (x) => x * 2);
      const d = dayjs();
      return { result, d }
    `;
    const inputs = inferInputKeysFromCode(code);
    expect(inputs).toContain("data");
    expect(inputs).not.toContain("_");
    expect(inputs).not.toContain("dayjs");
  });
});
