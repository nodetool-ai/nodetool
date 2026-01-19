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
  type RGB,
  type HSL,
  type HSB,
  type CMYK,
  type LAB
} from '../colorConversion';

describe('colorConversion', () => {
  describe('hexToRgb', () => {
    it('parses 6-digit hex', () => {
      expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it('parses 3-digit hex', () => {
      expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it('parses 8-digit hex with alpha', () => {
      expect(hexToRgb('#ff000080')).toEqual({ r: 255, g: 0, b: 0, a: 128/255 });
    });

    it('parses 4-digit hex with alpha', () => {
      expect(hexToRgb('#f008')).toEqual({ r: 255, g: 0, b: 0, a: 136/255 });
    });

    it('parses hex without #', () => {
      expect(hexToRgb('00ff00')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    });

    it('handles uppercase hex', () => {
      expect(hexToRgb('#FF0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it('handles white', () => {
      expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    });

    it('handles black', () => {
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it('handles invalid hex gracefully', () => {
      expect(hexToRgb('#gggggg')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });
  });

  describe('rgbToHex', () => {
    it('converts RGB to hex', () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe('#ff0000');
    });

    it('converts with lowercase hex', () => {
      expect(rgbToHex({ r: 10, g: 20, b: 30 })).toBe('#0a141e');
    });

    it('includes alpha when requested and present', () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0, a: 0.5 }, true)).toBe('#ff000080');
    });

    it('does not include alpha when 1', () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0, a: 1 }, true)).toBe('#ff0000');
    });

    it('clamps values out of range', () => {
      expect(rgbToHex({ r: 300, g: -10, b: 256 })).toBe('#ff00ff');
    });
  });

  describe('rgbToHsl and hslToRgb', () => {
    it('converts red to HSL', () => {
      const result = rgbToHsl({ r: 255, g: 0, b: 0 });
      expect(result.h).toBe(0);
      expect(result.s).toBe(100);
      expect(result.l).toBe(50);
    });

    it('converts green to HSL', () => {
      const result = rgbToHsl({ r: 0, g: 255, b: 0 });
      expect(result.h).toBe(120);
      expect(result.s).toBe(100);
      expect(result.l).toBe(50);
    });

    it('converts blue to HSL', () => {
      const result = rgbToHsl({ r: 0, g: 0, b: 255 });
      expect(result.h).toBe(240);
      expect(result.s).toBe(100);
      expect(result.l).toBe(50);
    });

    it('converts white to HSL', () => {
      const result = rgbToHsl({ r: 255, g: 255, b: 255 });
      expect(result.h).toBe(0);
      expect(result.s).toBe(0);
      expect(result.l).toBe(100);
    });

    it('converts black to HSL', () => {
      const result = rgbToHsl({ r: 0, g: 0, b: 0 });
      expect(result.h).toBe(0);
      expect(result.s).toBe(0);
      expect(result.l).toBe(0);
    });

    it('converts HSL to RGB', () => {
      const hsl: HSL = { h: 0, s: 100, l: 50 };
      const result = hslToRgb(hsl);
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it('roundtrips color values approximately', () => {
      const original: RGB = { r: 128, g: 64, b: 200 };
      const hsl = rgbToHsl(original);
      const result = hslToRgb(hsl);
      // Allow 1-2 unit tolerance due to rounding
      expect(result.r).toBeGreaterThanOrEqual(original.r - 2);
      expect(result.r).toBeLessThanOrEqual(original.r + 2);
      expect(result.g).toBeGreaterThanOrEqual(original.g - 2);
      expect(result.g).toBeLessThanOrEqual(original.g + 2);
      expect(result.b).toBeGreaterThanOrEqual(original.b - 2);
      expect(result.b).toBeLessThanOrEqual(original.b + 2);
    });
  });

  describe('rgbToHsb and hsbToRgb', () => {
    it('converts red to HSB', () => {
      const result = rgbToHsb({ r: 255, g: 0, b: 0 });
      expect(result.h).toBe(0);
      expect(result.s).toBe(100);
      expect(result.b).toBe(100);
    });

    it('converts HSB to RGB', () => {
      const hsb: HSB = { h: 0, s: 100, b: 100 };
      const result = hsbToRgb(hsb);
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it('roundtrips color values approximately', () => {
      const original: RGB = { r: 100, g: 150, b: 200 };
      const hsb = rgbToHsb(original);
      const result = hsbToRgb(hsb);
      // Allow 1-2 unit tolerance due to rounding
      expect(result.r).toBeGreaterThanOrEqual(original.r - 2);
      expect(result.r).toBeLessThanOrEqual(original.r + 2);
      expect(result.g).toBeGreaterThanOrEqual(original.g - 2);
      expect(result.g).toBeLessThanOrEqual(original.g + 2);
      expect(result.b).toBeGreaterThanOrEqual(original.b - 2);
      expect(result.b).toBeLessThanOrEqual(original.b + 2);
    });
  });

  describe('rgbToCmyk and cmykToRgb', () => {
    it('converts black to CMYK', () => {
      expect(rgbToCmyk({ r: 0, g: 0, b: 0 })).toEqual({ c: 0, m: 0, y: 0, k: 100 });
    });

    it('converts white to CMYK', () => {
      expect(rgbToCmyk({ r: 255, g: 255, b: 255 })).toEqual({ c: 0, m: 0, y: 0, k: 0 });
    });

    it('converts red to CMYK', () => {
      expect(rgbToCmyk({ r: 255, g: 0, b: 0 })).toEqual({ c: 0, m: 100, y: 100, k: 0 });
    });

    it('converts CMYK to RGB', () => {
      const cmyk: CMYK = { c: 0, m: 100, y: 100, k: 0 };
      expect(cmykToRgb(cmyk)).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('roundtrips color values approximately', () => {
      const original: RGB = { r: 100, g: 150, b: 200 };
      const cmyk = rgbToCmyk(original);
      const result = cmykToRgb(cmyk);
      // Allow 1-2 unit tolerance due to rounding
      expect(result.r).toBeGreaterThanOrEqual(original.r - 2);
      expect(result.r).toBeLessThanOrEqual(original.r + 2);
      expect(result.g).toBeGreaterThanOrEqual(original.g - 2);
      expect(result.g).toBeLessThanOrEqual(original.g + 2);
      expect(result.b).toBeGreaterThanOrEqual(original.b - 2);
      expect(result.b).toBeLessThanOrEqual(original.b + 2);
    });
  });

  describe('rgbToLab and labToRgb', () => {
    it('converts white to LAB', () => {
      const lab = rgbToLab({ r: 255, g: 255, b: 255 });
      expect(lab.l).toBeGreaterThan(90);
    });

    it('converts black to LAB', () => {
      const lab = rgbToLab({ r: 0, g: 0, b: 0 });
      expect(lab.l).toBe(0);
    });

    it('converts LAB to RGB for white', () => {
      const lab: LAB = { l: 100, a: 0, b: 0 };
      const rgb = labToRgb(lab);
      expect(rgb.r).toBeGreaterThan(250);
      expect(rgb.g).toBeGreaterThan(250);
      expect(rgb.b).toBeGreaterThan(250);
    });

    it('roundtrips color values approximately', () => {
      const original: RGB = { r: 128, g: 128, b: 128 };
      const lab = rgbToLab(original);
      const result = labToRgb(lab);
      // Allow larger tolerance for LAB conversion
      expect(result.r).toBeGreaterThanOrEqual(original.r - 10);
      expect(result.r).toBeLessThanOrEqual(original.r + 10);
      expect(result.g).toBeGreaterThanOrEqual(original.g - 10);
      expect(result.g).toBeLessThanOrEqual(original.g + 10);
      expect(result.b).toBeGreaterThanOrEqual(original.b - 10);
      expect(result.b).toBeLessThanOrEqual(original.b + 10);
    });
  });

  describe('parseColor', () => {
    it('parses hex color', () => {
      expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it('parses rgb() color', () => {
      expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it('parses rgba() color', () => {
      expect(parseColor('rgba(255, 0, 0, 0.5)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    });

    it('parses hsl() color', () => {
      expect(parseColor('hsl(0, 100%, 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it('parses named colors', () => {
      expect(parseColor('red')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(parseColor('white')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
      expect(parseColor('black')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it('returns null for invalid color', () => {
      expect(parseColor('notacolor')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseColor('')).toBeNull();
    });
  });

  describe('hexToAllFormats', () => {
    it('converts hex to all formats', () => {
      const result = hexToAllFormats('#ff0000');
      
      expect(result.hex).toBe('#ff0000');
      expect(result.rgb).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(result.cmyk).toEqual({ c: 0, m: 100, y: 100, k: 0 });
    });
  });

  describe('getLuminance', () => {
    it('returns 0 for black', () => {
      expect(getLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    });

    it('returns approximately 1 for white', () => {
      expect(getLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 1);
    });
  });

  describe('getContrastRatio', () => {
    it('returns high value for black and white', () => {
      const ratio = getContrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
      expect(ratio).toBeGreaterThan(10);
    });

    it('returns 1 for same colors', () => {
      const gray: RGB = { r: 128, g: 128, b: 128 };
      expect(getContrastRatio(gray, gray)).toBe(1);
    });
  });

  describe('getWcagCompliance', () => {
    it('identifies AA compliance for black on white', () => {
      const result = getWcagCompliance({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
      expect(result.aa).toBe(true);
      expect(result.aaa).toBe(true);
    });

    it('identifies AA Large compliance threshold', () => {
      const result = getWcagCompliance({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
      expect(result.aaLarge).toBe(true);
      expect(result.aaaLarge).toBe(true);
    });
  });

  describe('rgbToCss and hslToCss', () => {
    it('converts RGB to CSS', () => {
      expect(rgbToCss({ r: 255, g: 0, b: 0 })).toBe('rgb(255, 0, 0)');
    });

    it('converts RGBA to CSS', () => {
      expect(rgbToCss({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('rgba(255, 0, 0, 0.5)');
    });

    it('converts HSL to CSS', () => {
      expect(hslToCss({ h: 0, s: 100, l: 50 })).toBe('hsl(0, 100%, 50%)');
    });

    it('converts HSLA to CSS', () => {
      expect(hslToCss({ h: 0, s: 100, l: 50, a: 0.5 })).toBe('hsla(0, 100%, 50%, 0.5)');
    });
  });

  describe('simulateColorBlindness', () => {
    it('simulates protanopia', () => {
      const red: RGB = { r: 255, g: 0, b: 0 };
      const result = simulateColorBlindness(red, 'protanopia');
      expect(result.r).toBeLessThan(255);
    });

    it('simulates deuteranopia', () => {
      const red: RGB = { r: 255, g: 0, b: 0 };
      const result = simulateColorBlindness(red, 'deuteranopia');
      expect(result.r).toBeLessThan(255);
    });

    it('simulates tritanopia', () => {
      const blue: RGB = { r: 0, g: 0, b: 255 };
      const result = simulateColorBlindness(blue, 'tritanopia');
      expect(result.b).toBeLessThan(255);
    });
  });

  describe('isLightColor and getContrastingTextColor', () => {
    it('identifies white as light color', () => {
      expect(isLightColor({ r: 255, g: 255, b: 255 })).toBe(true);
    });

    it('identifies black as dark color', () => {
      expect(isLightColor({ r: 0, g: 0, b: 0 })).toBe(false);
    });

    it('returns black text for light backgrounds', () => {
      expect(getContrastingTextColor({ r: 255, g: 255, b: 255 })).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('returns white text for dark backgrounds', () => {
      expect(getContrastingTextColor({ r: 0, g: 0, b: 0 })).toEqual({ r: 255, g: 255, b: 255 });
    });
  });
});
