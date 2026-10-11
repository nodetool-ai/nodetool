import { describe, expect, it } from "vitest";
import { applySite, discoverSites } from "../src/sites.js";

const mutations = (source: string, path = "a.ts") =>
  discoverSites(source, path).map((site) => `${site.original}->${site.mutant}`);

describe("discoverSites", () => {
  it("swaps the Java operator set plus === and !==", () => {
    expect(
      mutations("f(a + b - c * d / e, a > b, a >= b, a < b, a <= b, a == b, a != b, a === b, a !== b, a && b, a || b);")
    ).toEqual([
      "+->-",
      "-->+",
      "*->/",
      "/->*",
      ">->>=",
      ">=->>",
      "<-><=",
      "<=-><",
      "==->!=",
      "!=->==",
      "===->!==",
      "!==->===",
      "&&->||",
      "||->&&"
    ]);
  });

  it("turns ?? into || and drops ?. on calls and indexes", () => {
    expect(mutations("f(a ?? b, a?.b, a?.(), a?.[0]);")).toEqual(["??->||", "?.->.", "?.->", "?.->", "0->1"]);
  });

  it("deletes ! and unary minus, and flips booleans and 0/1", () => {
    expect(mutations("f(!a, -b, true, false, 0, 1, 2);")).toEqual(["!->", "-->", "true->false", "false->true", "0->1", "1->0"]);
  });

  it("leaves strings, comments, templates, and types alone", () => {
    const source = [
      'const s = "a + b && true";',
      "// a - b || false",
      "const t = `x > y ${0}`;",
      "type T = { flag: true; n: 0 } | 1;",
      "interface I { ok: false }",
      "let v: 0 | 1 = 1 as 0 | 1;",
      'import { x } from "./y.js";'
    ].join("\n");
    expect(mutations(source)).toEqual(["0->1", "1->0"]);
  });

  it("does not mutate compound assignment or ++", () => {
    expect(mutations("a += 2; a++; a = b;")).toEqual([]);
  });

  it("records the line and an offset that applySite replaces", () => {
    const source = "const a = 2;\nconst b = a > 3;\n";
    const [site] = discoverSites(source, "a.ts");
    expect(site).toMatchObject({ line: 2, original: ">", mutant: ">=", category: "comparison" });
    expect(applySite(source, site)).toBe("const a = 2;\nconst b = a >= 3;\n");
  });

  it("parses TSX and JavaScript", () => {
    expect(mutations("const v = <div>{a && <b />}</div>;", "a.tsx")).toEqual(["&&->||"]);
    expect(mutations("module.exports = (a) => a === 1;", "a.cjs")).toEqual(["===->!==", "1->0"]);
  });

  it("handles a deeply nested expression without overflowing the stack", () => {
    const source = `const x = ${Array.from({ length: 2000 }, (_, i) => `a${i}`).join(" + ")};`;
    expect(discoverSites(source, "a.ts")).toHaveLength(1999);
  });
});
