/**
 * `exportedNames` — the export list a refusal needs before the guest runs.
 *
 * A model that imports `websearch` from a module exporting `webSearch` gets
 * QuickJS's "Could not find export", which names neither the module's exports
 * nor the near miss. Deciding it at admission time needs the list; deciding it
 * *wrongly* would refuse valid code, so an undecidable module answers null.
 */
import { describe, expect, it } from "vitest";
import { exportedNames } from "../src/code-analysis.js";

describe("exportedNames", () => {
  it("reads a trailing export list — the shape the generated DSL modules use", () => {
    const source = [
      "function chatComplete(i) { return i; }",
      "function webSearch(i) { return i; }",
      "export { chatComplete, webSearch };"
    ].join("\n");
    expect(exportedNames(source)?.sort()).toEqual(["chatComplete", "webSearch"]);
  });

  it("reads inline declarations and renames", () => {
    const source = [
      "export function a() {}",
      "export class B {}",
      "export const c = 1, d = 2;",
      "export const { e, f: g } = {};",
      "const h = 3;",
      "export { h as i };",
      "export default 1;"
    ].join("\n");
    expect(exportedNames(source)?.sort()).toEqual([
      "B",
      "a",
      "c",
      "d",
      "default",
      "e",
      "g",
      "i"
    ]);
  });

  it("counts `export * as ns` but gives up on a bare re-export", () => {
    expect(exportedNames('export * as ns from "./x.js";')).toEqual(["ns"]);
    expect(exportedNames('export * from "./x.js";')).toBeNull();
  });

  it("gives up on source it cannot parse", () => {
    expect(exportedNames("export const = ;")).toBeNull();
  });

  it("answers an empty list for a module that exports nothing", () => {
    expect(exportedNames("const x = 1;")).toEqual([]);
  });
});
