import { paletteDark, paletteLight, ThemeColors } from './theme';

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

    it('colors are valid hex or rgba values', () => {
      const hexOrRgbaRegex = /^(#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}|rgba?\([^)]+\))$/;
      Object.values(paletteLight).forEach((color) => {
        expect(color).toMatch(hexOrRgbaRegex);
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
        'primaryMuted',
        'text',
        'textSecondary',
        'textOnPrimary',
        'border',
        'error',
        'success',
        'warning',
        'info',
        'inputBg',
        'cardBg',
        'userBubbleBg',
        'userBubbleText',
        'assistantBubbleBg',
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
        'primaryMuted',
        'text',
        'textSecondary',
        'textOnPrimary',
        'border',
        'error',
        'success',
        'warning',
        'info',
        'inputBg',
        'cardBg',
        'userBubbleBg',
        'userBubbleText',
        'assistantBubbleBg',
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
