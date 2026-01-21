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
  hexToHsl,
  hexToHsb,
} from "../colorConversion";

describe("colorConversion", () => {
  describe("hexToRgb", () => {
    it("converts 6-digit hex to RGB", () => {
      expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(hexToRgb("#00ff00")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
      expect(hexToRgb("#0000ff")).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    });

    it("converts 3-digit shorthand hex to RGB", () => {
      expect(hexToRgb("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(hexToRgb("#0f0")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
      expect(hexToRgb("#00f")).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    });

    it("handles hex with alpha", () => {
      expect(hexToRgb("#ff000080")).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
      expect(hexToRgb("#0000ff40")).toEqual({ r: 0, g: 0, b: 255, a: 0.25 });
    });

    it("handles white and black", () => {
      expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
      expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it("handles gray colors", () => {
      expect(hexToRgb("#808080")).toEqual({ r: 128, g: 128, b: 128, a: 1 });
      expect(hexToRgb("#ccc")).toEqual({ r: 204, g: 204, b: 204, a: 1 });
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
      expect(rgbToHex({ r: 0, g: 0, b: 255, a: 1 }, true)).toBe("#0000ffff");
    });

    it("clamps out-of-range values", () => {
      expect(rgbToHex({ r: 300, g: -10, b: 256 })).toBe("#ff0000");
    });
  });

  describe("rgbToHsl and hslToRgb", () => {
    it("converts red to HSL and back", () => {
      const hsl = rgbToHsl({ r: 255, g: 0, b: 0 });
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
      
      const rgb = hslToRgb(hsl);
      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(0);
    });

    it("converts green to HSL and back", () => {
      const hsl = rgbToHsl({ r: 0, g: 255, b: 0 });
      expect(hsl.h).toBe(120);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    it("converts blue to HSL and back", () => {
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

    it("converts black to HSL", () => {
      const hsl = rgbToHsl({ r: 0, g: 0, b: 0 });
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(0);
      expect(hsl.l).toBe(0);
    });

    it("converts gray to HSL", () => {
      const hsl = rgbToHsl({ r: 128, g: 128, b: 128 });
      expect(hsl.s).toBe(0);
      expect(hsl.l).toBe(50);
    });
  });

  describe("rgbToHsb and hsbToRgb", () => {
    it("converts red to HSB and back", () => {
      const hsb = rgbToHsb({ r: 255, g: 0, b: 0 });
      expect(hsb.h).toBe(0);
      expect(hsb.s).toBe(100);
      expect(hsb.b).toBe(100);
    });

    it("converts white to HSB", () => {
      const hsb = rgbToHsb({ r: 255, g: 255, b: 255 });
      expect(hsb.h).toBe(0);
      expect(hsb.s).toBe(0);
      expect(hsb.b).toBe(100);
    });

    it("converts black to HSB", () => {
      const hsb = rgbToHsb({ r: 0, g: 0, b: 0 });
      expect(hsb.h).toBe(0);
      expect(hsb.s).toBe(0);
      expect(hsb.b).toBe(0);
    });
  });

  describe("rgbToCmyk and cmykToRgb", () => {
    it("converts red to CMYK and back", () => {
      const cmyk = rgbToCmyk({ r: 255, g: 0, b: 0 });
      expect(cmyk.c).toBe(0);
      expect(cmyk.m).toBe(100);
      expect(cmyk.y).toBe(100);
      expect(cmyk.k).toBe(0);
    });

    it("converts cyan to CMYK", () => {
      const cmyk = rgbToCmyk({ r: 0, g: 255, b: 255 });
      expect(cmyk.c).toBe(100);
      expect(cmyk.m).toBe(0);
      expect(cmyk.y).toBe(0);
      expect(cmyk.k).toBe(0);
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
      expect(cmyk.c).toBe(0);
      expect(cmyk.m).toBe(0);
      expect(cmyk.y).toBe(0);
      expect(cmyk.k).toBe(100);
    });
  });

  describe("rgbToLab and labToRgb", () => {
    it("converts red to LAB", () => {
      const lab = rgbToLab({ r: 255, g: 0, b: 0 });
      expect(lab.l).toBeCloseTo(53.2, 0);
      expect(lab.a).toBeCloseTo(80.1, 0);
      expect(lab.b).toBeCloseTo(67.2, 0);
    });

    it("converts green to LAB", () => {
      const lab = rgbToLab({ r: 0, g: 255, b: 0 });
      expect(lab.l).toBeCloseTo(87.7, 0);
      expect(lab.a).toBeCloseTo(-86.2, 0);
      expect(lab.b).toBeCloseTo(83.2, 0);
    });

    it("converts blue to LAB", () => {
      const lab = rgbToLab({ r: 0, g: 0, b: 255 });
      expect(lab.l).toBeCloseTo(32.3, 0);
      expect(lab.a).toBeCloseTo(79.2, 0);
      expect(lab.b).toBeCloseTo(-107.9, 0);
    });

    it("converts white to LAB", () => {
      const lab = rgbToLab({ r: 255, g: 255, b: 255 });
      expect(lab.l).toBeCloseTo(100, 0);
      expect(lab.a).toBeCloseTo(0, 0);
      expect(lab.b).toBeCloseTo(0, 0);
    });
  });

  describe("hexToHsl and hexToHsb", () => {
    it("converts hex to HSL", () => {
      const hsl = hexToHsl("#ff0000");
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    it("converts hex to HSB", () => {
      const hsb = hexToHsb("#ff0000");
      expect(hsb.h).toBe(0);
      expect(hsb.s).toBe(100);
      expect(hsb.b).toBe(100);
    });
  });
});
