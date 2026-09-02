import { describe, it, expect } from "vitest";
import { listOutput } from "../src/api-schemas/fonts.js";

const bundled = { name: "Inter", source: "bundled", portable: true };
const system = { name: "Arial", source: "system", portable: false };

describe("fonts.listOutput", () => {
  it("parses bundled and system entries", () => {
    expect(listOutput.safeParse({ fonts: [bundled, system] }).success).toBe(
      true
    );
  });

  it("parses an empty list", () => {
    expect(listOutput.safeParse({ fonts: [] }).success).toBe(true);
  });

  it("rejects a missing fonts field", () => {
    expect(listOutput.safeParse({}).success).toBe(false);
  });

  // The endpoint used to return bare names. A client reading `font.name` off a
  // string gets `undefined` and renders an empty picker, so the shape change
  // has to be a parse failure rather than a silent pass.
  it("rejects bare font names", () => {
    expect(listOutput.safeParse({ fonts: ["Arial"] }).success).toBe(false);
  });

  it("rejects an unknown source", () => {
    expect(
      listOutput.safeParse({
        fonts: [{ ...bundled, source: "downloaded" }]
      }).success
    ).toBe(false);
  });
});
