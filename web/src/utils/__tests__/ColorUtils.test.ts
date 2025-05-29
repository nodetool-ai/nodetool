jest.mock('chroma-js', () => {
  const actual = jest.requireActual('chroma-js');
  return { __esModule: true, default: actual };
});

import {
  hexToRgba,
  darkenHexColor,
  lightenHexColor,
  adjustSaturation,
  adjustHue,
  adjustLightness,
  createLinearGradient,
  simulateOpacity,
} from '../ColorUtils';

describe('ColorUtils', () => {
  it('converts hex to rgba', () => {
    expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    expect(hexToRgba('#00ff00', 1)).toBe('rgba(0, 255, 0, 1)');
  });

  it('darkens and lightens colors', () => {
    expect(darkenHexColor('#ff0000', 20)).toBe('#f30000');
    expect(lightenHexColor('#ff0000', 20)).toBe('#ff200d');
  });

  it('adjusts saturation, hue and lightness', () => {
    expect(adjustSaturation('#ff8080', 50)).toBe('#ff6060');
    expect(adjustHue('#ff0000', 180)).toBe('#00ffff');
    expect(adjustLightness('#ff0000', 20)).toBe('#ff3333');
  });

  it('creates linear gradients', () => {
    const gradient = createLinearGradient('#ff0000', 20, 'to top', 'darken');
    expect(gradient).toBe(
      'linear-gradient(to top, rgba(255, 0, 0, 1), rgba(243, 0, 0, 1))'
    );
  });

  it('simulates opacity over background', () => {
    expect(simulateOpacity('#ff0000', 0.5, '#000000')).toBe('#800000');
  });
});
