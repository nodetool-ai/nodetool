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

describe("colorConversion utilities", () => {
  describe("hexToRgb", () => {
    it("converts 6-digit hex to RGB", () => {
      expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(hexToRgb("#00ff00")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
      expect(hexToRgb("#0000ff")).toEqual({ r: 0, g: 0, b: 255, a: 1 });
      expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
      expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it("converts 3-digit hex to RGB", () => {
      expect(hexToRgb("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(hexToRgb("#0f0")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
      expect(hexToRgb("#00f")).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    });

    it("converts 8-digit hex with alpha", () => {
      expect(hexToRgb("#ff000080")).toEqual({ r: 255, g: 0, b: 0, a: 0.5019607843137255 });
      expect(hexToRgb("#ffffff00")).toEqual({ r: 255, g: 255, b: 255, a: 0 });
    });

    it("handles hex without # prefix", () => {
      expect(hexToRgb("ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });
  });

  describe("rgbToHex", () => {
    it("converts RGB to 6-digit hex", () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe("#ff0000");
      expect(rgbToHex({ r: 0, g: 255, b: 0 })).toBe("#00ff00");
      expect(rgbToHex({ r: 0, g: 0, b: 255 })).toBe("#0000ff");
    });

    it("includes alpha when specified", () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0, a: 0.5 }, true)).toBe("#ff000080");
      expect(rgbToHex({ r: 255, g: 0, b: 0, a: 1 }, true)).toBe("#ff0000");
    });

    it("clamps values to valid range", () => {
      expect(rgbToHex({ r: 300, g: -50, b: 128 })).toBe("#ff0080");
    });
  });

  describe("RGB to HSL conversion", () => {
    it("converts RGB to HSL", () => {
      expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50, a: undefined });
      expect(rgbToHsl({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 100, l: 50, a: undefined });
      expect(rgbToHsl({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 100, l: 50, a: undefined });
    });

    it("converts HSL to RGB", () => {
      expect(hslToRgb({ h: 0, s: 100, l: 50 })).toEqual({ r: 255, g: 0, b: 0, a: undefined });
      expect(hslToRgb({ h: 120, s: 100, l: 50 })).toEqual({ r: 0, g: 255, b: 0, a: undefined });
      expect(hslToRgb({ h: 240, s: 100, l: 50 })).toEqual({ r: 0, g: 0, b: 255, a: undefined });
    });

    it("handles grayscale colors", () => {
      expect(rgbToHsl({ r: 128, g: 128, b: 128 })).toEqual({ h: 0, s: 0, l: 50, a: undefined });
    });
  });

  describe("RGB to HSB conversion", () => {
    it("converts RGB to HSB", () => {
      expect(rgbToHsb({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, b: 100, a: undefined });
      expect(rgbToHsb({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 100, b: 100, a: undefined });
      expect(rgbToHsb({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 100, b: 100, a: undefined });
    });

    it("converts HSB to RGB", () => {
      expect(hsbToRgb({ h: 0, s: 100, b: 100 })).toEqual({ r: 255, g: 0, b: 0, a: undefined });
      expect(hsbToRgb({ h: 120, s: 100, b: 100 })).toEqual({ r: 0, g: 255, b: 0, a: undefined });
    });
  });

  describe("RGB to CMYK conversion", () => {
    it("converts RGB to CMYK", () => {
      expect(rgbToCmyk({ r: 255, g: 0, b: 0 })).toEqual({ c: 0, m: 100, y: 100, k: 0 });
      expect(rgbToCmyk({ r: 0, g: 0, b: 0 })).toEqual({ c: 0, m: 0, y: 0, k: 100 });
    });

    it("converts CMYK to RGB", () => {
      expect(cmykToRgb({ c: 0, m: 100, y: 100, k: 0 })).toEqual({ r: 255, g: 0, b: 0 });
    });
  });

  describe("RGB to LAB conversion", () => {
    it("converts RGB to LAB", () => {
      const lab = rgbToLab({ r: 255, g: 0, b: 0 });
      expect(lab.l).toBeGreaterThan(50);
      expect(lab.a).toBeGreaterThan(0);
    });

    it("converts LAB to RGB", () => {
      const lab = rgbToLab({ r: 255, g: 0, b: 0 });
      const rgb = labToRgb(lab);
      expect(rgb.r).toBeCloseTo(255, -1);
      expect(rgb.g).toBeCloseTo(0, -1);
      expect(rgb.b).toBeCloseTo(0, -1);
    });
  });

  describe("getLuminance", () => {
    it("calculates luminance correctly", () => {
      expect(getLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 2);
      expect(getLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 2);
    });
  });

  describe("getContrastRatio", () => {
    it("calculates contrast ratio correctly", () => {
      const white = { r: 255, g: 255, b: 255 };
      const black = { r: 0, g: 0, b: 0 };
      expect(getContrastRatio(white, black)).toBeCloseTo(21, 0);
    });
  });

  describe("getWcagCompliance", () => {
    it("checks WCAG compliance correctly", () => {
      const white = { r: 255, g: 255, b: 255 };
      const black = { r: 0, g: 0, b: 0 };
      const compliance = getWcagCompliance(black, white);
      expect(compliance.aa).toBe(true);
      expect(compliance.aaa).toBe(true);
    });

    it("fails low contrast", () => {
      const gray1 = { r: 100, g: 100, b: 100 };
      const gray2 = { r: 120, g: 120, b: 120 };
      const compliance = getWcagCompliance(gray1, gray2);
      expect(compliance.aa).toBe(false);
    });
  });

  describe("simulateColorBlindness", () => {
    it("simulates color blindness", () => {
      const red = { r: 255, g: 0, b: 0 };
      const protanopia = simulateColorBlindness(red, "protanopia");
      expect(protanopia.r).toBeLessThan(255);
    });
  });

  describe("isLightColor", () => {
    it("correctly identifies light colors", () => {
      expect(isLightColor({ r: 255, g: 255, b: 255 })).toBe(true);
      expect(isLightColor({ r: 0, g: 0, b: 0 })).toBe(false);
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
