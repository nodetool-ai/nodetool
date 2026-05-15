/**
 * @jest-environment node
 */
import {
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  rgbToHsb,
  hsbToRgb,
  rgbToCmyk,
  cmykToRgb,
  rgbToLab,
  labToRgb,
  getLuminance,
  getContrastRatio,
  getWcagCompliance,
  simulateColorBlindness,
  isLightColor,
  getContrastingTextColor
} from "../colorConversion";
import type { RGB } from "../colorConversion";

describe("hexToRgb", () => {
  it("parses #RRGGBB format", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(hexToRgb("#00ff00")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(hexToRgb("#0000ff")).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(hexToRgb("#808080")).toEqual({ r: 128, g: 128, b: 128, a: 1 });
  });

  it("parses #RGB shorthand", () => {
    expect(hexToRgb("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(hexToRgb("#0f0")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(hexToRgb("#00f")).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(hexToRgb("#000")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(hexToRgb("#abc")).toEqual({ r: 170, g: 187, b: 204, a: 1 });
  });

  it("parses #RRGGBBAA with alpha", () => {
    expect(hexToRgb("#ff000080")).toEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 128 / 255
    });
    expect(hexToRgb("#ffffff00")).toEqual({ r: 255, g: 255, b: 255, a: 0 });
    expect(hexToRgb("#000000ff")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it("parses #RGBA shorthand", () => {
    const result = hexToRgb("#f008");
    expect(result.r).toBe(255);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
    expect(result.a).toBeCloseTo(0x88 / 255, 5);
  });

  it("handles input without # prefix", () => {
    expect(hexToRgb("ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(hexToRgb("abc")).toEqual({ r: 170, g: 187, b: 204, a: 1 });
  });

  it("returns zeros for invalid hex digits", () => {
    const result = hexToRgb("#zzzzzz");
    expect(result.r).toBe(0);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
  });
});

describe("rgbToHex", () => {
  it("converts primary colors", () => {
    expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe("#ff0000");
    expect(rgbToHex({ r: 0, g: 255, b: 0 })).toBe("#00ff00");
    expect(rgbToHex({ r: 0, g: 0, b: 255 })).toBe("#0000ff");
  });

  it("converts black and white", () => {
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
    expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe("#ffffff");
  });

  it("includes alpha when requested and alpha < 1", () => {
    expect(rgbToHex({ r: 255, g: 0, b: 0, a: 0.5 }, true)).toBe("#ff000080");
  });

  it("omits alpha when it equals 1 even if includeAlpha is true", () => {
    expect(rgbToHex({ r: 255, g: 0, b: 0, a: 1 }, true)).toBe("#ff0000");
  });

  it("omits alpha when includeAlpha is false", () => {
    expect(rgbToHex({ r: 255, g: 0, b: 0, a: 0.5 })).toBe("#ff0000");
  });

  it("clamps out-of-range values", () => {
    expect(rgbToHex({ r: 300, g: -10, b: 128 })).toBe("#ff0080");
  });

  it("rounds fractional values", () => {
    expect(rgbToHex({ r: 127.6, g: 0.4, b: 255 })).toBe("#8000ff");
  });
});

describe("round-trip RGB <-> HSL", () => {
  const colors: Array<{ name: string; rgb: RGB }> = [
    { name: "red", rgb: { r: 255, g: 0, b: 0 } },
    { name: "green", rgb: { r: 0, g: 128, b: 0 } },
    { name: "blue", rgb: { r: 0, g: 0, b: 255 } },
    { name: "white", rgb: { r: 255, g: 255, b: 255 } },
    { name: "black", rgb: { r: 0, g: 0, b: 0 } },
    { name: "gray", rgb: { r: 128, g: 128, b: 128 } },
    { name: "cyan", rgb: { r: 0, g: 255, b: 255 } },
    { name: "magenta", rgb: { r: 255, g: 0, b: 255 } },
    { name: "yellow", rgb: { r: 255, g: 255, b: 0 } }
  ];

  it.each(colors)("$name survives RGB -> HSL -> RGB", ({ rgb }) => {
    const hsl = rgbToHsl(rgb);
    const back = hslToRgb(hsl);
    expect(back.r).toBeCloseTo(rgb.r, -1);
    expect(back.g).toBeCloseTo(rgb.g, -1);
    expect(back.b).toBeCloseTo(rgb.b, -1);
  });

  it("preserves alpha through the round trip", () => {
    const rgb: RGB = { r: 100, g: 150, b: 200, a: 0.7 };
    const hsl = rgbToHsl(rgb);
    expect(hsl.a).toBe(0.7);
    const back = hslToRgb(hsl);
    expect(back.a).toBe(0.7);
  });
});

describe("round-trip RGB <-> HSB", () => {
  const colors: Array<{ name: string; rgb: RGB }> = [
    { name: "red", rgb: { r: 255, g: 0, b: 0 } },
    { name: "green", rgb: { r: 0, g: 128, b: 0 } },
    { name: "blue", rgb: { r: 0, g: 0, b: 255 } },
    { name: "white", rgb: { r: 255, g: 255, b: 255 } },
    { name: "black", rgb: { r: 0, g: 0, b: 0 } },
    { name: "mid-gray", rgb: { r: 128, g: 128, b: 128 } }
  ];

  it.each(colors)("$name survives RGB -> HSB -> RGB", ({ rgb }) => {
    const hsb = rgbToHsb(rgb);
    const back = hsbToRgb(hsb);
    expect(back.r).toBeCloseTo(rgb.r, -1);
    expect(back.g).toBeCloseTo(rgb.g, -1);
    expect(back.b).toBeCloseTo(rgb.b, -1);
  });

  it("preserves alpha through the round trip", () => {
    const rgb: RGB = { r: 200, g: 50, b: 100, a: 0.3 };
    const hsb = rgbToHsb(rgb);
    expect(hsb.a).toBe(0.3);
    const back = hsbToRgb(hsb);
    expect(back.a).toBe(0.3);
  });
});

describe("round-trip RGB <-> CMYK", () => {
  const colors: Array<{ name: string; rgb: RGB }> = [
    { name: "red", rgb: { r: 255, g: 0, b: 0 } },
    { name: "green", rgb: { r: 0, g: 128, b: 0 } },
    { name: "blue", rgb: { r: 0, g: 0, b: 255 } },
    { name: "white", rgb: { r: 255, g: 255, b: 255 } },
    { name: "black", rgb: { r: 0, g: 0, b: 0 } }
  ];

  it.each(colors)("$name survives RGB -> CMYK -> RGB", ({ rgb }) => {
    const cmyk = rgbToCmyk(rgb);
    const back = cmykToRgb(cmyk);
    expect(back.r).toBeCloseTo(rgb.r, -1);
    expect(back.g).toBeCloseTo(rgb.g, -1);
    expect(back.b).toBeCloseTo(rgb.b, -1);
  });
});

describe("round-trip RGB <-> LAB", () => {
  const colors: Array<{ name: string; rgb: RGB }> = [
    { name: "red", rgb: { r: 255, g: 0, b: 0 } },
    { name: "green", rgb: { r: 0, g: 128, b: 0 } },
    { name: "blue", rgb: { r: 0, g: 0, b: 255 } },
    { name: "white", rgb: { r: 255, g: 255, b: 255 } },
    { name: "black", rgb: { r: 0, g: 0, b: 0 } }
  ];

  it.each(colors)(
    "$name survives RGB -> LAB -> RGB within tolerance",
    ({ rgb }) => {
      const lab = rgbToLab(rgb);
      const back = labToRgb(lab);
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(2);
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(2);
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(2);
    }
  );
});

describe("known HSL values", () => {
  it("red is hsl(0, 100, 50)", () => {
    const hsl = rgbToHsl({ r: 255, g: 0, b: 0 });
    expect(hsl).toEqual({ h: 0, s: 100, l: 50, a: undefined });
  });

  it("green (0,128,0) has h=120", () => {
    const hsl = rgbToHsl({ r: 0, g: 128, b: 0 });
    expect(hsl.h).toBe(120);
  });

  it("blue is hsl(240, 100, 50)", () => {
    const hsl = rgbToHsl({ r: 0, g: 0, b: 255 });
    expect(hsl).toEqual({ h: 240, s: 100, l: 50, a: undefined });
  });

  it("white is hsl(0, 0, 100)", () => {
    const hsl = rgbToHsl({ r: 255, g: 255, b: 255 });
    expect(hsl).toEqual({ h: 0, s: 0, l: 100, a: undefined });
  });

  it("black is hsl(0, 0, 0)", () => {
    const hsl = rgbToHsl({ r: 0, g: 0, b: 0 });
    expect(hsl).toEqual({ h: 0, s: 0, l: 0, a: undefined });
  });

  it("gray (128,128,128) has s=0", () => {
    const hsl = rgbToHsl({ r: 128, g: 128, b: 128 });
    expect(hsl.s).toBe(0);
    expect(hsl.l).toBe(50);
  });
});

describe("known HSB values", () => {
  it("red is hsb(0, 100, 100)", () => {
    expect(rgbToHsb({ r: 255, g: 0, b: 0 })).toEqual({
      h: 0,
      s: 100,
      b: 100,
      a: undefined
    });
  });

  it("black is hsb(0, 0, 0)", () => {
    expect(rgbToHsb({ r: 0, g: 0, b: 0 })).toEqual({
      h: 0,
      s: 0,
      b: 0,
      a: undefined
    });
  });

  it("white is hsb(0, 0, 100)", () => {
    expect(rgbToHsb({ r: 255, g: 255, b: 255 })).toEqual({
      h: 0,
      s: 0,
      b: 100,
      a: undefined
    });
  });
});

describe("known CMYK values", () => {
  it("red is (0, 100, 100, 0)", () => {
    expect(rgbToCmyk({ r: 255, g: 0, b: 0 })).toEqual({
      c: 0,
      m: 100,
      y: 100,
      k: 0
    });
  });

  it("black is (0, 0, 0, 100)", () => {
    expect(rgbToCmyk({ r: 0, g: 0, b: 0 })).toEqual({
      c: 0,
      m: 0,
      y: 0,
      k: 100
    });
  });

  it("white is (0, 0, 0, 0)", () => {
    expect(rgbToCmyk({ r: 255, g: 255, b: 255 })).toEqual({
      c: 0,
      m: 0,
      y: 0,
      k: 0
    });
  });

  it("cyan is (100, 0, 0, 0)", () => {
    expect(rgbToCmyk({ r: 0, g: 255, b: 255 })).toEqual({
      c: 100,
      m: 0,
      y: 0,
      k: 0
    });
  });
});

describe("known LAB values", () => {
  it("white has L=100", () => {
    const lab = rgbToLab({ r: 255, g: 255, b: 255 });
    expect(lab.l).toBe(100);
  });

  it("black has L=0", () => {
    const lab = rgbToLab({ r: 0, g: 0, b: 0 });
    expect(lab.l).toBe(0);
  });

  it("red has positive a*", () => {
    const lab = rgbToLab({ r: 255, g: 0, b: 0 });
    expect(lab.l).toBeGreaterThan(50);
    expect(lab.a).toBeGreaterThan(0);
  });
});

describe("getLuminance", () => {
  it("returns 0 for black", () => {
    expect(getLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
  });

  it("returns 1 for white", () => {
    expect(getLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 4);
  });

  it("returns an intermediate value for mid-gray", () => {
    const lum = getLuminance({ r: 128, g: 128, b: 128 });
    expect(lum).toBeGreaterThan(0);
    expect(lum).toBeLessThan(1);
  });

  it("weights green channel highest per WCAG formula", () => {
    const lumR = getLuminance({ r: 255, g: 0, b: 0 });
    const lumG = getLuminance({ r: 0, g: 255, b: 0 });
    const lumB = getLuminance({ r: 0, g: 0, b: 255 });
    expect(lumG).toBeGreaterThan(lumR);
    expect(lumG).toBeGreaterThan(lumB);
  });
});

describe("getContrastRatio", () => {
  const white: RGB = { r: 255, g: 255, b: 255 };
  const black: RGB = { r: 0, g: 0, b: 0 };

  it("returns 21:1 for black on white", () => {
    expect(getContrastRatio(black, white)).toBeCloseTo(21, 0);
  });

  it("returns 21:1 for white on black (order independent)", () => {
    expect(getContrastRatio(white, black)).toBeCloseTo(21, 0);
  });

  it("returns 1:1 for identical colors", () => {
    expect(getContrastRatio(white, white)).toBeCloseTo(1, 2);
    expect(getContrastRatio(black, black)).toBeCloseTo(1, 2);
  });
});

describe("getWcagCompliance", () => {
  const white: RGB = { r: 255, g: 255, b: 255 };
  const black: RGB = { r: 0, g: 0, b: 0 };

  it("passes all levels for black on white", () => {
    const c = getWcagCompliance(black, white);
    expect(c.ratio).toBeGreaterThanOrEqual(21);
    expect(c.aa).toBe(true);
    expect(c.aaLarge).toBe(true);
    expect(c.aaa).toBe(true);
    expect(c.aaaLarge).toBe(true);
  });

  it("fails all levels for very similar grays", () => {
    const g1: RGB = { r: 100, g: 100, b: 100 };
    const g2: RGB = { r: 110, g: 110, b: 110 };
    const c = getWcagCompliance(g1, g2);
    expect(c.aa).toBe(false);
    expect(c.aaa).toBe(false);
    expect(c.aaLarge).toBe(false);
    expect(c.aaaLarge).toBe(false);
  });

  it("ratio is rounded to two decimal places", () => {
    const c = getWcagCompliance(black, white);
    const decimalPlaces = c.ratio.toString().split(".")[1]?.length ?? 0;
    expect(decimalPlaces).toBeLessThanOrEqual(2);
  });

  it("aaLarge threshold is 3:1", () => {
    const dark: RGB = { r: 0, g: 0, b: 0 };
    const medium: RGB = { r: 119, g: 119, b: 119 };
    const c = getWcagCompliance(dark, medium);
    expect(c.ratio).toBeGreaterThanOrEqual(3);
    expect(c.aaLarge).toBe(true);
  });

  it("aa threshold is 4.5:1", () => {
    const c = getWcagCompliance(black, white);
    expect(c.ratio).toBeGreaterThanOrEqual(4.5);
    expect(c.aa).toBe(true);
  });

  it("aaa threshold is 7:1", () => {
    const c = getWcagCompliance(black, white);
    expect(c.ratio).toBeGreaterThanOrEqual(7);
    expect(c.aaa).toBe(true);
  });
});

describe("simulateColorBlindness", () => {
  const red: RGB = { r: 255, g: 0, b: 0 };

  it("returns valid RGB for protanopia", () => {
    const result = simulateColorBlindness(red, "protanopia");
    expect(result.r).toBeGreaterThanOrEqual(0);
    expect(result.r).toBeLessThanOrEqual(255);
    expect(result.g).toBeGreaterThanOrEqual(0);
    expect(result.g).toBeLessThanOrEqual(255);
    expect(result.b).toBeGreaterThanOrEqual(0);
    expect(result.b).toBeLessThanOrEqual(255);
  });

  it("returns valid RGB for deuteranopia", () => {
    const result = simulateColorBlindness(red, "deuteranopia");
    expect(result.r).toBeGreaterThanOrEqual(0);
    expect(result.r).toBeLessThanOrEqual(255);
    expect(result.g).toBeGreaterThanOrEqual(0);
    expect(result.g).toBeLessThanOrEqual(255);
    expect(result.b).toBeGreaterThanOrEqual(0);
    expect(result.b).toBeLessThanOrEqual(255);
  });

  it("returns valid RGB for tritanopia", () => {
    const result = simulateColorBlindness(red, "tritanopia");
    expect(result.r).toBeGreaterThanOrEqual(0);
    expect(result.r).toBeLessThanOrEqual(255);
    expect(result.g).toBeGreaterThanOrEqual(0);
    expect(result.g).toBeLessThanOrEqual(255);
    expect(result.b).toBeGreaterThanOrEqual(0);
    expect(result.b).toBeLessThanOrEqual(255);
  });

  it("modifies red for protanopia simulation", () => {
    const result = simulateColorBlindness(red, "protanopia");
    expect(result.r).toBeLessThan(255);
  });

  it("modifies red for deuteranopia simulation", () => {
    const result = simulateColorBlindness(red, "deuteranopia");
    expect(result.r).toBeLessThan(255);
  });

  it("preserves alpha", () => {
    const withAlpha: RGB = { r: 255, g: 0, b: 0, a: 0.5 };
    const result = simulateColorBlindness(withAlpha, "protanopia");
    expect(result.a).toBe(0.5);
  });

  it("returns black unchanged for all types", () => {
    const black: RGB = { r: 0, g: 0, b: 0 };
    expect(simulateColorBlindness(black, "protanopia")).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: undefined
    });
    expect(simulateColorBlindness(black, "deuteranopia")).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: undefined
    });
    expect(simulateColorBlindness(black, "tritanopia")).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: undefined
    });
  });
});

