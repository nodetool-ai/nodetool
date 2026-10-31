import { describe, expect, it } from "vitest";
import { trimHyphens } from "../src/trimHyphens.js";

describe("trimHyphens", () => {
  it.each([["", ""], ["---", ""], ["---entry---", "entry"], ["entry-part", "entry-part"], ["–entry–", "–entry–"]])("strips only edge ASCII hyphens from %j", (value, expected) => {
    expect(trimHyphens(value)).toBe(expected);
  });

  it("handles long edge runs without searching every interior position", () => {
    const edge = "-".repeat(300_000);
    expect(trimHyphens(`${edge}entry${edge}`)).toBe("entry");
    expect(trimHyphens(edge)).toBe("");
  });
});
