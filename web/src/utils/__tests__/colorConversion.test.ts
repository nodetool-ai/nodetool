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
  isLightColor,
  getContrastingTextColor
} from "../colorConversion";

describe("colorConversion", () => {
  describe("hexToRgb", () => {
    it("parses 6-digit hex without #", () => {
      expect(hexToRgb("ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it("parses 6-digit hex with #", () => {
      expect(hexToRgb("#00ff00")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    });

    it("parses 3-digit shorthand hex", () => {
      expect(hexToRgb("f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it("parses 8-digit hex with alpha", () => {
      const result = hexToRgb("#ff000080");
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
      expect(result.a).toBeCloseTo(0.502, 3);
    });

    it("parses 4-digit shorthand hex with alpha", () => {
      const result = hexToRgb("f008");
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
      expect(result.a).toBeCloseTo(0.533, 3);
    });

    it("handles white", () => {
      expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    });

    it("handles black", () => {
      expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it("handles invalid hex with fallback", () => {
      const result = hexToRgb("nothex");
      expect(result.r).toBe(0);
      expect(result.g).toBe(0);
      expect(result.b).toBe(14);
      expect(result.a).toBe(1);
    });
  });

  describe("rgbToHex", () => {
    it("converts RGB to hex without alpha", () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe("#ff0000");
    });

    it("converts RGB to hex with alpha", () => {
      const result = rgbToHex({ r: 255, g: 0, b: 0, a: 0.5 }, true);
      expect(result).toBe("#ff000080");
    });

    it("clamps values outside range", () => {
      expect(rgbToHex({ r: 300, g: -10, b: 0 })).toBe("#ff0000");
    });

    it("handles white", () => {
      expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe("#ffffff");
    });
  });

  describe("rgbToHsl and hslToRgb", () => {
    it("converts red to HSL", () => {
      const hsl = rgbToHsl({ r: 255, g: 0, b: 0 });
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    it("converts green to HSL", () => {
      const hsl = rgbToHsl({ r: 0, g: 255, b: 0 });
      expect(hsl.h).toBe(120);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    it("converts blue to HSL", () => {
      const hsl = rgbToHsl({ r: 0, g: 0, b: 255 });
      expect(hsl.h).toBe(240);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    it("converts white to HSL", () => {
      const hsl = rgbToHsl({ r: 255, g: 255, b: 255 });
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(0);
      expect(hsl.l).toBe(100);
    });

    it("converts HSL back to RGB (red)", () => {
      const rgb = hslToRgb({ h: 0, s: 100, l: 50 });
      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(0);
    });

    it("converts HSL back to RGB (blue)", () => {
      const rgb = hslToRgb({ h: 240, s: 100, l: 50 });
      expect(rgb.r).toBe(0);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(255);
    });

    it("round trips with tolerance for various colors", () => {
      const colors = [
        { r: 128, g: 64, b: 32 },
        { r: 255, g: 128, b: 0 },
        { r: 0, g: 128, b: 128 }
      ];

      for (const color of colors) {
        const hsl = rgbToHsl(color);
        const result = hslToRgb(hsl);
        expect(result.r).toBeLessThanOrEqual(color.r + 2);
        expect(result.r).toBeGreaterThanOrEqual(color.r - 2);
        expect(result.g).toBeLessThanOrEqual(color.g + 2);
        expect(result.g).toBeGreaterThanOrEqual(color.g - 2);
        expect(result.b).toBeLessThanOrEqual(color.b + 2);
        expect(result.b).toBeGreaterThanOrEqual(color.b - 2);
      }
    });
  });

  describe("rgbToHsb and hsbToRgb", () => {
    it("converts RGB to HSB", () => {
      const hsb = rgbToHsb({ r: 255, g: 0, b: 0 });
      expect(hsb.h).toBe(0);
      expect(hsb.s).toBe(100);
      expect(hsb.b).toBe(100);
    });

    it("converts HSB to RGB", () => {
      const rgb = hsbToRgb({ h: 0, s: 100, b: 100 });
      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(0);
    });

    it("round trips with tolerance", () => {
      const original = { r: 100, g: 150, b: 200 };
      const hsb = rgbToHsb(original);
      const result = hsbToRgb(hsb);
      expect(result.r).toBeLessThanOrEqual(original.r + 2);
      expect(result.r).toBeGreaterThanOrEqual(original.r - 2);
      expect(result.g).toBeLessThanOrEqual(original.g + 2);
      expect(result.g).toBeGreaterThanOrEqual(original.g - 2);
      expect(result.b).toBeLessThanOrEqual(original.b + 2);
      expect(result.b).toBeGreaterThanOrEqual(original.b - 2);
    });
  });

  describe("rgbToCmyk and cmykToRgb", () => {
    it("converts pure red to CMYK", () => {
      const cmyk = rgbToCmyk({ r: 255, g: 0, b: 0 });
      expect(cmyk.c).toBe(0);
      expect(cmyk.m).toBe(100);
      expect(cmyk.y).toBe(100);
      expect(cmyk.k).toBe(0);
    });

    it("converts CMYK to RGB", () => {
      const rgb = cmykToRgb({ c: 0, m: 100, y: 100, k: 0 });
      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(0);
    });

    it("converts white to CMYK", () => {
      const cmyk = rgbToCmyk({ r: 255, g: 255, b: 255 });
      expect(cmyk.c).toBe(0);
      expect(cmyk.m).toBe(0);
      expect(cmyk.y).toBe(0);
      expect(cmyk.k).toBe(0);
    });

    it("converts black to CMYK", () => {
      const cmyk = rgbToCmyk({ r: 0, g: 0, b: 0 });
      expect(cmyk.k).toBe(100);
    });
  });

  describe("rgbToLab and labToRgb", () => {
    it("converts white to LAB", () => {
      const lab = rgbToLab({ r: 255, g: 255, b: 255 });
      expect(lab.l).toBeCloseTo(100, 0);
    });

    it("converts black to LAB", () => {
      const lab = rgbToLab({ r: 0, g: 0, b: 0 });
      expect(lab.l).toBeCloseTo(0, 0);
    });

    it("converts red to LAB", () => {
      const lab = rgbToLab({ r: 255, g: 0, b: 0 });
      expect(lab.l).toBeCloseTo(53, 0);
      expect(lab.a).toBeGreaterThan(0);
    });

    it("round trips with tolerance", () => {
      const original = { r: 128, g: 128, b: 128 };
      const lab = rgbToLab(original);
      const result = labToRgb(lab);
      expect(result.r).toBeGreaterThanOrEqual(126);
      expect(result.r).toBeLessThanOrEqual(132);
      expect(result.g).toBeGreaterThanOrEqual(126);
      expect(result.g).toBeLessThanOrEqual(132);
      expect(result.b).toBeGreaterThanOrEqual(126);
      expect(result.b).toBeLessThanOrEqual(132);
    });
  });

  describe("parseColor", () => {
    it("parses hex color", () => {
      expect(parseColor("#ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it("parses rgb() color", () => {
      expect(parseColor("rgb(255, 0, 0)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it("parses rgba() color", () => {
      expect(parseColor("rgba(255, 0, 0, 0.5)")).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    });

    it("parses hsl() color", () => {
      const result = parseColor("hsl(0, 100%, 50%)");
      expect(result).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it("parses named colors", () => {
      expect(parseColor("red")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(parseColor("blue")).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    });

    it("returns null for unknown colors", () => {
      expect(parseColor("notacolor")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseColor("")).toBeNull();
    });
  });

  describe("hexToAllFormats", () => {
    it("converts hex to all formats", () => {
      const result = hexToAllFormats("#ff0000");
      expect(result.hex).toBe("#ff0000");
      expect(result.rgb).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(result.hsl.h).toBe(0);
      expect(result.cmyk.m).toBe(100);
      expect(typeof result.lab.l).toBe("number");
    });
  });

  describe("getLuminance", () => {
    it("calculates luminance for white", () => {
      expect(getLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 2);
    });

    it("calculates luminance for black", () => {
      expect(getLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 2);
    });

    it("calculates luminance for mid-gray", () => {
      expect(getLuminance({ r: 128, g: 128, b: 128 })).toBeCloseTo(0.216, 2);
    });
  });

  describe("getContrastRatio", () => {
    it("calculates contrast between black and white", () => {
      const black = { r: 0, g: 0, b: 0 };
      const white = { r: 255, g: 255, b: 255 };
      expect(getContrastRatio(black, white)).toBeCloseTo(21, 0);
    });

    it("calculates contrast between same colors", () => {
      const color = { r: 128, g: 128, b: 128 };
      expect(getContrastRatio(color, color)).toBeCloseTo(1, 1);
    });
  });

  describe("getWcagCompliance", () => {
    it("returns AA compliance for black on white", () => {
      const black = { r: 0, g: 0, b: 0 };
      const white = { r: 255, g: 255, b: 255 };
      const result = getWcagCompliance(black, white);
      expect(result.aa).toBe(true);
      expect(result.aaa).toBe(true);
    });

    it("returns fail for similar colors", () => {
      const color1 = { r: 128, g: 128, b: 128 };
      const color2 = { r: 130, g: 130, b: 130 };
      const result = getWcagCompliance(color1, color2);
      expect(result.aa).toBe(false);
    });
  });

  describe("rgbToCss and hslToCss", () => {
    it("formats RGB without alpha", () => {
      expect(rgbToCss({ r: 255, g: 0, b: 0 })).toBe("rgb(255, 0, 0)");
    });

    it("formats RGB with alpha", () => {
      expect(rgbToCss({ r: 255, g: 0, b: 0, a: 0.5 })).toBe("rgba(255, 0, 0, 0.5)");
    });

    it("formats HSL without alpha", () => {
      expect(hslToCss({ h: 0, s: 100, l: 50 })).toBe("hsl(0, 100%, 50%)");
    });

    it("formats HSL with alpha", () => {
      expect(hslToCss({ h: 0, s: 100, l: 50, a: 0.5 })).toBe("hsla(0, 100%, 50%, 0.5)");
    });
  });

  describe("isLightColor and getContrastingTextColor", () => {
    it("identifies white as light", () => {
      expect(isLightColor({ r: 255, g: 255, b: 255 })).toBe(true);
    });

    it("identifies black as dark", () => {
      expect(isLightColor({ r: 0, g: 0, b: 0 })).toBe(false);
    });

    it("returns black text for light background", () => {
      const bg = { r: 255, g: 255, b: 255 };
      expect(getContrastingTextColor(bg)).toEqual({ r: 0, g: 0, b: 0 });
    });

    it("returns white text for dark background", () => {
      const bg = { r: 0, g: 0, b: 0 };
      expect(getContrastingTextColor(bg)).toEqual({ r: 255, g: 255, b: 255 });
    });
  });
});
