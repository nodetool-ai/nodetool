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
  getContrastingTextColor
} from "./colorConversion";

describe("colorConversion", () => {
  describe("hexToRgb", () => {
    it("parses 6-digit hex", () => {
      expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(hexToRgb("#00ff00")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
      expect(hexToRgb("#0000ff")).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    });

    it("parses 3-digit shorthand", () => {
      expect(hexToRgb("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(hexToRgb("#abc")).toEqual({ r: 170, g: 187, b: 204, a: 1 });
    });

    it("parses 8-digit hex with alpha", () => {
      const result = hexToRgb("#ff000080");
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
      expect(result.a).toBeCloseTo(0.502, 2);
    });

    it("parses 4-digit shorthand with alpha", () => {
      const result = hexToRgb("#f008");
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
      expect(result.a).toBeCloseTo(0.533, 2);
    });

    it("handles missing # prefix", () => {
      expect(hexToRgb("ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it("returns zeros for invalid hex", () => {
      expect(hexToRgb("#xyz")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });
  });

  describe("rgbToHex", () => {
    it("converts RGB to 6-digit hex", () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe("#ff0000");
      expect(rgbToHex({ r: 0, g: 255, b: 0 })).toBe("#00ff00");
      expect(rgbToHex({ r: 0, g: 0, b: 255 })).toBe("#0000ff");
    });

    it("includes alpha when requested and alpha < 1", () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0, a: 0.5 }, true)).toBe("#ff000080");
    });

    it("omits alpha when alpha is 1", () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0, a: 1 }, true)).toBe("#ff0000");
    });

    it("clamps out-of-range values", () => {
      expect(rgbToHex({ r: 300, g: -10, b: 128 })).toBe("#ff0080");
    });
  });

  describe("rgbToHsl / hslToRgb roundtrip", () => {
    it("converts pure red", () => {
      const hsl = rgbToHsl({ r: 255, g: 0, b: 0 });
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    it("converts pure green", () => {
      const hsl = rgbToHsl({ r: 0, g: 255, b: 0 });
      expect(hsl.h).toBe(120);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    it("converts pure blue", () => {
      const hsl = rgbToHsl({ r: 0, g: 0, b: 255 });
      expect(hsl.h).toBe(240);
    });

    it("converts gray (achromatic)", () => {
      const hsl = rgbToHsl({ r: 128, g: 128, b: 128 });
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(0);
    });

    it("roundtrips through HSL", () => {
      const original = { r: 100, g: 150, b: 200 };
      const hsl = rgbToHsl(original);
      const back = hslToRgb(hsl);
      expect(back.r).toBeCloseTo(original.r, -1);
      expect(back.g).toBeCloseTo(original.g, -1);
      expect(back.b).toBeCloseTo(original.b, -1);
    });

    it("preserves alpha", () => {
      const hsl = rgbToHsl({ r: 255, g: 0, b: 0, a: 0.5 });
      expect(hsl.a).toBe(0.5);
      const rgb = hslToRgb(hsl);
      expect(rgb.a).toBe(0.5);
    });
  });

  describe("rgbToHsb / hsbToRgb roundtrip", () => {
    it("converts pure red", () => {
      const hsb = rgbToHsb({ r: 255, g: 0, b: 0 });
      expect(hsb.h).toBe(0);
      expect(hsb.s).toBe(100);
      expect(hsb.b).toBe(100);
    });

    it("converts black", () => {
      const hsb = rgbToHsb({ r: 0, g: 0, b: 0 });
      expect(hsb.s).toBe(0);
      expect(hsb.b).toBe(0);
    });

    it("roundtrips through HSB", () => {
      const original = { r: 100, g: 150, b: 200 };
      const hsb = rgbToHsb(original);
      const back = hsbToRgb(hsb);
      expect(back.r).toBeCloseTo(original.r, -1);
      expect(back.g).toBeCloseTo(original.g, -1);
      expect(back.b).toBeCloseTo(original.b, -1);
    });
  });

  describe("rgbToCmyk / cmykToRgb", () => {
    it("converts black", () => {
      expect(rgbToCmyk({ r: 0, g: 0, b: 0 })).toEqual({ c: 0, m: 0, y: 0, k: 100 });
    });

    it("converts white", () => {
      expect(rgbToCmyk({ r: 255, g: 255, b: 255 })).toEqual({ c: 0, m: 0, y: 0, k: 0 });
    });

    it("converts pure red", () => {
      const cmyk = rgbToCmyk({ r: 255, g: 0, b: 0 });
      expect(cmyk.c).toBe(0);
      expect(cmyk.m).toBe(100);
      expect(cmyk.y).toBe(100);
      expect(cmyk.k).toBe(0);
    });

    it("roundtrips through CMYK", () => {
      const original = { r: 100, g: 150, b: 200 };
      const cmyk = rgbToCmyk(original);
      const back = cmykToRgb(cmyk);
      expect(back.r).toBeCloseTo(original.r, -1);
      expect(back.g).toBeCloseTo(original.g, -1);
      expect(back.b).toBeCloseTo(original.b, -1);
    });
  });

  describe("rgbToLab / labToRgb", () => {
    it("converts white", () => {
      const lab = rgbToLab({ r: 255, g: 255, b: 255 });
      expect(lab.l).toBe(100);
      expect(Math.abs(lab.a)).toBe(0);
      expect(Math.abs(lab.b)).toBe(0);
    });

    it("converts black", () => {
      const lab = rgbToLab({ r: 0, g: 0, b: 0 });
      expect(lab.l).toBe(0);
    });

    it("roundtrips through LAB", () => {
      const original = { r: 100, g: 150, b: 200 };
      const lab = rgbToLab(original);
      const back = labToRgb(lab);
      expect(back.r).toBeCloseTo(original.r, -0.5);
      expect(back.g).toBeCloseTo(original.g, -0.5);
      expect(back.b).toBeCloseTo(original.b, -0.5);
    });
  });

  describe("parseColor", () => {
    it("parses hex colors", () => {
      expect(parseColor("#ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it("parses rgb() strings", () => {
      expect(parseColor("rgb(255, 0, 0)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it("parses rgba() strings", () => {
      expect(parseColor("rgba(255, 0, 0, 0.5)")).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    });

    it("parses hsl() strings", () => {
      const result = parseColor("hsl(0, 100%, 50%)");
      expect(result).not.toBeNull();
      expect(result!.r).toBe(255);
      expect(result!.g).toBe(0);
      expect(result!.b).toBe(0);
    });

    it("parses named colors", () => {
      expect(parseColor("red")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(parseColor("white")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
      expect(parseColor("black")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it("returns null for empty or unknown input", () => {
      expect(parseColor("")).toBeNull();
      expect(parseColor("notacolor")).toBeNull();
    });

    it("is case-insensitive", () => {
      expect(parseColor("RED")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(parseColor("#FF0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });
  });

  describe("hexToAllFormats", () => {
    it("produces all color model representations", () => {
      const result = hexToAllFormats("#ff0000");
      expect(result.hex).toBe("#ff0000");
      expect(result.rgb.r).toBe(255);
      expect(result.hsl.h).toBe(0);
      expect(result.hsb.s).toBe(100);
      expect(result.cmyk.m).toBe(100);
      expect(result.lab).toBeDefined();
    });
  });

  describe("getLuminance", () => {
    it("returns 0 for black", () => {
      expect(getLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    });

    it("returns 1 for white", () => {
      expect(getLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 2);
    });

    it("green contributes more luminance than red or blue", () => {
      const redLum = getLuminance({ r: 255, g: 0, b: 0 });
      const greenLum = getLuminance({ r: 0, g: 255, b: 0 });
      const blueLum = getLuminance({ r: 0, g: 0, b: 255 });
      expect(greenLum).toBeGreaterThan(redLum);
      expect(greenLum).toBeGreaterThan(blueLum);
    });
  });

  describe("getContrastRatio", () => {
    it("returns 21 for black on white", () => {
      const ratio = getContrastRatio(
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 }
      );
      expect(ratio).toBeCloseTo(21, 0);
    });

    it("returns 1 for same color", () => {
      const ratio = getContrastRatio(
        { r: 128, g: 128, b: 128 },
        { r: 128, g: 128, b: 128 }
      );
      expect(ratio).toBe(1);
    });
  });

  describe("getWcagCompliance", () => {
    it("black on white passes all levels", () => {
      const result = getWcagCompliance(
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 }
      );
      expect(result.aa).toBe(true);
      expect(result.aaLarge).toBe(true);
      expect(result.aaa).toBe(true);
      expect(result.aaaLarge).toBe(true);
    });

    it("low contrast fails AA", () => {
      const result = getWcagCompliance(
        { r: 200, g: 200, b: 200 },
        { r: 255, g: 255, b: 255 }
      );
      expect(result.aa).toBe(false);
    });
  });

  describe("rgbToCss", () => {
    it("formats rgb()", () => {
      expect(rgbToCss({ r: 255, g: 0, b: 0 })).toBe("rgb(255, 0, 0)");
    });

    it("formats rgba() when alpha < 1", () => {
      expect(rgbToCss({ r: 255, g: 0, b: 0, a: 0.5 })).toBe("rgba(255, 0, 0, 0.5)");
    });

    it("formats rgb() when alpha is 1", () => {
      expect(rgbToCss({ r: 255, g: 0, b: 0, a: 1 })).toBe("rgb(255, 0, 0)");
    });
  });

  describe("hslToCss", () => {
    it("formats hsl()", () => {
      expect(hslToCss({ h: 0, s: 100, l: 50 })).toBe("hsl(0, 100%, 50%)");
    });

    it("formats hsla() when alpha < 1", () => {
      expect(hslToCss({ h: 0, s: 100, l: 50, a: 0.5 })).toBe("hsla(0, 100%, 50%, 0.5)");
    });
  });

  describe("simulateColorBlindness", () => {
    it("transforms colors for protanopia", () => {
      const result = simulateColorBlindness({ r: 255, g: 0, b: 0 }, "protanopia");
      expect(result.r).toBeLessThan(255);
      expect(result.g).toBeGreaterThan(0);
    });

    it("transforms colors for deuteranopia", () => {
      const result = simulateColorBlindness({ r: 255, g: 0, b: 0 }, "deuteranopia");
      expect(result.r).toBeLessThan(255);
    });

    it("transforms colors for tritanopia", () => {
      const result = simulateColorBlindness({ r: 0, g: 0, b: 255 }, "tritanopia");
      expect(result.b).toBeLessThan(255);
    });

    it("preserves alpha", () => {
      const result = simulateColorBlindness({ r: 255, g: 0, b: 0, a: 0.5 }, "protanopia");
      expect(result.a).toBe(0.5);
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
  });

  describe("getContrastingTextColor", () => {
    it("returns black for light backgrounds", () => {
      expect(getContrastingTextColor({ r: 255, g: 255, b: 255 })).toEqual({ r: 0, g: 0, b: 0 });
    });

    it("returns white for dark backgrounds", () => {
      expect(getContrastingTextColor({ r: 0, g: 0, b: 0 })).toEqual({ r: 255, g: 255, b: 255 });
    });
  });
});
