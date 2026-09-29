import { describe, expect, it } from "vitest";

import { parseWeightsParam } from "../src/routes/timeline-fonts.js";

describe("parseWeightsParam", () => {
  it("parses a mixed normal/italic weight list", () => {
    expect(parseWeightsParam("400,800,900i")).toEqual([
      { weight: 400, style: "normal" },
      { weight: 800, style: "normal" },
      { weight: 900, style: "italic" }
    ]);
  });

  it("tolerates whitespace and a trailing comma", () => {
    expect(parseWeightsParam(" 400 , 700i ,")).toEqual([
      { weight: 400, style: "normal" },
      { weight: 700, style: "italic" }
    ]);
  });

  it("returns null for missing, empty or unparseable input", () => {
    expect(parseWeightsParam(undefined)).toBeNull();
    expect(parseWeightsParam("")).toBeNull();
    expect(parseWeightsParam("   ")).toBeNull();
    expect(parseWeightsParam("bold")).toBeNull();
    expect(parseWeightsParam("400,not-a-weight")).toBeNull();
    expect(parseWeightsParam("-100")).toBeNull();
    expect(parseWeightsParam("99999")).toBeNull();
  });
});
