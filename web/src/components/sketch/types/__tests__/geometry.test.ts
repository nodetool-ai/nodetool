/**
 * @jest-environment node
 */
import {
  parseColorToRgba,
  rgbaToCss,
  hexToRgb,
  rgbToHex,
  colorToHex6,
  mergeRgbHexIntoColor,
  rgbToHsl,
  hslToRgb,
  rgbToHsv,
  hsvToRgb,
} from "../geometry";

describe("parseColorToRgba", () => {
  it("parses 6-digit hex", () => {
    expect(parseColorToRgba("#ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColorToRgba("#00ff00")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
  });

  it("parses 3-digit hex shorthand", () => {
    expect(parseColorToRgba("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColorToRgba("#abc")).toEqual({ r: 170, g: 187, b: 204, a: 1 });
  });

  it("parses 8-digit hex with alpha", () => {
    const result = parseColorToRgba("#ff000080");
    expect(result.r).toBe(255);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
    expect(result.a).toBeCloseTo(128 / 255, 2);
  });

  it("parses hex without # prefix", () => {
    expect(parseColorToRgba("ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it("parses rgb() string", () => {
    expect(parseColorToRgba("rgb(100, 200, 50)")).toEqual({
      r: 100,
      g: 200,
      b: 50,
      a: 1,
    });
  });

  it("parses rgba() string", () => {
    expect(parseColorToRgba("rgba(100, 200, 50, 0.5)")).toEqual({
      r: 100,
      g: 200,
      b: 50,
      a: 0.5,
    });
  });

  it("clamps out-of-range rgb values to 255", () => {
    const result = parseColorToRgba("rgb(300, 300, 300)");
    expect(result.r).toBe(255);
    expect(result.g).toBe(255);
    expect(result.b).toBe(255);
  });

  it("clamps alpha to 0-1", () => {
    const result = parseColorToRgba("rgba(100, 100, 100, 1.5)");
    expect(result.a).toBe(1);
  });

  it("returns white for empty string", () => {
    expect(parseColorToRgba("")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  it("returns white for invalid input", () => {
    expect(parseColorToRgba("notacolor")).toEqual({
      r: 255,
      g: 255,
      b: 255,
      a: 1,
    });
  });

  it("returns white for wrong-length hex", () => {
    expect(parseColorToRgba("#abcde")).toEqual({
      r: 255,
      g: 255,
      b: 255,
      a: 1,
    });
  });

  it("trims whitespace", () => {
    expect(parseColorToRgba("  #ff0000  ")).toEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 1,
    });
  });
});

describe("rgbaToCss", () => {
  it("returns rgb() when alpha is 1", () => {
    expect(rgbaToCss({ r: 255, g: 0, b: 0, a: 1 })).toBe("rgb(255, 0, 0)");
  });

  it("returns rgba() when alpha is less than 1", () => {
    expect(rgbaToCss({ r: 255, g: 0, b: 0, a: 0.5 })).toBe(
      "rgba(255, 0, 0, 0.5)"
    );
  });

  it("clamps values", () => {
    const result = rgbaToCss({ r: 300, g: -10, b: 128, a: 2 });
    expect(result).toBe("rgb(255, 0, 128)");
  });
});

describe("hexToRgb", () => {
  it("strips alpha and returns r, g, b", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("works with shorthand hex", () => {
    expect(hexToRgb("#0f0")).toEqual({ r: 0, g: 255, b: 0 });
  });
});

describe("rgbToHex", () => {
  it("converts primary colors", () => {
    expect(rgbToHex(255, 0, 0)).toBe("#ff0000");
    expect(rgbToHex(0, 255, 0)).toBe("#00ff00");
    expect(rgbToHex(0, 0, 255)).toBe("#0000ff");
  });

  it("clamps out-of-range values", () => {
    expect(rgbToHex(300, -10, 128)).toBe("#ff0080");
  });

  it("rounds fractional values", () => {
    expect(rgbToHex(127.6, 0.4, 255)).toBe("#8000ff");
  });
});

describe("colorToHex6", () => {
  it("converts rgb() to 6-digit hex", () => {
    expect(colorToHex6("rgb(255, 0, 0)")).toBe("#ff0000");
  });

  it("strips alpha from rgba() input", () => {
    expect(colorToHex6("rgba(0, 128, 255, 0.5)")).toBe("#0080ff");
  });

  it("passes through 6-digit hex", () => {
    expect(colorToHex6("#abcdef")).toBe("#abcdef");
  });
});

describe("mergeRgbHexIntoColor", () => {
  it("replaces RGB while keeping existing alpha", () => {
    const result = mergeRgbHexIntoColor("#00ff00", "rgba(255, 0, 0, 0.5)");
    expect(result).toBe("rgba(0, 255, 0, 0.5)");
  });

  it("returns rgb() when existing alpha is 1", () => {
    const result = mergeRgbHexIntoColor("#00ff00", "rgb(255, 0, 0)");
    expect(result).toBe("rgb(0, 255, 0)");
  });

  it("handles hex without # prefix", () => {
    const result = mergeRgbHexIntoColor("00ff00", "rgb(255, 0, 0)");
    expect(result).toBe("rgb(0, 255, 0)");
  });

  it("returns current color for invalid hex input", () => {
    const current = "rgb(255, 0, 0)";
    expect(mergeRgbHexIntoColor("#xyz", current)).toBe(current);
    expect(mergeRgbHexIntoColor("#ff00", current)).toBe(current);
  });
});

describe("round-trip RGB <-> HSL", () => {
  const colors = [
    { name: "red", r: 255, g: 0, b: 0 },
    { name: "green", r: 0, g: 128, b: 0 },
    { name: "blue", r: 0, g: 0, b: 255 },
    { name: "white", r: 255, g: 255, b: 255 },
    { name: "black", r: 0, g: 0, b: 0 },
    { name: "gray", r: 128, g: 128, b: 128 },
  ];

  it.each(colors)("$name survives RGB -> HSL -> RGB", ({ r, g, b }) => {
    const hsl = rgbToHsl(r, g, b);
    const back = hslToRgb(hsl.h, hsl.s, hsl.l);
    expect(Math.abs(back.r - r)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.g - g)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.b - b)).toBeLessThanOrEqual(1);
  });
});

describe("known HSL values", () => {
  it("red is hsl(0, 100, 50)", () => {
    expect(rgbToHsl(255, 0, 0)).toEqual({ h: 0, s: 100, l: 50 });
  });

  it("green (0,128,0) has h=120", () => {
    expect(rgbToHsl(0, 128, 0).h).toBe(120);
  });

  it("blue is hsl(240, 100, 50)", () => {
    expect(rgbToHsl(0, 0, 255)).toEqual({ h: 240, s: 100, l: 50 });
  });

  it("white has s=0, l=100", () => {
    const { s, l } = rgbToHsl(255, 255, 255);
    expect(s).toBe(0);
    expect(l).toBe(100);
  });

  it("black has s=0, l=0", () => {
    const { s, l } = rgbToHsl(0, 0, 0);
    expect(s).toBe(0);
    expect(l).toBe(0);
  });
});

describe("round-trip RGB <-> HSV", () => {
  const colors = [
    { name: "red", r: 255, g: 0, b: 0 },
    { name: "green", r: 0, g: 128, b: 0 },
    { name: "blue", r: 0, g: 0, b: 255 },
    { name: "white", r: 255, g: 255, b: 255 },
    { name: "black", r: 0, g: 0, b: 0 },
  ];

  it.each(colors)("$name survives RGB -> HSV -> RGB", ({ r, g, b }) => {
    const hsv = rgbToHsv(r, g, b);
    const back = hsvToRgb(hsv.h, hsv.s, hsv.v);
    expect(Math.abs(back.r - r)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.g - g)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.b - b)).toBeLessThanOrEqual(1);
  });
});

describe("known HSV values", () => {
  it("red is hsv(0, 1, 1)", () => {
    expect(rgbToHsv(255, 0, 0)).toEqual({ h: 0, s: 1, v: 1 });
  });

  it("black is hsv(0, 0, 0)", () => {
    expect(rgbToHsv(0, 0, 0)).toEqual({ h: 0, s: 0, v: 0 });
  });

  it("white is hsv(0, 0, 1)", () => {
    expect(rgbToHsv(255, 255, 255)).toEqual({ h: 0, s: 0, v: 1 });
  });
});
