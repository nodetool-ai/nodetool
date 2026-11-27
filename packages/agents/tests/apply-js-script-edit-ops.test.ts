import { describe, expect, it } from "vitest";
import { applyJsScriptEditOps } from "../src/capabilities/js-scripts.js";

describe("applyJsScriptEditOps", () => {
  it("replaces a single match", () => {
    expect(applyJsScriptEditOps("a b c", [{ old: "b", new: "X" }])).toEqual({
      code: "a X c"
    });
  });

  it("refuses a missing match", () => {
    expect(applyJsScriptEditOps("abc", [{ old: "z", new: "X" }])).toHaveProperty(
      "error"
    );
  });

  it("refuses two separate matches as ambiguous", () => {
    const result = applyJsScriptEditOps("ab ab", [{ old: "ab", new: "X" }]);
    expect(result).toHaveProperty("error", expect.stringContaining("2 places"));
  });

  it.each([
    ["aaa", "aa"],
    ["aaaa", "aaa"],
    ["xababa", "aba"]
  ])("refuses overlapping matches of %j in %j as ambiguous", (code, old) => {
    const result = applyJsScriptEditOps(code, [{ old, new: "X" }]);
    expect(result).toHaveProperty("error", expect.stringContaining("ambiguous"));
  });

  it("matches each op against the result of the ops before it", () => {
    expect(
      applyJsScriptEditOps("a", [
        { old: "a", new: "bb" },
        { old: "bb", new: "c" }
      ])
    ).toEqual({ code: "c" });
  });
});
