import {
  parseColorToRgba,
  rgbaToCss,
  colorToHex6,
  mergeRgbHexIntoColor
} from "../types";

describe("parseColorToRgba", () => {
  it("parses 6-digit hex", () => {
    expect(parseColorToRgba("#ff00aa")).toEqual({
      r: 255,
      g: 0,
      b: 170,
      a: 1
    });
  });

  it("parses 8-digit hex alpha", () => {
    const c = parseColorToRgba("#ff000080");
    expect(c.r).toBe(255);
    expect(c.g).toBe(0);
    expect(c.b).toBe(0);
    expect(c.a).toBeCloseTo(128 / 255, 5);
  });

  it("parses rgba()", () => {
    expect(parseColorToRgba("rgba(10, 20, 30, 0.5)")).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 0.5
    });
  });
});

describe("mergeRgbHexIntoColor", () => {
  it("keeps alpha from current color", () => {
    const out = mergeRgbHexIntoColor("#112233", "rgba(0,0,0,0.25)");
    expect(out).toBe("rgba(17, 34, 51, 0.25)");
  });
});

describe("colorToHex6", () => {
  it("strips alpha for color inputs", () => {
    expect(colorToHex6("rgba(255, 0, 0, 0.5)")).toBe("#ff0000");
  });
});

describe("rgbaToCss", () => {
  it("emits rgb when opaque", () => {
    expect(rgbaToCss({ r: 1, g: 2, b: 3, a: 1 })).toBe("rgb(1, 2, 3)");
  });
});
