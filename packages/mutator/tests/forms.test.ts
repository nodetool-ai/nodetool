import { describe, expect, it } from "vitest";
import { findForms, formDigests, formKey, moduleNamespace, ownerOf, sitesInFile } from "../src/forms.js";

const names = (source: string) =>
  findForms(source, "a.ts", "src/demo/a.ts").map((form) => `${form.namespace} ${form.id}`);

describe("findForms", () => {
  it("names functions, methods, accessors, constructors, and bound arrows", () => {
    expect(
      names(`
        export function plain() { return 1; }
        export default function () {}
        const arrow = () => 2;
        const expr = function () {};
        const api = { get(id: string) { return id; }, list: () => [] };
        export class Board {
          private size = 0;
          constructor(n: number) { this.size = n; }
          place() {}
          private hide() {}
          #secret() {}
          get area() { return this.size; }
          handler = () => this.size;
          abstract?: () => void;
        }
        function overload(a: string): void;
        function overload(a: unknown) {}
      `)
    ).toEqual([
      "src.demo.a defn/plain",
      "src.demo.a defn/default",
      "src.demo.a defn/arrow",
      "src.demo.a defn/expr",
      "src.demo.a defn/get",
      "src.demo.a defn/list",
      "src.demo.a.Board defn/constructor",
      "src.demo.a.Board defn/place",
      "src.demo.a.Board defn-/hide",
      "src.demo.a.Board defn-/#secret",
      "src.demo.a.Board defn/area",
      "src.demo.a.Board defn/handler",
      "src.demo.a defn/overload"
    ]);
  });

  it("gives a site to the tightest enclosing function", () => {
    const source = "function outer() {\n  const inner = () => 1 > 0;\n  return [1].map((x) => x + 1);\n}\n";
    const sites = sitesInFile(source, "a.ts", "src/a.ts");
    expect(sites.map((site) => `${site.formId} ${site.original}`)).toEqual([
      "defn/inner 1",
      "defn/inner >",
      "defn/inner 0",
      "defn/outer 1",
      "defn/outer +",
      "defn/outer 1"
    ]);
  });

  it("drops sites outside every function", () => {
    expect(sitesInFile("export const LIMIT = 1 + 1;\n", "a.ts", "src/a.ts")).toEqual([]);
  });

  it("returns null when nothing owns an offset", () => {
    expect(ownerOf(findForms("const a = 1;", "a.ts", "a.ts"), 5)).toBeNull();
  });
});

describe("moduleNamespace", () => {
  it("is the dotted path without the extension", () => {
    expect(moduleNamespace("packages/kernel/src/graph.ts")).toBe("packages.kernel.src.graph");
    expect(moduleNamespace("web/src/App.tsx")).toBe("web.src.App");
    expect(moduleNamespace("scripts/tool.mjs")).toBe("scripts.tool");
  });
});

describe("formDigests", () => {
  const digests = (source: string) => formDigests(source, findForms(source, "a.ts", "a.ts"));

  it("changes only for the function whose text changed", () => {
    const before = digests("function a() { return 1; }\nfunction b() { return 2; }\n");
    const after = digests("function a() { return 1; }   \nfunction b() { return 3; }\n");
    expect(after.get(formKey("a", "defn/a"))).toBe(before.get(formKey("a", "defn/a")));
    expect(after.get(formKey("a", "defn/b"))).not.toBe(before.get(formKey("a", "defn/b")));
  });
});
