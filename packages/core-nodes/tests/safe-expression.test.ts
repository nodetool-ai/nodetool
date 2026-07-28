import { describe, expect, it } from "vitest";
import {
  compileSafePredicate,
  compileSafeKey
} from "../src/nodes/safe-expression.js";

describe("compileSafePredicate", () => {
  it("empty or blank source is always true", () => {
    expect(compileSafePredicate("")(1)).toBe(true);
    expect(compileSafePredicate("   ")(null)).toBe(true);
  });

  it("evaluates comparisons on item", () => {
    expect(compileSafePredicate("item > 0")(1)).toBe(true);
    expect(compileSafePredicate("item > 0")(-1)).toBe(false);
    expect(compileSafePredicate("item >= 3")(3)).toBe(true);
    expect(compileSafePredicate("item <= 3")(4)).toBe(false);
  });

  it("strict and loose equality", () => {
    expect(compileSafePredicate("item === 1")(1)).toBe(true);
    expect(compileSafePredicate("item === 1")("1")).toBe(false);
    expect(compileSafePredicate("item == 1")("1")).toBe(true);
    expect(compileSafePredicate("item !== 1")("1")).toBe(true);
    expect(compileSafePredicate("item != 1")("1")).toBe(false);
  });

  it("property access with dot and bracket chains", () => {
    expect(compileSafePredicate("item.score > 0.5")({ score: 0.9 })).toBe(true);
    expect(compileSafePredicate("item.a.b === 2")({ a: { b: 2 } })).toBe(true);
    expect(compileSafePredicate('item["a"] === 5')({ a: 5 })).toBe(true);
    expect(compileSafePredicate("item[0] === 9")([9, 8])).toBe(true);
    expect(compileSafePredicate("item.length === 3")([1, 2, 3])).toBe(true);
    expect(compileSafePredicate("item.length > 2")("abc")).toBe(true);
  });

  it("boolean logic, negation, parentheses", () => {
    expect(compileSafePredicate("item > 0 && item < 10")(5)).toBe(true);
    expect(compileSafePredicate("item < 0 || item > 10")(5)).toBe(false);
    expect(compileSafePredicate("!(item === 1)")(2)).toBe(true);
    expect(compileSafePredicate("(item + 1) * 2 === 6")(2)).toBe(true);
  });

  it("arithmetic and unary minus", () => {
    expect(compileSafePredicate("item % 2 === 0")(4)).toBe(true);
    expect(compileSafePredicate("item % 2 === 0")(3)).toBe(false);
    expect(compileSafePredicate("-item === -5")(5)).toBe(true);
    expect(compileSafePredicate("item / 2 === 3")(6)).toBe(true);
  });

  it("typeof", () => {
    expect(compileSafePredicate("typeof item === 'string'")("x")).toBe(true);
    expect(compileSafePredicate("typeof item === 'number'")(1)).toBe(true);
    expect(compileSafePredicate("typeof item === 'string'")(1)).toBe(false);
  });

  it("literals: true false null undefined", () => {
    expect(compileSafePredicate("item === null")(null)).toBe(true);
    expect(compileSafePredicate("item === undefined")(undefined)).toBe(true);
    expect(compileSafePredicate("item === true")(true)).toBe(true);
    expect(compileSafePredicate("item === false")(false)).toBe(true);
  });

  // Regression: a swallowed parse error made FilterCode drop every item,
  // TakeWhile emit nothing and DropWhile pass everything through, all while
  // the workflow reported success.
  it("parse errors throw instead of silently matching nothing", () => {
    expect(() => compileSafePredicate('item.name.startsWith("a")')).toThrow(
      Error
    );
    expect(() => compileSafePredicate('item.name.startsWith("a")')).toThrow(
      /Invalid predicate expression/
    );
    expect(() => compileSafePredicate("item >")).toThrow(
      /Invalid predicate expression/
    );
  });

  it("the thrown message names the expression and the reason", () => {
    let message = "";
    try {
      compileSafePredicate("item.foo(1)");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("item.foo(1)");
    expect(message).toContain("function calls are not");
  });

  it("runtime errors on missing paths evaluate to false, not throw", () => {
    // item is null → property read returns undefined, comparison is false
    expect(compileSafePredicate("item.a.b > 0")(null)).toBe(false);
    expect(compileSafePredicate("item.a.b.c === 1")({})).toBe(false);
  });

  describe("hostile inputs cannot execute", () => {
    const hostile = [
      "process.exit(1)",
      "constructor.constructor('return 1')()",
      "item.constructor.constructor('return process')()",
      "globalThis",
      "this",
      "item.__proto__",
      "item.constructor",
      "require('fs')",
      "item()",
      "item.foo()",
      "(() => 1)()",
      "item = 5",
      "window",
      "eval('1')",
      "item['constructor']['constructor']"
    ];

    it("all hostile expressions parse-fail or evaluate falsy without side effects", () => {
      for (const expr of hostile) {
        let pred: ((item: unknown) => boolean) | null = null;
        try {
          pred = compileSafePredicate(expr);
        } catch (error) {
          // A parse failure is a legitimate outcome — it must be loud.
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain(expr);
          continue;
        }
        // Otherwise: must return a boolean, must be false (no truthy escape
        // to a real global/function/prototype).
        const out = pred({ a: 1 });
        expect(typeof out).toBe("boolean");
        expect(out).toBe(false);
      }
    });

    it("blocked property names read as undefined", () => {
      expect(compileSafePredicate("item.__proto__ === undefined")({})).toBe(
        true
      );
      expect(
        compileSafePredicate("item.constructor === undefined")({})
      ).toBe(true);
      expect(
        compileSafePredicate("item.prototype === undefined")({})
      ).toBe(true);
      expect(
        compileSafePredicate('item["constructor"] === undefined')({})
      ).toBe(true);
    });

    it("does not mutate global state", () => {
      const before = (globalThis as { __pwned?: unknown }).__pwned;
      for (const expr of ["globalThis.__pwned = 1", "this.__pwned = 1"]) {
        try {
          compileSafePredicate(expr)({});
        } catch {
          // Parse failure is the expected outcome for assignments.
        }
      }
      expect((globalThis as { __pwned?: unknown }).__pwned).toBe(before);
    });
  });
});

describe("compileSafeKey", () => {
  it("blank expr returns undefined", () => {
    expect(compileSafeKey("")({ id: 1 })).toBeUndefined();
    expect(compileSafeKey("  ")({ id: 1 })).toBeUndefined();
  });

  it("returns property values", () => {
    expect(compileSafeKey("item.id")({ id: 7 })).toBe(7);
    expect(compileSafeKey('item["url"]')({ url: "x" })).toBe("x");
    expect(compileSafeKey("item.a.b")({ a: { b: 3 } })).toBe(3);
  });

  it("parse error throws with the expression and the reason", () => {
    expect(() => compileSafeKey("item.constructor()")).toThrow(
      /Invalid key expression/
    );
    expect(() => compileSafeKey("process.exit(1)")).toThrow(
      /Invalid key expression/
    );
    expect(() => compileSafeKey("@@@")).toThrow(/Invalid key expression/);
  });

  it("runtime error yields undefined", () => {
    expect(compileSafeKey("item.a.b.c")(null)).toBeUndefined();
  });

  it("blocked keys read undefined", () => {
    expect(compileSafeKey("item.__proto__")({})).toBeUndefined();
    expect(compileSafeKey("item.constructor")({})).toBeUndefined();
  });
});
