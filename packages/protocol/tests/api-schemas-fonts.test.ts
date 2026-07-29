import { describe, it, expect } from "vitest";
import { listOutput } from "../src/api-schemas/fonts.js";

describe("fonts.listOutput", () => {
  it("parses a list of font names", () => {
    expect(listOutput.safeParse({ fonts: ["Arial", "Helvetica"] }).success).toBe(
      true
    );
  });

  it("parses an empty list", () => {
    expect(listOutput.safeParse({ fonts: [] }).success).toBe(true);
  });

  it("rejects a missing fonts field", () => {
    expect(listOutput.safeParse({}).success).toBe(false);
  });

  it("rejects non-string font entries", () => {
    expect(listOutput.safeParse({ fonts: [1, 2] }).success).toBe(false);
  });
});
