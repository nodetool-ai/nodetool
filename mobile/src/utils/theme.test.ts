import { paletteDark, paletteLight, Theme, ThemeColors } from './theme';

describe('theme', () => {
  describe('paletteDark', () => {
    it('has all required color properties', () => {
      expect(paletteDark).toHaveProperty('background');
      expect(paletteDark).toHaveProperty('surface');
      expect(paletteDark).toHaveProperty('surfaceHeader');
      expect(paletteDark).toHaveProperty('primary');
      expect(paletteDark).toHaveProperty('text');
      expect(paletteDark).toHaveProperty('textSecondary');
      expect(paletteDark).toHaveProperty('border');
      expect(paletteDark).toHaveProperty('error');
      expect(paletteDark).toHaveProperty('success');
      expect(paletteDark).toHaveProperty('warning');
      expect(paletteDark).toHaveProperty('info');
      expect(paletteDark).toHaveProperty('inputBg');
      expect(paletteDark).toHaveProperty('cardBg');
    });

    it('has dark background color', () => {
      expect(paletteDark.background).toBe('#141414');
    });

    it('has white text color', () => {
      expect(paletteDark.text).toBe('#FFFFFF');
    });

    it('all colors are strings', () => {
      Object.values(paletteDark).forEach((color) => {
        expect(typeof color).toBe('string');
      });
    });

    it('colors are valid hex or rgba values', () => {
      const hexOrRgbaRegex = /^(#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}|rgba?\([^)]+\))$/;
      Object.values(paletteDark).forEach((color) => {
        expect(color).toMatch(hexOrRgbaRegex);
      });
    });
  });

  describe('paletteLight', () => {
    it('has all required color properties', () => {
      expect(paletteLight).toHaveProperty('background');
      expect(paletteLight).toHaveProperty('surface');
      expect(paletteLight).toHaveProperty('surfaceHeader');
      expect(paletteLight).toHaveProperty('primary');
      expect(paletteLight).toHaveProperty('text');
      expect(paletteLight).toHaveProperty('textSecondary');
      expect(paletteLight).toHaveProperty('border');
      expect(paletteLight).toHaveProperty('error');
      expect(paletteLight).toHaveProperty('success');
      expect(paletteLight).toHaveProperty('warning');
      expect(paletteLight).toHaveProperty('info');
      expect(paletteLight).toHaveProperty('inputBg');
      expect(paletteLight).toHaveProperty('cardBg');
    });

    it('has light background color', () => {
      expect(paletteLight.background).toBe('#FAF7F2');
    });

    it('has dark text color', () => {
      expect(paletteLight.text).toBe('#2A2A2A');
    });

    it('all colors are strings', () => {
      Object.values(paletteLight).forEach((color) => {
        expect(typeof color).toBe('string');
      });
    });

    it('colors are valid hex values', () => {
      const hexRegex = /^#[0-9A-Fa-f]{6}$/;
      Object.values(paletteLight).forEach((color) => {
        expect(color).toMatch(hexRegex);
      });
    });
  });

  describe('Theme', () => {
    it('has spacing values', () => {
      expect(Theme.spacing).toBeDefined();
      expect(Theme.spacing.xs).toBe(4);
      expect(Theme.spacing.sm).toBe(8);
      expect(Theme.spacing.md).toBe(16);
      expect(Theme.spacing.lg).toBe(24);
      expect(Theme.spacing.xl).toBe(32);
    });

    it('has borderRadius values', () => {
      expect(Theme.borderRadius).toBeDefined();
      expect(Theme.borderRadius.sm).toBe(4);
      expect(Theme.borderRadius.md).toBe(8);
      expect(Theme.borderRadius.lg).toBe(12);
      expect(Theme.borderRadius.xl).toBe(16);
    });

    it('spacing values are in ascending order', () => {
      const { xs, sm, md, lg, xl } = Theme.spacing;
      expect(xs).toBeLessThan(sm);
      expect(sm).toBeLessThan(md);
      expect(md).toBeLessThan(lg);
      expect(lg).toBeLessThan(xl);
    });

    it('borderRadius values are in ascending order', () => {
      const { sm, md, lg, xl } = Theme.borderRadius;
      expect(sm).toBeLessThan(md);
      expect(md).toBeLessThan(lg);
      expect(lg).toBeLessThan(xl);
    });

    it('all spacing values are numbers', () => {
      Object.values(Theme.spacing).forEach((value) => {
        expect(typeof value).toBe('number');
      });
    });

    it('all borderRadius values are numbers', () => {
      Object.values(Theme.borderRadius).forEach((value) => {
        expect(typeof value).toBe('number');
      });
    });
  });

  describe('ThemeColors type consistency', () => {
    it('paletteDark matches ThemeColors type structure', () => {
      const keys: (keyof ThemeColors)[] = [
        'background',
        'surface',
        'surfaceHeader',
        'primary',
        'text',
        'textSecondary',
        'border',
        'error',
        'success',
        'warning',
        'info',
        'inputBg',
        'cardBg',
      ];
      
      keys.forEach((key) => {
        expect(paletteDark).toHaveProperty(key);
        expect(typeof paletteDark[key]).toBe('string');
      });
    });

    it('paletteLight matches ThemeColors type structure', () => {
      const keys: (keyof ThemeColors)[] = [
        'background',
        'surface',
        'surfaceHeader',
        'primary',
        'text',
        'textSecondary',
        'border',
        'error',
        'success',
        'warning',
        'info',
        'inputBg',
        'cardBg',
      ];
      
      keys.forEach((key) => {
        expect(paletteLight).toHaveProperty(key);
        expect(typeof paletteLight[key]).toBe('string');
      });
    });

    it('both palettes have the same keys', () => {
      const darkKeys = Object.keys(paletteDark).sort();
      const lightKeys = Object.keys(paletteLight).sort();
      expect(darkKeys).toEqual(lightKeys);
    });
  });
});
