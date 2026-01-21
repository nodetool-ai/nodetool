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
  RGB,
  HSL,
  HSB,
  CMYK,
  LAB
} from "../colorConversion";

describe("colorConversion", () => {
  describe("hexToRgb", () => {
    it("converts 6-digit hex to RGB", () => {
      const result = hexToRgb("#FF0000");
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it("converts 3-digit shorthand hex to RGB", () => {
      const result = hexToRgb("#F00");
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it("converts hex with alpha to RGBA", () => {
      const result = hexToRgb("#FF000080");
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
      expect(result.a).toBeCloseTo(0.5, 2);
    });

    it("handles hex without #", () => {
      const result = hexToRgb("00FF00");
      expect(result.r).toBe(0);
      expect(result.g).toBe(255);
      expect(result.b).toBe(0);
    });

    it("handles white color", () => {
      const result = hexToRgb("#FFFFFF");
      expect(result.r).toBe(255);
      expect(result.g).toBe(255);
      expect(result.b).toBe(255);
    });

    it("handles black color", () => {
      const result = hexToRgb("#000000");
      expect(result.r).toBe(0);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it("handles gray color", () => {
      const result = hexToRgb("#808080");
      expect(result.r).toBe(128);
      expect(result.g).toBe(128);
      expect(result.b).toBe(128);
    });

    it("defaults alpha to 1", () => {
      const result = hexToRgb("#FF0000");
      expect(result.a).toBe(1);
    });
  });

  describe("rgbToHex", () => {
    it("converts RGB to 6-digit hex", () => {
      const result = rgbToHex({ r: 255, g: 0, b: 0 });
      expect(result).toBe("#ff0000");
    });

    it("includes alpha when requested", () => {
      const result = rgbToHex({ r: 255, g: 0, b: 0, a: 0.5 }, true);
      expect(result).toBe("#ff000080");
    });

    it("clamps values outside 0-255 range", () => {
      const result = rgbToHex({ r: 300, g: -10, b: 128 });
      expect(result).toBe("#ff0080");
    });

    it("handles white", () => {
      const result = rgbToHex({ r: 255, g: 255, b: 255 });
      expect(result).toBe("#ffffff");
    });

    it("handles black", () => {
      const result = rgbToHex({ r: 0, g: 0, b: 0 });
      expect(result).toBe("#000000");
    });

    it("pads single digit hex values", () => {
      const result = rgbToHex({ r: 15, g: 0, b: 0 });
      expect(result).toBe("#0f0000");
    });
  });

  describe("rgbToHsl", () => {
    it("converts red to HSL", () => {
      const result = rgbToHsl({ r: 255, g: 0, b: 0 });
      expect(result.h).toBe(0);
      expect(result.s).toBe(100);
      expect(result.l).toBe(50);
    });

    it("converts green to HSL", () => {
      const result = rgbToHsl({ r: 0, g: 255, b: 0 });
      expect(result.h).toBe(120);
      expect(result.s).toBe(100);
      expect(result.l).toBe(50);
    });

    it("converts blue to HSL", () => {
      const result = rgbToHsl({ r: 0, g: 0, b: 255 });
      expect(result.h).toBe(240);
      expect(result.s).toBe(100);
      expect(result.l).toBe(50);
    });

    it("converts white to HSL", () => {
      const result = rgbToHsl({ r: 255, g: 255, b: 255 });
      expect(result.h).toBe(0);
      expect(result.s).toBe(0);
      expect(result.l).toBe(100);
    });

    it("converts black to HSL", () => {
      const result = rgbToHsl({ r: 0, g: 0, b: 0 });
      expect(result.h).toBe(0);
      expect(result.s).toBe(0);
      expect(result.l).toBe(0);
    });

    it("converts gray to HSL", () => {
      const result = rgbToHsl({ r: 128, g: 128, b: 128 });
      expect(result.h).toBe(0);
      expect(result.s).toBe(0);
      expect(result.l).toBe(50);
    });

    it("converts yellow to HSL", () => {
      const result = rgbToHsl({ r: 255, g: 255, b: 0 });
      expect(result.h).toBe(60);
      expect(result.s).toBe(100);
      expect(result.l).toBe(50);
    });

    it("converts cyan to HSL", () => {
      const result = rgbToHsl({ r: 0, g: 255, b: 255 });
      expect(result.h).toBe(180);
      expect(result.s).toBe(100);
      expect(result.l).toBe(50);
    });

    it("preserves alpha channel", () => {
      const result = rgbToHsl({ r: 255, g: 0, b: 0, a: 0.5 });
      expect(result.a).toBe(0.5);
    });
  });

  describe("hslToRgb", () => {
    it("converts HSL red to RGB", () => {
      const result = hslToRgb({ h: 0, s: 100, l: 50 });
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it("converts HSL green to RGB", () => {
      const result = hslToRgb({ h: 120, s: 100, l: 50 });
      expect(result.r).toBe(0);
      expect(result.g).toBe(255);
      expect(result.b).toBe(0);
    });

    it("converts HSL blue to RGB", () => {
      const result = hslToRgb({ h: 240, s: 100, l: 50 });
      expect(result.r).toBe(0);
      expect(result.g).toBe(0);
      expect(result.b).toBe(255);
    });

    it("converts HSL white to RGB", () => {
      const result = hslToRgb({ h: 0, s: 0, l: 100 });
      expect(result.r).toBe(255);
      expect(result.g).toBe(255);
      expect(result.b).toBe(255);
    });

    it("converts HSL black to RGB", () => {
      const result = hslToRgb({ h: 0, s: 0, l: 0 });
      expect(result.r).toBe(0);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it("handles intermediate hue values", () => {
      const result = hslToRgb({ h: 60, s: 100, l: 50 });
      expect(result.r).toBe(255);
      expect(result.g).toBe(255);
      expect(result.b).toBe(0);
    });
  });

  describe("rgbToHsb", () => {
    it("converts red to HSB", () => {
      const result = rgbToHsb({ r: 255, g: 0, b: 0 });
      expect(result.h).toBe(0);
      expect(result.s).toBe(100);
      expect(result.b).toBe(100);
    });

    it("converts white to HSB", () => {
      const result = rgbToHsb({ r: 255, g: 255, b: 255 });
      expect(result.h).toBe(0);
      expect(result.s).toBe(0);
      expect(result.b).toBe(100);
    });

    it("converts black to HSB", () => {
      const result = rgbToHsb({ r: 0, g: 0, b: 0 });
      expect(result.h).toBe(0);
      expect(result.s).toBe(0);
      expect(result.b).toBe(0);
    });

    it("converts yellow to HSB", () => {
      const result = rgbToHsb({ r: 255, g: 255, b: 0 });
      expect(result.h).toBe(60);
      expect(result.s).toBe(100);
      expect(result.b).toBe(100);
    });
  });

  describe("hsbToRgb", () => {
    it("converts HSB red to RGB", () => {
      const result = hsbToRgb({ h: 0, s: 100, b: 100 });
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it("converts HSB white to RGB", () => {
      const result = hsbToRgb({ h: 0, s: 0, b: 100 });
      expect(result.r).toBe(255);
      expect(result.g).toBe(255);
      expect(result.b).toBe(255);
    });

    it("converts HSB black to RGB", () => {
      const result = hsbToRgb({ h: 0, s: 0, b: 0 });
      expect(result.r).toBe(0);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });
  });

  describe("rgbToCmyk", () => {
    it("converts red to CMYK", () => {
      const result = rgbToCmyk({ r: 255, g: 0, b: 0 });
      expect(result.c).toBe(0);
      expect(result.m).toBe(100);
      expect(result.y).toBe(100);
      expect(result.k).toBe(0);
    });

    it("converts green to CMYK", () => {
      const result = rgbToCmyk({ r: 0, g: 255, b: 0 });
      expect(result.c).toBe(100);
      expect(result.m).toBe(0);
      expect(result.y).toBe(100);
      expect(result.k).toBe(0);
    });

    it("converts blue to CMYK", () => {
      const result = rgbToCmyk({ r: 0, g: 0, b: 255 });
      expect(result.c).toBe(100);
      expect(result.m).toBe(100);
      expect(result.y).toBe(0);
      expect(result.k).toBe(0);
    });

    it("converts white to CMYK", () => {
      const result = rgbToCmyk({ r: 255, g: 255, b: 255 });
      expect(result.c).toBe(0);
      expect(result.m).toBe(0);
      expect(result.y).toBe(0);
      expect(result.k).toBe(0);
    });

    it("converts black to CMYK", () => {
      const result = rgbToCmyk({ r: 0, g: 0, b: 0 });
      expect(result.c).toBe(0);
      expect(result.m).toBe(0);
      expect(result.y).toBe(0);
      expect(result.k).toBe(100);
    });
  });

  describe("cmykToRgb", () => {
    it("converts CMYK red to RGB", () => {
      const result = cmykToRgb({ c: 0, m: 100, y: 100, k: 0 });
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it("converts CMYK white to RGB", () => {
      const result = cmykToRgb({ c: 0, m: 0, y: 0, k: 0 });
      expect(result.r).toBe(255);
      expect(result.g).toBe(255);
      expect(result.b).toBe(255);
    });

    it("converts CMYK black to RGB", () => {
      const result = cmykToRgb({ c: 0, m: 0, y: 0, k: 100 });
      expect(result.r).toBe(0);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });
  });

  describe("rgbToLab", () => {
    it("converts red to Lab", () => {
      const result = rgbToLab({ r: 255, g: 0, b: 0 });
      expect(result.l).toBeLessThanOrEqual(54);
      expect(result.l).toBeGreaterThanOrEqual(53);
      expect(result.a).toBeLessThanOrEqual(81);
      expect(result.a).toBeGreaterThanOrEqual(79);
      expect(result.b).toBeLessThanOrEqual(68);
      expect(result.b).toBeGreaterThanOrEqual(66);
    });

    it("converts green to Lab", () => {
      const result = rgbToLab({ r: 0, g: 255, b: 0 });
      expect(result.l).toBeLessThanOrEqual(89);
      expect(result.l).toBeGreaterThanOrEqual(87);
      expect(result.a).toBeLessThanOrEqual(-85);
      expect(result.a).toBeGreaterThanOrEqual(-87);
      expect(result.b).toBeLessThanOrEqual(84);
      expect(result.b).toBeGreaterThanOrEqual(82);
    });

    it("converts blue to Lab", () => {
      const result = rgbToLab({ r: 0, g: 0, b: 255 });
      expect(result.l).toBeLessThanOrEqual(33);
      expect(result.l).toBeGreaterThanOrEqual(31);
      expect(result.a).toBeLessThanOrEqual(80);
      expect(result.a).toBeGreaterThanOrEqual(78);
      expect(result.b).toBeLessThanOrEqual(-107);
      expect(result.b).toBeGreaterThanOrEqual(-109);
    });

    it("converts white to Lab", () => {
      const result = rgbToLab({ r: 255, g: 255, b: 255 });
      expect(result.l).toBe(100);
      // Use toBeCloseTo for a and b to handle -0 vs 0
      expect(result.a).toBeCloseTo(0, 5);
      expect(result.b).toBeCloseTo(0, 5);
    });

    it("converts black to Lab", () => {
      const result = rgbToLab({ r: 0, g: 0, b: 0 });
      expect(result.l).toBe(0);
    });
  });

  describe("labToRgb", () => {
    it("converts Lab red to RGB", () => {
      const result = labToRgb({ l: 53.23, a: 80.09, b: 67.22 });
      expect(result.r).toBeCloseTo(255, 0);
      expect(result.g).toBeCloseTo(0, 0);
      expect(result.b).toBeCloseTo(0, 0);
    });

    it("converts Lab white to RGB", () => {
      const result = labToRgb({ l: 100, a: 0, b: 0 });
      expect(result.r).toBeCloseTo(255, 0);
      expect(result.g).toBeCloseTo(255, 0);
      expect(result.b).toBeCloseTo(255, 0);
    });

    it("converts Lab black to RGB", () => {
      const result = labToRgb({ l: 0, a: 0, b: 0 });
      expect(result.r).toBeCloseTo(0, 0);
      expect(result.g).toBeCloseTo(0, 0);
      expect(result.b).toBeCloseTo(0, 0);
    });
  });

  describe("round-trip conversions", () => {
    it("hex -> rgb -> hex preserves value", () => {
      const hex = "#ff8800";
      const rgb = hexToRgb(hex);
      const result = rgbToHex(rgb);
      expect(result).toBe(hex.toLowerCase());
    });

    it("rgb -> hsl -> rgb preserves value", () => {
      const rgb: RGB = { r: 123, g: 45, b: 67 };
      const hsl = rgbToHsl(rgb);
      const result = hslToRgb(hsl);
      expect(Math.abs(result.r - rgb.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(result.g - rgb.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(result.b - rgb.b)).toBeLessThanOrEqual(1);
    });

    it("rgb -> hsb -> rgb preserves value", () => {
      const rgb: RGB = { r: 123, g: 45, b: 67 };
      const hsb = rgbToHsb(rgb);
      const result = hsbToRgb(hsb);
      expect(Math.abs(result.r - rgb.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(result.g - rgb.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(result.b - rgb.b)).toBeLessThanOrEqual(1);
    });

    it("rgb -> cmyk -> rgb preserves value", () => {
      const rgb: RGB = { r: 123, g: 45, b: 67 };
      const cmyk = rgbToCmyk(rgb);
      const result = cmykToRgb(cmyk);
      expect(Math.abs(result.r - rgb.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(result.g - rgb.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(result.b - rgb.b)).toBeLessThanOrEqual(1);
    });

    it("rgb -> lab -> rgb preserves value", () => {
      const rgb: RGB = { r: 123, g: 45, b: 67 };
      const lab = rgbToLab(rgb);
      const result = labToRgb(lab);
      expect(Math.abs(result.r - rgb.r)).toBeLessThanOrEqual(2);
      expect(Math.abs(result.g - rgb.g)).toBeLessThanOrEqual(2);
      expect(Math.abs(result.b - rgb.b)).toBeLessThanOrEqual(2);
    });
  });

  describe("edge cases", () => {
    it("handles zero values", () => {
      const result = hexToRgb("#000000");
      expect(result.r).toBe(0);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it("handles maximum values", () => {
      const result = hexToRgb("#ffffff");
      expect(result.r).toBe(255);
      expect(result.g).toBe(255);
      expect(result.b).toBe(255);
    });

    it("handles invalid hex gracefully", () => {
      const result = hexToRgb("not-a-color");
      // Invalid hex returns NaN for components, which are converted to 0
      expect(result.r).toBeLessThanOrEqual(255);
      expect(result.g).toBeLessThanOrEqual(255);
      expect(result.b).toBeLessThanOrEqual(255);
      // All values should be valid numbers
      expect(typeof result.r).toBe("number");
      expect(typeof result.g).toBe("number");
      expect(typeof result.b).toBe("number");
    });

    it("handles partial hex gracefully", () => {
      const result = hexToRgb("#");
      expect(result.r).toBe(0);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });
  });
});
