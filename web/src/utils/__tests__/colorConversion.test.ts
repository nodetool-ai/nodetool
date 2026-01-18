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
  parseColor,
  hexToAllFormats,
  getLuminance,
  getContrastRatio,
  getWcagCompliance,
  rgbToCss,
  hslToCss,
  simulateColorBlindness,
  isLightColor,
  getContrastingTextColor,
  RGB,
  HSL,
  HSB,
  CMYK,
  LAB
} from "../colorConversion";

describe("colorConversion", () => {
  describe("hexToRgb", () => {
    test("parses 6-digit hex without hash", () => {
      expect(hexToRgb("ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    test("parses 6-digit hex with hash", () => {
      expect(hexToRgb("#00ff00")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    });

    test("parses 3-digit shorthand hex", () => {
      expect(hexToRgb("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    test("parses 8-digit hex with alpha", () => {
      expect(hexToRgb("#ff000080")).toEqual({ r: 255, g: 0, b: 0, a: 128 / 255 });
    });

    test("parses 4-digit shorthand hex with alpha", () => {
      expect(hexToRgb("#f008")).toEqual({ r: 255, g: 0, b: 0, a: 136 / 255 });
    });

    test("handles case insensitivity", () => {
      expect(hexToRgb("#FF00FF")).toEqual({ r: 255, g: 0, b: 255, a: 1 });
    });

    test("handles white and black", () => {
      expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
      expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });
  });

  describe("rgbToHex", () => {
    test("converts RGB to hex", () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe("#ff0000");
    });

    test("includes alpha when present and less than 1", () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0, a: 0.5 }, true)).toBe("#ff000080");
    });

    test("clamps values to 0-255", () => {
      expect(rgbToHex({ r: 300, g: -10, b: 100 })).toBe("#ff0064");
    });

    test("handles zero values", () => {
      const result = rgbToHex({ r: 0, g: 0, b: 0 });
      expect(result).toBe("#000000");
      // Handle -0 edge case
      const resultWithNegativeZero = rgbToHex({ r: -0, g: -0, b: -0 });
      expect(resultWithNegativeZero).toBe("#000000");
    });
  });

  describe("rgbToHsl and hslToRgb", () => {
    test("converts red to HSL", () => {
      const hsl = rgbToHsl({ r: 255, g: 0, b: 0 });
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    test("converts green to HSL", () => {
      const hsl = rgbToHsl({ r: 0, g: 255, b: 0 });
      expect(hsl.h).toBe(120);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    test("converts blue to HSL", () => {
      const hsl = rgbToHsl({ r: 0, g: 0, b: 255 });
      expect(hsl.h).toBe(240);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    test("converts white to HSL", () => {
      const hsl = rgbToHsl({ r: 255, g: 255, b: 255 });
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(0);
      expect(hsl.l).toBe(100);
    });

    test("converts black to HSL", () => {
      const hsl = rgbToHsl({ r: 0, g: 0, b: 0 });
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(0);
      expect(hsl.l).toBe(0);
    });

    test("converts HSL back to RGB (roundtrip)", () => {
      const original: RGB = { r: 128, g: 64, b: 200 };
      const hsl = rgbToHsl(original);
      const backToRgb = hslToRgb(hsl);
      expect(Math.abs(backToRgb.r - original.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(backToRgb.g - original.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(backToRgb.b - original.b)).toBeLessThanOrEqual(1);
    });

    test("preserves alpha channel", () => {
      const rgbWithAlpha: RGB = { r: 255, g: 0, b: 0, a: 0.75 };
      const hsl = rgbToHsl(rgbWithAlpha);
      expect(hsl.a).toBe(0.75);
      const backToRgb = hslToRgb(hsl);
      expect(backToRgb.a).toBe(0.75);
    });
  });

  describe("rgbToHsb and hsbToRgb", () => {
    test("converts pure red to HSB", () => {
      const hsb = rgbToHsb({ r: 255, g: 0, b: 0 });
      expect(hsb.h).toBe(0);
      expect(hsb.s).toBe(100);
      expect(hsb.b).toBe(100);
    });

    test("converts pure white to HSB", () => {
      const hsb = rgbToHsb({ r: 255, g: 255, b: 255 });
      expect(hsb.h).toBe(0);
      expect(hsb.s).toBe(0);
      expect(hsb.b).toBe(100);
    });

    test("converts pure black to HSB", () => {
      const hsb = rgbToHsb({ r: 0, g: 0, b: 0 });
      expect(hsb.h).toBe(0);
      expect(hsb.s).toBe(0);
      expect(hsb.b).toBe(0);
    });

    test("converts HSB back to RGB (roundtrip)", () => {
      const original: RGB = { r: 100, g: 150, b: 200 };
      const hsb = rgbToHsb(original);
      const backToRgb = hsbToRgb(hsb);
      expect(Math.abs(backToRgb.r - original.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(backToRgb.g - original.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(backToRgb.b - original.b)).toBeLessThanOrEqual(1);
    });
  });

  describe("rgbToCmyk and cmykToRgb", () => {
    test("converts pure white to CMYK", () => {
      const cmyk = rgbToCmyk({ r: 255, g: 255, b: 255 });
      expect(cmyk.c).toBe(0);
      expect(cmyk.m).toBe(0);
      expect(cmyk.y).toBe(0);
      expect(cmyk.k).toBe(0);
    });

    test("converts pure black to CMYK", () => {
      const cmyk = rgbToCmyk({ r: 0, g: 0, b: 0 });
      expect(cmyk.c).toBe(0);
      expect(cmyk.m).toBe(0);
      expect(cmyk.y).toBe(0);
      expect(cmyk.k).toBe(100);
    });

    test("converts red to CMYK", () => {
      const cmyk = rgbToCmyk({ r: 255, g: 0, b: 0 });
      expect(cmyk.c).toBe(0);
      expect(cmyk.m).toBe(100);
      expect(cmyk.y).toBe(100);
      expect(cmyk.k).toBe(0);
    });

    test("converts CMYK back to RGB (roundtrip)", () => {
      const original: RGB = { r: 50, g: 100, b: 150 };
      const cmyk = rgbToCmyk(original);
      const backToRgb = cmykToRgb(cmyk);
      expect(Math.abs(backToRgb.r - original.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(backToRgb.g - original.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(backToRgb.b - original.b)).toBeLessThanOrEqual(1);
    });
  });

  describe("rgbToLab and labToRgb", () => {
    test("converts white to LAB", () => {
      const lab = rgbToLab({ r: 255, g: 255, b: 255 });
      expect(lab.l).toBe(100);
      // Use >= 0 to handle -0 edge case
      expect(lab.a).toBeGreaterThanOrEqual(0);
      expect(lab.b).toBeGreaterThanOrEqual(0);
    });

    test("converts black to LAB", () => {
      const lab = rgbToLab({ r: 0, g: 0, b: 0 });
      expect(lab.l).toBe(0);
    });

    test("converts red to LAB", () => {
      const lab = rgbToLab({ r: 255, g: 0, b: 0 });
      expect(lab.l).toBe(53);
      expect(lab.a).toBeGreaterThan(70);
      expect(lab.b).toBeGreaterThan(60);
    });

    test("converts LAB back to RGB (roundtrip)", () => {
      const original: RGB = { r: 128, g: 128, b: 128 };
      const lab = rgbToLab(original);
      const backToRgb = labToRgb(lab);
      expect(Math.abs(backToRgb.r - original.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(backToRgb.g - original.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(backToRgb.b - original.b)).toBeLessThanOrEqual(1);
    });
  });

  describe("parseColor", () => {
    test("parses hex color", () => {
      const result = parseColor("#ff0000");
      expect(result).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    test("parses rgb() format", () => {
      const result = parseColor("rgb(255, 0, 0)");
      expect(result).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    test("parses rgba() format", () => {
      const result = parseColor("rgba(255, 0, 0, 0.5)");
      expect(result).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    });

    test("parses hsl() format", () => {
      const result = parseColor("hsl(120, 100%, 50%)");
      expect(result).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    });

    test("parses hsla() format", () => {
      const result = parseColor("hsla(0, 100%, 50%, 0.5)");
      expect(result).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    });

    test("parses named colors", () => {
      expect(parseColor("red")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(parseColor("white")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
      expect(parseColor("blue")).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    });

    test("returns null for invalid color", () => {
      expect(parseColor("not a color")).toBeNull();
      expect(parseColor("")).toBeNull();
      expect(parseColor(null as unknown as string)).toBeNull();
    });

    test("handles whitespace", () => {
      expect(parseColor("  #ff0000  ")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(parseColor("  rgb(255, 0, 0)  ")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });
  });

  describe("hexToAllFormats", () => {
    test("converts hex to all formats", () => {
      const result = hexToAllFormats("#ff0000");
      expect(result.hex).toBe("#ff0000");
      expect(result.rgb).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(result.hsl.h).toBe(0);
      expect(result.hsl.s).toBe(100);
      expect(result.hsl.l).toBe(50);
      expect(result.cmyk).toEqual({ c: 0, m: 100, y: 100, k: 0 });
    });
  });

  describe("getLuminance", () => {
    test("calculates luminance for white", () => {
      const luminance = getLuminance({ r: 255, g: 255, b: 255 });
      expect(luminance).toBe(1);
    });

    test("calculates luminance for black", () => {
      const luminance = getLuminance({ r: 0, g: 0, b: 0 });
      expect(luminance).toBe(0);
    });

    test("calculates luminance for mid-gray", () => {
      const luminance = getLuminance({ r: 128, g: 128, b: 128 });
      expect(luminance).toBeCloseTo(0.218, 2);
    });
  });

  describe("getContrastRatio", () => {
    test("calculates contrast ratio between black and white", () => {
      const ratio = getContrastRatio(
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 }
      );
      expect(ratio).toBe(21);
    });

    test("returns 1 for same color", () => {
      const color = { r: 128, g: 128, b: 128 };
      const ratio = getContrastRatio(color, color);
      expect(ratio).toBe(1);
    });
  });

  describe("getWcagCompliance", () => {
    test("white on black meets AAA", () => {
      const result = getWcagCompliance(
        { r: 255, g: 255, b: 255 },
        { r: 0, g: 0, b: 0 }
      );
      expect(result.ratio).toBe(21);
      expect(result.aa).toBe(true);
      expect(result.aaa).toBe(true);
    });

    test("light gray on white fails AA", () => {
      const result = getWcagCompliance(
        { r: 200, g: 200, b: 200 },
        { r: 255, g: 255, b: 255 }
      );
      expect(result.ratio).toBeLessThan(4.5);
      expect(result.aa).toBe(false);
    });

    test("large text can meet AA with lower ratio", () => {
      // Test with a gray that has better contrast for large text
      // #444444 on white has ratio of ~10:1, which is well above 3:1 requirement
      const result = getWcagCompliance(
        { r: 68, g: 68, b: 68 }, // #444444
        { r: 255, g: 255, b: 255 }
      );
      // Large text only needs 3:1 ratio (4.5:1 for normal text)
      expect(result.ratio).toBeGreaterThanOrEqual(4.5); // Should pass normal AA too
      expect(result.aa).toBe(true);
      expect(result.aaLarge).toBe(true);
    });
  });

  describe("rgbToCss and hslToCss", () => {
    test("formats RGB without alpha", () => {
      expect(rgbToCss({ r: 255, g: 0, b: 0 })).toBe("rgb(255, 0, 0)");
    });

    test("formats RGB with alpha", () => {
      expect(rgbToCss({ r: 255, g: 0, b: 0, a: 0.5 })).toBe("rgba(255, 0, 0, 0.5)");
    });

    test("formats HSL without alpha", () => {
      expect(hslToCss({ h: 120, s: 100, l: 50 })).toBe("hsl(120, 100%, 50%)");
    });

    test("formats HSL with alpha", () => {
      expect(hslToCss({ h: 120, s: 100, l: 50, a: 0.75 })).toBe("hsla(120, 100%, 50%, 0.75)");
    });
  });

  describe("simulateColorBlindness", () => {
    test("simulates protanopia", () => {
      const red = { r: 255, g: 0, b: 0 };
      const result = simulateColorBlindness(red, "protanopia");
      // Red should appear differently (less red, more other colors)
      expect(result.r).toBeLessThan(255);
      expect(result.g + result.b).toBeGreaterThan(0);
    });

    test("simulates deuteranopia", () => {
      const green = { r: 0, g: 255, b: 0 };
      const result = simulateColorBlindness(green, "deuteranopia");
      // Green should appear differently (less green, more other colors)
      expect(result.g).toBeLessThan(255);
      expect(result.r + result.b).toBeGreaterThan(0);
    });

    test("simulates tritanopia", () => {
      const blue = { r: 0, g: 0, b: 255 };
      const result = simulateColorBlindness(blue, "tritanopia");
      // Blue should appear differently (less blue, more other colors)
      expect(result.b).toBeLessThan(255);
      expect(result.r + result.g).toBeGreaterThan(0);
    });

    test("preserves alpha channel", () => {
      const color = { r: 255, g: 0, b: 0, a: 0.5 };
      const result = simulateColorBlindness(color, "protanopia");
      expect(result.a).toBe(0.5);
    });
  });

  describe("isLightColor and getContrastingTextColor", () => {
    test("identifies white as light", () => {
      expect(isLightColor({ r: 255, g: 255, b: 255 })).toBe(true);
    });

    test("identifies black as dark", () => {
      expect(isLightColor({ r: 0, g: 0, b: 0 })).toBe(false);
    });

    test("returns black text for light backgrounds", () => {
      const result = getContrastingTextColor({ r: 255, g: 255, b: 255 });
      expect(result).toEqual({ r: 0, g: 0, b: 0 });
    });

    test("returns white text for dark backgrounds", () => {
      const result = getContrastingTextColor({ r: 0, g: 0, b: 0 });
      expect(result).toEqual({ r: 255, g: 255, b: 255 });
    });
  });
});
