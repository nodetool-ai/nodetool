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
} from './colorConversion';

describe('Color Conversion Utilities', () => {
  describe('hexToRgb', () => {
    it('converts 6-digit hex to RGB', () => {
      expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it('converts 3-digit shorthand hex to RGB', () => {
      expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it('converts 8-digit hex with alpha to RGBA', () => {
      const result = hexToRgb('#ff000080');
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
      expect(result.a).toBeCloseTo(0.5, 1);
    });

    it('converts 4-digit shorthand hex with alpha to RGBA', () => {
      const result = hexToRgb('#f008');
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
      expect(result.a).toBeGreaterThan(0.5);
    });

    it('handles hex without hash prefix', () => {
      expect(hexToRgb('00ff00')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    });

    it('handles white color', () => {
      expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    });

    it('handles black color', () => {
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it('handles invalid hex gracefully', () => {
      const result = hexToRgb('#gg00ff');
      expect(result.r).toBe(0);
      expect(result.b).toBe(255);
    });
  });

  describe('rgbToHex', () => {
    it('converts RGB to 6-digit hex', () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe('#ff0000');
    });

    it('includes alpha when alpha is less than 1', () => {
      const result = rgbToHex({ r: 255, g: 0, b: 0, a: 0.5 }, true);
      expect(result).toMatch(/^#ff0000[0-9a-f]{2}$/i);
    });

    it('clamps values outside 0-255 range', () => {
      expect(rgbToHex({ r: 300, g: -10, b: 128 })).toBe('#ff0080');
    });

    it('handles white', () => {
      expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe('#ffffff');
    });

    it('handles black', () => {
      expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
    });
  });

  describe('rgbToHsl and hslToRgb', () => {
    it('converts red to HSL', () => {
      const hsl = rgbToHsl({ r: 255, g: 0, b: 0 });
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    it('converts green to HSL', () => {
      const hsl = rgbToHsl({ r: 0, g: 255, b: 0 });
      expect(hsl.h).toBe(120);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    it('converts blue to HSL', () => {
      const hsl = rgbToHsl({ r: 0, g: 0, b: 255 });
      expect(hsl.h).toBe(240);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    it('converts white to HSL', () => {
      const hsl = rgbToHsl({ r: 255, g: 255, b: 255 });
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(0);
      expect(hsl.l).toBe(100);
    });

    it('converts black to HSL', () => {
      const hsl = rgbToHsl({ r: 0, g: 0, b: 0 });
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(0);
      expect(hsl.l).toBe(0);
    });

    it('converts gray to HSL', () => {
      const hsl = rgbToHsl({ r: 128, g: 128, b: 128 });
      expect(hsl.s).toBe(0);
      expect(hsl.l).toBe(50);
    });

    it('converts HSL to RGB correctly', () => {
      const rgb = hslToRgb({ h: 0, s: 100, l: 50 });
      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(0);
    });

    it('preserves alpha in hslToRgb', () => {
      const rgb = hslToRgb({ h: 0, s: 100, l: 50, a: 0.5 });
      expect(rgb.a).toBe(0.5);
    });
  });

  describe('rgbToHsb and hsbToRgb', () => {
    it('converts red to HSB', () => {
      const hsb = rgbToHsb({ r: 255, g: 0, b: 0 });
      expect(hsb.h).toBe(0);
      expect(hsb.s).toBe(100);
      expect(hsb.b).toBe(100);
    });

    it('converts white to HSB', () => {
      const hsb = rgbToHsb({ r: 255, g: 255, b: 255 });
      expect(hsb.h).toBe(0);
      expect(hsb.s).toBe(0);
      expect(hsb.b).toBe(100);
    });

    it('converts black to HSB', () => {
      const hsb = rgbToHsb({ r: 0, g: 0, b: 0 });
      expect(hsb.h).toBe(0);
      expect(hsb.s).toBe(0);
      expect(hsb.b).toBe(0);
    });

    it('converts HSB to RGB correctly', () => {
      const rgb = hsbToRgb({ h: 240, s: 100, b: 100 });
      expect(rgb.r).toBe(0);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(255);
    });

    it('preserves alpha in hsbToRgb', () => {
      const rgb = hsbToRgb({ h: 0, s: 100, b: 100, a: 0.75 });
      expect(rgb.a).toBe(0.75);
    });
  });

  describe('rgbToCmyk and cmykToRgb', () => {
    it('converts pure red to CMYK', () => {
      const cmyk = rgbToCmyk({ r: 255, g: 0, b: 0 });
      expect(cmyk.c).toBe(0);
      expect(cmyk.m).toBe(100);
      expect(cmyk.y).toBe(100);
      expect(cmyk.k).toBe(0);
    });

    it('converts pure white to CMYK', () => {
      const cmyk = rgbToCmyk({ r: 255, g: 255, b: 255 });
      expect(cmyk.c).toBe(0);
      expect(cmyk.m).toBe(0);
      expect(cmyk.y).toBe(0);
      expect(cmyk.k).toBe(0);
    });

    it('converts pure black to CMYK', () => {
      const cmyk = rgbToCmyk({ r: 0, g: 0, b: 0 });
      expect(cmyk.c).toBe(0);
      expect(cmyk.m).toBe(0);
      expect(cmyk.y).toBe(0);
      expect(cmyk.k).toBe(100);
    });

    it('converts CMYK to RGB correctly', () => {
      const rgb = cmykToRgb({ c: 0, m: 100, y: 100, k: 0 });
      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(0);
    });
  });

  describe('rgbToLab and labToRgb', () => {
    it('converts white to LAB', () => {
      const lab = rgbToLab({ r: 255, g: 255, b: 255 });
      expect(lab.l).toBe(100);
    });

    it('converts black to LAB', () => {
      const lab = rgbToLab({ r: 0, g: 0, b: 0 });
      expect(lab.l).toBe(0);
    });

    it('converts red to LAB with positive a', () => {
      const lab = rgbToLab({ r: 255, g: 0, b: 0 });
      expect(lab.a).toBeGreaterThan(0);
    });

    it('converts blue to LAB with negative b', () => {
      const lab = rgbToLab({ r: 0, g: 0, b: 255 });
      expect(lab.a).toBeDefined();
      expect(lab.b).toBeLessThan(0);
    });

    it('converts LAB to RGB correctly', () => {
      const rgb = labToRgb({ l: 50, a: 0, b: 0 });
      expect(rgb.r).toBeCloseTo(119, 0);
      expect(rgb.g).toBeCloseTo(119, 0);
      expect(rgb.b).toBeCloseTo(119, 0);
    });
  });

  describe('parseColor', () => {
    it('parses hex color', () => {
      const result = parseColor('#ff0000');
      expect(result).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it('parses rgb() color', () => {
      const result = parseColor('rgb(255, 0, 0)');
      expect(result).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it('parses rgba() color', () => {
      const result = parseColor('rgba(255, 0, 0, 0.5)');
      expect(result).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    });

    it('parses hsl() color', () => {
      const result = parseColor('hsl(0, 100%, 50%)');
      expect(result).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it('parses hsla() color', () => {
      const result = parseColor('hsla(0, 100%, 50%, 0.5)');
      expect(result).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    });

    it('parses named colors', () => {
      expect(parseColor('red')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(parseColor('blue')).toEqual({ r: 0, g: 0, b: 255, a: 1 });
      expect(parseColor('green')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
      expect(parseColor('white')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
      expect(parseColor('black')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it('handles gray/grey spelling', () => {
      expect(parseColor('gray')).toEqual(parseColor('grey'));
    });

    it('returns null for invalid color', () => {
      expect(parseColor('notacolor')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseColor('')).toBeNull();
    });

    it('returns null for null/undefined', () => {
      expect(parseColor(null as any)).toBeNull();
      expect(parseColor(undefined as any)).toBeNull();
    });
  });

  describe('hexToAllFormats', () => {
    it('converts hex to all color formats', () => {
      const result = hexToAllFormats('#ff0000');
      expect(result.hex).toBe('#ff0000');
      expect(result.rgb).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(result.hsl).toEqual({ h: 0, s: 100, l: 50, a: 1 });
      expect(result.hsb).toEqual({ h: 0, s: 100, b: 100, a: 1 });
      expect(result.cmyk).toEqual({ c: 0, m: 100, y: 100, k: 0 });
      expect(result.lab).toBeDefined();
    });
  });

  describe('getLuminance', () => {
    it('calculates luminance for white', () => {
      const lum = getLuminance({ r: 255, g: 255, b: 255 });
      expect(lum).toBe(1);
    });

    it('calculates luminance for black', () => {
      const lum = getLuminance({ r: 0, g: 0, b: 0 });
      expect(lum).toBe(0);
    });

    it('calculates luminance for mid-gray', () => {
      const lum = getLuminance({ r: 128, g: 128, b: 128 });
      expect(lum).toBeCloseTo(0.215, 2);
    });
  });

  describe('getContrastRatio', () => {
    it('calculates contrast ratio between black and white', () => {
      const ratio = getContrastRatio(
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 }
      );
      expect(ratio).toBe(21);
    });

    it('calculates contrast ratio between same colors', () => {
      const ratio = getContrastRatio(
        { r: 128, g: 128, b: 128 },
        { r: 128, g: 128, b: 128 }
      );
      expect(ratio).toBe(1);
    });
  });

  describe('getWcagCompliance', () => {
    it('returns AA compliance for high contrast', () => {
      const result = getWcagCompliance(
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 }
      );
      expect(result.aa).toBe(true);
      expect(result.aaa).toBe(true);
      expect(result.ratio).toBe(21);
    });

    it('returns no compliance for low contrast', () => {
      const result = getWcagCompliance(
        { r: 128, g: 128, b: 128 },
        { r: 130, g: 130, b: 130 }
      );
      expect(result.aa).toBe(false);
      expect(result.aaLarge).toBe(false);
    });
  });

  describe('rgbToCss', () => {
    it('formats RGB as CSS rgb()', () => {
      expect(rgbToCss({ r: 255, g: 0, b: 0 })).toBe('rgb(255, 0, 0)');
    });

    it('formats RGBA as CSS rgba() when alpha < 1', () => {
      expect(rgbToCss({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('rgba(255, 0, 0, 0.5)');
    });
  });

  describe('hslToCss', () => {
    it('formats HSL as CSS hsl()', () => {
      expect(hslToCss({ h: 0, s: 100, l: 50 })).toBe('hsl(0, 100%, 50%)');
    });

    it('formats HSLA as CSS hsla() when alpha < 1', () => {
      expect(hslToCss({ h: 0, s: 100, l: 50, a: 0.5 })).toBe('hsla(0, 100%, 50%, 0.5)');
    });
  });

  describe('simulateColorBlindness', () => {
    it('returns modified RGB for protanopia', () => {
      const original: RGB = { r: 255, g: 0, b: 0 };
      const result = simulateColorBlindness(original, 'protanopia');
      expect(result.r).toBeGreaterThan(0);
      expect(result.g).toBeGreaterThan(0);
    });

    it('preserves alpha channel', () => {
      const original: RGB = { r: 255, g: 0, b: 0, a: 0.5 };
      const result = simulateColorBlindness(original, 'protanopia');
      expect(result.a).toBe(0.5);
    });
  });

  describe('isLightColor', () => {
    it('identifies white as light', () => {
      expect(isLightColor({ r: 255, g: 255, b: 255 })).toBe(true);
    });

    it('identifies black as dark', () => {
      expect(isLightColor({ r: 0, g: 0, b: 0 })).toBe(false);
    });

    it('identifies mid-gray as light', () => {
      expect(isLightColor({ r: 128, g: 128, b: 128 })).toBe(true);
    });
  });

  describe('getContrastingTextColor', () => {
    it('returns black for light backgrounds', () => {
      expect(getContrastingTextColor({ r: 255, g: 255, b: 255 })).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('returns white for dark backgrounds', () => {
      expect(getContrastingTextColor({ r: 0, g: 0, b: 0 })).toEqual({ r: 255, g: 255, b: 255 });
    });
  });

  describe('Edge Cases', () => {
    it('handles maximum values', () => {
      const rgb: RGB = { r: 255, g: 255, b: 255, a: 1 };
      expect(rgbToHex(rgb)).toBe('#ffffff');
      expect(rgbToHsl(rgb).l).toBe(100);
      expect(rgbToHsb(rgb).b).toBe(100);
      expect(rgbToCmyk(rgb).k).toBe(0);
    });

    it('handles minimum values', () => {
      const rgb: RGB = { r: 0, g: 0, b: 0, a: 1 };
      expect(rgbToHex(rgb)).toBe('#000000');
      expect(rgbToHsl(rgb).l).toBe(0);
      expect(rgbToHsb(rgb).b).toBe(0);
      expect(rgbToCmyk(rgb).k).toBe(100);
    });
  });
});
