import { describe, it, expect } from "vitest";
import {
  hasReturnStatement,
  hasYieldStatement,
  usesEmitOutputContract,
  usesStreamInputContract
} from "../src/code-body.js";

/**
 * `hasYieldStatement` decides whether a Code-node body runs single-shot or on
 * the streaming path, so a false negative makes a body that yields run as if it
 * did not — the guest then sees a bare `yield` and dies. The cases below come
 * from enumerating short bodies against a lexer written from the doc comment.
 */
describe("hasYieldStatement", () => {
  it.each([
    ["yield 1;", "a plain yield"],
    ["yield;", "a yield with no operand"],
    ["yield", "a yield at end of input"],
    ["yield* other();", "delegation"],
    ["for (const x of xs) { yield x; }", "inside a loop body"],
    ["const v = (yield q);", "parenthesised"],
    ["foo(yield x);", "as a call argument"],
    ["const a = [yield x];", "inside an array literal"],
    ["const t = `${yield x}`;", "inside a template interpolation"]
  ])("is true for %j (%s)", (code) => {
    expect(hasYieldStatement(code)).toBe(true);
  });

  it.each([
    ["const s = 'yield 1';", "inside a single-quoted string"],
    ['const s = "yield 1";', "inside a double-quoted string"],
    ["const s = `yield 1`;", "inside a template literal"],
    ["// yield 1", "inside a line comment"],
    ["/* yield 1 */", "inside a block comment"],
    ["x.yield = 1;", "a member named yield"],
    ["obj = { yield: 1 };", "a property key named yield"],
    ["const yielded = 1;", "a name starting with yield"],
    ["yieldx();", "a call whose name starts with yield"],
    ["return { total: inputs.a + inputs.b };", "no mention at all"]
  ])("is false for %j (%s)", (code) => {
    expect(hasYieldStatement(code)).toBe(false);
  });

  // The stripper used to run each of its four passes over the whole body in
  // turn, so a comment marker that only existed inside a string still ate
  // everything after it. A URL literal is the everyday way to hit that.
  it.each([
    ["const u = 'http://a.com'; yield 1;", "a URL in a single-quoted string"],
    ['const u = "http://a.com"; yield { u };', "a URL in a double-quoted string"],
    ["const p = 'a//b'; yield 2;", "a bare slash pair inside a string"],
    ["const s = '/*'; yield 1; const e = '*/';", "comment markers inside strings"],
    ["const t = `http://a.com`; yield 1;", "a URL in a template literal"]
  ])("sees the yield after %j (%s)", (code) => {
    expect(hasYieldStatement(code)).toBe(true);
  });

  it.each([
    ["// a URL: http://a.com\nyield 1;", "a URL inside a line comment"],
    ["/* it's fine */ yield 1;", "an apostrophe inside a block comment"],
    ["// don't\nyield 1;", "an apostrophe inside a line comment"]
  ])("still sees the yield after %j (%s)", (code) => {
    expect(hasYieldStatement(code)).toBe(true);
  });

  it("does not join tokens across a stripped comment", () => {
    expect(hasYieldStatement("x/**/yield 1;")).toBe(true);
  });

  // A regex literal is the fourth non-code construct, and the one that makes a
  // single-pass scan necessary: a quote inside a character class must not open
  // a string, or everything after it is swallowed.
  it.each([
    ["const re = /yield/; return { m: re.test(s) };", "a regex matching the word"],
    ["const re = /^yield|yield$/; return re;", "the word twice in one regex"]
  ])("is false for %j (%s)", (code) => {
    expect(hasYieldStatement(code)).toBe(false);
  });

  it.each([
    ["const re = /[\"']/; yield 1;", "quotes inside a character class"],
    ["if (/^a/.test(s)) { yield 1; }", "a regex in a condition"],
    ["const half = total / 2; yield half;", "a division, not a regex"],
    ["const r = (a + b) / c; yield r;", "a division after a paren"],
    ["const r = arr[0] / 2; yield r;", "a division after an index"],
    ["const t = `a` ; yield 1;", "a template literal before the yield"]
  ])("sees the yield past %j (%s)", (code) => {
    expect(hasYieldStatement(code)).toBe(true);
  });
});

/**
 * The same stripper backs the other three body probes, so the
 * string-swallows-the-line bug reached every one of them: an `emit` body
 * carrying a URL took the legacy path, where `emit` is not even defined.
 */
describe("body probes past a URL literal on the same line", () => {
  const withUrl = (tail: string) => `const u = "http://a.com"; ${tail}`;

  it("still sees the emit/output contract", () => {
    expect(usesEmitOutputContract(withUrl('emit("o", 1);'))).toBe(true);
    expect(usesEmitOutputContract(withUrl('output("o", 1);'))).toBe(true);
  });

  it("still sees the stream input contract", () => {
    expect(
      usesStreamInputContract(withUrl('for await (const x of stream("a")) {}'))
    ).toBe(true);
  });

  it("still sees the return statement", () => {
    expect(hasReturnStatement(withUrl("return { u };"))).toBe(true);
  });

  it("keeps ignoring the same words inside the string itself", () => {
    expect(usesEmitOutputContract('const s = "emit(1)";')).toBe(false);
    expect(usesStreamInputContract('const s = "stream(1)";')).toBe(false);
    expect(hasReturnStatement('const s = "return 1";')).toBe(false);
  });
});