describe("isLightColor", () => {
  it("returns true for white", () => {
    expect(isLightColor({ r: 255, g: 255, b: 255 })).toBe(true);
  });

  it("returns false for black", () => {
    expect(isLightColor({ r: 0, g: 0, b: 0 })).toBe(false);
  });

  it("returns true for yellow (high luminance)", () => {
    expect(isLightColor({ r: 255, g: 255, b: 0 })).toBe(true);
  });

  it("returns false for dark blue", () => {
    expect(isLightColor({ r: 0, g: 0, b: 128 })).toBe(false);
  });

  it("returns true for pure red (luminance ~0.21 > 0.179)", () => {
    expect(isLightColor({ r: 255, g: 0, b: 0 })).toBe(true);
  });

  it("returns false for dark red", () => {
    expect(isLightColor({ r: 100, g: 0, b: 0 })).toBe(false);
  });
});

describe("getContrastingTextColor", () => {
  it("returns black text for white background", () => {
    expect(getContrastingTextColor({ r: 255, g: 255, b: 255 })).toEqual({
      r: 0,
      g: 0,
      b: 0
    });
  });

  it("returns white text for black background", () => {
    expect(getContrastingTextColor({ r: 0, g: 0, b: 0 })).toEqual({
      r: 255,
      g: 255,
      b: 255
    });
  });

  it("returns black text for yellow background", () => {
    expect(getContrastingTextColor({ r: 255, g: 255, b: 0 })).toEqual({
      r: 0,
      g: 0,
      b: 0
    });
  });

  it("returns white text for dark blue background", () => {
    expect(getContrastingTextColor({ r: 0, g: 0, b: 128 })).toEqual({
      r: 255,
      g: 255,
      b: 255
    });
  });
});
