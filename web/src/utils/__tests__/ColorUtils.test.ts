import chroma from 'chroma-js';
import {
  hexToRgba,
  darkenHexColor,
  lightenHexColor,
  adjustSaturation,
  createLinearGradient,
  simulateOpacity
} from '../ColorUtils';

describe('ColorUtils', () => {
  test('hexToRgba converts hex and alpha', () => {
    expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
  });

  test('darkenHexColor darkens color', () => {
    const expected = chroma('#ff0000').darken(0.2).hex();
    expect(darkenHexColor('#ff0000', 20)).toBe(expected);
  });

  test('lightenHexColor lightens color', () => {
    const expected = chroma('#0000ff').brighten(0.1).hex();
    expect(lightenHexColor('#0000ff', 10)).toBe(expected);
  });

  test('adjustSaturation adjusts saturation', () => {
    const expected = chroma('#00ff00').set('hsl.s', `*${1 + 0.2}`).hex();
    expect(adjustSaturation('#00ff00', 20)).toBe(expected);
  });

  test('createLinearGradient builds gradient string', () => {
    const start = '#123456';
    const end = darkenHexColor(start, 10);
    const expected = `linear-gradient(to bottom, ${hexToRgba(start, 1)}, ${hexToRgba(end, 1)})`;
    expect(createLinearGradient(start, 10)).toBe(expected);
  });

  test('simulateOpacity mixes colors', () => {
    const expected = chroma.mix('#fff', '#ff0000', 0.5, 'rgb').hex();
    expect(simulateOpacity('#ff0000', 0.5)).toBe(expected);
  });
});
