import { describe, expect, it } from "vitest";
import { foldText, snippetOf } from "../src/query.js";

describe("foldText", () => {
  it("lower-cases and drops accents", () => {
    expect(foldText("Café ÀÉÎ")).toBe("cafe aei");
  });

  it("keeps the length of the input so indexes still line up", () => {
    for (const text of ["İ", "İstanbul", "a İ b", "한글", "𝒜", "é"]) {
      expect(foldText(text)).toHaveLength(text.length);
    }
  });

  it("folds a dotted capital I to a plain i", () => {
    expect(foldText("İstanbul")).toBe("istanbul");
  });

  it("centres a snippet on a term that follows dotted capital Is", () => {
    const text = `${"İ".repeat(200)} ${"lorem ".repeat(60)}the red fox ${"ipsum ".repeat(60)}`;
    expect(snippetOf(text, ["fox"])).toContain("red fox");
  });
});
